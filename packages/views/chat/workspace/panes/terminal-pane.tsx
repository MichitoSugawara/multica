"use client";

import { useState, type FormEvent } from "react";
import type { WorkspaceTerminal } from "@multica/core/chat";
import { useT } from "../../../i18n";

export function TerminalPane({
  terminal,
  onCommand,
}: {
  terminal: WorkspaceTerminal | undefined;
  onCommand: (command: string) => void;
}) {
  const { t } = useT("chat");
  const [draft, setDraft] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const command = draft.trim();
    if (!command || !terminal) return;
    onCommand(command);
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-caption">
        {(terminal?.lines ?? []).map((line, index) => (
          <div key={`${index}-${line}`}>{line}</div>
        ))}
      </div>
      <form onSubmit={submit} className="flex border-t border-zinc-800">
        <span className="px-3 py-2 font-mono text-caption text-zinc-500">$</span>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t(($) => $.workspace.terminal_placeholder)}
          className="min-w-0 flex-1 bg-transparent py-2 pr-3 font-mono text-caption outline-none placeholder:text-zinc-600"
        />
      </form>
    </div>
  );
}
