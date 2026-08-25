// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@multica/core/i18n/react";
import type { Agent, AgentRuntime, MemberWithUser } from "@multica/core/types";
import enCommon from "../locales/en/common.json";
import enWork from "../locales/en/work.json";
import { NewWorkPage } from "./new-work-page";

const createWorkMutate = vi.fn();
const persona = { current: { role: "admin" as "admin" | "member" } };

const OWN: AgentRuntime = {
  id: "rt-own",
  workspace_id: "ws-1",
  daemon_id: "d-own",
  name: "micchi-mac",
  custom_name: "Micchi Mac",
  runtime_mode: "local",
  provider: "claude",
  launch_header: "",
  status: "online",
  device_info: "Your machine",
  metadata: {},
  owner_id: "user-1",
  visibility: "private",
  last_seen_at: "2026-08-01T00:00:00.000Z",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

const OTHER: AgentRuntime = {
  ...OWN,
  id: "rt-other",
  daemon_id: "d-other",
  name: "kenta-mac",
  custom_name: "Kenta Mac",
  owner_id: "user-kenta",
  device_info: "Kenta's personal machine",
};

const SHARED: AgentRuntime = {
  ...OWN,
  id: "rt-shared",
  daemon_id: "d-shared",
  name: "office-mini",
  custom_name: "Office Mini",
  visibility: "public",
  device_info: "Shared team PC",
};

const AGENTS: Agent[] = [
  {
    id: "ag-claude",
    workspace_id: "ws-1",
    runtime_id: "rt-own",
    runtime_bound: true,
    name: "Claude Code",
    description: "",
    instructions: "",
    avatar_url: null,
    runtime_mode: "local",
    runtime_config: {},
    custom_args: [],
    visibility: "workspace",
    permission_mode: "public_to",
    invocation_targets: [],
    status: "offline",
    max_concurrent_tasks: 1,
    model: "",
    owner_id: "user-1",
    skills: [],
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    archived_at: null,
    archived_by: null,
  },
];

const MEMBERS: MemberWithUser[] = [
  {
    id: "m-1",
    workspace_id: "ws-1",
    user_id: "user-1",
    role: "owner",
    created_at: "2026-08-01T00:00:00.000Z",
    name: "Micchi",
    email: "m@example.com",
    avatar_url: null,
  },
];

vi.mock("@multica/core/auth", () => ({
  useAuthStore: (selector: (s: { user: { id: string } }) => unknown) =>
    selector({ user: { id: "user-1" } }),
}));

vi.mock("@multica/core/paths", () => ({
  useCurrentWorkspace: () => ({ id: "ws-1", slug: "dale", name: "Dale" }),
  useWorkspacePaths: () => ({
    chatSession: (id: string) => `/dale/chat?session=${id}`,
  }),
}));

vi.mock("@multica/core/channels", () => ({
  mockPersonaOptions: () => ({ queryKey: ["mock-persona"] }),
  useCreateWork: () => ({ mutate: createWorkMutate, isPending: false }),
}));

vi.mock("@multica/core/runtimes", () => ({
  runtimeDisplayName: (runtime: { custom_name?: string | null; name: string }) =>
    runtime.custom_name?.trim() || runtime.name,
  runtimeListOptions: () => ({ queryKey: ["runtimes"] }),
}));

vi.mock("@multica/core/workspace/queries", () => ({
  agentListOptions: () => ({ queryKey: ["agents"] }),
  memberListOptions: () => ({ queryKey: ["members"] }),
}));

vi.mock("../navigation", () => ({
  useNavigation: () => ({ push: vi.fn(), pathname: "/dale/work", searchParams: new URLSearchParams() }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === "mock-persona") return { data: persona.current };
    if (queryKey[0] === "runtimes") return { data: [OWN, OTHER, SHARED] };
    if (queryKey[0] === "agents") return { data: AGENTS };
    if (queryKey[0] === "members") return { data: MEMBERS };
    return { data: undefined };
  },
}));

function renderPage() {
  return render(
    <I18nProvider locale="en" resources={{ en: { common: enCommon, work: enWork } }}>
      <NewWorkPage />
    </I18nProvider>,
  );
}

describe("NewWorkPage", () => {
  beforeEach(() => {
    createWorkMutate.mockReset();
    persona.current = { role: "admin" };
  });

  it("lets an admin start work on a selected machine and AI", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText("Micchi Mac")).toBeInTheDocument();
    expect(screen.getByText("Kenta Mac")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.getByText("Proxy")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("What should we do?"), "Fix login copy");
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(createWorkMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Fix login copy",
        runtime_id: "rt-own",
        agent_id: "ag-claude",
        connection: "direct",
      }),
      expect.any(Object),
    );
  });

  it("blocks a member from picking someone else's personal machine", async () => {
    persona.current = { role: "member" };
    renderPage();

    expect(screen.getByText("You cannot pick someone else's personal machine.")).toBeInTheDocument();
    const kentaRadio = screen.getByRole("radio", { name: /Kenta Mac/i });
    expect(kentaRadio).toHaveAttribute("aria-disabled", "true");
  });
});
