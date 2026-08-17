"use client";

import {
  Globe,
  GitBranch,
  FolderTree,
  Monitor,
  SquareTerminal,
} from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import type { MockToolTab } from "@multica/core/agent-workspace";
import { useT } from "../../i18n";
import { MockBrowserPane } from "./panes/mock-browser-pane";
import { MockTerminalPane } from "./panes/mock-terminal-pane";
import { MockRdpPane } from "./panes/mock-rdp-pane";
import { MockFilesPane } from "./panes/mock-files-pane";
import { MockGitPane } from "./panes/mock-git-pane";

export function AgentToolDock({
  activeTab,
  onTabChange,
  compactHeader = false,
}: {
  activeTab: MockToolTab;
  onTabChange: (tab: MockToolTab) => void;
  compactHeader?: boolean;
}) {
  const { t } = useT("agent-workspace");
  const tabs: { id: MockToolTab; label: string; icon: typeof Globe }[] = [
    { id: "browser", label: t(($) => $.dock.browser), icon: Globe },
    { id: "terminal", label: t(($) => $.dock.terminal), icon: SquareTerminal },
    { id: "rdp", label: t(($) => $.dock.rdp), icon: Monitor },
    { id: "files", label: t(($) => $.dock.files), icon: FolderTree },
    { id: "git", label: t(($) => $.dock.git), icon: GitBranch },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5 border-b px-1",
          compactHeader ? "h-8" : "h-9",
        )}
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-caption transition-colors",
              activeTab === id
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            {!compactHeader && <span className="truncate">{label}</span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "browser" && <MockBrowserPane />}
        {activeTab === "terminal" && <MockTerminalPane />}
        {activeTab === "rdp" && <MockRdpPane />}
        {activeTab === "files" && <MockFilesPane />}
        {activeTab === "git" && <MockGitPane />}
      </div>
    </div>
  );
}
