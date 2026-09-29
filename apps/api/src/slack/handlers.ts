import type { App } from "@slack/bolt";
import type { View } from "@slack/types";
import type { Pool } from "pg";
import {
  computeActorHash,
  getSession,
  listActiveZones,
} from "@norrsken/db";
import { APPS, SYMPTOMS, UNIVERSAL_ZONE_ID, type App as AppId, type Symptom } from "@norrsken/shared";
import type { Env } from "../env.js";
import { HttpError, createReport } from "../reports-service.js";
import {
  parseDraft,
  slackActorToken,
  symptomError,
  type SlackDraft,
} from "./flow.js";
import {
  homeView,
  messageView,
  metooZoneView,
  reportButtonBlocks,
  reportFormView,
  thanksView,
} from "./views.js";

type SlackField = {
  selected_option?: { value?: string } | null;
  selected_options?: { value?: string }[] | null;
  selected_date?: string | null;
  selected_time?: string | null;
  value?: string | null;
};

type Values = Record<string, Record<string, SlackField>>;

function one(values: Values, block: string, action: string): string {
  return values[block]?.[action]?.selected_option?.value ?? "";
}

function many(values: Values, block: string, action: string): string[] {
  return (values[block]?.[action]?.selected_options ?? [])
    .map((o) => o.value ?? "")
    .filter(Boolean);
}

function text(values: Values, block: string, action: string): string {
  return values[block]?.[action]?.value?.trim() ?? "";
}

function dateValue(values: Values, block: string, action: string): string {
  return values[block]?.[action]?.selected_date ?? "";
}

function timeValue(values: Values, block: string, action: string): string {
  return values[block]?.[action]?.selected_time ?? "";
}

/** Slack date and time have no timezone. Treat a partial pick as Kigali local time. */
function occurredAtFromPick(date: string, time: string): string | undefined {
  if (!date && !time) return undefined;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const day = date || `${parts.year}-${parts.month}-${parts.day}`;
  const clock = time || `${parts.hour}:${parts.minute}`;
  const parsed = new Date(`${day}T${clock}:00+02:00`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  if (parsed.getTime() > Date.now()) return new Date().toISOString();
  return parsed.toISOString();
}

function friendly(err: unknown): string {
  const msg = err instanceof HttpError ? err.message : "";
  if (msg === "rate_limited_zone") {
    return "You already sent a report for this area a moment ago. Thanks — no need to send another.";
  }
  if (msg === "rate_limited_day") {
    return "You've reached today's report limit. Thanks for helping.";
  }
  return "Could not save that report. Try again in a moment.";
}

export function registerSlackHandlers(bolt: App, db: Pool, env: Env) {
  async function openReport(client: { views: { open: (args: { trigger_id: string; view: View }) => Promise<unknown> } }, triggerId: string, userId: string) {
    const zones = (await listActiveZones(db))
      .filter((z) => z.id !== UNIVERSAL_ZONE_ID)
      .map((z) => ({ id: z.id, label: z.label, floor: z.floor }));
    const draft = parseDraft(null);
    if (env.SLACK_REMEMBER_LAST_ZONE) {
      const hash = await computeActorHash(db, slackActorToken(userId));
      const session = await getSession(db, hash);
      if (session?.last_zone_id && zones.some((z) => z.id === session.last_zone_id)) {
        draft.zone_id = session.last_zone_id;
        draft.zone_source = "remembered";
      }
    }
    await client.views.open({
      trigger_id: triggerId,
      view: reportFormView(zones, draft),
    });
  }

  bolt.command("/wifi", async ({ ack, command, client }) => {
    await ack();
    await openReport(client, command.trigger_id, command.user_id);
  });

  bolt.shortcut("wifi_report", async ({ ack, shortcut, client }) => {
    await ack();
    await openReport(client, shortcut.trigger_id, shortcut.user.id);
  });

  bolt.action("wifi_open", async ({ ack, body, client }) => {
    await ack();
    const triggerId = "trigger_id" in body ? body.trigger_id : "";
    const userId = "user" in body && body.user && "id" in body.user ? body.user.id : "";
    if (!triggerId || !userId) return;
    await openReport(client, triggerId, userId);
  });

  bolt.action("metoo_open", async ({ ack, body, client, action }) => {
    await ack();
    const triggerId = "trigger_id" in body ? body.trigger_id : "";
    const incidentId = "value" in action ? action.value : "";
    if (!triggerId || !incidentId) return;
    const { rows } = await db.query<{ zones: string[]; symptoms: string[] }>(
      `select zones, symptoms from incident where id = $1 and status in ('open','investigating')`,
      [incidentId],
    );
    const incident = rows[0];
    if (!incident) return;
    const all = await listActiveZones(db);
    const zones = all
      .filter((z) => incident.zones.includes(z.id))
      .map((z) => ({ id: z.id, label: z.label, floor: z.floor }));
    const symptoms = incident.symptoms.filter((s): s is Symptom =>
      (SYMPTOMS as readonly string[]).includes(s),
    );
    if (zones.length === 0) return;
    await client.views.open({
      trigger_id: triggerId,
      view: metooZoneView(incidentId, zones, symptoms.length ? symptoms : ["no_internet"]),
    });
  });

  bolt.view("wifi_report_form", async ({ ack, view, body }) => {
    const draft = parseDraft(view.private_metadata);
    const values = view.state.values as Values;
    const zoneId = one(values, "zone", "zone_id");
    const picked = many(values, "symptoms", "symptom_ids");
    const symptomErr = symptomError(picked);
    const errors: Record<string, string> = {};
    if (symptomErr) errors.symptoms = symptomErr;
    if (!zoneId) errors.zone = "Pick a place.";
    if (Object.keys(errors).length > 0) {
      await ack({ response_action: "errors", errors });
      return;
    }
    if (draft.zone_id !== zoneId) draft.zone_source = "selected";
    draft.zone_id = zoneId;
    draft.symptoms = picked.filter((s): s is Symptom =>
      (SYMPTOMS as readonly string[]).includes(s),
    );
    const when = one(values, "when", "when_bucket");
    if (when === "now" || when === "recent" || when === "earlier") draft.when_bucket = when;
    let apps = many(values, "apps", "app_ids")
      .filter((id): id is AppId => (APPS as readonly string[]).includes(id))
      .slice(0, 5);
    const otherApp = text(values, "other_app", "other_app").slice(0, 80);
    if (otherApp) {
      const withOther: AppId[] = [...apps.filter((id) => id !== "other"), "other"];
      apps = withOther.slice(-5);
    }
    draft.apps = apps;
    const note = text(values, "note", "note").slice(0, 400);
    draft.clarifiers = {
      ...(otherApp ? { other_app: otherApp } : {}),
      ...(note ? { note } : {}),
    };
    draft.device_class = "unknown";
    draft.wifi_context = "unknown";
    const occurredAt = occurredAtFromPick(
      dateValue(values, "occurred_date", "date"),
      timeValue(values, "occurred_time", "time"),
    );
    try {
      const saved = await submitDraft(db, env, draft, body.user.id, "slack", occurredAt);
      await ack({ response_action: "update", view: thanksView(saved.recent_count) });
    } catch (err) {
      await ack({
        response_action: "update",
        view: messageView("Couldn’t save", friendly(err)),
      });
    }
  });

  bolt.view("wifi_metoo", async ({ ack, view, body }) => {
    const draft = parseDraft(view.private_metadata);
    const zoneId = one(view.state.values as Values, "zone", "zone_id");
    if (!zoneId) {
      await ack({ response_action: "errors", errors: { zone: "Pick a place." } });
      return;
    }
    draft.zone_id = zoneId;
    draft.zone_source = "selected";
    if (draft.symptoms.length === 0) draft.symptoms = ["no_internet"];
    try {
      const saved = await submitDraft(db, env, draft, body.user.id, "slack_metoo", undefined, draft.incident_id);
      await ack({ response_action: "update", view: thanksView(saved.recent_count) });
    } catch (err) {
      await ack({
        response_action: "update",
        view: messageView("Couldn’t save", friendly(err)),
      });
    }
  });

  bolt.event("app_home_opened", async ({ event, client }) => {
    const status = await networkStatus(db);
    const incidents = await openIncidentLabels(db);
    await client.views.publish({
      user_id: event.user,
      view: homeView({ status, incidents }),
    });
  });

  bolt.message(async ({ message, say }) => {
    if (message.subtype) return;
    if (!("channel_type" in message) || message.channel_type !== "im") return;
    await say({ text: "Please tap a button.", blocks: reportButtonBlocks() });
  });
}

async function submitDraft(
  db: Pool,
  env: Env,
  draft: SlackDraft,
  slackUserId: string,
  channel: "slack" | "slack_metoo",
  occurredAt?: string,
  attachIncidentId?: string,
) {
  const saved = await createReport(
    db,
    env,
    {
      zone_id: draft.zone_id,
      zone_source: draft.zone_source,
      channel,
      symptoms: draft.symptoms,
      apps: draft.apps,
      when_bucket: draft.when_bucket,
      ...(occurredAt ? { occurred_at: occurredAt } : {}),
      wifi_context: draft.wifi_context,
      clarifiers: draft.clarifiers,
      device_class: draft.device_class,
      session_token: slackActorToken(slackUserId),
    },
    undefined,
  );
  if (attachIncidentId) {
    await db.query(
      `
      update report
      set incident_id = $1
      where id = $2
        and incident_id is null
        and exists (
          select 1 from incident
          where id = $1 and status in ('open','investigating')
        )
      `,
      [attachIncidentId, saved.report_id],
    );
  }
  return saved;
}

async function networkStatus(db: Pool): Promise<string> {
  const { rows } = await db.query<{ n: string }>(
    `select count(*)::text as n from report where created_at > now() - interval '15 minutes'`,
  );
  const n = Number(rows[0]?.n ?? 0);
  if (n >= 3) return "Several people reported trouble in the last 15 minutes.";
  if (n > 0) return "A few recent reports. Tap below if you’re affected.";
  return "All quiet right now.";
}

async function openIncidentLabels(db: Pool): Promise<{ id: string; label: string }[]> {
  const { rows } = await db.query<{ id: string; zones: string[] }>(
    `select id, zones from incident where status in ('open','investigating') order by opened_at desc limit 3`,
  );
  return rows.map((r) => ({
    id: r.id,
    label: r.zones.length ? r.zones.join(", ") : "Campus",
  }));
}
