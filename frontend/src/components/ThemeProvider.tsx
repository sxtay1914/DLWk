"use client";

import { useEffect, useState } from "react";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
    }
    setMounted(true);

    const handler = (e: Event) => {
      const dark = (e as CustomEvent).detail?.dark;
      if (dark) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
    };

    window.addEventListener("toggle-theme", handler);
    return () => window.removeEventListener("toggle-theme", handler);
  }, []);

  // Prevent flash of wrong theme
  if (!mounted) return null;

  return <>{children}</>;
}

export function toggleTheme() {
  const isDark = document.documentElement.classList.contains("dark");
  window.dispatchEvent(
    new CustomEvent("toggle-theme", { detail: { dark: !isDark } })
  );
}
