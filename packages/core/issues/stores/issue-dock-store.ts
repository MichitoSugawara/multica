import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createWorkspaceAwareStorage, registerForWorkspaceRehydration } from "../../platform/workspace-storage";
import { defaultStorage } from "../../platform/storage";

export type IssueDockPaneKind = "properties" | "terminal" | "browser";

export interface IssueDockPaneTarget {
  daemonId?: string | null;
  runtimeId?: string | null;
  machineTitle?: string;
}

export interface IssueDockPane extends IssueDockPaneTarget {
  id: string;
  kind: IssueDockPaneKind;
}

export const ISSUE_DOCK_PROPERTIES_PANE_ID = "properties";

interface IssueDockEntry {
  activePaneId: string;
  /** Active tab in the bottom dock (Codex-style bottom panel). */
  bottomActivePaneId?: string;
  /** Session ids the user opened from the bottom dock. Sessions are shared
   *  per-issue on the server; which dock hosts a tab is a client-side
   *  preference, so it lives here rather than on the session record. */
  bottomSessionIds?: string[];
}

interface IssueDockStore {
  byIssue: Record<string, IssueDockEntry>;
  /** Live tab titles (terminal OSC title / browser page host). Ephemeral —
   *  excluded from persistence because they describe a running session. */
  sessionTitles: Record<string, string>;
  activePaneId: (issueId: string) => string;
  setActivePane: (issueId: string, paneId: string) => void;
  bottomActivePaneId: (issueId: string) => string | null;
  setBottomActivePane: (issueId: string, paneId: string | null) => void;
  bottomSessionIds: (issueId: string) => string[];
  markSessionBottom: (issueId: string, sessionId: string) => void;
  setSessionTitle: (sessionId: string, title: string) => void;
}

function entryFor(byIssue: Record<string, IssueDockEntry>, issueId: string): IssueDockEntry {
  return byIssue[issueId] ?? { activePaneId: ISSUE_DOCK_PROPERTIES_PANE_ID };
}

const EMPTY_IDS: string[] = [];

export const useIssueDockStore = create<IssueDockStore>()(
  persist(
    (set, get) => ({
      byIssue: {},
      sessionTitles: {},
      activePaneId: (issueId) => entryFor(get().byIssue, issueId).activePaneId,
      setActivePane: (issueId, paneId) =>
        set((s) => ({
          byIssue: {
            ...s.byIssue,
            [issueId]: { ...entryFor(s.byIssue, issueId), activePaneId: paneId },
          },
        })),
      bottomActivePaneId: (issueId) =>
        entryFor(get().byIssue, issueId).bottomActivePaneId ?? null,
      setBottomActivePane: (issueId, paneId) =>
        set((s) => ({
          byIssue: {
            ...s.byIssue,
            [issueId]: {
              ...entryFor(s.byIssue, issueId),
              bottomActivePaneId: paneId ?? undefined,
            },
          },
        })),
      bottomSessionIds: (issueId) =>
        entryFor(get().byIssue, issueId).bottomSessionIds ?? EMPTY_IDS,
      markSessionBottom: (issueId, sessionId) =>
        set((s) => {
          const entry = entryFor(s.byIssue, issueId);
          const ids = entry.bottomSessionIds ?? [];
          if (ids.includes(sessionId)) return s;
          return {
            byIssue: {
              ...s.byIssue,
              [issueId]: { ...entry, bottomSessionIds: [...ids, sessionId] },
            },
          };
        }),
      setSessionTitle: (sessionId, title) =>
        set((s) => {
          const trimmed = title.trim();
          if (!trimmed) {
            // The session went back to an idle shell / blank page: drop the
            // override so the tab falls back to its numbered default.
            if (!(sessionId in s.sessionTitles)) return s;
            const { [sessionId]: _dropped, ...rest } = s.sessionTitles;
            return { sessionTitles: rest };
          }
          if (s.sessionTitles[sessionId] === trimmed) return s;
          return { sessionTitles: { ...s.sessionTitles, [sessionId]: trimmed } };
        }),
    }),
    {
      name: "multica_issue_dock",
      storage: createJSONStorage(() => createWorkspaceAwareStorage(defaultStorage)),
      partialize: (s) => ({ byIssue: s.byIssue }),
    },
  ),
);

registerForWorkspaceRehydration(() => useIssueDockStore.persist.rehydrate());
