"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import {
  GeoGebraWebAdapter,
  type GeoGebraWebAdapterOptions,
} from "@/lib/geogebra/GeoGebraWebAdapter";
import type { GeoGebraAdapter } from "@/lib/geogebra/types";

type Status = "loading" | "ready" | "error";

export function GeoGebraContainer({
  onAdapter,
  options,
  className = "",
}: {
  onAdapter?: (adapter: GeoGebraAdapter | null) => void;
  options?: GeoGebraWebAdapterOptions;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<GeoGebraWebAdapter | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Guard chống duplicate applet khi React Strict Mode remount
    if (adapterRef.current?.isReady()) return;

    setStatus("loading");
    setError(null);

    const adapter = new GeoGebraWebAdapter(options);
    adapterRef.current = adapter;

    let cancelled = false;
    adapter
      .initialize(container)
      .then(() => {
        if (cancelled) return;
        setStatus("ready");
        onAdapter?.(adapter);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Không tải được GeoGebra");
        onAdapter?.(null);
      });

    return () => {
      cancelled = true;
      adapter.destroy();
      adapterRef.current = null;
      onAdapter?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div ref={containerRef} className="h-full w-full" />

      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/90 backdrop-blur-xs text-xs text-foreground/70">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Đang tải môi trường hình học GeoGebra…</span>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/95 p-6 text-center animate-fade-up">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-danger">
              Không thể khởi tạo GeoGebra
            </p>
            <p className="mt-1 max-w-sm text-xs text-foreground/60">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Thử tải lại</span>
          </button>
        </div>
      )}
    </div>
  );
}
