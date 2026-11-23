"use client";

import { useEffect, useState } from "react";

const KEY = "ggb-ai-theme";

/** Toggle dark mode — persist localStorage, apply class .dark lên <html>. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const saved = localStorage.getItem(KEY);
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = saved ? saved === "dark" : prefersDark;
      setDark(isDark);
      document.documentElement.classList.toggle("dark", isDark);
      setMounted(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(KEY, next ? "dark" : "light");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Chuyển sang sáng" : "Chuyển sang tối"}
      aria-label="Đổi theme"
      className="rounded-md border border-border px-2.5 py-1.5 text-sm hover:border-primary/50"
    >
      {mounted ? (dark ? "☀️" : "🌙") : "◐"}
    </button>
  );
}
