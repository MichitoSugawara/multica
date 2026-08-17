"use client";

import { cn } from "@multica/ui/lib/utils";
import {
  MOCK_CONNECTORS,
  type MockConnector,
} from "@multica/core/agent-workspace";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@multica/ui/components/ui/popover";
import { useT } from "../../i18n";

export function ConnectorChips({
  selection,
  onToggle,
}: {
  selection: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const { t } = useT("agent-workspace");

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
      <span className="text-micro text-muted-foreground">{t(($) => $.connectors.label)}</span>
      {MOCK_CONNECTORS.map((connector) => (
        <ConnectorChip
          key={connector.id}
          connector={connector}
          highlighted={selection[connector.id] === true}
          connectedHint={t(($) => $.connectors.connected_hint, { name: connector.name })}
          disconnectedHint={t(($) => $.connectors.disconnected_hint, { name: connector.name })}
          onClick={() => onToggle(connector.id)}
        />
      ))}
    </div>
  );
}

function ConnectorChip({
  connector,
  highlighted,
  connectedHint,
  disconnectedHint,
  onClick,
}: {
  connector: MockConnector;
  highlighted: boolean;
  connectedHint: string;
  disconnectedHint: string;
  onClick: () => void;
}) {
  const connected = connector.connected;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-micro transition-colors",
              connected
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-dashed border-muted-foreground/40 text-muted-foreground",
              highlighted && "ring-2 ring-primary ring-offset-1 ring-offset-background",
            )}
          >
            {connector.name}
            {!connected && " +"}
          </button>
        }
      />
      <PopoverContent className="w-52 text-caption" side="top">
        <p>{connected ? connectedHint : disconnectedHint}</p>
      </PopoverContent>
    </Popover>
  );
}
