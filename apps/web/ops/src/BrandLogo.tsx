import type { Theme } from "./theme";
import { logoSrc, partnerLogoSrc } from "./theme";

type Props = {
  theme: Theme;
  className?: string;
};

export function BrandLogo({ theme, className }: Props) {
  return (
    <img
      className={className}
      src={logoSrc(theme)}
      alt="Norrsken"
    />
  );
}

/** Zuba partner mark — hidden gracefully if the asset is not in apps/web/brand yet. */
export function PartnerLogo({ theme, className }: Props) {
  const src = partnerLogoSrc(theme);
  return (
    <img
      className={className ?? "partner-logo"}
      src={src}
      alt="Zuba Broadband"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

type ToggleProps = {
  theme: Theme;
  onToggle: () => void;
  className?: string;
};

export function ThemeToggle({ theme, onToggle, className }: ToggleProps) {
  return (
    <button
      type="button"
      className={`btn btn-ghost${className ? ` ${className}` : ""}`}
      onClick={onToggle}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      title={theme === "light" ? "Dark mode" : "Light mode"}
    >
      {theme === "light" ? "Dark" : "Light"}
    </button>
  );
}
