export type OpsUser = {
  id: string;
  username: string;
  display_name: string;
  role: "super_admin" | "admin" | "viewer";
  company: "norrsken" | "zuba" | "dct";
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
  report_count?: number;
};

export type IntegrationsPayload = {
  slack: {
    configured: boolean;
    mode: "off" | "socket" | "http";
    connected: boolean;
    error: string | null;
    connected_at: string | null;
    team_name: string | null;
    bot_name: string | null;
    alerts_channel: string | null;
    last_alert: { at: string; ok: boolean; error: string | null } | null;
  };
  reports: {
    slack_24h: number;
    metoo_24h: number;
    qr_24h: number;
    slack_7d: number;
    last_slack_at: string | null;
    last_qr_at: string | null;
  };
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
  occurred_at?: string | null;
  wifi_context: string;
  clarifiers?: Record<string, unknown>;
  device_class?: string | null;
  browser?: string | null;
  company?: string | null;
  user_type?: string | null;
  user_type_other?: string | null;
  contact_ok?: boolean;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  fill_ms?: number | null;
  weight: number;
  incident_id?: string | null;
  work_status?: "new" | "in_progress" | "waiting_vendor" | "resolved" | string | null;
  priority?: "normal" | "high" | "urgent" | string | null;
  ticket_no?: number | null;
  resolved_at?: string | null;
  assigned_to?: string | null;
  assignee_name?: string | null;
  assignee_company?: string | null;
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
  assignees: Array<{ id: string; display_name: string; company: string }>;
};

export type IncidentComment = {
  id: string;
  body: string;
  created_at: string;
  posted_to_slack: boolean;
  author_name?: string | null;
  author_company?: string | null;
};

export type ReportsPage = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  reports: ReportRow[];
  companies?: string[];
};

export type AnalyticsPayload = {
  filters?: { days: number; channel: string; zone_id: string | null };
  zones_options?: Array<{ id: string; label: string }>;
  kpi: DashboardPayload["kpi"];
  reports_per_day: Array<{ day: string; reports: number }>;
  apps: Array<{ app: string; n: number }>;
  symptoms: Array<{ symptom: string; n: number }>;
  wifi: Array<{ wifi_context: string; n: number }>;
  top_zones: Array<{ zone_id: string; label: string; report_count: number }>;
  companies?: Array<{ company: string; n: number }>;
  user_types?: Array<{ user_type: string; n: number }>;
  contact?: { with_contact: number; total: number };
  resolved_by_company?: Array<{ company: string; n: number; mttr_minutes: number | null }>;
  note?: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null && init.body !== "";
  const headers: HeadersInit = {
    ...(hasBody ? { "content-type": "application/json" } : {}),
    ...(init?.headers ?? {}),
  };
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
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
  updateMe: (body: { current_password: string; username?: string; password?: string }) =>
    api<{ user: OpsUser }>("/api/ops/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  dashboard: () => api<DashboardPayload>("/api/ops/dashboard"),
  reports: (
    page = 1,
    limit = 25,
    opts?: {
      assignment?: "all" | "assigned" | "unassigned" | "mine";
      zoneId?: string;
      company?: string;
      active?: boolean;
    },
  ) => {
    const sp = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (opts?.assignment && opts.assignment !== "all") sp.set("assignment", opts.assignment);
    if (opts?.zoneId) sp.set("zone_id", opts.zoneId);
    if (opts?.company) sp.set("company", opts.company);
    if (opts?.active === false) sp.set("active", "0");
    return api<ReportsPage>(`/api/ops/reports?${sp}`);
  },
  updateReportWork: (
    id: string,
    body: {
      assigned_to?: string | null;
      work_status?: "new" | "in_progress" | "waiting_vendor" | "resolved";
      priority?: "normal" | "high" | "urgent";
    },
  ) =>
    api<{
      report: {
        id: string;
        work_status: string;
        priority?: string;
        assigned_to: string | null;
        assignee_name: string | null;
        assignee_company: string | null;
      };
    }>(`/api/ops/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  bulkReports: (body: {
    ids: string[];
    assigned_to?: string | null;
    work_status?: "new" | "in_progress" | "waiting_vendor" | "resolved";
  }) =>
    api<{ reports: { id: string }[] }>("/api/ops/reports/bulk", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reportNotes: (id: string) =>
    api<{ notes: IncidentComment[] }>(`/api/ops/reports/${id}/notes`),
  addReportNote: (id: string, body: string, postToSlack: boolean) =>
    api<{ note: IncidentComment; slack_posted: boolean }>(`/api/ops/reports/${id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body, post_to_slack: postToSlack }),
    }),
  deleteReport: (id: string) =>
    api<{ ok: boolean; deleted: string }>(`/api/ops/reports/${id}`, { method: "DELETE" }),
  incidentAction: (id: string, action: "ack" | "investigating" | "resolved", postToSlack = false) =>
    api<{ incident: { id: string; status: string }; slack_posted?: boolean }>(`/api/ops/incidents/${id}`, {
      method: "POST",
      body: JSON.stringify({ action, post_to_slack: postToSlack }),
    }),
  incidentComments: (id: string) =>
    api<{ comments: IncidentComment[] }>(`/api/ops/incidents/${id}/comments`),
  addIncidentComment: (id: string, body: string, postToSlack: boolean) =>
    api<{ comment: IncidentComment; slack_posted: boolean }>(`/api/ops/incidents/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ body, post_to_slack: postToSlack }),
    }),
  assignIncident: (id: string, assignedTo: string | null, postToSlack: boolean) =>
    api<{
      incident: {
        id: string;
        assigned_to: string | null;
        assignee_name: string | null;
        assignee_company: string | null;
      };
      slack_posted: boolean;
    }>(`/api/ops/incidents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ assigned_to: assignedTo, post_to_slack: postToSlack }),
    }),
  analytics: (opts?: { days?: number; channel?: string; zone_id?: string | null }) => {
    const sp = new URLSearchParams();
    if (opts?.days) sp.set("days", String(opts.days));
    if (opts?.channel && opts.channel !== "all") sp.set("channel", opts.channel);
    if (opts?.zone_id) sp.set("zone_id", opts.zone_id);
    const q = sp.toString();
    return api<AnalyticsPayload>(`/api/ops/analytics${q ? `?${q}` : ""}`);
  },
  users: () => api<{ users: OpsUser[] }>("/api/ops/users"),
  createUser: (body: {
    username: string;
    display_name: string;
    password: string;
    role: "super_admin" | "admin" | "viewer";
    company: "norrsken" | "zuba" | "dct";
  }) =>
    api<{ user: OpsUser }>("/api/ops/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchUser: (
    id: string,
    body: {
      active?: boolean;
      password?: string;
      username?: string;
      company?: "norrsken" | "zuba" | "dct";
    },
  ) =>
    api<{ user: OpsUser }>(`/api/ops/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  zones: () => api<{ zones: OpsZone[] }>("/api/ops/zones"),
  createZone: (body: {
    id: string;
    label: string;
    floor?: string | null;
    kind: "area" | "booth" | "event" | "common" | "classroom";
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
      kind?: "area" | "booth" | "event" | "common" | "classroom";
      active?: boolean;
      sort?: number;
    },
  ) =>
    api<{ zone: OpsZone }>(`/api/ops/zones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteZone: (id: string) =>
    api<{ ok?: boolean; deleted?: string }>(`/api/ops/zones/${id}`, { method: "DELETE" }),
  zoneQr: (id: string) =>
    api<
      ZoneQr & {
        zone: { id: string; label: string; floor: string | null; kind: string };
      }
    >(`/api/ops/zones/${id}/qr`),
  integrations: () => api<IntegrationsPayload>("/api/ops/integrations"),
  reportQr: () =>
    api<
      ZoneQr & {
        zone: { id: string; label: string; floor: string | null; kind: string };
      }
    >("/api/ops/qr"),
};
