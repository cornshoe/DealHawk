import React, { createContext, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";
import { darkColors, lightColors, ColorPalette } from "@/src/theme";

type ThemeMode = "dark" | "light";

type ThemeCtx = {
  mode: ThemeMode;
  colors: ColorPalette;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
};

const STORAGE_KEY = "dealhawk_theme";
const ThemeContext = createContext<ThemeCtx | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    (async () => {
      try {
        const stored = await storage.getItem(STORAGE_KEY, "dark");
        if (stored === "light" || stored === "dark") {
          setModeState(stored);
        }
      } catch {}
    })();
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    storage.setItem(STORAGE_KEY, m).catch(() => {});
  };

  const toggle = () => setMode(mode === "dark" ? "light" : "dark");

  const palette = mode === "dark" ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ mode, colors: palette, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeCtx => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
};
