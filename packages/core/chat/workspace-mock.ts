import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { defaultStorage } from "../platform/storage";
import {
  createWorkspaceAwareStorage,
  registerForWorkspaceRehydration,
} from "../platform/workspace-storage";

/** Client-only switch for the Codex-style chat workspace mock. */
export const CHAT_WORKSPACE_MOCK = true;

export const WORKSPACE_REPLY_DELAY_MS = 400;

export type WorkspaceMachineKind = "local" | "remote" | "cloud";
export type WorkspaceRightPane = "browser" | "terminal" | "files" | "git" | "rdp";
export type WorkspaceConnectorId = "github" | "slack" | "browser" | "filesystem";
export type WorkspaceSlashId = "browse" | "term" | "edit" | "git" | "rdp" | "connect";

export interface WorkspaceMachine {
  id: string;
  title: string;
  kind: WorkspaceMachineKind;
  online: boolean;
}

export interface WorkspaceModel {
  id: string;
  label: string;
}

export interface WorkspaceMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  pending?: boolean;
}

export interface WorkspaceTerminal {
  id: string;
  title: string;
  lines: string[];
}

export interface WorkspaceSession {
  id: string;
  title: string;
  machineId: string;
  modelId: string;
  messages: WorkspaceMessage[];
  createdAt: string;
  updatedAt: string;
  browserUrl: string;
  selectedFilePath: string;
  rightPane: WorkspaceRightPane;
  rightOpen: boolean;
  bottomOpen: boolean;
  terminals: WorkspaceTerminal[];
  activeBottomTerminalId: string | null;
  connectors: WorkspaceConnectorId[];
}

export interface WorkspaceSlashCommand {
  id: WorkspaceSlashId;
  label: string;
  description: string;
}

export const MOCK_MACHINES: WorkspaceMachine[] = [
  { id: "machine-local", title: "This Mac", kind: "local", online: true },
  { id: "machine-remote", title: "build-box", kind: "remote", online: true },
  { id: "machine-cloud", title: "Cloud workspace", kind: "cloud", online: false },
];

export const MOCK_MODELS: WorkspaceModel[] = [
  { id: "claude-opus", label: "Claude Opus" },
  { id: "gpt-5", label: "GPT-5" },
  { id: "gemini-pro", label: "Gemini Pro" },
];

export const MOCK_CONNECTORS: { id: WorkspaceConnectorId; label: string }[] = [
  { id: "github", label: "GitHub" },
  { id: "slack", label: "Slack" },
  { id: "browser", label: "Browser" },
  { id: "filesystem", label: "Filesystem" },
];

export const WORKSPACE_SLASH_COMMANDS: WorkspaceSlashCommand[] = [
  { id: "browse", label: "browse", description: "Open the browser pane" },
  { id: "term", label: "term", description: "Open a terminal" },
  { id: "edit", label: "edit", description: "Open the file editor" },
  { id: "git", label: "git", description: "Open git status" },
  { id: "rdp", label: "rdp", description: "Open remote desktop" },
  { id: "connect", label: "connect", description: "Manage connectors" },
];

export interface MockFileNode {
  path: string;
  content: string;
}

export const MOCK_FILES: MockFileNode[] = [
  {
    path: "README.md",
    content: "# demo-app\n\nA mock workspace for the chat agent window.\n",
  },
  {
    path: "package.json",
    content: '{\n  "name": "demo-app",\n  "private": true\n}\n',
  },
  {
    path: "src/index.ts",
    content: 'export function greet(name: string): string {\n  return `hello ${name}`;\n}\n',
  },
];

export const MOCK_GIT_BRANCH = "cursor/chat-workspace-mock";

export const MOCK_GIT_FILES: { path: string; status: "modified" | "added" }[] = [
  { path: "src/index.ts", status: "modified" },
  { path: "README.md", status: "added" },
];

export const MOCK_GIT_DIFF = `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,3 @@
-export function greet(name: string): string {
-  return \`hi \${name}\`;
+export function greet(name: string): string {
+  return \`hello \${name}\`;
 }
`;

const DEFAULT_BROWSER_URL = "https://example.com";
const DEFAULT_FILE = "src/index.ts";

export interface ChatWorkspaceState {
  sessions: WorkspaceSession[];
  activeSessionId: string | null;
  composingNew: boolean;
  draftMachineId: string | null;
  draftModelId: string | null;
  draftConnectors: WorkspaceConnectorId[];
  draftRightPane: WorkspaceRightPane;
  connectorMenuOpen: boolean;
  startNewChat: () => void;
  clearSelection: () => void;
  selectSession: (sessionId: string) => void;
  setDraftMachine: (machineId: string | null) => void;
  setDraftModel: (modelId: string | null) => void;
  toggleDraftConnector: (id: WorkspaceConnectorId) => void;
  setConnectorMenuOpen: (open: boolean) => void;
  applySlash: (command: WorkspaceSlashId, sessionId?: string | null) => void;
  sendMessage: (content: string) => boolean;
  setRightPane: (sessionId: string, pane: WorkspaceRightPane) => void;
  setRightOpen: (sessionId: string, open: boolean) => void;
  setBottomOpen: (sessionId: string, open: boolean) => void;
  setBrowserUrl: (sessionId: string, url: string) => void;
  setSelectedFile: (sessionId: string, path: string) => void;
  setActiveBottomTerminal: (sessionId: string, terminalId: string) => void;
  addBottomTerminal: (sessionId: string) => void;
  runTerminalCommand: (sessionId: string, terminalId: string, command: string) => void;
  toggleSessionConnector: (sessionId: string, id: WorkspaceConnectorId) => void;
}

const EMPTY_STATE = {
  sessions: [] as WorkspaceSession[],
  activeSessionId: null as string | null,
  composingNew: false,
  draftMachineId: null as string | null,
  draftModelId: null as string | null,
  draftConnectors: [] as WorkspaceConnectorId[],
  draftRightPane: "browser" as WorkspaceRightPane,
  connectorMenuOpen: false,
};

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function titleFromContent(content: string): string {
  const line = content.replace(/\s+/g, " ").trim();
  if (!line) return "New chat";
  return line.length > 42 ? `${line.slice(0, 41)}…` : line;
}

function machineById(id: string): WorkspaceMachine | undefined {
  return MOCK_MACHINES.find((machine) => machine.id === id);
}

function modelById(id: string): WorkspaceModel | undefined {
  return MOCK_MODELS.find((model) => model.id === id);
}

function createTerminal(index: number): WorkspaceTerminal {
  return {
    id: createId("term"),
    title: index === 1 ? "Terminal" : `Terminal ${index}`,
    lines: ["Welcome to the mock terminal.", "Type ls, git status, or help."],
  };
}

function createSession(input: {
  machineId: string;
  modelId: string;
  connectors: WorkspaceConnectorId[];
  rightPane: WorkspaceRightPane;
  firstMessage: string;
}): WorkspaceSession {
  const createdAt = nowIso();
  const terminal = createTerminal(1);
  return {
    id: createId("session"),
    title: titleFromContent(input.firstMessage),
    machineId: input.machineId,
    modelId: input.modelId,
    messages: [],
    createdAt,
    updatedAt: createdAt,
    browserUrl: DEFAULT_BROWSER_URL,
    selectedFilePath: DEFAULT_FILE,
    rightPane: input.rightPane,
    rightOpen: true,
    bottomOpen: input.rightPane === "terminal" ? false : true,
    terminals: [terminal],
    activeBottomTerminalId: terminal.id,
    connectors: input.connectors,
  };
}

function interpretTerminal(command: string): string[] {
  const trimmed = command.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) return [];
  if (lower === "clear") return [];
  if (lower === "help") {
    return ["Available commands: ls, git status, echo, help, clear"];
  }
  if (lower === "ls") {
    return MOCK_FILES.map((file) => file.path);
  }
  if (lower === "git status") {
    return [
      `On branch ${MOCK_GIT_BRANCH}`,
      "Changes not staged for commit:",
      ...MOCK_GIT_FILES.map((file) => `  ${file.status === "added" ? "A" : "M"} ${file.path}`),
    ];
  }
  if (lower.startsWith("echo ")) {
    return [trimmed.slice(5)];
  }
  return [`mock: command not found: ${trimmed}`];
}

function replyFor(content: string, machineId: string, modelId: string): string {
  const machine = machineById(machineId)?.title ?? "the selected machine";
  const model = modelById(modelId)?.label ?? "the selected model";
  const slash = content.trim().match(/^\/(\w+)/);
  if (slash?.[1] === "browse") {
    return `Opened the browser on ${machine} using ${model}. This is a mock session — no live page is loaded.`;
  }
  if (slash?.[1] === "term") {
    return `Terminal is ready on ${machine}. Try \`ls\` or \`git status\`.`;
  }
  if (slash?.[1] === "edit") {
    return `Opened the file tree on ${machine}. Pick a file in the right pane to inspect it.`;
  }
  if (slash?.[1] === "git") {
    return `Git status on ${machine} (${MOCK_GIT_BRANCH}). Commit is disabled in this mock.`;
  }
  if (slash?.[1] === "rdp") {
    return `Remote desktop preview for ${machine}. This is a visual mock only.`;
  }
  return `Working on ${machine} with ${model}. I received: “${content.trim()}”. This reply is mocked — no agent ran.`;
}

function paneForSlash(command: WorkspaceSlashId): WorkspaceRightPane | null {
  switch (command) {
    case "browse":
      return "browser";
    case "term":
      return "terminal";
    case "edit":
      return "files";
    case "git":
      return "git";
    case "rdp":
      return "rdp";
    case "connect":
      return null;
  }
}

function patchSession(
  sessions: WorkspaceSession[],
  sessionId: string,
  patch: (session: WorkspaceSession) => WorkspaceSession,
): WorkspaceSession[] {
  return sessions.map((session) => (session.id === sessionId ? patch(session) : session));
}

const replyTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleReply(sessionId: string, messageId: string, content: string) {
  const existing = replyTimers.get(messageId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    replyTimers.delete(messageId);
    useChatWorkspaceStore.setState((state) => ({
      sessions: patchSession(state.sessions, sessionId, (session) => ({
        ...session,
        updatedAt: nowIso(),
        messages: session.messages.map((message) =>
          message.id === messageId
            ? { ...message, content, pending: false }
            : message,
        ),
      })),
    }));
  }, WORKSPACE_REPLY_DELAY_MS);
  replyTimers.set(messageId, timer);
}

export const useChatWorkspaceStore = create<ChatWorkspaceState>()(
  persist(
    (set, get) => ({
      ...EMPTY_STATE,
      startNewChat: () =>
        set({
          activeSessionId: null,
          composingNew: true,
          draftMachineId: null,
          draftModelId: null,
          draftConnectors: [],
          draftRightPane: "browser",
          connectorMenuOpen: false,
        }),
      clearSelection: () =>
        set({
          activeSessionId: null,
          composingNew: false,
          connectorMenuOpen: false,
        }),
      selectSession: (sessionId) =>
        set({
          activeSessionId: sessionId,
          composingNew: false,
          connectorMenuOpen: false,
        }),
      setDraftMachine: (machineId) =>
        set({
          draftMachineId: machineId,
          draftModelId: machineId ? get().draftModelId : null,
        }),
      setDraftModel: (modelId) => set({ draftModelId: modelId }),
      toggleDraftConnector: (id) =>
        set((state) => ({
          draftConnectors: state.draftConnectors.includes(id)
            ? state.draftConnectors.filter((item) => item !== id)
            : [...state.draftConnectors, id],
        })),
      setConnectorMenuOpen: (open) => set({ connectorMenuOpen: open }),
      applySlash: (command, sessionId) => {
        if (command === "connect") {
          set({ connectorMenuOpen: true });
          return;
        }
        const pane = paneForSlash(command);
        if (!pane) return;
        const targetId = sessionId ?? get().activeSessionId;
        if (!targetId) {
          set({
            draftRightPane: pane,
            composingNew: true,
          });
          return;
        }
        set((state) => ({
          sessions: patchSession(state.sessions, targetId, (session) => ({
            ...session,
            rightPane: pane,
            rightOpen: true,
            bottomOpen: pane === "terminal" ? true : session.bottomOpen,
          })),
        }));
      },
      sendMessage: (raw) => {
        const content = raw.trim();
        if (!content) return false;
        const state = get();
        const machineId = state.activeSessionId
          ? state.sessions.find((session) => session.id === state.activeSessionId)?.machineId
          : state.draftMachineId;
        const modelId = state.activeSessionId
          ? state.sessions.find((session) => session.id === state.activeSessionId)?.modelId
          : state.draftModelId;
        if (!machineId || !modelId) return false;

        const userMessage: WorkspaceMessage = {
          id: createId("msg"),
          role: "user",
          content,
          createdAt: nowIso(),
        };
        const assistantMessage: WorkspaceMessage = {
          id: createId("msg"),
          role: "assistant",
          content: "",
          createdAt: nowIso(),
          pending: true,
        };

        let sessionId = state.activeSessionId;
        if (!sessionId || state.composingNew) {
          const session = createSession({
            machineId,
            modelId,
            connectors: state.draftConnectors,
            rightPane: state.draftRightPane,
            firstMessage: content,
          });
          session.messages = [userMessage, assistantMessage];
          sessionId = session.id;
          set({
            sessions: [session, ...state.sessions],
            activeSessionId: session.id,
            composingNew: false,
            draftMachineId: null,
            draftModelId: null,
            draftConnectors: [],
            draftRightPane: "browser",
          });
        } else {
          const currentId = sessionId;
          set({
            sessions: patchSession(state.sessions, currentId, (session) => ({
              ...session,
              updatedAt: nowIso(),
              messages: [...session.messages, userMessage, assistantMessage],
            })),
          });
        }

        const slash = content.match(/^\/(\w+)/);
        const slashId = WORKSPACE_SLASH_COMMANDS.find((item) => item.id === slash?.[1])?.id;
        if (slashId) get().applySlash(slashId, sessionId);

        scheduleReply(sessionId, assistantMessage.id, replyFor(content, machineId, modelId));
        return true;
      },
      setRightPane: (sessionId, pane) =>
        set((state) => ({
          sessions: patchSession(state.sessions, sessionId, (session) => ({
            ...session,
            rightPane: pane,
            rightOpen: true,
          })),
        })),
      setRightOpen: (sessionId, open) =>
        set((state) => ({
          sessions: patchSession(state.sessions, sessionId, (session) => ({
            ...session,
            rightOpen: open,
          })),
        })),
      setBottomOpen: (sessionId, open) =>
        set((state) => ({
          sessions: patchSession(state.sessions, sessionId, (session) => ({
            ...session,
            bottomOpen: open,
          })),
        })),
      setBrowserUrl: (sessionId, url) =>
        set((state) => ({
          sessions: patchSession(state.sessions, sessionId, (session) => ({
            ...session,
            browserUrl: url,
          })),
        })),
      setSelectedFile: (sessionId, path) =>
        set((state) => ({
          sessions: patchSession(state.sessions, sessionId, (session) => ({
            ...session,
            selectedFilePath: path,
            rightPane: "files",
            rightOpen: true,
          })),
        })),
      setActiveBottomTerminal: (sessionId, terminalId) =>
        set((state) => ({
          sessions: patchSession(state.sessions, sessionId, (session) => ({
            ...session,
            activeBottomTerminalId: terminalId,
            bottomOpen: true,
          })),
        })),
      addBottomTerminal: (sessionId) =>
        set((state) => ({
          sessions: patchSession(state.sessions, sessionId, (session) => {
            const terminal = createTerminal(session.terminals.length + 1);
            return {
              ...session,
              terminals: [...session.terminals, terminal],
              activeBottomTerminalId: terminal.id,
              bottomOpen: true,
            };
          }),
        })),
      runTerminalCommand: (sessionId, terminalId, command) =>
        set((state) => ({
          sessions: patchSession(state.sessions, sessionId, (session) => ({
            ...session,
            terminals: session.terminals.map((terminal) => {
              if (terminal.id !== terminalId) return terminal;
              const output = interpretTerminal(command);
              if (command.trim().toLowerCase() === "clear") {
                return { ...terminal, lines: [] };
              }
              return {
                ...terminal,
                lines: [...terminal.lines, `$ ${command}`, ...output],
              };
            }),
          })),
        })),
      toggleSessionConnector: (sessionId, id) =>
        set((state) => ({
          sessions: patchSession(state.sessions, sessionId, (session) => ({
            ...session,
            connectors: session.connectors.includes(id)
              ? session.connectors.filter((item) => item !== id)
              : [...session.connectors, id],
          })),
        })),
    }),
    {
      name: "multica_chat_workspace_mock",
      storage: createJSONStorage(() => createWorkspaceAwareStorage(defaultStorage)),
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        composingNew: state.composingNew,
        draftMachineId: state.draftMachineId,
        draftModelId: state.draftModelId,
        draftConnectors: state.draftConnectors,
        draftRightPane: state.draftRightPane,
      }),
      merge: (persisted, current) => {
        if (!persisted) return { ...current, ...EMPTY_STATE };
        const p = persisted as Partial<ChatWorkspaceState>;
        return {
          ...current,
          ...p,
          connectorMenuOpen: false,
        };
      },
    },
  ),
);

registerForWorkspaceRehydration(() => useChatWorkspaceStore.persist.rehydrate());

export function resetChatWorkspaceStore() {
  for (const timer of replyTimers.values()) clearTimeout(timer);
  replyTimers.clear();
  useChatWorkspaceStore.setState({ ...EMPTY_STATE });
}

export function machineLabel(id: string): string {
  return machineById(id)?.title ?? id;
}

export function modelLabel(id: string): string {
  return modelById(id)?.label ?? id;
}

export function fileByPath(path: string): MockFileNode | undefined {
  return MOCK_FILES.find((file) => file.path === path);
}
