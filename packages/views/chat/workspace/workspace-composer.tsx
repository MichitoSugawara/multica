"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import {
  WORKSPACE_SLASH_COMMANDS,
  type WorkspaceConnectorId,
  type WorkspaceSlashId,
} from "@multica/core/chat";
import { Button } from "@multica/ui/components/ui/button";
import { SubmitButton } from "@multica/ui/components/common/submit-button";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../../i18n";
import { ConnectorBar } from "./connector-bar";

const SLASH_LABEL = {
  browse: "browse",
  term: "term",
  edit: "edit",
  git: "git",
  rdp: "rdp",
  connect: "connect",
} as const;

export function WorkspaceComposer({
  disabledReason,
  canSend,
  connectors,
  onToggleConnector,
  connectorMenuOpen,
  onConnectorMenuOpenChange,
  onSlash,
  onSend,
  compact,
}: {
  disabledReason?: string;
  canSend: boolean;
  connectors: WorkspaceConnectorId[];
  onToggleConnector: (id: WorkspaceConnectorId) => void;
  connectorMenuOpen: boolean;
  onConnectorMenuOpenChange: (open: boolean) => void;
  onSlash: (id: WorkspaceSlashId) => void;
  onSend: (content: string) => boolean;
  compact?: boolean;
}) {
  const { t } = useT("chat");
  const [value, setValue] = useState("");
  const [highlight, setHighlight] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const slashQuery = useMemo(() => {
    if (!value.startsWith("/")) return null;
    const token = value.slice(1).split(/\s/, 1)[0] ?? "";
    if (value.includes(" ") && token.length > 0) return null;
    return token.toLowerCase();
  }, [value]);

  const slashMatches = useMemo(() => {
    if (slashQuery === null) return [];
    return WORKSPACE_SLASH_COMMANDS.filter((command) =>
      command.label.startsWith(slashQuery),
    );
  }, [slashQuery]);

  const applySlash = (id: WorkspaceSlashId) => {
    onSlash(id);
    setValue("");
    setHighlight(0);
    areaRef.current?.focus();
  };

  const submit = () => {
    if (!canSend) return;
    const accepted = onSend(value);
    if (accepted) {
      setValue("");
      setHighlight(0);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMatches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((index) => (index + 1) % slashMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((index) => (index - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const command = slashMatches[highlight] ?? slashMatches[0];
        if (command) applySlash(command.id);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setValue("");
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className={cn("shrink-0 border-t bg-background px-4 py-3", compact && "border-t-0")}>
      <div className="relative rounded-xl border bg-card p-2 shadow-xs">
        {slashMatches.length > 0 && (
          <div
            className="absolute inset-x-2 bottom-full mb-1 overflow-hidden rounded-lg border bg-popover shadow-md"
            role="listbox"
          >
            {slashMatches.map((command, index) => (
              <button
                key={command.id}
                type="button"
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(event) => {
                  event.preventDefault();
                  applySlash(command.id);
                }}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-body",
                  index === highlight ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <span className="font-medium">/{command.label}</span>
                <span className="text-caption text-muted-foreground">
                  {t(($) => $.workspace.slash[SLASH_LABEL[command.id]])}
                </span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={areaRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          rows={compact ? 4 : 2}
          placeholder={t(($) => $.workspace.placeholder)}
          className="max-h-40 min-h-16 w-full resize-none bg-transparent px-2 py-1.5 text-body outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <div className="flex min-w-0 items-center gap-1">
            <ConnectorBar
              selected={connectors}
              onToggle={onToggleConnector}
              open={connectorMenuOpen}
              onOpenChange={onConnectorMenuOpenChange}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={t(($) => $.workspace.attach_mock)}
              onClick={() => toast.message(t(($) => $.workspace.attach_mock))}
            >
              <Paperclip className="size-3.5" />
            </Button>
          </div>
          <SubmitButton
            onClick={submit}
            disabled={!canSend || value.trim().length === 0}
            tooltip={disabledReason ?? t(($) => $.workspace.send)}
            ariaLabel={t(($) => $.workspace.send)}
          />
        </div>
      </div>
    </div>
  );
}
