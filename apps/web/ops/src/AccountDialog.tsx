import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { opsApi, type OpsUser } from "./api";

type Props = {
  user: OpsUser;
  onClose: () => void;
  onSaved: (user: OpsUser) => void;
};

export function AccountDialog({ user, onClose, onSaved }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [username, setUsername] = useState(user.username);
  const [confirmUsername, setConfirmUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const usernameNext = username.trim().toLowerCase();
    const usernameChanged = usernameNext !== user.username;
    const passwordFilled = password.length > 0 || confirmPassword.length > 0;
    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (!/^[a-z0-9._-]+$/i.test(usernameNext)) {
      setError("Username can use letters, numbers, dots, underscores, and hyphens.");
      return;
    }
    if (usernameChanged && usernameNext !== confirmUsername.trim().toLowerCase()) {
      setError("Usernames do not match.");
      return;
    }
    if (!usernameChanged && !passwordFilled) {
      setError("Change the username or enter a new password.");
      return;
    }
    if (passwordFilled) {
      if (password.length < 12) {
        setError("Password must be at least 12 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const { user: next } = await opsApi.updateMe({
        current_password: currentPassword,
        ...(usernameChanged ? { username: usernameNext } : {}),
        ...(passwordFilled ? { password } : {}),
      });
      onSaved(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "update_failed";
      if (msg === "wrong_password") setError("Current password is incorrect.");
      else if (msg === "username_taken") setError("That username is already in use.");
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => void onSubmit(e)}
      >
        <h3 id="account-title">Your account</h3>
        <p>
          Enter your current password. Change your username, your password, or both. Leave the new
          password blank to keep it.
        </p>
        {error ? <p className="error">{error}</p> : null}
        <div className="field">
          <label htmlFor="account-current">Current password</label>
          <input
            id="account-current"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="account-username">Username</label>
          <input
            id="account-username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            pattern="[A-Za-z0-9._-]+"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="account-username-confirm">Confirm username</label>
          <input
            id="account-username-confirm"
            autoComplete="off"
            value={confirmUsername}
            onChange={(e) => setConfirmUsername(e.target.value)}
            pattern="[A-Za-z0-9._-]*"
          />
        </div>
        <div className="field">
          <label htmlFor="account-password">New password</label>
          <input
            id="account-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="account-password-confirm">Confirm new password</label>
          <input
            id="account-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
