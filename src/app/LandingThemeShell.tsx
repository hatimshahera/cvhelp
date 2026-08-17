"use client";

import { useEffect, useState, type ReactNode } from "react";

const themes = [
  { id: "light", label: "Light" },
  { id: "warm", label: "Medium" },
  { id: "dark", label: "Dark" }
] as const;

type ThemeId = (typeof themes)[number]["id"];
const themeStorageKey = "cvhelp-landing-theme";

function isThemeId(value: string | null): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}

function getStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "dark";

  const storedTheme = window.localStorage.getItem(themeStorageKey);
  return isThemeId(storedTheme) ? storedTheme : "dark";
}

export function LandingThemeShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>(getStoredTheme);

  const activeIndex = themes.findIndex((item) => item.id === theme);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    if (isThemeId(storedTheme)) {
      setTheme(storedTheme);
    }
  }, []);

  function cycleTheme() {
    const next = themes[(activeIndex + 1) % themes.length];
    setTheme(next.id);
    window.localStorage.setItem(themeStorageKey, next.id);
  }

  return (
    <div className={`landing-theme-shell landing-theme-${theme}`} suppressHydrationWarning>
      <div className="theme-wallpapers" aria-hidden="true">
        <span className="theme-wallpaper theme-wallpaper-light" />
        <span className="theme-wallpaper theme-wallpaper-warm" />
        <span className="theme-wallpaper theme-wallpaper-dark" />
      </div>
      {children}
      <button
        className="background-switcher"
        type="button"
        onClick={cycleTheme}
        aria-label={`Change background. Current mode: ${themes[activeIndex].label}`}
        title={`Background: ${themes[activeIndex].label}`}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
}
