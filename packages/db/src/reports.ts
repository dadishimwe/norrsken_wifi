import type { Pool, PoolClient } from "pg";
import type { ReportRow, ZoneRow } from "./client.js";

export async function getZone(db: Pool, id: string): Promise<ZoneRow | null> {
  const { rows } = await db.query<ZoneRow>(
    "select id, label, floor, kind, active, sort from zone where id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function listActiveZones(db: Pool): Promise<ZoneRow[]> {
  const { rows } = await db.query<ZoneRow>(
    "select id, label, floor, kind, active, sort from zone where active = true order by sort, id",
  );
  return rows;
}

export async function zoneHasOpenIncident(db: Pool, zoneId: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    `
    select exists(
      select 1 from incident
      where status in ('open','investigating')
        and $1 = any(zones)
    ) as ok
    `,
    [zoneId],
  );
  return rows[0]?.ok === true;
}

export async function countRecentReportsInZone(
  db: Pool,
  zoneId: string,
  minutes: number,
): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `
    select count(*)::text as n from report
    where zone_id = $1 and created_at > now() - ($2 || ' minutes')::interval
    `,
    [zoneId, String(minutes)],
  );
  return Number(rows[0]?.n ?? 0);
}

export type InsertReportInput = {
  channel: string;
  zone_id: string;
  zone_source: string;
  symptoms: string[];
  apps: string[];
  when_bucket: string;
  occurred_at: Date | null;
  wifi_context: string;
  clarifiers: Record<string, unknown>;
  device_class: string | null;
  fill_ms: number | null;
  actor_hash: Buffer;
  weight: number;
  prev_hash: Buffer | null;
  row_hash: Buffer;
};

export async function insertReport(
  client: PoolClient,
  input: InsertReportInput,
): Promise<ReportRow> {
  const { rows } = await client.query<ReportRow>(
    `
    insert into report (
      channel, zone_id, zone_source, symptoms, apps, when_bucket, occurred_at,
      wifi_context, clarifiers, device_class, fill_ms, actor_hash, weight,
      prev_hash, row_hash
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15
    )
    returning *
    `,
    [
      input.channel,
      input.zone_id,
      input.zone_source,
      input.symptoms,
      input.apps,
      input.when_bucket,
      input.occurred_at,
      input.wifi_context,
      JSON.stringify(input.clarifiers),
      input.device_class,
      input.fill_ms,
      input.actor_hash,
      input.weight,
      input.prev_hash,
      input.row_hash,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("insertReport returned no row");
  return row;
}

export async function getReport(db: Pool, id: string): Promise<ReportRow | null> {
  const { rows } = await db.query<ReportRow>("select * from report where id = $1", [id]);
  return rows[0] ?? null;
}

export type PatchReportFields = {
  symptoms?: string[];
  apps?: string[];
  when_bucket?: string;
  wifi_context?: string;
  clarifiers?: Record<string, unknown>;
  fill_ms?: number;
  weight?: number;
  prev_hash: Buffer | null;
  row_hash: Buffer;
};

export async function updateReport(
  client: PoolClient,
  id: string,
  fields: PatchReportFields,
): Promise<ReportRow> {
  const { rows } = await client.query<ReportRow>(
    `
    update report set
      symptoms = coalesce($2, symptoms),
      apps = coalesce($3, apps),
      when_bucket = coalesce($4, when_bucket),
      wifi_context = coalesce($5, wifi_context),
      clarifiers = case when $6::jsonb is null then clarifiers else clarifiers || $6::jsonb end,
      fill_ms = coalesce($7, fill_ms),
      weight = coalesce($8, weight),
      prev_hash = $9,
      row_hash = $10
    where id = $1
    returning *
    `,
    [
      id,
      fields.symptoms ?? null,
      fields.apps ?? null,
      fields.when_bucket ?? null,
      fields.wifi_context ?? null,
      fields.clarifiers ? JSON.stringify(fields.clarifiers) : null,
      fields.fill_ms ?? null,
      fields.weight ?? null,
      fields.prev_hash,
      fields.row_hash,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("updateReport: report not found");
  return row;
}

/** Advisory lock id for hash-chain serialization */
export const HASH_CHAIN_LOCK = 847291;

export async function getLatestRowHash(client: PoolClient): Promise<Buffer | null> {
  const { rows } = await client.query<{ row_hash: Buffer | null }>(
    "select row_hash from report where row_hash is not null order by created_at desc, id desc limit 1",
  );
  return rows[0]?.row_hash ?? null;
}
