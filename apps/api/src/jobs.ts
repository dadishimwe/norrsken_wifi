import PgBoss from "pg-boss";
import type { Pool } from "pg";
import {
  anchorHashChain,
  purgeExpiredOpsSessions,
  purgeExpiredSessions,
  purgeOldSalts,
  purgeStaleRateBuckets,
} from "@norrsken/db";
import type { Env } from "./env.js";

export async function startJobs(db: Pool, env: Env): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    application_name: "norrsken-jobs",
  });

  boss.on("error", (err) => {
    console.error("[pg-boss]", err.message);
  });

  await boss.start();

  await boss.createQueue("purge");
  await boss.createQueue("hash-anchor");

  await boss.work("purge", async () => {
    const salts = await purgeOldSalts(db);
    const rates = await purgeStaleRateBuckets(db, 24);
    const sessions = await purgeExpiredSessions(db);
    const opsSessions = await purgeExpiredOpsSessions(db);
    const months = env.REPORT_RETENTION_MONTHS;
    const { rowCount } = await db.query(
      `delete from report where created_at < now() - ($1 || ' months')::interval`,
      [String(months)],
    );
    return { salts, rates, sessions, opsSessions, reportsDeleted: rowCount ?? 0 };
  });

  await boss.work("hash-anchor", async () => {
    const head = await anchorHashChain(db);
    return { anchored: Boolean(head) };
  });

  await boss.schedule("purge", "0 * * * *", {}, { tz: "UTC" });
  await boss.schedule("hash-anchor", "15 0 * * *", {}, { tz: "UTC" });
  await boss.send("purge", {});

  return boss;
}
