import type { ReactNode } from "react";

/** Small marks beside words. Color logos stay on a light tile so they read in both themes. */

function Tile({ children }: { children: ReactNode }) {
  return (
    <span className="mark-tile" aria-hidden="true">
      {children}
    </span>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <span className="mark-mono" aria-hidden="true">
      {children}
    </span>
  );
}

export function QrIcon() {
  return (
    <Mono>
      <svg viewBox="0 0 16 16">
        <path d="M1 1h6v6H1V1zm1.4 1.4v3.2h3.2V2.4H2.4zM9 1h6v6H9V1zm1.4 1.4v3.2h3.2V2.4H10.4zM1 9h6v6H1V9zm1.4 1.4v3.2h3.2v-3.2H2.4zM9 9h2.2v2.2H9V9zm3.6 0H15v2.2h-2.4V9zM9 12.6h2.2V15H9v-2.4zm3.6 1.2H15V15h-2.4v-1.2z" />
      </svg>
    </Mono>
  );
}

export function SlackIcon() {
  return (
    <Tile>
      <svg viewBox="0 0 16 16">
        <path fill="#E01E5A" d="M3.4 10.2A1.6 1.6 0 1 1 1.8 8.6h1.6v1.6z" />
        <path fill="#E01E5A" d="M4.2 10.2a1.6 1.6 0 0 1 3.2 0v4a1.6 1.6 0 0 1-3.2 0v-4z" />
        <path fill="#36C5F0" d="M5.8 3.4A1.6 1.6 0 1 1 7.4 1.8v1.6H5.8z" />
        <path fill="#36C5F0" d="M5.8 4.2a1.6 1.6 0 0 1 0 3.2h-4a1.6 1.6 0 0 1 0-3.2h4z" />
        <path fill="#2EB67D" d="M12.6 5.8A1.6 1.6 0 1 1 14.2 7.4h-1.6V5.8z" />
        <path fill="#2EB67D" d="M11.8 5.8a1.6 1.6 0 0 1-3.2 0v-4a1.6 1.6 0 0 1 3.2 0v4z" />
        <path fill="#ECB22E" d="M10.2 12.6A1.6 1.6 0 1 1 8.6 14.2v-1.6h1.6z" />
        <path fill="#ECB22E" d="M10.2 11.8a1.6 1.6 0 0 1 0-3.2h4a1.6 1.6 0 0 1 0 3.2h-4z" />
      </svg>
    </Tile>
  );
}

function AppIcon({ id }: { id: string }) {
  switch (id) {
    case "zoom":
      return (
        <Tile>
          <svg viewBox="0 0 16 16">
            <rect width="16" height="16" rx="4" fill="#2D8CFF" />
            <path fill="#fff" d="M3.2 5.2h6.2v5.6H3.2zM9.6 6.6 12.8 5v6l-3.2-1.6z" />
          </svg>
        </Tile>
      );
    case "teams":
      return (
        <Tile>
          <svg viewBox="0 0 16 16">
            <rect width="16" height="16" rx="3" fill="#5059C9" />
            <circle cx="10.2" cy="5.2" r="1.5" fill="#fff" />
            <path fill="#fff" d="M6.2 6.2h4.2v1.2H8.8V12H7.2V7.4H6.2z" />
          </svg>
        </Tile>
      );
    case "meet":
      return (
        <Tile>
          <svg viewBox="0 0 16 16">
            <rect width="16" height="16" rx="3" fill="#00832D" />
            <path fill="#fff" d="M3 5.2h6.4v5.6H3z" />
            <path fill="#fff" d="M9.6 6.8 13 5.2v5.6l-3.4-1.6z" />
          </svg>
        </Tile>
      );
    case "slack":
      return <SlackIcon />;
    case "github":
      return (
        <Mono>
          <svg viewBox="0 0 16 16">
            <path d="M8 1.2a6.8 6.8 0 0 0-2.15 13.25c.34.06.46-.15.46-.33v-1.16c-1.88.41-2.28-.9-2.28-.9-.3-.78-.75-1-.75-1-.62-.42.05-.41.05-.41.68.05 1.04.7 1.04.7.6 1.04 1.58.74 1.97.56.06-.44.24-.74.43-.91-1.5-.17-3.08-.75-3.08-3.34 0-.74.26-1.34.7-1.81-.07-.17-.3-.87.06-1.81 0 0 .56-.18 1.85.69a6.4 6.4 0 0 1 3.36 0c1.29-.87 1.85-.69 1.85-.69.36.94.13 1.64.06 1.81.44.47.7 1.07.7 1.81 0 2.6-1.58 3.17-3.09 3.34.25.21.46.63.46 1.28v1.9c0 .18.12.4.47.33A6.8 6.8 0 0 0 8 1.2z" />
          </svg>
        </Mono>
      );
    case "google_workspace":
      return (
        <Tile>
          <svg viewBox="0 0 16 16">
            <path fill="#4285F4" d="M8 6.6v2.3h3.7A3.2 3.2 0 0 1 8 11.4 3.4 3.4 0 1 1 8 4.6c.9 0 1.7.3 2.3.9l1.6-1.6A5.6 5.6 0 1 0 8 13.6 5.6 5.6 0 0 0 13.6 8c0-.4 0-.7-.1-1H8z" />
          </svg>
        </Tile>
      );
    case "m365":
      return (
        <Tile>
          <svg viewBox="0 0 16 16">
            <rect x="1" y="1" width="6.2" height="6.2" fill="#F25022" />
            <rect x="8.8" y="1" width="6.2" height="6.2" fill="#7FBA00" />
            <rect x="1" y="8.8" width="6.2" height="6.2" fill="#00A4EF" />
            <rect x="8.8" y="8.8" width="6.2" height="6.2" fill="#FFB900" />
          </svg>
        </Tile>
      );
    case "ssh_remote":
      return (
        <Mono>
          <svg viewBox="0 0 16 16">
            <path d="M2 3.2h12v9.6H2V3.2zm1.2 1.2v7.2h9.6V4.4H3.2zM4.4 6.2 6.6 8 4.4 9.8v-1.2L5.2 8 4.4 7.4V6.2zm3 3.2h3.2V10.6H7.4V9.4z" />
          </svg>
        </Mono>
      );
    case "banking":
      return (
        <Mono>
          <svg viewBox="0 0 16 16">
            <path d="M8 1.6 1.6 5h12.8L8 1.6zM2.4 6.2h1.6v5H2.4v-5zm3.2 0h1.6v5H5.6v-5zm3.2 0h1.6v5H8.8v-5zm3.2 0h1.6v5h-1.6v-5zM1.6 12.2h12.8V14H1.6v-1.8z" />
          </svg>
        </Mono>
      );
    case "web":
      return (
        <Mono>
          <svg viewBox="0 0 16 16">
            <path d="M8 1.4a6.6 6.6 0 1 0 0 13.2A6.6 6.6 0 0 0 8 1.4zm0 1.2c.8 1 1.4 2.6 1.6 4.4H6.4C6.6 5.2 7.2 3.6 8 2.6zM2.7 8.2h3.5c0 .6.1 1.2.2 1.8H3.2a5.4 5.4 0 0 1-.5-1.8zm3.7 3H9.6c-.2.6-.5 1.1-.9 1.6-.4-.5-.7-1-.9-1.6h-.4zm4.4-1.2c.1-.6.2-1.2.2-1.8h3.3a5.4 5.4 0 0 1-.5 1.8H10.8zM9.6 7h3.5a5.4 5.4 0 0 0-1.5-3.2c.5.8.9 1.9 1.1 3.2H9.6zm-7 0h3.5C6.3 5.7 6.7 4.6 7.2 3.8A5.4 5.4 0 0 0 2.6 7z" />
          </svg>
        </Mono>
      );
    case "cloud_vpn":
      return (
        <Mono>
          <svg viewBox="0 0 16 16">
            <path d="M5.2 12.4h6.2a2.8 2.8 0 0 0 .4-5.6 3.6 3.6 0 0 0-6.9-1 2.4 2.4 0 0 0 .3 6.6zm2.2-1.6V8.2L5.6 9.6 7.4 11v-.2zm1.2 0h.2L10.6 9.6 8.6 8.2v2.6z" />
          </svg>
        </Mono>
      );
    default:
      return (
        <Mono>
          <svg viewBox="0 0 16 16">
            <circle cx="3.2" cy="8" r="1.3" />
            <circle cx="8" cy="8" r="1.3" />
            <circle cx="12.8" cy="8" r="1.3" />
          </svg>
        </Mono>
      );
  }
}

export function ChannelLabel({ channel }: { channel: string }) {
  const slack = channel === "slack" || channel === "slack_metoo";
  const qr = channel === "qr";
  const word = slack ? "Slack" : qr ? "QR" : "All";
  return (
    <span className="mark-pair">
      {slack ? <SlackIcon /> : qr ? <QrIcon /> : null}
      <span>{word}</span>
    </span>
  );
}

export function AppLabel({ id, label }: { id: string; label: string }) {
  return (
    <span className="mark-pair">
      <AppIcon id={id} />
      <span>{label}</span>
    </span>
  );
}
