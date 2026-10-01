import { useEffect, useState } from "react";
import { opsApi, type ReportRow } from "./api";
import { ReportDrawer } from "./drawers";
import {
  assigneeLabel,
  primarySymptom,
  roomLabel,
  timeAgo,
  type Assignee,
  type WorkStatus,
} from "./issueControls";
import { ChannelLabel } from "./marks";

type ColumnId = "unassigned" | "in_progress" | "waiting_vendor" | "resolved";

const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: "unassigned", title: "Unassigned" },
  { id: "in_progress", title: "In Progress" },
  { id: "waiting_vendor", title: "Waiting on Vendor" },
  { id: "resolved", title: "Resolved" },
];

function columnOf(report: ReportRow): ColumnId {
  if (report.work_status === "resolved") return "resolved";
  if (report.work_status === "waiting_vendor") return "waiting_vendor";
  if (report.work_status === "in_progress" || report.assigned_to) return "in_progress";
  return "unassigned";
}

type Props = { meId: string };

export function BoardView({ meId }: Props) {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ColumnId | null>(null);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dash, page] = await Promise.all([opsApi.dashboard(), opsApi.reports(1, 200)]);
        if (!cancelled) {
          setReports(page.reports);
          setAssignees(dash.assignees);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not load the board.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const openReport = reports.find((report) => report.id === openId) ?? null;

  async function move(report: ReportRow, column: ColumnId) {
    if (columnOf(report) === column) return;
    const body: { assigned_to?: string | null; work_status?: WorkStatus } =
      column === "unassigned"
        ? { assigned_to: null, work_status: "new" }
        : column === "in_progress"
          ? { work_status: "in_progress" }
          : { work_status: column };
    setBusy(true);
    try {
      await opsApi.updateReportWork(report.id, body);
      flash("Status updated");
      setTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    } finally {
      setBusy(false);
    }
  }

  async function claim(report: ReportRow) {
    setBusy(true);
    try {
      await opsApi.updateReportWork(report.id, { assigned_to: meId, work_status: "in_progress" });
      flash("Issue claimed");
      setTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && reports.length === 0) return <p className="error">{error}</p>;

  return (
    <>
      {toast ? <div className="toast">{toast}</div> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="board">
        {COLUMNS.map((column) => {
          const cards = reports.filter((report) => columnOf(report) === column.id);
          return (
            <section
              key={column.id}
              className={`board-col${dragOver === column.id ? " is-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(column.id);
              }}
              onDragLeave={() => setDragOver((current) => (current === column.id ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/plain");
                const report = reports.find((item) => item.id === id);
                if (report) void move(report, column.id);
              }}
            >
              <header>
                <h2>{column.title}</h2>
                <span>{cards.length}</span>
              </header>
              {cards.map((report) => {
                const person = assignees.find((item) => item.id === report.assigned_to);
                const who = person
                  ? assigneeLabel(person, meId)
                  : report.assignee_name || "";
                return (
                  <article
                    key={report.id}
                    className="board-card"
                    draggable={!busy}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", report.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => setOpenId(report.id)}
                  >
                    <div className="board-card-title">
                      #{report.ticket_no ?? "—"} · {roomLabel(report)}
                    </div>
                    <p>{primarySymptom(report)}</p>
                    <div className="board-card-meta">
                      <ChannelLabel channel={report.channel} />
                      <span>
                        {report.work_status === "resolved"
                          ? `Completed ${timeAgo(report.resolved_at || report.created_at)}`
                          : timeAgo(report.created_at)}
                      </span>
                    </div>
                    {who ? <div className="board-card-who">{who}</div> : null}
                    {column.id === "unassigned" ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void claim(report);
                        }}
                      >
                        Claim Issue
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
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
