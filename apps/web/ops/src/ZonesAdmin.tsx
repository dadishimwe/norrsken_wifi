import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { opsApi, type OpsZone, type ZoneQr } from "./api";

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

type Props = {
  canEdit: boolean;
};

export function ZonesAdmin({ canEdit }: Props) {
  const [zones, setZones] = useState<OpsZone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [id, setId] = useState("");
  const [floor, setFloor] = useState("");
  const [kind, setKind] = useState<"area" | "booth" | "event" | "common">("area");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<(ZoneQr & { zone: { id: string; label: string } }) | null>(null);
  const [copied, setCopied] = useState(false);

  async function reload() {
    const { zones: list } = await opsApi.zones();
    setZones(list);
  }

  useEffect(() => {
    reload().catch(() => setError("Could not load zones."));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError(null);
    try {
      const zoneId = id.trim() || slugify(label);
      await opsApi.createZone({
        id: zoneId,
        label: label.trim(),
        floor: floor.trim() || null,
        kind,
      });
      setLabel("");
      setId("");
      setFloor("");
      setKind("area");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "create_failed");
    } finally {
      setBusy(false);
    }
  }

  async function showQr(zoneId: string) {
    setError(null);
    setCopied(false);
    try {
      const data = await opsApi.zoneQr(zoneId);
      setQr(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "qr_failed");
    }
  }

  async function toggleActive(z: OpsZone) {
    if (!canEdit) return;
    setError(null);
    try {
      await opsApi.patchZone(z.id, { active: !z.active });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    }
  }

  async function copyLink() {
    if (!qr) return;
    await navigator.clipboard.writeText(qr.url);
    setCopied(true);
  }

  function printQr() {
    if (!qr) return;
    const w = window.open("", "_blank", "noopener,noreferrer,width=480,height=640");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${qr.zone.label}</title>
      <style>
        body{font-family:system-ui,sans-serif;text-align:center;padding:32px;color:#0a0a0a}
        img{width:280px;height:280px}
        h1{font-size:1.25rem;margin:16px 0 8px}
        p{color:#555;font-size:0.9rem}
        .url{font-size:11px;word-break:break-all;color:#888;margin-top:12px}
      </style></head><body>
      <img src="${qr.png_data_url}" alt="QR" />
      <h1>${qr.zone.label}</h1>
      <p>Wi‑Fi problem? Scan (under 10 seconds)</p>
      <div class="url">${qr.url}</div>
      <script>window.onload=()=>window.print()</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <div className="grid-2">
      <section className="panel">
        <h2>Zones</h2>
        <p className="muted" style={{ marginBottom: "1rem" }}>
          Each zone gets a signed report link and QR. Members/guests open the link (or scan) — no login.
          Set <code>PUBLIC_BASE_URL</code> so links use your VM host/domain.
        </p>
        {error ? <p className="error">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Zone</th>
              <th>Kind</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.id}>
                <td>
                  <strong>{z.label}</strong>
                  <div className="muted">{z.id}{z.floor ? ` · floor ${z.floor}` : ""}</div>
                </td>
                <td>{z.kind}</td>
                <td>{z.active ? "active" : "off"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-ghost" type="button" onClick={() => showQr(z.id)} disabled={!z.active}>
                    QR / link
                  </button>
                  {canEdit ? (
                    <>
                      {" "}
                      <button className="btn btn-ghost" type="button" onClick={() => toggleActive(z)}>
                        {z.active ? "Disable" : "Enable"}
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div>
        {canEdit ? (
          <section className="panel" style={{ marginBottom: "1rem" }}>
            <h2>Create zone</h2>
            <form onSubmit={onCreate}>
              <div className="field">
                <label htmlFor="zone-label">Label</label>
                <input
                  id="zone-label"
                  value={label}
                  onChange={(e) => {
                    setLabel(e.target.value);
                    if (!id) setId(slugify(e.target.value));
                  }}
                  placeholder="Level 2 · Booth 4"
                  required
                />
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="zone-id">ID (URL slug)</label>
                  <input
                    id="zone-id"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    placeholder="l2-booth-04"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="zone-floor">Floor</label>
                  <input
                    id="zone-floor"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    placeholder="2"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="zone-kind">Kind</label>
                <select
                  id="zone-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  <option value="area">Area / desks</option>
                  <option value="booth">Booth</option>
                  <option value="event">Event</option>
                  <option value="common">Common</option>
                </select>
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create zone"}
              </button>
            </form>
          </section>
        ) : null}

        {qr ? (
          <section className="panel">
            <h2>QR · {qr.zone.label}</h2>
            <div style={{ textAlign: "center", marginBottom: "1rem" }}>
              <img src={qr.png_data_url} alt={`QR for ${qr.zone.label}`} width={220} height={220} />
            </div>
            <p className="muted" style={{ wordBreak: "break-all", marginBottom: "0.75rem" }}>
              {qr.url}
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button className="btn btn-primary" type="button" onClick={copyLink}>
                {copied ? "Copied" : "Copy link"}
              </button>
              <button className="btn" type="button" onClick={printQr}>
                Print QR
              </button>
              <a className="btn" href={qr.url} target="_blank" rel="noreferrer">
                Open report page
              </a>
            </div>
          </section>
        ) : (
          <section className="panel">
            <h2>Test on a laptop</h2>
            <p className="muted">
              Click <strong>QR / link</strong> on a zone, then <strong>Open report page</strong> or paste the
              copied URL in any browser. Same link works for guests via chat — QR is optional.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
