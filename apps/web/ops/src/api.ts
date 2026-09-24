export type OpsUser = {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "viewer";
  active?: boolean;
  created_at?: string;
  last_login_at?: string | null;
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
  reports: Array<{
    id: string;
    created_at: string;
    channel: string;
    zone_id: string;
    zone_label: string;
    symptoms: string[];
    apps: string[];
    when_bucket: string;
    wifi_context: string;
    weight: number;
  }>;
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `request_failed_${res.status}`);
  }
  return data;
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
};
