type Chip = { id: string; label: string };
type Clarifier = { id: string; question: string; options: Chip[] };
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

type StepId = "symptoms" | "clarifier" | "apps" | "when" | "wifi";

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

async function run(b: Bootstrap) {
  const started = Date.now();
  let zoneId = b.zone.id;
  let zoneSource: "qr" | "override" = "qr";
  let zoneLabel = b.zone.label;
  const symptoms = new Set<string>();
  const apps = new Set<string>();
  let whenBucket = "now";
  let wifiContext = "unknown";
  const clarifiers: Record<string, string> = {};
  let reportId: string | null = null;
  let editToken: string | null = null;
  let clarifierShown: Clarifier | null = null;
  let errorMsg = "";
  let phase: "form" | "done" = "form";
  let recentCount = 0;
  let busy = false;
  let stepIndex = 0;
  /** Always 5 quick steps; clarifier may be a skip if API returns none. */
  const steps: StepId[] = ["symptoms", "clarifier", "apps", "when", "wifi"];
  let renderedStep: StepId | null = null;

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
    const total = steps.length;
    const current = stepIndex + 1;
    const pct = Math.round((current / total) * 100);
    const meta = root.querySelector(".progress-meta");
    const fill = root.querySelector<HTMLElement>(".progress-fill");
    const wrap = root.querySelector(".progress");
    if (meta) {
      meta.innerHTML = `<span>${current} / ${total}</span><span>${pct}%</span>`;
    }
    if (fill) fill.style.width = `${pct}%`;
    if (wrap) wrap.setAttribute("aria-label", `Step ${current} of ${total}`);
  }

  function render() {
    if (phase === "done") {
      root.innerHTML = doneHtml(recentCount);
      return;
    }

    const step = steps[stepIndex] ?? "symptoms";
    const total = steps.length;
    const current = stepIndex + 1;
    const pct = Math.round((current / total) * 100);
    const stepChanged = renderedStep !== step;
    renderedStep = step;

    root.innerHTML = `
      <header class="header">
        <div class="brand-row">
          <img class="logo-norrsken" src="/qr/norrsken-logo-dark.svg" alt="Norrsken" />
        </div>
        <p class="eyebrow">Network feedback</p>
        <div class="zone-row">
          <h1 class="zone-label">${escapeHtml(zoneLabel)}</h1>
          <button type="button" class="not-here" data-action="not-here">Not here?</button>
        </div>
        <p class="privacy">Anonymous. We don’t collect your name or email.</p>
      </header>

      <div class="progress" aria-label="Step ${current} of ${total}">
        <div class="progress-meta">
          <span>${current} / ${total}</span>
          <span>${pct}%</span>
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
              : `<span></span>`
          }
          <button type="button" class="btn btn-primary" data-action="next" ${busy ? "disabled" : ""}>
            ${busy ? "Saving…" : stepIndex === total - 1 ? "Submit ✔" : "Continue"}
          </button>
        </div>
      </section>

      <div id="override-panel" hidden class="card override-card">
        <h2>Where are you?</h2>
        <select class="select" id="zone-select">
          ${b.zones
            .map(
              (z) =>
                `<option value="${escapeHtml(z.id)}" ${z.id === zoneId ? "selected" : ""}>${escapeHtml(z.label)}</option>`,
            )
            .join("")}
        </select>
        <div class="actions">
          <button type="button" class="btn" data-action="cancel-override">Cancel</button>
          <button type="button" class="btn btn-primary" data-action="apply-override">Use this place</button>
        </div>
      </div>

      ${poweredByHtml()}
    `;
    bind();
  }

  function stepBody(step: StepId): string {
    if (step === "symptoms") {
      return `
        <h2>What happened?</h2>
        <p class="hint">Tap one or more (max 3)</p>
        <div class="chips" data-group="symptoms">
          ${b.symptoms
            .map(
              (s) =>
                `<button type="button" class="chip${symptoms.has(s.id) ? " on" : ""}" data-symptom="${escapeHtml(s.id)}">${escapeHtml(s.label)}</button>`,
            )
            .join("")}
        </div>`;
    }
    if (step === "clarifier") {
      if (!clarifierShown) {
        return `
          <h2>Any more detail?</h2>
          <p class="hint">Nothing extra needed — continue.</p>`;
      }
      return `
        <h2>${escapeHtml(clarifierShown.question)}</h2>
        <p class="hint">Optional — helps Network Ops</p>
        <div class="chips" data-group="clarifier">
          ${clarifierShown.options
            .map(
              (o) =>
                `<button type="button" class="chip${clarifiers[clarifierShown!.id] === o.id ? " on" : ""}" data-clarifier="${escapeHtml(clarifierShown!.id)}" data-value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</button>`,
            )
            .join("")}
          <button type="button" class="chip ghost" data-clarifier-skip>Skip</button>
        </div>`;
    }
    if (step === "apps") {
      return `
        <h2>Which app?</h2>
        <p class="hint">Optional</p>
        <div class="chips" data-group="apps">
          ${b.apps
            .map(
              (a) =>
                `<button type="button" class="chip${apps.has(a.id) ? " on" : ""}" data-app="${escapeHtml(a.id)}">${escapeHtml(a.label)}</button>`,
            )
            .join("")}
        </div>`;
    }
    if (step === "when") {
      return `
        <h2>When?</h2>
        <div class="chips" data-group="when">
          ${b.when
            .map(
              (w) =>
                `<button type="button" class="chip${whenBucket === w.id ? " on" : ""}" data-when="${escapeHtml(w.id)}">${escapeHtml(w.label)}</button>`,
            )
            .join("")}
        </div>`;
    }
    return `
      <h2>Which Wi‑Fi?</h2>
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
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-app]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.app!;
        if (apps.has(id)) {
          apps.delete(id);
          btn.classList.remove("on");
        } else {
          apps.add(id);
          btn.classList.add("on");
        }
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-when]").forEach((btn) => {
      btn.addEventListener("click", () => {
        whenBucket = btn.dataset.when!;
        root.querySelectorAll<HTMLButtonElement>("[data-when]").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-wifi]").forEach((btn) => {
      btn.addEventListener("click", () => {
        wifiContext = btn.dataset.wifi!;
        root.querySelectorAll<HTMLButtonElement>("[data-wifi]").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-clarifier]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.clarifier!;
        const value = btn.dataset.value!;
        clarifiers[key] = value;
        if (key === "wifi_context") wifiContext = value;
        root.querySelectorAll<HTMLButtonElement>("[data-clarifier]").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
      });
    });
    root.querySelector("[data-clarifier-skip]")?.addEventListener("click", () => {
      if (clarifierShown) delete clarifiers[clarifierShown.id];
      void goNext(true);
    });
    root.querySelector("[data-action='next']")?.addEventListener("click", () => void goNext(false));
    root.querySelector("[data-action='back']")?.addEventListener("click", () => {
      if (stepIndex > 0) {
        stepIndex -= 1;
        setError("");
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
    root.querySelector("[data-action='apply-override']")?.addEventListener("click", () => {
      const sel = root.querySelector<HTMLSelectElement>("#zone-select");
      if (!sel) return;
      zoneId = sel.value;
      zoneLabel = b.zones.find((z) => z.id === zoneId)?.label ?? zoneId;
      zoneSource = "override";
      const labelEl = root.querySelector(".zone-label");
      if (labelEl) labelEl.textContent = zoneLabel;
      const panel = root.querySelector<HTMLElement>("#override-panel");
      if (panel) panel.hidden = true;
    });
  }

  async function ensureReportCreated(): Promise<boolean> {
    if (reportId) return true;
    if (symptoms.size === 0) {
      setError("Pick at least one symptom to continue.");
      return false;
    }
    setBusyUi(true);
    setError("");
    try {
      const fill_ms = await waitMinFill();
      const hp = (document.getElementById("hp") as HTMLInputElement | null)?.value ?? "";
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zone_id: zoneId,
          zone_source: zoneSource,
          channel: "qr",
          symptoms: [...symptoms],
          apps: [],
          when_bucket: whenBucket,
          wifi_context: wifiContext,
          clarifiers: {},
          device_class: deviceClass(),
          fill_ms,
          session_token: sessionToken(),
          website: hp,
        }),
      });
      const data = (await res.json()) as {
        report_id?: string;
        edit_token?: string;
        clarifiers?: Clarifier[];
        recent_count?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "save_failed");
      reportId = data.report_id!;
      editToken = data.edit_token!;
      recentCount = data.recent_count ?? 0;
      clarifierShown = data.clarifiers?.[0] ?? null;
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
      return false;
    } finally {
      setBusyUi(false);
    }
  }

  async function patch(body: Record<string, unknown>) {
    if (!reportId || !editToken) return;
    const res = await fetch(`/api/reports/${reportId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-edit-token": editToken,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { recent_count?: number; error?: string };
    if (!res.ok) throw new Error(data.error || "update_failed");
    if (typeof data.recent_count === "number") recentCount = data.recent_count;
  }

  async function goNext(fromSkip: boolean) {
    if (busy) return;
    const step = steps[stepIndex];
    setError("");

    if (step === "symptoms") {
      const ok = await ensureReportCreated();
      if (!ok) return;
      stepIndex = 1;
      render();
      return;
    }

    setBusyUi(true);
    try {
      if (step === "clarifier" && !fromSkip && clarifierShown) {
        const key = clarifierShown.id;
        const value = clarifiers[key];
        if (value) {
          await patch({
            clarifiers: key === "wifi_context" ? {} : { [key]: value },
            ...(key === "wifi_context" ? { wifi_context: value } : {}),
          });
        }
      } else if (step === "apps") {
        await patch({ apps: [...apps] });
      } else if (step === "when") {
        await patch({ when_bucket: whenBucket });
      } else if (step === "wifi") {
        await patch({ wifi_context: wifiContext });
      }

      if (stepIndex >= steps.length - 1) {
        await finish();
        return;
      }
      stepIndex += 1;
      updateProgress();
      render();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyUi(false);
    }
  }

  async function finish() {
    const clarifierPayload = Object.fromEntries(
      Object.entries(clarifiers).filter(([k]) => k !== "wifi_context"),
    );
    if (reportId) {
      await patch({
        symptoms: [...symptoms],
        apps: [...apps],
        when_bucket: whenBucket,
        wifi_context: wifiContext,
        ...(Object.keys(clarifierPayload).length ? { clarifiers: clarifierPayload } : {}),
      });
    }
    const card = root.querySelector(".step-card");
    card?.classList.add("fade-out");
    await new Promise((r) => setTimeout(r, 220));
    phase = "done";
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

function doneHtml(recentCount: number): string {
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
    </div>
    ${poweredByHtml()}
  `;
}
