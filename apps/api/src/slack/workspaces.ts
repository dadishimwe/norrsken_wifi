import type { Env } from "../env.js";

export const SLACK_WORKSPACE_IDS = ["zuba", "norrsken"] as const;
export type SlackWorkspaceId = (typeof SLACK_WORKSPACE_IDS)[number];

export type SlackWorkspace = {
  id: SlackWorkspaceId;
  label: string;
  botToken: string;
  appToken?: string;
  signingSecret?: string;
  alertsChannel?: string;
};

function filled(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Zuba keeps the original SLACK_* names. Norrsken uses SLACK_NORRSKEN_*. */
export function slackWorkspaces(env: Env): SlackWorkspace[] {
  const spaces: SlackWorkspace[] = [];
  const zubaToken = filled(env.SLACK_BOT_TOKEN);
  if (zubaToken) {
    spaces.push({
      id: "zuba",
      label: "Zuba Broadband",
      botToken: zubaToken,
      appToken: filled(env.SLACK_APP_TOKEN),
      signingSecret: filled(env.SLACK_SIGNING_SECRET),
      alertsChannel: filled(env.SLACK_ALERTS_CHANNEL),
    });
  }
  const norrskenToken = filled(env.SLACK_NORRSKEN_BOT_TOKEN);
  if (norrskenToken) {
    spaces.push({
      id: "norrsken",
      label: "Norrsken",
      botToken: norrskenToken,
      appToken: filled(env.SLACK_NORRSKEN_APP_TOKEN),
      signingSecret: filled(env.SLACK_NORRSKEN_SIGNING_SECRET),
      alertsChannel: filled(env.SLACK_NORRSKEN_ALERTS_CHANNEL),
    });
  }
  return spaces;
}

export function slackWorkspaceLabel(id: SlackWorkspaceId): string {
  return id === "norrsken" ? "Norrsken" : "Zuba Broadband";
}
