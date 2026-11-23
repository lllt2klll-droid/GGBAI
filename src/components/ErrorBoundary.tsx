"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; message: string };

/** Error boundary tối giản — bắt lỗi render, hiển thị fallback. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : "Lỗi không xác định",
    };
  }

  componentDidCatch(err: unknown) {
    console.error("[ErrorBoundary]", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div>
              <p className="text-sm font-medium text-danger">
                Đã xảy ra lỗi khi hiển thị.
              </p>
              <p className="mt-1 text-xs text-foreground/60">
                {this.state.message}
              </p>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: "" })}
                className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary/50"
              >
                Thử lại
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
