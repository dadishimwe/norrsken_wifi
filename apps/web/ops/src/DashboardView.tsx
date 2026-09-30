import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadCsv, opsApi, type DashboardPayload, type ReportsPage } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  formatClarifiersDisplay,
  labelAppEntry,
  labelBrowser,
  labelDeviceType,
  labelSymptom,
  labelUserType,
  labelWhen,
} from "./labels";
import { AppLabel, ChannelLabel } from "./marks";

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
  const [resolveId, setResolveId] = useState<string | null>(null);
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

  async function actOnIncident(id: string, action: "ack" | "investigating" | "resolved") {
    setBusy(true);
    try {
      await opsApi.incidentAction(id, action);
      setResolveId(null);
      flash(
        action === "ack" ? "Acknowledged" : action === "investigating" ? "Marked investigating" : "Resolved",
      );
      setTick((t) => t + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "update_failed";
      setError(`Could not update the incident: ${msg}`);
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
        open={!!resolveId}
        title="Resolve this incident?"
        body="This records the time it was closed. It does not record who closed it."
        confirmLabel="Resolve"
        busy={busy}
        onCancel={() => !busy && setResolveId(null)}
        onConfirm={() => {
          if (resolveId) void actOnIncident(resolveId, "resolved");
        }}
      />
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
          <div className="hint">Related reports grouped as one outage</div>
        </div>
        <div className="kpi">
          <div className="label">MTTA (30d)</div>
          <div className="value">{fmtNum(kpi?.mtta_minutes_30d, 0)}</div>
          <div className="hint">Average minutes to acknowledge</div>
        </div>
        <div className="kpi">
          <div className="label">MTTR (30d)</div>
          <div className="value">{fmtNum(kpi?.mttr_minutes_30d, 0)}</div>
          <div className="hint">Average minutes to resolve</div>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Open incidents</h2>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            Opens when three people report within 10 minutes. Acknowledge and resolve record the time only.
          </p>
          {data.incidents.length === 0 ? (
            <p className="empty">No open incidents yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Opened</th>
                    <th>Status</th>
                    <th>Places</th>
                    <th>Reports</th>
                    <th className="col-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.incidents.map((i) => {
                    const labels = new Map(data.zones.map((z) => [z.zone_id, z.label]));
                    const places = i.zones.map((id) => labels.get(id) ?? id).join(", ");
                    const quiet =
                      !!i.last_report_at &&
                      Date.now() - new Date(i.last_report_at).getTime() >= 20 * 60_000;
                    return (
                      <tr key={i.id}>
                        <td>{timeAgo(i.opened_at)}</td>
                        <td>
                          {i.status === "investigating" ? "Investigating" : "Open"}
                          {i.scope === "campus" ? " · Across the house" : ""}
                          {i.root_cause === "provider_side_suspected" ? (
                            <span className="pill">App outage likely</span>
                          ) : null}
                          {quiet ? <div className="muted">Quiet for 20 minutes</div> : null}
                        </td>
                        <td>{places}</td>
                        <td>{fmtNum(i.report_count)}</td>
                        <td className="col-actions">
                          <div className="incident-actions">
                            {!i.acked_at ? (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                disabled={busy}
                                onClick={() => void actOnIncident(i.id, "ack")}
                              >
                                Acknowledge
                              </button>
                            ) : null}
                            {i.status === "open" ? (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                disabled={busy}
                                onClick={() => void actOnIncident(i.id, "investigating")}
                              >
                                Investigating
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => setResolveId(i.id)}
                            >
                              Resolve
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
                    <th>Source</th>
                    <th>Symptoms</th>
                    <th>Apps</th>
                    <th>Timing</th>
                    <th title="Extra answers, including the room, a note, and the name typed for another app">
                      Clarifiers
                    </th>
                    <th>Company</th>
                    <th>Who</th>
                    <th>Contact</th>
                    <th>Device</th>
                    <th>Browser</th>
                    {canEdit ? <th className="col-actions" aria-label="Actions" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={busy && pending?.id === r.id ? "row-busy" : undefined}>
                      <td title={r.created_at}>{timeAgo(r.created_at)}</td>
                      <td>
                        <ChannelLabel channel={r.channel} />
                      </td>
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
                                <AppLabel id={a} label={labelAppEntry(a, r.clarifiers)} />
                              </span>
                            ))
                          : "—"}
                      </td>
                      <td>{labelWhen(r.when_bucket, r.occurred_at)}</td>
                      <td className="cell-clamp">{clarifierText(r.clarifiers)}</td>
                      <td>{r.company?.trim() || "—"}</td>
                      <td>
                        {r.user_type
                          ? r.user_type === "other" && r.user_type_other?.trim()
                            ? `${labelUserType(r.user_type)} · ${r.user_type_other.trim()}`
                            : labelUserType(r.user_type)
                          : "—"}
                      </td>
                      <td>
                        {r.contact_ok ? (
                          <div className="contact-cell">
                            <div>{r.contact_name?.trim() || "Name not given"}</div>
                            {r.contact_phone?.trim() || r.contact_email?.trim() ? (
                              <div className="muted contact-meta">
                                {[r.contact_phone?.trim(), r.contact_email?.trim()]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{labelDeviceType(r.device_class)}</td>
                      <td>{labelBrowser(r.browser)}</td>
                      {canEdit ? (
                        <td className="col-actions">
                          <RowMenu
                            onDelete={() =>
                              setPending({
                                id: r.id,
                                zoneLabel: r.company?.trim() || "this report",
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
