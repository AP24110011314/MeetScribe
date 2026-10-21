/** Theme management: localStorage persistence + html class toggle. */
import { useEffect, useState } from "react";

export function useTheme(): ["light" | "dark", (theme: "light" | "dark") => void] {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Initialize from localStorage or system preference
  useEffect(() => {
    const stored = localStorage.getItem("meetscribe-theme");
    if (stored) {
      setTheme(stored as "light" | "dark");
    } else if (typeof window !== "undefined") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
    }
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    localStorage.setItem("meetscribe-theme", theme);
  }, [theme]);

  // Apply theme class to html element
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("light", "dark");
    html.classList.add(theme);
  }, [theme]);

  return [theme, setTheme];
}