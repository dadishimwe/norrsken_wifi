import type { Theme } from "./theme";
import { logoSrc } from "./theme";

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
