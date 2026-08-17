export type MockToolTab = "browser" | "terminal" | "rdp" | "files" | "git";

export type MockSlashCommand =
  | "browser"
  | "terminal"
  | "rdp"
  | "file"
  | "git"
  | "connector";

export interface MockMachine {
  id: string;
  name: string;
  subtitle: string;
  online: boolean;
}

export interface MockModel {
  id: string;
  name: string;
  provider: string;
}

export interface MockConnector {
  id: string;
  name: string;
  connected: boolean;
}

export interface MockMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface MockAgentSession {
  id: string;
  title: string;
  machineId: string;
  modelId: string;
  messages: MockMessage[];
  createdAt: string;
  updatedAt: string;
}
