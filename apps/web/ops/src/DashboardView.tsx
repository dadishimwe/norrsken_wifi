import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadCsv, opsApi, type DashboardPayload, type ReportsPage } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatClarifiersDisplay, labelAppEntry, labelDevice, labelSymptom } from "./labels";

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
  return formatClarifiersDisplay(c) || "—";
}

function RowMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuW = 120;
    setPos({
      top: r.bottom + 4,
      left: Math.min(window.innerWidth - menuW - 8, Math.max(8, r.right - menuW)),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReposition() {
      place();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, place]);

  return (
    <div className="row-menu">
      <button
        ref={triggerRef}
        type="button"
        className="row-menu-trigger"
        aria-label="Row actions"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋮
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={popRef}
              className="row-menu-pop row-menu-pop-fixed"
              role="menu"
              style={{ top: pos.top, left: pos.left }}
            >
              <button
                type="button"
                className="row-menu-item danger"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              >
                Delete
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type Props = { canEdit?: boolean };

type PendingDelete = { id: string; zoneLabel: string; when: string };

export function DashboardView({ canEdit = false }: Props) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [reportsPage, setReportsPage] = useState<ReportsPage | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

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
  }, [page, tick]);

  async function confirmDelete() {
    if (!pending || !canEdit) return;
    setBusy(true);
    try {
      await opsApi.deleteReport(pending.id);
      setPending(null);
      flash("Report deleted");
      setTick((t) => t + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "delete_failed";
      setError(`Delete failed: ${msg}`);
      flash(`Delete failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const kpi = data.kpi;
  const rows = reportsPage?.reports ?? data.reports;

  return (
    <>
      {toast ? <div className="toast">{toast}</div> : null}
      <ConfirmDialog
        open={!!pending}
        title="Delete this report?"
        body={
          pending
            ? `Remove the report from ${pending.zoneLabel} (${pending.when})? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete report"
        tone="danger"
        busy={busy}
        onCancel={() => !busy && setPending(null)}
        onConfirm={() => void confirmDelete()}
      />

      {error ? <p className="error">{error}</p> : null}

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
              <table className="table table-dense table-hover">
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
                    {canEdit ? <th className="col-actions" aria-label="Actions" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={busy && pending?.id === r.id ? "row-busy" : undefined}>
                      <td title={r.created_at}>{timeAgo(r.created_at)}</td>
                      <td>{r.zone_label}</td>
                      <td>{r.zone_source ?? "—"}</td>
                      <td>
                        {r.symptoms.map((s) => (
                          <span className="pill" key={s}>
                            {labelSymptom(s)}
                          </span>
                        ))}
                      </td>
                      <td>
                        {r.apps.length
                          ? r.apps.map((a) => (
                              <span className="pill" key={a}>
                                {labelAppEntry(a, r.clarifiers)}
                              </span>
                            ))
                          : "—"}
                      </td>
                      <td>{r.when_bucket}</td>
                      <td>{r.wifi_context}</td>
                      <td className="cell-clamp">{clarifierText(r.clarifiers)}</td>
                      <td>{labelDevice(r.device_class)}</td>
                      <td>{r.channel}</td>
                      <td>{fmtNum(r.weight, 1)}</td>
                      {canEdit ? (
                        <td className="col-actions">
                          <RowMenu
                            onDelete={() =>
                              setPending({
                                id: r.id,
                                zoneLabel: r.zone_label,
                                when: timeAgo(r.created_at),
                              })
                            }
                          />
                        </td>
                      ) : null}
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
