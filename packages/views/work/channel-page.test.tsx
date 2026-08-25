// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@multica/core/i18n/react";
import type { HumanChannel } from "@multica/core/types";
import enCommon from "../locales/en/common.json";
import enWork from "../locales/en/work.json";
import { ChannelPage } from "./channel-page";

const promoteMutate = vi.fn();
const push = vi.fn();

const CHANNEL: HumanChannel = {
  id: "ch-dev",
  workspace_id: "ws-1",
  slug: "dev",
  name: "dev",
  topic: "Implementation talk",
  messages: [
    {
      id: "msg-1",
      channel_id: "ch-dev",
      author_id: "user-1",
      author_name: "Micchi",
      author_kind: "member",
      body: "Change Sign in to Enter.",
      created_at: "2026-08-01T01:04:00.000Z",
      promoted_session_id: null,
    },
  ],
};

vi.mock("@multica/core/paths", () => ({
  useCurrentWorkspace: () => ({ id: "ws-1", slug: "dale" }),
  useWorkspacePaths: () => ({
    chatSession: (id: string) => `/dale/chat?session=${id}`,
  }),
}));

vi.mock("@multica/core/channels", () => ({
  channelDetailOptions: () => ({ queryKey: ["channel"] }),
  usePromoteChannelMessage: () => ({ mutate: promoteMutate, isPending: false }),
}));

vi.mock("../navigation", () => ({
  useNavigation: () => ({ push, pathname: "/dale/channels/dev", searchParams: new URLSearchParams() }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({ data: CHANNEL }),
}));

describe("ChannelPage", () => {
  beforeEach(() => {
    promoteMutate.mockReset();
    push.mockReset();
  });

  it("turns a human message into a work chat", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider locale="en" resources={{ en: { common: enCommon, work: enWork } }}>
        <ChannelPage channelId="dev" />
      </I18nProvider>,
    );

    expect(screen.getByText("Change Sign in to Enter.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn into work" }));
    expect(promoteMutate).toHaveBeenCalledWith(
      { channelId: "ch-dev", messageId: "msg-1" },
      expect.any(Object),
    );
  });
});
