"use client";

import { use } from "react";
import { ChannelPage } from "@multica/views/work";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ChannelPage channelId={id} />;
}
