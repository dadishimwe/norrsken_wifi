import type { Env } from "./env.js";

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

export async function postReportAlert(
  env: Env,
  input: { company?: string | null; contactOk?: boolean; contactName?: string | null },
): Promise<void> {
  const token = env.SLACK_BOT_TOKEN;
  const channel = env.SLACK_ALERTS_CHANNEL?.trim();
  if (!token || !channel) return;
  const text = reportAlertText(input);
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text }),
    signal: AbortSignal.timeout(4000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!data.ok) {
    console.error("slack alert", data.error || res.status);
  }
}
