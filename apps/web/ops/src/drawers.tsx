import { useEffect, type ReactNode } from "react";
import { type ReportRow } from "./api";
import { formatClarifiersDisplay, labelBrowser, labelDeviceType } from "./labels";

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

function statusLabel(status: string | null | undefined): string {
  if (status === "investigating") return "Investigating";
  if (status === "resolved") return "Resolved";
  return "Open";
}

export function ReportDrawer({ report, onClose }: { report: ReportRow; onClose: () => void }) {
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
        <div>
          <dt>Status</dt>
          <dd>{statusLabel(report.work_status)}</dd>
        </div>
        <div>
          <dt>Assigned to</dt>
          <dd>
            {report.assignee_name
              ? `${report.assignee_name}${report.assignee_company ? ` · ${companyLabel(report.assignee_company)}` : ""}`
              : "No one yet"}
          </dd>
        </div>
      </dl>
    </Drawer>
  );
}
