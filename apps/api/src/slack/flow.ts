import type { ClarifierDef } from "@norrsken/shared";
import {
  APPS,
  DEVICE_OPTIONS,
  SYMPTOMS,
  WHEN_BUCKETS,
  pickClarifiers,
  type App,
  type Clarifiers,
  type DeviceOption,
  type Symptom,
  type WhenBucket,
} from "@norrsken/shared";

export type ZoneChoice = { id: string; label: string; floor: string | null };

export type SlackDraft = {
  zone_id: string;
  zone_source: "selected" | "remembered";
  symptoms: Symptom[];
  clarifiers: Clarifiers;
  apps: App[];
  when_bucket: WhenBucket;
  device_class: DeviceOption;
  wifi_context: string;
  /** Incident id when this draft is a "me too" report */
  incident_id?: string;
};

export function emptyDraft(zoneId = ""): SlackDraft {
  return {
    zone_id: zoneId,
    zone_source: "selected",
    symptoms: [],
    clarifiers: {},
    apps: [],
    when_bucket: "now",
    device_class: "unknown",
    wifi_context: "unknown",
  };
}

/** Opaque session material. Never persisted — only hashed into actor_hash. */
export function slackActorToken(slackUserId: string): string {
  return `norrsken-slack:${slackUserId}`;
}

export function parseDraft(raw: string | undefined | null): SlackDraft {
  if (!raw) return emptyDraft();
  try {
    const v = JSON.parse(raw) as Partial<SlackDraft>;
    const symptoms = (v.symptoms ?? []).filter((s): s is Symptom =>
      (SYMPTOMS as readonly string[]).includes(s),
    );
    const apps = (v.apps ?? []).filter((a): a is App => (APPS as readonly string[]).includes(a));
    const when = (WHEN_BUCKETS as readonly string[]).includes(v.when_bucket ?? "")
      ? (v.when_bucket as WhenBucket)
      : "now";
    const device = (DEVICE_OPTIONS as readonly string[]).includes(v.device_class ?? "")
      ? (v.device_class as DeviceOption)
      : "unknown";
    return {
      zone_id: typeof v.zone_id === "string" ? v.zone_id : "",
      zone_source: v.zone_source === "remembered" ? "remembered" : "selected",
      symptoms: symptoms.slice(0, 3),
      clarifiers: v.clarifiers && typeof v.clarifiers === "object" ? v.clarifiers : {},
      apps: apps.slice(0, 5),
      when_bucket: when,
      device_class: device,
      wifi_context: typeof v.wifi_context === "string" ? v.wifi_context : "unknown",
      incident_id: typeof v.incident_id === "string" ? v.incident_id : undefined,
    };
  } catch {
    return emptyDraft();
  }
}

export function encodeDraft(draft: SlackDraft): string {
  return JSON.stringify(draft);
}

/** 1–3 symptoms. Returns an error string or null. */
export function symptomError(ids: string[]): string | null {
  const ok = ids.filter((id) => (SYMPTOMS as readonly string[]).includes(id));
  if (ok.length < 1) return "Pick at least one.";
  if (ok.length > 3) return "Pick at most three.";
  return null;
}

/** Next clarifier card, skipping Wi-Fi (collected on the details step). */
export function nextClarifier(
  draft: SlackDraft,
  hasIncident: boolean,
  ssidOptions: { id: string; label: string }[],
): ClarifierDef | null {
  const picked = pickClarifiers({
    symptoms: draft.symptoms,
    clarifiers: draft.clarifiers,
    wifiContext: draft.wifi_context,
    hasActiveIncident: hasIncident,
    isFirstWifiThisSession: false,
    maxClarifiers: hasIncident ? 2 : 1,
    ssidOptions,
  });
  return picked.find((c) => c.id !== "wifi_context") ?? null;
}
