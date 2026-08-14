import { api } from "../api";
import { defaultStorage } from "../platform/storage";
import { getCurrentSlug } from "../platform/workspace-storage";

export type RuntimeSessionKind = "pty" | "browser";

export type RuntimeSessionErrorCode =
  | "no_runtime"
  | "runtime_offline"
  | "daemon_outdated"
  | "unsupported_os"
  | "chrome_missing"
  | "forbidden"
  | "open_failed"
  | "closed"
  | "limit_reached";

export interface RuntimeSessionReady {
  session_id: string;
  kind: RuntimeSessionKind;
  os?: string;
  url?: string;
}

export interface RuntimeSessionData {
  session_id: string;
  kind: RuntimeSessionKind;
  mime: string;
  data: string;
  width?: number;
  height?: number;
}

export interface RuntimeSessionError {
  session_id: string;
  code: RuntimeSessionErrorCode | string;
  message?: string;
}

export interface RuntimeSessionHandlers {
  onReady?: (payload: RuntimeSessionReady) => void;
  onData?: (payload: RuntimeSessionData) => void;
  onError?: (payload: RuntimeSessionError) => void;
  onClose?: (reason?: string) => void;
}

export function buildRuntimeSessionUrl(
  issueId: string,
  opts?: {
    httpBase?: string;
    pageOrigin?: string;
    workspaceSlug?: string | null;
  },
): string {
  const http = (opts?.httpBase ?? api.getBaseUrl() ?? "").replace(/\/$/, "");
  let wsBase: string;
  if (/^https?:\/\//i.test(http)) {
    wsBase = http.replace(/^http/i, "ws");
  } else {
    const page =
      opts?.pageOrigin ??
      (typeof window !== "undefined" ? window.location.origin : "");
    if (!page) {
      throw new Error("runtime session URL requires an API base or page origin");
    }
    wsBase = page.replace(/^http/i, "ws");
    if (http.startsWith("/")) wsBase += http;
  }
  const url = new URL(`${wsBase}/api/issues/${encodeURIComponent(issueId)}/runtime-session`);
  const slug = opts?.workspaceSlug !== undefined ? opts.workspaceSlug : getCurrentSlug();
  if (slug) url.searchParams.set("workspace_slug", slug);
  return url.toString();
}

function coercePayload(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return {};
}

export class IssueRuntimeSession {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private issueId: string | null = null;
  private kind: RuntimeSessionKind = "pty";
  private handlers: RuntimeSessionHandlers;
  private opened = false;
  private closed = false;
  private pendingInput: Array<{ data: string; kind: RuntimeSessionKind }> = [];
  private attachOpts?: { cols?: number; rows?: number; subscribed?: boolean };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;

  constructor(handlers: RuntimeSessionHandlers = {}) {
    this.handlers = handlers;
  }

  get id(): string | null {
    return this.sessionId;
  }

  attach(issueId: string, sessionId: string, kind: RuntimeSessionKind, opts?: {
    cols?: number;
    rows?: number;
    subscribed?: boolean;
  }) {
    this.stopReconnect();
    this.ws?.close();
    this.ws = null;
    this.opened = false;
    this.closed = false;
    this.pendingInput = [];
    this.issueId = issueId;
    this.sessionId = sessionId;
    this.kind = kind;
    this.attachOpts = opts;
    this.reconnectAttempt = 0;
    this.openSocket();
  }

  sendInput(data: string, kind: RuntimeSessionKind) {
    if (!this.sessionId || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!this.opened) {
      this.pendingInput.push({ data, kind });
      return;
    }
    this.ws.send(
      JSON.stringify({
        type: "session.input",
        payload: { session_id: this.sessionId, kind, data },
      }),
    );
  }

  resize(cols: number, rows: number) {
    this.attachOpts = { ...this.attachOpts, cols, rows };
    if (!this.sessionId || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "session.resize",
        payload: { session_id: this.sessionId, cols, rows },
      }),
    );
  }

  subscribe(subscribed: boolean) {
    this.attachOpts = { ...this.attachOpts, subscribed };
    if (!this.sessionId || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "session.subscribe",
        payload: { session_id: this.sessionId, subscribed },
      }),
    );
  }

  /** Detach this viewer. Does not end the shared session for everyone. */
  disconnect() {
    this.closed = true;
    this.stopReconnect();
    this.pendingInput = [];
    this.ws?.close();
    this.ws = null;
    this.opened = false;
  }

  private openSocket() {
    if (this.closed || !this.issueId || !this.sessionId) return;
    const ws = new WebSocket(buildRuntimeSessionUrl(this.issueId));
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws || this.closed) return;
      const token = defaultStorage.getItem("multica_token");
      if (token) {
        ws.send(JSON.stringify({ type: "auth", payload: { token } }));
      }
      this.sendAttach(this.attachOpts);
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      let msg: { type?: string; payload?: unknown; error?: unknown };
      try {
        msg = JSON.parse(String(event.data)) as {
          type?: string;
          payload?: unknown;
          error?: unknown;
        };
      } catch {
        return;
      }
      if (msg.type === "auth_ack") {
        return;
      }
      if (!msg.type && typeof msg.error === "string") {
        this.fail("open_failed", msg.error);
        return;
      }
      const payload = coercePayload(msg.payload);
      switch (msg.type) {
        case "session.ready":
          if (typeof payload.session_id === "string" && payload.session_id) {
            this.sessionId = payload.session_id;
          }
          this.opened = true;
          this.reconnectAttempt = 0;
          this.flushPending();
          this.handlers.onReady?.(payload as unknown as RuntimeSessionReady);
          break;
        case "session.data":
          this.handlers.onData?.(payload as unknown as RuntimeSessionData);
          break;
        case "session.error":
          this.fail(
            typeof payload.code === "string" ? payload.code : "open_failed",
            typeof payload.message === "string" ? payload.message : undefined,
          );
          break;
        case "session.close":
          this.closed = true;
          this.stopReconnect();
          this.handlers.onClose?.(typeof payload.reason === "string" ? payload.reason : undefined);
          this.ws?.close();
          break;
        default:
          break;
      }
    };

    ws.onerror = () => {
      if (this.ws !== ws || this.opened || this.closed) return;
      this.fail("open_failed", "websocket error");
    };

    ws.onclose = () => {
      if (this.ws !== ws || this.closed) return;
      if (this.opened) {
        this.opened = false;
        this.handlers.onClose?.("socket_closed");
        this.scheduleReconnect();
        return;
      }
      this.fail("open_failed", "websocket closed");
    };
  }

  private scheduleReconnect() {
    if (this.closed || !this.issueId || !this.sessionId) return;
    if (this.reconnectAttempt >= 8) {
      this.fail("open_failed", "websocket closed");
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 8000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private stopReconnect() {
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private fail(code: string, message?: string) {
    if (this.closed) return;
    this.closed = true;
    this.stopReconnect();
    this.handlers.onError?.({
      session_id: this.sessionId ?? "",
      code,
      message,
    });
    this.ws?.close();
  }

  private flushPending() {
    const queued = this.pendingInput;
    this.pendingInput = [];
    for (const item of queued) {
      this.sendInput(item.data, item.kind);
    }
  }

  private sendAttach(opts?: {
    cols?: number;
    rows?: number;
    subscribed?: boolean;
  }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.sessionId) return;
    this.ws.send(
      JSON.stringify({
        type: "session.attach",
        payload: {
          session_id: this.sessionId,
          kind: this.kind,
          cols: opts?.cols,
          rows: opts?.rows,
          subscribed: opts?.subscribed,
        },
      }),
    );
  }
}
