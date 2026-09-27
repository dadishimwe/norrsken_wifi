import type { KnownBlock, View } from "@slack/types";
import {
  APP_LABELS,
  APPS,
  DEVICE_LABELS,
  DEVICE_OPTIONS,
  SYMPTOM_LABELS,
  SYMPTOMS,
  WHEN_BUCKETS,
  WHEN_LABELS,
  type ClarifierDef,
} from "@norrsken/shared";
import { emptyDraft, encodeDraft, type SlackDraft, type ZoneChoice } from "./flow.js";

function plain(text: string) {
  return { type: "plain_text" as const, text: text.slice(0, 75), emoji: true };
}

function modal(callbackId: string, title: string, draft: SlackDraft, blocks: KnownBlock[], submit = "Next"): View {
  return {
    type: "modal",
    callback_id: callbackId,
    private_metadata: encodeDraft(draft),
    title: plain(title.slice(0, 24)),
    submit: plain(submit),
    close: plain("Cancel"),
    blocks,
  };
}

export function reportButtonBlocks(): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Please tap a button — we don't read typed messages.",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "wifi_open",
          text: plain("Report a problem"),
          style: "primary",
        },
      ],
    },
  ];
}

export function homeView(opts: {
  status: string;
  incidents: { id: string; label: string }[];
}): View {
  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: plain("Network status"),
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: opts.status },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "wifi_open",
          text: plain("Report a problem"),
          style: "primary",
        },
      ],
    },
  ];
  for (const inc of opts.incidents.slice(0, 3)) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Open issue* · ${inc.label}` },
      accessory: {
        type: "button",
        action_id: "metoo_open",
        value: inc.id,
        text: plain("I'm affected too"),
      },
    });
  }
  return {
    type: "home",
    blocks,
  };
}

export function zoneView(zones: ZoneChoice[], draft: SlackDraft): View {
  const groups = new Map<string, ZoneChoice[]>();
  for (const z of zones) {
    const key = z.floor?.trim() || "Spaces";
    const list = groups.get(key) ?? [];
    list.push(z);
    groups.set(key, list);
  }
  const option_groups = [...groups.entries()].map(([label, list]) => ({
    label: plain(label),
    options: list.map((z) => ({ text: plain(z.label), value: z.id })),
  }));

  const initial = zones.find((z) => z.id === draft.zone_id);

  return modal("wifi_zone", "Where are you?", draft, [
    {
      type: "input",
      block_id: "zone",
      label: plain("Place"),
      element: {
        type: "static_select",
        action_id: "zone_id",
        placeholder: plain("Choose a place"),
        option_groups,
        ...(initial
          ? { initial_option: { text: plain(initial.label), value: initial.id } }
          : {}),
      },
    },
  ]);
}

export function symptomsView(draft: SlackDraft): View {
  return modal("wifi_symptoms", "What happened?", draft, [
    {
      type: "input",
      block_id: "symptoms",
      label: plain("Tap one to three"),
      element: {
        type: "checkboxes",
        action_id: "symptom_ids",
        options: SYMPTOMS.map((id) => ({
          text: plain(SYMPTOM_LABELS[id]),
          value: id,
        })),
      },
    },
  ]);
}

export function clarifierView(draft: SlackDraft, clarifier: ClarifierDef): View {
  return modal(
    "wifi_clarifier",
    "One detail",
    { ...draft },
    [
      {
        type: "input",
        optional: true,
        block_id: "clarifier",
        label: plain(clarifier.question),
        element: {
          type: "radio_buttons",
          action_id: clarifier.id,
          options: clarifier.options.map((o) => ({
            text: plain(o.label),
            value: o.id,
          })),
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "Optional — press Next to skip." }],
      },
    ],
  );
}

export function appsView(draft: SlackDraft): View {
  return modal("wifi_apps", "Which apps?", draft, [
    {
      type: "input",
      optional: true,
      block_id: "apps",
      label: plain("Optional"),
      element: {
        type: "multi_static_select",
        action_id: "app_ids",
        placeholder: plain("Any that apply"),
        max_selected_items: 5,
        options: APPS.map((id) => ({
          text: plain(APP_LABELS[id]),
          value: id,
        })),
      },
    },
  ]);
}

export function detailsView(
  draft: SlackDraft,
  ssids: { id: string; label: string }[],
): View {
  return modal(
    "wifi_details",
    "Almost done",
    draft,
    [
      {
        type: "input",
        block_id: "when",
        label: plain("When?"),
        element: {
          type: "static_select",
          action_id: "when_bucket",
          initial_option: {
            text: plain(WHEN_LABELS[draft.when_bucket]),
            value: draft.when_bucket,
          },
          options: WHEN_BUCKETS.map((id) => ({
            text: plain(WHEN_LABELS[id]),
            value: id,
          })),
        },
      },
      {
        type: "input",
        block_id: "device",
        label: plain("Which device?"),
        element: {
          type: "static_select",
          action_id: "device_class",
          initial_option: {
            text: plain(DEVICE_LABELS[draft.device_class]),
            value: draft.device_class,
          },
          options: DEVICE_OPTIONS.map((id) => ({
            text: plain(DEVICE_LABELS[id]),
            value: id,
          })),
        },
      },
      {
        type: "input",
        block_id: "wifi",
        label: plain("Which Wi-Fi?"),
        element: {
          type: "static_select",
          action_id: "wifi_context",
          initial_option: {
            text: plain(ssids.find((s) => s.id === draft.wifi_context)?.label ?? "Not sure"),
            value: ssids.some((s) => s.id === draft.wifi_context) ? draft.wifi_context : "unknown",
          },
          options: ssids.map((s) => ({ text: plain(s.label), value: s.id })),
        },
      },
    ],
    "Submit",
  );
}

export function thanksView(recentCount: number): View {
  const line =
    recentCount >= 3
      ? `${recentCount} others reported this area in the last 10 min.`
      : "Network Ops is on it.";
  return {
    type: "modal",
    callback_id: "wifi_thanks",
    title: plain("Thanks"),
    close: plain("Close"),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Thanks — this helps everyone.*\nYour report was saved. ${line}`,
        },
      },
    ],
  };
}

export function messageView(title: string, body: string): View {
  return {
    type: "modal",
    callback_id: "wifi_message",
    title: plain(title.slice(0, 24)),
    close: plain("Close"),
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: body } },
    ],
  };
}

export function metooZoneView(
  incidentId: string,
  zones: ZoneChoice[],
  symptoms: SlackDraft["symptoms"],
): View {
  const draft: SlackDraft = { ...emptyDraft(), symptoms, incident_id: incidentId };
  return modal(
    "wifi_metoo",
    "I'm affected too",
    draft,
    [
      {
        type: "input",
        block_id: "zone",
        label: plain("Where are you?"),
        element: {
          type: "static_select",
          action_id: "zone_id",
          placeholder: plain("Choose a place"),
          options: zones.map((z) => ({ text: plain(z.label), value: z.id })),
        },
      },
    ],
    "Send",
  );
}
