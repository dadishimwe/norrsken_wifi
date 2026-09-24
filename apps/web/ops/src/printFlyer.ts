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
  const locationLine = locationBits.join(" · ");

  // Zuba orange + Norrsken charcoal/black
  const orange = "#E85D04";
  const navy = "#1B2430";
  const muted = "#6B7280";
  const soft = "#FFF4EB";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>Print · ${esc(qr.zone.label)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #fff; color: ${navy};
    font-family: "DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .flyer {
    width: 100%;
    max-width: 178mm;
    margin: 0 auto;
  }
  .brand {
    text-align: center;
    margin: 0 0 18px;
  }
  .logo-norrsken {
    display: block;
    height: 26px;
    width: auto;
    margin: 0 auto 6px;
  }
  .house {
    margin: 0;
    font-size: 12px;
    font-weight: 500;
    color: ${navy};
    letter-spacing: 0.01em;
  }
  h1 {
    text-align: center;
    font-size: 34px;
    line-height: 1.12;
    margin: 0 0 14px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: ${navy};
  }
  h1 .accent {
    color: ${orange};
    display: block;
  }
  .intro {
    text-align: center;
    font-size: 12.5px;
    line-height: 1.55;
    color: ${muted};
    max-width: 148mm;
    margin: 0 auto 22px;
    font-weight: 400;
  }
  .mid {
    display: grid;
    grid-template-columns: 72mm 1fr;
    gap: 18px;
    align-items: start;
    margin: 0 0 18px;
  }
  .qr-col { text-align: center; }
  .qr-box {
    border: 2.5px dashed ${orange};
    border-radius: 18px;
    background: ${soft};
    padding: 14px;
    min-height: 72mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .qr-box img.qr {
    width: 52mm;
    height: 52mm;
    display: block;
    background: #fff;
    border-radius: 4px;
  }
  .location {
    margin-top: 10px;
    font-size: 13px;
    font-weight: 700;
    color: ${navy};
  }
  .location span {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: ${orange};
    margin-bottom: 2px;
  }
  .steps {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
  }
  .steps li {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 10px;
    margin-bottom: 14px;
    align-items: start;
  }
  .num {
    width: 28px; height: 28px; border-radius: 50%;
    background: ${orange}; color: #fff;
    font-size: 14px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    line-height: 1;
  }
  .step-title {
    font-size: 15px;
    font-weight: 800;
    margin: 2px 0 3px;
    color: ${navy};
  }
  .step-hint {
    font-size: 12px;
    color: ${muted};
    margin: 0;
    line-height: 1.4;
    font-weight: 400;
  }
  .pills {
    display: flex; flex-wrap: wrap; gap: 8px;
    justify-content: flex-start;
    margin: 4px 0 22px;
  }
  .pill {
    font-size: 12px;
    padding: 7px 14px;
    border-radius: 999px;
    background: #E8EAED;
    color: ${navy};
    font-weight: 600;
  }
  .pill.on {
    background: ${orange};
    color: #fff;
  }
  .features {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-bottom: 20px;
  }
  .feat {
    background: ${navy};
    color: #fff;
    border-radius: 14px;
    padding: 16px 12px;
    text-align: center;
  }
  .feat strong {
    display: block;
    color: ${orange};
    font-size: 16px;
    font-weight: 800;
    margin-bottom: 4px;
  }
  .feat span {
    font-size: 11px;
    color: rgba(255,255,255,0.78);
    line-height: 1.35;
    font-weight: 400;
  }
  .footer {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    border-top: 1px solid #E5E7EB;
    padding-top: 14px;
  }
  .disclaimer {
    font-size: 9.5px;
    color: #9CA3AF;
    line-height: 1.45;
    margin: 0;
    max-width: 118mm;
  }
  .logo-zuba {
    height: 36px;
    width: auto;
    display: block;
    flex-shrink: 0;
  }
  .partner-fallback {
    font-size: 11px;
    font-weight: 700;
    color: ${orange};
    white-space: nowrap;
  }
</style></head><body>
<div class="flyer">
  <div class="brand">
    <img class="logo-norrsken" src="${esc(norrsken)}" alt="Norrsken"/>
    <p class="house">House Kigali</p>
  </div>

  <h1>Internet not behaving?<span class="accent">Tell us in 10 seconds.</span></h1>
  <p class="intro">We're working to make the internet here consistently good, not just fast.
  Our monitors see the network; only you see the call that froze or the page that wouldn't load.
  Scan, tap four answers, done. Every report is matched against what the network was doing at that moment.</p>

  <div class="mid">
    <div class="qr-col">
      <div class="qr-box">
        <img class="qr" src="${qr.png_data_url}" alt="QR code for ${esc(qr.zone.label)}"/>
      </div>
      <p class="location"><span>Location</span>${esc(locationLine)}</p>
    </div>
    <ol class="steps">
      <li><span class="num">1</span><div><p class="step-title">What happened</p><p class="step-hint">Couldn't connect, slow, call choppy, dropped</p></div></li>
      <li><span class="num">2</span><div><p class="step-title">When</p><p class="step-hint">Just now, or earlier</p></div></li>
      <li><span class="num">3</span><div><p class="step-title">Which app</p><p class="step-hint">Zoom, Teams, Meet, WhatsApp, Slack…</p></div></li>
      <li><span class="num">4</span><div><p class="step-title">Where you were</p><p class="step-hint">Floor or room, Wi‑Fi or wired</p></div></li>
    </ol>
  </div>

  <div class="pills" aria-hidden="true">
    <span class="pill">Couldn't connect</span>
    <span class="pill">Slow</span>
    <span class="pill on">Call choppy</span>
    <span class="pill">Dropped</span>
    <span class="pill">Just now</span>
    <span class="pill on">Zoom</span>
    <span class="pill">Meeting room</span>
    <span class="pill">Wi‑Fi</span>
  </div>

  <div class="features">
    <div class="feat"><strong>4 taps</strong><span>No login, no app, no typing</span></div>
    <div class="feat"><strong>Anonymous</strong><span>Unless you'd like a reply</span></div>
    <div class="feat"><strong>All good?</strong><span>Say so too, one tap</span></div>
  </div>

  <div class="footer">
    <p class="disclaimer">Reports go to the team that runs the Norrsken House network.
    We never see what you do online, only what you tell us here.</p>
    <img class="logo-zuba" src="${esc(zuba)}" alt="Zuba Broadband"
      onerror="this.style.display='none';this.nextElementSibling.style.display='block'"/>
    <span class="partner-fallback" style="display:none">Zuba Broadband</span>
  </div>
</div>
</body></html>`;
}
