function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Public page for the bare site, so typing the flyer address opens something useful. */
export function renderHomePage(opts: { reportUrl: string | null }): string {
  const report = opts.reportUrl
    ? `<a class="btn" href="${esc(opts.reportUrl)}">Report an issue</a>`
    : `<p class="fallback">Scan the poster in the house to report an issue.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Norrsken House Kigali</title>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    min-height: 100%;
    background: #f6f5f1;
    color: #111;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
  }
  main {
    width: 100%;
    max-width: 420px;
    min-width: 0;
    background: #fff;
    border: 1px solid #e2e4e2;
    border-radius: 16px;
    padding: 28px 22px 22px;
    text-align: center;
  }
  .logo {
    margin: 0;
    font-weight: 800;
    letter-spacing: -0.03em;
    font-size: 18px;
  }
  .house {
    margin: 4px 0 22px;
    font-size: 13px;
    font-weight: 600;
  }
  h1 {
    margin: 0 0 10px;
    font-size: 26px;
    line-height: 1.15;
    letter-spacing: -0.03em;
  }
  .lead {
    margin: 0 0 22px;
    font-size: 15px;
    line-height: 1.45;
    color: #3a3a3a;
  }
  .btn {
    display: block;
    background: #111;
    color: #fff;
    text-decoration: none;
    font-weight: 700;
    border-radius: 12px;
    padding: 14px 16px;
    min-height: 48px;
  }
  .fallback {
    margin: 0;
    font-weight: 600;
  }
  .staff {
    margin: 22px 0 0;
    font-size: 13px;
  }
  .staff a { color: #111; }
</style>
</head>
<body>
<main>
  <p class="logo">&lt;norrsken&gt;</p>
  <p class="house">House Kigali</p>
  <h1>Internet slow<br>or dropping?</h1>
  <p class="lead">Tell the house team. It takes about 10 seconds. No app and no login.</p>
  ${report}
  <p class="staff"><a href="/ops/">House team</a></p>
</main>
</body>
</html>`;
}
