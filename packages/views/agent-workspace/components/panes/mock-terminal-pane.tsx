"use client";

const LINES = [
  { prompt: true, text: "multica@dale-suzukimac-mini ~ % pnpm typecheck" },
  { prompt: false, text: "Scope: 12 packages" },
  { prompt: false, text: "✓ @multica/views typecheck passed" },
  { prompt: false, text: "✓ @multica/core typecheck passed" },
  { prompt: true, text: "multica@dale-suzukimac-mini ~ % git status -sb" },
  { prompt: false, text: "## cursor/codex-agent-workspace-mock-d066" },
  { prompt: false, text: " M packages/views/agent-workspace/" },
  { prompt: true, text: "multica@dale-suzukimac-mini ~ % █" },
];

export function MockTerminalPane() {
  return (
    <div className="h-full min-h-0 overflow-auto bg-[#0d1117] p-3 font-mono text-[13px] leading-relaxed text-[#c9d1d9]">
      {LINES.map((line, i) => (
        <div key={i} className="whitespace-pre-wrap break-all">
          {line.prompt ? (
            <>
              <span className="text-[#7ee787]">{line.text.split(" %")[0]} %</span>
              <span> {line.text.split(" % ").slice(1).join(" % ")}</span>
            </>
          ) : (
            line.text
          )}
        </div>
      ))}
    </div>
  );
}
