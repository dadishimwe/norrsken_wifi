import type { App as BoltApp } from "@slack/bolt";
import { App, LogLevel } from "@slack/bolt";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { Env } from "../env.js";
import { registerSlackHandlers } from "./handlers.js";
import { verifySlackSignature } from "./signature.js";
import { markSlackConnected, markSlackFailed, markSlackOff, safeSlackError, slackIdentity } from "./status.js";

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
  if (!env.SLACK_BOT_TOKEN) {
    markSlackOff();
    http.log.info("slack disabled (SLACK_BOT_TOKEN unset)");
    return null;
  }

  const socketMode = Boolean(env.SLACK_APP_TOKEN);
  const bolt = new App({
    token: env.SLACK_BOT_TOKEN,
    appToken: env.SLACK_APP_TOKEN,
    signingSecret: env.SLACK_SIGNING_SECRET,
    socketMode,
    logger: quietLogger(),
    logLevel: LogLevel.ERROR,
  });
  registerSlackHandlers(bolt, db, env);

  if (socketMode) {
    try {
      await bolt.start();
      const identity = await slackIdentity(env.SLACK_BOT_TOKEN).catch(() => ({
        teamName: null,
        botName: null,
      }));
      markSlackConnected("socket", identity);
      http.log.info("slack socket mode connected");
    } catch (err) {
      markSlackFailed("socket", err instanceof Error ? err.message : "slack_start_failed");
      http.log.error(
        { err: safeSlackError(err instanceof Error ? err.message : "slack_start_failed") },
        "slack_start_failed",
      );
      return null;
    }
    return async () => {
      await bolt.stop();
    };
  }

  if (!env.SLACK_SIGNING_SECRET) {
    markSlackFailed("http", "missing_signing_secret");
    http.log.warn("slack HTTP mode needs SLACK_SIGNING_SECRET or SLACK_APP_TOKEN");
    return null;
  }

  mountHttp(http, bolt, env.SLACK_SIGNING_SECRET);
  const identity = await slackIdentity(env.SLACK_BOT_TOKEN).catch(() => ({
    teamName: null,
    botName: null,
  }));
  markSlackConnected("http", identity);
  http.log.info("slack HTTP receiver mounted at /slack/events");
  return async () => {
    await bolt.stop?.();
  };
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
