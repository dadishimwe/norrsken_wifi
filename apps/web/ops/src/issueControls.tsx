import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReportRow } from "./api";
import { labelSymptom, labelUserType } from "./labels";

const COMPANY_LABELS: Record<string, string> = {
  norrsken: "Norrsken",
  zuba: "Zuba",
  dct: "DCT",
};

function companyLabel(company: string | null | undefined): string {
  if (!company) return "";
  return COMPANY_LABELS[company] ?? company;
}

export type WorkStatus = "new" | "in_progress" | "waiting_vendor" | "resolved";
export type Priority = "normal" | "high" | "urgent";

export const WORK_STATUS_OPTIONS: { id: WorkStatus; label: string }[] = [
  { id: "new", label: "New" },
  { id: "in_progress", label: "In Progress" },
  { id: "waiting_vendor", label: "Waiting on Vendor" },
  { id: "resolved", label: "Resolved" },
];

export const PRIORITY_OPTIONS: { id: Priority; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
  { id: "urgent", label: "Urgent" },
];

export type Assignee = { id: string; display_name: string; company: string };

export function canTriage(user: { role: string; company?: string | null }): boolean {
  return user.role === "super_admin" || (user.role === "admin" && user.company === "dct");
}

export function statusLabel(status: string | null | undefined): string {
  return WORK_STATUS_OPTIONS.find((item) => item.id === status)?.label ?? "New";
}

export function statusTone(status: string | null | undefined): string {
  if (status === "in_progress" || status === "waiting_vendor" || status === "resolved") return status;
  return "new";
}

export function priorityLabel(priority: string | null | undefined): string {
  return PRIORITY_OPTIONS.find((item) => item.id === priority)?.label ?? "Normal";
}

export function textList(value: unknown): string[] {
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

export function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function roomLabel(report: Pick<ReportRow, "zone_id" | "zone_label">): string {
  if (report.zone_id === "house") return "House";
  return textOf(report.zone_label) || "House";
}

export function whoLabel(report: Pick<ReportRow, "user_type" | "user_type_other">): string {
  if (!report.user_type) return "";
  if (report.user_type === "other") return textOf(report.user_type_other) || labelUserType(report.user_type);
  return labelUserType(report.user_type);
}

export function primarySymptom(report: ReportRow): string {
  const first = textList(report.symptoms)[0];
  return first ? labelSymptom(first) : "Report";
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function assigneeLabel(person: Assignee, meId?: string): string {
  const name = person.id === meId ? "You" : person.display_name;
  const company = companyLabel(person.company);
  return company ? `${name} (${company})` : name;
}

function useAnchoredPopover(open: boolean, onClose: () => void) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function place() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 240;
    setPos({
      top: r.bottom + 6,
      left: Math.min(window.innerWidth - width - 8, Math.max(8, r.left)),
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      onCloseRef.current();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return { triggerRef, popRef, pos, place };
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  return <span className={`status-pill ${statusTone(status)}`}>{statusLabel(status)}</span>;
}

export function StatusPicker({
  status,
  disabled,
  onChange,
}: {
  status: string | null | undefined;
  disabled?: boolean;
  onChange: (status: WorkStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const { triggerRef, popRef, pos } = useAnchoredPopover(open, () => setOpen(false));
  const shown = open && pos;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`status-pill ${statusTone(status)} is-button`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {statusLabel(status)}
      </button>
      {shown
        ? createPortal(
            <div
              ref={popRef}
              className="picker-pop"
              role="listbox"
              style={{ top: pos.top, left: pos.left }}
            >
              {WORK_STATUS_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={item.id === status}
                  className="picker-option"
                  onClick={() => {
                    setOpen(false);
                    if (item.id !== status) onChange(item.id);
                  }}
                >
                  <span className={`status-pill ${item.id}`}>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function AssigneePicker({
  assignedTo,
  assigneeName,
  assigneeCompany,
  assignees,
  meId,
  disabled,
  onChange,
}: {
  assignedTo?: string | null;
  assigneeName?: string | null;
  assigneeCompany?: string | null;
  assignees: Assignee[];
  meId?: string;
  disabled?: boolean;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { triggerRef, popRef, pos } = useAnchoredPopover(open, () => setOpen(false));
  const current = assignees.find((person) => person.id === assignedTo);
  const label = current
    ? assigneeLabel(current, meId)
    : assigneeName
      ? `${assigneeName}${assigneeCompany ? ` (${companyLabel(assigneeCompany)})` : ""}`
      : "+ Assign";
  const q = query.trim().toLowerCase();
  const matches = assignees.filter((person) => {
    if (!q) return true;
    return `${person.display_name} ${companyLabel(person.company)}`.toLowerCase().includes(q);
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={assignedTo || assigneeName ? "assign-btn" : "assign-btn assign-empty"}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => {
          setQuery("");
          setOpen((v) => !v);
        }}
      >
        {label}
      </button>
      {open && pos
        ? createPortal(
            <div ref={popRef} className="picker-pop" style={{ top: pos.top, left: pos.left }}>
              <input
                className="picker-search"
                placeholder="Search engineers"
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className="picker-option"
                onClick={() => {
                  setOpen(false);
                  onChange(null);
                }}
              >
                Unassigned
              </button>
              {matches.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className="picker-option"
                  onClick={() => {
                    setOpen(false);
                    onChange(person.id);
                  }}
                >
                  {assigneeLabel(person, meId)}
                </button>
              ))}
              {matches.length === 0 ? <p className="muted picker-empty">No matching engineer</p> : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function ReporterCell({ report }: { report: ReportRow }) {
  const room = roomLabel(report);
  const who = whoLabel(report);
  const company = textOf(report.company);
  const name = report.contact_ok ? textOf(report.contact_name) : "";
  const phone = report.contact_ok ? textOf(report.contact_phone) : "";
  const email = report.contact_ok ? textOf(report.contact_email) : "";
  const headline = who ? `${room} • ${who}` : room;
  const extra = [company, name, [phone, email].filter(Boolean).join(" · ")].filter(Boolean);
  return (
    <div className="reporter-cell">
      <div>{headline}</div>
      {extra.length ? <div className="muted contact-meta">{extra.join(" · ")}</div> : null}
    </div>
  );
}
