"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUp, Slash } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { Textarea } from "@multica/ui/components/ui/textarea";
import { cn } from "@multica/ui/lib/utils";
import {
  SLASH_COMMANDS,
  type MockSlashCommand,
  type MockToolTab,
} from "@multica/core/agent-workspace";
import { useT } from "../../i18n";

export function WorkspaceComposer({
  onSend,
  disabled,
}: {
  onSend: (text: string, openTab?: MockToolTab) => void;
  disabled?: boolean;
}) {
  const { t } = useT("agent-workspace");
  const [value, setValue] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const slashQuery = useMemo(() => {
    const match = value.match(/(?:^|\s)\/(\w*)$/);
    return match ? match[1] ?? "" : null;
  }, [value]);

  const filteredCommands = useMemo(() => {
    if (slashQuery === null) return [];
    const q = slashQuery.toLowerCase();
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.id.startsWith(q) || cmd.label.toLowerCase().includes(`/${q}`),
    );
  }, [slashQuery]);

  const showPalette = paletteOpen || (slashQuery !== null && filteredCommands.length > 0);

  const applySlashCommand = (cmd: (typeof SLASH_COMMANDS)[number]) => {
    const replaced = value.replace(/(?:^|\s)\/\w*$/, "").trimEnd();
    setValue(replaced ? `${replaced} ${cmd.label}` : cmd.label);
    setPaletteOpen(false);
    textareaRef.current?.focus();
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    let openTab: MockToolTab | undefined;
    for (const cmd of SLASH_COMMANDS) {
      if (trimmed.toLowerCase().startsWith(cmd.label)) {
        openTab = cmd.tab;
        break;
      }
    }

    onSend(trimmed, openTab);
    setValue("");
    setPaletteOpen(false);
  };

  return (
    <div className="relative shrink-0 border-t bg-background px-3 py-2">
      {showPalette && (
        <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-lg border bg-popover shadow-md">
          {filteredCommands.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted/60"
              onMouseDown={(e) => {
                e.preventDefault();
                applySlashCommand(cmd);
              }}
            >
              <span className="text-body font-medium">{cmd.label}</span>
              <span className="text-caption text-muted-foreground">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          onClick={() => {
            setPaletteOpen((o) => !o);
            setValue((v) => (v.endsWith("/") ? v : `${v}${v ? " " : ""}/`));
            textareaRef.current?.focus();
          }}
          aria-label={t(($) => $.composer.slash_aria)}
        >
          <Slash className="size-4" />
        </Button>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") setPaletteOpen(false);
          }}
          placeholder={t(($) => $.composer.placeholder)}
          disabled={disabled}
          rows={2}
          className={cn("min-h-[52px] resize-none text-body")}
        />
        <Button
          type="button"
          size="icon-sm"
          disabled={disabled || !value.trim()}
          onClick={submit}
          aria-label={t(($) => $.composer.send_aria)}
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function parseSlashCommand(text: string): MockSlashCommand | null {
  const lower = text.trim().toLowerCase();
  for (const cmd of SLASH_COMMANDS) {
    if (lower.startsWith(cmd.label)) return cmd.id;
  }
  return null;
}
