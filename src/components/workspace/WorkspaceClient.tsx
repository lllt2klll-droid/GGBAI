"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GeoGebraContainer } from "@/components/geometry/GeoGebraContainer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AIChatPanel } from "@/components/workspace/AIChatPanel";
import { InspectorPanel } from "@/components/workspace/InspectorPanel";
import { CommandHistory } from "@/lib/geogebra/commandHistory";
import {
  exportGgb,
} from "@/lib/geogebra/export";
import {
  getProject,
  newProjectId,
  saveProject as persistProject,
} from "@/lib/persistence";
import type {
  GeoGebraAdapter,
  GeoGebraSnapshot,
  SafeGeoGebraCommand,
} from "@/lib/geogebra/types";

type DemoAction = {
  label: string;
  description: string;
  commands: SafeGeoGebraCommand[];
};

const DEMO_ACTIONS: DemoAction[] = [
  {
    label: "Tam giác ABC",
    description: "Dựng tam giác từ 3 điểm",
    commands: [
      { operationId: "", commandKey: "point", args: { label: "A", x: 0, y: 0 } },
      { operationId: "", commandKey: "point", args: { label: "B", x: 4, y: 0 } },
      { operationId: "", commandKey: "point", args: { label: "C", x: 2, y: 3 } },
      { operationId: "", commandKey: "polygon", args: { vertices: "A,B,C" } },
    ],
  },
  {
    label: "Đường tròn",
    description: "Đường tròn tâm O qua A",
    commands: [
      { operationId: "", commandKey: "point", args: { label: "O", x: 0, y: 0 } },
      { operationId: "", commandKey: "point", args: { label: "A", x: 3, y: 0 } },
      { operationId: "", commandKey: "circle", args: { center: "O", through: "A" } },
    ],
  },
  {
    label: "Đoạn thẳng",
    description: "Hai điểm và đoạn nối",
    commands: [
      { operationId: "", commandKey: "point", args: { label: "P", x: -2, y: 1 } },
      { operationId: "", commandKey: "point", args: { label: "Q", x: 2, y: 1 } },
      { operationId: "", commandKey: "segment", args: { p1: "P", p2: "Q" } },
    ],
  },
];

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-lg border border-border bg-surface ${className}`}
    >
      <h2 className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-foreground/60">
        {title}
      </h2>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

export function WorkspaceClient() {
  const adapterRef = useRef<GeoGebraAdapter | null>(null);
  const [history] = useState(() => new CommandHistory());
  const [adapter, setAdapter] = useState<GeoGebraAdapter | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [, setHistoryTick] = useState(0);
  const loadRequested = useRef(false);

  const bumpHistory = () => setHistoryTick((t) => t + 1);

  const handleAdapter = useCallback((a: GeoGebraAdapter | null) => {
    adapterRef.current = a;
    setAdapter(a);
    if (!a) history.clear();
  }, [history]);

  /**
   * Thực thi một batch command: diff object names trước/sau để biết
   * object nào được tạo → đẩy vào history cho undo/redo.
   */
  const runCommands = useCallback(
    async (
      commands: SafeGeoGebraCommand[],
      label: string,
    ): Promise<{ ok: number; failed: number; lastError?: string }> => {
      const a = adapterRef.current;
      if (!a) return { ok: 0, failed: commands.length, lastError: "Canvas chưa sẵn sàng" };

      let before = new Set<string>();
      try {
        before = new Set(await a.getObjectNames());
      } catch {
        // ignore — diff sẽ không chính xác nhưng vẫn chạy
      }

      let ok = 0;
      let failed = 0;
      let lastError: string | undefined;
      const executed: SafeGeoGebraCommand[] = [];

      for (const [i, cmd] of commands.entries()) {
        const full: SafeGeoGebraCommand = {
          ...cmd,
          operationId: cmd.operationId || `${label}-${Date.now()}-${i}`,
        };
        const result = await a.executeCommand(full);
        if (result.success) {
          ok += 1;
          executed.push(full);
        } else {
          failed += 1;
          lastError = result.error;
          break;
        }
      }

      if (executed.length > 0) {
        let createdNames: string[] = [];
        try {
          const after = await a.getObjectNames();
          createdNames = after.filter((n) => !before.has(n));
        } catch {
          // fallback: không biết tên — undo sẽ không xóa được
        }
        history.push({
          commands: executed,
          createdNames,
          label,
        });
        bumpHistory();
      }

      return { ok, failed, lastError };
    },
    [history],
  );

  const runAction = useCallback(
    async (action: DemoAction) => {
      setRunning(true);
      setMessage(null);
      const result = await runCommands(action.commands, action.label);
      if (result.failed > 0) {
        setMessage(result.lastError ?? "Lệnh thất bại");
      } else {
        setMessage(`Đã dựng: ${action.label}`);
      }
      setRunning(false);
    },
    [runCommands],
  );

  const undo = useCallback(async () => {
    const a = adapterRef.current;
    if (!a) return;
    setRunning(true);
    const done = await history.undo(a);
    setMessage(done ? "Đã hoàn tác" : "Không có gì để hoàn tác");
    bumpHistory();
    setRunning(false);
  }, [history]);

  const redo = useCallback(async () => {
    const a = adapterRef.current;
    if (!a) return;
    setRunning(true);
    const done = await history.redo(a);
    setMessage(done ? "Đã làm lại" : "Không có gì để làm lại");
    bumpHistory();
    setRunning(false);
  }, [history]);

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        void undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        void redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Tải dự án từ ?load=<id> một lần khi adapter sẵn sàng
  useEffect(() => {
    if (!adapter || loadRequested.current) return;
    const id = new URLSearchParams(window.location.search).get("load");
    if (!id) return;
    loadRequested.current = true;
    const t = setTimeout(() => {
      void (async () => {
        const project = await getProject(id);
        if (!project) {
          setMessage("Không tìm thấy dự án đã lưu");
          return;
        }
        try {
          await adapter.loadSnapshot(project.snapshot);
          setMessage(`Đã mở dự án: ${project.title}`);
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "Không tải được dự án");
        }
      })();
    }, 0);
    return () => clearTimeout(t);
  }, [adapter]);

  const saveProject = useCallback(async () => {
    const a = adapterRef.current;
    if (!a) return;
    const title = window.prompt("Tên dự án:", "Dự án không tên")?.trim();
    if (title === undefined) return;
    try {
      const snapshot = await a.exportSnapshot();
      await persistProject({
        id: newProjectId(),
        title: title || "Dự án không tên",
        snapshot,
        savedAt: new Date().toISOString(),
      });
      setMessage(`Đã lưu: ${title || "Dự án không tên"}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Lưu thất bại");
    }
  }, []);

  const exportProject = useCallback(async () => {
    const a = adapterRef.current;
    if (!a) return;
    const result = await exportGgb(a, "construction.ggb");
    setMessage(result.ok ? "Đã xuất file .ggb" : (result.error ?? "Xuất thất bại"));
  }, []);

  const exportImage = useCallback(
    async (format: "png" | "svg" | "jpg") => {
      const a = adapterRef.current;
      if (!a?.exportImage) {
        setMessage("Adapter không hỗ trợ export ảnh");
        return;
      }
      const result = await a.exportImage(format);
      setMessage(
        result.ok
          ? `Đã xuất ảnh ${format.toUpperCase()}`
          : (result.error ?? "Xuất ảnh thất bại"),
      );
    },
    [],
  );

  const recordEdit = useCallback(
    (before: GeoGebraSnapshot, after: GeoGebraSnapshot, label: string) => {
      history.push({ kind: "snapshot", before, after, label });
      bumpHistory();
    },
    [history],
  );

  /** Xóa objects qua Inspector — snapshot trước/sau để undo được. */
  const deleteObjects = useCallback(
    async (names: string[]) => {
      const a = adapterRef.current;
      if (!a || names.length === 0) return;
      let before: GeoGebraSnapshot | null = null;
      try {
        before = await a.exportSnapshot();
      } catch {
        // snapshot không khả dụng — vẫn xóa, không undo được
      }
      for (const name of names) {
        try {
          await a.deleteObject(name);
        } catch {
          // tiếp tục
        }
      }
      if (before) {
        try {
          const after = await a.exportSnapshot();
          history.push({
            kind: "snapshot",
            before,
            after,
            label: `Xóa ${names.length} đối tượng`,
          });
          bumpHistory();
        } catch {
          // ignore
        }
      }
    },
    [history],
  );

  const canUndo = history.canUndo();
  const canRedo = history.canRedo();

  return (
    <div className="grid h-full grid-cols-1 gap-3 p-3 lg:grid-cols-[320px_1fr_280px]">
      <Panel title="AI Assistant" className="order-2 lg:order-1">
        <AIChatPanel
          adapter={adapter}
          executeCommands={runCommands}
          selectedObject={selectedObject}
          onEditApplied={recordEdit}
        />
      </Panel>

      <section className="order-1 flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface lg:order-2">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-xs font-medium text-foreground/60">Dựng nhanh:</span>
          {DEMO_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={!adapter || running}
              onClick={() => runAction(action)}
              title={action.description}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            onClick={() => void undo()}
            disabled={!adapter || running || !canUndo}
            title="Hoàn tác (Ctrl+Z)"
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:border-primary/50 disabled:opacity-50"
          >
            ↩ Undo
          </button>
          <button
            type="button"
            onClick={() => void redo()}
            disabled={!adapter || running || !canRedo}
            title="Làm lại (Ctrl+Shift+Z / Ctrl+Y)"
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:border-primary/50 disabled:opacity-50"
          >
            ↪ Redo
          </button>
          <button
            type="button"
            onClick={() => void saveProject()}
            disabled={!adapter || running}
            title="Lưu dự án (Supabase nếu đã cấu hình, ngược lại localStorage)"
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:border-primary/50 disabled:opacity-50"
          >
            💾 Lưu
          </button>
          <button
            type="button"
            onClick={() => void exportProject()}
            disabled={!adapter || running}
            title="Xuất file .ggb"
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:border-primary/50 disabled:opacity-50"
          >
            ⬇ .ggb
          </button>
          <button
            type="button"
            onClick={() => void exportImage("png")}
            disabled={!adapter || running}
            title="Xuất ảnh PNG"
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:border-primary/50 disabled:opacity-50"
          >
            PNG
          </button>
          <button
            type="button"
            onClick={() => void exportImage("svg")}
            disabled={!adapter || running}
            title="Xuất ảnh SVG"
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:border-primary/50 disabled:opacity-50"
          >
            SVG
          </button>
          {message && (
            <span className="ml-auto text-xs text-foreground/70">{message}</span>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <ErrorBoundary>
            <GeoGebraContainer onAdapter={handleAdapter} />
          </ErrorBoundary>
        </div>
      </section>

      <Panel title="Inspector" className="order-3">
        <InspectorPanel
          adapter={adapter}
          onSelect={setSelectedObject}
          onDeleteObjects={deleteObjects}
        />
      </Panel>
    </div>
  );
}
