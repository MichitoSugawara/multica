// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@multica/core/i18n/react";
import { issueKeys } from "@multica/core/issues/queries";
import { useIssueDockStore } from "@multica/core/issues/stores/issue-dock-store";
import { runtimeKeys } from "@multica/core/runtimes/queries";
import type { Issue, IssueRuntimeSessionRecord, RuntimeDevice } from "@multica/core/types";
import enCommon from "../../locales/en/common.json";
import enIssues from "../../locales/en/issues.json";
import { IssueRightDock } from "./issue-right-dock";

const TEST_RESOURCES = { en: { common: enCommon, issues: enIssues } };

class MockWebSocket {
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  constructor(public url: string) {}
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
}

vi.stubGlobal("WebSocket", MockWebSocket);

const createMutate = vi.fn();
const closeMutate = vi.fn();

vi.mock("@multica/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

vi.mock("@multica/core/auth", () => ({
  useAuthStore: Object.assign(
    (selector?: (state: { user: { id: string } }) => unknown) => {
      const state = { user: { id: "user-1" } };
      return selector ? selector(state) : state;
    },
    { getState: () => ({ user: { id: "user-1" } }) },
  ),
}));

vi.mock("@multica/core/issues/mutations", () => ({
  useCreateIssueRuntimeSession: () => ({ mutate: createMutate, isPending: false }),
  useCloseIssueRuntimeSession: () => ({ mutate: closeMutate, isPending: false }),
}));

vi.mock("@multica/core/api", () => ({
  api: { getBaseUrl: () => "http://localhost:8080" },
}));

const now = new Date().toISOString();

function makeRuntime(overrides: Partial<RuntimeDevice>): RuntimeDevice {
  return {
    id: "rt-1",
    workspace_id: "ws-1",
    daemon_id: "daemon-1",
    name: "Claude (MacBook)",
    runtime_mode: "local",
    provider: "claude",
    launch_header: "",
    status: "offline",
    device_info: "MacBook",
    metadata: {},
    owner_id: "user-1",
    visibility: "private",
    last_seen_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeSession(overrides: Partial<IssueRuntimeSessionRecord>): IssueRuntimeSessionRecord {
  return {
    id: "sess-1",
    workspace_id: "ws-1",
    issue_id: "issue-1",
    kind: "pty",
    daemon_id: "daemon-1",
    runtime_id: "rt-mac",
    opened_by: "user-1",
    status: "open",
    cwd: "/tmp",
    url: null,
    created_at: now,
    last_active_at: now,
    closed_at: null,
    ...overrides,
  };
}

const issue = { id: "issue-1" } as Issue;

function renderDock(runtimes: RuntimeDevice[], sessions: IssueRuntimeSessionRecord[] = []) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(runtimeKeys.list("ws-1"), runtimes);
  client.setQueryData(issueKeys.runtimeSessions("ws-1", "issue-1"), { sessions });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <IssueRightDock issue={issue} enableTools properties={<div>props</div>} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe("IssueRightDock shared sessions", () => {
  beforeEach(() => {
    useIssueDockStore.setState({ byIssue: {} });
    createMutate.mockReset();
    closeMutate.mockReset();
  });

  it("renders server sessions as tabs", () => {
    renderDock(
      [
        makeRuntime({ id: "rt-mac", daemon_id: "daemon-1", name: "Claude (MacBook)" }),
      ],
      [makeSession({ id: "sess-1", kind: "pty", daemon_id: "daemon-1" })],
    );
    expect(screen.getByText("Terminal · MacBook")).toBeInTheDocument();
  });

  it("explains a missing machine instead of creating a session", () => {
    renderDock([]);

    fireEvent.click(screen.getByRole("button", { name: "Add panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));

    expect(screen.getByText("No machine connected")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("warns before opening on a private machine", () => {
    renderDock([
      makeRuntime({ id: "rt-mac", daemon_id: "daemon-mac", name: "Claude (MacBook)", visibility: "private" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Add panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));

    expect(screen.getByText("Share this computer?")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Share and open" }));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "pty", daemon_id: "daemon-mac" }),
      expect.any(Object),
    );
  });

  it("asks before ending a shared session", () => {
    renderDock(
      [makeRuntime({ id: "rt-mac", daemon_id: "daemon-1" })],
      [makeSession({ id: "sess-1" })],
    );

    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(screen.getByText("End this session?")).toBeInTheDocument();
    expect(closeMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(closeMutate).toHaveBeenCalledWith("sess-1", expect.any(Object));
  });
});
