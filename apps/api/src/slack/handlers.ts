import type { App } from "@slack/bolt";
import type { View } from "@slack/types";
import type { Pool } from "pg";
import { computeActorHash } from "@norrsken/db";
import { APPS, SYMPTOMS, UNIVERSAL_ZONE_ID, USER_TYPES, type App as AppId, type Symptom, type UserType } from "@norrsken/shared";
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
    return "You already sent a report a moment ago. Thanks — no need to send another.";
  }
  if (msg === "rate_limited_day") {
    return "You've reached today's report limit. Thanks for helping.";
  }
  return "Could not save that report. Try again in a moment.";
}

function checked(values: Values, block: string, action: string): boolean {
  return (values[block]?.[action]?.selected_options ?? []).some((o) => o.value === "yes");
}

function validEmail(value: string): boolean {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUserType(value: string): value is UserType {
  return (USER_TYPES as readonly string[]).includes(value);
}

function draftFromValues(view: { private_metadata?: string; state?: { values?: Values } }): SlackDraft {
  const draft = parseDraft(view.private_metadata);
  const values = (view.state?.values ?? {}) as Values;
  draft.symptoms = many(values, "symptoms", "symptom_ids")
    .filter((s): s is Symptom => (SYMPTOMS as readonly string[]).includes(s))
    .slice(0, 3);
  const when = one(values, "when", "when_bucket");
  if (when === "now" || when === "recent" || when === "earlier") draft.when_bucket = when;
  draft.occurred_date = dateValue(values, "occurred_date", "date");
  draft.occurred_time = timeValue(values, "occurred_time", "time");
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
  draft.company = text(values, "company", "company").slice(0, 120);
  const role = one(values, "user_type", "user_type");
  draft.user_type = isUserType(role) ? role : "";
  draft.user_type_other =
    draft.user_type === "other" ? text(values, "user_type_other", "user_type_other").slice(0, 80) : "";
  draft.contact_ok = checked(values, "contact_ok", "contact_ok");
  draft.contact_name = draft.contact_ok ? text(values, "contact_name", "name").slice(0, 80) : "";
  draft.contact_phone = draft.contact_ok ? text(values, "contact_phone", "phone").slice(0, 40) : "";
  draft.contact_email = draft.contact_ok ? text(values, "contact_email", "email").slice(0, 120) : "";
  draft.zone_id = UNIVERSAL_ZONE_ID;
  draft.zone_source = "selected";
  draft.device_class = "unknown";
  draft.wifi_context = "unknown";
  return draft;
}

export function registerSlackHandlers(bolt: App, db: Pool, env: Env) {
  async function openReport(client: { views: { open: (args: { trigger_id: string; view: View }) => Promise<unknown> } }, triggerId: string, userId: string) {
    const draft = parseDraft(null);
    draft.zone_id = UNIVERSAL_ZONE_ID;
    if (env.SLACK_REMEMBER_LAST_ZONE) {
      const hash = await computeActorHash(db, slackActorToken(userId));
      const { rows } = await db.query<{ company: string }>(
        `
        select company from report
        where actor_hash = $1 and company is not null and length(trim(company)) > 0
        order by created_at desc
        limit 1
        `,
        [hash],
      );
      const company = rows[0]?.company?.trim();
      if (company) {
        draft.company = company;
        draft.zone_source = "remembered";
      }
    }
    await client.views.open({
      trigger_id: triggerId,
      view: reportFormView(draft),
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
    const symptoms = incident.symptoms.filter((s): s is Symptom =>
      (SYMPTOMS as readonly string[]).includes(s),
    );
    await client.views.open({
      trigger_id: triggerId,
      view: metooZoneView(incidentId, symptoms.length ? symptoms : ["no_internet"]),
    });
  });

  bolt.action("user_type", async ({ ack, body, client }) => {
    await ack();
    if (!("view" in body) || !body.view) return;
    if (body.view.callback_id === "wifi_metoo") {
      const draft = parseDraft(body.view.private_metadata);
      const values = (body.view.state?.values ?? {}) as Values;
      const role = one(values, "user_type", "user_type");
      draft.user_type = isUserType(role) ? role : "";
      draft.user_type_other =
        draft.user_type === "other" ? text(values, "user_type_other", "user_type_other").slice(0, 80) : "";
      draft.company = text(values, "company", "company").slice(0, 120);
      await client.views.update({
        view_id: body.view.id,
        hash: body.view.hash,
        view: metooZoneView(draft.incident_id ?? "", draft.symptoms, draft),
      });
      return;
    }
    const draft = draftFromValues(body.view);
    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view: reportFormView(draft),
    });
  });

  bolt.action("contact_ok", async ({ ack, body, client }) => {
    await ack();
    if (!("view" in body) || !body.view) return;
    const draft = draftFromValues(body.view);
    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view: reportFormView(draft),
    });
  });

  bolt.view("wifi_report_form", async ({ ack, view, body }) => {
    const draft = draftFromValues(view);
    const symptomErr = symptomError(draft.symptoms);
    const errors: Record<string, string> = {};
    if (symptomErr) errors.symptoms = symptomErr;
    if (!draft.user_type) errors.user_type = "Tell us who you are.";
    if (draft.user_type === "other" && !draft.user_type_other.trim()) {
      errors.user_type_other = "Please say who you are.";
    }
    if (!draft.company.trim()) errors.company = "Tell us the company or place.";
    if (!validEmail(draft.contact_email)) errors.contact_email = "Enter a valid email.";
    if (Object.keys(errors).length > 0) {
      await ack({ response_action: "errors", errors });
      return;
    }
    const occurredAt = occurredAtFromPick(draft.occurred_date, draft.occurred_time);
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
    const values = view.state.values as Values;
    const company = text(values, "company", "company").slice(0, 120);
    const role = one(values, "user_type", "user_type");
    const userType = isUserType(role) ? role : "";
    const userTypeOther = userType === "other" ? text(values, "user_type_other", "user_type_other").slice(0, 80) : "";
    const errors: Record<string, string> = {};
    if (!userType) errors.user_type = "Tell us who you are.";
    if (userType === "other" && !userTypeOther) errors.user_type_other = "Please say who you are.";
    if (!company) errors.company = "Tell us the company or place.";
    if (Object.keys(errors).length > 0) {
      await ack({ response_action: "errors", errors });
      return;
    }
    draft.company = company;
    draft.user_type = userType;
    draft.user_type_other = userTypeOther;
    draft.zone_id = UNIVERSAL_ZONE_ID;
    draft.zone_source = "selected";
    draft.contact_ok = false;
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
  if (!draft.user_type) throw new HttpError(400, "Tell us who you are.");
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
      company: draft.company,
      user_type: draft.user_type,
      ...(draft.user_type === "other" ? { user_type_other: draft.user_type_other } : {}),
      contact_ok: draft.contact_ok,
      ...(draft.contact_name ? { contact_name: draft.contact_name } : {}),
      ...(draft.contact_phone ? { contact_phone: draft.contact_phone } : {}),
      ...(draft.contact_email ? { contact_email: draft.contact_email } : {}),
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
