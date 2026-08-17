"use client";

import { useState, type ReactNode } from "react";

const themes = [
  { id: "light", label: "Light" },
  { id: "warm", label: "Medium" },
  { id: "dark", label: "Dark" }
] as const;

type ThemeId = (typeof themes)[number]["id"];

export function LandingThemeShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>("dark");

  const activeIndex = themes.findIndex((item) => item.id === theme);

  function cycleTheme() {
    const next = themes[(activeIndex + 1) % themes.length];
    setTheme(next.id);
  }

  return (
    <div className={`landing-theme-shell landing-theme-${theme}`}>
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
