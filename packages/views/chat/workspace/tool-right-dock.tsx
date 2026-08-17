"use client";

import {
  FolderGit2,
  FolderTree,
  Globe,
  MonitorPlay,
  SquareTerminal,
} from "lucide-react";
import {
  type WorkspaceRightPane,
  type WorkspaceSession,
} from "@multica/core/chat";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../../i18n";
import { BrowserPane } from "./panes/browser-pane";
import { FilesPane } from "./panes/files-pane";
import { GitPane } from "./panes/git-pane";
import { RdpPane } from "./panes/rdp-pane";
import { TerminalPane } from "./panes/terminal-pane";

const TABS: { id: WorkspaceRightPane; icon: typeof Globe }[] = [
  { id: "browser", icon: Globe },
  { id: "terminal", icon: SquareTerminal },
  { id: "files", icon: FolderTree },
  { id: "git", icon: FolderGit2 },
  { id: "rdp", icon: MonitorPlay },
];

export function ToolRightDock({
  session,
  onPaneChange,
  onBrowserUrl,
  onSelectFile,
  onTerminalCommand,
}: {
  session: WorkspaceSession;
  onPaneChange: (pane: WorkspaceRightPane) => void;
  onBrowserUrl: (url: string) => void;
  onSelectFile: (path: string) => void;
  onTerminalCommand: (terminalId: string, command: string) => void;
}) {
  const { t } = useT("chat");
  const terminal =
    session.terminals.find((item) => item.id === session.activeBottomTerminalId) ??
    session.terminals[0];

  return (
    <div className="flex h-full min-h-0 flex-col border-l">
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = session.rightPane === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onPaneChange(tab.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-caption hover:bg-muted",
                active && "bg-muted font-medium",
              )}
            >
              <Icon className="size-3.5" />
              {t(($) => $.workspace[tab.id])}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1">
        {session.rightPane === "browser" && (
          <BrowserPane url={session.browserUrl} onNavigate={onBrowserUrl} />
        )}
        {session.rightPane === "terminal" && (
          <TerminalPane
            terminal={terminal}
            onCommand={(command) => terminal && onTerminalCommand(terminal.id, command)}
          />
        )}
        {session.rightPane === "files" && (
          <FilesPane selectedPath={session.selectedFilePath} onSelect={onSelectFile} />
        )}
        {session.rightPane === "git" && <GitPane />}
        {session.rightPane === "rdp" && <RdpPane machineId={session.machineId} />}
      </div>
    </div>
  );
}
