import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  HASH_CHAIN_LOCK,
  computeActorHash,
  computeRowHash,
  countRecentReportsInZone,
  getLatestRowHash,
  getReport,
  getZone,
  rateKey,
  takeToken,
  updateReport,
  upsertSession,
  zoneHasOpenIncident,
} from "@norrsken/db";
import {
  createReportSchema,
  patchReportSchema,
  pickClarifiers,
  type CreateReportInput,
  type PatchReportInput,
} from "@norrsken/shared";
import type { Env } from "./env.js";
import { campusWeight, parseCampusIps } from "./campus.js";
import { mintEditToken, verifyEditToken } from "./edit-token.js";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function occurredAtFromBucket(bucket: string): Date | null {
  const now = Date.now();
  if (bucket === "now") return new Date(now);
  if (bucket === "recent") return new Date(now - 10 * 60 * 1000);
  if (bucket === "earlier") return new Date(now - 4 * 60 * 60 * 1000);
  return null;
}

function boostWeight(base: number, clarifiers: Record<string, unknown>): number {
  if (clarifiers.same_as_incident === "yes") return Math.min(2, base * 1.5);
  return base;
}

export async function createReport(
  db: Pool,
  env: Env,
  body: unknown,
  remoteIp: string | undefined,
): Promise<{
  report_id: string;
  edit_token: string;
  clarifiers: ReturnType<typeof pickClarifiers>;
  recent_count: number;
}> {
  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  }
  const input: CreateReportInput = parsed.data;

  if (input.website !== undefined && input.website.length > 0) {
    throw new HttpError(400, "rejected");
  }

  if (input.fill_ms !== undefined && input.fill_ms < env.MIN_FILL_MS) {
    throw new HttpError(400, "too_fast");
  }

  const zone = await getZone(db, input.zone_id);
  if (!zone || !zone.active) throw new HttpError(400, "unknown_zone");

  const actorHash = await computeActorHash(db, input.session_token);

  // Per zone / reporter: 1 per 5 min
  const zoneRateKey = rateKey(actorHash, Buffer.from(`zone:${input.zone_id}`));
  const zoneOk = await takeToken(
    db,
    zoneRateKey,
    env.RATE_REPORTS_PER_ZONE_PER_5MIN,
    env.RATE_REPORTS_PER_ZONE_PER_5MIN / 300,
  );
  if (!zoneOk) throw new HttpError(429, "rate_limited_zone");

  // Per reporter / day
  const dayKey = rateKey(actorHash, Buffer.from("day"));
  const dayOk = await takeToken(
    db,
    dayKey,
    env.RATE_REPORTS_PER_DAY,
    env.RATE_REPORTS_PER_DAY / 86400,
  );
  if (!dayOk) throw new HttpError(429, "rate_limited_day");

  const campusCidrs = parseCampusIps(env.CAMPUS_IPS);
  let weight = campusWeight(remoteIp, campusCidrs);
  weight = boostWeight(weight, input.clarifiers as Record<string, unknown>);

  const reportId = randomUUID();
  const createdAt = new Date();
  const occurredAt = occurredAtFromBucket(input.when_bucket);

  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [HASH_CHAIN_LOCK]);
    const prevHash = await getLatestRowHash(client);

    const hashable = {
      id: reportId,
      created_at: createdAt,
      channel: input.channel,
      zone_id: input.zone_id,
      zone_source: input.zone_source,
      symptoms: input.symptoms,
      apps: input.apps,
      when_bucket: input.when_bucket,
      occurred_at: occurredAt,
      wifi_context: input.wifi_context,
      clarifiers: input.clarifiers,
      device_class: input.device_class,
      fill_ms: input.fill_ms ?? null,
      actor_hash: actorHash,
      weight,
      incident_id: null,
    };
    const rowHash = computeRowHash(prevHash, hashable);

    // Insert with explicit id via raw query extension — insertReport generates UUID.
    // Use insert then we need fixed id for token; patch insertReport to accept id.
    const { rows } = await client.query(
      `
      insert into report (
        id, created_at, channel, zone_id, zone_source, symptoms, apps, when_bucket,
        occurred_at, wifi_context, clarifiers, device_class, fill_ms, actor_hash,
        weight, prev_hash, row_hash
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17
      )
      returning id
      `,
      [
        reportId,
        createdAt,
        input.channel,
        input.zone_id,
        input.zone_source,
        input.symptoms,
        input.apps,
        input.when_bucket,
        occurredAt,
        input.wifi_context,
        JSON.stringify(input.clarifiers),
        input.device_class,
        input.fill_ms ?? null,
        actorHash,
        weight,
        prevHash,
        rowHash,
      ],
    );
    if (!rows[0]) throw new Error("insert failed");

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  await upsertSession(db, actorHash, input.zone_id, input.wifi_context);

  const hasIncident = await zoneHasOpenIncident(db, input.zone_id);
  const clarifiers = pickClarifiers({
    symptoms: input.symptoms,
    clarifiers: input.clarifiers,
    wifiContext: input.wifi_context,
    hasActiveIncident: hasIncident,
    isFirstWifiThisSession: input.wifi_context === "unknown",
    maxClarifiers: hasIncident ? 2 : 1,
  });

  const recentCount = await countRecentReportsInZone(db, input.zone_id, 10);

  return {
    report_id: reportId,
    edit_token: mintEditToken(env.EDIT_TOKEN_SECRET, reportId, actorHash),
    clarifiers,
    recent_count: recentCount,
  };
}

export async function patchReport(
  db: Pool,
  env: Env,
  reportId: string,
  editToken: string,
  body: unknown,
): Promise<{ ok: true; recent_count: number }> {
  const verified = verifyEditToken(env.EDIT_TOKEN_SECRET, editToken);
  if (!verified || verified.reportId !== reportId) {
    throw new HttpError(401, "invalid_token");
  }

  const parsed = patchReportSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  }
  const input: PatchReportInput = parsed.data;

  if (input.website !== undefined && input.website.length > 0) {
    throw new HttpError(400, "rejected");
  }

  const existing = await getReport(db, reportId);
  if (!existing) throw new HttpError(404, "not_found");
  if (!existing.actor_hash.equals(verified.actorHash)) {
    throw new HttpError(401, "invalid_token");
  }

  // Edit window: report must be recent (token already enforces 15 min)
  const ageMs = Date.now() - existing.created_at.getTime();
  if (ageMs > 15 * 60 * 1000) throw new HttpError(401, "token_expired");

  const mergedClarifiers = {
    ...(existing.clarifiers as Record<string, unknown>),
    ...(input.clarifiers ?? {}),
  };
  let weight = existing.weight;
  weight = boostWeight(weight, mergedClarifiers);

  const symptoms = input.symptoms ?? existing.symptoms;
  const apps = input.apps ?? existing.apps;
  const whenBucket = input.when_bucket ?? existing.when_bucket;
  const wifiContext = input.wifi_context ?? existing.wifi_context;
  const fillMs = input.fill_ms ?? existing.fill_ms;

  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [HASH_CHAIN_LOCK]);
    // Chain: append a new hash linking from current head (tamper-evident update record)
    const prevHash = await getLatestRowHash(client);
    const rowHash = computeRowHash(prevHash, {
      id: existing.id,
      created_at: existing.created_at,
      channel: existing.channel,
      zone_id: existing.zone_id,
      zone_source: existing.zone_source,
      symptoms,
      apps,
      when_bucket: whenBucket,
      occurred_at: occurredAtFromBucket(whenBucket),
      wifi_context: wifiContext,
      clarifiers: mergedClarifiers,
      device_class: existing.device_class,
      fill_ms: fillMs,
      actor_hash: existing.actor_hash,
      weight,
      incident_id: existing.incident_id,
    });

    await updateReport(client, reportId, {
      symptoms: input.symptoms,
      apps: input.apps,
      when_bucket: input.when_bucket,
      wifi_context: input.wifi_context,
      clarifiers: input.clarifiers as Record<string, unknown> | undefined,
      fill_ms: input.fill_ms,
      weight,
      prev_hash: prevHash,
      row_hash: rowHash,
    });

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  if (input.wifi_context || input.when_bucket) {
    await upsertSession(
      db,
      existing.actor_hash,
      existing.zone_id,
      input.wifi_context ?? null,
    );
  }

  const recentCount = await countRecentReportsInZone(db, existing.zone_id, 10);
  return { ok: true, recent_count: recentCount };
}
