import type {
  Agent,
  AgentRuntime,
  ChannelMessage,
  ChatMessage,
  ChatSession,
  HumanChannel,
  Issue,
  MemberWithUser,
  User,
  Workspace,
} from "../../types";

/** Stable fixture IDs — safe to hard-code in tests and the web mock proxy. */
export const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";
export const MOCK_KENTA_USER_ID = "00000000-0000-4000-8000-000000000002";
export const MOCK_YUI_USER_ID = "00000000-0000-4000-8000-000000000003";
export const MOCK_WORKSPACE_ID = "00000000-0000-4000-8000-000000000010";
export const MOCK_MEMBER_ID = "00000000-0000-4000-8000-000000000011";
export const MOCK_KENTA_MEMBER_ID = "00000000-0000-4000-8000-000000000012";
export const MOCK_YUI_MEMBER_ID = "00000000-0000-4000-8000-000000000013";
export const MOCK_AGENT_ID = "00000000-0000-4000-8000-000000000020";
export const MOCK_CODEX_AGENT_ID = "00000000-0000-4000-8000-000000000021";
export const MOCK_CURSOR_AGENT_ID = "00000000-0000-4000-8000-000000000022";
export const MOCK_RUNTIME_ID = "00000000-0000-4000-8000-000000000030";
export const MOCK_HOME_RUNTIME_ID = "00000000-0000-4000-8000-000000000031";
export const MOCK_KENTA_RUNTIME_ID = "00000000-0000-4000-8000-000000000032";
export const MOCK_SHARED_RUNTIME_ID = "00000000-0000-4000-8000-000000000033";
export const MOCK_MAC_DAEMON_ID = "00000000-0000-4000-8000-000000000040";
export const MOCK_HOME_DAEMON_ID = "00000000-0000-4000-8000-000000000041";
export const MOCK_KENTA_DAEMON_ID = "00000000-0000-4000-8000-000000000042";
export const MOCK_SHARED_DAEMON_ID = "00000000-0000-4000-8000-000000000043";
export const MOCK_CHAT_SESSION_ID = "00000000-0000-4000-8000-000000000050";
export const MOCK_KENTA_CHAT_SESSION_ID = "00000000-0000-4000-8000-000000000051";
export const MOCK_ISSUE_1_ID = "00000000-0000-4000-8000-000000000101";
export const MOCK_ISSUE_2_ID = "00000000-0000-4000-8000-000000000102";
export const MOCK_ISSUE_3_ID = "00000000-0000-4000-8000-000000000103";
export const MOCK_CHANNEL_GENERAL_ID = "00000000-0000-4000-8000-000000000201";
export const MOCK_CHANNEL_DEV_ID = "00000000-0000-4000-8000-000000000202";
export const MOCK_CHANNEL_CHAT_ID = "00000000-0000-4000-8000-000000000203";
export const MOCK_CHANNEL_MSG_1_ID = "00000000-0000-4000-8000-000000000211";
export const MOCK_CHANNEL_MSG_2_ID = "00000000-0000-4000-8000-000000000212";
export const MOCK_CHANNEL_MSG_3_ID = "00000000-0000-4000-8000-000000000213";

export const MOCK_WORKSPACE_SLUG = "dale";
export const MOCK_WORKSPACE_NAME = "Dale実験";
export const MOCK_ISSUE_PREFIX = "DALE";
export const MOCK_USER_EMAIL = "michitogawara@gmail.com";
export const MOCK_USER_NAME = "みっちー";

const NOW = "2026-08-01T00:00:00.000Z";

export const MOCK_USER: User = {
  id: MOCK_USER_ID,
  name: MOCK_USER_NAME,
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

export const MOCK_KENTA_USER: User = {
  id: MOCK_KENTA_USER_ID,
  name: "けんた",
  email: "kenta@example.com",
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

export const MOCK_YUI_USER: User = {
  id: MOCK_YUI_USER_ID,
  name: "ゆい",
  email: "yui@example.com",
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
  description: "Team workspace mock — no backend required.",
  context: null,
  settings: {},
  repos: [],
  issue_prefix: MOCK_ISSUE_PREFIX,
  avatar_url: null,
  created_at: NOW,
  updated_at: NOW,
};

function member(
  id: string,
  user: User,
  role: MemberWithUser["role"],
): MemberWithUser {
  return {
    id,
    workspace_id: MOCK_WORKSPACE_ID,
    user_id: user.id,
    role,
    created_at: NOW,
    name: user.name,
    email: user.email,
    avatar_url: null,
  };
}

export const MOCK_MEMBER: MemberWithUser = member(MOCK_MEMBER_ID, MOCK_USER, "owner");
export const MOCK_KENTA_MEMBER: MemberWithUser = member(
  MOCK_KENTA_MEMBER_ID,
  MOCK_KENTA_USER,
  "member",
);
export const MOCK_YUI_MEMBER: MemberWithUser = member(
  MOCK_YUI_MEMBER_ID,
  MOCK_YUI_USER,
  "member",
);

export const MOCK_MEMBERS: MemberWithUser[] = [
  MOCK_MEMBER,
  MOCK_KENTA_MEMBER,
  MOCK_YUI_MEMBER,
];

function runtime(input: {
  id: string;
  daemonId: string;
  name: string;
  customName: string;
  status: AgentRuntime["status"];
  ownerId: string;
  visibility: AgentRuntime["visibility"];
  deviceInfo: string;
  provider?: string;
}): AgentRuntime {
  return {
    id: input.id,
    workspace_id: MOCK_WORKSPACE_ID,
    daemon_id: input.daemonId,
    name: input.name,
    custom_name: input.customName,
    runtime_mode: "local",
    provider: input.provider ?? "claude",
    launch_header: "",
    status: input.status,
    device_info: input.deviceInfo,
    metadata: {},
    owner_id: input.ownerId,
    visibility: input.visibility,
    last_seen_at: input.status === "online" ? NOW : null,
    created_at: NOW,
    updated_at: NOW,
  };
}

/** みっちー's personal Mac — default selected machine. */
export const MOCK_RUNTIME: AgentRuntime = runtime({
  id: MOCK_RUNTIME_ID,
  daemonId: MOCK_MAC_DAEMON_ID,
  name: "micchi-mac",
  customName: "みっちーのMac",
  status: "online",
  ownerId: MOCK_USER_ID,
  visibility: "private",
  deviceInfo: "Runtime. Multica をセットアップした人のマシン。",
});

export const MOCK_HOME_RUNTIME: AgentRuntime = runtime({
  id: MOCK_HOME_RUNTIME_ID,
  daemonId: MOCK_HOME_DAEMON_ID,
  name: "home-pc",
  customName: "自宅PC",
  status: "offline",
  ownerId: MOCK_USER_ID,
  visibility: "private",
  deviceInfo: "Runtime. いまはオフライン。",
});

/** Another member's personal machine — members cannot pick this. */
export const MOCK_KENTA_RUNTIME: AgentRuntime = runtime({
  id: MOCK_KENTA_RUNTIME_ID,
  daemonId: MOCK_KENTA_DAEMON_ID,
  name: "kenta-mac",
  customName: "けんたのMac",
  status: "online",
  ownerId: MOCK_KENTA_USER_ID,
  visibility: "private",
  deviceInfo: "けんたの個人マシン。",
});

/** Shared team machine — assignable. */
export const MOCK_SHARED_RUNTIME: AgentRuntime = runtime({
  id: MOCK_SHARED_RUNTIME_ID,
  daemonId: MOCK_SHARED_DAEMON_ID,
  name: "office-mini",
  customName: "オフィス共有 Mini",
  status: "online",
  ownerId: MOCK_USER_ID,
  visibility: "public",
  deviceInfo: "共有チームPC。割り当て可能。",
});

export const MOCK_RUNTIMES: AgentRuntime[] = [
  MOCK_RUNTIME,
  MOCK_HOME_RUNTIME,
  MOCK_KENTA_RUNTIME,
  MOCK_SHARED_RUNTIME,
];

function agent(input: {
  id: string;
  runtimeId: string;
  name: string;
  provider: string;
  description: string;
}): Agent {
  return {
    id: input.id,
    workspace_id: MOCK_WORKSPACE_ID,
    runtime_id: input.runtimeId,
    runtime_bound: true,
    name: input.name,
    description: input.description,
    instructions: "",
    avatar_url: null,
    runtime_mode: "local",
    runtime_config: { provider: input.provider },
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
}

export const MOCK_AGENT: Agent = agent({
  id: MOCK_AGENT_ID,
  runtimeId: MOCK_RUNTIME_ID,
  name: "Claude Code",
  provider: "claude",
  description: "Claude Code",
});

export const MOCK_CODEX_AGENT: Agent = agent({
  id: MOCK_CODEX_AGENT_ID,
  runtimeId: MOCK_RUNTIME_ID,
  name: "Codex",
  provider: "codex",
  description: "Codex",
});

export const MOCK_CURSOR_AGENT: Agent = agent({
  id: MOCK_CURSOR_AGENT_ID,
  runtimeId: MOCK_RUNTIME_ID,
  name: "Cursor",
  provider: "cursor",
  description: "Cursor",
});

export const MOCK_AGENTS: Agent[] = [MOCK_AGENT, MOCK_CODEX_AGENT, MOCK_CURSOR_AGENT];

function issue(
  id: string,
  number: number,
  title: string,
  status: Issue["status"],
  priority: Issue["priority"],
  assigneeId: string,
): Issue {
  return {
    id,
    workspace_id: MOCK_WORKSPACE_ID,
    number,
    identifier: `${MOCK_ISSUE_PREFIX}-${number}`,
    title,
    description: null,
    status,
    priority,
    assignee_type: "member",
    assignee_id: assigneeId,
    creator_type: "member",
    creator_id: assigneeId,
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
  issue(MOCK_ISSUE_1_ID, 1, "ログイン文言の修正", "in_progress", "high", MOCK_USER_ID),
  issue(MOCK_ISSUE_2_ID, 2, "検索の空状態", "todo", "medium", MOCK_KENTA_USER_ID),
  issue(MOCK_ISSUE_3_ID, 3, "ログ保存", "todo", "none", MOCK_KENTA_USER_ID),
];

function chatSession(input: {
  id: string;
  agentId: string;
  creatorId: string;
  title: string;
}): ChatSession {
  return {
    id: input.id,
    workspace_id: MOCK_WORKSPACE_ID,
    agent_id: input.agentId,
    creator_id: input.creatorId,
    project_id: null,
    title: input.title,
    status: "active",
    has_unread: false,
    unread_count: 0,
    last_message: null,
    pinned: false,
    created_at: NOW,
    updated_at: NOW,
  };
}

export const MOCK_CHAT_SESSION: ChatSession = chatSession({
  id: MOCK_CHAT_SESSION_ID,
  agentId: MOCK_AGENT_ID,
  creatorId: MOCK_USER_ID,
  title: "DALE-1 ログイン文言の修正",
});

export const MOCK_KENTA_CHAT_SESSION: ChatSession = chatSession({
  id: MOCK_KENTA_CHAT_SESSION_ID,
  agentId: MOCK_CODEX_AGENT_ID,
  creatorId: MOCK_KENTA_USER_ID,
  title: "DALE-2 検索の空状態",
});

export const MOCK_CHAT_SESSIONS: ChatSession[] = [
  MOCK_CHAT_SESSION,
  MOCK_KENTA_CHAT_SESSION,
];

export const MOCK_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: "00000000-0000-4000-8000-000000000061",
    chat_session_id: MOCK_CHAT_SESSION_ID,
    role: "user",
    content: "ログイン画面の「サインイン」を「入る」にしたい。",
    task_id: null,
    created_at: "2026-08-01T01:04:00.000Z",
  },
];

function channelMessage(input: {
  id: string;
  channelId: string;
  author: User;
  body: string;
  createdAt: string;
}): ChannelMessage {
  return {
    id: input.id,
    channel_id: input.channelId,
    author_id: input.author.id,
    author_name: input.author.name,
    author_kind: "member",
    body: input.body,
    created_at: input.createdAt,
    promoted_session_id: null,
  };
}

export const MOCK_CHANNELS: HumanChannel[] = [
  {
    id: MOCK_CHANNEL_GENERAL_ID,
    workspace_id: MOCK_WORKSPACE_ID,
    slug: "general",
    name: "general",
    topic: "チーム全体",
    messages: [
      channelMessage({
        id: "00000000-0000-4000-8000-000000000221",
        channelId: MOCK_CHANNEL_GENERAL_ID,
        author: MOCK_USER,
        body: "Dale実験のチャンネルです。実装の話は #開発 へ。",
        createdAt: "2026-08-01T00:30:00.000Z",
      }),
    ],
  },
  {
    id: MOCK_CHANNEL_DEV_ID,
    workspace_id: MOCK_WORKSPACE_ID,
    slug: "dev",
    name: "開発",
    topic: "実装の話",
    messages: [
      channelMessage({
        id: MOCK_CHANNEL_MSG_1_ID,
        channelId: MOCK_CHANNEL_DEV_ID,
        author: MOCK_USER,
        body: "ログイン画面の「サインイン」を「入る」にしたい。",
        createdAt: "2026-08-01T01:04:00.000Z",
      }),
      channelMessage({
        id: MOCK_CHANNEL_MSG_2_ID,
        channelId: MOCK_CHANNEL_DEV_ID,
        author: MOCK_KENTA_USER,
        body: "ログ保存、Issue 切った。DALE-3。",
        createdAt: "2026-08-01T01:11:00.000Z",
      }),
      channelMessage({
        id: MOCK_CHANNEL_MSG_3_ID,
        channelId: MOCK_CHANNEL_DEV_ID,
        author: MOCK_YUI_USER,
        body: "それ、作業チャットにした方が早い。",
        createdAt: "2026-08-01T01:13:00.000Z",
      }),
    ],
  },
  {
    id: MOCK_CHANNEL_CHAT_ID,
    workspace_id: MOCK_WORKSPACE_ID,
    slug: "random",
    name: "雑談",
    topic: "雑談",
    messages: [
      channelMessage({
        id: "00000000-0000-4000-8000-000000000231",
        channelId: MOCK_CHANNEL_CHAT_ID,
        author: MOCK_YUI_USER,
        body: "今日のランチどうする。",
        createdAt: "2026-08-01T02:00:00.000Z",
      }),
    ],
  },
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
  feature_flags: { team_workspace: true },
  server_version: "mock",
};
