import type { App as BoltApp } from "@slack/bolt";
import { App, LogLevel } from "@slack/bolt";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { Env } from "../env.js";
import { registerSlackHandlers } from "./handlers.js";
import { verifySlackSignature } from "./signature.js";
import { markSlackConnected, markSlackFailed, markSlackOff, safeSlackError, slackIdentity } from "./status.js";
import { slackWorkspaces, type SlackWorkspace } from "./workspaces.js";

function quietLogger() {
  const line = (level: string, msg: unknown) => {
    const text = msg instanceof Error ? msg.message : typeof msg === "string" ? msg : level;
    if (/token|secret|user/i.test(text)) return;
    console.error(`slack ${level}: ${text.slice(0, 180)}`);
  };
  return {
    debug() {},
    info() {},
    warn(msg: unknown) {
      line("warn", msg);
    },
    error(msg: unknown) {
      line("error", msg);
    },
    setLevel() {},
    getLevel: () => LogLevel.ERROR,
    setName() {},
  };
}

export async function startSlack(
  http: FastifyInstance,
  db: Pool,
  env: Env,
): Promise<(() => Promise<void>) | null> {
  const spaces = slackWorkspaces(env);
  if (spaces.length === 0) {
    markSlackOff("zuba");
    markSlackOff("norrsken");
    http.log.info("slack disabled (no workspace tokens)");
    return null;
  }

  const stops: Array<() => Promise<void>> = [];
  let httpMounted = false;
  for (const space of spaces) {
    const started = await startWorkspace(http, db, env, space, httpMounted);
    if (!started) continue;
    if (started.http) httpMounted = true;
    stops.push(started.stop);
  }

  if (stops.length === 0) return null;
  return async () => {
    for (const stop of stops) await stop();
  };
}

async function startWorkspace(
  http: FastifyInstance,
  db: Pool,
  env: Env,
  space: SlackWorkspace,
  httpMounted: boolean,
): Promise<{ stop: () => Promise<void>; http: boolean } | null> {
  const socketMode = Boolean(space.appToken);
  if (!socketMode && (space.id !== "zuba" || httpMounted)) {
    markSlackFailed(space.id, "socket", "socket_token_missing");
    http.log.warn({ workspace: space.id }, "slack workspace needs SLACK app token for socket mode");
    return null;
  }

  const bolt = new App({
    token: space.botToken,
    appToken: space.appToken,
    signingSecret: space.signingSecret,
    socketMode,
    logger: quietLogger(),
    logLevel: LogLevel.ERROR,
  });
  registerSlackHandlers(bolt, db, env, space.id);

  if (socketMode) {
    try {
      await bolt.start();
      const identity = await slackIdentity(space.botToken).catch(() => ({
        teamName: null,
        botName: null,
      }));
      markSlackConnected(space.id, "socket", identity);
      http.log.info({ workspace: space.id, team: identity.teamName }, "slack socket mode connected");
      return { http: false, stop: async () => { await bolt.stop(); } };
    } catch (err) {
      markSlackFailed(space.id, "socket", err instanceof Error ? err.message : "slack_start_failed");
      http.log.error(
        { workspace: space.id, err: safeSlackError(err instanceof Error ? err.message : "slack_start_failed") },
        "slack_start_failed",
      );
      return null;
    }
  }

  if (!space.signingSecret) {
    markSlackFailed(space.id, "http", "missing_signing_secret");
    http.log.warn({ workspace: space.id }, "slack HTTP mode needs a signing secret or app token");
    return null;
  }

  mountHttp(http, bolt, space.signingSecret);
  const identity = await slackIdentity(space.botToken).catch(() => ({
    teamName: null,
    botName: null,
  }));
  markSlackConnected(space.id, "http", identity);
  http.log.info({ workspace: space.id }, "slack HTTP receiver mounted at /slack/events");
  return { http: true, stop: async () => { await bolt.stop?.(); } };
}

function mountHttp(http: FastifyInstance, bolt: BoltApp, signingSecret: string) {
  http.addHook("preParsing", async (request, _reply, payload) => {
    const url = request.url.split("?")[0] ?? "";
    if (!url.startsWith("/slack/")) return payload;
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks);
    (request as { slackRawBody?: string }).slackRawBody = raw.toString("utf8");
    const { Readable } = await import("node:stream");
    return Readable.from(raw);
  });

  http.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      const params = new URLSearchParams(String(body));
      const payload = params.get("payload");
      if (payload) {
        try {
          done(null, JSON.parse(payload));
          return;
        } catch {
          done(null, {});
          return;
        }
      }
      done(null, Object.fromEntries(params.entries()));
    },
  );

  const handle = async (
    request: { headers: Record<string, string | string[] | undefined>; body: unknown; slackRawBody?: string },
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
  ) => {
    const raw = request.slackRawBody ?? "";
    const timestamp = header(request.headers, "x-slack-request-timestamp");
    const signature = header(request.headers, "x-slack-signature");
    if (!verifySlackSignature({ signingSecret, timestamp, rawBody: raw, signature })) {
      return reply.code(401).send({ error: "invalid_signature" });
    }
    const body = request.body as { type?: string; challenge?: string };
    if (body?.type === "url_verification" && body.challenge) {
      return reply.code(200).send({ challenge: body.challenge });
    }
    let acked = false;
    await bolt.processEvent({
      body,
      ack: async (response) => {
        acked = true;
        reply.code(200).send(response ?? "");
      },
    });
    if (!acked) reply.code(200).send("");
  };

  http.post("/slack/events", handle);
  http.post("/slack/commands", handle);
  http.post("/slack/interactions", handle);
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string {
  const v = headers[name];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}
