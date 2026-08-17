"use client";

import { PanelBottom, PanelRight } from "lucide-react";
import {
  machineLabel,
  modelLabel,
  type WorkspaceSession,
} from "@multica/core/chat";
import { Button } from "@multica/ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@multica/ui/components/ui/tooltip";
import { useT } from "../../i18n";

export function SessionHeader({
  session,
  onToggleRight,
  onToggleBottom,
}: {
  session: WorkspaceSession;
  onToggleRight: () => void;
  onToggleBottom: () => void;
}) {
  const { t } = useT("chat");

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4">
      <div className="min-w-0">
        <p className="truncate text-body font-medium">{session.title}</p>
        <p className="truncate text-caption text-muted-foreground">
          {machineLabel(session.machineId)} · {modelLabel(session.modelId)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={session.bottomOpen}
                aria-label={t(($) => $.workspace.toggle_bottom)}
                onClick={onToggleBottom}
              >
                <PanelBottom className="size-4" />
              </Button>
            }
          />
          <TooltipContent>{t(($) => $.workspace.toggle_bottom)}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={session.rightOpen}
                aria-label={t(($) => $.workspace.toggle_right)}
                onClick={onToggleRight}
              >
                <PanelRight className="size-4" />
              </Button>
            }
          />
          <TooltipContent>{t(($) => $.workspace.toggle_right)}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
