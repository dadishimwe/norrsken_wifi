import { useEffect, useState } from "react";
import { opsApi, type DashboardPayload, type ReportsPage } from "./api";
import { CustomSelect } from "./CustomSelect";
import { ReportDrawer } from "./drawers";
import {
  AssigneePicker,
  ReporterCell,
  StatusPicker,
  textList,
  timeAgo,
  type Assignee,
  type WorkStatus,
} from "./issueControls";
import { labelSymptom, labelWhen } from "./labels";
import { ChannelLabel } from "./marks";

type Props = { meId: string };

export function IssuesView({ meId }: Props) {
  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [pageData, setPageData] = useState<ReportsPage | null>(null);
  const [page, setPage] = useState(1);
  const [mine, setMine] = useState(false);
  const [zoneId, setZoneId] = useState("");
  const [company, setCompany] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [d, r] = await Promise.all([
          opsApi.dashboard(),
          opsApi.reports(page, 50, {
            assignment: mine ? "mine" : "all",
            zoneId: zoneId || undefined,
            company: company || undefined,
          }),
        ]);
        if (!cancelled) {
          setDash(d);
          setPageData(r);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not load issues.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [page, mine, zoneId, company, tick]);

  const rows = pageData?.reports ?? [];
  const assignees: Assignee[] = dash?.assignees ?? [];
  const zones = dash?.zones ?? [];
  const companies = pageData?.companies ?? [];
  const openReport = rows.find((row) => row.id === openId) ?? null;
  const allChecked = rows.length > 0 && rows.every((row) => selected.includes(row.id));

  async function save(id: string, body: { assigned_to?: string | null; work_status?: WorkStatus }) {
    setBusy(true);
    try {
      await opsApi.updateReportWork(id, body);
      flash(body.work_status ? "Status updated" : "Assignment updated");
      setTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    } finally {
      setBusy(false);
    }
  }

  async function bulk(body: { assigned_to?: string | null; work_status?: WorkStatus }) {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      await opsApi.bulkReports({ ids: selected, ...body });
      setSelected([]);
      flash(body.work_status === "resolved" ? "Marked resolved" : "Assigned");
      setTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !pageData) return <p className="error">{error}</p>;
  if (!pageData) return <p className="muted">Loading…</p>;

  return (
    <>
      {toast ? <div className="toast">{toast}</div> : null}
      {error ? <p className="error">{error}</p> : null}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Issues</h2>
            <p className="muted">Active reports. Resolved tickets leave this list 24 hours after they close.</p>
          </div>
        </div>
        <div className="issue-filters">
          <button
            type="button"
            className="btn"
            aria-pressed={mine}
            onClick={() => {
              setMine((v) => !v);
              setPage(1);
              setSelected([]);
            }}
          >
            Assigned to me
          </button>
          <CustomSelect
            label="Location"
            value={zoneId}
            onChange={(value) => {
              setZoneId(value);
              setPage(1);
              setSelected([]);
            }}
            options={[
              { value: "", label: "All locations" },
              ...zones.map((zone) => ({
                value: zone.zone_id,
                label: zone.zone_id === "house" ? "House" : zone.label,
              })),
            ]}
          />
          <CustomSelect
            label="Company"
            value={company}
            onChange={(value) => {
              setCompany(value);
              setPage(1);
              setSelected([]);
            }}
            options={[
              { value: "", label: "All companies" },
              ...companies.map((name) => ({ value: name, label: name })),
            ]}
          />
        </div>
        {selected.length > 0 ? (
          <div className="bulk-bar">
            <span>{selected.length} selected</span>
            <select
              aria-label="Assign selected"
              value={bulkAssignee}
              onChange={(e) => setBulkAssignee(e.target.value)}
            >
              <option value="">Assign to…</option>
              {assignees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.id === meId ? "You" : person.display_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={busy || !bulkAssignee}
              onClick={() => void bulk({ assigned_to: bulkAssignee })}
            >
              Assign
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void bulk({ work_status: "resolved" })}
            >
              Mark resolved
            </button>
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="empty">No active issues in this filter.</p>
        ) : (
          <div className="table-wrap">
            <table className="table table-dense table-hover">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={allChecked}
                      onChange={(e) => setSelected(e.target.checked ? rows.map((row) => row.id) : [])}
                    />
                  </th>
                  <th>Ticket</th>
                  <th>When</th>
                  <th>Reporter / Location</th>
                  <th>Symptoms</th>
                  <th>Status</th>
                  <th>Assigned to</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((report) => {
                  const symptoms = textList(report.symptoms);
                  return (
                    <tr key={report.id} className="row-click" onClick={() => setOpenId(report.id)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ticket ${report.ticket_no ?? ""}`}
                          checked={selected.includes(report.id)}
                          onChange={(e) =>
                            setSelected((current) =>
                              e.target.checked
                                ? [...current, report.id]
                                : current.filter((id) => id !== report.id),
                            )
                          }
                        />
                      </td>
                      <td>#{report.ticket_no ?? "—"}</td>
                      <td title={report.created_at}>
                        <ChannelLabel channel={report.channel} /> {timeAgo(report.created_at)}
                      </td>
                      <td>
                        <ReporterCell report={report} />
                      </td>
                      <td>
                        {symptoms.length
                          ? symptoms.map((symptom) => (
                              <span className="pill" key={symptom}>
                                {labelSymptom(symptom)}
                              </span>
                            ))
                          : "—"}
                        <div className="muted contact-meta">{labelWhen(report.when_bucket, report.occurred_at)}</div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <StatusPicker
                          status={report.work_status}
                          disabled={busy}
                          onChange={(work_status) => void save(report.id, { work_status })}
                        />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <AssigneePicker
                          assignedTo={report.assigned_to}
                          assigneeName={report.assignee_name}
                          assigneeCompany={report.assignee_company}
                          assignees={assignees}
                          meId={meId}
                          disabled={busy}
                          onChange={(assigned_to) => void save(report.id, { assigned_to })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pageData.total_pages > 1 ? (
          <div className="pager">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={page <= 1}
              onClick={() => setPage((n) => Math.max(1, n - 1))}
            >
              Previous
            </button>
            <span className="muted">
              Page {pageData.page} / {pageData.total_pages}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={page >= pageData.total_pages}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </section>
      {openReport ? (
        <ReportDrawer
          report={openReport}
          canTriage
          assignees={assignees}
          meId={meId}
          onClose={() => setOpenId(null)}
          onChanged={() => setTick((n) => n + 1)}
        />
      ) : null}
    </>
  );
}
