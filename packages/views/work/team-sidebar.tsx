"use client";

import { useQuery } from "@tanstack/react-query";
import { Hash, Monitor, Plus, Settings, Users } from "lucide-react";
import { channelListOptions } from "@multica/core/channels";
import { chatSessionsOptions } from "@multica/core/chat/queries";
import { useCurrentWorkspace, useWorkspacePaths } from "@multica/core/paths";
import { cn } from "@multica/ui/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@multica/ui/components/ui/sidebar";
import { AppLink, useNavigation } from "../navigation";
import { useT } from "../i18n";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TeamSidebar({
  topSlot,
  headerClassName,
  headerStyle,
}: {
  topSlot?: React.ReactNode;
  headerClassName?: string;
  headerStyle?: React.CSSProperties;
}) {
  const { t } = useT("work");
  const { pathname, searchParams } = useNavigation();
  const activeSessionId = searchParams.get("session");
  const workspace = useCurrentWorkspace();
  const p = useWorkspacePaths();
  const wsId = workspace?.id ?? "";
  const { data: channels = [] } = useQuery(channelListOptions(wsId));
  const { data: sessions = [] } = useQuery({
    ...chatSessionsOptions(wsId),
    enabled: Boolean(wsId),
  });

  return (
    <Sidebar variant="inset" className="text-body">
      {topSlot}
      <SidebarHeader className={cn("gap-2 py-2", headerClassName)} style={headerStyle}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isActive(pathname, p.work())}
              render={<AppLink href={p.work()} />}
              className="bg-foreground text-background hover:bg-foreground/90 hover:text-background data-active:bg-foreground data-active:text-background"
            >
              <Plus className="size-3.5" />
              <span>{t(($) => $.new_work)}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t(($) => $.channels)}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {channels.map((channel) => {
                const href = p.channelDetail(channel.slug || channel.id);
                return (
                  <SidebarMenuItem key={channel.id}>
                    <SidebarMenuButton
                      isActive={isActive(pathname, href)}
                      render={<AppLink href={href} />}
                      className="data-active:font-medium"
                    >
                      <Hash className="size-3.5" />
                      <span className="truncate">{channel.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t(($) => $.sessions)}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sessions.map((session) => {
                const href = p.chatSession(session.id);
                return (
                  <SidebarMenuItem key={session.id}>
                    <SidebarMenuButton
                      isActive={activeSessionId === session.id}
                      render={<AppLink href={href} />}
                      className="data-active:font-medium"
                    >
                      <span className="truncate">{session.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isActive(pathname, p.issues())}
              render={<AppLink href={p.issues()} />}
              className="data-active:font-medium"
            >
              <span>{t(($) => $.board)}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isActive(pathname, p.runtimes())}
              render={<AppLink href={p.runtimes()} />}
              className="data-active:font-medium"
            >
              <Monitor className="size-3.5" />
              <span>{t(($) => $.machines)}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isActive(pathname, p.members())}
              render={<AppLink href={p.members()} />}
              className="data-active:font-medium"
            >
              <Users className="size-3.5" />
              <span>{t(($) => $.members)}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isActive(pathname, p.settings())}
              render={<AppLink href={p.settings()} />}
              className="data-active:font-medium"
            >
              <Settings className="size-3.5" />
              <span>{t(($) => $.workspace)}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
