import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { opsApi, type OpsUser } from "./api";
import { CustomSelect } from "./CustomSelect";

const ROLE_OPTIONS = [
  { value: "viewer", label: "Viewer — dashboard only" },
  { value: "admin", label: "Admin — manage users & zones" },
] as const;

export function UsersAdmin() {
  const [users, setUsers] = useState<OpsUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const { users: list } = await opsApi.users();
    setUsers(list);
  }

  useEffect(() => {
    reload().catch(() => setError("Could not load users (admin only)."));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await opsApi.createUser({
        username,
        display_name: displayName,
        password,
        role,
      });
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole("viewer");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "create_failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: OpsUser) {
    setError(null);
    try {
      await opsApi.patchUser(u.id, { active: !u.active });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    }
  }

  async function resetPassword(u: OpsUser) {
    const next = window.prompt(`New password for ${u.username} (min 12 chars)`);
    if (!next) return;
    if (next.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    try {
      await opsApi.patchUser(u.id, { password: next });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    }
  }

  return (
    <div className="grid-2">
      <section className="panel">
        <h2>Create account</h2>
        <p className="muted" style={{ marginBottom: "1rem" }}>
          Each monitor gets their own login. Admins can manage users; viewers see the dashboard only.
        </p>
        {error ? <p className="error">{error}</p> : null}
        <form onSubmit={onCreate}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="new-username">Username</label>
              <input
                id="new-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                pattern="[A-Za-z0-9._-]+"
              />
            </div>
            <div className="field">
              <label htmlFor="new-display">Display name</label>
              <input
                id="new-display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="new-password">Temporary password</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
              />
            </div>
            <div className="field">
              <CustomSelect
                label="Role"
                value={role}
                onChange={(v) => setRole(v as "admin" | "viewer")}
                options={[...ROLE_OPTIONS]}
                disabled={busy}
              />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create user"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Team accounts</h2>
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.display_name}</strong>
                  <div className="muted">@{u.username}</div>
                </td>
                <td>{u.role}</td>
                <td>{u.active === false ? "disabled" : "active"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-ghost" type="button" onClick={() => resetPassword(u)}>
                    Reset pw
                  </button>{" "}
                  <button className="btn btn-ghost" type="button" onClick={() => toggleActive(u)}>
                    {u.active === false ? "Enable" : "Disable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
