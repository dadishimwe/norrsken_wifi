import { useEffect, useState } from "react";
import { opsApi, type OpsUser } from "./api";
import { LoginPage } from "./LoginPage";
import { DashboardView } from "./DashboardView";
import { UsersAdmin } from "./UsersAdmin";
import { IntegrationsView } from "./IntegrationsView";
import { GraphsView } from "./GraphsView";
import { AccountDialog } from "./AccountDialog";
import { BrandLogo, ThemeToggle } from "./BrandLogo";
import { useTheme } from "./theme";

type Tab = "dashboard" | "graphs" | "integrations" | "users";

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<OpsUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountToast, setAccountToast] = useState<string | null>(null);

  useEffect(() => {
    opsApi
      .me()
      .then(({ user: u }) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <div className="login-page">
        <ThemeToggle theme={theme} onToggle={toggleTheme} className="theme-toggle-float" />
        <div className="login-main">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={setUser} theme={theme} onToggleTheme={toggleTheme} />;
  }

  async function logout() {
    await opsApi.logout().catch(() => undefined);
    setUser(null);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <BrandLogo theme={theme} />
          <div className="brand-meta">
            <strong>Network Ops</strong>
            <span>Norrsken House Kigali</span>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="user-chip">
            <em>{user.display_name}</em> · {user.role}
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => setAccountOpen(true)}>
            Account
          </button>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button className="btn btn-ghost" type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="nav-tabs">
        {(
          [
            ["dashboard", "Dashboard"],
            ["graphs", "Graphs"],
            ["integrations", "Integrations"],
            ...(user.role === "admin" ? [["users", "Users"] as const] : []),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {accountToast ? <div className="toast">{accountToast}</div> : null}
      {accountOpen ? (
        <AccountDialog
          user={user}
          onClose={() => setAccountOpen(false)}
          onSaved={(next) => {
            setUser(next);
            setAccountOpen(false);
            setAccountToast("Account updated");
            window.setTimeout(() => setAccountToast(null), 2200);
          }}
        />
      ) : null}

      <main className="page">
        {tab === "users" ? (
          <UsersAdmin />
        ) : tab === "integrations" ? (
          <IntegrationsView canEdit={user.role === "admin"} />
        ) : tab === "graphs" ? (
          <GraphsView />
        ) : (
          <DashboardView canEdit={user.role === "admin"} />
        )}
      </main>

    </div>
  );
}
