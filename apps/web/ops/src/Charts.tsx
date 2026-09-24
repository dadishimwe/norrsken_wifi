import { useState, type MouseEvent, type ReactNode } from "react";

type Point = { label: string; value: number; title?: string };

const MONTHS_SHORT = [
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
] as const;

const PIE_COLORS = ["#e85d04", "#1b2430", "#c4a35a", "#8a6bb0", "#5a9a7a", "#3d6b9a"];

type Tip = { text: string; x: number; y: number };

function niceMax(n: number): number {
  if (n <= 0) return 1;
  const exp = Math.floor(Math.log10(n));
  const f = n / 10 ** exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

function Empty() {
  return <p className="empty">No data for these filters yet.</p>;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${e.x} ${e.y} A ${r} ${r} 0 ${large} 1 ${s.x} ${s.y} Z`;
}

function tipText(item: Point, extra?: string): string {
  if (item.title) return item.title;
  return extra ? `${item.label}: ${item.value} (${extra})` : `${item.label}: ${item.value}`;
}

function ChartTip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.text}
    </div>
  );
}

function useChartTip() {
  const [tip, setTip] = useState<Tip | null>(null);

  function place(text: string, e: MouseEvent) {
    const root = (e.currentTarget as HTMLElement).closest(".chart-tip-root") as HTMLElement | null;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    let x = e.clientX - rect.left + 14;
    let y = e.clientY - rect.top - 12;
    // Keep tip inside the chart area when near the right/bottom edge
    if (x > rect.width - 160) x = e.clientX - rect.left - 150;
    if (y < 8) y = e.clientY - rect.top + 18;
    setTip({ text, x, y });
  }

  function hide() {
    setTip(null);
  }

  return { tip, place, hide };
}

function ChartShell({ children, tip }: { children: ReactNode; tip: Tip | null }) {
  return (
    <div className="chart-tip-root">
      {children}
      <ChartTip tip={tip} />
    </div>
  );
}

/** Vertical columns — time series or few categories. */
export function VerticalBars({
  items,
  height = 220,
  formatLabel,
  compactLabels = false,
}: {
  items: Point[];
  height?: number;
  formatLabel?: (label: string, index: number, total: number, compact: boolean) => string;
  compactLabels?: boolean;
}) {
  const { tip, place, hide } = useChartTip();
  if (!items.length) return <Empty />;
  const max = niceMax(Math.max(...items.map((i) => i.value), 1));
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  const n = items.length;
  const gap = n <= 6 ? 12 : 6;
  const maxBar = n <= 5 ? 48 : n <= 14 ? 28 : 16;

  return (
    <ChartShell tip={tip}>
      <div className="chart-v" style={{ height }}>
        <div className="chart-v-y" aria-hidden="true">
          {[...ticks].reverse().map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="chart-v-plot">
          <div className="chart-v-grid" aria-hidden="true">
            {ticks.map((t) => (
              <div key={t} className="chart-v-gridline" style={{ bottom: `${(t / max) * 100}%` }} />
            ))}
          </div>
          <div
            className="chart-v-bars"
            style={{ gap: `${gap}px`, ["--max-bar" as string]: `${maxBar}px` }}
          >
            {items.map((item, i) => {
              const h = Math.max(item.value > 0 ? 2 : 0, (item.value / max) * 100);
              const label = formatLabel
                ? formatLabel(item.label, i, n, compactLabels)
                : item.label;
              const text = tipText(item);
              return (
                <div
                  className="chart-v-col"
                  key={`${item.label}-${i}`}
                  onMouseEnter={(e) => place(text, e)}
                  onMouseMove={(e) => place(text, e)}
                  onMouseLeave={hide}
                >
                  <div className="chart-v-bar-wrap">
                    <div className="chart-v-bar" style={{ height: `${h}%` }}>
                      {item.value > 0 && n <= 16 ? (
                        <span className="chart-v-val">{item.value}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="chart-v-label">{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ChartShell>
  );
}

/** Horizontal bars — ranked categories with longer labels. */
export function HorizontalBars({
  items,
  maxItems = 10,
}: {
  items: Point[];
  maxItems?: number;
}) {
  const { tip, place, hide } = useChartTip();
  const slice = items.slice(0, maxItems);
  if (!slice.length) return <Empty />;
  const max = niceMax(Math.max(...slice.map((i) => i.value), 1));

  return (
    <ChartShell tip={tip}>
      <div className="chart-h">
        {slice.map((item) => {
          const pct = Math.max(item.value > 0 ? 2 : 0, (item.value / max) * 100);
          const text = tipText(item);
          return (
            <div
              className="chart-h-row"
              key={item.label}
              onMouseEnter={(e) => place(text, e)}
              onMouseMove={(e) => place(text, e)}
              onMouseLeave={hide}
            >
              <div className="chart-h-label">{item.label}</div>
              <div className="chart-h-track">
                <div className="chart-h-bar" style={{ width: `${pct}%` }} />
              </div>
              <div className="chart-h-n">{item.value}</div>
            </div>
          );
        })}
      </div>
    </ChartShell>
  );
}

/** Pie chart for categorical composition (e.g. Wi‑Fi context). */
export function PieChart({ items }: { items: Point[] }) {
  const { tip, place, hide } = useChartTip();
  if (!items.length) return <Empty />;
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const cx = 80;
  const cy = 80;
  const r = 72;
  let angle = 0;
  const slices =
    items.length === 1
      ? [
          {
            ...items[0],
            path: `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`,
            color: PIE_COLORS[0],
            pct: 100,
          },
        ]
      : items.map((item, i) => {
          const sweep = (item.value / total) * 360;
          const start = angle;
          const end = angle + sweep;
          angle = end;
          return {
            ...item,
            path: arcPath(cx, cy, r, start, end),
            color: PIE_COLORS[i % PIE_COLORS.length],
            pct: Math.round((item.value / total) * 100),
          };
        });

  return (
    <ChartShell tip={tip}>
      <div className="chart-pie">
        <svg className="chart-pie-svg" viewBox="0 0 160 160" role="img" aria-label="Wi-Fi context share">
          {slices.map((s) => {
            const text = `${s.label}: ${s.value} (${s.pct}%)`;
            return (
              <path
                key={s.label}
                d={s.path}
                fill={s.color}
                stroke="var(--bg-panel, #fff)"
                strokeWidth="1.5"
                className="chart-pie-slice"
                onMouseEnter={(e) => place(text, e)}
                onMouseMove={(e) => place(text, e)}
                onMouseLeave={hide}
              />
            );
          })}
        </svg>
        <ul className="chart-pie-legend">
          {slices.map((s) => {
            const text = `${s.label}: ${s.value} (${s.pct}%)`;
            return (
              <li
                key={s.label}
                onMouseEnter={(e) => place(text, e)}
                onMouseMove={(e) => place(text, e)}
                onMouseLeave={hide}
              >
                <span className="chart-pie-dot" style={{ background: s.color }} />
                <span className="chart-pie-name">{s.label}</span>
                <span className="chart-pie-meta">
                  {s.value} · {s.pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </ChartShell>
  );
}

/** Desktop: "Sept 12". Mobile compact: "12/9". */
export function formatDayTick(
  iso: string,
  index: number,
  total: number,
  compact = false,
): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5, 10);
  const step = total > 45 ? 7 : total > 20 ? 3 : total > 14 ? 2 : 1;
  if (index % step !== 0 && index !== total - 1) return "";
  if (compact) return `${d.getDate()}/${d.getMonth() + 1}`;
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}
