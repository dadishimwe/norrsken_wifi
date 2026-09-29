import { useEffect, useState } from "react";
import { opsApi, type IntegrationsPayload, type ZoneQr } from "./api";
import { SlackIcon } from "./marks";
import { buildPrintFlyerHtml } from "./printFlyer";

type QrState = ZoneQr & {
  zone: { id: string; label: string; floor: string | null; kind: string };
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function alertHint(error: string | null, ok: boolean): string {
  if (ok) return "Delivered";
  if (error === "not_in_channel") return "Invite the bot into that channel";
  if (error === "channel_not_found") return "Check the channel ID";
  if (error === "missing_scope") return "The bot cannot post there";
  if (error === "invalid_auth" || error === "not_authed") return "The bot token is not valid";
  if (error === "connect_failed") return "Could not open the Slack connection";
  if (error === "missing_signing_secret") return "The Slack signing secret is missing";
  return error || "Not delivered";
}

export function IntegrationsView() {
  const [qr, setQr] = useState<QrState | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [slack, setSlack] = useState<IntegrationsPayload | null>(null);
  const [slackError, setSlackError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    opsApi
      .reportQr()
      .then(setQr)
      .catch(() => setQrError("Could not load the report QR."));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await opsApi.integrations();
        if (!cancelled) {
          setSlack(data);
          setSlackError(null);
        }
      } catch {
        if (!cancelled) setSlackError("Could not load Slack status.");
      }
    }
    load();
    const id = window.setInterval(load, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  async function copyLink() {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.url);
      flash("Link copied");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = qr.url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      flash("Link copied");
    }
  }

  function printQr() {
    if (!qr) return;
    setPrintError(null);
    const html = buildPrintFlyerHtml(qr, import.meta.env.BASE_URL);
    const prev = document.getElementById("norrsken-print-frame");
    prev?.remove();
    const iframe = document.createElement("iframe");
    iframe.id = "norrsken-print-frame";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      setPrintError("Could not prepare print view. Try again.");
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    let printed = false;
    const trigger = () => {
      if (printed) return;
      printed = true;
      try {
        win.focus();
        win.print();
      } finally {
        window.setTimeout(() => iframe.remove(), 800);
      }
    };
    const imgs = [...doc.querySelectorAll("img")];
    let pendingImgs = imgs.filter((img) => !img.complete).length;
    if (pendingImgs === 0) {
      window.setTimeout(trigger, 80);
      return;
    }
    const done = () => {
      pendingImgs -= 1;
      if (pendingImgs <= 0) trigger();
    };
    imgs.forEach((img) => {
      if (img.complete) return;
      img.addEventListener("load", done);
      img.addEventListener("error", done);
    });
    window.setTimeout(trigger, 2000);
  }

  const connection = slack?.slack;
  const reports = slack?.reports;
  const connected = connection?.connected === true;
  const connectionLabel = !connection
    ? "Loading"
    : !connection.configured
      ? "Not configured"
      : connected
        ? "Connected"
        : "Not connected";

  return (
    <div className="grid-2">
      {toast ? <div className="toast">{toast}</div> : null}
      <section className="panel qr-panel">
        <h2>Report QR</h2>
        {qr ? (
          <>
            <div className="qr-preview">
              <img src={qr.png_data_url} alt="Report QR code" width={200} height={200} />
            </div>
            <div className="qr-actions">
              <button className="btn btn-primary" type="button" onClick={copyLink}>
                Copy link
              </button>
              <button className="btn" type="button" onClick={printQr}>
                Print flyer
              </button>
              <a className="btn" href={qr.url} target="_blank" rel="noreferrer">
                Open report page
              </a>
            </div>
            <p className="muted qr-url-hint">
              One code for the house. People type their company or place on the form.
            </p>
            {printError ? <p className="error">{printError}</p> : null}
          </>
        ) : (
          <p className="muted">{qrError ?? "Loading the report QR…"}</p>
        )}
        <div className="stat-rows" style={{ marginTop: 24 }}>
          <div>
            <span>QR reports · 24h</span>
            <strong>{reports?.qr_24h ?? "—"}</strong>
          </div>
          <div>
            <span>Last QR report</span>
            <strong>{timeAgo(reports?.last_qr_at)}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="with-mark">
          <SlackIcon /> Slack
        </h2>
        {slackError ? <p className="error">{slackError}</p> : null}
        <div className="stat-rows">
          <div>
            <span>Connection</span>
            <strong>
              <span
                className={`status-dot${connected ? "" : connection?.configured ? " bad" : " warn"}`}
              />{" "}
              {connectionLabel}
            </strong>
          </div>
          <div>
            <span>Workspace</span>
            <strong>{connection?.team_name || "—"}</strong>
          </div>
          <div>
            <span>Bot</span>
            <strong>{connection?.bot_name || "—"}</strong>
          </div>
          <div>
            <span>Link</span>
            <strong>
              {connection?.mode === "socket"
                ? "Socket"
                : connection?.mode === "http"
                  ? "HTTP"
                  : "—"}
            </strong>
          </div>
          <div>
            <span>Alerts channel</span>
            <strong>{connection?.alerts_channel || "Not set"}</strong>
          </div>
          <div>
            <span>Last alert</span>
            <strong>
              {connection?.last_alert
                ? `${timeAgo(connection.last_alert.at)} · ${alertHint(connection.last_alert.error, connection.last_alert.ok)}`
                : "None yet"}
            </strong>
          </div>
          <div>
            <span>Last Slack report</span>
            <strong>{timeAgo(reports?.last_slack_at)}</strong>
          </div>
          <div>
            <span>Slack reports · 24h</span>
            <strong>{reports?.slack_24h ?? "—"}</strong>
          </div>
          <div>
            <span>I'm affected too · 24h</span>
            <strong>{reports?.metoo_24h ?? "—"}</strong>
          </div>
          <div>
            <span>Slack reports · 7d</span>
            <strong>{reports?.slack_7d ?? "—"}</strong>
          </div>
        </div>
        {connection?.error && !connected ? (
          <p className="muted" style={{ marginTop: 16 }}>
            {alertHint(connection.error, false)}
          </p>
        ) : null}
      </section>
    </div>
  );
}
