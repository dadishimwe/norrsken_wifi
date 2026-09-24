import { useEffect, useState } from "react";
import { downloadCsv, opsApi, type AnalyticsPayload } from "./api";

function BarList({
  items,
  labelKey,
  valueKey,
}: {
  items: Record<string, string | number>[];
  labelKey: string;
  valueKey: string;
}) {
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
  if (!items.length) return <p className="empty">No data yet — reports will fill these charts.</p>;
  return (
    <div className="bar-list">
      {items.map((item) => {
        const label = String(item[labelKey]);
        const n = Number(item[valueKey]) || 0;
        const pct = Math.round((n / max) * 100);
        return (
          <div className="bar-row" key={label}>
            <div className="bar-label">{label}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="bar-n">{n}</div>
          </div>
        );
      })}
    </div>
  );
}

export function GraphsView() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    opsApi
      .analytics()
      .then(setData)
      .catch(() => setError("Could not load analytics."));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const kpi = data.kpi;

  return (
    <>
      <div className="panel-head" style={{ marginBottom: "1rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>Insights</h2>
          <p className="muted" style={{ margin: "0.35rem 0 0" }}>
            {data.note}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={() => downloadCsv("/api/ops/analytics/export.csv?kind=apps", "apps.csv")}
          >
            Export apps
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              downloadCsv("/api/ops/analytics/export.csv?kind=per_day", "reports-per-day.csv")
            }
          >
            Export daily
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              downloadCsv("/api/ops/analytics/export.csv?kind=symptoms", "symptoms.csv")
            }
          >
            Export symptoms
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => downloadCsv("/api/ops/reports/export.csv", "norrsken-reports.csv")}
          >
            Export all reports
          </button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Reports today</div>
          <div className="value">{kpi?.reports_today ?? "—"}</div>
        </div>
        <div className="kpi">
          <div className="label">Open incidents</div>
          <div className="value">{kpi?.open_incidents ?? "—"}</div>
          <div className="hint">Clusters from M4 (empty until engine runs)</div>
        </div>
        <div className="kpi">
          <div className="label">Incidents opened today</div>
          <div className="value">{kpi?.incidents_opened_today ?? "—"}</div>
        </div>
        <div className="kpi">
          <div className="label">Top app (30d)</div>
          <div className="value" style={{ fontSize: "1.35rem" }}>
            {data.apps[0]?.app ?? "—"}
          </div>
          <div className="hint">{data.apps[0] ? `${data.apps[0].n} mentions` : "no data yet"}</div>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Reports per day (30d)</h2>
          <BarList
            items={data.reports_per_day.map((d) => ({
              day: String(d.day).slice(0, 10),
              reports: d.reports,
            }))}
            labelKey="day"
            valueKey="reports"
          />
        </section>
        <section className="panel">
          <h2>Apps mentioned</h2>
          <BarList items={data.apps as unknown as Record<string, string | number>[]} labelKey="app" valueKey="n" />
        </section>
        <section className="panel">
          <h2>Symptoms</h2>
          <BarList
            items={data.symptoms as unknown as Record<string, string | number>[]}
            labelKey="symptom"
            valueKey="n"
          />
        </section>
        <section className="panel">
          <h2>Wi‑Fi context</h2>
          <BarList
            items={data.wifi as unknown as Record<string, string | number>[]}
            labelKey="wifi_context"
            valueKey="n"
          />
        </section>
      </div>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Top zones by report count</h2>
        <BarList
          items={data.top_zones.map((z) => ({
            label: z.label,
            report_count: z.report_count,
          }))}
          labelKey="label"
          valueKey="report_count"
        />
      </section>
    </>
  );
}
