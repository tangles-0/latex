"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { THEME_SET } from "@/components/theme/themes";

const THEME_STORAGE_KEY = "latex-theme";

type ThemeContextValue = {
  theme: string;
  isSaving: boolean;
  setTheme: (next: string) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  initialTheme,
  preferLocalStorage = false,
  children,
}: {
  initialTheme: string;
  preferLocalStorage?: boolean;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState(initialTheme);
  const [isSaving, setIsSaving] = useState(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let next = theme;
    if (preferLocalStorage) {
      try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored && THEME_SET.has(stored)) {
          next = stored === "default" ? "dark" : stored;
          setThemeState(stored);
        }
      } catch {
        // ignore storage errors
      }
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
    hasInitialized.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferLocalStorage]);

  useEffect(() => {
    if (!hasInitialized.current) {
      return;
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  async function setTheme(next: string) {
    if (next === theme) return;
    if (!THEME_SET.has(next)) return;
    const previous = theme;
    setThemeState(next);
    // If we're in "local storage preferred" mode (logged out), don't attempt DB sync.
    // We still persist to localStorage via the effect above.
    if (preferLocalStorage) {
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
      if (response.status === 401) {
        // Not logged in (or session expired). Keep local theme; skip DB sync.
        return;
      }
      if (!response.ok) {
        setThemeState(previous);
      }
    } finally {
      setIsSaving(false);
    }
  }

  const value = useMemo(
    () => ({
      theme,
      isSaving,
      setTheme,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, isSaving],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: "dark",
      isSaving: false,
      // eslint-disable-next-line @typescript-eslint/require-await
      setTheme: async () => undefined,
    };
  }
  return context;
}

