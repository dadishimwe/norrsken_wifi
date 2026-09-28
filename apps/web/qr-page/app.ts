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

type StepId = "symptoms" | "when" | "device" | "apps" | "wifi";

const STEP_TITLE: Record<StepId, string> = {
  symptoms: "What happened?",
  when: "When?",
  device: "Which device?",
  apps: "Which apps?",
  wifi: "Which Wi‑Fi?",
};

const boot = (window as unknown as QrWindow).__BOOTSTRAP__;
const root = document.getElementById("app")!;

if (!boot || boot.ok !== true) {
  root.innerHTML = `<div class="card"><h2>This link isn’t valid</h2><p class="hint">${
    boot && "error" in boot ? escapeHtml(boot.error) : "Ask Network Ops for a fresh QR code."
  }</p></div>`;
} else {
  void run(boot);
}

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
  if (code === "rate_limited_zone") {
    return "You already sent a report for this area a moment ago. Thanks — no need to send another.";
  }
  if (code === "rate_limited_day") {
    return "You've reached today's report limit. Thanks for helping — try again tomorrow if needed.";
  }
  if (code === "too_fast") return "That was a bit quick — please take a second and try again.";
  if (code === "unknown_zone") return "This place isn't accepting reports right now.";
  return code;
}

/** Soft pre-select from UA — user can still change it. */
function guessDevice(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "iphone";
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  if (/Linux/i.test(ua)) return "linux";
  return "unknown";
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
  let started = Date.now();
  let zoneId = b.zone.id;
  let zoneSource: "qr" | "override" = "qr";
  let zoneLabel = b.zone.label;
  let zoneFloor = b.zone.floor;
  const symptoms = new Set<string>();
  const apps = new Set<string>();
  let otherApp = "";
  let whenBucket = "now";
  const now = new Date();
  let exactTouched = false;
  let exactDate = startOfDay(now);
  let exactHour = now.getHours();
  let exactMinute = now.getMinutes();
  let calOpen = false;
  let calYear = now.getFullYear();
  let calMonth = now.getMonth();
  let deviceClass = guessDevice();
  let wifiContext = "unknown";
  let errorMsg = "";
  let phase: "form" | "done" = "form";
  let recentCount = 0;
  let alreadySubmitted = false;
  let busy = false;
  let stepIndex = 0;
  const steps: StepId[] = ["symptoms", "when", "device", "apps", "wifi"];
  let renderedStep: StepId | null = null;

  const draftKey = `norrsken_draft_v2_${b.zone.id}`;

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
          whenBucket,
          exactTouched,
          exactDate: exactDate.toISOString(),
          exactHour,
          exactMinute,
          deviceClass,
          wifiContext,
          stepIndex,
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
        zoneSource?: "qr" | "override";
        zoneLabel?: string;
        zoneFloor?: string | null;
        symptoms?: string[];
        apps?: string[];
        otherApp?: string;
        whenBucket?: string;
        exactTouched?: boolean;
        exactDate?: string;
        exactHour?: number;
        exactMinute?: number;
        deviceClass?: string;
        wifiContext?: string;
        stepIndex?: number;
        started?: number;
      };
      if (d.zoneId) {
        zoneId = d.zoneId;
        zoneSource = d.zoneSource === "override" ? "override" : "qr";
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
      if (typeof d.deviceClass === "string") deviceClass = d.deviceClass;
      if (typeof d.wifiContext === "string") wifiContext = d.wifiContext;
      if (typeof d.stepIndex === "number" && d.stepIndex >= 0 && d.stepIndex < steps.length) {
        stepIndex = d.stepIndex;
      }
      if (typeof d.started === "number" && d.started > 0 && d.started <= Date.now()) {
        started = d.started;
      }
    } catch {
      clearDraft();
    }
  }

  restoreDraft();

  // After draft restore: if this browser already submitted for the current zone
  // within the rate window, skip the form (server still enforces limits).
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
    if (el) {
      el.hidden = !msg;
      el.textContent = msg;
    }
  }

  function setBusyUi(on: boolean) {
    busy = on;
    root.querySelectorAll<HTMLButtonElement>("[data-action='next'], [data-action='back']").forEach((btn) => {
      btn.disabled = on;
    });
    const next = root.querySelector<HTMLButtonElement>("[data-action='next']");
    if (next) {
      const total = steps.length;
      next.textContent = on
        ? "Saving…"
        : stepIndex === total - 1
          ? "Submit ✔"
          : "Continue";
    }
  }

  function updateProgress() {
    const step = steps[stepIndex] ?? "symptoms";
    const total = steps.length;
    const current = stepIndex + 1;
    const pct = Math.round((current / total) * 100);
    const title = root.querySelector(".progress-title");
    const count = root.querySelector(".progress-step");
    const fill = root.querySelector<HTMLElement>(".progress-fill");
    const wrap = root.querySelector(".progress");
    if (title) title.textContent = STEP_TITLE[step];
    if (count) count.textContent = `${current} / ${total}`;
    if (fill) fill.style.width = `${pct}%`;
    if (wrap) wrap.setAttribute("aria-label", `Step ${current} of ${total}: ${STEP_TITLE[step]}`);
  }

  function syncOtherAppInput() {
    const input = root.querySelector<HTMLInputElement>("#other-app");
    if (input) otherApp = input.value.trim().slice(0, 80);
  }

  function render() {
    if (phase === "done") {
      root.innerHTML = `
        <div class="shell shell-done">
          ${doneBlock(recentCount, alreadySubmitted)}
        </div>
        ${poweredByHtml()}
      `;
      return;
    }

    const step = steps[stepIndex] ?? "symptoms";
    const total = steps.length;
    const current = stepIndex + 1;
    const pct = Math.round((current / total) * 100);
    const stepChanged = renderedStep !== step;
    renderedStep = step;
    const place = locationLine(zoneLabel, zoneFloor);

    root.innerHTML = `
      <div class="shell">
        <header class="header">
          <div class="top-bar">
            <img class="logo-norrsken" src="/qr/norrsken-logo-dark.svg" alt="Norrsken" />
            <span class="eyebrow">Network feedback</span>
          </div>
          ${
            step === "symptoms"
              ? ""
              : `<p class="place-quiet">${escapeHtml(place)}</p>`
          }
        </header>

        <div class="progress" aria-label="Step ${current} of ${total}: ${STEP_TITLE[step]}">
          <div class="progress-meta">
            <span class="progress-title">${STEP_TITLE[step]}</span>
            <span class="progress-step">${current} / ${total}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>

        <input class="hp" tabindex="-1" autocomplete="off" name="website" id="hp" />

        <section class="card step-card${stepChanged ? " step-enter" : ""}" id="step-card">
          ${stepBody(step)}
          <p class="error step-error" ${errorMsg ? "" : "hidden"}>${escapeHtml(errorMsg)}</p>
          <div class="actions">
            ${
              stepIndex > 0
                ? `<button type="button" class="btn" data-action="back" ${busy ? "disabled" : ""}>Back</button>`
                : `<span class="actions-spacer"></span>`
            }
            <button type="button" class="btn btn-primary" data-action="next" ${busy ? "disabled" : ""}>
              ${busy ? "Saving…" : stepIndex === total - 1 ? "Submit ✔" : "Continue"}
            </button>
          </div>
          ${privacyLine()}
        </section>
      </div>

      ${poweredByHtml()}
    `;
    bind();
  }

  function zonePickerHtml(): string {
    return `
      <div class="field-block">
        <h2 class="field-title">Where were/are you?</h2>
        <div class="chips chips-pills zone-picks" role="listbox" aria-label="Where were/are you?">
          ${b.zones
            .map(
              (z) =>
                `<button type="button" class="chip${z.id === zoneId ? " on" : ""}" data-zone-opt="${escapeHtml(z.id)}">${escapeHtml(locationLine(z.label, z.floor))}</button>`,
            )
            .join("")}
        </div>
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

  function stepBody(step: StepId): string {
    if (step === "symptoms") {
      return `
        ${zonePickerHtml()}
        <h2 class="field-title">What happened?</h2>
        <p class="hint">Tap one or more (max 3)</p>
        <div class="chips chips-pills" data-group="symptoms">
          ${b.symptoms
            .map(
              (s) =>
                `<button type="button" class="chip${symptoms.has(s.id) ? " on" : ""}" data-symptom="${escapeHtml(s.id)}">${escapeHtml(s.label)}</button>`,
            )
            .join("")}
        </div>`;
    }
    if (step === "when") {
      return `
        <p class="hint">Pick the closest time</p>
        <div class="chips chips-3" data-group="when">
          ${b.when
            .map(
              (w) =>
                `<button type="button" class="chip${whenBucket === w.id ? " on" : ""}" data-when="${escapeHtml(w.id)}">${escapeHtml(w.label)}</button>`,
            )
            .join("")}
        </div>
        <div class="when-exact">
          <p class="hint">Exact time <span class="hint-inline">(optional)</span></p>
          <div class="when-exact-row">
            <div class="cal-anchor">
              <button type="button" class="when-date" data-action="toggle-cal" aria-expanded="${calOpen ? "true" : "false"}">${escapeHtml(formatDateLabel(exactDate))}</button>
              ${calendarHtml()}
            </div>
            <div class="time-pair">
              ${wheelHtml("hour")}
              <span class="time-colon" aria-hidden="true">:</span>
              ${wheelHtml("minute")}
            </div>
          </div>
        </div>`;
    }
    if (step === "device") {
      const devices = b.devices?.length
        ? b.devices
        : [
            { id: "iphone", label: "iPhone" },
            { id: "android", label: "Android phone" },
            { id: "windows", label: "Windows laptop" },
            { id: "mac", label: "Mac" },
            { id: "linux", label: "Linux laptop" },
            { id: "unknown", label: "Not sure" },
          ];
      const chip = (id: string) => {
        const d = devices.find((x) => x.id === id);
        if (!d) return "";
        return `<button type="button" class="chip${deviceClass === d.id ? " on" : ""}" data-device="${escapeHtml(d.id)}">${escapeHtml(d.label)}</button>`;
      };
      return `
        <p class="hint">Where did you notice the problem?</p>
        <div class="device-lines">
          <div class="device-line phones">${chip("iphone")}${chip("android")}</div>
          <div class="device-line laptops">${chip("windows")}${chip("mac")}${chip("linux")}</div>
          <div class="device-line other">${chip("unknown")}</div>
        </div>`;
    }
    if (step === "apps") {
      const showOther = apps.has("other");
      return `
        <p class="hint">Optional — tap any that apply</p>
        <div class="chips chips-pills" data-group="apps">
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
        </div>`;
    }
    return `
      <p class="hint">Which network were you on?</p>
      <div class="chips" data-group="wifi">
        ${b.ssids
          .map(
            (s) =>
              `<button type="button" class="chip${wifiContext === s.id ? " on" : ""}" data-wifi="${escapeHtml(s.id)}">${escapeHtml(s.label)}</button>`,
          )
          .join("")}
      </div>`;
  }

  function bind() {
    root.querySelectorAll<HTMLButtonElement>("[data-symptom]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.symptom!;
        if (symptoms.has(id)) {
          symptoms.delete(id);
          btn.classList.remove("on");
        } else if (symptoms.size < 3) {
          symptoms.add(id);
          btn.classList.add("on");
        }
        setError("");
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
        } else {
          apps.add(id);
          btn.classList.add("on");
          if (id === "other") {
            const box = root.querySelector<HTMLElement>(".other-app");
            if (box) {
              box.hidden = false;
              root.querySelector<HTMLInputElement>("#other-app")?.focus();
            }
          }
        }
        saveDraft();
      });
    });
    root.querySelector<HTMLInputElement>("#other-app")?.addEventListener("input", (e) => {
      otherApp = (e.target as HTMLInputElement).value.trim().slice(0, 80);
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
    root.querySelectorAll<HTMLButtonElement>("[data-device]").forEach((btn) => {
      btn.addEventListener("click", () => {
        deviceClass = btn.dataset.device!;
        root.querySelectorAll<HTMLButtonElement>("[data-device]").forEach((el) => el.classList.remove("on"));
        btn.classList.add("on");
        setError("");
        saveDraft();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-wifi]").forEach((btn) => {
      btn.addEventListener("click", () => {
        wifiContext = btn.dataset.wifi!;
        root.querySelectorAll<HTMLButtonElement>("[data-wifi]").forEach((el) => el.classList.remove("on"));
        btn.classList.add("on");
        saveDraft();
      });
    });
    root.querySelector("[data-action='next']")?.addEventListener("click", () => void goNext());
    root.querySelector("[data-action='back']")?.addEventListener("click", () => {
      syncOtherAppInput();
      if (stepIndex > 0) {
        stepIndex -= 1;
        setError("");
        saveDraft();
        render();
      }
    });
    root.querySelector("[data-action='toggle-cal']")?.addEventListener("click", () => {
      calOpen = !calOpen;
      saveDraft();
      render();
    });
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
        saveDraft();
        render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-hour]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        exactHour = Number(btn.dataset.hour);
        exactTouched = true;
        clampExactToNow();
        saveDraft();
        render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-minute]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        exactMinute = Number(btn.dataset.minute);
        exactTouched = true;
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
        const z = b.zones.find((x) => x.id === id);
        const priorHere = readDone(id);
        zoneId = id;
        zoneLabel = z?.label ?? id;
        zoneFloor = z?.floor ?? null;
        zoneSource = id === b.zone.id ? "qr" : "override";
        if (priorHere) {
          phase = "done";
          recentCount = priorHere.recentCount;
          alreadySubmitted = true;
          clearDraft();
          render();
          return;
        }
        saveDraft();
        render();
      });
    });
  }

  async function submitReport(): Promise<boolean> {
    if (symptoms.size === 0) {
      setError("Pick at least one symptom to continue.");
      return false;
    }
    // Client already-done guard (server still enforces rate limits)
    const priorHere = readDone(zoneId);
    if (priorHere) {
      recentCount = priorHere.recentCount;
      alreadySubmitted = true;
      phase = "done";
      clearDraft();
      render();
      return false;
    }
    setBusyUi(true);
    setError("");
    try {
      const fill_ms = await waitMinFill();
      const hp = (document.getElementById("hp") as HTMLInputElement | null)?.value ?? "";
      if (otherApp && !apps.has("other")) apps.add("other");
      const clarifiers = clarifierPayload();
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
          wifi_context: wifiContext,
          clarifiers,
          device_class: deviceClass,
          fill_ms,
          session_token: sessionToken(),
          website: hp,
        }),
      });
      const data = (await res.json()) as {
        report_id?: string;
        recent_count?: number;
        error?: string;
      };
      if (!res.ok) {
        const code = data.error || "save_failed";
        if (code === "rate_limited_zone") {
          markDone(zoneId, recentCount);
          alreadySubmitted = true;
          phase = "done";
          clearDraft();
          render();
          return false;
        }
        throw new Error(friendlySubmitError(code));
      }
      recentCount = data.recent_count ?? 0;
      markDone(zoneId, recentCount);
      alreadySubmitted = false;
      clearDraft();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
      return false;
    } finally {
      setBusyUi(false);
    }
  }

  function clarifierPayload(): Record<string, string> {
    if (apps.has("other") && otherApp) return { other_app: otherApp };
    return {};
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

  async function goNext() {
    if (busy) return;
    const step = steps[stepIndex];
    setError("");
    syncOtherAppInput();

    if (step === "symptoms" && symptoms.size === 0) {
      setError("Pick at least one symptom to continue.");
      return;
    }
    if (step === "device" && !deviceClass) {
      setError("Pick which device you were on.");
      return;
    }

    // Only write to the server on the final Submit — earlier steps stay local
    // so a mid-flow API restart can't leave orphan rows.
    if (stepIndex >= steps.length - 1) {
      const ok = await submitReport();
      if (!ok) return;
      const card = root.querySelector(".step-card");
      card?.classList.add("fade-out");
      await new Promise((r) => setTimeout(r, 220));
      phase = "done";
      clearDraft();
      render();
      return;
    }

    stepIndex += 1;
    saveDraft();
    updateProgress();
    render();
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
