/** Public page for the bare site. It does not publish the signed report link. */
export function renderHomePage(): string {
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
    height: 100%;
    color: #111;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }
  body {
    min-height: 100%;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background:
      radial-gradient(1200px 600px at 10% -10%, rgba(215, 242, 90, 0.45), transparent 55%),
      radial-gradient(900px 500px at 90% 0%, rgba(17, 17, 17, 0.03), transparent 50%),
      #f6f5f1;
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
    margin: 0;
    font-size: 15px;
    line-height: 1.45;
    color: #3a3a3a;
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
  <p class="lead">Scan the poster in the house. It takes about 10 seconds. No app and no login.</p>
  <p class="staff"><a href="https://www.norrsken.org/">Norrsken</a></p>
</main>
</body>
</html>`;
}
