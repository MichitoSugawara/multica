"use client";

import { Plus } from "lucide-react";
import type { WorkspaceSession } from "@multica/core/chat";
import { Button } from "@multica/ui/components/ui/button";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../../i18n";
import { TerminalPane } from "./panes/terminal-pane";

export function ToolBottomDock({
  session,
  onSelectTerminal,
  onAddTerminal,
  onCommand,
}: {
  session: WorkspaceSession;
  onSelectTerminal: (terminalId: string) => void;
  onAddTerminal: () => void;
  onCommand: (terminalId: string, command: string) => void;
}) {
  const { t } = useT("chat");
  const active =
    session.terminals.find((item) => item.id === session.activeBottomTerminalId) ??
    session.terminals[0];

  return (
    <div className="flex h-full min-h-0 flex-col border-t">
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1">
        {session.terminals.map((terminal) => (
          <button
            key={terminal.id}
            type="button"
            onClick={() => onSelectTerminal(terminal.id)}
            className={cn(
              "rounded-md px-2 py-1 text-caption hover:bg-muted",
              terminal.id === active?.id && "bg-muted font-medium",
            )}
          >
            {terminal.title}
          </button>
        ))}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t(($) => $.workspace.terminal_add)}
          onClick={onAddTerminal}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <TerminalPane
          terminal={active}
          onCommand={(command) => active && onCommand(active.id, command)}
        />
      </div>
    </div>
  );
}
