"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCw } from "lucide-react";
import type { Issue, RuntimeDevice } from "@multica/core/types";
import type { IssueDockPane } from "@multica/core/issues/stores/issue-dock-store";
import { useIssueDockStore } from "@multica/core/issues/stores/issue-dock-store";
import {
  IssueRuntimeSession,
  type RuntimeSessionErrorCode,
} from "@multica/core/issues/runtime-session";
import { DockConnectingState, DockEmptyState } from "./dock-empty-state";
import { sessionBlockReason } from "./dock-terminal-pane";
import { useT } from "../../i18n";

export function DockBrowserPane({
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
  const { t } = useT("issues");
  const imgRef = useRef<HTMLImageElement>(null);
  const sessionRef = useRef<IssueRuntimeSession | null>(null);
  const setSessionTitle = useIssueDockStore((s) => s.setSessionTitle);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<RuntimeSessionErrorCode | string | null>(
    sessionBlockReason(pane, runtime),
  );
  const [phase, setPhase] = useState<"connecting" | "ready" | "reconnecting">("connecting");

  useEffect(() => {
    setError(sessionBlockReason(pane, runtime));
  }, [pane.daemonId, pane.runtimeId, runtime?.id]);

  useEffect(() => {
    if (error) return;
    setPhase("connecting");
    const session = new IssueRuntimeSession({
      onReady: (payload) => {
        setPhase("ready");
        if (payload.url) {
          setUrl(payload.url);
          setSessionTitle(pane.id, browserTabTitle(payload.url));
        }
      },
      onData: (payload) => {
        if (payload.kind !== "browser" || !imgRef.current) return;
        imgRef.current.src = `data:${payload.mime};base64,${payload.data}`;
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
    const host = imgRef.current?.parentElement;
    const width = Math.max(host?.clientWidth || 0, 800);
    const height = Math.max(host?.clientHeight || 0, 600);
    session.attach(issue.id, pane.id, "browser", {
      cols: width,
      rows: height,
      subscribed: active,
    });
    return () => {
      session.disconnect();
      sessionRef.current = null;
    };
  }, [error, issue.id, pane.id]);

  useEffect(() => {
    sessionRef.current?.subscribe(active);
    if (!active) return;
    const host = imgRef.current?.parentElement;
    if (host) sessionRef.current?.resize(host.clientWidth, host.clientHeight);
  }, [active]);

  const send = (payload: Record<string, unknown>) => {
    sessionRef.current?.sendInput(btoa(JSON.stringify(payload)), "browser");
  };

  const navigate = (target: string) => {
    send({ type: "navigate", url: target });
    setSessionTitle(pane.id, browserTabTitle(target));
  };

  if (error) {
    return <DockEmptyState code={error === "closed" ? "open_failed" : error} />;
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {(phase === "connecting" || phase === "reconnecting") && (
        <DockConnectingState reconnecting={phase === "reconnecting"} />
      )}
      <form
        className="flex h-10 shrink-0 items-center gap-1 border-b px-2"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(url);
        }}
      >
        <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t(($) => $.detail.browser_back)} onClick={() => send({ type: "back" })}>
          <ArrowLeft className="size-4" />
        </button>
        <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t(($) => $.detail.browser_forward)} onClick={() => send({ type: "forward" })}>
          <ArrowRight className="size-4" />
        </button>
        <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t(($) => $.detail.browser_reload)} onClick={() => send({ type: "reload" })}>
          <RotateCw className="size-4" />
        </button>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t(($) => $.detail.browser_address_placeholder)}
          className="h-7 min-w-0 flex-1 rounded-md border bg-muted/40 px-2.5 text-label outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </form>
      <div
        className="relative min-h-0 flex-1 overflow-hidden bg-background outline-none"
        tabIndex={0}
        onClick={(e) => {
          const bounds = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          send({ type: "click", x: e.clientX - bounds.left, y: e.clientY - bounds.top });
          e.currentTarget.focus();
        }}
        onWheel={(e) => {
          const bounds = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          send({
            type: "scroll",
            x: e.clientX - bounds.left,
            y: e.clientY - bounds.top,
            deltaX: e.deltaX,
            deltaY: e.deltaY,
          });
        }}
        onKeyDown={(e) => {
          if (e.key === "Tab") return;
          e.preventDefault();
          send({
            type: "keydown",
            key: e.key,
            code: e.code,
            text: e.key.length === 1 ? e.key : "",
            modifiers:
              (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0),
          });
        }}
      >
        <img ref={imgRef} alt="" className="h-full w-full object-contain" draggable={false} />
      </div>
    </div>
  );
}

/* Codex-style browser tab label: the page host (plus port for localhost dev
   servers) is short and recognizable — "localhost:3000", "github.com". Falls
   back to the raw string when the input is not yet a parseable URL. */
export function browserTabTitle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return trimmed;
  }
}
