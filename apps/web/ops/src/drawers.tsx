import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  opsApi,
  type DashboardPayload,
  type IncidentComment,
  type ReportRow,
} from "./api";
import { formatClarifiersDisplay, labelBrowser, labelDeviceType } from "./labels";

type Incident = DashboardPayload["incidents"][number];
type Assignee = DashboardPayload["assignees"][number];

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
  incident,
  onOpenIncident,
  onClose,
}: {
  report: ReportRow;
  incident?: Incident | null;
  onOpenIncident?: () => void;
  onClose: () => void;
}) {
  const room = report.zone_id === "house" ? "House" : report.zone_label;
  const when = new Date(report.created_at).toLocaleString();
  const clarifiers = formatClarifiersDisplay(report.clarifiers);
  const phone = report.contact_phone?.trim();
  const email = report.contact_email?.trim();
  const name = report.contact_name?.trim();
  return (
    <Drawer title="Report" onClose={onClose}>
      <dl className="detail-list">
        <div>
          <dt>When</dt>
          <dd>{when}</dd>
        </div>
        <div>
          <dt>Room</dt>
          <dd>{room || "—"}</dd>
        </div>
        <div>
          <dt>Company</dt>
          <dd>{report.company?.trim() || "—"}</dd>
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
      </dl>
      {incident ? (
        <p>
          Assigned to {incident.assignee_name || "no one yet"}.
          {onOpenIncident ? (
            <>
              {" "}
              <button className="btn" type="button" onClick={onOpenIncident}>
                Assign
              </button>
            </>
          ) : null}
        </p>
      ) : (
        <p className="muted">
          {report.incident_id
            ? "This incident is already closed."
            : "This report is the incident. It shows under Open incidents while it still needs someone."}
        </p>
      )}
    </Drawer>
  );
}

export function IncidentDrawer({
  incident,
  places,
  assignees,
  canEdit,
  busy,
  onClose,
  onAction,
  onAssigned,
}: {
  incident: Incident;
  places: string;
  assignees: Assignee[];
  canEdit: boolean;
  busy: boolean;
  onClose: () => void;
  onAction: (action: "ack" | "investigating" | "resolved", postToSlack: boolean) => void;
  onAssigned: () => void;
}) {
  const [comments, setComments] = useState<IncidentComment[] | null>(null);
  const [note, setNote] = useState("");
  const [postSlack, setPostSlack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignee, setAssignee] = useState(incident.assigned_to ?? "");

  useEffect(() => {
    let cancelled = false;
    opsApi
      .incidentComments(incident.id)
      .then((data) => {
        if (!cancelled) setComments(data.comments);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load notes.");
      });
    return () => {
      cancelled = true;
    };
  }, [incident.id]);

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    const body = note.trim();
    if (!body) return;
    setError(null);
    try {
      const saved = await opsApi.addIncidentComment(incident.id, body, postSlack);
      setComments((current) => [...(current ?? []), saved.comment]);
      setNote("");
      if (postSlack && !saved.slack_posted) {
        setError("Note saved. Slack did not get the update.");
      }
    } catch {
      setError("Could not save the note.");
    }
  }

  async function saveAssignee(next: string) {
    setAssignee(next);
    setError(null);
    try {
      const saved = await opsApi.assignIncident(incident.id, next || null, postSlack);
      if (postSlack && !saved.slack_posted) {
        setError("Assignment saved. Slack did not get the update.");
      }
      onAssigned();
    } catch {
      setError("Could not assign this incident.");
    }
  }

  return (
    <Drawer title="Incident" onClose={onClose}>
      <p className="muted">
        {incident.report_company?.trim() || "Report"}
        {places ? ` · ${places}` : ""} · {incident.status === "investigating" ? "Investigating" : "Open"}
      </p>
      {incident.assignee_name ? (
        <p>
          Assigned to {incident.assignee_name}
          {incident.assignee_company ? ` · ${companyLabel(incident.assignee_company)}` : ""}
        </p>
      ) : (
        <p className="muted">No one is assigned yet.</p>
      )}
      {error ? <p className="error">{error}</p> : null}
      {canEdit ? (
        <>
          <label className="check-line">
            <input
              type="checkbox"
              checked={postSlack}
              onChange={(e) => setPostSlack(e.target.checked)}
            />
            Post this update to the alerts channel
          </label>
          <label className="field">
            Assignee
            <select value={assignee} onChange={(e) => void saveAssignee(e.target.value)} disabled={busy}>
              <option value="">Unassigned</option>
              {assignees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.display_name} · {companyLabel(person.company)}
                </option>
              ))}
            </select>
          </label>
          <div className="incident-actions">
            {!incident.acked_at ? (
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => onAction("ack", postSlack)}>
                Acknowledge
              </button>
            ) : null}
            {incident.status === "open" ? (
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => onAction("investigating", postSlack)}
              >
                Investigating
              </button>
            ) : null}
            <button className="btn" type="button" disabled={busy} onClick={() => onAction("resolved", postSlack)}>
              Resolve
            </button>
          </div>
          <form onSubmit={(e) => void saveNote(e)} className="note-form">
            <label className="field">
              Internal note
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy || !note.trim()}>
              Add note
            </button>
          </form>
        </>
      ) : null}
      <h4>Notes</h4>
      {comments === null ? (
        <p className="muted">Loading notes…</p>
      ) : comments.length === 0 ? (
        <p className="muted">No notes yet.</p>
      ) : (
        <ul className="note-list">
          {comments.map((comment) => (
            <li key={comment.id}>
              <strong>{comment.author_name || "Staff"}</strong>
              {comment.author_company ? ` · ${companyLabel(comment.author_company)}` : ""}
              <div>{comment.body}</div>
              {comment.posted_to_slack ? <div className="muted">Posted to Slack</div> : null}
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
