import { useEffect, useState } from "react";
import { downloadCsv, opsApi, type DashboardPayload, type ReportsPage } from "./api";

function fmtNum(v: string | number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function clarifierText(c: Record<string, unknown> | undefined): string {
  if (!c || !Object.keys(c).length) return "—";
  return Object.entries(c)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("; ");
}

export function DashboardView() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [reportsPage, setReportsPage] = useState<ReportsPage | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [d, r] = await Promise.all([opsApi.dashboard(), opsApi.reports(page, 25)]);
        if (!cancelled) {
          setData(d);
          setReportsPage(r);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not load dashboard.");
      }
    }
    load();
    const id = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [page]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const kpi = data.kpi;
  const rows = reportsPage?.reports ?? data.reports;

  return (
    <>
      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Reports today</div>
          <div className="value">{fmtNum(kpi?.reports_today)}</div>
        </div>
        <div className="kpi">
          <div className="label">Open incidents</div>
          <div className="value">{fmtNum(kpi?.open_incidents)}</div>
          <div className="hint">Clustered outages (M4 engine)</div>
        </div>
        <div className="kpi">
          <div className="label">MTTA (30d)</div>
          <div className="value">{fmtNum(kpi?.mtta_minutes_30d, 0)}</div>
          <div className="hint">minutes to acknowledge</div>
        </div>
        <div className="kpi">
          <div className="label">MTTR (30d)</div>
          <div className="value">{fmtNum(kpi?.mttr_minutes_30d, 0)}</div>
          <div className="hint">minutes to resolve</div>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Zones</h2>
          <div className="zone-grid">
            {data.zones.map((z) => {
              const hot = Number(z.reports_1h) >= 2;
              return (
                <div
                  key={z.zone_id}
                  className={`zone-card${z.has_open_incident ? " incident" : hot ? " hot" : ""}`}
                >
                  <div className="name">{z.label}</div>
                  <div className="meta">
                    <span
                      className={`status-dot${z.has_open_incident ? " bad" : hot ? " warn" : ""}`}
                    />
                    {z.reports_1h} / 1h · {z.reports_24h} / 24h
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h2>Open incidents</h2>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            Groups of related reports (same area/time). Empty until the incident engine (M4) runs —
            individual reports still appear in the feed below.
          </p>
          {data.incidents.length === 0 ? (
            <p className="empty">No open incidents yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Opened</th>
                    <th>Scope</th>
                    <th>Zones</th>
                    <th>Reports</th>
                  </tr>
                </thead>
                <tbody>
                  {data.incidents.map((i) => (
                    <tr key={i.id}>
                      <td>{timeAgo(i.opened_at)}</td>
                      <td>
                        {i.status} · {i.scope}
                      </td>
                      <td>{i.zones.join(", ")}</td>
                      <td>{fmtNum(i.report_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <div className="panel-head">
          <h2>Reports</h2>
          <button
            type="button"
            className="btn"
            onClick={() => downloadCsv("/api/ops/reports/export.csv", "norrsken-reports.csv")}
          >
            Export CSV
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="empty">No reports yet.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table-dense">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Zone</th>
                    <th>Source</th>
                    <th>Symptoms</th>
                    <th>Apps</th>
                    <th>Timing</th>
                    <th>Wi‑Fi</th>
                    <th>Clarifiers</th>
                    <th>Device</th>
                    <th>Channel</th>
                    <th>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td title={r.created_at}>{timeAgo(r.created_at)}</td>
                      <td>{r.zone_label}</td>
                      <td>{r.zone_source ?? "—"}</td>
                      <td>
                        {r.symptoms.map((s) => (
                          <span className="pill" key={s}>
                            {s}
                          </span>
                        ))}
                      </td>
                      <td>
                        {r.apps.length
                          ? r.apps.map((a) => (
                              <span className="pill" key={a}>
                                {a}
                              </span>
                            ))
                          : "—"}
                      </td>
                      <td>{r.when_bucket}</td>
                      <td>{r.wifi_context}</td>
                      <td className="cell-clamp">{clarifierText(r.clarifiers)}</td>
                      <td>{r.device_class ?? "—"}</td>
                      <td>{r.channel}</td>
                      <td>{fmtNum(r.weight, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reportsPage ? (
              <div className="pager">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="muted">
                  Page {reportsPage.page} / {reportsPage.total_pages} · {reportsPage.total} total
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={page >= reportsPage.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
