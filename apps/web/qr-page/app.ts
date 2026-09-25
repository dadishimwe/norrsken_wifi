type Chip = { id: string; label: string };
type Zone = { id: string; label: string; floor: string | null };

type Bootstrap = {
  ok: true;
  zone: Zone;
  zones: Zone[];
  symptoms: Chip[];
  apps: Chip[];
  when: Chip[];
  ssids: Chip[];
  min_fill_ms: number;
};

type BootstrapError = { ok: false; error: string };

interface QrWindow {
  __BOOTSTRAP__: Bootstrap | BootstrapError | null;
}

type StepId = "symptoms" | "when" | "apps" | "wifi";

const STEP_TITLE: Record<StepId, string> = {
  symptoms: "What happened?",
  when: "When?",
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
  const key = "norrsken_qr_session";
  let t = sessionStorage.getItem(key);
  if (!t || t.length < 16) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    t = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem(key, t);
  }
  return t;
}

function deviceClass(): "mobile" | "desktop" | "unknown" {
  const ua = navigator.userAgent;
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) return "mobile";
  if (/Windows|Macintosh|Linux/i.test(ua)) return "desktop";
  return "unknown";
}

function locationLine(label: string, floor: string | null | undefined): string {
  if (floor && floor.trim() && !label.toLowerCase().includes(floor.toLowerCase())) {
    return `${floor.trim()} · ${label}`;
  }
  return label;
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
  let wifiContext = "unknown";
  let errorMsg = "";
  let phase: "form" | "done" = "form";
  let recentCount = 0;
  let busy = false;
  let stepIndex = 0;
  const steps: StepId[] = ["symptoms", "when", "apps", "wifi"];
  let renderedStep: StepId | null = null;

  const draftKey = `norrsken_draft_${b.zone.id}`;

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
          ${doneBlock(recentCount)}
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
          <div class="zone-row">
            <h1 class="zone-label">${escapeHtml(place)}</h1>
            <button type="button" class="not-here" data-action="not-here">Not here?</button>
          </div>
          <p class="privacy">Anonymous — we don’t collect your name or email.</p>
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
        </section>

        <div id="override-panel" hidden class="card override-card">
          <h2>Where are you?</h2>
          <div class="cselect" id="zone-cselect" data-value="${escapeHtml(zoneId)}">
            <button type="button" class="cselect-trigger" data-action="toggle-zone-menu" aria-haspopup="listbox" aria-expanded="false">
              <span class="cselect-value">${escapeHtml(place)}</span>
              <span class="cselect-chevron" aria-hidden="true"></span>
            </button>
            <ul class="cselect-menu" hidden role="listbox">
              ${b.zones
                .map(
                  (z) =>
                    `<li role="option"><button type="button" class="cselect-option${z.id === zoneId ? " on" : ""}" data-zone-opt="${escapeHtml(z.id)}">${escapeHtml(locationLine(z.label, z.floor))}</button></li>`,
                )
                .join("")}
            </ul>
          </div>
          <div class="actions">
            <button type="button" class="btn" data-action="cancel-override">Cancel</button>
            <button type="button" class="btn btn-primary" data-action="apply-override">Use this place</button>
          </div>
        </div>
      </div>

      ${poweredByHtml()}
    `;
    bind();
  }

  function stepBody(step: StepId): string {
    if (step === "symptoms") {
      return `
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
        <div class="chips" data-group="when">
          ${b.when
            .map(
              (w) =>
                `<button type="button" class="chip${whenBucket === w.id ? " on" : ""}" data-when="${escapeHtml(w.id)}">${escapeHtml(w.label)}</button>`,
            )
            .join("")}
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
    root.querySelector("[data-action='not-here']")?.addEventListener("click", () => {
      const panel = root.querySelector<HTMLElement>("#override-panel");
      if (panel) panel.hidden = !panel.hidden;
    });
    root.querySelector("[data-action='cancel-override']")?.addEventListener("click", () => {
      const panel = root.querySelector<HTMLElement>("#override-panel");
      if (panel) panel.hidden = true;
    });
    root.querySelector("[data-action='toggle-zone-menu']")?.addEventListener("click", () => {
      const wrap = root.querySelector<HTMLElement>("#zone-cselect");
      const menu = wrap?.querySelector<HTMLElement>(".cselect-menu");
      const trigger = wrap?.querySelector<HTMLButtonElement>(".cselect-trigger");
      if (!menu || !trigger || !wrap) return;
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      wrap.classList.toggle("open", willOpen);
      trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    root.querySelectorAll<HTMLButtonElement>("[data-zone-opt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wrap = root.querySelector<HTMLElement>("#zone-cselect");
        const menu = wrap?.querySelector<HTMLElement>(".cselect-menu");
        const trigger = wrap?.querySelector<HTMLButtonElement>(".cselect-trigger");
        const valueEl = wrap?.querySelector(".cselect-value");
        const id = btn.dataset.zoneOpt!;
        const z = b.zones.find((x) => x.id === id);
        if (wrap) wrap.dataset.value = id;
        if (valueEl) valueEl.textContent = locationLine(z?.label ?? id, z?.floor ?? null);
        root.querySelectorAll<HTMLButtonElement>("[data-zone-opt]").forEach((el) => el.classList.remove("on"));
        btn.classList.add("on");
        if (menu) menu.hidden = true;
        wrap?.classList.remove("open");
        trigger?.setAttribute("aria-expanded", "false");
      });
    });
    root.querySelector("[data-action='apply-override']")?.addEventListener("click", () => {
      const wrap = root.querySelector<HTMLElement>("#zone-cselect");
      const nextId = wrap?.dataset.value;
      if (!nextId) return;
      const z = b.zones.find((x) => x.id === nextId);
      zoneId = nextId;
      zoneLabel = z?.label ?? nextId;
      zoneFloor = z?.floor ?? null;
      zoneSource = "override";
      saveDraft();
      const labelEl = root.querySelector(".zone-label");
      if (labelEl) labelEl.textContent = locationLine(zoneLabel, zoneFloor);
      const panel = root.querySelector<HTMLElement>("#override-panel");
      if (panel) panel.hidden = true;
    });
  }

  async function submitReport(): Promise<boolean> {
    if (symptoms.size === 0) {
      setError("Pick at least one symptom to continue.");
      return false;
    }
    setBusyUi(true);
    setError("");
    try {
      const fill_ms = await waitMinFill();
      const hp = (document.getElementById("hp") as HTMLInputElement | null)?.value ?? "";
      const clarifiers = clarifierPayload();
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
          wifi_context: wifiContext,
          clarifiers,
          device_class: deviceClass(),
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
      if (!res.ok) throw new Error(data.error || "save_failed");
      recentCount = data.recent_count ?? 0;
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

  async function goNext() {
    if (busy) return;
    const step = steps[stepIndex];
    setError("");
    syncOtherAppInput();

    if (step === "symptoms" && symptoms.size === 0) {
      setError("Pick at least one symptom to continue.");
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

function doneBlock(recentCount: number): string {
  const status =
    recentCount >= 3
      ? `${recentCount} others reported this area in the last 10 min.`
      : "Network Ops is on it.";
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
      <h1>Thanks — this helps everyone.</h1>
      <p>Your report was saved. You can close this page.</p>
      <p class="status">${escapeHtml(status)}</p>
    </div>`;
}
