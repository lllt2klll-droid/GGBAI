"use client";

import { useEffect } from "react";
import { loadSettings } from "@/lib/settings";

/**
 * Áp dụng settings client (glass intensity) lên <html>.
 * Theme (.dark) do ThemeToggle quản lý; glass do settings quản lý.
 */
export function SettingsSync() {
  useEffect(() => {
    const apply = () => {
      const s = loadSettings();
      document.documentElement.dataset.glass = String(s.glass);
    };
    apply();
    window.addEventListener("ggb-settings-changed", apply);
    return () => window.removeEventListener("ggb-settings-changed", apply);
  }, []);

  return null;
}
