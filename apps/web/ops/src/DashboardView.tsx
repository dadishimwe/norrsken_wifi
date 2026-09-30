import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadCsv, opsApi, type DashboardPayload, type ReportsPage } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  labelAppEntry,
  labelSymptom,
  labelUserType,
  labelWhen,
} from "./labels";
import { AppLabel, ChannelLabel } from "./marks";
import { companyLabel, ReportDrawer } from "./drawers";

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

type Props = { canEdit?: boolean; meId: string };

type AssignmentFilter = "all" | "unassigned" | "assigned" | "mine";

const ASSIGNMENT_FILTERS: { id: AssignmentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unassigned", label: "Unassigned" },
  { id: "assigned", label: "Assigned" },
  { id: "mine", label: "Assigned to me" },
];

function textList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return trimmed ? [trimmed] : [];
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function statusName(status: string | null | undefined): string {
  if (status === "investigating") return "Investigating";
  if (status === "resolved") return "Resolved";
  return "Open";
}

function statusClass(status: string | null | undefined): string {
  if (status === "investigating") return "status-mark investigating";
  if (status === "resolved") return "status-mark resolved";
  return "status-mark open";
}

type PendingDelete = { id: string; zoneLabel: string; when: string };

export function DashboardView({ canEdit = false, meId }: Props) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [reportsPage, setReportsPage] = useState<ReportsPage | null>(null);
  const [page, setPage] = useState(1);
  const [assignment, setAssignment] = useState<AssignmentFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [d, r] = await Promise.all([opsApi.dashboard(), opsApi.reports(page, 25, assignment)]);
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
  }, [page, tick, assignment]);

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

  async function saveWork(
    id: string,
    body: { assigned_to?: string | null; work_status?: "open" | "investigating" | "resolved" },
  ) {
    if (!canEdit) return;
    setBusy(true);
    try {
      await opsApi.updateReportWork(id, body);
      flash(body.work_status ? "Status updated" : body.assigned_to ? "Assigned" : "Assignment cleared");
      setTick((t) => t + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "update_failed";
      setError(`Could not update the report: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const kpi = data.kpi;
  const rows = Array.isArray(reportsPage?.reports)
    ? reportsPage.reports
    : Array.isArray(data.reports)
      ? data.reports
      : [];
  const assignees = Array.isArray(data.assignees) ? data.assignees : [];
  const openReport = rows.find((r) => r.id === openReportId) ?? null;

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
          <div className="label">Open reports</div>
          <div className="value">{fmtNum(kpi?.open_incidents)}</div>
          <div className="hint">Not resolved yet</div>
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

      <section className="panel" style={{ marginTop: "1rem" }}>
        <div className="panel-head">
          <div>
            <h2>Reports</h2>
            <p className="muted">Assign a person and set the status on the report. CSV export stays the raw guest data.</p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => downloadCsv("/api/ops/reports/export.csv", "norrsken-reports.csv")}
          >
            Export CSV
          </button>
        </div>
        <div className="assign-filters" role="group" aria-label="Assignment">
          {ASSIGNMENT_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="btn"
              aria-pressed={assignment === item.id}
              onClick={() => {
                setAssignment(item.id);
                setPage(1);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="empty">{assignment === "all" ? "No reports yet." : "No reports in this filter."}</p>
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
                    <th>Room</th>
                    <th>Company</th>
                    <th>Who</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    {canEdit ? <th className="col-actions" aria-label="Actions" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const symptoms = textList(r.symptoms);
                    const apps = textList(r.apps);
                    const company = textOf(r.company);
                    const contactName = textOf(r.contact_name);
                    const contactPhone = textOf(r.contact_phone);
                    const contactEmail = textOf(r.contact_email);
                    const otherWho = textOf(r.user_type_other);
                    return (
                    <tr
                      key={r.id}
                      className={`row-click${busy && pending?.id === r.id ? " row-busy" : ""}`}
                      onClick={() => setOpenReportId(r.id)}
                    >
                      <td title={r.created_at}>{timeAgo(r.created_at)}</td>
                      <td>
                        <ChannelLabel channel={r.channel} />
                      </td>
                      <td>
                        {symptoms.map((s) => (
                          <span className="pill" key={s}>
                            {labelSymptom(s)}
                          </span>
                        ))}
                      </td>
                      <td>
                        {apps.length
                          ? apps.map((a) => (
                              <span className="pill" key={a}>
                                <AppLabel id={a} label={labelAppEntry(a, r.clarifiers)} />
                              </span>
                            ))
                          : "—"}
                      </td>
                      <td>{labelWhen(r.when_bucket, r.occurred_at)}</td>
                      <td>{r.zone_id === "house" ? "House" : r.zone_label || "—"}</td>
                      <td>{company || "—"}</td>
                      <td>
                        {r.user_type
                          ? r.user_type === "other" && otherWho
                            ? `${labelUserType(r.user_type)} · ${otherWho}`
                            : labelUserType(r.user_type)
                          : "—"}
                      </td>
                      <td>
                        {r.contact_ok ? (
                          <div className="contact-cell">
                            <div>{contactName || "Name not given"}</div>
                            {contactPhone || contactEmail ? (
                              <div className="muted contact-meta">
                                {[contactPhone, contactEmail].filter(Boolean).join(" · ")}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {canEdit ? (
                          <label className={statusClass(r.work_status)}>
                            <span className="sr-only">Status</span>
                            <select
                              className="row-select"
                              aria-label="Status"
                              value={r.work_status === "investigating" || r.work_status === "resolved" ? r.work_status : "open"}
                              disabled={busy}
                              onChange={(e) =>
                                void saveWork(r.id, {
                                  work_status: e.target.value as "open" | "investigating" | "resolved",
                                })
                              }
                            >
                              <option value="open">Open</option>
                              <option value="investigating">Investigating</option>
                              <option value="resolved">Resolved</option>
                            </select>
                          </label>
                        ) : (
                          <span className={statusClass(r.work_status)}>{statusName(r.work_status)}</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {canEdit ? (
                          <select
                            className="row-select"
                            aria-label="Assignee"
                            value={r.assigned_to ?? ""}
                            disabled={busy}
                            onChange={(e) => void saveWork(r.id, { assigned_to: e.target.value || null })}
                          >
                            <option value="">Unassigned</option>
                            {assignees.map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.id === meId ? "You" : person.display_name} · {companyLabel(person.company)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>
                            {r.assigned_to === meId
                              ? "You"
                              : r.assignee_name || "Unassigned"}
                          </span>
                        )}
                      </td>
                      {canEdit ? (
                        <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                          <RowMenu
                            onDelete={() =>
                              setPending({
                                id: r.id,
                                zoneLabel: company || "this report",
                                when: timeAgo(r.created_at),
                              })
                            }
                          />
                        </td>
                      ) : null}
                    </tr>
                    );
                  })}
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
      {openReport ? <ReportDrawer report={openReport} onClose={() => setOpenReportId(null)} /> : null}
    </>
  );
}
