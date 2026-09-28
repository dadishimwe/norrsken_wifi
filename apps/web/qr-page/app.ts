type Chip = { id: string; label: string };
type Zone = { id: string; label: string; floor: string | null };

type Bootstrap = {
  ok: true;
  zone: Zone;
  zones: Zone[];
  symptoms: Chip[];
  apps: Chip[];
  when: Chip[];
  devices: Chip[];
  ssids: Chip[];
  min_fill_ms: number;
};

type BootstrapError = { ok: false; error: string };

interface QrWindow {
  __BOOTSTRAP__: Bootstrap | BootstrapError | null;
}

const boot = (window as unknown as QrWindow).__BOOTSTRAP__;
const root = document.getElementById("app")!;
const HOUSE_QR = "house";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sessionToken(): string {
  // localStorage so the same browser keeps one anonymous reporter id across
  // refresh / tab close — pairs with server rate limits (1 per zone / 5 min).
  const key = "norrsken_qr_session";
  let t = localStorage.getItem(key) ?? sessionStorage.getItem(key);
  if (!t || t.length < 16) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    t = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  try {
    localStorage.setItem(key, t);
  } catch {
    sessionStorage.setItem(key, t);
  }
  return t;
}

const DONE_TTL_MS = 5 * 60 * 1000; // match zone rate window

function doneStorageKey(zoneId: string): string {
  return `norrsken_done_${zoneId}`;
}

function readDone(zoneId: string): { at: number; recentCount: number } | null {
  try {
    const raw = localStorage.getItem(doneStorageKey(zoneId)) ?? sessionStorage.getItem(doneStorageKey(zoneId));
    if (!raw) return null;
    const d = JSON.parse(raw) as { at?: number; recentCount?: number };
    if (typeof d.at !== "number" || Date.now() - d.at > DONE_TTL_MS) {
      clearDone(zoneId);
      return null;
    }
    return { at: d.at, recentCount: typeof d.recentCount === "number" ? d.recentCount : 0 };
  } catch {
    return null;
  }
}

function markDone(zoneId: string, recentCount: number) {
  const payload = JSON.stringify({ at: Date.now(), recentCount });
  try {
    localStorage.setItem(doneStorageKey(zoneId), payload);
  } catch {
    sessionStorage.setItem(doneStorageKey(zoneId), payload);
  }
}

function clearDone(zoneId: string) {
  try {
    localStorage.removeItem(doneStorageKey(zoneId));
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(doneStorageKey(zoneId));
  } catch {
    /* ignore */
  }
}

function friendlySubmitError(code: string): string {
  const raw = code.trim();
  const known: Record<string, string> = {
    rate_limited_zone:
      "You already sent a report for this area a moment ago. Thanks — no need to send another.",
    rate_limited_day:
      "You've reached today's report limit. Thanks for helping — try again tomorrow if needed.",
    too_fast: "That was a bit quick — please take a second and try again.",
    pick_zone: "Pick where you are.",
    unknown_zone: "This place isn't accepting reports right now.",
    occurred_in_future: "That time hasn’t happened yet. Pick a time that’s already passed.",
    bad_occurred_at: "That time couldn’t be read. Pick the date and time again.",
    save_failed: "Could not save. Try again.",
    rejected: "Could not save that report.",
  };
  if (known[raw]) return known[raw];

  const lower = raw.toLowerCase();
  if (lower.includes("at most 5")) return "You can pick up to 5 apps.";
  if (lower.includes("at most 3") || lower.includes("at least 1")) {
    return "Pick 1 to 3 things that happened.";
  }
  if (lower.includes("at most 400")) return "The note is too long. Keep it under 400 characters.";
  if (lower.includes("at most 80")) return "The other app name is too long.";
  if (lower.includes("future")) {
    return "That time hasn’t happened yet. Pick a time that’s already passed.";
  }
  if (
    lower.includes("array must") ||
    lower.includes("string must") ||
    lower.includes("invalid enum") ||
    lower.includes("expected") ||
    lower.includes("too big") ||
    lower.includes("too small") ||
    raw.length > 160
  ) {
    return "Something in the form wasn’t accepted. Check your answers and try again.";
  }
  return "Could not save. Try again.";
}

function locationLine(label: string, floor: string | null | undefined): string {
  if (floor && floor.trim() && !label.toLowerCase().includes(floor.toLowerCase())) {
    return `${floor.trim()} · ${label}`;
  }
  return label;
}

function privacyLine(): string {
  return `<p class="privacy">Anonymous — we don’t collect your name or email.</p>`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function formatDateLabel(d: Date): string {
  if (sameDay(d, new Date())) return "Today";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}


async function run(b: Bootstrap) {
  const places = b.zones.filter((z) => z.id !== HOUSE_QR);
  const entryIsHouse = b.zone.id === HOUSE_QR;
  let started = Date.now();
  let zoneId = entryIsHouse ? "" : b.zone.id;
  let zoneSource: "qr" | "selected" | "override" = entryIsHouse ? "selected" : "qr";
  let zoneLabel = entryIsHouse ? "" : b.zone.label;
  let zoneFloor = b.zone.floor;
  const symptoms = new Set<string>();
  const apps = new Set<string>();
  let otherApp = "";
  let note = "";
  let whenBucket = "now";
  const now = new Date();
  let exactTouched = false;
  let exactDate = startOfDay(now);
  let exactHour = now.getHours();
  let exactMinute = now.getMinutes();
  let calOpen = false;
  let timeOpen: "hour" | "minute" | null = null;
  let outsideCloser: ((e: Event) => void) | null = null;
  let calYear = now.getFullYear();
  let calMonth = now.getMonth();
  let errorMsg = "";
  let phase: "form" | "done" = "form";
  let recentCount = 0;
  let alreadySubmitted = false;
  let busy = false;

  const draftKey = `norrsken_draft_v3_${b.zone.id}`;

  function saveDraft() {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          zoneId,
          zoneSource,
          zoneLabel,
          zoneFloor,
          symptoms: [...symptoms],
          apps: [...apps],
          otherApp,
          note,
          whenBucket,
          exactTouched,
          exactDate: exactDate.toISOString(),
          exactHour,
          exactMinute,
          started,
        }),
      );
    } catch {
      /* ignore quota */
    }
  }

  function clearDraft() {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }

  function restoreDraft() {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        zoneId?: string;
        zoneSource?: "qr" | "selected" | "override";
        zoneLabel?: string;
        zoneFloor?: string | null;
        symptoms?: string[];
        apps?: string[];
        otherApp?: string;
        note?: string;
        whenBucket?: string;
        exactTouched?: boolean;
        exactDate?: string;
        exactHour?: number;
        exactMinute?: number;
        started?: number;
      };
      if (d.zoneId && places.some((z) => z.id === d.zoneId)) {
        zoneId = d.zoneId;
        zoneSource =
          d.zoneSource === "override" || d.zoneSource === "selected" || d.zoneSource === "qr"
            ? d.zoneSource
            : entryIsHouse
              ? "selected"
              : "qr";
        zoneLabel = d.zoneLabel ?? zoneLabel;
        zoneFloor = d.zoneFloor ?? zoneFloor;
      }
      if (Array.isArray(d.symptoms)) {
        symptoms.clear();
        d.symptoms.forEach((s) => symptoms.add(s));
      }
      if (Array.isArray(d.apps)) {
        apps.clear();
        d.apps.forEach((a) => apps.add(a));
      }
      if (typeof d.otherApp === "string") otherApp = d.otherApp;
      if (typeof d.note === "string") note = d.note;
      if (typeof d.whenBucket === "string") whenBucket = d.whenBucket;
      if (typeof d.exactTouched === "boolean") exactTouched = d.exactTouched;
      if (typeof d.exactDate === "string") {
        const parsed = new Date(d.exactDate);
        if (!Number.isNaN(parsed.getTime())) {
          exactDate = startOfDay(parsed);
          calYear = exactDate.getFullYear();
          calMonth = exactDate.getMonth();
        }
      }
      if (typeof d.exactHour === "number") exactHour = d.exactHour;
      if (typeof d.exactMinute === "number") exactMinute = d.exactMinute;
      if (typeof d.started === "number" && d.started > 0 && d.started <= Date.now()) {
        started = d.started;
      }
    } catch {
      clearDraft();
    }
  }

  restoreDraft();

  {
    const prior = readDone(zoneId);
    if (prior) {
      phase = "done";
      recentCount = prior.recentCount;
      alreadySubmitted = true;
      clearDraft();
    }
  }

  async function waitMinFill(): Promise<number> {
    const elapsed = Date.now() - started;
    if (elapsed < b.min_fill_ms) {
      await new Promise((r) => setTimeout(r, b.min_fill_ms - elapsed));
    }
    return Date.now() - started;
  }

  function setError(msg: string) {
    errorMsg = msg;
    const el = root.querySelector<HTMLElement>(".step-error");
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg;
    if (msg) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function setBusyUi(on: boolean) {
    busy = on;
    const next = root.querySelector<HTMLButtonElement>("[data-action='submit']");
    if (next) {
      next.disabled = on;
      next.textContent = on ? "Saving…" : "Submit ✔";
    }
  }

  function syncTextInputs() {
    const other = root.querySelector<HTMLInputElement>("#other-app");
    if (other) otherApp = other.value.trim().slice(0, 80);
    const noteEl = root.querySelector<HTMLTextAreaElement>("#note");
    if (noteEl) note = noteEl.value.trim().slice(0, 400);
  }

  function clearOutside() {
    if (!outsideCloser) return;
    document.removeEventListener("pointerdown", outsideCloser);
    outsideCloser = null;
  }

  function render() {
    clearOutside();
    if (phase === "done") {
      root.innerHTML = `
        <div class="shell shell-done">
          ${doneBlock(recentCount, alreadySubmitted)}
        </div>
        ${poweredByHtml()}
      `;
      return;
    }

    root.innerHTML = `
      <div class="shell">
        <header class="header">
          <div class="top-bar">
            <img class="logo-norrsken" src="/qr/norrsken-logo-dark.svg" alt="Norrsken" />
            <span class="eyebrow">Network feedback</span>
          </div>
        </header>

        <input class="hp" tabindex="-1" autocomplete="off" name="website" id="hp" />

        <section class="card step-card" id="step-card">
          ${formBody()}
          <p class="alert step-error" role="alert" ${errorMsg ? "" : "hidden"}>${escapeHtml(errorMsg)}</p>
          <div class="actions">
            <button type="button" class="btn btn-primary" data-action="submit" ${busy ? "disabled" : ""}>
              ${busy ? "Saving…" : "Submit ✔"}
            </button>
          </div>
        </section>
        ${privacyLine()}
      </div>
      ${poweredByHtml()}
    `;
    bind();
  }

  function formBody(): string {
    const showOther = apps.has("other");
    return `
      <div class="field-block">
        <h2 class="field-title">What happened?</h2>
        <p class="hint">Tap one or more (max 3)</p>
        <div class="chips chips-pills">
          ${b.symptoms
            .map(
              (s) =>
                `<button type="button" class="chip${symptoms.has(s.id) ? " on" : ""}" data-symptom="${escapeHtml(s.id)}">${escapeHtml(s.label)}</button>`,
            )
            .join("")}
        </div>
      </div>
      <div class="field-block">
        <h2 class="field-title">When?</h2>
        <p class="hint">Pick the closest time</p>
        <div class="chips chips-3">
          ${b.when
            .map(
              (w) =>
                `<button type="button" class="chip${whenBucket === w.id ? " on" : ""}" data-when="${escapeHtml(w.id)}">${escapeHtml(w.label)}</button>`,
            )
            .join("")}
        </div>
        ${exactTimeHtml()}
      </div>
      <div class="field-block">
        <h2 class="field-title">Which apps?</h2>
        <p class="hint">Optional — up to 5</p>
        <div class="chips chips-pills">
          ${b.apps
            .map(
              (a) =>
                `<button type="button" class="chip${apps.has(a.id) ? " on" : ""}" data-app="${escapeHtml(a.id)}">${escapeHtml(a.label)}</button>`,
            )
            .join("")}
        </div>
        <div class="other-app" ${showOther ? "" : "hidden"}>
          <label for="other-app">Which other app? <span class="hint-inline">(optional)</span></label>
          <input id="other-app" class="text-input" type="text" maxlength="80"
            placeholder="e.g. Notion, Dropbox…"
            value="${escapeHtml(otherApp)}"
            autocomplete="off" />
        </div>
      </div>
      <div class="field-block">
        <h2 class="field-title">Where?</h2>
        <div class="chips chips-pills zone-picks" role="listbox" aria-label="Where?">
          ${places
            .map(
              (z) =>
                `<button type="button" class="chip${z.id === zoneId ? " on" : ""}" data-zone-opt="${escapeHtml(z.id)}">${escapeHtml(locationLine(z.label, z.floor))}</button>`,
            )
            .join("")}
        </div>
      </div>
      <div class="field-block field-block-last">
        <h2 class="field-title">Anything else? <span class="hint-inline">(optional)</span></h2>
        <textarea id="note" class="text-input note-input" maxlength="400" rows="3"
          placeholder="Only if the answers above don’t cover it">${escapeHtml(note)}</textarea>
      </div>`;
  }

  function clampExactToNow() {
    const clock = new Date();
    if (!sameDay(exactDate, clock)) return;
    if (exactHour > clock.getHours()) exactHour = clock.getHours();
    if (exactHour === clock.getHours() && exactMinute > clock.getMinutes()) {
      exactMinute = clock.getMinutes();
    }
  }

  function calendarHtml(): string {
    const today = startOfDay(new Date());
    const first = new Date(calYear, calMonth, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: string[] = [];
    for (let i = 0; i < startPad; i++) cells.push(`<span class="cal-empty"></span>`);
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(calYear, calMonth, day);
      const future = d.getTime() > today.getTime();
      const selected = sameDay(d, exactDate);
      const isToday = sameDay(d, today);
      cells.push(
        `<button type="button" class="cal-day${selected ? " on" : ""}${isToday ? " today" : ""}" data-cal-day="${day}" ${future ? "disabled" : ""}>${day}</button>`,
      );
    }
    const clock = new Date();
    const nextDisabled =
      calYear > clock.getFullYear() || (calYear === clock.getFullYear() && calMonth >= clock.getMonth());
    return `
      <div class="cal-pop" ${calOpen ? "" : "hidden"}>
        <div class="cal-head">
          <button type="button" class="cal-nav" data-cal="prev" aria-label="Previous month">‹</button>
          <span class="cal-title">${MONTHS[calMonth]} ${calYear}</span>
          <button type="button" class="cal-nav" data-cal="next" aria-label="Next month" ${nextDisabled ? "disabled" : ""}>›</button>
        </div>
        <div class="cal-week">${WEEKDAYS.map((w) => `<span>${w}</span>`).join("")}</div>
        <div class="cal-grid">${cells.join("")}</div>
      </div>`;
  }

  function wheelHtml(kind: "hour" | "minute"): string {
    const clock = new Date();
    const isToday = sameDay(exactDate, clock);
    const maxH = isToday ? clock.getHours() : 23;
    const maxM = isToday && exactHour >= clock.getHours() ? clock.getMinutes() : 59;
    const count = kind === "hour" ? 24 : 60;
    const selected = kind === "hour" ? exactHour : exactMinute;
    const attr = kind === "hour" ? "data-hour" : "data-minute";
    let html = "";
    for (let i = 0; i < count; i++) {
      const disabled = kind === "hour" ? i > maxH : i > maxM;
      html += `<button type="button" class="wheel-item${i === selected ? " on" : ""}" ${attr}="${i}" ${disabled ? "disabled" : ""}>${pad2(i)}</button>`;
    }
    const label = kind === "hour" ? "Hour" : "Minute";
    return `<div class="wheel" data-wheel="${kind}" role="listbox" aria-label="${label}">${html}</div>`;
  }

  function exactTimeHtml(): string {
    return `
      <div class="when-exact">
        <p class="hint">Exact time <span class="hint-inline">(optional)</span></p>
        <div class="when-exact-row">
          <div class="cal-anchor">
            <button type="button" class="when-date" data-action="toggle-cal" aria-expanded="${calOpen ? "true" : "false"}" aria-label="Choose date">
              <svg class="cal-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="15.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>
                <path d="M3.5 10h17M8 3.5v3.5M16 3.5v3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              <span>${escapeHtml(formatDateLabel(exactDate))}</span>
            </button>
            ${calendarHtml()}
          </div>
          <div class="time-pair">
            <div class="time-anchor${timeOpen === "hour" ? " open" : ""}">
              <button type="button" class="time-face" data-action="toggle-hour" aria-expanded="${timeOpen === "hour" ? "true" : "false"}" aria-label="Choose hour">${pad2(exactHour)}</button>
              ${timeOpen === "hour" ? `<div class="time-pop">${wheelHtml("hour")}</div>` : ""}
            </div>
            <span class="time-colon" aria-hidden="true">:</span>
            <div class="time-anchor${timeOpen === "minute" ? " open" : ""}">
              <button type="button" class="time-face" data-action="toggle-minute" aria-expanded="${timeOpen === "minute" ? "true" : "false"}" aria-label="Choose minute">${pad2(exactMinute)}</button>
              ${timeOpen === "minute" ? `<div class="time-pop">${wheelHtml("minute")}</div>` : ""}
            </div>
          </div>
        </div>
      </div>`;
  }

  function bind() {
    root.querySelectorAll<HTMLButtonElement>("[data-symptom]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.symptom!;
        if (symptoms.has(id)) {
          symptoms.delete(id);
          btn.classList.remove("on");
          setError("");
        } else if (symptoms.size < 3) {
          symptoms.add(id);
          btn.classList.add("on");
          setError("");
        } else {
          setError("You can pick up to 3.");
          return;
        }
        saveDraft();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-app]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.app!;
        if (apps.has(id)) {
          apps.delete(id);
          btn.classList.remove("on");
          if (id === "other") {
            otherApp = "";
            const box = root.querySelector<HTMLElement>(".other-app");
            if (box) box.hidden = true;
          }
          setError("");
        } else if (apps.size < 5) {
          apps.add(id);
          btn.classList.add("on");
          setError("");
          if (id === "other") {
            const box = root.querySelector<HTMLElement>(".other-app");
            if (box) {
              box.hidden = false;
              root.querySelector<HTMLInputElement>("#other-app")?.focus();
            }
          }
        } else {
          setError("You can pick up to 5 apps.");
          return;
        }
        saveDraft();
      });
    });
    root.querySelector<HTMLInputElement>("#other-app")?.addEventListener("input", (e) => {
      otherApp = (e.target as HTMLInputElement).value.trim().slice(0, 80);
      saveDraft();
    });
    root.querySelector<HTMLTextAreaElement>("#note")?.addEventListener("input", (e) => {
      note = (e.target as HTMLTextAreaElement).value.slice(0, 400);
      saveDraft();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-when]").forEach((btn) => {
      btn.addEventListener("click", () => {
        whenBucket = btn.dataset.when!;
        root.querySelectorAll<HTMLButtonElement>("[data-when]").forEach((el) => el.classList.remove("on"));
        btn.classList.add("on");
        saveDraft();
      });
    });
    root.querySelector("[data-action='toggle-cal']")?.addEventListener("click", () => {
      calOpen = !calOpen;
      if (calOpen) timeOpen = null;
      syncTextInputs();
      render();
    });
    root.querySelector("[data-action='toggle-hour']")?.addEventListener("click", () => {
      timeOpen = timeOpen === "hour" ? null : "hour";
      if (timeOpen) calOpen = false;
      syncTextInputs();
      render();
    });
    root.querySelector("[data-action='toggle-minute']")?.addEventListener("click", () => {
      timeOpen = timeOpen === "minute" ? null : "minute";
      if (timeOpen) calOpen = false;
      syncTextInputs();
      render();
    });
    if (calOpen || timeOpen) {
      outsideCloser = (e: Event) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.closest(".cal-anchor, .time-anchor")) return;
        calOpen = false;
        timeOpen = null;
        syncTextInputs();
        render();
      };
      document.addEventListener("pointerdown", outsideCloser);
    }
    root.querySelectorAll<HTMLButtonElement>("[data-cal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        if (btn.dataset.cal === "prev") {
          if (calMonth === 0) {
            calMonth = 11;
            calYear -= 1;
          } else calMonth -= 1;
        } else if (calYear < new Date().getFullYear() || calMonth < new Date().getMonth()) {
          if (calMonth === 11) {
            calMonth = 0;
            calYear += 1;
          } else calMonth += 1;
        }
        syncTextInputs();
        render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-cal-day]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        exactDate = new Date(calYear, calMonth, Number(btn.dataset.calDay));
        exactTouched = true;
        calOpen = false;
        clampExactToNow();
        syncTextInputs();
        saveDraft();
        render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-hour]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        exactHour = Number(btn.dataset.hour);
        exactTouched = true;
        timeOpen = null;
        clampExactToNow();
        syncTextInputs();
        saveDraft();
        render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-minute]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        exactMinute = Number(btn.dataset.minute);
        exactTouched = true;
        timeOpen = null;
        syncTextInputs();
        saveDraft();
        render();
      });
    });
    root.querySelectorAll<HTMLElement>(".wheel").forEach((wheel) => {
      const on = wheel.querySelector<HTMLElement>(".wheel-item.on");
      if (!on) return;
      wheel.scrollTop = on.offsetTop - wheel.clientHeight / 2 + on.clientHeight / 2;
    });
    root.querySelectorAll<HTMLButtonElement>("[data-zone-opt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.zoneOpt!;
        const z = places.find((x) => x.id === id);
        const priorHere = readDone(id);
        zoneId = id;
        zoneLabel = z?.label ?? id;
        zoneFloor = z?.floor ?? null;
        zoneSource = id === b.zone.id ? "qr" : entryIsHouse ? "selected" : "override";
        if (priorHere) {
          phase = "done";
          recentCount = priorHere.recentCount;
          alreadySubmitted = true;
          clearDraft();
          render();
          return;
        }
        syncTextInputs();
        saveDraft();
        render();
      });
    });
    root.querySelector("[data-action='submit']")?.addEventListener("click", () => void submitReport());
  }

  function clarifierPayload(): Record<string, string> {
    const out: Record<string, string> = {};
    if (apps.has("other") && otherApp) out.other_app = otherApp;
    if (note) out.note = note;
    return out;
  }

  function occurredAtPayload(): string | undefined {
    if (!exactTouched) return undefined;
    clampExactToNow();
    const d = new Date(
      exactDate.getFullYear(),
      exactDate.getMonth(),
      exactDate.getDate(),
      exactHour,
      exactMinute,
      0,
      0,
    );
    if (d.getTime() > Date.now()) return new Date().toISOString();
    return d.toISOString();
  }

  async function submitReport() {
    if (busy) return;
    syncTextInputs();
    setError("");
    if (!zoneId) {
      setError("Pick where you are.");
      return;
    }
    if (symptoms.size === 0) {
      setError("Pick at least one thing that happened.");
      return;
    }
    if (symptoms.size > 3) {
      setError("You can pick up to 3.");
      return;
    }
    if (apps.size > 5) {
      setError("You can pick up to 5 apps.");
      return;
    }
    const priorHere = readDone(zoneId);
    if (priorHere) {
      recentCount = priorHere.recentCount;
      alreadySubmitted = true;
      phase = "done";
      clearDraft();
      render();
      return;
    }
    setBusyUi(true);
    try {
      const fill_ms = await waitMinFill();
      const hp = (document.getElementById("hp") as HTMLInputElement | null)?.value ?? "";
      if (otherApp && !apps.has("other")) apps.add("other");
      const occurredAt = occurredAtPayload();
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zone_id: zoneId,
          zone_source: zoneSource,
          channel: "qr",
          symptoms: [...symptoms],
          apps: [...apps],
          when_bucket: whenBucket,
          ...(occurredAt ? { occurred_at: occurredAt } : {}),
          clarifiers: clarifierPayload(),
          fill_ms,
          session_token: sessionToken(),
          website: hp,
        }),
      });
      let data: { report_id?: string; recent_count?: number; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        data = {};
      }
      if (!res.ok) {
        const code = data.error || "save_failed";
        if (code === "rate_limited_zone") {
          markDone(zoneId, recentCount);
          alreadySubmitted = true;
          phase = "done";
          clearDraft();
          render();
          return;
        }
        throw new Error(friendlySubmitError(code));
      }
      recentCount = data.recent_count ?? 0;
      markDone(zoneId, recentCount);
      alreadySubmitted = false;
      clearDraft();
      phase = "done";
      render();
    } catch (e) {
      if (e instanceof TypeError) {
        setError("Couldn’t reach the server. Check your connection and try again.");
      } else {
        setError(e instanceof Error ? e.message : "Could not save. Try again.");
      }
    } finally {
      setBusyUi(false);
    }
  }

  render();
}

function poweredByHtml(): string {
  return `
    <footer class="powered-by">
      <span>Powered by</span>
      <img class="logo-zuba" src="/qr/zuba-logo-on-light.png" alt="Zuba Broadband" />
    </footer>`;
}

function doneBlock(recentCount: number, already = false): string {
  const status =
    recentCount >= 3
      ? `${recentCount} others reported this area in the last 10 min.`
      : "Network Ops is on it.";
  const title = already ? "Report already sent" : "Thanks — this helps everyone.";
  const body = already
    ? "You already reported this area a moment ago. No need to send another — you can close this page."
    : "Your report was saved. You can close this page.";
  return `
    <div class="done">
      <div class="done-burst" aria-hidden="true">
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="spark"></div>
        <div class="done-circle">
          <svg class="done-check" viewBox="0 0 36 36">
            <path d="M8 19 l7 7 l13 -15" />
          </svg>
        </div>
      </div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(body)}</p>
      <p class="status">${escapeHtml(status)}</p>
    </div>`;
}

if (!boot || boot.ok !== true) {
  root.innerHTML = `<div class="card"><h2>This link isn’t valid</h2><p class="hint">${
    boot && "error" in boot ? escapeHtml(boot.error) : "Ask Network Ops for a fresh QR code."
  }</p></div>`;
} else {
  void run(boot).catch((e) => {
    root.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="hint">${escapeHtml(
      e instanceof Error ? e.message : "Could not open this form.",
    )}</p></div>`;
  });
}
