// @vitest-environment jsdom

/**
 * ChatPage is the AgentWorkspacePage mock. Full tests live in
 * agent-workspace/agent-workspace-page.test.tsx.
 */
import { describe, it, expect } from "vitest";
import { ChatPage } from "./chat-page";
import { AgentWorkspacePage } from "../agent-workspace/agent-workspace-page";

describe("ChatPage export", () => {
  it("re-exports the agent workspace mock", () => {
    expect(ChatPage).toBe(AgentWorkspacePage);
  });
});
