import PgBoss from "pg-boss";
import type { Pool } from "pg";
import {
  anchorHashChain,
  purgeExpiredSessions,
  purgeOldSalts,
  purgeStaleRateBuckets,
} from "@norrsken/db";
import type { Env } from "./env.js";

export async function startJobs(db: Pool, env: Env): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    // Avoid logging connection details
    application_name: "norrsken-jobs",
  });

  boss.on("error", (err) => {
    // Never log connection strings or payloads with identifiers
    console.error("[pg-boss]", err.message);
  });

  await boss.start();

  await boss.createQueue("purge");
  await boss.createQueue("hash-anchor");

  await boss.work("purge", async () => {
    const salts = await purgeOldSalts(db);
    const rates = await purgeStaleRateBuckets(db, 24);
    const sessions = await purgeExpiredSessions(db);
    // Retention for reports (soft — delete very old)
    const months = env.REPORT_RETENTION_MONTHS;
    const { rowCount } = await db.query(
      `delete from report where created_at < now() - ($1 || ' months')::interval`,
      [String(months)],
    );
    return { salts, rates, sessions, reportsDeleted: rowCount ?? 0 };
  });

  await boss.work("hash-anchor", async () => {
    const head = await anchorHashChain(db);
    return { anchored: Boolean(head) };
  });

  // Every hour: purge
  await boss.schedule("purge", "0 * * * *", {}, { tz: "UTC" });

  // Nightly 00:15 UTC: hash anchor
  await boss.schedule("hash-anchor", "15 0 * * *", {}, { tz: "UTC" });

  // Run once on boot so local/dev is healthy
  await boss.send("purge", {});

  return boss;
}
