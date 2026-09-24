import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { opsApi, type OpsZone, type ZoneQr } from "./api";
import { buildPrintFlyerHtml } from "./printFlyer";

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

type QrState = ZoneQr & {
  zone: { id: string; label: string; floor: string | null; kind: string };
};

type Props = { canEdit: boolean };

export function ZonesAdmin({ canEdit }: Props) {
  const [zones, setZones] = useState<OpsZone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [id, setId] = useState("");
  const [floor, setFloor] = useState("");
  const [kind, setKind] = useState<"area" | "booth" | "event" | "common">("area");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<QrState | null>(null);
  const [editing, setEditing] = useState<OpsZone | null>(null);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

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
      await opsApi.createZone({
        id: id.trim() || slugify(label),
        label: label.trim(),
        floor: floor.trim() || null,
        kind,
      });
      setLabel("");
      setId("");
      setFloor("");
      setKind("area");
      await reload();
      flash("Zone created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "create_failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || !editing) return;
    setBusy(true);
    try {
      await opsApi.patchZone(editing.id, {
        label: editing.label,
        floor: editing.floor,
        kind: editing.kind as "area" | "booth" | "event" | "common",
      });
      setEditing(null);
      await reload();
      flash("Zone updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    } finally {
      setBusy(false);
    }
  }

  async function showQr(zoneId: string) {
    setError(null);
    try {
      setQr(await opsApi.zoneQr(zoneId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "qr_failed");
    }
  }

  async function toggleActive(z: OpsZone) {
    if (!canEdit) return;
    try {
      await opsApi.patchZone(z.id, { active: !z.active });
      await reload();
      flash(z.active ? "Zone disabled" : "Zone enabled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    }
  }

  async function removeZone(z: OpsZone) {
    if (!canEdit) return;
    if (!window.confirm(`Delete zone “${z.label}”? Only unused zones can be fully deleted.`)) return;
    try {
      const res = await opsApi.deleteZone(z.id, false);
      if (res.disabled) {
        flash(res.message || "Disabled (has reports)");
      } else {
        flash("Zone deleted");
        if (qr?.zone.id === z.id) setQr(null);
      }
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "delete_failed";
      if (msg === "zone_has_reports") {
        const force = window.confirm(
          "This zone has reports so it can’t be deleted. Disable it instead?",
        );
        if (force) {
          await opsApi.deleteZone(z.id, true);
          await reload();
          flash("Zone disabled (has history)");
        }
      } else {
        setError(msg);
      }
    }
  }

  async function copyLink() {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.url);
      flash("Link copied to clipboard");
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = qr.url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      flash("Link copied to clipboard");
    }
  }

  function printQr() {
    if (!qr) return;
    setError(null);

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
      setError("Could not prepare print view. Try again.");
      iframe.remove();
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      window.setTimeout(() => iframe.remove(), 800);
    };

    let printed = false;
    const trigger = () => {
      if (printed) return;
      printed = true;
      try {
        win.focus();
        win.print();
      } finally {
        cleanup();
      }
    };

    const imgs = [...doc.querySelectorAll("img")];
    let pending = imgs.filter((img) => !img.complete).length;
    if (pending === 0) {
      window.setTimeout(trigger, 80);
      return;
    }
    const done = () => {
      pending -= 1;
      if (pending <= 0) trigger();
    };
    imgs.forEach((img) => {
      if (img.complete) return;
      img.addEventListener("load", done);
      img.addEventListener("error", done);
    });
    window.setTimeout(trigger, 2000);
  }

  return (
    <div className="grid-2">
      {toast ? <div className="toast">{toast}</div> : null}
      <section className="panel">
        <h2>Zones</h2>
        <p className="muted" style={{ marginBottom: "1rem" }}>
          Create spaces, generate QR / shareable links. Guests open the link — no login.
        </p>
        {error ? <p className="error">{error}</p> : null}
        <div className="table-wrap">
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
                    <div className="muted">
                      {z.id}
                      {z.floor ? ` · floor ${z.floor}` : ""}
                    </div>
                  </td>
                  <td>{z.kind}</td>
                  <td>{z.active ? "active" : "off"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-ghost" type="button" onClick={() => showQr(z.id)} disabled={!z.active}>
                      QR / link
                    </button>
                    {canEdit ? (
                      <>
                        <button className="btn btn-ghost" type="button" onClick={() => setEditing(z)}>
                          Edit
                        </button>
                        <button className="btn btn-ghost" type="button" onClick={() => toggleActive(z)}>
                          {z.active ? "Disable" : "Enable"}
                        </button>
                        <button className="btn btn-ghost" type="button" onClick={() => removeZone(z)}>
                          Delete
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div>
        {canEdit ? (
          <section className="panel" style={{ marginBottom: "1rem" }}>
            <h2>{editing ? "Edit zone" : "Create zone"}</h2>
            {editing ? (
              <form onSubmit={saveEdit}>
                <div className="field">
                  <label>Label</label>
                  <input
                    value={editing.label}
                    onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="field">
                    <label>Floor</label>
                    <input
                      value={editing.floor ?? ""}
                      onChange={(e) => setEditing({ ...editing, floor: e.target.value || null })}
                    />
                  </div>
                  <div className="field">
                    <label>Kind</label>
                    <select
                      value={editing.kind}
                      onChange={(e) => setEditing({ ...editing, kind: e.target.value })}
                    >
                      <option value="area">Area</option>
                      <option value="booth">Booth</option>
                      <option value="event">Event</option>
                      <option value="common">Common</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn btn-primary" type="submit" disabled={busy}>
                    Save
                  </button>
                  <button className="btn" type="button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
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
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="zone-id">ID</label>
                    <input
                      id="zone-id"
                      value={id}
                      onChange={(e) => setId(e.target.value)}
                      pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="zone-floor">Floor</label>
                    <input id="zone-floor" value={floor} onChange={(e) => setFloor(e.target.value)} />
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
            )}
          </section>
        ) : null}

        {qr ? (
          <section className="panel qr-panel">
            <h2>QR · {qr.zone.label}</h2>
            <div className="qr-preview">
              <img src={qr.png_data_url} alt={`QR for ${qr.zone.label}`} width={200} height={200} />
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
              Print flyer uses the partnership poster layout with this zone’s location.
              Add Zuba logos under <code>apps/web/brand/</code> if they don’t appear yet.
            </p>
          </section>
        ) : (
          <section className="panel">
            <h2>Share a report link</h2>
            <p className="muted">
              Click <strong>QR / link</strong>, then Copy link or Print. Same URL works on laptop or phone.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
