import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type EngineConfig = {
  zoneIncident: { minDistinctActors: number; windowMinutes: number };
  campusWide: { minZones: number; minActorsPerZone: number; windowMinutes: number };
  appSpecific: { minAppShare: number; minZones: number };
  suggestResolveSilenceMinutes: number;
};

export const DEFAULT_ENGINE: EngineConfig = {
  zoneIncident: { minDistinctActors: 3, windowMinutes: 10 },
  campusWide: { minZones: 3, minActorsPerZone: 2, windowMinutes: 15 },
  appSpecific: { minAppShare: 0.7, minZones: 3 },
  suggestResolveSilenceMinutes: 20,
};

export type ReportHit = {
  id: string;
  zone_id: string;
  actor: string;
  /** Campus reports are 1. Off-campus reports are 0.3, so they count for less. */
  weight: number;
  apps: string[];
  symptoms: string[];
  created_at: Date;
};

export type IncidentCluster = {
  scope: "zone" | "campus";
  zones: string[];
  reportIds: string[];
  apps: string[];
  symptoms: string[];
  actors: number;
  providerSide: boolean;
};

export function loadEngineConfig(): EngineConfig {
  const candidates = [
    path.resolve(__dirname, "../../../config/engine.json"),
    path.resolve(process.cwd(), "config/engine.json"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<EngineConfig>;
    return {
      zoneIncident: { ...DEFAULT_ENGINE.zoneIncident, ...raw.zoneIncident },
      campusWide: { ...DEFAULT_ENGINE.campusWide, ...raw.campusWide },
      appSpecific: { ...DEFAULT_ENGINE.appSpecific, ...raw.appSpecific },
      suggestResolveSilenceMinutes:
        raw.suggestResolveSilenceMinutes ?? DEFAULT_ENGINE.suggestResolveSilenceMinutes,
    };
  }
  return DEFAULT_ENGINE;
}

function inWindow(report: ReportHit, now: Date, minutes: number): boolean {
  return now.getTime() - report.created_at.getTime() <= minutes * 60_000;
}

function uniq(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function actorsIn(reports: ReportHit[]): number {
  return new Set(reports.map((r) => r.actor)).size;
}

/** Each person counts once, at their strongest report weight. */
function weightedActors(reports: ReportHit[]): number {
  const best = new Map<string, number>();
  for (const report of reports) {
    best.set(report.actor, Math.max(best.get(report.actor) ?? 0, report.weight));
  }
  let sum = 0;
  for (const weight of best.values()) sum += weight;
  return sum;
}

function enoughPeople(reports: ReportHit[], minDistinct: number): boolean {
  return actorsIn(reports) >= minDistinct && weightedActors(reports) >= minDistinct;
}

/** One app on ≥ minAppShare of reports that named an app, across enough places. */
export function providerSideSuspected(
  reports: ReportHit[],
  zones: string[],
  cfg: EngineConfig["appSpecific"],
): boolean {
  if (zones.length < cfg.minZones) return false;
  const withApps = reports.filter((r) => r.apps.length > 0);
  if (withApps.length < 3) return false;
  const counts = new Map<string, number>();
  for (const report of withApps) {
    for (const app of new Set(report.apps)) {
      counts.set(app, (counts.get(app) ?? 0) + 1);
    }
  }
  const top = Math.max(...counts.values());
  return top / withApps.length >= cfg.minAppShare;
}

function summarize(reports: ReportHit[]): { apps: string[]; symptoms: string[] } {
  return {
    apps: uniq(reports.flatMap((r) => r.apps)),
    symptoms: uniq(reports.flatMap((r) => r.symptoms)),
  };
}

/**
 * Zone: ≥ N distinct people in one place inside the short window.
 * Campus: ≥ M places that each have ≥ K distinct people inside the longer window.
 * A place already inside a campus cluster is not also returned as its own incident.
 */
export function clusterReports(reports: ReportHit[], cfg: EngineConfig, now: Date): IncidentCluster[] {
  const campusReports = reports.filter((r) => inWindow(r, now, cfg.campusWide.windowMinutes));
  const byZone = new Map<string, ReportHit[]>();
  for (const report of campusReports) {
    const list = byZone.get(report.zone_id) ?? [];
    list.push(report);
    byZone.set(report.zone_id, list);
  }

  const campusZones = [...byZone.entries()]
    .filter(([, list]) => enoughPeople(list, cfg.campusWide.minActorsPerZone))
    .map(([zone]) => zone)
    .sort();

  const clusters: IncidentCluster[] = [];
  const covered = new Set<string>();

  if (campusZones.length >= cfg.campusWide.minZones) {
    const members = campusReports.filter((r) => campusZones.includes(r.zone_id));
    const summary = summarize(members);
    clusters.push({
      scope: "campus",
      zones: campusZones,
      reportIds: members.map((r) => r.id),
      apps: summary.apps,
      symptoms: summary.symptoms,
      actors: actorsIn(members),
      providerSide: providerSideSuspected(members, campusZones, cfg.appSpecific),
    });
    campusZones.forEach((z) => covered.add(z));
  }

  const zoneReports = reports.filter((r) => inWindow(r, now, cfg.zoneIncident.windowMinutes));
  const recentByZone = new Map<string, ReportHit[]>();
  for (const report of zoneReports) {
    if (covered.has(report.zone_id)) continue;
    const list = recentByZone.get(report.zone_id) ?? [];
    list.push(report);
    recentByZone.set(report.zone_id, list);
  }
  for (const [zoneId, list] of recentByZone) {
    if (!enoughPeople(list, cfg.zoneIncident.minDistinctActors)) continue;
    const summary = summarize(list);
    clusters.push({
      scope: "zone",
      zones: [zoneId],
      reportIds: list.map((r) => r.id),
      apps: summary.apps,
      symptoms: summary.symptoms,
      actors: actorsIn(list),
      providerSide: false,
    });
  }
  return clusters;
}

type OpenIncident = { id: string; scope: string; zones: string[] };

/** Group recent reports into open incidents. Safe to run after every new report. */
export async function evaluateIncidents(db: Pool, now = new Date()): Promise<void> {
  const cfg = loadEngineConfig();
  const window = Math.max(cfg.zoneIncident.windowMinutes, cfg.campusWide.windowMinutes);
  const { rows } = await db.query<{
    id: string;
    zone_id: string;
    actor_hash: Buffer;
    weight: number;
    apps: string[];
    symptoms: string[];
    created_at: Date;
  }>(
    `
    select id, zone_id, actor_hash, weight, apps, symptoms, created_at
    from report
    where created_at > $1::timestamptz
    `,
    [new Date(now.getTime() - window * 60_000)],
  );
  const hits: ReportHit[] = rows.map((r) => ({
    id: r.id,
    zone_id: r.zone_id,
    actor: r.actor_hash.toString("hex"),
    weight: Number(r.weight) || 1,
    apps: r.apps ?? [],
    symptoms: r.symptoms ?? [],
    created_at: r.created_at,
  }));
  const clusters = clusterReports(hits, cfg, now);
  if (clusters.length === 0) return;

  const open = await db.query<OpenIncident>(
    `select id, scope, zones from incident where status in ('open','investigating')`,
  );

  for (const cluster of clusters) {
    const match = open.rows.find((inc) => {
      if (inc.scope !== cluster.scope) return false;
      if (cluster.scope === "campus") return true;
      return sameZones(inc.zones, cluster.zones);
    });
    const rootCause = cluster.providerSide ? "provider_side_suspected" : null;
    let incidentId = match?.id;
    if (!incidentId) {
      const inserted = await db.query<{ id: string }>(
        `
        insert into incident (scope, zones, apps, symptoms, root_cause, severity)
        values ($1, $2, $3, $4, $5, $6)
        returning id
        `,
        [cluster.scope, cluster.zones, cluster.apps, cluster.symptoms, rootCause, cluster.actors],
      );
      incidentId = inserted.rows[0]?.id;
      if (incidentId) open.rows.push({ id: incidentId, scope: cluster.scope, zones: cluster.zones });
    } else {
      await db.query(
        `
        update incident
        set zones = $2, apps = $3, symptoms = $4, severity = $5,
            root_cause = coalesce($6, root_cause)
        where id = $1
        `,
        [incidentId, cluster.zones, cluster.apps, cluster.symptoms, cluster.actors, rootCause],
      );
    }
    if (!incidentId || cluster.reportIds.length === 0) continue;
    await db.query(`update report set incident_id = $1 where id = any($2::uuid[])`, [
      incidentId,
      cluster.reportIds,
    ]);
    if (cluster.scope === "campus") {
      await db.query(
        `
        update report
        set incident_id = $1
        where incident_id in (
          select id from incident
          where status in ('open','investigating')
            and scope = 'zone'
            and zones <@ $2::text[]
        )
        `,
        [incidentId, cluster.zones],
      );
      await db.query(
        `
        delete from incident
        where status = 'open'
          and acked_at is null
          and scope = 'zone'
          and zones <@ $1::text[]
        `,
        [cluster.zones],
      );
    }
  }
}

function sameZones(a: string[], b: string[]): boolean {
  const left = [...a].sort().join("\0");
  const right = [...b].sort().join("\0");
  return left === right;
}
