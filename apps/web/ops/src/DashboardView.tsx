import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadCsv, opsApi, type DashboardPayload, type ReportRow, type ReportsPage } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { ReportDrawer } from "./drawers";
import {
  AssigneePicker,
  ReporterCell,
  StatusBadge,
  StatusPicker,
  textList,
  textOf,
  timeAgo,
  type WorkStatus,
} from "./issueControls";
import { labelAppEntry, labelSymptom, labelWhen } from "./labels";
import { AppLabel, ChannelLabel } from "./marks";

function fmtNum(v: string | number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
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

type Props = { canEdit?: boolean; canTriage?: boolean; meId: string; linkedReportId?: string | null };

type PendingDelete = { id: string; zoneLabel: string; when: string };

export function DashboardView({ canEdit = false, canTriage = false, meId, linkedReportId = null }: Props) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [reportsPage, setReportsPage] = useState<ReportsPage | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [openReportId, setOpenReportId] = useState<string | null>(linkedReportId);
  const [linkedReport, setLinkedReport] = useState<ReportRow | null>(null);
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

  useEffect(() => {
    if (!linkedReportId || !/^[0-9a-f-]{36}$/i.test(linkedReportId)) return;
    let cancelled = false;
    opsApi
      .report(linkedReportId)
      .then(({ report }) => {
        if (!cancelled) setLinkedReport(report);
      })
      .catch(() => {
        if (!cancelled) setLinkedReport(null);
      });
    return () => {
      cancelled = true;
    };
  }, [linkedReportId]);

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
    body: { assigned_to?: string | null; work_status?: WorkStatus },
  ) {
    if (!canTriage) return;
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
  const openReport =
    rows.find((r) => r.id === openReportId) ??
    (linkedReport?.id === openReportId ? linkedReport : null);

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
            <p className="muted">Recent reports. Device details open in the side panel. CSV export stays the raw guest data.</p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => downloadCsv("/api/ops/reports/export.csv", "norrsken-reports.csv")}
          >
            Export CSV
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="empty">No active reports.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table-dense table-hover">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Source</th>
                    <th>Reporter / Location</th>
                    <th>Symptoms</th>
                    <th>Apps</th>
                    <th>Timing</th>
                    <th>Status</th>
                    {canTriage ? <th>Assigned to</th> : null}
                    {canEdit ? <th className="col-actions" aria-label="Actions" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const symptoms = textList(r.symptoms);
                    const apps = textList(r.apps);
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
                        <ReporterCell report={r} />
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
                      <td onClick={(e) => e.stopPropagation()}>
                        {canTriage ? (
                          <StatusPicker
                            status={r.work_status}
                            disabled={busy}
                            onChange={(work_status) => void saveWork(r.id, { work_status })}
                          />
                        ) : (
                          <StatusBadge status={r.work_status} />
                        )}
                      </td>
                      {canTriage ? (
                        <td onClick={(e) => e.stopPropagation()}>
                          <AssigneePicker
                            assignedTo={r.assigned_to}
                            assigneeName={r.assignee_name}
                            assigneeCompany={r.assignee_company}
                            assignees={assignees}
                            meId={meId}
                            disabled={busy}
                            onChange={(assigned_to) => void saveWork(r.id, { assigned_to })}
                          />
                        </td>
                      ) : null}
                      {canEdit ? (
                        <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                          <RowMenu
                            onDelete={() =>
                              setPending({
                                id: r.id,
                                zoneLabel: textOf(r.company) || "this report",
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
      {openReport ? (
        <ReportDrawer
          report={openReport}
          canTriage={canTriage}
          assignees={assignees}
          meId={meId}
          onClose={() => {
            setOpenReportId(null);
            const url = new URL(window.location.href);
            if (url.searchParams.has("report")) {
              url.searchParams.delete("report");
              window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
            }
          }}
          onChanged={() => {
            setTick((t) => t + 1);
            if (openReportId) {
              opsApi
                .report(openReportId)
                .then(({ report }) => setLinkedReport(report))
                .catch(() => undefined);
            }
          }}
        />
      ) : null}
    </>
  );
}
