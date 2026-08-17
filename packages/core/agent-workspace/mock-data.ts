import type { MockConnector, MockMachine, MockModel, MockSlashCommand, MockToolTab } from "./types";

export const MOCK_MACHINES: MockMachine[] = [
  {
    id: "moris-this-pc",
    name: "Moris (this PC)",
    subtitle: "Local daemon · macOS 15.2",
    online: true,
  },
  {
    id: "dale-suzukimac-mini",
    name: "dale-suzukimac-mini",
    subtitle: "Remote runtime · Mac mini M4",
    online: true,
  },
  {
    id: "lab-mini-offline",
    name: "lab-mini-03",
    subtitle: "Remote runtime · last seen 2h ago",
    online: false,
  },
];

export const MOCK_MODELS: MockModel[] = [
  { id: "claude-sonnet", name: "Claude Sonnet 4", provider: "Anthropic" },
  { id: "cursor-composer", name: "Composer 2.5", provider: "Cursor" },
  { id: "gpt-5", name: "GPT-5", provider: "OpenAI" },
  { id: "gemini-flash", name: "Gemini 3 Flash", provider: "Google" },
];

export const MOCK_CONNECTORS: MockConnector[] = [
  { id: "slack", name: "Slack", connected: true },
  { id: "github", name: "GitHub", connected: true },
  { id: "linear", name: "Linear", connected: false },
  { id: "notion", name: "Notion", connected: false },
];

export const SLASH_COMMANDS: {
  id: MockSlashCommand;
  label: string;
  description: string;
  tab?: MockToolTab;
}[] = [
  { id: "browser", label: "/browser", description: "Open browser pane", tab: "browser" },
  { id: "terminal", label: "/terminal", description: "Open terminal pane", tab: "terminal" },
  { id: "rdp", label: "/rdp", description: "Open remote desktop", tab: "rdp" },
  { id: "file", label: "/file", description: "Open file editor", tab: "files" },
  { id: "git", label: "/git", description: "Show git status", tab: "git" },
  { id: "connector", label: "/connector", description: "Manage connectors" },
];

export function mockMachineById(id: string): MockMachine | undefined {
  return MOCK_MACHINES.find((m) => m.id === id);
}

export function mockModelById(id: string): MockModel | undefined {
  return MOCK_MODELS.find((m) => m.id === id);
}

export function buildSessionTitle(machineId: string, modelId: string): string {
  const machine = mockMachineById(machineId);
  const model = mockModelById(modelId);
  const machineName = machine?.name ?? machineId;
  const modelName = model?.name ?? modelId;
  return `${machineName} · ${modelName}`;
}

export function cannedAssistantReply(
  userText: string,
  tabToOpen?: MockToolTab,
): { content: string; openTab?: MockToolTab } {
  const trimmed = userText.trim();
  const lower = trimmed.toLowerCase();

  if (tabToOpen === "terminal" || lower.includes("terminal")) {
    return {
      content:
        "Terminal session attached on the selected machine. You can run commands in the bottom pane — output is mocked for this demo.",
      openTab: "terminal",
    };
  }
  if (tabToOpen === "browser" || lower.includes("browser")) {
    return {
      content: "Browser pane opened. Navigating to the workspace dashboard (mock).",
      openTab: "browser",
    };
  }
  if (tabToOpen === "rdp" || lower.includes("remote desktop") || lower.includes("rdp")) {
    return {
      content: "Remote desktop stream placeholder is ready in the right pane.",
      openTab: "rdp",
    };
  }
  if (tabToOpen === "files" || lower.includes("file") || lower.includes("edit")) {
    return {
      content: "Opened `packages/views/agent-workspace/agent-workspace-page.tsx` in the file editor (mock).",
      openTab: "files",
    };
  }
  if (tabToOpen === "git" || lower.includes("git") || lower.includes("diff")) {
    return {
      content: "Git pane shows staged changes on `cursor/codex-agent-workspace-mock-d066` (mock).",
      openTab: "git",
    };
  }
  if (lower.includes("hello") || lower.includes("hi")) {
    return {
      content:
        "Hi — I'm running locally on your selected machine. Try `/terminal`, `/browser`, or ask me to open a tool pane.",
    };
  }
  return {
    content: `Got it. (“${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}”) This is a canned mock reply — no model was called.`,
  };
}
