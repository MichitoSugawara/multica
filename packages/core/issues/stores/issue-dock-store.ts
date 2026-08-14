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
}

interface IssueDockStore {
  byIssue: Record<string, IssueDockEntry>;
  activePaneId: (issueId: string) => string;
  setActivePane: (issueId: string, paneId: string) => void;
}

function entryFor(byIssue: Record<string, IssueDockEntry>, issueId: string): IssueDockEntry {
  return byIssue[issueId] ?? { activePaneId: ISSUE_DOCK_PROPERTIES_PANE_ID };
}

export const useIssueDockStore = create<IssueDockStore>()(
  persist(
    (set, get) => ({
      byIssue: {},
      activePaneId: (issueId) => entryFor(get().byIssue, issueId).activePaneId,
      setActivePane: (issueId, paneId) =>
        set((s) => ({
          byIssue: {
            ...s.byIssue,
            [issueId]: { activePaneId: paneId },
          },
        })),
    }),
    {
      name: "multica_issue_dock",
      storage: createJSONStorage(() => createWorkspaceAwareStorage(defaultStorage)),
      partialize: (s) => ({ byIssue: s.byIssue }),
    },
  ),
);

registerForWorkspaceRehydration(() => useIssueDockStore.persist.rehydrate());
