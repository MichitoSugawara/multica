import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../client";
import { createMockApiClient, createMockFetch, resetMockState } from "./index";
import {
  MOCK_AGENT_ID,
  MOCK_CHANNEL_DEV_ID,
  MOCK_CHANNEL_MSG_1_ID,
  MOCK_KENTA_CHAT_SESSION_ID,
  MOCK_KENTA_RUNTIME_ID,
  MOCK_RUNTIME_ID,
  MOCK_SHARED_RUNTIME_ID,
  MOCK_USER,
  MOCK_USER_EMAIL,
  MOCK_WORKSPACE,
  MOCK_WORKSPACE_NAME,
} from "./fixtures";

afterEach(() => {
  resetMockState();
  vi.unstubAllGlobals();
});

describe("mock API adapter", () => {
  it("getMe returns the fixture user without calling the network", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);

    const user = await createMockApiClient().getMe();

    expect(user.email).toBe(MOCK_USER_EMAIL);
    expect(user.id).toBe(MOCK_USER.id);
    expect(user.onboarded_at).toBeTruthy();
    expect(network).not.toHaveBeenCalled();
  });

  it("listWorkspaces returns the fixture workspace without calling the network", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);

    const workspaces = await createMockApiClient().listWorkspaces();

    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]?.name).toBe(MOCK_WORKSPACE_NAME);
    expect(workspaces[0]?.slug).toBe(MOCK_WORKSPACE.slug);
    expect(network).not.toHaveBeenCalled();
  });

  it("leaves production ApiClient on the real fetch when mock is off", async () => {
    const network = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_USER), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", network);

    await new ApiClient("https://api.example.test").getMe();

    expect(network).toHaveBeenCalledTimes(1);
    expect(String(network.mock.calls[0]?.[0])).toContain("/api/me");
  });

  it("unknown reads return empty-but-valid data instead of throwing", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);

    const client = createMockApiClient();
    await expect(client.listPins()).resolves.toEqual([]);
    await expect(client.listMyInvitations()).resolves.toEqual([]);
    await expect(client.getInboxUnreadSummary()).resolves.toEqual([]);
    expect(network).not.toHaveBeenCalled();
  });

  it("lists team fixtures for channels, machines, and work chats", async () => {
    const client = createMockApiClient();
    const channels = await client.listChannels();
    const runtimes = await client.listRuntimes();
    const sessions = await client.listChatSessions();
    const persona = await client.getMockPersona();

    expect(persona.role).toBe("admin");
    expect(channels.map((channel) => channel.slug)).toEqual(["general", "dev", "random"]);
    expect(runtimes.map((runtime) => runtime.id)).toContain(MOCK_KENTA_RUNTIME_ID);
    expect(runtimes.map((runtime) => runtime.id)).toContain(MOCK_SHARED_RUNTIME_ID);
    expect(sessions.map((session) => session.id)).toContain(MOCK_KENTA_CHAT_SESSION_ID);
  });

  it("hides another member's personal machine and work chat from a member", async () => {
    const client = createMockApiClient();
    await client.setMockPersona("member");

    const runtimes = await client.listRuntimes();
    const sessions = await client.listChatSessions();

    expect(runtimes.map((runtime) => runtime.id)).not.toContain(MOCK_KENTA_RUNTIME_ID);
    expect(runtimes.map((runtime) => runtime.id)).toContain(MOCK_RUNTIME_ID);
    expect(runtimes.map((runtime) => runtime.id)).toContain(MOCK_SHARED_RUNTIME_ID);
    expect(sessions.map((session) => session.id)).not.toContain(MOCK_KENTA_CHAT_SESSION_ID);
  });

  it("starts a work chat and promotes a channel message without a network call", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const client = createMockApiClient();

    const created = await client.createWork({
      title: "ログイン文言を直す",
      agent_id: MOCK_AGENT_ID,
      runtime_id: MOCK_RUNTIME_ID,
      connection: "direct",
    });
    expect(created.session.title).toContain("ログイン文言を直す");
    expect(created.issue.identifier).toMatch(/^DALE-\d+$/);

    const promoted = await client.promoteChannelMessage(
      MOCK_CHANNEL_DEV_ID,
      MOCK_CHANNEL_MSG_1_ID,
    );
    expect(promoted.session.id).toBeTruthy();
    expect(promoted.session.title).toContain("サインイン");

    const channel = await client.getChannel(MOCK_CHANNEL_DEV_ID);
    expect(channel.messages.find((message) => message.id === MOCK_CHANNEL_MSG_1_ID)?.promoted_session_id).toBe(
      promoted.session.id,
    );
    expect(network).not.toHaveBeenCalled();
  });

  it("rejects a member starting work on someone else's personal machine", async () => {
    const client = createMockApiClient();
    await client.setMockPersona("member");

    await expect(
      client.createWork({
        title: "他人のマシン",
        agent_id: MOCK_AGENT_ID,
        runtime_id: MOCK_KENTA_RUNTIME_ID,
        connection: "direct",
      }),
    ).rejects.toThrow();
  });

  it("createMockFetch itself never delegates to global fetch", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);

    const res = await createMockFetch()("/api/me");
    const body = (await res.json()) as { email?: string };

    expect(res.ok).toBe(true);
    expect(body.email).toBe(MOCK_USER_EMAIL);
    expect(network).not.toHaveBeenCalled();
  });
});
