"use client";

import { useCallback, useEffect, useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { ArrowLeft } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@multica/ui/components/ui/resizable";
import { useIsCompact } from "@multica/ui/hooks/use-mobile";
import { useAgentWorkspaceStore } from "@multica/core/agent-workspace";
import { useWorkspacePaths } from "@multica/core/paths";
import { useNavigation } from "../navigation";
import { AgentToolDock } from "./components/agent-tool-dock";
import { ConnectorChips } from "./components/connector-chips";
import { MessageTranscript } from "./components/message-transcript";
import { NewChatEmptyState, NewChatWizard } from "./components/new-chat-wizard";
import { SessionSidebar } from "./components/session-sidebar";
import { WorkspaceComposer } from "./components/workspace-composer";
import { WorkspaceHeader } from "./components/workspace-header";
import { useT } from "../i18n";

/**
 * Codex / Cursor-style agent window mock — local state only, no daemon wiring.
 * Replaces the legacy ChatPage at /{slug}/chat for this product fork.
 */
export function AgentWorkspacePage() {
  const { t } = useT("agent-workspace");
  const isCompact = useIsCompact();
  const { searchParams, replace } = useNavigation();
  const wsPaths = useWorkspacePaths();
  const urlSession = searchParams.get("session");
  const urlNew = searchParams.get("new") === "1";

  const sessions = useAgentWorkspaceStore((s) => s.sessions);
  const activeSessionId = useAgentWorkspaceStore((s) => s.activeSessionId);
  const rightTab = useAgentWorkspaceStore((s) => s.rightTab);
  const bottomTab = useAgentWorkspaceStore((s) => s.bottomTab);
  const bottomOpen = useAgentWorkspaceStore((s) => s.bottomOpen);
  const connectorSelection = useAgentWorkspaceStore((s) => s.connectorSelection);
  const setActiveSession = useAgentWorkspaceStore((s) => s.setActiveSession);
  const createSession = useAgentWorkspaceStore((s) => s.createSession);
  const sendMessage = useAgentWorkspaceStore((s) => s.sendMessage);
  const setRightTab = useAgentWorkspaceStore((s) => s.setRightTab);
  const setBottomTab = useAgentWorkspaceStore((s) => s.setBottomTab);
  const setBottomOpen = useAgentWorkspaceStore((s) => s.setBottomOpen);
  const toggleConnector = useAgentWorkspaceStore((s) => s.toggleConnector);
  const updateSessionMachineModel = useAgentWorkspaceStore((s) => s.updateSessionMachineModel);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<"machine" | "model">("machine");
  const [pendingMachineId, setPendingMachineId] = useState<string | null>(null);
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  const syncUrl = useCallback(
    (sessionId: string | null) => {
      const base = wsPaths.chat();
      replace(sessionId ? `${base}?session=${encodeURIComponent(sessionId)}` : base);
    },
    [replace, wsPaths],
  );

  useEffect(() => {
    if (urlSession && urlSession !== activeSessionId) {
      const exists = sessions.some((s) => s.id === urlSession);
      if (exists) setActiveSession(urlSession);
    }
  }, [urlSession, activeSessionId, sessions, setActiveSession]);

  useEffect(() => {
    const live = useAgentWorkspaceStore.getState().activeSessionId;
    const current = searchParams.get("session");
    if (live !== current) syncUrl(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store-driven URL sync
  }, [activeSessionId]);

  useEffect(() => {
    if (urlNew) {
      openWizard();
      replace(wsPaths.chat());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot ?new= intent
  }, [urlNew]);

  useEffect(() => {
    if (activeSessionId) setMobileShowChat(true);
  }, [activeSessionId]);

  const openWizard = () => {
    setWizardStep("machine");
    setPendingMachineId(null);
    setPendingModelId(null);
    setWizardOpen(true);
  };

  const completeWizard = () => {
    if (!pendingMachineId || !pendingModelId) return;
    const session = createSession(pendingMachineId, pendingModelId);
    setWizardOpen(false);
    syncUrl(session.id);
    setMobileShowChat(true);
  };

  const handleSelectSession = (sessionId: string) => {
    setActiveSession(sessionId);
    syncUrl(sessionId);
    setMobileShowChat(true);
  };

  const chatCenter = activeSession ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceHeader
        machineId={activeSession.machineId}
        modelId={activeSession.modelId}
        onChangeMachineModel={(machineId, modelId) =>
          updateSessionMachineModel(activeSession.id, machineId, modelId)
        }
        onToggleBottom={() => setBottomOpen(!bottomOpen)}
        bottomOpen={bottomOpen}
      />
      <MessageTranscript messages={activeSession.messages} />
      <ConnectorChips selection={connectorSelection} onToggle={toggleConnector} />
      <WorkspaceComposer
        onSend={(text, tab) => sendMessage(activeSession.id, text, tab)}
      />
    </div>
  ) : (
    <NewChatEmptyState onStart={openWizard} />
  );

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "multica_agent_workspace_layout",
  });

  const wizard = (
    <NewChatWizard
      open={wizardOpen}
      onOpenChange={setWizardOpen}
      step={wizardStep}
      onStepChange={setWizardStep}
      selectedMachineId={pendingMachineId}
      selectedModelId={pendingModelId}
      onSelectMachine={setPendingMachineId}
      onSelectModel={setPendingModelId}
      onComplete={completeWizard}
    />
  );

  if (isCompact) {
    if (mobileShowChat && activeSession) {
      return (
        <>
          {wizard}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-12 shrink-0 items-center border-b px-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileShowChat(false)}
                className="gap-1.5 text-muted-foreground"
              >
                <ArrowLeft className="size-4" />
                {t(($) => $.page.chats)}
              </Button>
            </div>
            {chatCenter}
            <div className="shrink-0 border-t" style={{ height: "45vh", minHeight: "320px" }}>
              <AgentToolDock
                activeTab={bottomTab}
                onTabChange={setBottomTab}
                compactHeader
              />
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        {wizard}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
            <h1 className="text-body font-semibold">{t(($) => $.page.title)}</h1>
            <Button size="sm" onClick={openWizard}>
              {t(($) => $.page.new_chat)}
            </Button>
          </div>
          <SessionSidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={handleSelectSession}
            onNewChat={openWizard}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {wizard}
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        <ResizablePanel
          id="sessions"
          defaultSize={240}
          minSize={200}
          maxSize={320}
          groupResizeBehavior="preserve-pixel-size"
        >
          <div className="flex h-full flex-col border-r">
            <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
              <h1 className="text-body font-semibold">{t(($) => $.page.title)}</h1>
              <Button size="sm" onClick={openWizard}>
                {t(($) => $.page.new_chat)}
              </Button>
            </div>
            <SessionSidebar
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelect={handleSelectSession}
              onNewChat={openWizard}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="workspace" minSize="35%">
          {bottomOpen ? (
            <ResizablePanelGroup orientation="vertical" className="h-full min-h-0">
              <ResizablePanel id="chat" minSize="30%">
                {chatCenter}
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="bottom-dock" defaultSize="32%" minSize={160}>
                <div className="h-full min-h-0 border-t">
                  <AgentToolDock activeTab={bottomTab} onTabChange={setBottomTab} />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            chatCenter
          )}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel
          id="right-dock"
          defaultSize={360}
          minSize={280}
          maxSize={560}
          groupResizeBehavior="preserve-pixel-size"
        >
          <div className="h-full min-h-0 border-l">
            <AgentToolDock activeTab={rightTab} onTabChange={setRightTab} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}
