"use client";

import { toast } from "sonner";
import { MOCK_GIT_BRANCH, MOCK_GIT_DIFF, MOCK_GIT_FILES } from "@multica/core/chat";
import { Button } from "@multica/ui/components/ui/button";
import { useT } from "../../../i18n";

export function GitPane() {
  const { t } = useT("chat");

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption text-muted-foreground">
          {t(($) => $.workspace.git_branch)} · {MOCK_GIT_BRANCH}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled
          onClick={() => toast.message(t(($) => $.workspace.git_commit_disabled))}
        >
          {t(($) => $.workspace.git_commit)}
        </Button>
      </div>
      {MOCK_GIT_FILES.length === 0 ? (
        <p className="text-caption text-muted-foreground">{t(($) => $.workspace.git_empty)}</p>
      ) : (
        <ul className="space-y-1">
          {MOCK_GIT_FILES.map((file) => (
            <li key={file.path} className="flex items-center gap-2 text-caption">
              <span className="w-4 font-mono text-muted-foreground">
                {file.status === "added" ? "A" : "M"}
              </span>
              <span>{file.path}</span>
            </li>
          ))}
        </ul>
      )}
      <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-caption">
        {MOCK_GIT_DIFF}
      </pre>
    </div>
  );
}
