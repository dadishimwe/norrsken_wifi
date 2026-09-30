import { useEffect, useMemo, useState } from "react";
import { downloadCsv, opsApi, type AnalyticsPayload } from "./api";
import { HorizontalBars, VerticalBars, formatDayTick } from "./Charts";
import { CustomSelect } from "./CustomSelect";
import { labelApp, labelSymptom, labelUserType } from "./labels";
import { AppLabel, ChannelLabel } from "./marks";

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
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const compactLabels = useCompactChartLabels();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    opsApi
      .analytics({ days, channel })
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
  }, [days, channel]);

  const filterQs = useMemo(
    () => qs({ days, channel }),
    [days, channel],
  );

  if (error) return <p className="error">{error}</p>;
  if (!data && loading) return <p className="muted">Loading…</p>;
  if (!data) return <p className="error">No analytics data.</p>;

  const kpi = data.kpi;
  const dayPoints = (data.reports_per_day ?? []).map((d) => {
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
  const appPoints = (data.apps ?? []).map((a) => {
    const n = Number(a.n) || 0;
    const name = labelApp(a.app);
    return {
      label: name,
      value: n,
      title: `${name}: ${n} mention${n === 1 ? "" : "s"}`,
      icon: <AppLabel id={a.app} label={name} />,
    };
  });
  const symptomPoints = (data.symptoms ?? []).map((s) => {
    const n = Number(s.n) || 0;
    const name = labelSymptom(s.symptom);
    return { label: name, value: n, title: `${name}: ${n}` };
  });
  const companyPoints = (data.companies ?? []).map((c) => {
    const n = Number(c.n) || 0;
    return {
      label: c.company,
      value: n,
      title: `${c.company}: ${n} report${n === 1 ? "" : "s"}`,
    };
  });
  const roomPoints = (data.top_zones ?? []).map((z) => {
    const n = Number(z.report_count) || 0;
    const name = z.zone_id === "house" ? "House QR" : z.label;
    return {
      label: name,
      value: n,
      title: `${name}: ${n} report${n === 1 ? "" : "s"}`,
    };
  });
  const resolvedPoints = (data.resolved_by_company ?? []).map((row) => {
    const n = Number(row.n) || 0;
    const name = row.company === "dct" ? "DCT" : row.company === "zuba" ? "Zuba" : "Norrsken";
    const minutes = row.mttr_minutes == null ? "" : ` · ${row.mttr_minutes} min to resolve`;
    return {
      label: name,
      value: n,
      title: `${name}: ${n} resolved${minutes}`,
    };
  });
  const whoPoints = (data.user_types ?? []).map((row) => {
    const n = Number(row.n) || 0;
    const name = labelUserType(row.user_type);
    return {
      label: name,
      value: n,
      title: `${name}: ${n} report${n === 1 ? "" : "s"}`,
    };
  });
  const contact = data.contact;

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
                `/api/ops/analytics/export.csv${qs({ kind: "apps", days, channel })}`,
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
                `/api/ops/analytics/export.csv${qs({ kind: "per_day", days, channel })}`,
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
            { value: "qr", label: <ChannelLabel channel="qr" /> },
            { value: "slack", label: <ChannelLabel channel="slack" /> },
          ]}
        />
        {loading ? <span className="muted filter-status">Updating…</span> : null}
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Reports today</div>
          <div className="value">{kpi?.reports_today ?? "—"}</div>
        </div>
        <div className="kpi">
          <div className="label">Open reports</div>
          <div className="value">{kpi?.open_incidents ?? "—"}</div>
          <div className="hint">Reports that are not resolved</div>
        </div>
        <div className="kpi">
          <div className="label">Window total</div>
          <div className="value">{dayPoints.reduce((s, p) => s + p.value, 0)}</div>
          <div className="hint">{days}d · filtered</div>
        </div>
        <div className="kpi">
          <div className="label">Top app</div>
          <div className="value" style={{ fontSize: "1.25rem" }}>
            {appPoints[0] ? (
              <AppLabel id={data.apps[0]?.app ?? ""} label={appPoints[0].label} />
            ) : (
              "—"
            )}
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

        <section className="panel chart-panel">
          <div className="chart-head">
            <h2>Rooms</h2>
            <span className="chart-kind">Where reports came from</span>
          </div>
          <HorizontalBars items={roomPoints} maxItems={12} />
        </section>

        <section className="panel chart-panel">
          <div className="chart-head">
            <h2>Who reported</h2>
            <span className="chart-kind">Slack reports count as members</span>
          </div>
          <HorizontalBars items={whoPoints} maxItems={4} />
        </section>

        <section className="panel chart-panel">
          <div className="chart-head">
            <h2>Companies</h2>
            <span className="chart-kind">
              {contact
                ? `${contact.with_contact} of ${contact.total} left contact details`
                : "Horizontal · ranking"}
            </span>
          </div>
          <HorizontalBars items={companyPoints} maxItems={8} />
        </section>

        <section className="panel chart-panel">
          <div className="chart-head">
            <h2>Resolved by company</h2>
            <span className="chart-kind">30 days · resolved reports</span>
          </div>
          <HorizontalBars items={resolvedPoints} maxItems={3} />
        </section>
      </div>

      <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.8rem" }}>
        Active filters{filterQs ? `: ${filterQs.slice(1).replaceAll("&", " · ")}` : ": none (all)"}
      </p>
    </>
  );
}
