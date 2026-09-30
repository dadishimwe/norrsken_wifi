import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createPool } from "@norrsken/db";
import { loadEnv } from "./env.js";
import { startJobs } from "./jobs.js";
import { registerRoutes } from "./routes.js";
import { registerOpsRoutes } from "./ops-routes.js";
import { registerReportPageRoutes } from "./report-page.js";
import { ensureBootstrapAdmin } from "./bootstrap-admin.js";
import { startSlack } from "./slack/start.js";
import { renderHomePage } from "./home-page.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveOpsStaticDir(envDir?: string): string | null {
  const candidates = [
    envDir,
    path.resolve(__dirname, "../../../apps/web/ops/dist"),
    path.resolve(process.cwd(), "apps/web/ops/dist"),
    path.resolve(process.cwd(), "../web/ops/dist"),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return null;
}

export async function buildApp() {
  const env = loadEnv();
  const db = createPool(env.DATABASE_URL);

  if (env.NODE_ENV !== "test") {
    await ensureBootstrapAdmin(db, env);
  }

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-edit-token']",
          "body.session_token",
          "body.edit_token",
          "body.password",
          "body.current_password",
          "body.contact_name",
          "body.contact_phone",
          "body.contact_email",
          "*.session_token",
          "*.slack_user_id",
          "*.user_id",
          "*.ip",
          "*.remoteAddress",
          "*.password",
          "*.password_hash",
        ],
        remove: true,
      },
    },
    bodyLimit: 32 * 1024,
    trustProxy: false,
    routerOptions: {
      // Signed QR tokens include an Ed25519 sig in the path
      maxParamLength: 512,
    },
  });

  await registerRoutes(app, db, env);
  await registerOpsRoutes(app, db, env);
  await registerReportPageRoutes(app, db, env);

  app.get("/", async (_req, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderHomePage());
  });

  const staticDir = resolveOpsStaticDir(env.OPS_STATIC_DIR);
  if (staticDir) {
    await app.register(fastifyStatic, {
      root: staticDir,
      prefix: "/ops/",
    });
    app.get("/ops", async (_req, reply) => reply.redirect("/ops/"));
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && (req.url === "/ops" || req.url.startsWith("/ops/"))) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not_found" });
    });
  }

  let boss: Awaited<ReturnType<typeof startJobs>> | null = null;
  let stopSlack: (() => Promise<void>) | null = null;
  if (env.NODE_ENV !== "test") {
    boss = await startJobs(db, env);
    stopSlack = await startSlack(app, db, env);
  }

  const shutdown = async () => {
    if (stopSlack) await stopSlack();
    if (boss) await boss.stop();
    await app.close();
    await db.end();
  };

  return { app, db, env, shutdown };
}

async function main() {
  const { app, env, shutdown } = await buildApp();

  const stop = async () => {
    await shutdown();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  await app.listen({ port: env.PORT, host: env.HOST });
}

if (process.env.VITEST !== "true" && process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : "fatal");
    process.exit(1);
  });
}
