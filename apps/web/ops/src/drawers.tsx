import { useEffect, useState, type ReactNode } from "react";
import { opsApi, type IncidentComment, type ReportRow } from "./api";
import { CustomSelect } from "./CustomSelect";
import {
  AssigneePicker,
  PRIORITY_OPTIONS,
  StatusBadge,
  StatusPicker,
  roomLabel,
  textList,
  textOf,
  whoLabel,
  type Assignee,
  type Priority,
  type WorkStatus,
} from "./issueControls";
import {
  formatClarifiersDisplay,
  labelAppEntry,
  labelBrowser,
  labelDeviceType,
  labelSymptom,
  labelWhen,
} from "./labels";
import { AppLabel, ChannelLabel } from "./marks";

const COMPANY_LABELS: Record<string, string> = {
  norrsken: "Norrsken",
  zuba: "Zuba",
  dct: "DCT",
};

export function companyLabel(company: string | null | undefined): string {
  if (!company) return "";
  return COMPANY_LABELS[company] ?? company;
}

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function ReportDrawer({
  report,
  onClose,
  canTriage = false,
  assignees = [],
  meId,
  onChanged,
}: {
  report: ReportRow;
  onClose: () => void;
  canTriage?: boolean;
  assignees?: Assignee[];
  meId?: string;
  onChanged?: () => void;
}) {
  const [notes, setNotes] = useState<IncidentComment[]>([]);
  const [note, setNote] = useState("");
  const [postSlack, setPostSlack] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const when = new Date(report.created_at).toLocaleString();
  const clarifiers = formatClarifiersDisplay(report.clarifiers);
  const phone = textOf(report.contact_phone);
  const email = textOf(report.contact_email);
  const name = textOf(report.contact_name);
  const symptoms = textList(report.symptoms);
  const apps = textList(report.apps);
  const title = report.ticket_no ? `#${report.ticket_no}` : "Report";

  useEffect(() => {
    if (!canTriage) return;
    let cancelled = false;
    opsApi
      .reportNotes(report.id)
      .then((res) => {
        if (!cancelled) setNotes(res.notes);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canTriage, report.id]);

  async function patch(body: {
    assigned_to?: string | null;
    work_status?: WorkStatus;
    priority?: Priority;
  }) {
    setBusy(true);
    setError(null);
    try {
      await opsApi.updateReportWork(report.id, body);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    const body = note.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const res = await opsApi.addReportNote(report.id, body, postSlack);
      setNotes((current) => [...current, res.note]);
      setNote("");
      setPostSlack(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "note_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer title={title} onClose={onClose}>
      {error ? <p className="error">{error}</p> : null}
      <dl className="detail-list">
        <div>
          <dt>When</dt>
          <dd>{when}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            <ChannelLabel channel={report.channel} />
          </dd>
        </div>
        <div>
          <dt>Room</dt>
          <dd>{roomLabel(report)}</dd>
        </div>
        <div>
          <dt>Who</dt>
          <dd>{whoLabel(report) || "—"}</dd>
        </div>
        <div>
          <dt>Company</dt>
          <dd>{textOf(report.company) || "—"}</dd>
        </div>
        <div>
          <dt>Contact</dt>
          <dd>
            {report.contact_ok ? (
              <>
                <div>{name || "Name not given"}</div>
                <div>{phone || "No phone"}</div>
                <div>{email || "No email"}</div>
              </>
            ) : (
              "Did not agree to be contacted"
            )}
          </dd>
        </div>
        <div>
          <dt>Symptoms</dt>
          <dd>{symptoms.length ? symptoms.map((item) => labelSymptom(item)).join(", ") : "—"}</dd>
        </div>
        <div>
          <dt>Apps</dt>
          <dd>
            {apps.length
              ? apps.map((item) => (
                  <span className="pill" key={item}>
                    <AppLabel id={item} label={labelAppEntry(item, report.clarifiers)} />
                  </span>
                ))
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Timing</dt>
          <dd>{labelWhen(report.when_bucket, report.occurred_at)}</dd>
        </div>
        <div>
          <dt>Clarifiers</dt>
          <dd>{clarifiers || "—"}</dd>
        </div>
        <div>
          <dt>Device</dt>
          <dd>{labelDeviceType(report.device_class)}</dd>
        </div>
        <div>
          <dt>Browser</dt>
          <dd>{labelBrowser(report.browser)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            {canTriage ? (
              <StatusPicker
                status={report.work_status}
                disabled={busy}
                onChange={(work_status) => void patch({ work_status })}
              />
            ) : (
              <StatusBadge status={report.work_status} />
            )}
          </dd>
        </div>
        {canTriage ? (
          <>
            <div>
              <dt>Assigned to</dt>
              <dd>
                <AssigneePicker
                  assignedTo={report.assigned_to}
                  assigneeName={report.assignee_name}
                  assigneeCompany={report.assignee_company}
                  assignees={assignees}
                  meId={meId}
                  disabled={busy}
                  onChange={(assigned_to) => void patch({ assigned_to })}
                />
              </dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>
                <CustomSelect
                  label="Priority"
                  className="cselect-unlabeled"
                  value={report.priority === "high" || report.priority === "urgent" ? report.priority : "normal"}
                  disabled={busy}
                  onChange={(value) => void patch({ priority: value as Priority })}
                  options={PRIORITY_OPTIONS.map((item) => ({ value: item.id, label: item.label }))}
                />
              </dd>
            </div>
          </>
        ) : null}
      </dl>
      {canTriage ? (
        <section className="worklog">
          <h4>Internal notes</h4>
          {notes.length === 0 ? <p className="muted">No notes yet.</p> : null}
          <ul className="note-list">
            {notes.map((item) => (
              <li key={item.id}>
                <strong>{item.author_name || "Engineer"}</strong>
                <span className="muted"> {new Date(item.created_at).toLocaleString()}</span>
                {item.posted_to_slack ? <span className="muted"> · Sent to Slack</span> : null}
                <p>{item.body}</p>
              </li>
            ))}
          </ul>
          <label className="field" htmlFor="report-note">
            Note
            <textarea
              id="report-note"
              value={note}
              maxLength={2000}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="check-line">
            <input
              type="checkbox"
              checked={postSlack}
              onChange={(e) => setPostSlack(e.target.checked)}
            />
            Also reply in the Slack alert thread
          </label>
          <button className="btn btn-primary" type="button" disabled={busy || !note.trim()} onClick={() => void saveNote()}>
            Save note
          </button>
        </section>
      ) : null}
    </Drawer>
  );
}
