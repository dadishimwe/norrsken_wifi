export const SYMPTOMS = [
  "cant_connect",
  "no_internet",
  "wifi_drops",
  "call_choppy",
  "call_disconnects",
  "slow",
] as const;
export type Symptom = (typeof SYMPTOMS)[number];

export const APPS = [
  "zoom",
  "teams",
  "meet",
  "slack",
  "web",
  "cloud_vpn",
  "other",
] as const;
export type App = (typeof APPS)[number];

export const WHEN_BUCKETS = ["now", "recent", "earlier"] as const;
export type WhenBucket = (typeof WHEN_BUCKETS)[number];

export const CHANNELS = ["qr", "slack", "slack_metoo"] as const;
export type Channel = (typeof CHANNELS)[number];

export const ZONE_SOURCES = ["qr", "selected", "remembered", "override"] as const;
export type ZoneSource = (typeof ZONE_SOURCES)[number];

export const DEVICE_CLASSES = ["mobile", "desktop", "unknown"] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

export const ZONE_KINDS = ["area", "booth", "event", "common"] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

export const INCIDENT_STATUSES = ["open", "investigating", "resolved"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_SCOPES = ["zone", "multi_zone", "campus"] as const;
export type IncidentScope = (typeof INCIDENT_SCOPES)[number];

/** Built-in wifi_context values; SSIDs from config/ssids.json are also allowed. */
export const WIFI_CONTEXT_BUILTIN = ["wired", "unknown"] as const;

export const SYMPTOM_LABELS: Record<Symptom, string> = {
  cant_connect: "Couldn't connect",
  no_internet: "Connected but nothing loads",
  wifi_drops: "Wi-Fi keeps dropping",
  call_choppy: "Call choppy/laggy",
  call_disconnects: "Kept disconnecting from call",
  slow: "Slow (pages/uploads)",
};

export const APP_LABELS: Record<App, string> = {
  zoom: "Zoom",
  teams: "Teams",
  meet: "Google Meet",
  slack: "Slack/Huddle",
  web: "Web/browsing",
  cloud_vpn: "Cloud/VPN/file transfer",
  other: "Other",
};

export const WHEN_LABELS: Record<WhenBucket, string> = {
  now: "Happening now",
  recent: "Just ended (<15 min)",
  earlier: "Earlier today",
};
