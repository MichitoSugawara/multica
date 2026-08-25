"use client";

import { useQuery } from "@tanstack/react-query";
import { mockPersonaOptions, useSetMockPersona } from "@multica/core/channels";
import { useAuthStore } from "@multica/core/auth";
import { useCurrentWorkspace } from "@multica/core/paths";
import { useShortcut } from "@multica/core/shortcuts";
import { cn } from "@multica/ui/lib/utils";
import { ShortcutKeycaps } from "../common/shortcut-keycaps";
import { useT } from "../i18n";
import { useSearchStore } from "../search/search-store";

export function MockWorkspaceChrome() {
  const { t } = useT("work");
  const user = useAuthStore((s) => s.user);
  const workspace = useCurrentWorkspace();
  const { data: persona } = useQuery(mockPersonaOptions());
  const setPersona = useSetMockPersona(workspace?.id ?? "");
  const role = persona?.role === "member" ? "member" : "admin";
  const shortcut = useShortcut("openSearch");

  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b px-3 text-caption">
      <span className="min-w-0 truncate font-medium">{workspace?.name}</span>
      <button
        type="button"
        className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => useSearchStore.getState().setOpen(true)}
      >
        <span>{t(($) => $.search)}</span>
        {shortcut ? <ShortcutKeycaps shortcut={shortcut} decorative /> : <span>⌘K</span>}
      </button>
      <span className="truncate text-muted-foreground">{user?.name}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={cn("hover:text-foreground", role === "admin" ? "font-semibold text-foreground" : "text-muted-foreground")}
          onClick={() => setPersona.mutate("admin")}
        >
          {t(($) => $.admin)}
        </button>
        <button
          type="button"
          className={cn("hover:text-foreground", role === "member" ? "font-semibold text-foreground" : "text-muted-foreground")}
          onClick={() => setPersona.mutate("member")}
        >
          {t(($) => $.member)}
        </button>
      </div>
    </div>
  );
}
