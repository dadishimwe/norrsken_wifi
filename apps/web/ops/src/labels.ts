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

export const WIFI_LABELS: Record<string, string> = {
  member_wifi: "Member Wi-Fi",
  guest_wifi: "Guest Wi-Fi",
  wired: "Wired",
  unknown: "Not sure",
};

export const WHEN_LABELS: Record<string, string> = {
  now: "Happening now",
  recent: "Just ended",
  earlier: "Earlier today",
};

export const DEVICE_LABELS: Record<string, string> = {
  iphone: "iPhone",
  android: "Android phone",
  windows: "Windows laptop",
  mac: "Mac",
  linux: "Linux laptop",
  unknown: "Not sure",
  mobile: "Phone",
  desktop: "Laptop / desktop",
  chrome: "Chrome",
  safari: "Safari",
  firefox: "Firefox",
  edge: "Edge",
  opera: "Opera",
  samsung: "Samsung Internet",
};

const CLARIFIER_FIELDS: Record<string, string> = {
  same_as_incident: "Same as current issue",
  choppy_type: "What was choppy",
  wifi_dropped: "Wi‑Fi drop",
  connect_detail: "What they saw",
  slow_scope: "Slow scope",
  wifi_context: "Wi‑Fi",
  note: "Anything else",
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

export function labelWifi(id: string | null | undefined): string {
  if (!id) return "—";
  return WIFI_LABELS[id] ?? id.replaceAll("_", " ");
}

export function labelWhen(bucket: string | null | undefined, occurredAt?: string | null): string {
  const base = (bucket && WHEN_LABELS[bucket]) || (bucket ? bucket.replaceAll("_", " ") : "—");
  if (!occurredAt) return base;
  const d = new Date(occurredAt);
  if (Number.isNaN(d.getTime())) return base;
  const pretty = d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${base} · ${pretty}`;
}

function clarifierRecord(clarifiers: unknown): Record<string, unknown> | null {
  if (!clarifiers) return null;
  if (typeof clarifiers === "string") {
    try {
      const parsed = JSON.parse(clarifiers) as unknown;
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
    return null;
  }
  if (typeof clarifiers === "object") return clarifiers as Record<string, unknown>;
  return null;
}

export function labelApp(id: string): string {
  return APP_LABELS[id] ?? id.replaceAll("_", " ");
}

/** Resolve app pills — prefer custom Other text when present. */
export function labelAppEntry(id: string, clarifiers?: unknown): string {
  if (id === "other") {
    const record = clarifierRecord(clarifiers);
    const custom = record && typeof record.other_app === "string" ? record.other_app.trim() : "";
    return custom || "Other";
  }
  return labelApp(id);
}

export function labelDevice(id: string | null | undefined): string {
  if (!id) return "—";
  return DEVICE_LABELS[id] ?? id.replaceAll("_", " ");
}

export function formatClarifiersDisplay(clarifiers: unknown): string {
  const record = clarifierRecord(clarifiers);
  if (!record) return "";
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(record)) {
    if (raw == null || raw === "") continue;
    if (key === "other_app") {
      parts.push(`Other app: ${String(raw).trim()}`);
      continue;
    }
    if (key === "note") {
      parts.push(String(raw).trim());
      continue;
    }
    const value = String(raw);
    const field = CLARIFIER_FIELDS[key] ?? key.replaceAll("_", " ");
    const pretty = CLARIFIER_VALUES[key]?.[value] ?? value.replaceAll("_", " ");
    parts.push(`${field}: ${pretty}`);
  }
  return parts.join(" · ");
}
