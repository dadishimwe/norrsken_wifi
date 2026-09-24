import type { Symptom } from "./enums.js";
import type { Clarifiers } from "./schemas.js";

export type ClarifierOption = { id: string; label: string };

export type ClarifierDef = {
  id: keyof Clarifiers | "wifi_context";
  priority: number;
  question: string;
  options: ClarifierOption[];
  /** Symptom that triggers this clarifier (undefined = always eligible by other rules) */
  symptom?: Symptom;
  /** Special triggers */
  trigger?: "active_incident" | "first_session_wifi";
};

export const CLARIFIERS: ClarifierDef[] = [
  {
    id: "same_as_incident",
    priority: 1,
    trigger: "active_incident",
    question: "Same as the current issue?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No, different" },
    ],
  },
  {
    id: "choppy_type",
    priority: 2,
    symptom: "call_choppy",
    question: "What was choppy?",
    options: [
      { id: "video", label: "Video" },
      { id: "audio", label: "Audio" },
      { id: "both", label: "Both" },
      { id: "screen", label: "Screen share" },
    ],
  },
  {
    id: "wifi_dropped",
    priority: 3,
    symptom: "call_disconnects",
    question: "Did Wi-Fi itself drop?",
    options: [
      { id: "wifi_dropped", label: "Wi-Fi dropped" },
      { id: "only_app", label: "Only the app" },
      { id: "not_sure", label: "Not sure" },
    ],
  },
  {
    id: "connect_detail",
    priority: 4,
    symptom: "cant_connect",
    question: "What did you see?",
    options: [
      { id: "cant_join", label: "Can't join network" },
      { id: "joined_no_internet", label: "Joined, no internet" },
      { id: "login_again", label: "Asked me to log in again" },
      { id: "not_sure", label: "Not sure" },
    ],
  },
  {
    id: "slow_scope",
    priority: 5,
    symptom: "slow",
    question: "Everything or one thing?",
    options: [
      { id: "everything", label: "Everything" },
      { id: "one_app", label: "One app" },
      { id: "uploads_downloads", label: "Uploads & downloads" },
    ],
  },
  {
    id: "wifi_context",
    priority: 6,
    trigger: "first_session_wifi",
    question: "Which Wi-Fi?",
    options: [], // filled from config/ssids.json at runtime
  },
];

export type PickClarifierInput = {
  symptoms: Symptom[];
  clarifiers: Clarifiers;
  wifiContext?: string;
  hasActiveIncident: boolean;
  isFirstWifiThisSession: boolean;
  maxClarifiers: 1 | 2;
  ssidOptions?: ClarifierOption[];
};

/**
 * Pick up to maxClarifiers clarifiers that would change diagnosis.
 * Never re-asks something already answered.
 */
export function pickClarifiers(input: PickClarifierInput): ClarifierDef[] {
  const known = new Set(Object.keys(input.clarifiers));
  if (input.wifiContext && input.wifiContext !== "unknown") {
    known.add("wifi_context");
  }

  const candidates = CLARIFIERS.filter((c) => {
    if (known.has(c.id)) return false;
    if (c.trigger === "active_incident") return input.hasActiveIncident;
    if (c.trigger === "first_session_wifi") return input.isFirstWifiThisSession;
    if (c.symptom) return input.symptoms.includes(c.symptom);
    return false;
  }).sort((a, b) => a.priority - b.priority);

  const picked = candidates.slice(0, input.maxClarifiers).map((c) => {
    if (c.id === "wifi_context" && input.ssidOptions?.length) {
      return { ...c, options: input.ssidOptions };
    }
    return c;
  });

  return picked;
}

const FIELD_LABELS: Record<string, string> = {
  same_as_incident: "Same as current issue",
  choppy_type: "What was choppy",
  wifi_dropped: "Wi‑Fi drop",
  connect_detail: "What they saw",
  slow_scope: "Slow scope",
  wifi_context: "Wi‑Fi",
  other_app: "Other app",
};

/** Human-readable clarifier summary for ops tables / CSV. */
export function formatClarifiersDisplay(
  clarifiers: Record<string, unknown> | null | undefined,
): string {
  if (!clarifiers || typeof clarifiers !== "object") return "";
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(clarifiers)) {
    if (raw == null || raw === "") continue;
    const value = String(raw);
    if (key === "other_app") {
      parts.push(`Other app: ${value}`);
      continue;
    }
    const def = CLARIFIERS.find((c) => c.id === key);
    const opt = def?.options.find((o) => o.id === value);
    const field = FIELD_LABELS[key] ?? def?.question ?? key.replaceAll("_", " ");
    parts.push(`${field}: ${opt?.label ?? value.replaceAll("_", " ")}`);
  }
  return parts.join(" · ");
}
