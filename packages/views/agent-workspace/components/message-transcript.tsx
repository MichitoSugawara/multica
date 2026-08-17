"use client";

import type { MockMessage } from "@multica/core/agent-workspace";
import { cn } from "@multica/ui/lib/utils";

export function MessageTranscript({ messages }: { messages: MockMessage[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-body whitespace-pre-wrap",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
