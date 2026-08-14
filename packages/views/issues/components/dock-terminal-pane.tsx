"use client";

import { useEffect, useRef, useState } from "react";
import type { Issue, RuntimeDevice } from "@multica/core/types";
import type { IssueDockPane } from "@multica/core/issues/stores/issue-dock-store";
import { useIssueDockStore } from "@multica/core/issues/stores/issue-dock-store";
import {
  IssueRuntimeSession,
  type RuntimeSessionErrorCode,
} from "@multica/core/issues/runtime-session";
import { DockConnectingState, DockEmptyState } from "./dock-empty-state";

type TerminalHandle = {
  open: (el: HTMLElement) => void;
  write: (d: string | Uint8Array) => void;
  dispose: () => void;
  focus: () => void;
  onData: (cb: (d: string) => void) => { dispose: () => void };
  onTitleChange: (cb: (title: string) => void) => { dispose: () => void };
  cols: number;
  rows: number;
};

export function DockTerminalPane({
  issue,
  pane,
  runtime,
  active,
}: {
  issue: Issue;
  pane: IssueDockPane;
  runtime: RuntimeDevice | null;
  active: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<TerminalHandle | null>(null);
  const fitRef = useRef<{ fit: () => void } | null>(null);
  const sessionRef = useRef<IssueRuntimeSession | null>(null);
  const setSessionTitle = useIssueDockStore((s) => s.setSessionTitle);
  const [error, setError] = useState<RuntimeSessionErrorCode | string | null>(
    sessionBlockReason(pane, runtime),
  );
  const [phase, setPhase] = useState<"connecting" | "ready" | "reconnecting">("connecting");

  useEffect(() => {
    setError(sessionBlockReason(pane, runtime));
  }, [pane.daemonId, pane.runtimeId, runtime?.id]);

  useEffect(() => {
    if (error) return;

    let disposed = false;
    let dataDisposable: { dispose: () => void } | null = null;
    let titleDisposable: { dispose: () => void } | null = null;
    const pending: string[] = [];
    setPhase("connecting");

    const session = new IssueRuntimeSession({
      onReady: () => setPhase("ready"),
      // The daemon reports the PTY's foreground command. zsh on macOS only
      // emits OSC title escapes under Terminal.app/iTerm, so a bare PTY never
      // sends one — the xterm onTitleChange hook below stays as a bonus for
      // shells that are configured to emit them.
      onTitle: (payload) => setSessionTitle(pane.id, payload.title),
      onData: (payload) => {
        if (payload.kind !== "pty") return;
        const chunk = decodePTYData(payload.data);
        const term = termRef.current;
        if (term) {
          term.write(chunk);
          return;
        }
        pending.push(payload.data);
      },
      onError: (payload) => setError(payload.code),
      onClose: (reason) => {
        if (reason === "socket_closed") {
          setPhase("reconnecting");
          return;
        }
        setError((prev) => prev ?? "closed");
      },
    });
    sessionRef.current = session;
    session.attach(issue.id, pane.id, "pty", { cols: 80, rows: 24 });

    void (async () => {
      try {
        void import("@xterm/xterm/css/xterm.css");
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);
        if (disposed) return;
        if (!hostRef.current) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        if (disposed || !hostRef.current) return;

        const terminal = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          lineHeight: 1.2,
          convertEol: true,
          cursorInactiveStyle: "outline",
        });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(hostRef.current);
        fit.fit();
        const handle = terminal as unknown as TerminalHandle;
        termRef.current = handle;
        fitRef.current = fit;
        for (const data of pending) {
          terminal.write(decodePTYData(data));
        }
        pending.length = 0;
        dataDisposable = terminal.onData((data) => {
          session.sendInput(btoa(data), "pty");
        });
        // Codex-style live tab titles: shells emit OSC 0/2 title sequences
        // (path, running command); xterm surfaces them as onTitleChange.
        titleDisposable = handle.onTitleChange((title) => {
          setSessionTitle(pane.id, title);
        });
        session.resize(terminal.cols || 80, terminal.rows || 24);
        if (active) terminal.focus();
      } catch {
        if (!disposed) setError("open_failed");
      }
    })();

    const onResize = () => {
      fitRef.current?.fit();
      const term = termRef.current;
      if (term) sessionRef.current?.resize(term.cols || 80, term.rows || 24);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      dataDisposable?.dispose();
      titleDisposable?.dispose();
      sessionRef.current?.disconnect();
      sessionRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [error, issue.id, pane.id]);

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      fitRef.current?.fit();
      termRef.current?.focus();
      const term = termRef.current;
      if (term) sessionRef.current?.resize(term.cols || 80, term.rows || 24);
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  if (error) {
    return <DockEmptyState code={error === "closed" ? "open_failed" : error} />;
  }

  return (
    <div className="relative h-full min-h-0 w-full bg-background">
      {(phase === "connecting" || phase === "reconnecting") && (
        <DockConnectingState reconnecting={phase === "reconnecting"} />
      )}
      <div
        ref={hostRef}
        className="h-full min-h-0 w-full"
        onMouseDown={() => termRef.current?.focus()}
      />
    </div>
  );
}

export function sessionBlockReason(
  pane: Pick<IssueDockPane, "daemonId" | "runtimeId">,
  runtime: RuntimeDevice | null,
): RuntimeSessionErrorCode | null {
  if (!pane.daemonId && !pane.runtimeId && !runtime) return "no_runtime";
  return null;
}

function decodePTYData(data: string): string | Uint8Array {
  try {
    return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  } catch {
    return data;
  }
}
