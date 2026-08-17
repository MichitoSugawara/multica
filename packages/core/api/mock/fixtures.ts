import type {
  Agent,
  AgentRuntime,
  ChatSession,
  Issue,
  MemberWithUser,
  User,
  Workspace,
} from "../../types";

/** Stable fixture IDs — safe to hard-code in tests and the web mock proxy. */
export const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";
export const MOCK_WORKSPACE_ID = "00000000-0000-4000-8000-000000000010";
export const MOCK_MEMBER_ID = "00000000-0000-4000-8000-000000000011";
export const MOCK_AGENT_ID = "00000000-0000-4000-8000-000000000020";
export const MOCK_RUNTIME_ID = "00000000-0000-4000-8000-000000000030";
export const MOCK_CHAT_SESSION_ID = "00000000-0000-4000-8000-000000000040";
export const MOCK_ISSUE_1_ID = "00000000-0000-4000-8000-000000000101";
export const MOCK_ISSUE_2_ID = "00000000-0000-4000-8000-000000000102";
export const MOCK_ISSUE_3_ID = "00000000-0000-4000-8000-000000000103";

export const MOCK_WORKSPACE_SLUG = "dione";
export const MOCK_WORKSPACE_NAME = "ディオネ";
export const MOCK_USER_EMAIL = "michitogawara@gmail.com";

const NOW = "2026-08-01T00:00:00.000Z";

export const MOCK_USER: User = {
  id: MOCK_USER_ID,
  name: "Michito Sugawara",
  email: MOCK_USER_EMAIL,
  avatar_url: null,
  onboarded_at: NOW,
  onboarding_questionnaire: {},
  starter_content_state: "imported",
  language: "ja",
  profile_description: "",
  timezone: "Asia/Tokyo",
  created_at: NOW,
  updated_at: NOW,
};

export const MOCK_WORKSPACE: Workspace = {
  id: MOCK_WORKSPACE_ID,
  name: MOCK_WORKSPACE_NAME,
  slug: MOCK_WORKSPACE_SLUG,
  description: "UI mock workspace — no backend required.",
  context: null,
  settings: {},
  repos: [],
  issue_prefix: "DIO",
  avatar_url: null,
  created_at: NOW,
  updated_at: NOW,
};

export const MOCK_MEMBER: MemberWithUser = {
  id: MOCK_MEMBER_ID,
  workspace_id: MOCK_WORKSPACE_ID,
  user_id: MOCK_USER_ID,
  role: "owner",
  created_at: NOW,
  name: MOCK_USER.name,
  email: MOCK_USER.email,
  avatar_url: null,
};

export const MOCK_RUNTIME: AgentRuntime = {
  id: MOCK_RUNTIME_ID,
  workspace_id: MOCK_WORKSPACE_ID,
  daemon_id: null,
  name: "Mock laptop",
  runtime_mode: "local",
  provider: "claude",
  launch_header: "",
  status: "offline",
  device_info: "UI mock runtime",
  metadata: {},
  owner_id: MOCK_USER_ID,
  visibility: "private",
  last_seen_at: null,
  created_at: NOW,
  updated_at: NOW,
};

export const MOCK_AGENT: Agent = {
  id: MOCK_AGENT_ID,
  workspace_id: MOCK_WORKSPACE_ID,
  runtime_id: MOCK_RUNTIME_ID,
  runtime_bound: true,
  name: "Mika",
  description: "Fixture Chief of Staff for UI mock mode.",
  instructions: "",
  avatar_url: null,
  runtime_mode: "local",
  runtime_config: {},
  custom_args: [],
  visibility: "workspace",
  permission_mode: "public_to",
  invocation_targets: [{ target_type: "workspace", target_id: MOCK_WORKSPACE_ID }],
  status: "offline",
  max_concurrent_tasks: 1,
  model: "",
  owner_id: MOCK_USER_ID,
  skills: [],
  created_at: NOW,
  updated_at: NOW,
  archived_at: null,
  archived_by: null,
};

export const MOCK_CHAT_SESSION: ChatSession = {
  id: MOCK_CHAT_SESSION_ID,
  workspace_id: MOCK_WORKSPACE_ID,
  agent_id: MOCK_AGENT_ID,
  creator_id: MOCK_USER_ID,
  project_id: null,
  title: "Welcome to mock mode",
  status: "active",
  has_unread: false,
  unread_count: 0,
  last_message: null,
  pinned: false,
  created_at: NOW,
  updated_at: NOW,
};

function issue(
  id: string,
  number: number,
  title: string,
  status: Issue["status"],
  priority: Issue["priority"],
): Issue {
  return {
    id,
    workspace_id: MOCK_WORKSPACE_ID,
    number,
    identifier: `DIO-${number}`,
    title,
    description: null,
    status,
    priority,
    assignee_type: "member",
    assignee_id: MOCK_USER_ID,
    creator_type: "member",
    creator_id: MOCK_USER_ID,
    parent_issue_id: null,
    project_id: null,
    position: number,
    stage: null,
    start_date: null,
    due_date: null,
    metadata: {},
    properties: {},
    created_at: NOW,
    updated_at: NOW,
  };
}

export const MOCK_ISSUES: Issue[] = [
  issue(MOCK_ISSUE_1_ID, 1, "Review the dashboard chrome", "in_progress", "high"),
  issue(MOCK_ISSUE_2_ID, 2, "Triage inbox empty states", "todo", "medium"),
  issue(MOCK_ISSUE_3_ID, 3, "Sketch a follow-up issue", "backlog", "none"),
];

export const MOCK_APP_CONFIG = {
  cdn_domain: "",
  cdn_signed: false,
  allow_signup: true,
  google_client_id: "",
  daemon_server_url: "",
  daemon_app_url: "",
  workspace_creation_disabled: false,
  vcs_integration_available: false,
  feature_flags: {},
  server_version: "mock",
};
