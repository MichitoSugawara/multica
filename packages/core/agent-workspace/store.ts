import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createWorkspaceAwareStorage, registerForWorkspaceRehydration } from "../platform/workspace-storage";
import { defaultStorage } from "../platform/storage";
import { buildSessionTitle, cannedAssistantReply } from "./mock-data";
import type { MockAgentSession, MockMessage, MockToolTab } from "./types";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface AgentWorkspaceStore {
  sessions: MockAgentSession[];
  activeSessionId: string | null;
  rightTab: MockToolTab;
  bottomTab: MockToolTab;
  bottomOpen: boolean;
  connectorSelection: Record<string, boolean>;

  setActiveSession: (sessionId: string | null) => void;
  createSession: (machineId: string, modelId: string) => MockAgentSession;
  sendMessage: (sessionId: string, content: string, openTab?: MockToolTab) => void;
  setRightTab: (tab: MockToolTab) => void;
  setBottomTab: (tab: MockToolTab) => void;
  setBottomOpen: (open: boolean) => void;
  toggleConnector: (connectorId: string) => void;
  updateSessionMachineModel: (
    sessionId: string,
    machineId: string,
    modelId: string,
  ) => void;
}

export const useAgentWorkspaceStore = create<AgentWorkspaceStore>()(
  persist(
    (set) => ({
      sessions: [],
      activeSessionId: null,
      rightTab: "terminal",
      bottomTab: "terminal",
      bottomOpen: true,
      connectorSelection: {},

      setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

      createSession: (machineId, modelId) => {
        const now = new Date().toISOString();
        const session: MockAgentSession = {
          id: newId("mock-session"),
          title: buildSessionTitle(machineId, modelId),
          machineId,
          modelId,
          messages: [
            {
              id: newId("msg"),
              role: "assistant",
              content:
                "Session ready. Use slash commands (`/terminal`, `/browser`, …) or connector chips below. Tool panes are mocked.",
              createdAt: now,
            },
          ],
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          sessions: [session, ...s.sessions],
          activeSessionId: session.id,
        }));
        return session;
      },

      sendMessage: (sessionId, content, openTab) => {
        const trimmed = content.trim();
        if (!trimmed) return;
        const now = new Date().toISOString();
        const userMessage: MockMessage = {
          id: newId("msg"),
          role: "user",
          content: trimmed,
          createdAt: now,
        };
        const reply = cannedAssistantReply(trimmed, openTab);
        const assistantMessage: MockMessage = {
          id: newId("msg"),
          role: "assistant",
          content: reply.content,
          createdAt: new Date().toISOString(),
        };
        set((s) => {
          const sessions = s.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  messages: [...session.messages, userMessage, assistantMessage],
                  updatedAt: assistantMessage.createdAt,
                }
              : session,
          );
          const next: Partial<AgentWorkspaceStore> = { sessions };
          if (reply.openTab) {
            next.rightTab = reply.openTab;
            next.bottomTab = reply.openTab;
            next.bottomOpen = true;
          }
          return next;
        });
      },

      setRightTab: (tab) => set({ rightTab: tab }),
      setBottomTab: (tab) => set({ bottomTab: tab }),
      setBottomOpen: (open) => set({ bottomOpen: open }),

      toggleConnector: (connectorId) =>
        set((s) => ({
          connectorSelection: {
            ...s.connectorSelection,
            [connectorId]: !(s.connectorSelection[connectorId] ?? false),
          },
        })),

      updateSessionMachineModel: (sessionId, machineId, modelId) =>
        set((s) => ({
          sessions: s.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  machineId,
                  modelId,
                  title: buildSessionTitle(machineId, modelId),
                  updatedAt: new Date().toISOString(),
                }
              : session,
          ),
        })),
    }),
    {
      name: "agent-workspace-mock",
      storage: createJSONStorage(() => createWorkspaceAwareStorage(defaultStorage)),
      partialize: (s) => ({
        sessions: s.sessions,
        activeSessionId: s.activeSessionId,
        rightTab: s.rightTab,
        bottomTab: s.bottomTab,
        bottomOpen: s.bottomOpen,
        connectorSelection: s.connectorSelection,
      }),
    },
  ),
);

registerForWorkspaceRehydration(useAgentWorkspaceStore);
