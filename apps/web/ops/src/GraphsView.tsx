import { useEffect, useMemo, useState } from "react";
import { downloadCsv, opsApi, type AnalyticsPayload } from "./api";
import {
  HorizontalBars,
  ShareBars,
  VerticalBars,
  formatDayTick,
} from "./Charts";

type Days = 7 | 14 | 30 | 90;
type Channel = "all" | "qr" | "slack";

function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "" || v === "all") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function GraphsView() {
  const [days, setDays] = useState<Days>(30);
  const [channel, setChannel] = useState<Channel>("all");
  const [zoneId, setZoneId] = useState<string>("");
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    opsApi
      .analytics({ days, channel, zone_id: zoneId || null })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load analytics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, channel, zoneId]);

  const filterQs = useMemo(
    () => qs({ days, channel, zone_id: zoneId || undefined }),
    [days, channel, zoneId],
  );

  if (error) return <p className="error">{error}</p>;
  if (!data && loading) return <p className="muted">Loading…</p>;
  if (!data) return <p className="error">No analytics data.</p>;

  const kpi = data.kpi;
  const dayPoints = data.reports_per_day.map((d) => ({
    label: String(d.day).slice(0, 10),
    value: Number(d.reports) || 0,
  }));
  const wifiPoints = data.wifi.map((w) => ({
    label: w.wifi_context,
    value: Number(w.n) || 0,
  }));
  const appPoints = data.apps.map((a) => ({
    label: a.app,
    value: Number(a.n) || 0,
  }));
  const symptomPoints = data.symptoms.map((s) => ({
    label: s.symptom,
    value: Number(s.n) || 0,
  }));
  const zonePoints = data.top_zones.map((z) => ({
    label: z.label,
    value: Number(z.report_count) || 0,
  }));

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
            onClick={() =>
              downloadCsv(`/api/ops/analytics/export.csv${qs({ kind: "apps", days, channel, zone_id: zoneId || undefined })}`, "apps.csv")
            }
          >
            Export apps
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              downloadCsv(
                `/api/ops/analytics/export.csv${qs({ kind: "per_day", days, channel, zone_id: zoneId || undefined })}`,
                "reports-per-day.csv",
              )
            }
          >
            Export daily
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => downloadCsv(`/api/ops/reports/export.csv`, "norrsken-reports.csv")}
          >
            Export all reports
          </button>
        </div>
      </div>

      <div className="filters-bar">
        <label className="filter-field">
          <span>Range</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as Days)}
            disabled={loading}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Channel</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            disabled={loading}
          >
            <option value="all">All</option>
            <option value="qr">QR</option>
            <option value="slack">Slack</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Zone</span>
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            disabled={loading}
          >
            <option value="">All zones</option>
            {(data.zones_options ?? []).map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
        {loading ? <span className="muted filter-status">Updating…</span> : null}
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Reports today</div>
          <div className="value">{kpi?.reports_today ?? "—"}</div>
        </div>
        <div className="kpi">
          <div className="label">Open incidents</div>
          <div className="value">{kpi?.open_incidents ?? "—"}</div>
          <div className="hint">Clusters from M4</div>
        </div>
        <div className="kpi">
          <div className="label">Window total</div>
          <div className="value">
            {dayPoints.reduce((s, p) => s + p.value, 0)}
          </div>
          <div className="hint">{days}d · filtered</div>
        </div>
        <div className="kpi">
          <div className="label">Top app</div>
          <div className="value" style={{ fontSize: "1.25rem" }}>
            {appPoints[0]?.label ?? "—"}
          </div>
          <div className="hint">
            {appPoints[0] ? `${appPoints[0].value} mentions` : "no data"}
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <section className="panel chart-panel chart-panel-wide">
          <div className="chart-head">
            <h2>Reports per day</h2>
            <span className="chart-kind">Vertical · time series</span>
          </div>
          <VerticalBars items={dayPoints} height={240} formatLabel={formatDayTick} />
        </section>

        <section className="panel chart-panel">
          <div className="chart-head">
            <h2>Wi‑Fi context</h2>
            <span className="chart-kind">Share · composition</span>
          </div>
          <ShareBars items={wifiPoints} />
        </section>

        <section className="panel chart-panel">
          <div className="chart-head">
            <h2>Apps mentioned</h2>
            <span className="chart-kind">Horizontal · ranking</span>
          </div>
          <HorizontalBars items={appPoints} maxItems={10} />
        </section>

        <section className="panel chart-panel">
          <div className="chart-head">
            <h2>Symptoms</h2>
            <span className="chart-kind">Horizontal · ranking</span>
          </div>
          <HorizontalBars items={symptomPoints} maxItems={10} />
        </section>

        <section className="panel chart-panel chart-panel-wide">
          <div className="chart-head">
            <h2>Top zones</h2>
            <span className="chart-kind">Horizontal · ranking</span>
          </div>
          <HorizontalBars items={zonePoints} maxItems={12} />
        </section>
      </div>

      <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.8rem" }}>
        Active filters{filterQs ? `: ${filterQs.slice(1).replaceAll("&", " · ")}` : ": none (all)"}
      </p>
    </>
  );
}
