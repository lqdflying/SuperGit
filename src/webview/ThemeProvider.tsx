import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ThemeColors } from "../shared/themeColors";
import { readThemeColors } from "./theme";

const ThemeContext = createContext<ThemeColors | null>(null);

let themeRefreshHandler: (() => void) | undefined;

export function notifyThemeChanged(): void {
  themeRefreshHandler?.();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeColors>(() => readThemeColors());

  const refreshTheme = useCallback(() => {
    setTheme(readThemeColors());
  }, []);

  useEffect(() => {
    themeRefreshHandler = refreshTheme;
    return () => {
      if (themeRefreshHandler === refreshTheme) {
        themeRefreshHandler = undefined;
      }
    };
  }, [refreshTheme]);

  useEffect(() => {
    refreshTheme();

    const observer = new MutationObserver(() => {
      refreshTheme();
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-vscode-theme-id", "data-vscode-theme-kind"]
    });

    return () => observer.disconnect();
  }, [refreshTheme]);

  const value = useMemo(() => theme, [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeColors(): ThemeColors {
  const theme = useContext(ThemeContext);
  if (!theme) {
    return readThemeColors();
  }
  return theme;
}
