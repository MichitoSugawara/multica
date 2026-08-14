"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Globe, Plus, SquareTerminal, X } from "lucide-react";
import { useAuthStore } from "@multica/core/auth";
import { useWorkspaceId } from "@multica/core/hooks";
import {
  useCloseIssueRuntimeSession,
  useCreateIssueRuntimeSession,
} from "@multica/core/issues/mutations";
import { issueRuntimeSessionsOptions } from "@multica/core/issues/queries";
import { isRuntimeUsableForUser } from "@multica/core/runtimes";
import { runtimeListOptions } from "@multica/core/runtimes/queries";
import {
  ISSUE_DOCK_PROPERTIES_PANE_ID,
  useIssueDockStore,
  type IssueDockPane,
  type IssueDockPaneKind,
} from "@multica/core/issues/stores/issue-dock-store";
import type { Issue, IssueRuntimeSessionRecord, RuntimeDevice } from "@multica/core/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@multica/ui/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@multica/ui/components/ui/popover";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../../i18n";
import {
  buildRuntimeMachines,
  type RuntimeMachine,
} from "../../runtimes/components/runtime-machines";
import { DockBrowserPane } from "./dock-browser-pane";
import { DockEmptyState } from "./dock-empty-state";
import { DockTerminalPane } from "./dock-terminal-pane";

const propertiesPane: IssueDockPane = {
  id: ISSUE_DOCK_PROPERTIES_PANE_ID,
  kind: "properties",
};

export function IssueRightDock({
  issue,
  properties,
  enableTools,
}: {
  issue: Issue;
  properties: ReactNode;
  enableTools: boolean;
}) {
  const { t } = useT("issues");
  const wsId = useWorkspaceId();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const { data: runtimes = [] } = useQuery({
    ...runtimeListOptions(wsId),
    enabled: enableTools,
  });
  const { data: sessionList } = useQuery({
    ...issueRuntimeSessionsOptions(wsId, issue.id),
    enabled: enableTools,
  });
  const machines = useMemo(
    () =>
      buildRuntimeMachines(runtimes, { now: Date.now(), currentUserId }).filter(
        (machine) =>
          machine.runtimes.some((runtime) => isRuntimeUsableForUser(runtime, currentUserId)),
      ),
    [runtimes, currentUserId],
  );

  const sessions = sessionList?.sessions ?? [];
  const panes = useMemo(
    () => [propertiesPane, ...sessions.map((session) => sessionToPane(session, machines))],
    [sessions, machines],
  );
  const storedActive = useIssueDockStore((s) => s.activePaneId(issue.id));
  const activePaneId = panes.some((pane) => pane.id === storedActive)
    ? storedActive
    : ISSUE_DOCK_PROPERTIES_PANE_ID;
  const setActivePane = useIssueDockStore((s) => s.setActivePane);
  const createSession = useCreateIssueRuntimeSession(issue.id);
  const closeSession = useCloseIssueRuntimeSession(issue.id);

  const [pendingKind, setPendingKind] = useState<Exclude<IssueDockPaneKind, "properties"> | null>(
    null,
  );
  const [addMenuKey, setAddMenuKey] = useState(0);
  const [privateMachine, setPrivateMachine] = useState<{
    kind: Exclude<IssueDockPaneKind, "properties">;
    machine: RuntimeMachine;
  } | null>(null);
  const [closingPane, setClosingPane] = useState<IssueDockPane | null>(null);

  const openOnMachine = (
    kind: Exclude<IssueDockPaneKind, "properties">,
    machine?: RuntimeMachine,
    confirmedPrivate = false,
  ) => {
    const usable = machine?.runtimes.find((runtime) =>
      isRuntimeUsableForUser(runtime, currentUserId),
    );
    if (machine && usable?.visibility === "private" && !confirmedPrivate) {
      setPrivateMachine({ kind, machine });
      return;
    }
    createSession.mutate(
      {
        kind: kind === "terminal" ? "pty" : "browser",
        daemon_id: machine?.daemonId,
        runtime_id: usable?.id ?? machine?.runtimes[0]?.id,
      },
      {
        onSuccess: (session) => {
          if (session.id) setActivePane(issue.id, session.id);
        },
      },
    );
    setPendingKind(null);
    setAddMenuKey((key) => key + 1);
    setPrivateMachine(null);
  };

  const pickKind = (kind: Exclude<IssueDockPaneKind, "properties">) => {
    if (machines.length === 0) {
      setPendingKind(kind);
      return;
    }
    if (machines.length === 1) {
      openOnMachine(kind, machines[0]);
      return;
    }
    setPendingKind(kind);
  };

  if (!enableTools) {
    return <>{properties}</>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 border-b px-2 py-1">
        {panes.map((pane) => {
          const active = pane.id === activePaneId;
          return (
            <div
              key={pane.id}
              className={cn(
                "flex min-w-0 items-center rounded-md",
                active ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => setActivePane(issue.id, pane.id)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-caption font-medium",
                  active ? "text-foreground" : "hover:text-foreground",
                )}
              >
                {pane.kind === "terminal" && <SquareTerminal className="size-3.5 shrink-0" />}
                {pane.kind === "browser" && <Globe className="size-3.5 shrink-0" />}
                <span className="truncate">{paneLabel(pane, t)}</span>
              </button>
              {pane.kind !== "properties" && (
                <button
                  type="button"
                  aria-label={t(($) => $.detail.dock_close)}
                  onClick={() => setClosingPane(pane)}
                  className="rounded-md p-1 hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}
        <Popover key={addMenuKey} onOpenChange={(open) => { if (!open) setPendingKind(null); }}>
          <PopoverTrigger className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <Plus className="size-3.5" />
            <span className="sr-only">{t(($) => $.detail.dock_add)}</span>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-1">
            {pendingKind ? (
              machines.length === 0 ? (
                <DockEmptyState code="no_runtime" />
              ) : (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-caption text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => setPendingKind(null)}
                  >
                    <ChevronLeft className="size-3.5" />
                    {t(($) => $.detail.dock_select_machine)}
                  </button>
                  {machines.map((machine) => (
                    <button
                      key={machine.id}
                      type="button"
                      aria-label={machine.title}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-caption hover:bg-accent"
                      onClick={() => openOnMachine(pendingKind, machine)}
                    >
                      <span className="truncate">{machine.title}</span>
                      {machine.onlineCount === 0 && (
                        <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                          {t(($) => $.detail.session_runtime_offline_title)}
                        </span>
                      )}
                    </button>
                  ))}
                </>
              )
            ) : (
              <>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-caption hover:bg-accent"
                  onClick={() => pickKind("terminal")}
                >
                  <SquareTerminal className="size-3.5" />
                  {t(($) => $.detail.dock_terminal)}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-caption hover:bg-accent"
                  onClick={() => pickKind("browser")}
                >
                  <Globe className="size-3.5" />
                  {t(($) => $.detail.dock_browser)}
                </button>
              </>
            )}
          </PopoverContent>
        </Popover>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {panes.map((pane) => {
          const hidden = pane.id !== activePaneId;
          const runtime = runtimeForPane(pane, runtimes);
          return (
            <div
              key={pane.id}
              hidden={hidden}
              className={cn("h-full min-h-0", pane.kind === "properties" && "overflow-y-auto p-4")}
            >
              {pane.kind === "properties" && properties}
              {pane.kind === "terminal" && (
                <DockTerminalPane issue={issue} pane={pane} runtime={runtime} active={!hidden} />
              )}
              {pane.kind === "browser" && (
                <DockBrowserPane issue={issue} pane={pane} runtime={runtime} active={!hidden} />
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog open={privateMachine != null} onOpenChange={(open) => { if (!open) setPrivateMachine(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.detail.dock_private_title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.detail.dock_private_body)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(($) => $.detail.dock_private_cancel)}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (privateMachine) openOnMachine(privateMachine.kind, privateMachine.machine, true);
              }}
            >
              {t(($) => $.detail.dock_private_confirm)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={closingPane != null} onOpenChange={(open) => { if (!open) setClosingPane(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.detail.dock_end_title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.detail.dock_end_body)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(($) => $.detail.dock_end_cancel)}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!closingPane) return;
                closeSession.mutate(closingPane.id, {
                  onSuccess: () => {
                    if (activePaneId === closingPane.id) {
                      setActivePane(issue.id, ISSUE_DOCK_PROPERTIES_PANE_ID);
                    }
                    setClosingPane(null);
                  },
                });
              }}
            >
              {t(($) => $.detail.dock_end_confirm)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function sessionToPane(session: IssueRuntimeSessionRecord, machines: RuntimeMachine[]): IssueDockPane {
  const machine = machines.find((item) => item.daemonId === session.daemon_id);
  return {
    id: session.id,
    kind: session.kind === "browser" ? "browser" : "terminal",
    daemonId: session.daemon_id,
    runtimeId: session.runtime_id,
    machineTitle: machine?.title,
  };
}

function runtimeForPane(pane: IssueDockPane, runtimes: RuntimeDevice[]): RuntimeDevice | null {
  if (pane.runtimeId) {
    return runtimes.find((runtime) => runtime.id === pane.runtimeId) ?? null;
  }
  if (pane.daemonId) {
    const onMachine = runtimes.filter((runtime) => runtime.daemon_id === pane.daemonId);
    return onMachine.find((runtime) => runtime.status === "online") ?? onMachine[0] ?? null;
  }
  return null;
}

function paneLabel(
  pane: IssueDockPane,
  t: ReturnType<typeof useT<"issues">>["t"],
): string {
  const kind =
    pane.kind === "terminal"
      ? t(($) => $.detail.dock_terminal)
      : pane.kind === "browser"
        ? t(($) => $.detail.dock_browser)
        : t(($) => $.detail.dock_properties);
  if (pane.kind === "properties" || !pane.machineTitle) return kind;
  return `${kind} · ${pane.machineTitle}`;
}

export { ISSUE_DOCK_PROPERTIES_PANE_ID };
