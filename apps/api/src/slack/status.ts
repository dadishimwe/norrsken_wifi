import { SLACK_WORKSPACE_IDS, type SlackWorkspaceId } from "./workspaces.js";

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

function blankStatus(): SlackLiveStatus {
  return {
    mode: "off",
    connected: false,
    error: null,
    connectedAt: null,
    teamName: null,
    botName: null,
    lastAlert: null,
  };
}

const states = new Map<SlackWorkspaceId, SlackLiveStatus>(
  SLACK_WORKSPACE_IDS.map((id) => [id, blankStatus()]),
);

function copyStatus(state: SlackLiveStatus): SlackLiveStatus {
  return {
    ...state,
    lastAlert: state.lastAlert ? { ...state.lastAlert } : null,
  };
}

export function slackLiveStatus(id: SlackWorkspaceId = "zuba"): SlackLiveStatus {
  return copyStatus(states.get(id) ?? blankStatus());
}

export function markSlackOff(id: SlackWorkspaceId): void {
  const state = states.get(id) ?? blankStatus();
  state.mode = "off";
  state.connected = false;
  state.error = null;
  state.connectedAt = null;
  state.teamName = null;
  state.botName = null;
  states.set(id, state);
}

export function markSlackFailed(id: SlackWorkspaceId, mode: "socket" | "http", error: string): void {
  const state = states.get(id) ?? blankStatus();
  state.mode = mode;
  state.connected = false;
  state.error = safeSlackError(error);
  state.connectedAt = null;
  states.set(id, state);
}

export function markSlackConnected(
  id: SlackWorkspaceId,
  mode: "socket" | "http",
  identity?: { teamName?: string | null; botName?: string | null },
): void {
  const state = states.get(id) ?? blankStatus();
  state.mode = mode;
  state.connected = true;
  state.error = null;
  state.connectedAt = new Date().toISOString();
  state.teamName = identity?.teamName ?? null;
  state.botName = identity?.botName ?? null;
  states.set(id, state);
}

export function markAlertResult(id: SlackWorkspaceId, ok: boolean, error: string | null): void {
  const state = states.get(id) ?? blankStatus();
  state.lastAlert = {
    at: new Date().toISOString(),
    ok,
    error: error ? safeSlackError(error) : null,
  };
  states.set(id, state);
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
