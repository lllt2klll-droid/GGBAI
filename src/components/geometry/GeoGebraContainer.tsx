"use client";

import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Guard chống duplicate applet khi React Strict Mode remount
    if (adapterRef.current?.isReady()) return;

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
  }, []);

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-muted/80 text-sm text-foreground/70">
          Đang tải GeoGebra…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-muted/90 p-6 text-center">
          <p className="text-sm font-medium text-danger">
            Không thể khởi tạo GeoGebra
          </p>
          <p className="max-w-sm text-xs text-foreground/60">{error}</p>
          <p className="text-xs text-foreground/50">
            Kiểm tra kết nối internet và thử tải lại trang.
          </p>
        </div>
      )}
    </div>
  );
}
