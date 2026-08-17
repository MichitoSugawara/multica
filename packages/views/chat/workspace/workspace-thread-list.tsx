"use client";

import { Plus } from "lucide-react";
import type { WorkspaceSession } from "@multica/core/chat";
import { Button } from "@multica/ui/components/ui/button";
import { cn } from "@multica/ui/lib/utils";
import { PageHeader } from "../../layout/page-header";
import { useT } from "../../i18n";

export function WorkspaceThreadList({
  sessions,
  activeSessionId,
  composingNew,
  onSelect,
  onNewChat,
}: {
  sessions: WorkspaceSession[];
  activeSessionId: string | null;
  composingNew: boolean;
  onSelect: (sessionId: string) => void;
  onNewChat: () => void;
}) {
  const { t } = useT("chat");

  return (
    <div className="flex h-full flex-col border-r">
      <PageHeader className="justify-between">
        <h1 className="text-body font-semibold">{t(($) => $.page.title)}</h1>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t(($) => $.workspace.new_chat)}
          onClick={onNewChat}
        >
          <Plus className="size-4" />
        </Button>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <p className="px-2 py-6 text-center text-caption text-muted-foreground">
            {t(($) => $.workspace.empty_threads)}
          </p>
        ) : (
          sessions.map((session) => {
            const active = !composingNew && session.id === activeSessionId;
            const preview =
              [...session.messages].reverse().find((message) => !message.pending)?.content ??
              t(($) => $.workspace.replying);
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(session.id)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-muted",
                  active && "bg-muted font-medium hover:bg-muted",
                )}
              >
                <span className="truncate text-body">{session.title}</span>
                <span className="truncate text-caption text-muted-foreground">{preview}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
