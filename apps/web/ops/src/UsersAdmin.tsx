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
  const [resetUser, setResetUser] = useState<OpsUser | null>(null);
  const [nextUsername, setNextUsername] = useState("");
  const [confirmUsername, setConfirmUsername] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function reload() {
    const { users: list } = await opsApi.users();
    setUsers(list);
  }

  useEffect(() => {
    reload().catch(() => setError("Could not load users (admin only)."));
  }, []);

  useEffect(() => {
    if (!resetUser) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) closeReset();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [resetUser, busy]);

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

  function openReset(u: OpsUser) {
    setResetUser(u);
    setNextUsername(u.username);
    setConfirmUsername("");
    setNextPassword("");
    setConfirmPassword("");
    setResetError(null);
  }

  function closeReset() {
    setResetUser(null);
    setNextUsername("");
    setConfirmUsername("");
    setNextPassword("");
    setConfirmPassword("");
    setResetError(null);
  }

  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    const usernameNext = nextUsername.trim().toLowerCase();
    const usernameChanged = usernameNext !== resetUser.username;
    const passwordFilled = nextPassword.length > 0 || confirmPassword.length > 0;
    if (!/^[a-z0-9._-]+$/i.test(usernameNext)) {
      setResetError("Username can use letters, numbers, dots, underscores, and hyphens.");
      return;
    }
    if (usernameNext !== confirmUsername.trim().toLowerCase()) {
      setResetError("Usernames do not match.");
      return;
    }
    if (!usernameChanged && !passwordFilled) {
      setResetError("Change the username or enter a new password.");
      return;
    }
    if (passwordFilled) {
      if (nextPassword.length < 12) {
        setResetError("Password must be at least 12 characters.");
        return;
      }
      if (nextPassword !== confirmPassword) {
        setResetError("Passwords do not match.");
        return;
      }
    }
    setBusy(true);
    setResetError(null);
    try {
      await opsApi.patchUser(resetUser.id, {
        ...(usernameChanged ? { username: usernameNext } : {}),
        ...(passwordFilled ? { password: nextPassword } : {}),
      });
      closeReset();
      setToast(`Account updated for @${usernameNext}`);
      window.setTimeout(() => setToast(null), 2200);
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "update_failed";
      setResetError(msg === "username_taken" ? "That username is already in use." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid-2">
      {toast ? <div className="toast">{toast}</div> : null}
      {resetUser ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!busy) closeReset();
          }}
        >
          <form
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => void saveAccount(e)}
          >
            <h3 id="reset-title">Edit account</h3>
            <p>
              Change the username for @{resetUser.username}, set a new password, or both. Leave the
              password fields blank to keep the current password.
            </p>
            {resetError ? <p className="error">{resetError}</p> : null}
            <div className="field">
              <label htmlFor="edit-username">Username</label>
              <input
                id="edit-username"
                autoComplete="off"
                value={nextUsername}
                onChange={(e) => setNextUsername(e.target.value)}
                pattern="[A-Za-z0-9._-]+"
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="edit-username-confirm">Confirm username</label>
              <input
                id="edit-username-confirm"
                autoComplete="off"
                value={confirmUsername}
                onChange={(e) => setConfirmUsername(e.target.value)}
                pattern="[A-Za-z0-9._-]+"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="reset-password">New password</label>
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="reset-confirm">Confirm password</label>
              <input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn" type="button" onClick={() => !busy && closeReset()} disabled={busy}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
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
                  <button className="btn btn-ghost" type="button" onClick={() => openReset(u)}>
                    Edit
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
