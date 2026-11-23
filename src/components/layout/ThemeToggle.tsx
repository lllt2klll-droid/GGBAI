"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

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

  if (!mounted) {
    return <div className="h-9 w-9" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      aria-label="Đổi theme"
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-foreground/70 hover:bg-surface-muted hover:text-foreground transition-colors"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
