import type { Env } from "./env.js";
import { markAlertResult } from "./slack/status.js";

/** One line for the house alerts channel. Phone and email stay on the dashboard. */
export function reportAlertText(input: {
  company?: string | null;
  contactOk?: boolean;
  contactName?: string | null;
}): string {
  const name = input.contactOk ? input.contactName?.trim() : "";
  const company = input.company?.trim() ?? "";
  const who = name || "Anonymous person";
  if (company) return `${who} from ${company} just reported an issue.`;
  return `${who} just reported an issue.`;
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

export async function postReportAlert(
  env: Env,
  input: { company?: string | null; contactOk?: boolean; contactName?: string | null },
): Promise<{ channel: string; ts: string } | null> {
  const token = env.SLACK_BOT_TOKEN;
  const channel = env.SLACK_ALERTS_CHANNEL?.trim();
  if (!token || !channel) return null;
  const data = await slackPost(token, { channel, text: reportAlertText(input) });
  if (!data.ok || !data.ts) {
    const error = data.error || "post_failed";
    markAlertResult(false, error);
    console.error("slack alert", error);
    return null;
  }
  markAlertResult(true, null);
  return { channel: data.channel || channel, ts: data.ts };
}

/** Reply on the alerts-channel thread. The text must not include phone or email. */
export async function postAlertsThread(
  env: Env,
  input: { text: string; channel?: string | null; threadTs?: string | null },
): Promise<boolean> {
  const token = env.SLACK_BOT_TOKEN;
  const channel = input.channel?.trim() || env.SLACK_ALERTS_CHANNEL?.trim();
  if (!token || !channel || !input.text.trim()) return false;
  const body: Record<string, string> = { channel, text: input.text.trim() };
  if (input.threadTs) body.thread_ts = input.threadTs;
  const data = await slackPost(token, body);
  if (!data.ok) {
    console.error("slack thread", data.error || "post_failed");
    return false;
  }
  return true;
}
