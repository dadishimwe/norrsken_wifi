/** A4 flyer HTML matching the Norrsken × Zuba partnership print design. */

export type PrintZoneQr = {
  url: string;
  png_data_url: string;
  zone: {
    id: string;
    label: string;
    floor?: string | null;
    kind?: string;
  };
};

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildPrintFlyerHtml(qr: PrintZoneQr, assetBase: string): string {
  const base = assetBase.endsWith("/") ? assetBase : `${assetBase}/`;
  const norrsken = `${base}norrsken-logo-dark.svg`;
  const zuba = `${base}zuba-logo-on-light.png`;
  const locationBits = [qr.zone.label];
  if (qr.zone.floor) locationBits.push(`Floor ${qr.zone.floor}`);
  if (qr.zone.kind) locationBits.push(qr.zone.kind);
  const locationLine = locationBits.join(" · ");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>Print · ${esc(qr.zone.label)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #fff; color: #1a2332;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .flyer {
    max-width: 180mm;
    margin: 0 auto;
    padding: 4mm 2mm 2mm;
  }
  .logo-norrsken {
    display: block;
    height: 22px;
    width: auto;
    margin: 0 auto 6px;
  }
  .house {
    text-align: center;
    font-size: 11px;
    color: #5c6570;
    margin: 0 0 14px;
    letter-spacing: 0.02em;
  }
  h1 {
    text-align: center;
    font-size: 28px;
    line-height: 1.15;
    margin: 0 0 10px;
    font-weight: 800;
    color: #1a2332;
  }
  h1 .accent { color: #e85d04; display: block; }
  .intro {
    text-align: center;
    font-size: 11px;
    line-height: 1.45;
    color: #6b7280;
    max-width: 150mm;
    margin: 0 auto 16px;
  }
  .location {
    text-align: center;
    margin: 0 auto 14px;
    padding: 8px 14px;
    border: 1.5px solid #e85d04;
    border-radius: 10px;
    background: #fff7f0;
    max-width: 140mm;
  }
  .location-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #e85d04;
    font-weight: 700;
    margin: 0 0 2px;
  }
  .location-name {
    font-size: 16px;
    font-weight: 800;
    color: #1a2332;
    margin: 0;
  }
  .mid {
    display: grid;
    grid-template-columns: 1fr 1.15fr;
    gap: 14px;
    align-items: start;
    margin-bottom: 14px;
  }
  .qr-box {
    border: 2px dashed #e85d04;
    border-radius: 14px;
    background: #fff4eb;
    padding: 12px;
    text-align: center;
  }
  .qr-box img.qr {
    width: 48mm;
    height: 48mm;
    display: block;
    margin: 0 auto;
    background: #fff;
    border-radius: 6px;
  }
  .qr-caption {
    font-size: 10px;
    color: #e85d04;
    font-weight: 700;
    margin: 8px 0 0;
  }
  .steps { list-style: none; margin: 0; padding: 2px 0 0; }
  .steps li {
    display: grid;
    grid-template-columns: 22px 1fr;
    gap: 8px;
    margin-bottom: 10px;
    align-items: start;
  }
  .num {
    width: 22px; height: 22px; border-radius: 50%;
    background: #e85d04; color: #fff;
    font-size: 12px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
  }
  .step-title { font-size: 13px; font-weight: 800; margin: 0 0 2px; color: #1a2332; }
  .step-hint { font-size: 10px; color: #6b7280; margin: 0; line-height: 1.35; }
  .pills {
    display: flex; flex-wrap: wrap; gap: 6px;
    justify-content: center; margin: 0 0 16px;
  }
  .pill {
    font-size: 10px; padding: 5px 10px; border-radius: 999px;
    background: #e8eaed; color: #1a2332; font-weight: 600;
  }
  .pill.on { background: #e85d04; color: #fff; }
  .features {
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;
    margin-bottom: 14px;
  }
  .feat {
    background: #1a2332; color: #fff; border-radius: 10px;
    padding: 10px 8px; text-align: center;
  }
  .feat strong { display: block; color: #e85d04; font-size: 13px; margin-bottom: 3px; }
  .feat span { font-size: 9px; color: #c5cad3; line-height: 1.3; }
  .footer {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 12px; border-top: 1px solid #e5e7eb; padding-top: 10px;
  }
  .disclaimer {
    font-size: 8px; color: #9ca3af; line-height: 1.4; margin: 0;
    max-width: 115mm;
  }
  .logo-zuba {
    height: 28px; width: auto; display: block;
    flex-shrink: 0;
  }
  .partner-fallback {
    font-size: 10px; font-weight: 700; color: #e85d04;
    white-space: nowrap;
  }
  @media print {
    .flyer { max-width: none; }
  }
</style></head><body>
<div class="flyer">
  <img class="logo-norrsken" src="${esc(norrsken)}" alt="Norrsken"/>
  <p class="house">House Kigali</p>
  <h1>Internet not behaving?<span class="accent">Tell us in 10 seconds.</span></h1>
  <p class="intro">We're working to make the internet here consistently good, not just fast.
  Our monitors see the network; only you see the call that froze or the page that wouldn't load.
  Scan, tap a few answers, done.</p>

  <div class="location">
    <p class="location-label">This poster · location</p>
    <p class="location-name">${esc(locationLine)}</p>
  </div>

  <div class="mid">
    <div class="qr-box">
      <img class="qr" src="${qr.png_data_url}" alt="QR code for ${esc(qr.zone.label)}"/>
      <p class="qr-caption">Scan to report</p>
    </div>
    <ol class="steps">
      <li><span class="num">1</span><div><p class="step-title">What happened</p><p class="step-hint">Couldn't connect, slow, call choppy, dropped</p></div></li>
      <li><span class="num">2</span><div><p class="step-title">When</p><p class="step-hint">Just now, or earlier</p></div></li>
      <li><span class="num">3</span><div><p class="step-title">Which app</p><p class="step-hint">Zoom, Teams, Meet, WhatsApp, Slack…</p></div></li>
      <li><span class="num">4</span><div><p class="step-title">Wi‑Fi context</p><p class="step-hint">Which network you were on</p></div></li>
    </ol>
  </div>

  <div class="pills" aria-hidden="true">
    <span class="pill">Couldn't connect</span>
    <span class="pill">Slow</span>
    <span class="pill on">Call choppy</span>
    <span class="pill">Dropped</span>
    <span class="pill">Just now</span>
    <span class="pill on">Zoom</span>
    <span class="pill">${esc(qr.zone.label)}</span>
    <span class="pill">Wi‑Fi</span>
  </div>

  <div class="features">
    <div class="feat"><strong>4 taps</strong><span>No login, no app, no typing</span></div>
    <div class="feat"><strong>Anonymous</strong><span>We don't collect your name</span></div>
    <div class="feat"><strong>All good?</strong><span>Say so too, one tap</span></div>
  </div>

  <div class="footer">
    <p class="disclaimer">Reports go to the team that runs the Norrsken House network, in partnership with Zuba Broadband.
    We never see what you do online, only what you tell us here.</p>
    <img class="logo-zuba" src="${esc(zuba)}" alt="Zuba Broadband"
      onerror="this.style.display='none';this.nextElementSibling.style.display='block'"/>
    <span class="partner-fallback" style="display:none">Zuba Broadband</span>
  </div>
</div>
</body></html>`;
}
