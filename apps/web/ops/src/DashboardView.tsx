import { useEffect, useState } from "react";
import { opsApi, type DashboardPayload } from "./api";

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

export function DashboardView() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await opsApi.dashboard();
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not load dashboard.");
      }
    }
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const kpi = data.kpi;

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
          {data.incidents.length === 0 ? (
            <p className="empty">No open incidents. Engine arrives in a later milestone — reports still ingest.</p>
          ) : (
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
                    <td>{i.status} · {i.scope}</td>
                    <td>{i.zones.join(", ")}</td>
                    <td>{fmtNum(i.report_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Live report feed</h2>
        {data.reports.length === 0 ? (
          <p className="empty">No reports yet. Scan a QR or POST /api/reports to try it.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Zone</th>
                <th>Symptoms</th>
                <th>Apps</th>
                <th>Channel</th>
              </tr>
            </thead>
            <tbody>
              {data.reports.map((r) => (
                <tr key={r.id}>
                  <td>{timeAgo(r.created_at)}</td>
                  <td>{r.zone_label}</td>
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
                  <td>{r.channel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
