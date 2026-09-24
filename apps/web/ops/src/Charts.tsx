type Point = { label: string; value: number; title?: string };

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

/** Vertical columns — time series or few categories (share / count). */
export function VerticalBars({
  items,
  height = 220,
  formatLabel,
}: {
  items: Point[];
  height?: number;
  formatLabel?: (label: string, index: number, total: number) => string;
}) {
  if (!items.length) return <Empty />;
  const max = niceMax(Math.max(...items.map((i) => i.value), 1));
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  const n = items.length;
  // Cap bar width so 2–3 categories don’t look huge
  const gap = n <= 6 ? 12 : 6;
  const maxBar = n <= 5 ? 48 : n <= 14 ? 28 : 16;

  return (
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
              ? formatLabel(item.label, i, n)
              : item.label;
            return (
              <div className="chart-v-col" key={`${item.label}-${i}`} title={item.title ?? `${item.label}: ${item.value}`}>
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
  const slice = items.slice(0, maxItems);
  if (!slice.length) return <Empty />;
  const max = niceMax(Math.max(...slice.map((i) => i.value), 1));

  return (
    <div className="chart-h">
      {slice.map((item) => {
        const pct = Math.max(item.value > 0 ? 2 : 0, (item.value / max) * 100);
        return (
          <div className="chart-h-row" key={item.label} title={item.title ?? `${item.label}: ${item.value}`}>
            <div className="chart-h-label">{item.label}</div>
            <div className="chart-h-track">
              <div className="chart-h-bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="chart-h-n">{item.value}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Compact share chart for small categorical sets (wifi, channel mix). */
export function ShareBars({ items }: { items: Point[] }) {
  if (!items.length) return <Empty />;
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <div className="chart-share">
      <div className="chart-share-stack" role="img" aria-label="Share of reports">
        {items.map((item, i) => {
          const pct = (item.value / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={item.label}
              className={`chart-share-seg seg-${i % 5}`}
              style={{ width: `${pct}%` }}
              title={`${item.label}: ${item.value} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      <ul className="chart-share-legend">
        {items.map((item, i) => {
          const pct = Math.round((item.value / total) * 100);
          return (
            <li key={item.label}>
              <span className={`chart-share-dot seg-${i % 5}`} />
              <span className="chart-share-name">{item.label}</span>
              <span className="chart-share-meta">
                {item.value} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function formatDayTick(iso: string, index: number, total: number): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5, 10);
  const step = total > 45 ? 7 : total > 20 ? 3 : total > 10 ? 2 : 1;
  if (index % step !== 0 && index !== total - 1) return "";
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
