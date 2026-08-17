"use client";

import { Check, Circle, MessageSquarePlus } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@multica/ui/components/ui/dialog";
import { cn } from "@multica/ui/lib/utils";
import {
  MOCK_MACHINES,
  MOCK_MODELS,
  type MockMachine,
  type MockModel,
} from "@multica/core/agent-workspace";
import { useT } from "../../i18n";

export function NewChatWizard({
  open,
  onOpenChange,
  step,
  onStepChange,
  selectedMachineId,
  selectedModelId,
  onSelectMachine,
  onSelectModel,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: "machine" | "model";
  onStepChange: (step: "machine" | "model") => void;
  selectedMachineId: string | null;
  selectedModelId: string | null;
  onSelectMachine: (id: string) => void;
  onSelectModel: (id: string) => void;
  onComplete: () => void;
}) {
  const { t } = useT("agent-workspace");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="size-5" />
            {t(($) => $.wizard.title)}
          </DialogTitle>
          <DialogDescription>
            {step === "machine"
              ? t(($) => $.wizard.step_machine)
              : t(($) => $.wizard.step_model)}
          </DialogDescription>
        </DialogHeader>

        {step === "machine" ? (
          <div className="space-y-2">
            {MOCK_MACHINES.map((machine) => (
              <MachineRow
                key={machine.id}
                machine={machine}
                selected={selectedMachineId === machine.id}
                offlineLabel={t(($) => $.wizard.offline)}
                onSelect={() => {
                  if (!machine.online) return;
                  onSelectMachine(machine.id);
                  onStepChange("model");
                }}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => onStepChange("machine")}
            >
              {t(($) => $.wizard.change_machine)}
            </Button>
            <div className="space-y-2">
              {MOCK_MODELS.map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  selected={selectedModelId === model.id}
                  onSelect={() => onSelectModel(model.id)}
                />
              ))}
            </div>
            <Button
              className="w-full"
              disabled={!selectedMachineId || !selectedModelId}
              onClick={onComplete}
            >
              {t(($) => $.wizard.start_session)}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MachineRow({
  machine,
  selected,
  offlineLabel,
  onSelect,
}: {
  machine: MockMachine;
  selected: boolean;
  offlineLabel: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!machine.online}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
        machine.online ? "hover:bg-muted/60" : "cursor-not-allowed opacity-50",
        selected && "border-primary bg-primary/5",
      )}
    >
      <Circle
        className={cn(
          "size-2.5 shrink-0 fill-current",
          machine.online ? "text-emerald-500" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium">{machine.name}</p>
        <p className="truncate text-caption text-muted-foreground">{machine.subtitle}</p>
      </div>
      {selected && <Check className="size-4 shrink-0 text-primary" />}
      {!machine.online && (
        <span className="shrink-0 text-caption text-muted-foreground">{offlineLabel}</span>
      )}
    </button>
  );
}

function ModelRow({
  model,
  selected,
  onSelect,
}: {
  model: MockModel;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left hover:bg-muted/60",
        selected && "border-primary bg-primary/5",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium">{model.name}</p>
        <p className="truncate text-caption text-muted-foreground">{model.provider}</p>
      </div>
      {selected && <Check className="size-4 shrink-0 text-primary" />}
    </button>
  );
}

export function NewChatEmptyState({ onStart }: { onStart: () => void }) {
  const { t } = useT("agent-workspace");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <MessageSquarePlus className="size-12 text-faint-foreground" />
      <div>
        <p className="text-body font-medium">{t(($) => $.page.empty_title)}</p>
        <p className="mt-1 max-w-sm text-caption text-muted-foreground">
          {t(($) => $.page.empty_description)}
        </p>
      </div>
      <Button onClick={onStart}>{t(($) => $.page.new_chat)}</Button>
    </div>
  );
}
