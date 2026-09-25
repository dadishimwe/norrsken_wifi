import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { opsApi, type OpsZone, type ZoneQr } from "./api";
import { AlertDialog, ConfirmDialog } from "./ConfirmDialog";
import { buildPrintFlyerHtml } from "./printFlyer";
import { CustomSelect } from "./CustomSelect";

const KIND_OPTIONS = [
  { value: "area", label: "Area / desks" },
  { value: "booth", label: "Booth" },
  { value: "event", label: "Event" },
  { value: "common", label: "Common" },
] as const;

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function zoneUsed(z: OpsZone): boolean {
  return Number(z.report_count ?? 0) > 0;
}

type QrState = ZoneQr & {
  zone: { id: string; label: string; floor: string | null; kind: string };
};

type Props = { canEdit: boolean };

type ConfirmKind = "disable" | "enable" | "delete";

type Pending = { kind: ConfirmKind; zone: OpsZone };

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
  const [pending, setPending] = useState<Pending | null>(null);
  const [blocked, setBlocked] = useState<{ title: string; body: string } | null>(null);

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

  function requestToggle(z: OpsZone) {
    if (!canEdit) return;
    if (z.active && zoneUsed(z)) {
      setBlocked({
        title: "Can’t disable this zone",
        body: `“${z.label}” already has ${z.report_count} report${Number(z.report_count) === 1 ? "" : "s"}. Zones that have been used can’t be disabled or deleted.`,
      });
      return;
    }
    setPending({ kind: z.active ? "disable" : "enable", zone: z });
  }

  function requestDelete(z: OpsZone) {
    if (!canEdit) return;
    if (zoneUsed(z)) {
      setBlocked({
        title: "Can’t delete this zone",
        body: `“${z.label}” already has ${z.report_count} report${Number(z.report_count) === 1 ? "" : "s"}. Zones that have been used can’t be disabled or deleted.`,
      });
      return;
    }
    setPending({ kind: "delete", zone: z });
  }

  async function runPending() {
    if (!pending || !canEdit) return;
    const { kind: action, zone: z } = pending;
    setBusy(true);
    setError(null);
    try {
      if (action === "delete") {
        await opsApi.deleteZone(z.id);
        flash("Zone deleted");
        if (qr?.zone.id === z.id) setQr(null);
      } else {
        await opsApi.patchZone(z.id, { active: action === "enable" });
        flash(action === "disable" ? "Zone disabled" : "Zone enabled");
      }
      setPending(null);
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "action_failed";
      if (msg === "zone_has_reports") {
        setPending(null);
        setBlocked({
          title: action === "delete" ? "Can’t delete this zone" : "Can’t disable this zone",
          body: `“${z.label}” has reports on file. Used zones can’t be disabled or deleted.`,
        });
      } else {
        setError(msg);
        flash(`Failed: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.url);
      flash("Link copied to clipboard");
    } catch {
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

  const confirmTitle =
    pending?.kind === "delete"
      ? "Delete this zone?"
      : pending?.kind === "disable"
        ? "Disable this zone?"
        : "Enable this zone?";

  const confirmBody =
    pending?.kind === "delete"
      ? `Permanently remove “${pending.zone.label}”? Only unused zones can be deleted. This cannot be undone.`
      : pending?.kind === "disable"
        ? `Turn off “${pending.zone.label}”? Guests won’t be able to open its QR link until you enable it again.`
        : pending
          ? `Turn “${pending.zone.label}” back on so its QR / link works again?`
          : "";

  return (
    <div className="grid-2">
      {toast ? <div className="toast">{toast}</div> : null}
      <ConfirmDialog
        open={!!pending}
        title={confirmTitle}
        body={confirmBody}
        confirmLabel={
          pending?.kind === "delete"
            ? "Delete zone"
            : pending?.kind === "disable"
              ? "Disable"
              : "Enable"
        }
        tone={pending?.kind === "enable" ? "default" : "danger"}
        busy={busy}
        onCancel={() => !busy && setPending(null)}
        onConfirm={() => void runPending()}
      />
      <AlertDialog
        open={!!blocked}
        title={blocked?.title ?? ""}
        body={blocked?.body ?? ""}
        onClose={() => setBlocked(null)}
      />

      <section className="panel">
        <h2>Zones</h2>
        <p className="muted" style={{ marginBottom: "1rem" }}>
          Create spaces, generate QR / shareable links. Guests open the link — no login. Zones with
          reports can’t be disabled or deleted.
        </p>
        {error ? <p className="error">{error}</p> : null}
        <div className="table-wrap">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Kind</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => {
                const used = zoneUsed(z);
                return (
                  <tr key={z.id}>
                    <td>
                      <strong>{z.label}</strong>
                      <div className="muted">
                        {z.id}
                        {z.floor ? ` · floor ${z.floor}` : ""}
                        {used ? ` · ${z.report_count} reports` : ""}
                      </div>
                    </td>
                    <td>{z.kind}</td>
                    <td>{z.active ? "active" : "off"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => showQr(z.id)}
                        disabled={!z.active}
                      >
                        QR / link
                      </button>
                      {canEdit ? (
                        <>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => setEditing(z)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => requestToggle(z)}
                            title={
                              z.active && used
                                ? "Zones with reports can’t be disabled"
                                : undefined
                            }
                          >
                            {z.active ? "Disable" : "Enable"}
                          </button>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => requestDelete(z)}
                            title={used ? "Zones with reports can’t be deleted" : undefined}
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
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
                    <CustomSelect
                      label="Kind"
                      value={editing.kind}
                      onChange={(v) => setEditing({ ...editing, kind: v })}
                      options={[...KIND_OPTIONS]}
                      disabled={busy}
                    />
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
                  <CustomSelect
                    label="Kind"
                    value={kind}
                    onChange={(v) => setKind(v as typeof kind)}
                    options={[...KIND_OPTIONS]}
                    disabled={busy}
                  />
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
              Print flyer uses the partnership poster layout with this zone’s location. Add Zuba
              logos under <code>apps/web/brand/</code> if they don’t appear yet.
            </p>
          </section>
        ) : (
          <section className="panel">
            <h2>Share a report link</h2>
            <p className="muted">
              Click <strong>QR / link</strong>, then Copy link or Print. Same URL works on laptop or
              phone.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
