"use client";

import { CHAT_WORKSPACE_MOCK } from "@multica/core/chat";
import { AgentChatPage } from "./agent-chat-page";
import { ChatWorkspace } from "./workspace/chat-workspace";

export function ChatPage() {
  if (CHAT_WORKSPACE_MOCK) return <ChatWorkspace />;
  return <AgentChatPage />;
}
