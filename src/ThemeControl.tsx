import { useLayoutEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

const THEME_KEY = "redline.theme";
const THEMES: Theme[] = ["dark", "light", "system"];

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && THEMES.includes(saved as Theme)) return saved as Theme;
  } catch {
    // Storage can be unavailable in hardened WebViews; Dark remains safe.
  }
  return "dark";
}

function effectiveTheme(theme: Theme, systemDark: boolean) {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = effectiveTheme(
        theme,
        media.matches,
      );
    };

    apply();
    if (theme !== "system") return;

    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  function chooseTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch {
      // The selected theme still applies for this session.
    }
  }

  return (
    <fieldset className="theme-control">
      <legend className="sr-only">Appearance</legend>
      {THEMES.map((option) => (
        <label className="theme-option" key={option}>
          <input
            type="radio"
            name="appearance"
            value={option}
            checked={theme === option}
            onChange={() => chooseTheme(option)}
          />
          <span>{option[0].toUpperCase() + option.slice(1)}</span>
        </label>
      ))}
    </fieldset>
  );
}
