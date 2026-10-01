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
  UNIVERSAL_ZONE_ID,
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

const CONTACT_OPTION = {
  text: plain("I'm happy to be contacted about this"),
  value: "yes",
};

const FOLLOW_UP_NOTE =
  "The tech team may need to reach out to you for further assistance, to escalate your issue, or to get more details than this form captures.";

function filled(value: string): { initial_value: string } | Record<string, never> {
  return value ? { initial_value: value } : {};
}

/** Slack reporters are house members, so this form does not ask who they are. */
export function reportFormView(draft: SlackDraft): View {
  return modal(
    "wifi_report_form",
    "Report a problem",
    draft,
    [
      {
        type: "input",
        block_id: "symptoms",
        label: plain("What happened?"),
        element: {
          type: "checkboxes",
          action_id: "symptom_ids",
          options: SYMPTOMS.map((id) => ({
            text: plain(SYMPTOM_LABELS[id]),
            value: id,
          })),
          ...(draft.symptoms.length
            ? {
                initial_options: draft.symptoms.map((id) => ({
                  text: plain(SYMPTOM_LABELS[id]),
                  value: id,
                })),
              }
            : {}),
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "Pick 1 to 3." }],
      },
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
        optional: true,
        block_id: "occurred_date",
        label: plain("Date"),
        element: {
          type: "datepicker",
          action_id: "date",
          placeholder: plain("Optional"),
          ...(draft.occurred_date ? { initial_date: draft.occurred_date } : {}),
        },
      },
      {
        type: "input",
        optional: true,
        block_id: "occurred_time",
        label: plain("Time"),
        element: {
          type: "timepicker",
          action_id: "time",
          placeholder: plain("Optional"),
          ...(draft.occurred_time ? { initial_time: draft.occurred_time } : {}),
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "Date and time are optional. Leave them blank to keep the When answer only." }],
      },
      ...appCheckboxBlocks(draft),
      {
        type: "input",
        optional: true,
        block_id: "other_app",
        label: plain("Which other app?"),
        element: {
          type: "plain_text_input",
          action_id: "other_app",
          placeholder: plain("Optional"),
          max_length: 80,
          ...filled(draft.clarifiers.other_app ?? ""),
        },
      },
      {
        type: "input",
        block_id: "company",
        label: plain("Where?"),
        element: {
          type: "plain_text_input",
          action_id: "company",
          placeholder: plain("Company or place"),
          max_length: 120,
          ...filled(draft.company),
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "The company you work with, or the place you're working from.",
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: draft.contact_ok
            ? "*Can we follow up with you?*"
            : `*Can we follow up with you?*\n${FOLLOW_UP_NOTE}`,
        },
      },
      {
        type: "actions",
        block_id: "contact_ok",
        elements: [
          {
            type: "checkboxes",
            action_id: "contact_ok",
            options: [CONTACT_OPTION],
            ...(draft.contact_ok ? { initial_options: [CONTACT_OPTION] } : {}),
          },
        ],
      },
      ...(draft.contact_ok
        ? [
            {
              type: "input" as const,
              optional: true,
              block_id: "contact_name",
              label: plain("Full name"),
              element: {
                type: "plain_text_input" as const,
                action_id: "name",
                placeholder: plain("Optional"),
                max_length: 80,
                ...filled(draft.contact_name),
              },
            },
            {
              type: "input" as const,
              optional: true,
              block_id: "contact_phone",
              label: plain("Phone number"),
              element: {
                type: "plain_text_input" as const,
                action_id: "phone",
                placeholder: plain("Optional"),
                max_length: 40,
                ...filled(draft.contact_phone),
              },
            },
            {
              type: "input" as const,
              optional: true,
              block_id: "contact_email",
              label: plain("Email"),
              element: {
                type: "plain_text_input" as const,
                action_id: "email",
                placeholder: plain("Optional"),
                max_length: 120,
                ...filled(draft.contact_email),
              },
            },
          ]
        : []),
      {
        type: "input",
        optional: true,
        block_id: "note",
        label: plain("Anything else?"),
        element: {
          type: "plain_text_input",
          action_id: "note",
          placeholder: plain("Optional"),
          multiline: true,
          max_length: 400,
          ...filled(draft.clarifiers.note ?? ""),
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Your details are only used by the Norrsken House team to follow up on this report.",
          },
        ],
      },
    ],
    "Submit",
  );
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

function appOption(id: (typeof APPS)[number]) {
  return { text: plain(APP_LABELS[id]), value: id };
}

/** One checkbox per app, packed into rows. A single checkbox list stacks down the modal. */
function appCheckboxBlocks(draft: SlackDraft): KnownBlock[] {
  const rows: (typeof APPS)[number][][] = [];
  for (let i = 0; i < APPS.length; i += 4) rows.push(APPS.slice(i, i + 4));
  return [
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "*Which apps?* Optional. Pick up to 5." }],
    },
    ...rows.map((ids, index) => ({
      type: "actions" as const,
      block_id: index === 0 ? "apps" : `apps_${index + 1}`,
      elements: ids.map((id) => {
        const option = appOption(id);
        return {
          type: "checkboxes" as const,
          action_id: id,
          options: [option],
          ...(draft.apps.includes(id) ? { initial_options: [option] } : {}),
        };
      }),
    })),
  ];
}

export function appsView(draft: SlackDraft): View {
  return modal("wifi_apps", "Which apps?", draft, appCheckboxBlocks(draft));
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

export function metooZoneView(incidentId: string, symptoms: SlackDraft["symptoms"]): View {
  const draft: SlackDraft = {
    ...emptyDraft(UNIVERSAL_ZONE_ID),
    symptoms,
    incident_id: incidentId,
  };
  return modal(
    "wifi_metoo",
    "I'm affected too",
    draft,
    [
      {
        type: "input",
        block_id: "company",
        label: plain("Where?"),
        element: {
          type: "plain_text_input",
          action_id: "company",
          placeholder: plain("Company or place"),
          max_length: 120,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: "The company you work with, or the place you're working from." },
        ],
      },
    ],
    "Send",
  );
}
