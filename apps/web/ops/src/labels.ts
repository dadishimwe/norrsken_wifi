/** Display labels for ops tables (kept local — @norrsken/shared pulls Node crypto). */

export const SYMPTOM_LABELS: Record<string, string> = {
  cant_connect: "Couldn't connect",
  no_internet: "Connected but nothing loads",
  wifi_drops: "Wi‑Fi keeps dropping",
  call_choppy: "Call choppy/laggy",
  call_disconnects: "Kept disconnecting from call",
  slow: "Slow (pages/uploads)",
};

export const APP_LABELS: Record<string, string> = {
  zoom: "Zoom",
  teams: "Teams",
  meet: "Google Meet",
  slack: "Slack",
  github: "GitHub",
  google_workspace: "Gmail / Google Workspace",
  m365: "Microsoft 365",
  ssh_remote: "SSH / remote dev",
  banking: "Banking",
  web: "Web / browsing",
  cloud_vpn: "Cloud / VPN / files",
  other: "Other",
};

const CLARIFIER_FIELDS: Record<string, string> = {
  same_as_incident: "Same as current issue",
  choppy_type: "What was choppy",
  wifi_dropped: "Wi‑Fi drop",
  connect_detail: "What they saw",
  slow_scope: "Slow scope",
  wifi_context: "Wi‑Fi",
  other_app: "Other app",
};

const CLARIFIER_VALUES: Record<string, Record<string, string>> = {
  same_as_incident: { yes: "Yes", no: "No, different" },
  choppy_type: {
    video: "Video",
    audio: "Audio",
    both: "Both",
    screen: "Screen share",
  },
  wifi_dropped: {
    wifi_dropped: "Wi‑Fi dropped",
    only_app: "Only the app",
    not_sure: "Not sure",
  },
  connect_detail: {
    cant_join: "Can't join network",
    joined_no_internet: "Joined, no internet",
    login_again: "Asked me to log in again",
    not_sure: "Not sure",
  },
  slow_scope: {
    everything: "Everything",
    one_app: "One app",
    uploads_downloads: "Uploads & downloads",
  },
};

export function labelSymptom(id: string): string {
  return SYMPTOM_LABELS[id] ?? id.replaceAll("_", " ");
}

export function labelApp(id: string): string {
  return APP_LABELS[id] ?? id.replaceAll("_", " ");
}

export function formatClarifiersDisplay(
  clarifiers: Record<string, unknown> | null | undefined,
): string {
  if (!clarifiers || typeof clarifiers !== "object") return "";
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(clarifiers)) {
    if (raw == null || raw === "") continue;
    const value = String(raw);
    if (key === "other_app") {
      parts.push(`Other app: ${value}`);
      continue;
    }
    const field = CLARIFIER_FIELDS[key] ?? key.replaceAll("_", " ");
    const pretty = CLARIFIER_VALUES[key]?.[value] ?? value.replaceAll("_", " ");
    parts.push(`${field}: ${pretty}`);
  }
  return parts.join(" · ");
}
