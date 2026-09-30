/** A4 flyer for the Norrsken House report QR. */

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

  const ink = "#111111";
  const muted = "#5c5c5c";
  const paper = "#f4f6e8";
  const lime = "#d7f25a";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>Print · Wi-Fi report</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #fff; color: ${ink};
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
    color: ${ink};
    letter-spacing: 0.01em;
  }
  h1 {
    text-align: center;
    font-size: 34px;
    line-height: 1.12;
    margin: 0 0 14px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: ${ink};
  }
  h1 .accent {
    color: ${ink};
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
    column-gap: 16px;
    row-gap: 10px;
    align-items: stretch;
    margin: 0 0 18px;
  }
  .qr-box {
    grid-column: 1;
    grid-row: 1;
    border: 2.5px dashed ${ink};
    border-radius: 18px;
    background: ${paper};
    padding: 14px;
    min-height: 78mm;
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
  .steps {
    grid-column: 2;
    grid-row: 1;
    list-style: none;
    margin: 0;
    padding: 2px 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 100%;
  }
  .steps li {
    display: grid;
    grid-template-columns: 36px 1fr;
    gap: 12px;
    margin: 0;
    align-items: center;
  }
  .num {
    width: 36px; height: 36px; border-radius: 50%;
    background: ${ink}; color: #fff;
    font-size: 16px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    line-height: 1;
  }
  .step-title {
    font-size: 18px;
    font-weight: 800;
    margin: 0 0 3px;
    color: ${ink};
    line-height: 1.15;
  }
  .step-hint {
    font-size: 14px;
    color: ${muted};
    margin: 0;
    line-height: 1.35;
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
    color: ${ink};
    font-weight: 600;
  }
  .pill.on {
    background: ${lime};
    color: ${ink};
  }
  .features {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-bottom: 20px;
  }
  .feat {
    background: ${ink};
    color: #fff;
    border-radius: 14px;
    padding: 16px 12px;
    text-align: center;
  }
  .feat strong {
    display: block;
    color: ${lime};
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
</style></head><body>
<div class="flyer">
  <div class="brand">
    <img class="logo-norrsken" src="${esc(norrsken)}" alt="Norrsken"/>
    <p class="house">House Kigali</p>
  </div>

  <h1>Internet not behaving?<span class="accent">Tell us in 10 seconds.</span></h1>
  <p class="intro">We're working to make the internet here consistently good, not just fast.
  Our monitors see the network; only you see the call that froze or the page that wouldn't load.
  Scan, answer a few questions, done. Every report is matched against what the network was doing at that moment.</p>

  <div class="mid">
    <div class="qr-box">
      <img class="qr" src="${qr.png_data_url}" alt="QR code"/>
    </div>
    <ol class="steps">
      <li><span class="num">1</span><div><p class="step-title">What happened</p><p class="step-hint">Couldn't connect, slow, call choppy, dropped</p></div></li>
      <li><span class="num">2</span><div><p class="step-title">When</p><p class="step-hint">Just now, or earlier</p></div></li>
      <li><span class="num">3</span><div><p class="step-title">Which app</p><p class="step-hint">Zoom, Teams, Meet, WhatsApp, Slack…</p></div></li>
      <li><span class="num">4</span><div><p class="step-title">Where you work</p><p class="step-hint">Company, or the place you're in</p></div></li>
    </ol>
  </div>

  <div class="pills" aria-hidden="true">
    <span class="pill">Couldn't connect</span>
    <span class="pill">Slow</span>
    <span class="pill on">Call choppy</span>
    <span class="pill">Dropped</span>
    <span class="pill">Just now</span>
    <span class="pill on">Zoom</span>
  </div>

  <div class="features">
    <div class="feat"><strong>Short form</strong><span>No login and no app to install</span></div>
    <div class="feat"><strong>Your choice</strong><span>Add contact details only if you want a reply</span></div>
    <div class="feat"><strong>Same questions</strong><span>QR code and Slack ask the same thing</span></div>
  </div>

  <div class="footer">
    <p class="disclaimer">Reports go to the Norrsken House team.
    Your details are only used to follow up on this report.</p>
  </div>
</div>
</body></html>`;
}

const phoneIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2" stroke="#111" stroke-width="2"/><path d="M11 18.5h2" stroke="#111" stroke-width="2" stroke-linecap="round"/></svg>`;
const boltIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="#111"/></svg>`;
const clockIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.25" stroke="#111" stroke-width="2"/><path d="M12 7.5V12l3 2" stroke="#111" stroke-width="2" stroke-linecap="round"/></svg>`;
const lockIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" stroke="#111" stroke-width="2"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="#111" stroke-width="2"/></svg>`;

/** Scan-first A4 flyer. The classic layout stays in buildPrintFlyerHtml. */
export function buildScanFlyerHtml(qr: PrintZoneQr, assetBase: string): string {
  const base = assetBase.endsWith("/") ? assetBase : `${assetBase}/`;
  const norrsken = `${base}norrsken-logo-dark.svg`;
  const ink = "#111111";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>Print · Scan to report</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;600;700;800&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4; margin: 12mm 16mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #fff; color: ${ink};
    font-family: "DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .flyer {
    width: 100%;
    max-width: 178mm;
    margin: 0 auto;
    min-height: 265mm;
    display: flex;
    flex-direction: column;
  }
  .brand { text-align: center; margin: 0 0 10px; }
  .logo-norrsken {
    display: block;
    height: 16px;
    width: auto;
    margin: 0 auto 4px;
  }
  .house {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  h1 {
    text-align: center;
    font-size: 54px;
    line-height: 0.98;
    margin: 8px 0 10px;
    font-weight: 800;
    letter-spacing: -0.035em;
  }
  .sub {
    text-align: center;
    font-size: 18px;
    line-height: 1.3;
    font-weight: 600;
    margin: 0 auto 18px;
    max-width: 150mm;
  }
  .scan-card {
    width: 118mm;
    margin: 0 auto 22px;
    background: #fff;
    border: 5px solid ${ink};
    border-radius: 22px;
    padding: 14px 14px 16px;
    text-align: center;
    box-shadow: 8px 8px 0 ${ink};
  }
  .scan-card img.qr {
    width: 86mm;
    height: 86mm;
    display: block;
    margin: 0 auto;
    background: #fff;
  }
  .callout {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 12px;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    line-height: 1;
  }
  .callout svg { display: block; flex: 0 0 auto; }
  .badges {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin: 4px 0 0;
  }
  .badge {
    flex: 1;
    max-width: 52mm;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1.5px solid ${ink};
    border-radius: 999px;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.15;
    text-align: left;
  }
  .badge svg { display: block; flex: 0 0 auto; }
  .spacer { flex: 1; }
  .footer {
    border-top: 1px solid #e5e7eb;
    padding-top: 12px;
    margin-top: 22px;
  }
  .disclaimer {
    font-size: 10px;
    color: #6b6b6b;
    line-height: 1.45;
    margin: 0;
    text-align: center;
  }
</style></head><body>
<div class="flyer">
  <div class="brand">
    <img class="logo-norrsken" src="${esc(norrsken)}" alt="Norrsken"/>
    <p class="house">House Kigali</p>
  </div>
  <h1>Internet slow<br>or dropping?</h1>
  <p class="sub">Help us fix it — scan to log an issue in 10 seconds.</p>
  <div class="scan-card">
    <img class="qr" src="${qr.png_data_url}" alt="QR code"/>
    <div class="callout">${phoneIcon}<span>Scan here to report</span></div>
  </div>
  <div class="badges">
    <div class="badge">${boltIcon}<span>No app required</span></div>
    <div class="badge">${clockIcon}<span>Takes 10 seconds</span></div>
    <div class="badge">${lockIcon}<span>No login needed</span></div>
  </div>
  <div class="spacer"></div>
  <div class="footer">
    <p class="disclaimer">Reports go to the Norrsken House team.
    Your details are only used to follow up on this report.</p>
  </div>
</div>
</body></html>`;
}
