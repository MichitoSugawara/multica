"use client";

import { useState } from "react";
import { ArrowLeft, RotateCw } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { useT } from "../../../i18n";

export function BrowserPane({
  url,
  onNavigate,
}: {
  url: string;
  onNavigate: (url: string) => void;
}) {
  const { t } = useT("chat");
  const [draft, setDraft] = useState(url);

  return (
    <div className="flex h-full flex-col">
      <form
        className="flex items-center gap-1 border-b px-2 py-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          const next = draft.trim() || url;
          onNavigate(next.startsWith("http") ? next : `https://${next}`);
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t(($) => $.workspace.browser_go)}
          onClick={() => onNavigate("https://example.com")}
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t(($) => $.workspace.browser_go)}
          onClick={() => onNavigate(url)}
        >
          <RotateCw className="size-3.5" />
        </Button>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={t(($) => $.workspace.browser_url)}
          className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-caption outline-none"
        />
        <Button type="submit" size="sm" variant="outline">
          {t(($) => $.workspace.browser_go)}
        </Button>
      </form>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-muted/30 px-6 text-center">
        <p className="text-body font-medium">{t(($) => $.workspace.browser_mock_title)}</p>
        <p className="text-caption text-muted-foreground">{url}</p>
        <p className="text-caption text-muted-foreground">
          {t(($) => $.workspace.browser_mock_body)}
        </p>
      </div>
    </div>
  );
}
