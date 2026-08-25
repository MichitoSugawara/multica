/** Frontend-only human channel types. The Go server does not implement these. */

export type ChannelMessageAuthorKind = "member";

export interface ChannelMessage {
  id: string;
  channel_id: string;
  author_id: string;
  author_name: string;
  author_kind: ChannelMessageAuthorKind;
  body: string;
  created_at: string;
  promoted_session_id: string | null;
}

export interface HumanChannel {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  topic: string;
  messages: ChannelMessage[];
}

export type MockPersonaRole = "admin" | "member";

export interface MockPersona {
  role: MockPersonaRole;
}

export type WorkConnection = "direct" | "proxy";

export interface WorkLaunch {
  issue_id: string;
  session_id: string;
  runtime_id: string;
  connection: WorkConnection;
  assigned_member_id: string | null;
}

export interface WorkLaunchResponse {
  issue: import("./issue").Issue;
  session: import("./chat").ChatSession;
  launch?: WorkLaunch | null;
}
