import type { App } from "@slack/bolt";
import type { View } from "@slack/types";
import type { Pool } from "pg";
import {
  computeActorHash,
  getSession,
  listActiveZones,
  zoneHasOpenIncident,
} from "@norrsken/db";
import { APPS, SYMPTOMS, type App as AppId, type Symptom } from "@norrsken/shared";
import type { Env } from "../env.js";
import { HttpError, createReport } from "../reports-service.js";
import {
  nextClarifier,
  parseDraft,
  slackActorToken,
  symptomError,
  type SlackDraft,
} from "./flow.js";
import { loadSsids } from "./ssids.js";
import {
  appsView,
  clarifierView,
  detailsView,
  homeView,
  messageView,
  metooZoneView,
  reportButtonBlocks,
  symptomsView,
  thanksView,
  zoneView,
} from "./views.js";

type Values = Record<
  string,
  Record<
    string,
    {
      selected_option?: { value?: string } | null;
      selected_options?: { value?: string }[] | null;
    }
  >
>;

function one(values: Values, block: string, action: string): string {
  return values[block]?.[action]?.selected_option?.value ?? "";
}

function many(values: Values, block: string, action: string): string[] {
  return (values[block]?.[action]?.selected_options ?? [])
    .map((o) => o.value ?? "")
    .filter(Boolean);
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
  const ssids = loadSsids();

  async function openZone(client: { views: { open: (args: { trigger_id: string; view: View }) => Promise<unknown> } }, triggerId: string, userId: string) {
    const zones = await listActiveZones(db);
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
      view: zoneView(
        zones.map((z) => ({ id: z.id, label: z.label, floor: z.floor })),
        draft,
      ),
    });
  }

  bolt.command("/wifi", async ({ ack, command, client }) => {
    await ack();
    await openZone(client, command.trigger_id, command.user_id);
  });

  bolt.shortcut("wifi_report", async ({ ack, shortcut, client }) => {
    await ack();
    await openZone(client, shortcut.trigger_id, shortcut.user.id);
  });

  bolt.action("wifi_open", async ({ ack, body, client }) => {
    await ack();
    const triggerId = "trigger_id" in body ? body.trigger_id : "";
    const userId = "user" in body && body.user && "id" in body.user ? body.user.id : "";
    if (!triggerId || !userId) return;
    await openZone(client, triggerId, userId);
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

  bolt.view("wifi_zone", async ({ ack, view }) => {
    const draft = parseDraft(view.private_metadata);
    const zoneId = one(view.state.values as Values, "zone", "zone_id");
    if (!zoneId) {
      await ack({ response_action: "errors", errors: { zone: "Pick a place." } });
      return;
    }
    if (draft.zone_id !== zoneId) draft.zone_source = "selected";
    draft.zone_id = zoneId;
    await ack({ response_action: "update", view: symptomsView(draft) });
  });

  bolt.view("wifi_symptoms", async ({ ack, view }) => {
    const draft = parseDraft(view.private_metadata);
    const picked = many(view.state.values as Values, "symptoms", "symptom_ids");
    const err = symptomError(picked);
    if (err) {
      await ack({ response_action: "errors", errors: { symptoms: err } });
      return;
    }
    draft.symptoms = picked.filter((s): s is Symptom =>
      (SYMPTOMS as readonly string[]).includes(s),
    );
    const hasIncident = await zoneHasOpenIncident(db, draft.zone_id);
    const clarifier = nextClarifier(draft, hasIncident, ssids);
    if (clarifier) {
      await ack({ response_action: "update", view: clarifierView(draft, clarifier) });
      return;
    }
    await ack({ response_action: "update", view: appsView(draft) });
  });

  bolt.view("wifi_clarifier", async ({ ack, view }) => {
    const draft = parseDraft(view.private_metadata);
    const block = view.state.values.clarifier;
    const actionId = block ? Object.keys(block)[0] : "";
    const value = actionId ? one(view.state.values as Values, "clarifier", actionId) : "";
    if (actionId && value && actionId !== "wifi_context") {
      draft.clarifiers = { ...draft.clarifiers, [actionId]: value };
    }
    const hasIncident = await zoneHasOpenIncident(db, draft.zone_id);
    const again = nextClarifier(draft, hasIncident, ssids);
    if (again) {
      await ack({ response_action: "update", view: clarifierView(draft, again) });
      return;
    }
    await ack({ response_action: "update", view: appsView(draft) });
  });

  bolt.view("wifi_apps", async ({ ack, view }) => {
    const draft = parseDraft(view.private_metadata);
    draft.apps = many(view.state.values as Values, "apps", "app_ids")
      .filter((id): id is AppId => (APPS as readonly string[]).includes(id))
      .slice(0, 5);
    await ack({ response_action: "update", view: detailsView(draft, ssids) });
  });

  bolt.view("wifi_details", async ({ ack, view, body }) => {
    const draft = parseDraft(view.private_metadata);
    const values = view.state.values as Values;
    const when = one(values, "when", "when_bucket");
    const device = one(values, "device", "device_class");
    const wifi = one(values, "wifi", "wifi_context");
    if (when === "now" || when === "recent" || when === "earlier") draft.when_bucket = when;
    if (
      device === "iphone" ||
      device === "android" ||
      device === "windows" ||
      device === "mac" ||
      device === "linux" ||
      device === "unknown"
    ) {
      draft.device_class = device;
    }
    if (wifi) draft.wifi_context = wifi;
    const userId = body.user.id;
    try {
      const saved = await submitDraft(db, env, draft, userId, "slack");
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
      const saved = await submitDraft(db, env, draft, body.user.id, "slack_metoo");
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
) {
  return createReport(
    db,
    env,
    {
      zone_id: draft.zone_id,
      zone_source: draft.zone_source,
      channel,
      symptoms: draft.symptoms,
      apps: draft.apps,
      when_bucket: draft.when_bucket,
      wifi_context: draft.wifi_context,
      clarifiers: draft.clarifiers,
      device_class: draft.device_class,
      session_token: slackActorToken(slackUserId),
    },
    undefined,
  );
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
