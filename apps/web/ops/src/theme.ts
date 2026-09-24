import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "norrsken-ops-theme";

function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    /* ignore */
  }
  return "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document !== "undefined") {
      const initial = readStoredTheme();
      applyTheme(initial);
      return initial;
    }
    return "light";
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  function toggleTheme() {
    setThemeState((t) => (t === "light" ? "dark" : "light"));
  }

  return { theme, setTheme: setThemeState, toggleTheme };
}

export function logoSrc(theme: Theme): string {
  const base = import.meta.env.BASE_URL;
  return theme === "light"
    ? `${base}norrsken-logo-dark.svg`
    : `${base}norrsken-logo-white.svg`;
}

/** Zuba mark: on-light for light UI, on-dark for dark UI. */
export function partnerLogoSrc(theme: Theme): string {
  const base = import.meta.env.BASE_URL;
  return theme === "light"
    ? `${base}zuba-logo-on-light.png`
    : `${base}zuba-logo-on-dark.png`;
}
