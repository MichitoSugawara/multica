"use client";

import { ArrowLeft, ArrowRight, Lock, RotateCw } from "lucide-react";
import { Input } from "@multica/ui/components/ui/input";
import { useT } from "../../../i18n";

export function MockBrowserPane() {
  const { t } = useT("agent-workspace");
  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/20">
      <div className="flex shrink-0 items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted">
          <ArrowLeft className="size-3.5" />
        </button>
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted">
          <ArrowRight className="size-3.5" />
        </button>
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted">
          <RotateCw className="size-3.5" />
        </button>
        <div className="relative min-w-0 flex-1">
          <Lock className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            readOnly
            value="https://app.multica.test/acme/chat"
            className="h-7 pl-7 text-caption"
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="rounded-lg border bg-background px-8 py-6 shadow-sm">
          <p className="text-title font-semibold">{t(($) => $.panes.browser_title)}</p>
          <p className="mt-2 max-w-sm text-body text-muted-foreground">
            {t(($) => $.panes.browser_description)}
          </p>
        </div>
      </div>
    </div>
  );
}
