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
  let creating = false;

  function render() {
    if (phase === "done") {
      root.innerHTML = doneHtml(recentCount);
      return;
    }

    root.innerHTML = `
      <header class="header">
        <p class="eyebrow">Network feedback</p>
        <div class="zone-row">
          <h1 class="zone-label">${escapeHtml(zoneLabel)}</h1>
          <button type="button" class="not-here" data-action="not-here">Not here?</button>
        </div>
      </header>
      <p class="privacy">Anonymous. We don’t collect your name or email.</p>
      <input class="hp" tabindex="-1" autocomplete="off" name="website" id="hp" />

      <section class="card" id="symptoms-card">
        <h2>What happened?</h2>
        <div class="chips">
          ${b.symptoms
            .map(
              (s) =>
                `<button type="button" class="chip${symptoms.has(s.id) ? " on" : ""}" data-symptom="${escapeHtml(s.id)}">${escapeHtml(s.label)}</button>`,
            )
            .join("")}
        </div>
        <p class="hint">Tap one or more · first tap saves your report</p>
      </section>

      ${
        clarifierShown
          ? `<section class="card" id="clarifier-card">
              <h2>One more thing? ${escapeHtml(clarifierShown.question)}</h2>
              <div class="chips">
                ${clarifierShown.options
                  .map(
                    (o) =>
                      `<button type="button" class="chip${clarifiers[clarifierShown!.id] === o.id ? " on" : ""}" data-clarifier="${escapeHtml(clarifierShown!.id)}" data-value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</button>`,
                  )
                  .join("")}
                <button type="button" class="chip ghost" data-clarifier-skip>Skip</button>
              </div>
            </section>`
          : ""
      }

      ${
        reportId
          ? `
      <section class="card">
        <h2>Which app? <span style="font-weight:500;color:var(--dim)">(optional)</span></h2>
        <div class="chips">
          ${b.apps
            .map(
              (a) =>
                `<button type="button" class="chip${apps.has(a.id) ? " on" : ""}" data-app="${escapeHtml(a.id)}">${escapeHtml(a.label)}</button>`,
            )
            .join("")}
        </div>
      </section>

      <section class="card">
        <h2>When?</h2>
        <div class="chips">
          ${b.when
            .map(
              (w) =>
                `<button type="button" class="chip${whenBucket === w.id ? " on" : ""}" data-when="${escapeHtml(w.id)}">${escapeHtml(w.label)}</button>`,
            )
            .join("")}
        </div>
      </section>

      <section class="card">
        <h2>Which Wi‑Fi?</h2>
        <div class="chips">
          ${b.ssids
            .map(
              (s) =>
                `<button type="button" class="chip${wifiContext === s.id ? " on" : ""}" data-wifi="${escapeHtml(s.id)}">${escapeHtml(s.label)}</button>`,
            )
            .join("")}
        </div>
      </section>

      <div class="actions">
        <button type="button" class="btn btn-primary" data-action="done" ${creating ? "disabled" : ""}>Done ✔</button>
      </div>`
          : ""
      }

      ${errorMsg ? `<p class="error">${escapeHtml(errorMsg)}</p>` : ""}

      <div id="override-panel" hidden class="card" style="margin-top:0.85rem">
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
    `;

    bind();
  }

  function bind() {
    root.querySelectorAll<HTMLButtonElement>("[data-symptom]").forEach((btn) => {
      btn.addEventListener("click", () => void onSymptom(btn.dataset.symptom!));
    });
    root.querySelectorAll<HTMLButtonElement>("[data-app]").forEach((btn) => {
      btn.addEventListener("click", () => void onApp(btn.dataset.app!));
    });
    root.querySelectorAll<HTMLButtonElement>("[data-when]").forEach((btn) => {
      btn.addEventListener("click", () => void onWhen(btn.dataset.when!));
    });
    root.querySelectorAll<HTMLButtonElement>("[data-wifi]").forEach((btn) => {
      btn.addEventListener("click", () => void onWifi(btn.dataset.wifi!));
    });
    root.querySelectorAll<HTMLButtonElement>("[data-clarifier]").forEach((btn) => {
      btn.addEventListener("click", () =>
        void onClarifier(btn.dataset.clarifier!, btn.dataset.value!),
      );
    });
    root.querySelector<HTMLButtonElement>("[data-clarifier-skip]")?.addEventListener("click", () => {
      clarifierShown = null;
      render();
    });
    root.querySelector<HTMLButtonElement>("[data-action='done']")?.addEventListener("click", () => {
      void finish();
    });
    root.querySelector<HTMLButtonElement>("[data-action='not-here']")?.addEventListener("click", () => {
      const panel = root.querySelector<HTMLElement>("#override-panel");
      if (panel) panel.hidden = !panel.hidden;
    });
    root.querySelector<HTMLButtonElement>("[data-action='cancel-override']")?.addEventListener(
      "click",
      () => {
        const panel = root.querySelector<HTMLElement>("#override-panel");
        if (panel) panel.hidden = true;
      },
    );
    root.querySelector<HTMLButtonElement>("[data-action='apply-override']")?.addEventListener(
      "click",
      () => {
        const sel = root.querySelector<HTMLSelectElement>("#zone-select");
        if (!sel) return;
        zoneId = sel.value;
        zoneLabel = b.zones.find((z) => z.id === zoneId)?.label ?? zoneId;
        zoneSource = "override";
        render();
      },
    );
  }

  async function waitMinFill(): Promise<number> {
    const elapsed = Date.now() - started;
    if (elapsed < b.min_fill_ms) {
      await new Promise((r) => setTimeout(r, b.min_fill_ms - elapsed));
    }
    return Date.now() - started;
  }

  async function onSymptom(id: string) {
    if (symptoms.has(id)) {
      if (symptoms.size <= 1 && reportId) return; // keep at least one after create
      symptoms.delete(id);
    } else {
      if (symptoms.size >= 3) return;
      symptoms.add(id);
    }
    errorMsg = "";
    render();

    if (!reportId) {
      if (symptoms.size === 0) return;
      creating = true;
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
      } catch (e) {
        symptoms.delete(id);
        errorMsg = e instanceof Error ? e.message : "Could not save. Try again.";
      } finally {
        creating = false;
        render();
      }
      return;
    }

    await patch({ symptoms: [...symptoms] });
  }

  async function onApp(id: string) {
    if (apps.has(id)) apps.delete(id);
    else apps.add(id);
    render();
    await patch({ apps: [...apps] });
  }

  async function onWhen(id: string) {
    whenBucket = id;
    render();
    await patch({ when_bucket: whenBucket });
  }

  async function onWifi(id: string) {
    wifiContext = id;
    render();
    await patch({ wifi_context: wifiContext });
  }

  async function onClarifier(key: string, value: string) {
    clarifiers[key] = value;
    if (key === "wifi_context") wifiContext = value;
    clarifierShown = null;
    render();
    await patch({
      clarifiers: { [key]: value },
      ...(key === "wifi_context" ? { wifi_context: value } : {}),
    });
  }

  async function patch(body: Record<string, unknown>) {
    if (!reportId || !editToken) return;
    errorMsg = "";
    try {
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
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : "Update failed";
      render();
    }
  }

  async function finish() {
    if (reportId) {
      const clarifierPayload = Object.fromEntries(
        Object.entries(clarifiers).filter(([k]) => k !== "wifi_context"),
      );
      await patch({
        symptoms: [...symptoms],
        apps: [...apps],
        when_bucket: whenBucket,
        wifi_context: wifiContext,
        ...(Object.keys(clarifierPayload).length
          ? { clarifiers: clarifierPayload }
          : {}),
      });
    }
    root.classList.add("fade-out");
    await new Promise((r) => setTimeout(r, 260));
    root.classList.remove("fade-out");
    phase = "done";
    render();
  }

  render();
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
  `;
}
