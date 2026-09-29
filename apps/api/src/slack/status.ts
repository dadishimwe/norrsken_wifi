export type SlackAlertResult = {
  at: string;
  ok: boolean;
  error: string | null;
};

export type SlackLiveStatus = {
  mode: "off" | "socket" | "http";
  connected: boolean;
  error: string | null;
  connectedAt: string | null;
  teamName: string | null;
  botName: string | null;
  lastAlert: SlackAlertResult | null;
};

const state: SlackLiveStatus = {
  mode: "off",
  connected: false,
  error: null,
  connectedAt: null,
  teamName: null,
  botName: null,
  lastAlert: null,
};

export function slackLiveStatus(): SlackLiveStatus {
  return {
    ...state,
    lastAlert: state.lastAlert ? { ...state.lastAlert } : null,
  };
}

export function markSlackOff(): void {
  state.mode = "off";
  state.connected = false;
  state.error = null;
  state.connectedAt = null;
  state.teamName = null;
  state.botName = null;
}

export function markSlackFailed(mode: "socket" | "http", error: string): void {
  state.mode = mode;
  state.connected = false;
  state.error = safeSlackError(error);
  state.connectedAt = null;
}

export function markSlackConnected(
  mode: "socket" | "http",
  identity?: { teamName?: string | null; botName?: string | null },
): void {
  state.mode = mode;
  state.connected = true;
  state.error = null;
  state.connectedAt = new Date().toISOString();
  state.teamName = identity?.teamName ?? null;
  state.botName = identity?.botName ?? null;
}

export function markAlertResult(ok: boolean, error: string | null): void {
  state.lastAlert = {
    at: new Date().toISOString(),
    ok,
    error: error ? safeSlackError(error) : null,
  };
}

export function safeSlackError(error: string): string {
  if (/token|secret|xox|xapp/i.test(error)) return "connect_failed";
  return error.slice(0, 80);
}

export async function slackIdentity(token: string): Promise<{ teamName: string | null; botName: string | null }> {
  const res = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(4000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; team?: string; user?: string };
  if (!data.ok) return { teamName: null, botName: null };
  return { teamName: data.team ?? null, botName: data.user ?? null };
}
