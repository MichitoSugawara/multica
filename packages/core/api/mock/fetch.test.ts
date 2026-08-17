import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../client";
import { createMockApiClient, createMockFetch, resetMockState } from "./index";
import { MOCK_USER, MOCK_USER_EMAIL, MOCK_WORKSPACE, MOCK_WORKSPACE_NAME } from "./fixtures";

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
