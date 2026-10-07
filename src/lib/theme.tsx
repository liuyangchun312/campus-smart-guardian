import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";
const Context = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({ theme: "system", setTheme: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const value = localStorage.getItem("guardian:theme:v1"); return value === "light" || value === "dark" ? value : "system"; } catch { return "system"; }
  });
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = theme === "system" ? media.matches ? "dark" : "light" : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#111d17" : "#f6f7f4");
    };
    apply(); media.addEventListener("change", apply);
    try { localStorage.setItem("guardian:theme:v1", theme); } catch { /* Theme still works for this visit. */ }
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return <Context.Provider value={{ theme, setTheme }}>{children}</Context.Provider>;
}
export function ThemeControl() {
  const { theme, setTheme } = useContext(Context);
  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  return <label className="theme-control"><Icon size={16} /><select aria-label="外观主题" value={theme} onChange={(event) => setTheme(event.target.value as Theme)}><option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option></select></label>;
}
