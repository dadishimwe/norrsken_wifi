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

/**
 * Detection only. A report is the incident, so this never opens or merges
 * a place-shaped ticket.
 */
export async function evaluateIncidents(_db: Pool, _now = new Date()): Promise<void> {}

/** One incident per report. The room is stored on the report, not as the ticket. */
export async function ensureReportIncident(db: Pool, reportId: string): Promise<void> {
  await db.query(
    `
    with target as (
      select id, created_at, zone_id, apps, symptoms
      from report
      where id = $1 and incident_id is null
    ),
    created as (
      insert into incident (opened_at, scope, zones, apps, symptoms, severity)
      select created_at, 'report', array[zone_id], apps, symptoms, 1
      from target
      returning id
    )
    update report r
    set incident_id = created.id
    from created, target
    where r.id = target.id
      and r.incident_id is null
    `,
    [reportId],
  );
}

