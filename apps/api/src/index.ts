import Fastify from "fastify";
import { createPool } from "@norrsken/db";
import { loadEnv } from "./env.js";
import { startJobs } from "./jobs.js";
import { registerRoutes } from "./routes.js";

export async function buildApp() {
  const env = loadEnv();
  const db = createPool(env.DATABASE_URL);

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Redact common sensitive keys if they ever appear
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers['x-edit-token']",
          "body.session_token",
          "body.edit_token",
          "*.session_token",
          "*.slack_user_id",
          "*.user_id",
          "*.ip",
          "*.remoteAddress",
        ],
        remove: true,
      },
    },
    bodyLimit: 8 * 1024,
    trustProxy: false, // do not trust X-Forwarded-For for campus check
  });

  await registerRoutes(app, db, env);

  let boss: Awaited<ReturnType<typeof startJobs>> | null = null;
  if (env.NODE_ENV !== "test") {
    boss = await startJobs(db, env);
  }

  const shutdown = async () => {
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
