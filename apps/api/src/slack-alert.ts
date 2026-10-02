import type { Env } from "./env.js";
import { markAlertResult } from "./slack/status.js";
import { slackWorkspaces, type SlackWorkspace, type SlackWorkspaceId } from "./slack/workspaces.js";

/** One line for the house alerts channel. Phone and email stay on the dashboard. */
export function reportAlertText(input: {
  company?: string | null;
  contactOk?: boolean;
  contactName?: string | null;
  place?: string | null;
  symptom?: string | null;
}): string {
  const name = input.contactOk ? input.contactName?.trim() : "";
  const company = input.company?.trim() ?? "";
  const who = name || "Anonymous person";
  const line = company ? `${who} from ${company} just reported an issue.` : `${who} just reported an issue.`;
  const detail = [input.place?.trim(), input.symptom?.trim()].filter(Boolean).join(" · ");
  return detail ? `${line} ${detail}.` : line;
}

type SlackOk = { ok?: boolean; error?: string; ts?: string; channel?: string };

async function slackPost(
  token: string,
  body: Record<string, string>,
): Promise<SlackOk> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
  return (await res.json().catch(() => ({}))) as SlackOk;
}

async function postOne(
  space: SlackWorkspace,
  text: string,
): Promise<{ channel: string; ts: string } | null> {
  const channel = space.alertsChannel;
  if (!channel) return null;
  try {
    let data = await slackPost(space.botToken, { channel, text: `<!here> ${text}` });
    if (!data.ok && data.error === "restricted_action") {
      data = await slackPost(space.botToken, { channel, text });
    }
    if (!data.ok || !data.ts) {
      const error = data.error || "post_failed";
      markAlertResult(space.id, false, error);
      console.error("slack alert", space.id, error);
      return null;
    }
    markAlertResult(space.id, true, null);
    return { channel: data.channel || channel, ts: data.ts };
  } catch (err) {
    const error = err instanceof Error ? err.message : "post_failed";
    markAlertResult(space.id, false, error);
    console.error("slack alert", space.id, error);
    return null;
  }
}

export async function postReportAlert(
  env: Env,
  input: {
    company?: string | null;
    contactOk?: boolean;
    contactName?: string | null;
    place?: string | null;
    symptom?: string | null;
    url?: string | null;
  },
  workspaceId?: SlackWorkspaceId,
): Promise<{ channel: string; ts: string } | null> {
  const link = input.url?.trim();
  const text = link ? `${reportAlertText(input)}\n<${link}|Open in Ops>` : reportAlertText(input);
  const spaces = slackWorkspaces(env).filter((space) => space.alertsChannel);
  const targets = workspaceId ? spaces.filter((space) => space.id === workspaceId) : spaces;
  let stored: { channel: string; ts: string } | null = null;
  for (const space of targets) {
    const posted = await postOne(space, text);
    if (!posted) continue;
    if (!stored || space.id === "zuba") stored = posted;
  }
  return stored;
}

/** Reply on the alerts-channel thread. The text must not include phone or email. */
export async function postAlertsThread(
  env: Env,
  input: { text: string; channel?: string | null; threadTs?: string | null },
): Promise<boolean> {
  const spaces = slackWorkspaces(env);
  const channel = input.channel?.trim() || spaces.find((space) => space.alertsChannel)?.alertsChannel;
  if (!channel || !input.text.trim() || spaces.length === 0) return false;
  const ordered = [...spaces].sort((a, b) => {
    if (a.alertsChannel === channel) return -1;
    if (b.alertsChannel === channel) return 1;
    return 0;
  });
  for (const space of ordered) {
    const body: Record<string, string> = { channel, text: input.text.trim() };
    if (input.threadTs) body.thread_ts = input.threadTs;
    const data = await slackPost(space.botToken, body);
    if (data.ok) return true;
    console.error("slack thread", space.id, data.error || "post_failed");
  }
  return false;
}
