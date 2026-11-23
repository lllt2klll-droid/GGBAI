"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoGebraAdapter } from "@/lib/geogebra/types";

type ObjectInfo = {
  name: string;
  type: string | null;
  value: string | null;
};

/** Inspector: danh sách đối tượng trên canvas, sync qua adapter events. */
export function InspectorPanel({
  adapter,
  onSelect,
}: {
  adapter: GeoGebraAdapter | null;
  onSelect?: (name: string | null) => void;
}) {
  const [objects, setObjects] = useState<ObjectInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!adapter) {
      setObjects([]);
      return;
    }
    try {
      const names = await adapter.getObjectNames();
      const infos = await Promise.all(
        names.slice(0, 100).map(async (name) => ({
          name,
          type: await adapter.getObjectType(name),
          value: await adapter.getObjectValue(name),
        })),
      );
      setObjects(infos);
    } catch {
      // applet chưa sẵn sàng
    }
  }, [adapter]);

  useEffect(() => {
    if (!adapter) return;
    const t = setTimeout(() => void refresh(), 0);
    const unsubscribe = adapter.subscribe(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void refresh(), 300);
    });
    return () => {
      clearTimeout(t);
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [adapter, refresh]);

  const remove = async (name: string) => {
    if (!adapter) return;
    try {
      await adapter.deleteObject(name);
      setSelected(null);
      await refresh();
    } catch {
      // ignore
    }
  };

  const clearAll = async () => {
    if (!adapter || objects.length === 0) return;
    if (!window.confirm(`Xóa tất cả ${objects.length} đối tượng?`)) return;
    for (const obj of objects) {
      try {
        await adapter.deleteObject(obj.name);
      } catch {
        // tiếp tục xóa phần còn lại
      }
    }
    setSelected(null);
    await refresh();
  };

  if (!adapter) {
    return (
      <p className="p-4 text-sm text-foreground/60">
        Chờ canvas sẵn sàng…
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs text-foreground/60">
          {objects.length} đối tượng
        </span>
        <div className="flex items-center gap-2">
          {objects.length > 0 && (
            <button
              type="button"
              onClick={() => void clearAll()}
              title="Xóa tất cả đối tượng"
              className="text-xs text-danger hover:underline"
            >
              Xóa hết
            </button>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs text-primary hover:underline"
          >
            Làm mới
          </button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto">
        {objects.length === 0 && (
          <li className="p-4 text-sm text-foreground/60">
            Chưa có đối tượng nào.
          </li>
        )}
        {objects.map((obj) => (
          <li
            key={obj.name}
            className={`flex items-center gap-2 border-b border-border/50 px-3 py-2 text-sm ${
              selected === obj.name ? "bg-primary/10" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setSelected(obj.name);
                onSelect?.(obj.name);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <span className="font-medium">{obj.name}</span>
              {obj.type && (
                <span className="ml-2 text-xs text-foreground/50">{obj.type}</span>
              )}
              {obj.value && (
                <span className="block truncate text-xs text-foreground/50">
                  {obj.value}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => void remove(obj.name)}
              title="Xóa đối tượng"
              className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger/10"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
