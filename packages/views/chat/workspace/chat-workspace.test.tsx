// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@multica/core/i18n/react";
import {
  MOCK_MACHINES,
  MOCK_MODELS,
  resetChatWorkspaceStore,
  useChatWorkspaceStore,
} from "@multica/core/chat";
import {
  NavigationProvider,
  type NavigationAdapter,
} from "../../navigation";
import enCommon from "../../locales/en/common.json";
import enChat from "../../locales/en/chat.json";
import { ChatWorkspace } from "./chat-workspace";

const TEST_RESOURCES = { en: { common: enCommon, chat: enChat } };

vi.mock("react-resizable-panels", () => ({
  useDefaultLayout: () => ({ defaultLayout: undefined, onLayoutChanged: vi.fn() }),
}));
vi.mock("@multica/ui/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => null,
}));
vi.mock("@multica/ui/hooks/use-mobile", () => ({
  useIsMobile: () => false,
  useIsCompact: () => false,
}));
vi.mock("@multica/core/paths", () => ({
  useWorkspacePaths: () => ({ chat: () => "/acme/chat" }),
}));

function renderWorkspace() {
  const replace = vi.fn();
  const navigation: NavigationAdapter = {
    push: vi.fn(),
    replace,
    back: vi.fn(),
    pathname: "/acme/chat",
    searchParams: new URLSearchParams(),
    getShareableUrl: (path) => path,
  };
  render(
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      <NavigationProvider value={navigation}>
        <ChatWorkspace />
      </NavigationProvider>
    </I18nProvider>,
  );
  return { replace };
}

describe("ChatWorkspace mock", () => {
  beforeEach(() => {
    resetChatWorkspaceStore();
  });

  afterEach(() => {
    resetChatWorkspaceStore();
  });

  it("starts on new chat and blocks send until machine and model are chosen", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    expect(screen.getByText("What should we work on?")).toBeInTheDocument();
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Select machine" }));
    await user.click(screen.getByRole("button", { name: MOCK_MACHINES[0]!.title }));
    expect(send).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Select model" }));
    await user.click(screen.getByRole("button", { name: MOCK_MODELS[0]!.label }));

    await user.type(screen.getByPlaceholderText(/Ask anything/), "hello workspace");
    expect(send).toBeEnabled();
    await user.click(send);

    expect(useChatWorkspaceStore.getState().sessions).toHaveLength(1);
    expect(screen.getAllByText("hello workspace").length).toBeGreaterThan(0);
  });

  it("opens the git pane from a slash command", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Select machine" }));
    await user.click(screen.getByRole("button", { name: MOCK_MACHINES[0]!.title }));
    await user.click(screen.getByRole("button", { name: "Select model" }));
    await user.click(screen.getByRole("button", { name: MOCK_MODELS[0]!.label }));

    const composer = screen.getByPlaceholderText(/Ask anything/);
    await user.type(composer, "/git");
    await user.keyboard("{Enter}");

    expect(useChatWorkspaceStore.getState().draftRightPane).toBe("git");

    await user.type(composer, "show status");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(useChatWorkspaceStore.getState().sessions[0]?.rightPane).toBe("git");
    expect(screen.getByText(/Branch/)).toBeInTheDocument();
  });
});
