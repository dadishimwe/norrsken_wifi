import { useEffect, useMemo, useState } from "react";
import { downloadCsv, opsApi, type AnalyticsPayload } from "./api";
import {
  HorizontalBars,
  PieChart,
  VerticalBars,
  formatDayTick,
} from "./Charts";
import { CustomSelect } from "./CustomSelect";

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

function useCompactChartLabels() {
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return compact;
}

export function GraphsView() {
  const [days, setDays] = useState<Days>(30);
  const [channel, setChannel] = useState<Channel>("all");
  const [zoneId, setZoneId] = useState<string>("");
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const compactLabels = useCompactChartLabels();

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
  const dayPoints = data.reports_per_day.map((d) => {
    const iso = String(d.day).slice(0, 10);
    const pretty = (() => {
      const dt = new Date(`${iso}T12:00:00`);
      if (Number.isNaN(dt.getTime())) return iso;
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sept",
        "Oct",
        "Nov",
        "Dec",
      ];
      return `${months[dt.getMonth()]} ${dt.getDate()}`;
    })();
    const n = Number(d.reports) || 0;
    return {
      label: iso,
      value: n,
      title: `${pretty}: ${n} report${n === 1 ? "" : "s"}`,
    };
  });
  const wifiPoints = data.wifi.map((w) => {
    const n = Number(w.n) || 0;
    return { label: w.wifi_context, value: n, title: `${w.wifi_context}: ${n}` };
  });
  const appPoints = data.apps.map((a) => {
    const n = Number(a.n) || 0;
    return { label: a.app, value: n, title: `${a.app}: ${n} mention${n === 1 ? "" : "s"}` };
  });
  const symptomPoints = data.symptoms.map((s) => {
    const n = Number(s.n) || 0;
    return { label: s.symptom, value: n, title: `${s.symptom}: ${n}` };
  });
  const zonePoints = data.top_zones.map((z) => {
    const n = Number(z.report_count) || 0;
    return {
      label: z.label,
      value: n,
      title: `${z.label}: ${n} report${n === 1 ? "" : "s"}`,
    };
  });

  const zoneOptions = [
    { value: "", label: "All zones" },
    ...(data.zones_options ?? []).map((z) => ({ value: z.id, label: z.label })),
  ];

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
              downloadCsv(
                `/api/ops/analytics/export.csv${qs({ kind: "apps", days, channel, zone_id: zoneId || undefined })}`,
                "apps.csv",
              )
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
        <CustomSelect
          label="Range"
          value={String(days)}
          disabled={loading}
          onChange={(v) => setDays(Number(v) as Days)}
          options={[
            { value: "7", label: "Last 7 days" },
            { value: "14", label: "Last 14 days" },
            { value: "30", label: "Last 30 days" },
            { value: "90", label: "Last 90 days" },
          ]}
        />
        <CustomSelect
          label="Channel"
          value={channel}
          disabled={loading}
          onChange={(v) => setChannel(v as Channel)}
          options={[
            { value: "all", label: "All" },
            { value: "qr", label: "QR" },
            { value: "slack", label: "Slack" },
          ]}
        />
        <CustomSelect
          label="Zone"
          value={zoneId}
          disabled={loading}
          onChange={setZoneId}
          options={zoneOptions}
        />
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
          <div className="value">{dayPoints.reduce((s, p) => s + p.value, 0)}</div>
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
        <section className="panel chart-panel">
          <div className="chart-head">
            <h2>Reports per day</h2>
            <span className="chart-kind">Vertical · time series</span>
          </div>
          <VerticalBars
            items={dayPoints}
            height={240}
            compactLabels={compactLabels}
            formatLabel={formatDayTick}
          />
        </section>

        <section className="panel chart-panel">
          <div className="chart-head">
            <h2>Wi‑Fi context</h2>
            <span className="chart-kind">Pie · composition</span>
          </div>
          <PieChart items={wifiPoints} />
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

        <section className="panel chart-panel chart-panel-zones">
          <div className="chart-head">
            <h2>Top zones</h2>
            <span className="chart-kind">Vertical · ranking</span>
          </div>
          <VerticalBars
            items={zonePoints.slice(0, 8)}
            height={220}
            formatLabel={(label) => (label.length > 14 ? `${label.slice(0, 12)}…` : label)}
          />
        </section>
      </div>

      <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.8rem" }}>
        Active filters{filterQs ? `: ${filterQs.slice(1).replaceAll("&", " · ")}` : ": none (all)"}
      </p>
    </>
  );
}
