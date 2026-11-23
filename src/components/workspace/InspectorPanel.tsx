"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Circle as CircleIcon,
  Dot,
  Minus,
  Triangle,
  Layers,
  Sparkles,
  Edit2,
  Check,
} from "lucide-react";
import type { GeoGebraAdapter } from "@/lib/geogebra/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PromptDialog } from "@/components/ui/PromptDialog";

type ObjectInfo = {
  name: string;
  type: string | null;
  value: string | null;
};

const COLOR_PALETTE = [
  { name: "Đỏ", hex: "#dc2626" },
  { name: "Xanh dương", hex: "#2563eb" },
  { name: "Xanh lá", hex: "#16a34a" },
  { name: "Cam", hex: "#ea580c" },
  { name: "Tím", hex: "#9333ea" },
  { name: "Đen", hex: "#111827" },
  { name: "Xám", hex: "#6b7280" },
  { name: "Lam", hex: "#0891b2" },
];

export function InspectorPanel({
  adapter,
  selectedObject,
  onSelect,
  onDeleteObjects,
}: {
  adapter: GeoGebraAdapter | null;
  selectedObject?: string | null;
  onSelect?: (name: string | null) => void;
  onDeleteObjects?: (names: string[]) => Promise<void>;
}) {
  const [objects, setObjects] = useState<ObjectInfo[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const activeObject = selectedObject !== undefined ? selectedObject : localSelected;
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({});
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [objectToDelete, setObjectToDelete] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!adapter) {
      setObjects([]);
      return;
    }
    try {
      const names = await adapter.getObjectNames();
      const infos = await Promise.all(
        names.slice(0, 150).map(async (name) => ({
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

  const handleSelect = (name: string) => {
    const next = activeObject === name ? null : name;
    setLocalSelected(next);
    onSelect?.(next);
  };

  const handleToggleVisibility = async (name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!adapter) return;
    const current = visibilityMap[name] ?? true;
    const next = !current;
    await adapter.setObjectVisible(name, next);
    setVisibilityMap((prev) => ({ ...prev, [name]: next }));
  };

  const handleChangeColor = async (hex: string) => {
    if (!adapter || !activeObject) return;
    await adapter.setObjectColor(activeObject, hex);
    setActiveColor(hex);
  };

  const handleRename = async (newName: string) => {
    if (!adapter || !renameTarget || !newName || newName === renameTarget) return;
    if (adapter.renameObject) {
      await adapter.renameObject(renameTarget, newName);
      if (activeObject === renameTarget) {
        setLocalSelected(newName);
        onSelect?.(newName);
      }
      await refresh();
    }
  };

  const confirmDelete = async () => {
    if (!adapter || !objectToDelete) return;
    try {
      if (onDeleteObjects) {
        await onDeleteObjects([objectToDelete]);
      } else {
        await adapter.deleteObject(objectToDelete);
      }
      if (activeObject === objectToDelete) {
        setLocalSelected(null);
        onSelect?.(null);
      }
      await refresh();
    } catch {
      // ignore
    } finally {
      setObjectToDelete(null);
    }
  };

  const confirmClearAll = async () => {
    if (!adapter || objects.length === 0) return;
    try {
      if (onDeleteObjects) {
        await onDeleteObjects(objects.map((o) => o.name));
      } else {
        for (const obj of objects) {
          try {
            await adapter.deleteObject(obj.name);
          } catch {
            // continue
          }
        }
      }
      setLocalSelected(null);
      onSelect?.(null);
      await refresh();
    } catch {
      // ignore
    } finally {
      setConfirmClearOpen(false);
    }
  };

  const getObjectIcon = (type: string | null) => {
    const t = (type || "").toLowerCase();
    if (t.includes("point")) return <Dot className="h-4 w-4 text-primary" />;
    if (t.includes("segment") || t.includes("line") || t.includes("ray"))
      return <Minus className="h-4 w-4 text-secondary" />;
    if (t.includes("polygon") || t.includes("triangle"))
      return <Triangle className="h-4 w-4 text-warning" />;
    if (t.includes("circle")) return <CircleIcon className="h-4 w-4 text-accent" />;
    return <Layers className="h-4 w-4 text-foreground/50" />;
  };

  // Filter objects
  const filteredObjects = objects.filter((obj) => {
    const matchSearch =
      !search ||
      obj.name.toLowerCase().includes(search.toLowerCase()) ||
      (obj.type && obj.type.toLowerCase().includes(search.toLowerCase()));

    if (!matchSearch) return false;

    if (typeFilter === "point")
      return (obj.type || "").toLowerCase().includes("point");
    if (typeFilter === "line") {
      const t = (obj.type || "").toLowerCase();
      return t.includes("segment") || t.includes("line") || t.includes("ray");
    }
    if (typeFilter === "polygon")
      return (
        (obj.type || "").toLowerCase().includes("polygon") ||
        (obj.type || "").toLowerCase().includes("triangle")
      );
    if (typeFilter === "circle")
      return (obj.type || "").toLowerCase().includes("circle");

    return true;
  });

  const selectedObjInfo = objects.find((o) => o.name === activeObject);

  if (!adapter) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-foreground/50">
        Đang đợi canvas GeoGebra sẵn sàng…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search & Actions Header */}
      <div className="border-b border-border/70 p-3 space-y-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-foreground/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm đối tượng…"
            className="w-full rounded-xl border border-border bg-surface-muted/50 pl-8 pr-3 py-1.5 text-xs text-foreground outline-none transition-colors focus:border-primary focus:bg-surface"
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px]">
          {[
            { id: "all", label: "Tất cả" },
            { id: "point", label: "Điểm" },
            { id: "line", label: "Đoạn/Đường" },
            { id: "polygon", label: "Đa giác" },
            { id: "circle", label: "Đường tròn" },
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setTypeFilter(chip.id)}
              className={`shrink-0 rounded-lg px-2 py-1 transition-colors ${
                typeFilter === chip.id
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-surface-muted/80 text-foreground/70 hover:text-foreground"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Object Property Inspector Card */}
      {selectedObjInfo && (
        <div className="border-b border-border bg-primary/5 p-3 animate-fade-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface border border-border">
                {getObjectIcon(selectedObjInfo.type)}
              </span>
              <span className="text-sm font-semibold text-foreground">
                {selectedObjInfo.name}
              </span>
              {selectedObjInfo.type && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {selectedObjInfo.type}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRenameTarget(selectedObjInfo.name)}
                title="Đổi tên đối tượng"
                className="rounded-lg p-1.5 text-foreground/60 hover:bg-surface hover:text-foreground transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => handleToggleVisibility(selectedObjInfo.name, e)}
                title={
                  visibilityMap[selectedObjInfo.name] === false
                    ? "Hiện đối tượng"
                    : "Ẩn đối tượng"
                }
                className="rounded-lg p-1.5 text-foreground/60 hover:bg-surface hover:text-foreground transition-colors"
              >
                {visibilityMap[selectedObjInfo.name] === false ? (
                  <EyeOff className="h-3.5 w-3.5 text-foreground/40" />
                ) : (
                  <Eye className="h-3.5 w-3.5 text-primary" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setObjectToDelete(selectedObjInfo.name)}
                title="Xóa đối tượng"
                className="rounded-lg p-1.5 text-danger hover:bg-danger/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {selectedObjInfo.value && (
            <p className="mt-1.5 truncate text-[11px] text-foreground/60 font-mono">
              Giá trị: {selectedObjInfo.value}
            </p>
          )}

          {/* Quick Color Picker */}
          <div className="mt-2.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-foreground/50 mb-1.5">
              Đổi màu đối tượng
            </span>
            <div className="flex items-center gap-1.5">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => handleChangeColor(c.hex)}
                  title={c.name}
                  className="h-5 w-5 rounded-full border border-border/80 transition-transform hover:scale-110 flex items-center justify-center"
                  style={{ backgroundColor: c.hex }}
                >
                  {activeColor === c.hex && (
                    <Check className="h-3 w-3 text-white drop-shadow" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Objects List */}
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {filteredObjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-foreground/50">
            <Sparkles className="h-6 w-6 text-foreground/30 mb-2" />
            <p>
              {objects.length === 0
                ? "Chưa có đối tượng nào trên bản vẽ."
                : "Không tìm thấy đối tượng phù hợp."}
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {filteredObjects.map((obj) => {
              const isSelected = activeObject === obj.name;
              const isHidden = visibilityMap[obj.name] === false;
              return (
                <li
                  key={obj.name}
                  onClick={() => handleSelect(obj.name)}
                  className={`group flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs transition-colors cursor-pointer border ${
                    isSelected
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-transparent hover:bg-surface-muted hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0">{getObjectIcon(obj.type)}</span>
                    <span className="font-medium truncate">{obj.name}</span>
                    {obj.type && (
                      <span className="shrink-0 text-[10px] text-foreground/40">
                        {obj.type}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => handleToggleVisibility(obj.name, e)}
                      title={isHidden ? "Hiện" : "Ẩn"}
                      className="rounded p-1 hover:bg-surface text-foreground/50 hover:text-foreground"
                    >
                      {isHidden ? (
                        <EyeOff className="h-3 w-3 text-foreground/40" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setObjectToDelete(obj.name);
                      }}
                      title="Xóa"
                      className="rounded p-1 hover:bg-danger/10 text-foreground/40 hover:text-danger"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer Info & Actions */}
      <div className="flex items-center justify-between border-t border-border/70 p-2.5 text-xs text-foreground/60">
        <span>{objects.length} đối tượng</span>
        <div className="flex items-center gap-2">
          {objects.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="text-danger hover:underline font-medium text-[11px]"
            >
              Xóa tất cả
            </button>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            title="Làm mới danh sách"
            className="flex items-center gap-1 text-[11px] hover:text-primary transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Confirm Clear All Dialog */}
      <ConfirmDialog
        isOpen={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={() => void confirmClearAll()}
        title="Xóa tất cả đối tượng?"
        message={`Hành động này sẽ xóa toàn bộ ${objects.length} đối tượng khỏi bản vẽ GeoGebra.`}
        confirmText="Xóa tất cả"
        isDestructive={true}
      />

      {/* Confirm Delete Single Object Dialog */}
      <ConfirmDialog
        isOpen={objectToDelete !== null}
        onClose={() => setObjectToDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Xóa đối tượng?"
        message={`Bạn có chắc muốn xóa "${objectToDelete}" khỏi bản vẽ?`}
        confirmText="Xóa"
        isDestructive={true}
      />

      {/* Rename Prompt Dialog */}
      <PromptDialog
        isOpen={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        onSubmit={(val) => void handleRename(val)}
        title="Đổi tên đối tượng"
        description="Nhập nhãn định danh mới cho đối tượng hình học:"
        initialValue={renameTarget ?? ""}
        placeholder="vd: A, B, C, d1..."
      />
    </div>
  );
}
