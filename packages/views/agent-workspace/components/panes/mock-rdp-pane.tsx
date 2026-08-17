"use client";

import { Monitor } from "lucide-react";
import { useT } from "../../../i18n";

export function MockRdpPane() {
  const { t } = useT("agent-workspace");
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-gradient-to-b from-muted/30 to-muted/60 p-6">
      <div className="rounded-xl border bg-background/80 p-8 shadow-lg backdrop-blur-sm">
        <Monitor className="mx-auto size-12 text-muted-foreground" />
        <p className="mt-4 text-body font-medium">{t(($) => $.panes.rdp_title)}</p>
        <p className="mt-1 max-w-xs text-center text-caption text-muted-foreground">
          {t(($) => $.panes.rdp_description)}
        </p>
        <div className="mt-4 rounded-md border bg-muted/40 px-3 py-2 text-caption text-muted-foreground">
          {t(($) => $.panes.rdp_stats)}
        </div>
      </div>
    </div>
  );
}
