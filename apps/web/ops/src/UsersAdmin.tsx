import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { opsApi, type OpsUser } from "./api";
import { CustomSelect } from "./CustomSelect";
import { companyLabel } from "./drawers";

const COMPANY_OPTIONS = [
  { value: "norrsken", label: "Norrsken" },
  { value: "zuba", label: "Zuba" },
  { value: "dct", label: "DCT" },
] as const;

const ROLE_OPTIONS = [
  { value: "viewer", label: "Viewer — read only" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super admin — manage admins" },
] as const;

function roleLabel(role: string): string {
  if (role === "super_admin") return "Super admin";
  if (role === "admin") return "Admin";
  return "Viewer";
}

function formatLastLogin(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function UsersAdmin({ me }: { me: OpsUser }) {
  const [users, setUsers] = useState<OpsUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"super_admin" | "admin" | "viewer">("viewer");
  const [company, setCompany] = useState<"norrsken" | "zuba" | "dct">("norrsken");
  const [busy, setBusy] = useState(false);
  const [resetUser, setResetUser] = useState<OpsUser | null>(null);
  const [nextUsername, setNextUsername] = useState("");
  const [confirmUsername, setConfirmUsername] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nextCompany, setNextCompany] = useState<"norrsken" | "zuba" | "dct">("norrsken");
  const [nextRole, setNextRole] = useState<"super_admin" | "admin" | "viewer">("viewer");
  const [nextAssignable, setNextAssignable] = useState(false);
  const [createAssignable, setCreateAssignable] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function reload() {
    const { users: list } = await opsApi.users();
    setUsers(list);
  }

  useEffect(() => {
    reload().catch(() => setError("Could not load users."));
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
        role: me.role === "super_admin" ? role : "viewer",
        company,
        assignable: me.role === "super_admin" ? createAssignable : false,
      });
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole("viewer");
      setCompany("norrsken");
      setCreateAssignable(false);
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
    setNextCompany(u.company ?? "norrsken");
    setNextRole(u.role);
    setNextAssignable(u.assignable === true);
    setResetError(null);
  }

  function closeReset() {
    setResetUser(null);
    setNextUsername("");
    setConfirmUsername("");
    setNextPassword("");
    setConfirmPassword("");
    setNextCompany("norrsken");
    setNextRole("viewer");
    setNextAssignable(false);
    setResetError(null);
  }

  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    const usernameNext = nextUsername.trim().toLowerCase();
    const usernameChanged = usernameNext !== resetUser.username;
    const companyChanged = nextCompany !== (resetUser.company ?? "norrsken");
    const roleChanged = me.role === "super_admin" && resetUser.id !== me.id && nextRole !== resetUser.role;
    const assignableChanged = me.role === "super_admin" && nextAssignable !== (resetUser.assignable === true);
    const passwordFilled = nextPassword.length > 0 || confirmPassword.length > 0;
    if (!/^[a-z0-9._-]+$/i.test(usernameNext)) {
      setResetError("Username can use letters, numbers, dots, underscores, and hyphens.");
      return;
    }
    if (usernameChanged && usernameNext !== confirmUsername.trim().toLowerCase()) {
      setResetError("Usernames do not match.");
      return;
    }
    if (!usernameChanged && !passwordFilled && !companyChanged && !roleChanged && !assignableChanged) {
      setResetError("Change the username, role, company, assignment, or enter a new password.");
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
        ...(companyChanged ? { company: nextCompany } : {}),
        ...(roleChanged ? { role: nextRole } : {}),
        ...(assignableChanged ? { assignable: nextAssignable } : {}),
      });
      closeReset();
      setToast(`Account updated for @${usernameNext}`);
      window.setTimeout(() => setToast(null), 2200);
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "update_failed";
      const known: Record<string, string> = {
        username_taken: "That username is already in use.",
        cannot_change_own_role: "You cannot change your own role.",
        last_super_admin: "Keep at least one active super admin.",
      };
      setResetError(known[msg] ?? msg);
    } finally {
      setBusy(false);
    }
  }

  const staff = me.role === "admin" || me.role === "super_admin";

  return (
    <div className={staff ? "grid-2" : ""}>
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
              Update @{resetUser.username}. Leave the password blank to keep the current one.
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
            {nextUsername.trim().toLowerCase() !== resetUser.username ? (
              <div className="field">
                <label htmlFor="edit-username-confirm">Confirm username</label>
                <input
                  id="edit-username-confirm"
                  autoComplete="off"
                  value={confirmUsername}
                  onChange={(e) => setConfirmUsername(e.target.value)}
                  pattern="[A-Za-z0-9._-]+"
                />
              </div>
            ) : null}
            <div className="field">
              <CustomSelect
                label="Company"
                value={nextCompany}
                onChange={(v) => setNextCompany(v as "norrsken" | "zuba" | "dct")}
                options={[...COMPANY_OPTIONS]}
                disabled={busy}
              />
            </div>
            {me.role === "super_admin" && resetUser.id !== me.id ? (
              <div className="field">
                <CustomSelect
                  label="Role"
                  value={nextRole}
                  onChange={(v) => setNextRole(v as "super_admin" | "admin" | "viewer")}
                  options={[...ROLE_OPTIONS]}
                  disabled={busy}
                />
              </div>
            ) : null}
            {me.role === "super_admin" ? (
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={nextAssignable}
                  onChange={(e) => setNextAssignable(e.target.checked)}
                />
                Can be assigned to reports
              </label>
            ) : null}
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
            {nextPassword.length > 0 ? (
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
            ) : null}
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
      {staff ? (
      <section className="panel">
        <h2>Create account</h2>
        <p className="muted" style={{ marginBottom: "1rem" }}>
          Each person gets their own login. Admins can create viewers. Super admins can also create admins.
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
                label="Company"
                value={company}
                onChange={(v) => setCompany(v as "norrsken" | "zuba" | "dct")}
                options={[...COMPANY_OPTIONS]}
                disabled={busy}
              />
            </div>
          </div>
          {me.role === "super_admin" ? (
            <div className="form-row form-row-single">
              <div className="field">
                <CustomSelect
                  label="Role"
                  value={role}
                  onChange={(v) => setRole(v as "super_admin" | "admin" | "viewer")}
                  options={[...ROLE_OPTIONS]}
                  disabled={busy}
                />
              </div>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 0 }}>
              Role: Viewer
            </p>
          )}
          {me.role === "super_admin" ? (
            <label className="check-line">
              <input
                type="checkbox"
                checked={createAssignable}
                onChange={(e) => setCreateAssignable(e.target.checked)}
              />
              Can be assigned to reports
            </label>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create user"}
          </button>
        </form>
      </section>
      ) : null}

      <section className="panel">
        <h2>Team accounts</h2>
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Company</th>
              <th>Assignable</th>
              <th>Status</th>
              <th>Last sign-in</th>
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
                <td>{roleLabel(u.role)}</td>
                <td>{companyLabel(u.company)}</td>
                <td>
                  {me.role === "super_admin" ? (
                    <input
                      type="checkbox"
                      aria-label={`Assignable ${u.display_name}`}
                      checked={u.assignable === true}
                      onChange={() => {
                        void opsApi
                          .patchUser(u.id, { assignable: u.assignable !== true })
                          .then(() => reload())
                          .catch((err) => setError(err instanceof Error ? err.message : "update_failed"));
                      }}
                    />
                  ) : u.assignable ? (
                    "Yes"
                  ) : (
                    "No"
                  )}
                </td>
                <td>{u.active === false ? "disabled" : "active"}</td>
                <td>{formatLastLogin(u.last_login_at)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {staff && (me.role === "super_admin" || u.role === "viewer") ? (
                    <>
                      <button className="btn btn-ghost" type="button" onClick={() => openReset(u)}>
                        Edit
                      </button>{" "}
                      <button className="btn btn-ghost" type="button" onClick={() => toggleActive(u)}>
                        {u.active === false ? "Enable" : "Disable"}
                      </button>
                    </>
                  ) : (
                    <span className="muted">View only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
