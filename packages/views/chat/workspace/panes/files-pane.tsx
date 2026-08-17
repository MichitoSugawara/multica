"use client";

import { fileByPath, MOCK_FILES } from "@multica/core/chat";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../../../i18n";

export function FilesPane({
  selectedPath,
  onSelect,
}: {
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const { t } = useT("chat");
  const file = fileByPath(selectedPath);
  const lines = file?.content.split("\n") ?? [];

  return (
    <div className="flex h-full min-h-0">
      <div className="w-40 shrink-0 overflow-auto border-r p-1">
        {MOCK_FILES.map((node) => (
          <button
            key={node.path}
            type="button"
            onClick={() => onSelect(node.path)}
            className={cn(
              "flex w-full rounded-md px-2 py-1 text-left text-caption hover:bg-muted",
              node.path === selectedPath && "bg-muted font-medium",
            )}
          >
            {node.path}
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-auto">
        {file ? (
          <pre className="p-3 font-mono text-caption leading-6">
            {lines.map((line, index) => (
              <div key={`${index}-${line}`} className="flex gap-3">
                <span className="w-6 shrink-0 text-right text-muted-foreground">{index + 1}</span>
                <span>{line || " "}</span>
              </div>
            ))}
          </pre>
        ) : (
          <p className="p-4 text-caption text-muted-foreground">
            {t(($) => $.workspace.files_empty)}
          </p>
        )}
      </div>
    </div>
  );
}
