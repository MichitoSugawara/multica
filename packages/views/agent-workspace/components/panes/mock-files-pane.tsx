/* eslint-disable i18next/no-literal-string -- mock file tree and sample code */
"use client";

import { useState } from "react";
import { ChevronRight, FileCode2 } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";

const TREE = [
  {
    name: "packages",
    children: [
      {
        name: "views",
        children: [
          {
            name: "agent-workspace",
            children: [
              { name: "agent-workspace-page.tsx" },
              { name: "components/" },
            ],
          },
        ],
      },
      { name: "core", children: [{ name: "agent-workspace/" }] },
    ],
  },
];

const FILE_CONTENT = `export function AgentWorkspacePage() {
  // Codex-style agent window mock
  return (
    <div className="flex h-full min-h-0">
      {/* session list | chat | tool dock */}
    </div>
  );
}
`;

function TreeNode({
  name,
  depth,
  selected,
  onSelect,
}: {
  name: string;
  depth: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const isFile = name.endsWith(".tsx") || name.endsWith(".ts");
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-caption hover:bg-muted/60",
        selected && "bg-muted text-foreground",
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      {!isFile && <ChevronRight className="size-3 shrink-0 text-muted-foreground" />}
      {isFile && <FileCode2 className="size-3 shrink-0 text-muted-foreground" />}
      <span className="truncate">{name}</span>
    </button>
  );
}

export function MockFilesPane() {
  const [selected, setSelected] = useState("agent-workspace-page.tsx");

  return (
    <div className="flex h-full min-h-0">
      <div className="w-44 shrink-0 overflow-y-auto border-r bg-muted/20 p-1">
        {TREE.map((node) => (
          <div key={node.name}>
            <TreeNode
              name={node.name}
              depth={0}
              selected={false}
              onSelect={() => {}}
            />
            {node.children?.map((child) => (
              <div key={child.name}>
                <TreeNode name={child.name} depth={1} selected={false} onSelect={() => {}} />
                {child.children?.map((grand) => (
                  <div key={grand.name}>
                    <TreeNode name={grand.name} depth={2} selected={false} onSelect={() => {}} />
                    {"children" in grand &&
                      grand.children?.map((leaf) => (
                        <TreeNode
                          key={leaf.name}
                          name={leaf.name}
                          depth={3}
                          selected={selected === leaf.name}
                          onSelect={() => setSelected(leaf.name)}
                        />
                      ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-auto bg-[#0d1117] p-3 font-mono text-[12px] leading-relaxed text-[#c9d1d9]">
        <pre className="whitespace-pre">{FILE_CONTENT}</pre>
      </div>
    </div>
  );
}
