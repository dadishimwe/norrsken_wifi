import { Component, useEffect, useState, type ReactNode } from "react";
import { opsApi, type OpsUser } from "./api";
import { LoginPage } from "./LoginPage";
import { DashboardView } from "./DashboardView";
import { IssuesView } from "./IssuesView";
import { BoardView } from "./BoardView";
import { UsersAdmin } from "./UsersAdmin";
import { IntegrationsView } from "./IntegrationsView";
import { GraphsView } from "./GraphsView";
import { canTriage } from "./issueControls";
import { AccountDialog } from "./AccountDialog";
import { BrandLogo, ThemeToggle } from "./BrandLogo";
import { useTheme } from "./theme";

function staffRole(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

function roleLabel(role: string): string {
  if (role === "super_admin") return "Super admin";
  if (role === "admin") return "Admin";
  return "Viewer";
}

type Tab = "dashboard" | "issues" | "board" | "graphs" | "integrations" | "users";

class PageBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  override state = { message: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    const message = err instanceof Error ? err.message : "The page failed to draw.";
    return { message };
  }

  override render() {
    if (this.state.message) {
      return <p className="error">This page failed to draw: {this.state.message}</p>;
    }
    return this.props.children;
  }
}

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
            <em>{user.display_name}</em> · {roleLabel(user.role)}
            {user.company ? ` · ${user.company === "dct" ? "DCT" : user.company === "zuba" ? "Zuba" : "Norrsken"}` : ""}
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
            ...(canTriage(user) ? ([["issues", "Issues"], ["board", "Board"]] as const) : []),
            ["graphs", "Graphs"],
            ["integrations", "Integrations"],
            ["users", "Users"],
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
        <PageBoundary key={tab}>
          {tab === "users" ? (
            <UsersAdmin me={user} />
          ) : tab === "integrations" ? (
            <IntegrationsView canEdit={staffRole(user.role)} />
          ) : tab === "graphs" ? (
            <GraphsView />
          ) : tab === "issues" && canTriage(user) ? (
            <IssuesView meId={user.id} />
          ) : tab === "board" && canTriage(user) ? (
            <BoardView meId={user.id} />
          ) : (
            <DashboardView
              canEdit={staffRole(user.role)}
              canTriage={canTriage(user)}
              meId={user.id}
              linkedReportId={new URLSearchParams(window.location.search).get("report")}
            />
          )}
        </PageBoundary>
      </main>

    </div>
  );
}
