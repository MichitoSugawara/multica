"use client";

import { machineLabel } from "@multica/core/chat";
import { useT } from "../../../i18n";

export function RdpPane({ machineId }: { machineId: string }) {
  const { t } = useT("chat");

  return (
    <div className="flex h-full flex-col bg-zinc-900 text-zinc-100">
      <div className="flex h-8 items-center justify-between border-b border-zinc-800 px-3 text-caption">
        <span>{t(($) => $.workspace.rdp_connected, { machine: machineLabel(machineId) })}</span>
        <span className="size-2 rounded-full bg-success" />
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <div className="absolute inset-6 rounded-xl border border-zinc-700 bg-gradient-to-br from-zinc-800 to-zinc-950 shadow-lg" />
        <div className="relative space-y-2 text-center">
          <div className="mx-auto size-16 rounded-2xl bg-zinc-700/80" />
          <p className="text-body">{machineLabel(machineId)}</p>
          <p className="text-caption text-zinc-400">{t(($) => $.workspace.rdp_hint)}</p>
        </div>
      </div>
    </div>
  );
}
