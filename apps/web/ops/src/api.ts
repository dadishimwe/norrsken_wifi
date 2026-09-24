export type OpsUser = {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "viewer";
  active?: boolean;
  created_at?: string;
  last_login_at?: string | null;
};

export type OpsZone = {
  id: string;
  label: string;
  floor: string | null;
  kind: string;
  active: boolean;
  sort: number;
};

export type ZoneQr = {
  token: string;
  url: string;
  png_data_url: string;
  kid: string;
};

export type ReportRow = {
  id: string;
  created_at: string;
  channel: string;
  zone_id: string;
  zone_label: string;
  zone_source?: string;
  symptoms: string[];
  apps: string[];
  when_bucket: string;
  wifi_context: string;
  clarifiers?: Record<string, unknown>;
  device_class?: string | null;
  fill_ms?: number | null;
  weight: number;
  incident_id?: string | null;
};

export type DashboardPayload = {
  kpi: {
    day: string;
    reports_today: string | number;
    open_incidents: string | number;
    incidents_opened_today: string | number;
    mtta_minutes_30d: string | number | null;
    mttr_minutes_30d: string | number | null;
  } | null;
  zones: Array<{
    zone_id: string;
    label: string;
    floor: string | null;
    kind: string;
    reports_24h: string | number;
    reports_1h: string | number;
    has_open_incident: boolean;
  }>;
  reports: ReportRow[];
  incidents: Array<{
    id: string;
    opened_at: string;
    status: string;
    scope: string;
    zones: string[];
    symptoms: string[];
    apps: string[];
    suspected_domain: string | null;
    report_count: string | number;
  }>;
};

export type ReportsPage = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  reports: ReportRow[];
};

export type AnalyticsPayload = {
  kpi: DashboardPayload["kpi"];
  reports_per_day: Array<{ day: string; reports: number }>;
  apps: Array<{ app: string; n: number }>;
  symptoms: Array<{ symptom: string; n: number }>;
  wifi: Array<{ wifi_context: string; n: number }>;
  top_zones: Array<{ zone_id: string; label: string; report_count: number }>;
  note?: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (res.headers.get("content-type")?.includes("text/csv")) {
    throw new Error("use downloadCsv for csv endpoints");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `request_failed_${res.status}`);
  }
  return data;
}

export async function downloadCsv(path: string, filename: string) {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error("export_failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const opsApi = {
  me: () => api<{ user: OpsUser }>("/api/ops/me"),
  login: (username: string, password: string) =>
    api<{ user: OpsUser }>("/api/ops/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => api<{ ok: boolean }>("/api/ops/logout", { method: "POST" }),
  dashboard: () => api<DashboardPayload>("/api/ops/dashboard"),
  reports: (page = 1, limit = 25) =>
    api<ReportsPage>(`/api/ops/reports?page=${page}&limit=${limit}`),
  analytics: () => api<AnalyticsPayload>("/api/ops/analytics"),
  users: () => api<{ users: OpsUser[] }>("/api/ops/users"),
  createUser: (body: {
    username: string;
    display_name: string;
    password: string;
    role: "admin" | "viewer";
  }) =>
    api<{ user: OpsUser }>("/api/ops/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchUser: (id: string, body: { active?: boolean; password?: string }) =>
    api<{ user: OpsUser }>(`/api/ops/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  zones: () => api<{ zones: OpsZone[] }>("/api/ops/zones"),
  createZone: (body: {
    id: string;
    label: string;
    floor?: string | null;
    kind: "area" | "booth" | "event" | "common";
    sort?: number;
  }) =>
    api<{ zone: OpsZone }>("/api/ops/zones", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchZone: (
    id: string,
    body: {
      label?: string;
      floor?: string | null;
      kind?: "area" | "booth" | "event" | "common";
      active?: boolean;
      sort?: number;
    },
  ) =>
    api<{ zone: OpsZone }>(`/api/ops/zones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteZone: (id: string, force = false) =>
    api<{ ok?: boolean; deleted?: string; disabled?: boolean; message?: string }>(
      `/api/ops/zones/${id}${force ? "?force=1" : ""}`,
      { method: "DELETE" },
    ),
  zoneQr: (id: string) =>
    api<ZoneQr & { zone: { id: string; label: string } }>(`/api/ops/zones/${id}/qr`),
};
