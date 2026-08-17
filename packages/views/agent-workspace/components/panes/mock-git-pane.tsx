/* eslint-disable i18next/no-literal-string -- mock git diff output */
"use client";

export function MockGitPane() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto p-3 text-caption">
      <div className="rounded-md border bg-muted/20 p-3">
        <p className="font-medium text-foreground">On branch cursor/codex-agent-workspace-mock-d066</p>
        <p className="mt-1 text-muted-foreground">Your branch is up to date with origin/dev.</p>
      </div>
      <div className="mt-3">
        <p className="mb-2 font-medium text-foreground">Changes to be committed:</p>
        <ul className="space-y-1 text-muted-foreground">
          <li>new file: packages/core/agent-workspace/store.ts</li>
          <li>new file: packages/views/agent-workspace/agent-workspace-page.tsx</li>
          <li>modified: packages/views/layout/app-sidebar.tsx</li>
        </ul>
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-md border bg-[#0d1117] p-3 font-mono text-[12px] text-[#c9d1d9]">
        <p className="text-[#7ee787]">diff --git a/packages/views/layout/app-sidebar.tsx</p>
        <p className="text-[#ffa657]">--- a/packages/views/layout/app-sidebar.tsx</p>
        <p className="text-[#ffa657]">+++ b/packages/views/layout/app-sidebar.tsx</p>
        <p>@@ -151,6 +151,8 @@ const workspaceNav</p>
        <p className="text-[#f85149]">-  agents nav item (archived)</p>
        <p className="text-[#3fb950]">+  // archived in agent-workspace mock</p>
      </div>
    </div>
  );
}
