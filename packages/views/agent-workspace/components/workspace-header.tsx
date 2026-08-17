"use client";

import { ChevronDown, Cpu, Server } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@multica/ui/components/ui/dropdown-menu";
import { Button } from "@multica/ui/components/ui/button";
import {
  MOCK_MACHINES,
  MOCK_MODELS,
  mockMachineById,
  mockModelById,
} from "@multica/core/agent-workspace";
import { useT } from "../../i18n";

export function WorkspaceHeader({
  machineId,
  modelId,
  onChangeMachineModel,
  onToggleBottom,
  bottomOpen,
}: {
  machineId: string;
  modelId: string;
  onChangeMachineModel: (machineId: string, modelId: string) => void;
  onToggleBottom: () => void;
  bottomOpen: boolean;
}) {
  const { t } = useT("agent-workspace");
  const machine = mockMachineById(machineId);
  const model = mockModelById(modelId);

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" className="gap-2 font-normal">
              <Server className="size-3.5 text-muted-foreground" />
              <span className="max-w-[140px] truncate">{machine?.name ?? machineId}</span>
              <span className="text-muted-foreground">·</span>
              <Cpu className="size-3.5 text-muted-foreground" />
              <span className="max-w-[120px] truncate">{model?.name ?? modelId}</span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>{t(($) => $.header.machine)}</DropdownMenuLabel>
          {MOCK_MACHINES.filter((m) => m.online).map((m) => (
            <DropdownMenuItem
              key={m.id}
              onClick={() => onChangeMachineModel(m.id, modelId)}
            >
              {m.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t(($) => $.header.model)}</DropdownMenuLabel>
          {MOCK_MODELS.map((m) => (
            <DropdownMenuItem
              key={m.id}
              onClick={() => onChangeMachineModel(machineId, m.id)}
            >
              {m.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" onClick={onToggleBottom}>
        {bottomOpen ? t(($) => $.page.hide_bottom_pane) : t(($) => $.page.show_bottom_pane)}
      </Button>
    </div>
  );
}
