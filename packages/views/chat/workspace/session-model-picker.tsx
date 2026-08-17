"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { MOCK_MODELS } from "@multica/core/chat";
import { Button } from "@multica/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@multica/ui/components/ui/popover";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../../i18n";

export function SessionModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const { t } = useT("chat");
  const [open, setOpen] = useState(false);
  const selected = MOCK_MODELS.find((model) => model.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5" disabled={disabled}>
            <Sparkles className="size-3.5" />
            {selected ? selected.label : t(($) => $.workspace.select_model)}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56 p-1">
        {MOCK_MODELS.map((model) => (
          <button
            key={model.id}
            type="button"
            onClick={() => {
              onChange(model.id);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center rounded-md px-2 py-1.5 text-left text-body hover:bg-muted",
              model.id === value && "bg-muted font-medium",
            )}
          >
            {model.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
