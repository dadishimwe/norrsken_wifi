import { createHmac, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function getOrCreateDailySalt(db: Pool | PoolClient): Promise<Buffer> {
  const day = utcDay();
  const existing = await db.query<{ salt: Buffer }>(
    "select salt from daily_salt where day = $1::date",
    [day],
  );
  if (existing.rows[0]) return existing.rows[0].salt;

  const salt = randomBytes(32);
  try {
    await db.query("insert into daily_salt (day, salt) values ($1::date, $2)", [day, salt]);
    return salt;
  } catch {
    const again = await db.query<{ salt: Buffer }>(
      "select salt from daily_salt where day = $1::date",
      [day],
    );
    if (again.rows[0]) return again.rows[0].salt;
    throw new Error("failed to create daily salt");
  }
}

/**
 * Hash a raw identifier with today's salt.
 * Raw identifier must never be persisted or logged.
 */
export async function computeActorHash(
  db: Pool | PoolClient,
  rawIdentifier: string,
): Promise<Buffer> {
  const salt = await getOrCreateDailySalt(db);
  return createHmac("sha256", salt).update(rawIdentifier, "utf8").digest();
}

/** Delete salts older than today (UTC). */
export async function purgeOldSalts(db: Pool): Promise<number> {
  const { rowCount } = await db.query(
    "delete from daily_salt where day < current_date",
  );
  return rowCount ?? 0;
}
