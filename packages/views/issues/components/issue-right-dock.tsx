"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, Globe, Plus, SlidersHorizontal, SquareTerminal, X } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@multica/ui/components/ui/tooltip";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../../i18n";
import {
  buildRuntimeMachines,
  type RuntimeMachine,
} from "../../runtimes/components/runtime-machines";
import { DockBrowserPane } from "./dock-browser-pane";
import { DockEmptyState } from "./dock-empty-state";
import { DockTerminalPane } from "./dock-terminal-pane";

export function IssueRightDock({
  issue,
  properties,
  enableTools,
  variant = "right",
}: {
  issue: Issue;
  properties?: ReactNode;
  enableTools: boolean;
  /** "right" is the full dock (properties + terminal + browser). "bottom"
   *  mirrors the Codex app's bottom panel: terminals only, no properties. */
  variant?: "right" | "bottom";
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
  const isBottom = variant === "bottom";
  // Sessions are shared per-issue on the server; which dock (right / bottom)
  // hosts a tab is a client-side preference kept in the dock store. Each
  // session renders in exactly one dock so its WS attaches only once.
  const bottomIds = useIssueDockStore((s) => s.bottomSessionIds(issue.id));
  const dockSessions = useMemo(
    () => sessions.filter((session) => bottomIds.includes(session.id) === isBottom),
    [sessions, bottomIds, isBottom],
  );
  // Tab order is a client-side preference: reconcile the persisted-ish local
  // order with whatever sessions the server currently reports (new sessions
  // append, closed sessions drop out).
  const [paneOrder, setPaneOrder] = useState<string[]>([]);
  const panes = useMemo(() => {
    const byId = new Map(
      dockSessions.map((session) => [session.id, sessionToPane(session, machines)] as const),
    );
    const ordered: IssueDockPane[] = [];
    for (const id of paneOrder) {
      const pane = byId.get(id);
      if (pane) {
        ordered.push(pane);
        byId.delete(id);
      }
    }
    return [...ordered, ...byId.values()];
  }, [dockSessions, machines, paneOrder]);
  const storedActive = useIssueDockStore((s) =>
    isBottom ? s.bottomActivePaneId(issue.id) : s.activePaneId(issue.id),
  );
  const sessionTitles = useIssueDockStore((s) => s.sessionTitles);
  // Codex-style tab labels: short "Terminal 1" / "Browser 1" defaults,
  // overridden live by what the session is doing (terminal OSC title /
  // browser page host).
  const paneLabels = useMemo(() => {
    const counters: Record<string, number> = {};
    const labels = new Map<string, string>();
    for (const pane of panes) {
      counters[pane.kind] = (counters[pane.kind] ?? 0) + 1;
      const fallback =
        pane.kind === "terminal"
          ? `${t(($) => $.detail.dock_terminal)} ${counters[pane.kind]}`
          : `${t(($) => $.detail.dock_browser)} ${counters[pane.kind]}`;
      labels.set(pane.id, sessionTitles[pane.id] ?? fallback);
    }
    return labels;
  }, [panes, sessionTitles, t]);
  const activePaneId = panes.some((pane) => pane.id === storedActive)
    ? storedActive
    : isBottom
      ? (panes[0]?.id ?? null)
      : ISSUE_DOCK_PROPERTIES_PANE_ID;
  const propertiesActive = !isBottom && activePaneId === ISSUE_DOCK_PROPERTIES_PANE_ID;
  const setActivePane = useIssueDockStore((s) => s.setActivePane);
  const setBottomActivePane = useIssueDockStore((s) => s.setBottomActivePane);
  const markSessionBottom = useIssueDockStore((s) => s.markSessionBottom);
  const selectPane = (paneId: string) => {
    if (isBottom) setBottomActivePane(issue.id, paneId);
    else setActivePane(issue.id, paneId);
  };
  const createSession = useCreateIssueRuntimeSession(issue.id);
  const closeSession = useCloseIssueRuntimeSession(issue.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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
          if (!session.id) return;
          if (isBottom) {
            markSessionBottom(issue.id, session.id);
            setBottomActivePane(issue.id, session.id);
          } else {
            setActivePane(issue.id, session.id);
          }
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
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => {
              if (!over || active.id === over.id) return;
              const ids = panes.map((pane) => pane.id);
              const oldIndex = ids.indexOf(String(active.id));
              const newIndex = ids.indexOf(String(over.id));
              if (oldIndex < 0 || newIndex < 0) return;
              setPaneOrder(arrayMove(ids, oldIndex, newIndex));
            }}
          >
            <SortableContext
              items={panes.map((pane) => pane.id)}
              strategy={horizontalListSortingStrategy}
            >
              {panes.map((pane) => (
                <DockTab
                  key={pane.id}
                  pane={pane}
                  label={paneLabels.get(pane.id) ?? ""}
                  active={pane.id === activePaneId}
                  closeLabel={t(($) => $.detail.dock_close)}
                  onSelect={() => selectPane(pane.id)}
                  onClose={() => setClosingPane(pane)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        <Popover key={addMenuKey} onOpenChange={(open) => { if (!open) setPendingKind(null); }}>
          <PopoverTrigger className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <Plus className="size-4" />
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
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-label text-muted-foreground hover:bg-accent hover:text-foreground"
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
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-label hover:bg-accent"
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
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-label hover:bg-accent"
                  onClick={() => pickKind("terminal")}
                >
                  <SquareTerminal className="size-4" />
                  {t(($) => $.detail.dock_terminal)}
                </button>
                {/* The bottom dock mirrors the Codex app's bottom panel:
                    terminals only. Browsers open in the right dock. */}
                {!isBottom && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-label hover:bg-accent"
                    onClick={() => pickKind("browser")}
                  >
                    <Globe className="size-4" />
                    {t(($) => $.detail.dock_browser)}
                  </button>
                )}
              </>
            )}
          </PopoverContent>
        </Popover>
        {!isBottom && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={t(($) => $.detail.dock_properties)}
                  onClick={() => setActivePane(issue.id, ISSUE_DOCK_PROPERTIES_PANE_ID)}
                  className={cn(
                    "rounded-md p-1.5",
                    propertiesActive
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <SlidersHorizontal className="size-4" />
                </button>
              }
            />
            <TooltipContent side="bottom">{t(($) => $.detail.dock_properties)}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {!isBottom && (
          <div
            hidden={!propertiesActive}
            className="h-full min-h-0 overflow-y-auto p-4"
          >
            {properties}
          </div>
        )}
        {isBottom && panes.length === 0 && <DockEmptyState code="bottom_empty" />}
        {panes.map((pane) => {
          const hidden = pane.id !== activePaneId;
          const runtime = runtimeForPane(pane, runtimes);
          return (
            <div
              key={pane.id}
              hidden={hidden}
              className="h-full min-h-0"
            >
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
                      if (isBottom) setBottomActivePane(issue.id, null);
                      else setActivePane(issue.id, ISSUE_DOCK_PROPERTIES_PANE_ID);
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

/* Tab chip modeled on the Codex desktop app's pane tabs: icon + label pill,
   close button on the right, draggable to reorder, middle-click (wheel
   button) closes — mirroring browser/Codex tab affordances. */
function DockTab({
  pane,
  label,
  active,
  closeLabel,
  onSelect,
  onClose,
}: {
  pane: IssueDockPane;
  label: string;
  active: boolean;
  closeLabel: string;
  onSelect: () => void;
  onClose: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pane.id,
  });
  // Short labels drop the machine name that used to be in the tab text, so
  // keep it (and the full, untruncated label) reachable on hover.
  const hoverTitle = pane.machineTitle ? `${label} · ${pane.machineTitle}` : label;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex min-w-0 shrink-0 items-center rounded-md border",
        active
          ? "border-border bg-accent text-foreground shadow-xs"
          : "border-transparent text-muted-foreground hover:bg-accent/60",
        isDragging && "z-10 opacity-80",
      )}
      // Middle-click (wheel press) closes the tab, like browser tabs and the
      // Codex app. auxclick fires after the full press/release cycle, so a
      // scroll gesture never triggers it.
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
      // Chromium autoscroll starts on middle-button *down*; block it so the
      // auxclick above is the only middle-button behavior.
      onPointerDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        onClick={onSelect}
        title={hoverTitle}
        className={cn(
          "flex min-w-0 items-center gap-1.5 py-1.5 pl-2.5 pr-1 text-label font-medium",
          active ? "text-foreground" : "hover:text-foreground",
        )}
      >
        {pane.kind === "terminal" && <SquareTerminal className="size-4 shrink-0" />}
        {pane.kind === "browser" && <Globe className="size-4 shrink-0" />}
        <span className="max-w-40 truncate">{label}</span>
      </button>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="mr-1 rounded p-1 hover:bg-background/80 hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
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

export { ISSUE_DOCK_PROPERTIES_PANE_ID };
