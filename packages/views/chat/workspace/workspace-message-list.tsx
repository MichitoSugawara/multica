"use client";

import type { WorkspaceMessage } from "@multica/core/chat";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../../i18n";

export function WorkspaceMessageList({ messages }: { messages: WorkspaceMessage[] }) {
  const { t } = useT("chat");

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {messages.map((message) => (
          <article key={message.id} className="space-y-1">
            <p className="text-caption font-medium text-muted-foreground">
              {message.role === "user"
                ? t(($) => $.workspace.you)
                : t(($) => $.workspace.assistant)}
            </p>
            <p
              className={cn(
                "whitespace-pre-wrap text-body",
                message.pending && "text-muted-foreground",
              )}
            >
              {message.pending ? t(($) => $.workspace.replying) : message.content}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
