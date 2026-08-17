"use client";

import { Plug } from "lucide-react";
import {
  MOCK_CONNECTORS,
  type WorkspaceConnectorId,
} from "@multica/core/chat";
import { Button } from "@multica/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@multica/ui/components/ui/popover";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../../i18n";

const CONNECTOR_LABEL = {
  github: "github",
  slack: "slack",
  browser: "browser",
  filesystem: "filesystem",
} as const;

export function ConnectorBar({
  selected,
  onToggle,
  open,
  onOpenChange,
}: {
  selected: WorkspaceConnectorId[];
  onToggle: (id: WorkspaceConnectorId) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT("chat");

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <Plug className="size-3.5" />
              {t(($) => $.workspace.connectors)}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-56 p-1">
          {MOCK_CONNECTORS.map((connector) => {
            const active = selected.includes(connector.id);
            return (
              <button
                key={connector.id}
                type="button"
                onClick={() => onToggle(connector.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-body hover:bg-muted",
                  active && "font-medium",
                )}
              >
                <span>{t(($) => $.workspace.connector[CONNECTOR_LABEL[connector.id]])}</span>
                <span className="text-caption text-muted-foreground">
                  {active ? "on" : "off"}
                </span>
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
      {selected.map((id) => (
        <span
          key={id}
          className="rounded-full border px-2 py-0.5 text-caption text-muted-foreground"
        >
          {t(($) => $.workspace.connector[CONNECTOR_LABEL[id]])}
        </span>
      ))}
    </div>
  );
}
