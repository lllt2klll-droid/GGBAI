"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Undo2,
  Redo2,
  Save,
  Download,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Edit3,
  Sparkles,
  FileDown,
  Crosshair,
} from "lucide-react";
import { GeoGebraContainer } from "@/components/geometry/GeoGebraContainer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AIChatPanel } from "@/components/workspace/AIChatPanel";
import { InspectorPanel } from "@/components/workspace/InspectorPanel";
import { CommandHistory } from "@/lib/geogebra/commandHistory";
import { exportGgb } from "@/lib/geogebra/export";
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
import { PromptDialog } from "@/components/ui/PromptDialog";
import { Modal } from "@/components/ui/Modal";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

type QuickPreset = {
  label: string;
  description: string;
  commands: SafeGeoGebraCommand[];
};

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: "Tam giác ABC",
    description: "Tam giác thường từ 3 đỉnh",
    commands: [
      { operationId: "", commandKey: "point", args: { label: "A", x: 0, y: 3 } },
      { operationId: "", commandKey: "point", args: { label: "B", x: -3, y: 0 } },
      { operationId: "", commandKey: "point", args: { label: "C", x: 3, y: 0 } },
      { operationId: "", commandKey: "polygon", args: { vertices: "A,B,C" } },
    ],
  },
  {
    label: "Tam giác vuông",
    description: "Tam giác vuông tại A",
    commands: [
      { operationId: "", commandKey: "point", args: { label: "A", x: 0, y: 0 } },
      { operationId: "", commandKey: "point", args: { label: "B", x: 4, y: 0 } },
      { operationId: "", commandKey: "point", args: { label: "C", x: 0, y: 3 } },
      { operationId: "", commandKey: "polygon", args: { vertices: "A,B,C" } },
    ],
  },
  {
    label: "Đường tròn (O, A)",
    description: "Đường tròn tâm O đi qua A",
    commands: [
      { operationId: "", commandKey: "point", args: { label: "O", x: 0, y: 0 } },
      { operationId: "", commandKey: "point", args: { label: "A", x: 3, y: 0 } },
      { operationId: "", commandKey: "circle", args: { center: "O", through: "A" } },
    ],
  },
  {
    label: "Đoạn thẳng PQ",
    description: "Đoạn thẳng nối P và Q",
    commands: [
      { operationId: "", commandKey: "point", args: { label: "P", x: -2, y: 1 } },
      { operationId: "", commandKey: "point", args: { label: "Q", x: 2, y: 1 } },
      { operationId: "", commandKey: "segment", args: { p1: "P", p2: "Q" } },
    ],
  },
  {
    label: "Hình chữ nhật",
    description: "Hình chữ nhật 4 đỉnh",
    commands: [
      { operationId: "", commandKey: "point", args: { label: "A", x: -3, y: -2 } },
      { operationId: "", commandKey: "point", args: { label: "B", x: 3, y: -2 } },
      { operationId: "", commandKey: "point", args: { label: "C", x: 3, y: 2 } },
      { operationId: "", commandKey: "point", args: { label: "D", x: -3, y: 2 } },
      { operationId: "", commandKey: "polygon", args: { vertices: "A,B,C,D" } },
    ],
  },
];

export function WorkspaceClient() {
  const adapterRef = useRef<GeoGebraAdapter | null>(null);
  const [history] = useState(() => new CommandHistory());
  const [adapter, setAdapter] = useState<GeoGebraAdapter | null>(null);
  const [running, setRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [, setHistoryTick] = useState(0);
  const loadRequested = useRef(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Project state
  const [projectTitle, setProjectTitle] = useState("Dự án chưa đặt tên");
  const [projectId, setProjectId] = useState<string>("proj_new");
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">("saved");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Panel layout state (Desktop: collapsible; Mobile: tab switcher)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState<"canvas" | "chat" | "inspector">("canvas");
  const [objectCount, setObjectCount] = useState(0);

  const bumpHistory = () => setHistoryTick((t) => t + 1);

  const handleAdapter = useCallback((a: GeoGebraAdapter | null) => {
    adapterRef.current = a;
    setAdapter(a);
    if (!a) history.clear();
  }, [history]);

  // Sync object count
  useEffect(() => {
    if (!adapter) return;
    const updateCount = async () => {
      try {
        const names = await adapter.getObjectNames();
        setObjectCount(names.length);
      } catch {
        // ignore
      }
    };
    void updateCount();
    const unsub = adapter.subscribe(() => {
      void updateCount();
    });
    return () => unsub();
  }, [adapter]);

  // Command runner with undo/redo diff recording
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
        // diff fallback
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
          // ignore
        }
        history.push({
          commands: executed,
          createdNames,
          label,
        });
        bumpHistory();
        setSaveStatus("unsaved");
      }

      return { ok, failed, lastError };
    },
    [history],
  );

  const runPreset = useCallback(
    async (preset: QuickPreset) => {
      setRunning(true);
      setStatusMessage(null);
      const result = await runCommands(preset.commands, preset.label);
      if (result.failed > 0) {
        setStatusMessage(result.lastError ?? "Lệnh thất bại");
      } else {
        setStatusMessage(`Đã dựng: ${preset.label}`);
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
    setStatusMessage(done ? "Đã hoàn tác thao tác" : "Không có thao tác để hoàn tác");
    bumpHistory();
    setSaveStatus("unsaved");
    setRunning(false);
  }, [history]);

  const redo = useCallback(async () => {
    const a = adapterRef.current;
    if (!a) return;
    setRunning(true);
    const done = await history.redo(a);
    setStatusMessage(done ? "Đã làm lại thao tác" : "Không có thao tác để làm lại");
    bumpHistory();
    setSaveStatus("unsaved");
    setRunning(false);
  }, [history]);

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y
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

  // Load project from URL ?load=<id>
  useEffect(() => {
    if (!adapter || loadRequested.current) return;
    const id = new URLSearchParams(window.location.search).get("load");
    if (!id) return;
    loadRequested.current = true;
    const t = setTimeout(() => {
      void (async () => {
        const project = await getProject(id);
        if (!project) {
          setStatusMessage("Không tìm thấy dự án đã lưu");
          return;
        }
        try {
          await adapter.loadSnapshot(project.snapshot);
          setProjectTitle(project.title);
          setProjectId(project.id);
          setSaveStatus("saved");
          setStatusMessage(`Đã mở dự án: ${project.title}`);
        } catch (err) {
          setStatusMessage(err instanceof Error ? err.message : "Không tải được dự án");
        }
      })();
    }, 0);
    return () => clearTimeout(t);
  }, [adapter]);

  // Save Project
  const handleSave = useCallback(
    async (titleToSave?: string) => {
      const a = adapterRef.current;
      if (!a) return;
      const title = titleToSave ?? projectTitle;
      const targetId = projectId === "proj_new" ? newProjectId() : projectId;
      if (projectId === "proj_new") {
        setProjectId(targetId);
      }
      setSaveStatus("saving");
      try {
        const snapshot = await a.exportSnapshot();
        await persistProject({
          id: targetId,
          title: title || "Dự án không tên",
          snapshot,
          savedAt: new Date().toISOString(),
        });
        setSaveStatus("saved");
        setStatusMessage(`Đã lưu dự án: ${title}`);
      } catch (err) {
        setSaveStatus("unsaved");
        setStatusMessage(err instanceof Error ? err.message : "Lưu dự án thất bại");
      }
    },
    [projectId, projectTitle],
  );

  const handleRenameSubmit = (newTitle: string) => {
    setProjectTitle(newTitle);
    void handleSave(newTitle);
  };

  const handleExportGgb = useCallback(async () => {
    const a = adapterRef.current;
    if (!a) return;
    const fileName = `${projectTitle.toLowerCase().replace(/[^a-z0-9_]+/g, "_") || "construction"}.ggb`;
    const result = await exportGgb(a, fileName);
    setStatusMessage(result.ok ? `Đã xuất file ${fileName}` : (result.error ?? "Xuất file thất bại"));
    setExportModalOpen(false);
  }, [projectTitle]);

  const handleExportImage = useCallback(
    async (format: "png" | "svg" | "jpg") => {
      const a = adapterRef.current;
      if (!a?.exportImage) {
        setStatusMessage("Adapter không hỗ trợ xuất ảnh");
        return;
      }
      const result = await a.exportImage(format);
      setStatusMessage(
        result.ok
          ? `Đã xuất ảnh định dạng ${format.toUpperCase()}`
          : (result.error ?? "Xuất ảnh thất bại"),
      );
      setExportModalOpen(false);
    },
    [],
  );

  const recordEdit = useCallback(
    (before: GeoGebraSnapshot, after: GeoGebraSnapshot, label: string) => {
      history.push({ kind: "snapshot", before, after, label });
      bumpHistory();
      setSaveStatus("unsaved");
    },
    [history],
  );

  const deleteObjects = useCallback(
    async (names: string[]) => {
      const a = adapterRef.current;
      if (!a || names.length === 0) return;
      let before: GeoGebraSnapshot | null = null;
      try {
        before = await a.exportSnapshot();
      } catch {
        // ignore
      }
      for (const name of names) {
        try {
          await a.deleteObject(name);
        } catch {
          // continue
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
          setSaveStatus("unsaved");
        } catch {
          // ignore
        }
      }
    },
    [history],
  );

  const toggleFullscreen = useCallback(() => {
    const el = workspaceRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const canUndo = history.canUndo();
  const canRedo = history.canRedo();

  return (
    <div
      ref={workspaceRef}
      className={`flex h-full w-full min-h-0 flex-col bg-background ${
        isFullscreen ? "p-0" : ""
      }`}
    >
      {/* ── Topbar Workspace (theo DESIGN_SYSTEM.md) ───────────────── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-3 gap-2">
        {/* Left: Project title & Save status */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setRenameDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-foreground hover:bg-surface-muted transition-colors truncate max-w-[200px] sm:max-w-xs"
            title="Bấm để đổi tên dự án"
          >
            <span className="truncate">{projectTitle}</span>
            <Edit3 className="h-3 w-3 shrink-0 text-foreground/40" />
          </button>

          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${
              saveStatus === "saved"
                ? "bg-success/10 text-success"
                : saveStatus === "saving"
                  ? "bg-primary/10 text-primary"
                  : "bg-warning/10 text-warning"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                saveStatus === "saved"
                  ? "bg-success"
                  : saveStatus === "saving"
                    ? "bg-primary animate-pulse"
                    : "bg-warning"
              }`}
            />
            <span className="hidden sm:inline">
              {saveStatus === "saved"
                ? "Đã lưu"
                : saveStatus === "saving"
                  ? "Đang lưu…"
                  : "Chưa lưu"}
            </span>
          </span>
        </div>

        {/* Center / Right: Actions & Tools */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Undo / Redo */}
          <button
            type="button"
            onClick={() => void undo()}
            disabled={!adapter || running || !canUndo}
            title="Hoàn tác (Ctrl+Z)"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-surface-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void redo()}
            disabled={!adapter || running || !canRedo}
            title="Làm lại (Ctrl+Y)"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-surface-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Redo2 className="h-4 w-4" />
          </button>

          <span className="mx-1 h-4 w-px bg-border" />

          {/* Save Button */}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!adapter || running || saveStatus === "saving"}
            title="Lưu mô hình"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Lưu</span>
          </button>

          {/* Export Menu Button */}
          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            disabled={!adapter || running}
            title="Xuất file hoặc ảnh"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Xuất</span>
          </button>

          <span className="mx-1 h-4 w-px bg-border hidden lg:block" />

          {/* Desktop Panel Toggles */}
          <button
            type="button"
            onClick={() => setLeftPanelOpen((v) => !v)}
            title={leftPanelOpen ? "Thu gọn panel AI" : "Mở panel AI"}
            className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-surface-muted hover:text-foreground transition-colors"
          >
            {leftPanelOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setRightPanelOpen((v) => !v)}
            title={rightPanelOpen ? "Thu gọn panel Inspector" : "Mở panel Inspector"}
            className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-surface-muted hover:text-foreground transition-colors"
          >
            {rightPanelOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Thoát toàn màn hình (Esc)" : "Toàn màn hình"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-surface-muted hover:text-foreground transition-colors"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>

          <span className="mx-1 h-4 w-px bg-border" />

          {/* Theme Toggle */}
          <ThemeToggle />
        </div>
      </header>

      {/* ── Mobile Tab Switcher (Visible only on < lg) ──────────────── */}
      <div className="flex border-b border-border bg-surface p-1 lg:hidden">
        {[
          { id: "canvas", label: "🖥 Bản vẽ GeoGebra" },
          { id: "chat", label: "💬 AI Trợ lý" },
          { id: "inspector", label: `🔍 Đối tượng (${objectCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileTab(tab.id as typeof mobileTab)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
              mobileTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-foreground/70 hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Main Workspace Body (3-Panel Grid) ──────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden p-2 gap-2">
        {/* Left Panel: AI Assistant */}
        <section
          className={`surface-panel flex flex-col overflow-hidden transition-all duration-200 ${
            leftPanelOpen ? "lg:w-80 shrink-0" : "lg:hidden"
          } ${mobileTab === "chat" ? "flex-1" : "max-lg:hidden"}`}
        >
          <AIChatPanel
            adapter={adapter}
            executeCommands={runCommands}
            selectedObject={selectedObject}
            onEditApplied={recordEdit}
          />
        </section>

        {/* Center Panel: Canvas & Quick Presets */}
        <section
          className={`flex min-h-0 flex-1 flex-col surface-panel overflow-hidden relative ${
            mobileTab === "canvas" ? "flex" : "max-lg:hidden"
          }`}
        >
          {/* Quick Presets Header */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/80 bg-surface-muted/40 px-3 py-1.5 shrink-0">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-foreground/50 shrink-0">
              <Sparkles className="h-3 w-3 text-primary" />
              <span>Mẫu nhanh:</span>
            </span>
            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={!adapter || running}
                onClick={() => void runPreset(preset)}
                title={preset.description}
                className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground/80 hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40"
              >
                {preset.label}
              </button>
            ))}

            <button
              type="button"
              disabled={!adapter}
              onClick={() => {
                adapter?.setStandardView?.();
                setStatusMessage("Đã căn giữa góc nhìn");
              }}
              title="Căn giữa góc nhìn chuẩn (Standard View)"
              className="flex items-center gap-1 shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground/80 hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40"
            >
              <Crosshair className="h-3 w-3" />
              <span>Căn giữa view</span>
            </button>

            {statusMessage && (
              <span className="ml-auto shrink-0 truncate text-xs text-foreground/60 italic">
                {statusMessage}
              </span>
            )}
          </div>

          {/* GeoGebra Applet Container */}
          <div className="relative min-h-0 flex-1 flex flex-col h-full w-full bg-surface overflow-hidden">
            <ErrorBoundary>
              <GeoGebraContainer onAdapter={handleAdapter} />
            </ErrorBoundary>
          </div>
        </section>

        {/* Right Panel: Inspector */}
        <section
          className={`surface-panel flex flex-col overflow-hidden transition-all duration-200 ${
            rightPanelOpen ? "lg:w-72 shrink-0" : "lg:hidden"
          } ${mobileTab === "inspector" ? "flex-1" : "max-lg:hidden"}`}
        >
          <InspectorPanel
            adapter={adapter}
            selectedObject={selectedObject}
            onSelect={setSelectedObject}
            onDeleteObjects={deleteObjects}
          />
        </section>
      </div>

      {/* ── Bottom Status Bar (theo DESIGN_SYSTEM.md) ────────────────── */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-surface px-3 text-[11px] text-foreground/60">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 font-medium text-foreground/80">
            <span
              className={`h-2 w-2 rounded-full ${
                adapter ? "bg-success" : "bg-warning animate-pulse"
              }`}
            />
            <span>{adapter ? "GeoGebra 2D: Sẵn sàng" : "Đang khởi tạo…"}</span>
          </span>
          <span className="h-3 w-px bg-border" />
          <span>{objectCount} đối tượng</span>
          {selectedObject && (
            <>
              <span className="h-3 w-px bg-border" />
              <span className="text-primary font-medium truncate max-w-[140px]">
                Chọn: {selectedObject}
              </span>
            </>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <span>Ctrl+Z Hoàn tác</span>
          <span>•</span>
          <span>Ctrl+Y Làm lại</span>
        </div>
      </footer>

      {/* ── Dialogs: Rename & Export ─────────────────────────────────── */}
      <PromptDialog
        isOpen={renameDialogOpen}
        onClose={() => setRenameDialogOpen(false)}
        onSubmit={handleRenameSubmit}
        title="Đổi tên dự án"
        description="Nhập tiêu đề mới cho dự án hình học này:"
        initialValue={projectTitle}
        placeholder="vd: Tam giác đồng dạng bài 4"
      />

      <Modal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Xuất mô hình"
        description="Chọn định dạng file bạn muốn tải về máy tính:"
        maxWidth="sm"
      >
        <div className="space-y-2 mt-2">
          <button
            type="button"
            onClick={() => void handleExportGgb()}
            className="flex w-full items-center justify-between rounded-xl border border-border p-3 hover:border-primary/50 hover:bg-surface-muted transition-colors text-left"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">File GeoGebra (.ggb)</p>
              <p className="text-xs text-foreground/60">
                File gốc mở được trên phần mềm GeoGebra Classic / Suite
              </p>
            </div>
            <FileDown className="h-4 w-4 text-primary" />
          </button>

          <button
            type="button"
            onClick={() => void handleExportImage("png")}
            className="flex w-full items-center justify-between rounded-xl border border-border p-3 hover:border-primary/50 hover:bg-surface-muted transition-colors text-left"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">Ảnh PNG độ phân giải cao</p>
              <p className="text-xs text-foreground/60">
                Thích hợp để chèn vào đề thi, bài giảng hoặc Word/PowerPoint
              </p>
            </div>
            <FileDown className="h-4 w-4 text-primary" />
          </button>

          <button
            type="button"
            onClick={() => void handleExportImage("svg")}
            className="flex w-full items-center justify-between rounded-xl border border-border p-3 hover:border-primary/50 hover:bg-surface-muted transition-colors text-left"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">Vector đồ họa (SVG)</p>
              <p className="text-xs text-foreground/60">
                Không vỡ nét khi phóng to, thích hợp in ấn và thiết kế chuyên nghiệp
              </p>
            </div>
            <FileDown className="h-4 w-4 text-primary" />
          </button>
        </div>
      </Modal>
    </div>
  );
}
