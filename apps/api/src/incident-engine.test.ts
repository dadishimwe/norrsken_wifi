import { describe, expect, it } from "vitest";
import { clusterReports, DEFAULT_ENGINE, type ReportHit } from "./incident-engine.js";

const now = new Date("2026-09-29T10:00:00Z");

function hit(partial: Partial<ReportHit> & Pick<ReportHit, "id" | "zone_id" | "actor">): ReportHit {
  return {
    weight: 1,
    apps: [],
    symptoms: ["slow"],
    created_at: new Date(now.getTime() - 2 * 60_000),
    ...partial,
  };
}

describe("clusterReports", () => {
  it("opens a zone incident at three different people", () => {
    const reports = [
      hit({ id: "1", zone_id: "c1", actor: "a" }),
      hit({ id: "2", zone_id: "c1", actor: "b" }),
      hit({ id: "3", zone_id: "c1", actor: "a" }),
      hit({ id: "4", zone_id: "c1", actor: "c" }),
    ];
    const clusters = clusterReports(reports, DEFAULT_ENGINE, now);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.scope).toBe("zone");
    expect(clusters[0]?.zones).toEqual(["c1"]);
    expect(clusters[0]?.actors).toBe(3);
  });

  it("keeps two people in one place as ordinary reports", () => {
    const reports = [
      hit({ id: "1", zone_id: "c1", actor: "a" }),
      hit({ id: "2", zone_id: "c1", actor: "b" }),
    ];
    expect(clusterReports(reports, DEFAULT_ENGINE, now)).toEqual([]);
  });

  it("folds hot places into one campus incident", () => {
    const reports: ReportHit[] = [];
    for (const zone of ["c1", "c3", "c4"]) {
      reports.push(hit({ id: `${zone}-a`, zone_id: zone, actor: `${zone}-a`, apps: ["zoom"] }));
      reports.push(hit({ id: `${zone}-b`, zone_id: zone, actor: `${zone}-b`, apps: ["zoom"] }));
    }
    const clusters = clusterReports(reports, DEFAULT_ENGINE, now);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.scope).toBe("campus");
    expect(clusters[0]?.zones).toEqual(["c1", "c3", "c4"]);
    expect(clusters[0]?.providerSide).toBe(true);
  });

  it("does not open from three off-campus reports alone", () => {
    const reports = [
      hit({ id: "1", zone_id: "c1", actor: "a", weight: 0.3 }),
      hit({ id: "2", zone_id: "c1", actor: "b", weight: 0.3 }),
      hit({ id: "3", zone_id: "c1", actor: "c", weight: 0.3 }),
    ];
    expect(clusterReports(reports, DEFAULT_ENGINE, now)).toEqual([]);
  });

  it("ignores reports older than the window", () => {
    const reports = [
      hit({ id: "1", zone_id: "c1", actor: "a", created_at: new Date(now.getTime() - 30 * 60_000) }),
      hit({ id: "2", zone_id: "c1", actor: "b", created_at: new Date(now.getTime() - 30 * 60_000) }),
      hit({ id: "3", zone_id: "c1", actor: "c", created_at: new Date(now.getTime() - 30 * 60_000) }),
    ];
    expect(clusterReports(reports, DEFAULT_ENGINE, now)).toEqual([]);
  });
});
