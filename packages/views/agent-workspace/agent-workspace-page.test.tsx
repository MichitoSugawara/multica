// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@multica/core/i18n/react";
import enCommon from "../locales/en/common.json";
import enAgentWorkspace from "../locales/en/agent-workspace.json";
import {
  NavigationProvider,
  type NavigationAdapter,
} from "../navigation";
import { AgentWorkspacePage } from "./agent-workspace-page";
import { useAgentWorkspaceStore } from "@multica/core/agent-workspace";

const TEST_RESOURCES = { en: { common: enCommon, "agent-workspace": enAgentWorkspace } };

vi.mock("react-resizable-panels", () => ({
  useDefaultLayout: () => ({ defaultLayout: undefined, onLayoutChanged: vi.fn() }),
}));
vi.mock("@multica/ui/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="panel-group">{children}</div>
  ),
  ResizablePanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResizableHandle: () => null,
}));

const layout = vi.hoisted(() => ({ width: 1440 }));
vi.mock("@multica/ui/hooks/use-mobile", () => ({
  useIsCompact: () => layout.width < 851,
}));

function makeAdapter(overrides: Partial<NavigationAdapter> = {}): NavigationAdapter {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: "/acme/chat",
    searchParams: new URLSearchParams(),
    getShareableUrl: (path: string) => `https://test.local${path}`,
    ...overrides,
  };
}

vi.mock("@multica/core/paths", async () => {
  const actual = await vi.importActual<typeof import("@multica/core/paths")>(
    "@multica/core/paths",
  );
  return {
    ...actual,
    useWorkspacePaths: () => actual.paths.workspace("acme"),
  };
});

function renderPage(adapter: NavigationAdapter) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider resources={TEST_RESOURCES} locale="en">
        <NavigationProvider value={adapter}>
          <AgentWorkspacePage />
        </NavigationProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe("AgentWorkspacePage", () => {
  beforeEach(() => {
    layout.width = 1440;
    useAgentWorkspaceStore.setState({
      sessions: [],
      activeSessionId: null,
      rightTab: "terminal",
      bottomTab: "terminal",
      bottomOpen: true,
      connectorSelection: {},
    });
    localStorage.clear();
  });

  it("shows empty state with New Chat CTA", () => {
    renderPage(makeAdapter());
    expect(screen.getByText(/Start a remote agent session/i)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "New Chat" }).length).toBeGreaterThan(0);
  });

  it("opens machine picker from ?new=1 and creates a mock session", () => {
    const replace = vi.fn();
    renderPage(
      makeAdapter({
        searchParams: new URLSearchParams("new=1"),
        replace,
      }),
    );

    fireEvent.click(screen.getByText("Moris (this PC)"));
    fireEvent.click(screen.getByText("Claude Sonnet 4"));
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));

    const sessions = useAgentWorkspaceStore.getState().sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.machineId).toBe("moris-this-pc");
    expect(sessions[0]?.modelId).toBe("claude-sonnet");
    expect(replace).toHaveBeenCalled();
  });

  it("renders tool dock tabs on desktop", () => {
    useAgentWorkspaceStore.getState().createSession("moris-this-pc", "claude-sonnet");
    renderPage(makeAdapter());
    expect(screen.getAllByRole("button", { name: "Browser" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Terminal" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Git" }).length).toBeGreaterThan(0);
  });
});
