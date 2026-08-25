"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { channelDetailOptions, channelListOptions, usePromoteChannelMessage } from "@multica/core/channels";
import { paths, useCurrentWorkspace, useWorkspacePaths } from "@multica/core/paths";
import { Button } from "@multica/ui/components/ui/button";
import { PageHeader } from "../layout/page-header";
import { useNavigation } from "../navigation";
import { useT } from "../i18n";

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  });
}

export function ChannelPage({ channelId }: { channelId: string }) {
  const { t } = useT("work");
  const { push } = useNavigation();
  const workspace = useCurrentWorkspace();
  const p = useWorkspacePaths();
  const wsId = workspace?.id ?? "";
  const { data: channel } = useQuery(channelDetailOptions(wsId, channelId));
  const promote = usePromoteChannelMessage(wsId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader>
        <div className="min-w-0">
          <h1 className="text-title font-medium">#{channel?.name || channelId}</h1>
          <p className="text-caption text-muted-foreground">{channel?.topic}</p>
        </div>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {(channel?.messages ?? []).length === 0 ? (
            <p className="text-caption text-muted-foreground">{t(($) => $.empty_channel)}</p>
          ) : (
            (channel?.messages ?? []).map((message) => (
              <article key={message.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{message.author_name}</span>
                  <span className="text-caption text-muted-foreground">{formatTime(message.created_at)}</span>
                </div>
                <p className="text-body">{message.body}</p>
                {message.promoted_session_id ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() => push(p.chatSession(message.promoted_session_id ?? ""))}
                  >
                    {t(($) => $.open_work)}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    disabled={promote.isPending}
                    onClick={() =>
                      promote.mutate(
                        { channelId: channel?.id || channelId, messageId: message.id },
                        {
                          onSuccess: (result) => {
                            if (result.session.id) push(p.chatSession(result.session.id));
                          },
                        },
                      )
                    }
                  >
                    {t(($) => $.promote)}
                  </Button>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function ChannelIndexPage() {
  const { replace } = useNavigation();
  const workspace = useCurrentWorkspace();
  const slug = workspace?.slug ?? "";
  const { data: channels = [] } = useQuery(channelListOptions(workspace?.id ?? ""));
  const target = channels.find((channel) => channel.slug === "dev") ?? channels[0];
  useEffect(() => {
    if (!slug || !target) return;
    replace(paths.workspace(slug).channelDetail(target.slug || target.id));
  }, [replace, slug, target]);
  return null;
}
