"use client";

import {
  useChatWorkspaceStore,
} from "@multica/core/chat";
import { useT } from "../../i18n";
import { MachinePicker } from "./machine-picker";
import { SessionModelPicker } from "./session-model-picker";
import { WorkspaceComposer } from "./workspace-composer";

export function NewSessionComposer() {
  const { t } = useT("chat");
  const draftMachineId = useChatWorkspaceStore((s) => s.draftMachineId);
  const draftModelId = useChatWorkspaceStore((s) => s.draftModelId);
  const draftConnectors = useChatWorkspaceStore((s) => s.draftConnectors);
  const connectorMenuOpen = useChatWorkspaceStore((s) => s.connectorMenuOpen);
  const setDraftMachine = useChatWorkspaceStore((s) => s.setDraftMachine);
  const setDraftModel = useChatWorkspaceStore((s) => s.setDraftModel);
  const toggleDraftConnector = useChatWorkspaceStore((s) => s.toggleDraftConnector);
  const setConnectorMenuOpen = useChatWorkspaceStore((s) => s.setConnectorMenuOpen);
  const applySlash = useChatWorkspaceStore((s) => s.applySlash);
  const sendMessage = useChatWorkspaceStore((s) => s.sendMessage);

  const canSend = !!draftMachineId && !!draftModelId;
  const disabledReason = !draftMachineId
    ? t(($) => $.workspace.machine_required)
    : !draftModelId
      ? t(($) => $.workspace.model_required)
      : undefined;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl space-y-5">
        <div className="space-y-1 text-center">
          <h2 className="text-title font-semibold">{t(($) => $.workspace.new_chat_title)}</h2>
          <p className="text-body text-muted-foreground">{t(($) => $.workspace.new_chat_hint)}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <MachinePicker value={draftMachineId} onChange={setDraftMachine} />
          <SessionModelPicker
            value={draftModelId}
            onChange={setDraftModel}
            disabled={!draftMachineId}
          />
        </div>
        <WorkspaceComposer
          compact
          canSend={canSend}
          disabledReason={disabledReason}
          connectors={draftConnectors}
          onToggleConnector={toggleDraftConnector}
          connectorMenuOpen={connectorMenuOpen}
          onConnectorMenuOpenChange={setConnectorMenuOpen}
          onSlash={(id) => applySlash(id)}
          onSend={sendMessage}
        />
      </div>
    </div>
  );
}
