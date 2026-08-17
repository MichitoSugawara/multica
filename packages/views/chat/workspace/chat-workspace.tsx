"use client";

import { useEffect } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { ArrowLeft } from "lucide-react";
import { useChatWorkspaceStore } from "@multica/core/chat";
import { useWorkspacePaths } from "@multica/core/paths";
import { Button } from "@multica/ui/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@multica/ui/components/ui/resizable";
import { Sheet, SheetContent } from "@multica/ui/components/ui/sheet";
import { useIsCompact } from "@multica/ui/hooks/use-mobile";
import { useNavigation } from "../../navigation";
import { useT } from "../../i18n";
import { NewSessionComposer } from "./new-session-composer";
import { SessionHeader } from "./session-header";
import { ToolBottomDock } from "./tool-bottom-dock";
import { ToolRightDock } from "./tool-right-dock";
import { WorkspaceComposer } from "./workspace-composer";
import { WorkspaceMessageList } from "./workspace-message-list";
import { WorkspaceThreadList } from "./workspace-thread-list";

export function ChatWorkspace() {
  const { t } = useT("chat");
  const { searchParams, replace } = useNavigation();
  const chatPath = useWorkspacePaths().chat();
  const isCompact = useIsCompact();

  const sessions = useChatWorkspaceStore((s) => s.sessions);
  const activeSessionId = useChatWorkspaceStore((s) => s.activeSessionId);
  const composingNew = useChatWorkspaceStore((s) => s.composingNew);
  const connectorMenuOpen = useChatWorkspaceStore((s) => s.connectorMenuOpen);
  const startNewChat = useChatWorkspaceStore((s) => s.startNewChat);
  const clearSelection = useChatWorkspaceStore((s) => s.clearSelection);
  const selectSession = useChatWorkspaceStore((s) => s.selectSession);
  const sendMessage = useChatWorkspaceStore((s) => s.sendMessage);
  const applySlash = useChatWorkspaceStore((s) => s.applySlash);
  const setRightPane = useChatWorkspaceStore((s) => s.setRightPane);
  const setRightOpen = useChatWorkspaceStore((s) => s.setRightOpen);
  const setBottomOpen = useChatWorkspaceStore((s) => s.setBottomOpen);
  const setBrowserUrl = useChatWorkspaceStore((s) => s.setBrowserUrl);
  const setSelectedFile = useChatWorkspaceStore((s) => s.setSelectedFile);
  const setActiveBottomTerminal = useChatWorkspaceStore((s) => s.setActiveBottomTerminal);
  const addBottomTerminal = useChatWorkspaceStore((s) => s.addBottomTerminal);
  const runTerminalCommand = useChatWorkspaceStore((s) => s.runTerminalCommand);
  const toggleSessionConnector = useChatWorkspaceStore((s) => s.toggleSessionConnector);
  const setConnectorMenuOpen = useChatWorkspaceStore((s) => s.setConnectorMenuOpen);

  const urlSession = searchParams?.get("session") || null;
  const session = sessions.find((item) => item.id === activeSessionId) ?? null;

  useEffect(() => {
    if (searchParams?.get("agent")) {
      replace(chatPath);
    }
  }, [chatPath, replace, searchParams]);

  useEffect(() => {
    if (urlSession && urlSession !== useChatWorkspaceStore.getState().activeSessionId) {
      const exists = useChatWorkspaceStore.getState().sessions.some((item) => item.id === urlSession);
      if (exists) selectSession(urlSession);
    }
  }, [selectSession, urlSession]);

  useEffect(() => {
    const live = useChatWorkspaceStore.getState().activeSessionId;
    const current = searchParams?.get("session") || null;
    if (live !== current) {
      replace(live ? `${chatPath}?session=${live}` : chatPath);
    }
  }, [activeSessionId, chatPath, replace, searchParams]);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "multica_chat_workspace_layout",
  });
  const { defaultLayout: columnLayout, onLayoutChanged: onColumnLayoutChanged } = useDefaultLayout({
    id: "multica_chat_workspace_column",
  });

  const threadList = (
    <WorkspaceThreadList
      sessions={sessions}
      activeSessionId={activeSessionId}
      composingNew={composingNew}
      onSelect={selectSession}
      onNewChat={startNewChat}
    />
  );

  const conversation = session && !composingNew ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <SessionHeader
        session={session}
        onToggleRight={() => setRightOpen(session.id, !session.rightOpen)}
        onToggleBottom={() => setBottomOpen(session.id, !session.bottomOpen)}
      />
      <WorkspaceMessageList messages={session.messages} />
      <WorkspaceComposer
        canSend
        connectors={session.connectors}
        onToggleConnector={(id) => toggleSessionConnector(session.id, id)}
        connectorMenuOpen={connectorMenuOpen}
        onConnectorMenuOpenChange={setConnectorMenuOpen}
        onSlash={(id) => applySlash(id, session.id)}
        onSend={sendMessage}
      />
    </div>
  ) : (
    <NewSessionComposer />
  );

  const rightDock = session && !composingNew ? (
    <ToolRightDock
      session={session}
      onPaneChange={(pane) => setRightPane(session.id, pane)}
      onBrowserUrl={(url) => setBrowserUrl(session.id, url)}
      onSelectFile={(path) => setSelectedFile(session.id, path)}
      onTerminalCommand={(terminalId, command) =>
        runTerminalCommand(session.id, terminalId, command)
      }
    />
  ) : null;

  const bottomDock = session && !composingNew ? (
    <ToolBottomDock
      session={session}
      onSelectTerminal={(terminalId) => setActiveBottomTerminal(session.id, terminalId)}
      onAddTerminal={() => addBottomTerminal(session.id)}
      onCommand={(terminalId, command) => runTerminalCommand(session.id, terminalId, command)}
    />
  ) : null;

  if (isCompact) {
    const showConversation = composingNew || !!activeSessionId;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {showConversation ? (
          <>
            <div className="flex h-12 shrink-0 items-center border-b px-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={clearSelection}
              >
                <ArrowLeft className="size-4" />
                {t(($) => $.page.title)}
              </Button>
            </div>
            {conversation}
            <Sheet
              open={!!session && session.rightOpen && !composingNew}
              onOpenChange={(open) => session && setRightOpen(session.id, open)}
            >
              <SheetContent side="right" className="w-[min(100%,28rem)] p-0">
                {rightDock}
              </SheetContent>
            </Sheet>
            <Sheet
              open={!!session && session.bottomOpen && !composingNew}
              onOpenChange={(open) => session && setBottomOpen(session.id, open)}
            >
              <SheetContent side="bottom" className="h-[50vh] p-0">
                {bottomDock}
              </SheetContent>
            </Sheet>
          </>
        ) : (
          threadList
        )}
      </div>
    );
  }

  const showRight = !!session && !composingNew && session.rightOpen;
  const showBottom = !!session && !composingNew && session.bottomOpen;

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="min-h-0 flex-1"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel
        id="threads"
        defaultSize={280}
        minSize={220}
        maxSize={400}
        groupResizeBehavior="preserve-pixel-size"
      >
        {threadList}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="main" minSize="40%">
        <ResizablePanelGroup
          orientation="vertical"
          className="h-full min-h-0"
          defaultLayout={columnLayout}
          onLayoutChanged={onColumnLayoutChanged}
        >
          <ResizablePanel id="conversation" minSize="30%">
            {conversation}
          </ResizablePanel>
          {showBottom && (
            <>
              <ResizableHandle />
              <ResizablePanel id="bottom" defaultSize={180} minSize={120} maxSize={360}>
                {bottomDock}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </ResizablePanel>
      {showRight && (
        <>
          <ResizableHandle />
          <ResizablePanel id="right" defaultSize={360} minSize={280} maxSize={560}>
            {rightDock}
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
