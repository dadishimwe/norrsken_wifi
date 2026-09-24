import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

/**
 * Token-bucket rate limit keyed by opaque bytea (actor_hash or composite key).
 * Returns true if the action is allowed (token consumed).
 */
export async function takeToken(
  db: Pool | PoolClient,
  key: Buffer,
  capacity: number,
  refillPerSecond: number,
  cost = 1,
): Promise<boolean> {
  const { rows } = await db.query<{ tokens: number; updated_at: Date }>(
    "select tokens, updated_at from rate_bucket where key = $1",
    [key],
  );

  const now = Date.now();
  let tokens = capacity;
  if (rows[0]) {
    const elapsed = Math.max(0, (now - rows[0].updated_at.getTime()) / 1000);
    tokens = Math.min(capacity, rows[0].tokens + elapsed * refillPerSecond);
  }

  if (tokens < cost) {
    await db.query(
      `
      insert into rate_bucket (key, tokens, updated_at)
      values ($1, $2, now())
      on conflict (key) do update set tokens = $2, updated_at = now()
      `,
      [key, tokens],
    );
    return false;
  }

  tokens -= cost;
  await db.query(
    `
    insert into rate_bucket (key, tokens, updated_at)
    values ($1, $2, now())
    on conflict (key) do update set tokens = $2, updated_at = now()
    `,
    [key, tokens],
  );
  return true;
}

export function rateKey(...parts: Buffer[]): Buffer {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
}

export async function purgeStaleRateBuckets(db: Pool, maxAgeHours = 24): Promise<number> {
  const { rowCount } = await db.query(
    `delete from rate_bucket where updated_at < now() - ($1 || ' hours')::interval`,
    [String(maxAgeHours)],
  );
  return rowCount ?? 0;
}

export async function purgeExpiredSessions(db: Pool): Promise<number> {
  const { rowCount } = await db.query(`delete from session_state where expires_at < now()`);
  return rowCount ?? 0;
}

export async function upsertSession(
  db: Pool | PoolClient,
  actorHash: Buffer,
  lastZoneId: string | null,
  lastWifiContext: string | null,
  ttlHours = 4,
): Promise<void> {
  await db.query(
    `
    insert into session_state (actor_hash, last_zone_id, last_wifi_context, expires_at)
    values ($1, $2, $3, now() + ($4 || ' hours')::interval)
    on conflict (actor_hash) do update set
      last_zone_id = coalesce(excluded.last_zone_id, session_state.last_zone_id),
      last_wifi_context = coalesce(excluded.last_wifi_context, session_state.last_wifi_context),
      expires_at = excluded.expires_at
    `,
    [actorHash, lastZoneId, lastWifiContext, String(ttlHours)],
  );
}

export async function getSession(
  db: Pool | PoolClient,
  actorHash: Buffer,
): Promise<{ last_zone_id: string | null; last_wifi_context: string | null } | null> {
  const { rows } = await db.query<{
    last_zone_id: string | null;
    last_wifi_context: string | null;
  }>(
    `
    select last_zone_id, last_wifi_context from session_state
    where actor_hash = $1 and expires_at > now()
    `,
    [actorHash],
  );
  return rows[0] ?? null;
}
