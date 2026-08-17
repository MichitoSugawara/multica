"use client";

import { Plus } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { cn } from "@multica/ui/lib/utils";
import type { MockAgentSession } from "@multica/core/agent-workspace";
import { mockMachineById } from "@multica/core/agent-workspace";
import { useT } from "../../i18n";

export function SessionSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNewChat,
}: {
  sessions: MockAgentSession[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNewChat: () => void;
}) {
  const { t } = useT("agent-workspace");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <p className="text-body font-semibold">{t(($) => $.page.chats)}</p>
        <Button variant="ghost" size="icon-sm" onClick={onNewChat} aria-label={t(($) => $.page.new_chat)}>
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {sessions.length === 0 ? (
          <p className="px-2 py-4 text-caption text-muted-foreground">
            {t(($) => $.page.no_sessions)}
          </p>
        ) : (
          sessions.map((session) => {
            const machine = mockMachineById(session.machineId);
            const online = machine?.online ?? false;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(session.id)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left transition-colors",
                  activeSessionId === session.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                )}
              >
                <span className="truncate text-body font-medium">{session.title}</span>
                <span className="flex items-center gap-1.5 truncate text-micro text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      online ? "bg-emerald-500" : "bg-muted-foreground",
                    )}
                  />
                  {machine?.name ?? session.machineId}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
