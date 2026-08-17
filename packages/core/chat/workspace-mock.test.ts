import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MOCK_MACHINES,
  MOCK_MODELS,
  WORKSPACE_REPLY_DELAY_MS,
  resetChatWorkspaceStore,
  useChatWorkspaceStore,
} from "./workspace-mock";

describe("chat workspace mock store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetChatWorkspaceStore();
  });

  afterEach(() => {
    resetChatWorkspaceStore();
    vi.useRealTimers();
  });

  it("rejects send until a machine and model are chosen", () => {
    const store = useChatWorkspaceStore.getState();
    expect(store.sendMessage("hello")).toBe(false);

    store.setDraftMachine(MOCK_MACHINES[0]!.id);
    expect(useChatWorkspaceStore.getState().sendMessage("hello")).toBe(false);

    store.setDraftModel(MOCK_MODELS[0]!.id);
    expect(useChatWorkspaceStore.getState().sendMessage("hello")).toBe(true);
    expect(useChatWorkspaceStore.getState().sessions).toHaveLength(1);
  });

  it("creates a session and fills a mocked assistant reply", () => {
    const store = useChatWorkspaceStore.getState();
    store.setDraftMachine(MOCK_MACHINES[0]!.id);
    store.setDraftModel(MOCK_MODELS[0]!.id);
    store.sendMessage("Inspect the repo");

    const session = useChatWorkspaceStore.getState().sessions[0];
    expect(session?.title).toBe("Inspect the repo");
    expect(session?.messages).toHaveLength(2);
    expect(session?.messages[1]?.pending).toBe(true);

    vi.advanceTimersByTime(WORKSPACE_REPLY_DELAY_MS);
    const replied = useChatWorkspaceStore.getState().sessions[0];
    expect(replied?.messages[1]?.pending).toBe(false);
    expect(replied?.messages[1]?.content).toContain("This Mac");
    expect(replied?.messages[1]?.content).toContain("Claude Opus");
  });

  it("switches the right pane from a slash command", () => {
    const store = useChatWorkspaceStore.getState();
    store.setDraftMachine(MOCK_MACHINES[0]!.id);
    store.setDraftModel(MOCK_MODELS[0]!.id);
    store.sendMessage("ready");
    const sessionId = useChatWorkspaceStore.getState().activeSessionId;
    expect(sessionId).toBeTruthy();

    useChatWorkspaceStore.getState().applySlash("git", sessionId);
    expect(useChatWorkspaceStore.getState().sessions[0]?.rightPane).toBe("git");
  });
});
