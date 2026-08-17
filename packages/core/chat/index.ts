export { createChatStore, CHAT_MIN_W, CHAT_MIN_H, CHAT_DEFAULT_W, CHAT_DEFAULT_H, DRAFT_NEW_SESSION } from "./store";
export type { ChatStoreOptions, ChatState, ChatTimelineItem } from "./store";
export { useRecentContextStore, selectRecentContexts } from "./recent-context-store";
export type { RecentContextEntry, RecentContextType } from "./recent-context-store";
export {
  CHAT_WORKSPACE_MOCK,
  WORKSPACE_REPLY_DELAY_MS,
  MOCK_MACHINES,
  MOCK_MODELS,
  MOCK_CONNECTORS,
  MOCK_FILES,
  MOCK_GIT_BRANCH,
  MOCK_GIT_FILES,
  MOCK_GIT_DIFF,
  WORKSPACE_SLASH_COMMANDS,
  useChatWorkspaceStore,
  resetChatWorkspaceStore,
  machineLabel,
  modelLabel,
  fileByPath,
} from "./workspace-mock";
export type {
  WorkspaceMachine,
  WorkspaceMachineKind,
  WorkspaceModel,
  WorkspaceMessage,
  WorkspaceSession,
  WorkspaceRightPane,
  WorkspaceConnectorId,
  WorkspaceSlashId,
  WorkspaceSlashCommand,
  WorkspaceTerminal,
} from "./workspace-mock";

import type { createChatStore as CreateChatStoreFn } from "./store";

type ChatStoreInstance = ReturnType<typeof CreateChatStoreFn>;

/** Module-level singleton — set once at app boot via `registerChatStore()`. */
let _store: ChatStoreInstance | null = null;

/**
 * Register the chat store instance created by the app.
 * Must be called at boot before any component renders.
 */
export function registerChatStore(store: ChatStoreInstance) {
  _store = store;
}

/**
 * Singleton accessor — a Zustand hook backed by the registered instance.
 * Supports `useChatStore(selector)` and `useChatStore.getState()`.
 */
export const useChatStore: ChatStoreInstance = new Proxy(
  (() => {}) as unknown as ChatStoreInstance,
  {
    apply(_target, _thisArg, args) {
      if (!_store)
        throw new Error(
          "Chat store not initialised — call registerChatStore() first",
        );
      return (_store as unknown as (...a: unknown[]) => unknown)(...args);
    },
    get(_target, prop) {
      if (!_store) return undefined;
      return Reflect.get(_store, prop);
    },
  },
);
