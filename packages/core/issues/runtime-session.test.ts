import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRuntimeSessionUrl, IssueRuntimeSession } from "./runtime-session";

const getBaseUrl = vi.fn(() => "http://localhost:8080");
const getItem = vi.fn((_key?: string) => null as string | null);
const getCurrentSlug = vi.fn(() => "acme" as string | null);

vi.mock("../api", () => ({
  api: {
    getBaseUrl: () => getBaseUrl(),
  },
}));

vi.mock("../platform/storage", () => ({
  defaultStorage: {
    getItem: (key: string) => getItem(key),
  },
}));

vi.mock("../platform/workspace-storage", () => ({
  getCurrentSlug: () => getCurrentSlug(),
}));

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
}

describe("buildRuntimeSessionUrl", () => {
  it("turns an absolute API base into a websocket URL", () => {
    expect(buildRuntimeSessionUrl("issue-1", { httpBase: "http://localhost:8080" })).toBe(
      "ws://localhost:8080/api/issues/issue-1/runtime-session?workspace_slug=acme",
    );
  });

  it("uses the page origin when the API base is empty so cookie auth stays same-origin", () => {
    expect(
      buildRuntimeSessionUrl("issue-1", {
        httpBase: "",
        pageOrigin: "http://localhost:3000",
      }),
    ).toBe(
      "ws://localhost:3000/api/issues/issue-1/runtime-session?workspace_slug=acme",
    );
  });
});

describe("IssueRuntimeSession", () => {
  const OriginalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    getItem.mockReturnValue(null);
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.stubGlobal("WebSocket", OriginalWebSocket);
  });

  it("attaches with the server session id and queues input until ready", () => {
    const session = new IssueRuntimeSession();
    session.attach("issue-1", "sess-server", "pty", { cols: 80, rows: 24 });
    const ws = MockWebSocket.instances[0];
    expect(ws).toBeTruthy();
    ws!.open();

    const attach = JSON.parse(ws!.sent[0] ?? "{}") as {
      type?: string;
      payload?: { session_id?: string };
    };
    expect(attach.type).toBe("session.attach");
    expect(attach.payload?.session_id).toBe("sess-server");

    session.sendInput("aGVsbG8=", "pty");
    expect(ws!.sent).toHaveLength(1);

    ws!.onmessage?.({
      data: JSON.stringify({
        type: "session.ready",
        payload: { session_id: "sess-server", kind: "pty" },
      }),
    });
    expect(ws!.sent.at(-1)).toContain("session.input");
    session.disconnect();
  });

  it("reports a failed websocket instead of sitting on a blank terminal", () => {
    const onError = vi.fn();
    const session = new IssueRuntimeSession({ onError });
    session.attach("issue-1", "sess-server", "pty");
    MockWebSocket.instances[0]?.close();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "open_failed" }),
    );
  });

  it("disconnects without sending session.close so other viewers keep the process", () => {
    const session = new IssueRuntimeSession();
    session.attach("issue-1", "sess-server", "pty");
    const ws = MockWebSocket.instances[0]!;
    ws.open();
    session.disconnect();
    expect(ws.sent.some((frame) => frame.includes("session.close"))).toBe(false);
  });

  it("reattaches after a drop instead of leaving the pane blank", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const session = new IssueRuntimeSession({ onClose });
    session.attach("issue-1", "sess-server", "pty");
    const first = MockWebSocket.instances[0]!;
    first.open();
    first.onmessage?.({
      data: JSON.stringify({
        type: "session.ready",
        payload: { session_id: "sess-server", kind: "pty" },
      }),
    });
    first.close();
    expect(onClose).toHaveBeenCalledWith("socket_closed");

    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(2);
    const second = MockWebSocket.instances[1]!;
    second.open();
    expect(JSON.parse(second.sent[0] ?? "{}").type).toBe("session.attach");
    session.disconnect();
    vi.useRealTimers();
  });
});
