"use client";

import { useState } from "react";
import { Cloud, Monitor, Server } from "lucide-react";
import {
  MOCK_MACHINES,
  type WorkspaceMachine,
} from "@multica/core/chat";
import { Button } from "@multica/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@multica/ui/components/ui/popover";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../../i18n";

function MachineIcon({ kind }: { kind: WorkspaceMachine["kind"] }) {
  if (kind === "cloud") return <Cloud className="size-3.5" />;
  if (kind === "remote") return <Server className="size-3.5" />;
  return <Monitor className="size-3.5" />;
}

export function MachinePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { t } = useT("chat");
  const [open, setOpen] = useState(false);
  const selected = MOCK_MACHINES.find((machine) => machine.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            {selected ? <MachineIcon kind={selected.kind} /> : <Monitor className="size-3.5" />}
            {selected ? selected.title : t(($) => $.workspace.select_machine)}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 p-1">
        {MOCK_MACHINES.map((machine) => (
          <button
            key={machine.id}
            type="button"
            onClick={() => {
              onChange(machine.id);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-body hover:bg-muted",
              machine.id === value && "bg-muted font-medium",
            )}
          >
            <MachineIcon kind={machine.kind} />
            <span className="min-w-0 flex-1 truncate">{machine.title}</span>
            <span
              className={cn(
                "size-1.5 rounded-full",
                machine.online ? "bg-success" : "bg-muted-foreground/40",
              )}
            />
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
