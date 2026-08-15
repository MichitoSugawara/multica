"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, RotateCw } from "lucide-react";
import type { Issue, RuntimeDevice } from "@multica/core/types";
import type { IssueDockPane } from "@multica/core/issues/stores/issue-dock-store";
import { useIssueDockStore } from "@multica/core/issues/stores/issue-dock-store";
import {
  IssueRuntimeSession,
  type RuntimeSessionErrorCode,
} from "@multica/core/issues/runtime-session";
import { DockConnectingState, DockEmptyState } from "./dock-empty-state";
import { sessionBlockReason } from "./dock-terminal-pane";
import { openExternal } from "../../platform/open-external";
import { useT } from "../../i18n";

/* Input handling ported from Chrome DevTools' screencast panel
   (front_end/panels/screencast/InputModel.ts + ScreencastView.ts): CDP mouse
   buttons are indexed by MouseEvent.button, modifiers use the CDP bitmask
   (Alt=1 Ctrl=2 Meta=4 Shift=8), and pointer coordinates are converted from
   the on-screen image into device space before dispatching. */
const MOUSE_BUTTONS = ["left", "middle", "right", "back", "forward"] as const;

function cdpModifiers(e: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): number {
  return (
    (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0)
  );
}

/* The screencast frame is drawn with object-contain, so the image may be
   letterboxed inside the host. Convert a host-relative point into frame
   (device) coordinates the way DevTools' ScreencastView.convertIntoScreenSpace
   does with its screenZoom. Returns null when the point falls on the
   letterbox padding outside the page. */
export function mapToFramePoint(
  point: { x: number; y: number },
  host: { width: number; height: number },
  frame: { width: number; height: number } | null,
): { x: number; y: number; scale: number } | null {
  if (
    !frame ||
    frame.width <= 0 ||
    frame.height <= 0 ||
    host.width <= 0 ||
    host.height <= 0
  ) {
    return { x: Math.round(point.x), y: Math.round(point.y), scale: 1 };
  }
  const scale = Math.min(host.width / frame.width, host.height / frame.height);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const offsetX = (host.width - frame.width * scale) / 2;
  const offsetY = (host.height - frame.height * scale) / 2;
  const x = (point.x - offsetX) / scale;
  const y = (point.y - offsetY) / scale;
  if (x < 0 || y < 0 || x > frame.width || y > frame.height) return null;
  return { x: Math.round(x), y: Math.round(y), scale };
}

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
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<IssueRuntimeSession | null>(null);
  const frameRef = useRef<{ width: number; height: number } | null>(null);
  const lastMoveAtRef = useRef(0);
  const urlEditingRef = useRef(false);
  const setSessionTitle = useIssueDockStore((s) => s.setSessionTitle);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
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
        setLoading(false);
        if (payload.url) {
          // The daemon re-announces ready on every main-frame navigation, so
          // link clicks and redirects keep the address bar current — unless
          // the user is editing it right now.
          if (!urlEditingRef.current) setUrl(payload.url);
          setSessionTitle(pane.id, browserTabTitle(payload.url));
        }
      },
      onData: (payload) => {
        if (payload.kind !== "browser" || !imgRef.current) return;
        imgRef.current.src = `data:${payload.mime};base64,${payload.data}`;
        if (payload.width && payload.height) {
          frameRef.current = { width: payload.width, height: payload.height };
        }
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
    const host = hostRef.current;
    if (host) sessionRef.current?.resize(host.clientWidth, host.clientHeight);
  }, [active]);

  // Follow pane resizes (dock drag, window resize) with a debounce, like
  // DevTools' ScreencastView.onResize deferred restart.
  useEffect(() => {
    if (error) return;
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const bounds = host.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0) {
          sessionRef.current?.resize(Math.round(bounds.width), Math.round(bounds.height));
        }
      }, 150);
    });
    observer.observe(host);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [error]);

  const send = (payload: Record<string, unknown>) => {
    sessionRef.current?.sendInput(btoa(JSON.stringify(payload)), "browser");
  };

  const navigate = (target: string) => {
    setLoading(true);
    send({ type: "navigate", url: target });
    setSessionTitle(pane.id, browserTabTitle(target));
  };

  const sendMouse = (
    type: "mousedown" | "mouseup" | "mousemove",
    e: React.MouseEvent,
  ) => {
    const host = hostRef.current;
    if (!host) return;
    const bounds = host.getBoundingClientRect();
    const point = mapToFramePoint(
      { x: e.clientX - bounds.left, y: e.clientY - bounds.top },
      { width: bounds.width, height: bounds.height },
      frameRef.current,
    );
    if (!point) return;
    send({
      type,
      x: point.x,
      y: point.y,
      button: MOUSE_BUTTONS[e.button] ?? "left",
      clickCount: e.detail || 1,
      modifiers: cdpModifiers(e),
    });
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
          urlEditingRef.current = false;
          navigate(url);
        }}
      >
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t(($) => $.detail.browser_back)}
          onClick={() => {
            setLoading(true);
            send({ type: "back" });
          }}
        >
          <ArrowLeft className="size-4" />
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t(($) => $.detail.browser_forward)}
          onClick={() => {
            setLoading(true);
            send({ type: "forward" });
          }}
        >
          <ArrowRight className="size-4" />
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t(($) => $.detail.browser_reload)}
          onClick={() => {
            setLoading(true);
            send({ type: "reload" });
          }}
        >
          <RotateCw className="size-4" />
        </button>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onFocus={() => {
            urlEditingRef.current = true;
          }}
          onBlur={() => {
            urlEditingRef.current = false;
          }}
          placeholder={t(($) => $.detail.browser_address_placeholder)}
          className="h-7 min-w-0 flex-1 rounded-md border bg-muted/40 px-2.5 text-label outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t(($) => $.detail.browser_open_external)}
          onClick={() => {
            const target = url.trim();
            if (!target) return;
            openExternal(target.includes("://") ? target : `https://${target}`);
          }}
        >
          <ExternalLink className="size-4" />
        </button>
      </form>
      <div
        ref={hostRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-background outline-none"
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.focus();
          sendMouse("mousedown", e);
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          sendMouse("mouseup", e);
        }}
        onPointerMove={(e) => {
          // Hover states and drags need mousemove, but the WS does not need
          // every event — DevTools forwards them all, we throttle to ~30/s.
          const now = Date.now();
          if (now - lastMoveAtRef.current < 33) return;
          lastMoveAtRef.current = now;
          sendMouse("mousemove", e);
        }}
        onBlur={() => {
          // A drag that leaves the pane must not leave the page with a stuck
          // pressed button (DevTools' handleBlurEvent).
          send({ type: "mouseup", x: 0, y: 0, button: "left" });
        }}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => {
          const host = e.currentTarget as HTMLDivElement;
          const bounds = host.getBoundingClientRect();
          const point = mapToFramePoint(
            { x: e.clientX - bounds.left, y: e.clientY - bounds.top },
            { width: bounds.width, height: bounds.height },
            frameRef.current,
          );
          if (!point) return;
          send({
            type: "scroll",
            x: point.x,
            y: point.y,
            deltaX: e.deltaX / point.scale,
            deltaY: e.deltaY / point.scale,
            modifiers: cdpModifiers(e),
          });
        }}
        onKeyDown={(e) => {
          if (e.key === "Tab") return;
          e.preventDefault();
          send({
            type: "keydown",
            key: e.key,
            code: e.code,
            keyCode: e.keyCode,
            text: e.key.length === 1 ? e.key : "",
            modifiers: cdpModifiers(e),
          });
        }}
        onKeyUp={(e) => {
          if (e.key === "Tab") return;
          e.preventDefault();
          send({
            type: "keyup",
            key: e.key,
            code: e.code,
            keyCode: e.keyCode,
            modifiers: cdpModifiers(e),
          });
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (!text) return;
          e.preventDefault();
          send({ type: "insertText", text });
        }}
      >
        {loading && (
          <div className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary/70" />
        )}
        <img
          ref={imgRef}
          alt=""
          className="pointer-events-none h-full w-full select-none object-contain"
          draggable={false}
        />
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
