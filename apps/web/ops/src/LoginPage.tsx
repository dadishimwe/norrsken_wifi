import type { FormEvent } from "react";
import { useState } from "react";
import { opsApi, type OpsUser } from "./api";
import { BrandLogo, ThemeToggle } from "./BrandLogo";
import type { Theme } from "./theme";

type Props = {
  onLogin: (user: OpsUser) => void;
  theme: Theme;
  onToggleTheme: () => void;
};

export function LoginPage({ onLogin, theme, onToggleTheme }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await opsApi.login(username, password);
      onLogin(user);
    } catch {
      setError("Invalid username or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <ThemeToggle theme={theme} onToggle={onToggleTheme} className="theme-toggle-float" />
      <form className="login-card" onSubmit={onSubmit}>
        <BrandLogo theme={theme} className="logo" />
        <h1>Network Ops</h1>
        <p>Sign in with the account your admin created. Reporter traffic stays anonymous.</p>
        {error ? <p className="error">{error}</p> : null}
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
