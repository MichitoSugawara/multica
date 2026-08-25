// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@multica/core/i18n/react";
import enCommon from "../locales/en/common.json";
import enWork from "../locales/en/work.json";
import { TeamSidebar } from "./team-sidebar";

vi.mock("@multica/core/paths", () => ({
  useCurrentWorkspace: () => ({ id: "ws-1", slug: "dale", name: "Dale" }),
  useWorkspacePaths: () => ({
    work: () => "/dale/work",
    channels: () => "/dale/channels",
    channelDetail: (id: string) => `/dale/channels/${id}`,
    chatSession: (id: string) => `/dale/chat?session=${id}`,
    chat: () => "/dale/chat",
    issues: () => "/dale/issues",
    runtimes: () => "/dale/runtimes",
    members: () => "/dale/members",
    settings: () => "/dale/settings",
  }),
}));

vi.mock("../navigation", () => ({
  AppLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useNavigation: () => ({ pathname: "/dale/work", searchParams: new URLSearchParams() }),
}));

vi.mock("@multica/ui/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuButton: ({
    children,
    render,
  }: {
    children: React.ReactNode;
    render?: React.ReactElement<{ href?: string }>;
  }) => <div data-href={render?.props.href}>{children}</div>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarRail: () => null,
}));

vi.mock("@multica/core/channels", () => ({
  channelListOptions: () => ({ queryKey: ["channels"] }),
}));

vi.mock("@multica/core/chat/queries", () => ({
  chatSessionsOptions: () => ({ queryKey: ["chat", "ws-1", "sessions"] }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === "channels") {
      return { data: [{ id: "ch-dev", slug: "dev", name: "dev" }] };
    }
    if (queryKey[0] === "chat") {
      return { data: [{ id: "s1", title: "DALE-1 Fix login wording" }] };
    }
    return { data: [] };
  },
}));

describe("TeamSidebar", () => {
  it("shows new work, channels, sessions, and the board", () => {
    render(
      <I18nProvider locale="en" resources={{ en: { common: enCommon, work: enWork } }}>
        <TeamSidebar />
      </I18nProvider>,
    );

    expect(screen.getByText("New work")).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.getByText("DALE-1 Fix login wording")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("Machines")).toBeInTheDocument();
    expect(screen.getByText("Members")).toBeInTheDocument();
  });
});
