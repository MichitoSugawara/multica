import type {
  Agent,
  AgentRuntime,
  ChannelMessage,
  ChatMessage,
  ChatSession,
  HumanChannel,
  Issue,
  MemberWithUser,
  MockPersonaRole,
  WorkConnection,
  WorkLaunch,
} from "../../types";
import {
  MOCK_AGENT,
  MOCK_AGENTS,
  MOCK_APP_CONFIG,
  MOCK_CHANNELS,
  MOCK_CHAT_MESSAGES,
  MOCK_CHAT_SESSIONS,
  MOCK_ISSUES,
  MOCK_ISSUE_PREFIX,
  MOCK_KENTA_RUNTIME_ID,
  MOCK_MEMBERS,
  MOCK_RUNTIMES,
  MOCK_SHARED_RUNTIME_ID,
  MOCK_USER,
  MOCK_USER_ID,
  MOCK_WORKSPACE,
  MOCK_WORKSPACE_ID,
} from "./fixtures";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface MockState {
  user: typeof MOCK_USER;
  role: MockPersonaRole;
  issues: Issue[];
  nextIssueNumber: number;
  sessions: ChatSession[];
  messages: ChatMessage[];
  channels: HumanChannel[];
  agents: Agent[];
  runtimes: AgentRuntime[];
  members: MemberWithUser[];
  sharedAssigneeId: string | null;
  launches: Record<string, WorkLaunch>;
}

function cloneIssues(): Issue[] {
  return MOCK_ISSUES.map((item) => ({
    ...item,
    metadata: { ...item.metadata },
    properties: { ...item.properties },
  }));
}

function cloneChannels(): HumanChannel[] {
  return MOCK_CHANNELS.map((channel) => ({
    ...channel,
    messages: channel.messages.map((message) => ({ ...message })),
  }));
}

function createState(): MockState {
  return {
    user: { ...MOCK_USER },
    role: "admin",
    issues: cloneIssues(),
    nextIssueNumber: MOCK_ISSUES.length + 1,
    sessions: MOCK_CHAT_SESSIONS.map((item) => ({ ...item })),
    messages: MOCK_CHAT_MESSAGES.map((item) => ({ ...item })),
    channels: cloneChannels(),
    agents: MOCK_AGENTS.map((item) => ({
      ...item,
      runtime_config: { ...item.runtime_config },
      custom_args: [...item.custom_args],
      invocation_targets: item.invocation_targets.map((target) => ({ ...target })),
    })),
    runtimes: MOCK_RUNTIMES.map((item) => ({
      ...item,
      metadata: { ...item.metadata },
    })),
    members: MOCK_MEMBERS.map((item) => ({ ...item })),
    sharedAssigneeId: null,
    launches: {},
  };
}

let state = createState();

/** Restore in-memory fixtures. Tests should call this in afterEach. */
export function resetMockState(): void {
  state = createState();
}

function jsonResponse(body: unknown, status = 200): Response {
  if (status === 204) {
    return new Response(null, { status });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseUrl(input: RequestInfo | URL): { pathname: string; search: URLSearchParams } {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  try {
    const url = new URL(raw, "http://mock.local");
    return { pathname: url.pathname, search: url.searchParams };
  } catch {
    const [pathname = raw, query = ""] = raw.split("?");
    return { pathname, search: new URLSearchParams(query) };
  }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input !== "string" && !(input instanceof URL) && input.method) {
    return input.method.toUpperCase();
  }
  return "GET";
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const raw =
    init?.body ??
    (typeof input !== "string" && !(input instanceof URL) ? input.body : undefined);
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function looksLikeId(segment: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment)
  );
}

function fallbackBody(method: string, pathname: string): unknown {
  if (method === "DELETE") return undefined;
  if (method !== "GET") return {};
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  if (looksLikeId(last)) return {};
  return [];
}

function findIssue(id: string): Issue | undefined {
  return state.issues.find((item) => item.id === id || item.identifier === id);
}

function nextId(seed: number): string {
  return `00000000-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function currentMemberRole(): MemberWithUser["role"] {
  return state.role === "admin" ? "owner" : "member";
}

function visibleRuntimes(): AgentRuntime[] {
  if (state.role === "admin") return state.runtimes;
  return state.runtimes.filter((runtime) => {
    if (runtime.visibility === "public") return true;
    return runtime.owner_id === MOCK_USER_ID;
  });
}

function visibleSessions(): ChatSession[] {
  if (state.role === "admin") return state.sessions;
  return state.sessions.filter((session) => session.creator_id === MOCK_USER_ID);
}

function createIssueFromBody(body: unknown): Issue {
  const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const number = state.nextIssueNumber;
  state.nextIssueNumber += 1;
  const created: Issue = {
    id: nextId(100000 + number),
    workspace_id: MOCK_WORKSPACE_ID,
    number,
    identifier: `${MOCK_ISSUE_PREFIX}-${number}`,
    title: typeof data.title === "string" && data.title ? data.title : "Untitled",
    description: typeof data.description === "string" ? data.description : null,
    status: typeof data.status === "string" ? (data.status as Issue["status"]) : "todo",
    priority: typeof data.priority === "string" ? (data.priority as Issue["priority"]) : "none",
    assignee_type: typeof data.assignee_type === "string" ? (data.assignee_type as Issue["assignee_type"]) : null,
    assignee_id: typeof data.assignee_id === "string" ? data.assignee_id : null,
    creator_type: "member",
    creator_id: MOCK_USER.id,
    parent_issue_id: typeof data.parent_issue_id === "string" ? data.parent_issue_id : null,
    project_id: typeof data.project_id === "string" ? data.project_id : null,
    position: number,
    stage: typeof data.stage === "number" ? data.stage : null,
    start_date: typeof data.start_date === "string" ? data.start_date : null,
    due_date: typeof data.due_date === "string" ? data.due_date : null,
    metadata: {},
    properties: {},
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  state.issues = [created, ...state.issues];
  return created;
}

function createSession(input: {
  title: string;
  agentId: string;
  creatorId?: string;
}): ChatSession {
  const created: ChatSession = {
    id: nextId(200000 + state.sessions.length + Date.now() % 1000),
    workspace_id: MOCK_WORKSPACE_ID,
    agent_id: input.agentId,
    creator_id: input.creatorId ?? MOCK_USER.id,
    project_id: null,
    title: input.title,
    status: "active",
    has_unread: false,
    unread_count: 0,
    last_message: null,
    pinned: false,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  state.sessions = [created, ...state.sessions];
  return created;
}

function addUserMessage(sessionId: string, content: string): ChatMessage {
  const message: ChatMessage = {
    id: nextId(300000 + state.messages.length + Date.now() % 1000),
    chat_session_id: sessionId,
    role: "user",
    content,
    task_id: null,
    created_at: nowIso(),
  };
  state.messages = [...state.messages, message];
  const session = state.sessions.find((item) => item.id === sessionId);
  if (session) {
    session.last_message = {
      content,
      role: "user",
      created_at: message.created_at,
    };
    session.updated_at = message.created_at;
  }
  return message;
}

function canUseRuntime(runtime: AgentRuntime): boolean {
  if (runtime.visibility === "public") return true;
  if (runtime.owner_id === MOCK_USER_ID) return true;
  return state.role === "admin";
}

function launchWork(input: {
  title: string;
  agentId?: string;
  runtimeId?: string;
  connection?: WorkConnection;
  assignedMemberId?: string | null;
  seedMessage?: string;
}): { issue: Issue; session: ChatSession; launch: WorkLaunch } {
  const agentId = input.agentId && state.agents.some((agent) => agent.id === input.agentId)
    ? input.agentId
    : MOCK_AGENT.id;
  const runtime =
    state.runtimes.find((item) => item.id === input.runtimeId) ??
    state.runtimes.find((item) => item.id !== MOCK_KENTA_RUNTIME_ID && item.status === "online") ??
    state.runtimes[0];
  if (!runtime || !canUseRuntime(runtime)) {
    throw new Error("runtime_forbidden");
  }
  const issue = createIssueFromBody({
    title: input.title,
    status: "in_progress",
    assignee_id: MOCK_USER_ID,
    assignee_type: "member",
  });
  const session = createSession({
    title: `${issue.identifier} ${issue.title}`,
    agentId,
  });
  if (input.seedMessage) {
    addUserMessage(session.id, input.seedMessage);
  }
  if (runtime.id === MOCK_SHARED_RUNTIME_ID && input.assignedMemberId) {
    state.sharedAssigneeId = input.assignedMemberId;
  }
  const launch: WorkLaunch = {
    issue_id: issue.id,
    session_id: session.id,
    runtime_id: runtime.id,
    connection: input.connection === "proxy" ? "proxy" : "direct",
    assigned_member_id:
      runtime.id === MOCK_SHARED_RUNTIME_ID
        ? (input.assignedMemberId ?? state.sharedAssigneeId)
        : null,
  };
  state.launches[session.id] = launch;
  return { issue, session, launch };
}

function issuesList(): { issues: Issue[]; total: number } {
  return { issues: state.issues, total: state.issues.length };
}

function tableRows(): Record<string, unknown> {
  return {
    query_fingerprint: "mock",
    group_key: null,
    parent_id: null,
    total: state.issues.length,
    rows: state.issues.map((item) => ({ issue: item, direct_child_count: 0 })),
    branch_total: state.issues.length,
    next_cursor: null,
  };
}

function channelSummaries(): Array<Omit<HumanChannel, "messages"> & { message_count: number }> {
  return state.channels.map(({ messages, ...channel }) => ({
    ...channel,
    message_count: messages.length,
  }));
}

function findChannel(idOrSlug: string): HumanChannel | undefined {
  return state.channels.find(
    (channel) => channel.id === idOrSlug || channel.slug === idOrSlug,
  );
}

function findMessage(channel: HumanChannel, messageId: string): ChannelMessage | undefined {
  return channel.messages.find((message) => message.id === messageId);
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function resolveMockBody(method: string, pathname: string, body: unknown): { status: number; body: unknown } {
  if (pathname === "/api/me" && method === "GET") {
    return { status: 200, body: state.user };
  }
  if (pathname === "/api/me" && (method === "PATCH" || method === "PUT")) {
    const patch = asRecord(body) as Partial<typeof MOCK_USER>;
    state.user = { ...state.user, ...patch, updated_at: nowIso() };
    return { status: 200, body: state.user };
  }
  if (pathname.startsWith("/api/me/onboarding") && (method === "POST" || method === "PATCH")) {
    state.user = { ...state.user, onboarded_at: state.user.onboarded_at ?? nowIso() };
    return { status: 200, body: state.user };
  }

  if (pathname === "/api/config" && method === "GET") {
    return { status: 200, body: MOCK_APP_CONFIG };
  }

  if (pathname === "/api/mock/persona" && method === "GET") {
    return { status: 200, body: { role: state.role } };
  }
  if (pathname === "/api/mock/persona" && method === "PATCH") {
    const role = asRecord(body).role;
    if (role === "admin" || role === "member") {
      state.role = role;
      const current = state.members.find((item) => item.user_id === MOCK_USER_ID);
      if (current) current.role = currentMemberRole();
    }
    return { status: 200, body: { role: state.role } };
  }

  if (pathname === "/api/workspaces" && method === "GET") {
    return { status: 200, body: [MOCK_WORKSPACE] };
  }
  if (pathname === `/api/workspaces/${MOCK_WORKSPACE_ID}` && method === "GET") {
    return { status: 200, body: MOCK_WORKSPACE };
  }
  if (pathname === `/api/workspaces/${MOCK_WORKSPACE_ID}/members` && method === "GET") {
    return {
      status: 200,
      body: state.members.map((item) =>
        item.user_id === MOCK_USER_ID ? { ...item, role: currentMemberRole() } : item,
      ),
    };
  }
  if (pathname === `/api/workspaces/${MOCK_WORKSPACE_ID}/runtime-profiles` && method === "GET") {
    return { status: 200, body: { runtime_profiles: [] } };
  }

  if (pathname === "/api/invitations" && method === "GET") {
    return { status: 200, body: [] };
  }

  if (pathname === "/api/issues" && method === "GET") {
    return { status: 200, body: issuesList() };
  }
  if (pathname === "/api/issues" && method === "POST") {
    return { status: 200, body: createIssueFromBody(body) };
  }
  if (pathname === "/api/issues/query" && method === "POST") {
    return { status: 200, body: issuesList() };
  }
  if (pathname === "/api/issues/search" && method === "GET") {
    return { status: 200, body: issuesList() };
  }
  if (pathname === "/api/issues/table/groups" && method === "POST") {
    return {
      status: 200,
      body: {
        query_fingerprint: "mock",
        total: state.issues.length,
        groups: [],
        next_cursor: null,
      },
    };
  }
  if (pathname === "/api/issues/table/rows" && method === "POST") {
    return { status: 200, body: tableRows() };
  }
  if (pathname === "/api/issues/table/facets" && method === "POST") {
    return {
      status: 200,
      body: { query_fingerprint: "mock", total: state.issues.length, facets: [] },
    };
  }

  const issueMatch = pathname.match(/^\/api\/issues\/([^/]+)$/);
  if (issueMatch) {
    const issue = findIssue(decodeURIComponent(issueMatch[1] ?? ""));
    if (method === "GET") {
      return { status: 200, body: issue ?? {} };
    }
    if (method === "PUT" || method === "PATCH") {
      if (!issue) return { status: 200, body: {} };
      const patch = asRecord(body) as Partial<Issue>;
      Object.assign(issue, patch, { updated_at: nowIso() });
      return { status: 200, body: issue };
    }
    if (method === "DELETE") {
      state.issues = state.issues.filter((item) => item.id !== issue?.id);
      return { status: 204, body: undefined };
    }
  }

  if (pathname === "/api/agents" || pathname.startsWith("/api/agents?")) {
    return { status: 200, body: state.agents };
  }
  const agentMatch = pathname.match(/^\/api\/agents\/([^/]+)$/);
  if (agentMatch && method === "GET") {
    const agent = state.agents.find((item) => item.id === agentMatch[1]);
    return { status: 200, body: agent ?? {} };
  }

  if (pathname === "/api/runtimes" || pathname.startsWith("/api/runtimes?")) {
    const runtimes = visibleRuntimes().map((item) =>
      item.id === MOCK_SHARED_RUNTIME_ID
        ? { ...item, metadata: { ...item.metadata, assigned_member_id: state.sharedAssigneeId } }
        : item,
    );
    return { status: 200, body: runtimes };
  }

  if (pathname === "/api/channels" && method === "GET") {
    return { status: 200, body: channelSummaries() };
  }
  const channelMatch = pathname.match(/^\/api\/channels\/([^/]+)$/);
  if (channelMatch && method === "GET") {
    const channel = findChannel(decodeURIComponent(channelMatch[1] ?? ""));
    return { status: 200, body: channel ?? {} };
  }
  const promoteMatch = pathname.match(/^\/api\/channels\/([^/]+)\/messages\/([^/]+)\/promote$/);
  if (promoteMatch && method === "POST") {
    const channel = findChannel(decodeURIComponent(promoteMatch[1] ?? ""));
    const message = channel ? findMessage(channel, decodeURIComponent(promoteMatch[2] ?? "")) : undefined;
    if (!channel || !message) {
      return { status: 404, body: { error: "not_found" } };
    }
    if (message.promoted_session_id) {
      const existing = state.sessions.find((item) => item.id === message.promoted_session_id);
      const issue = existing
        ? state.issues.find((item) => existing.title.startsWith(item.identifier))
        : undefined;
      return {
        status: 200,
        body: {
          issue: issue ?? null,
          session: existing ?? null,
          launch: existing ? state.launches[existing.id] ?? null : null,
        },
      };
    }
    const data = asRecord(body);
    try {
      const launched = launchWork({
        title: message.body.slice(0, 80),
        agentId: typeof data.agent_id === "string" ? data.agent_id : undefined,
        runtimeId: typeof data.runtime_id === "string" ? data.runtime_id : undefined,
        connection: data.connection === "proxy" ? "proxy" : "direct",
        seedMessage: message.body,
      });
      message.promoted_session_id = launched.session.id;
      return { status: 200, body: launched };
    } catch {
      return { status: 403, body: { error: "runtime_forbidden" } };
    }
  }

  if (pathname === "/api/work" && method === "POST") {
    const data = asRecord(body);
    const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "新しい作業";
    try {
      return {
        status: 200,
        body: launchWork({
          title,
          agentId: typeof data.agent_id === "string" ? data.agent_id : undefined,
          runtimeId: typeof data.runtime_id === "string" ? data.runtime_id : undefined,
          connection: data.connection === "proxy" ? "proxy" : "direct",
          assignedMemberId: typeof data.assigned_member_id === "string" ? data.assigned_member_id : null,
        }),
      };
    } catch {
      return { status: 403, body: { error: "runtime_forbidden" } };
    }
  }

  if (pathname === "/api/chat/sessions" || pathname.startsWith("/api/chat/sessions?")) {
    if (method === "GET") return { status: 200, body: visibleSessions() };
    if (method === "POST") {
      const data = asRecord(body);
      const session = createSession({
        title: typeof data.title === "string" ? data.title : "New chat",
        agentId: typeof data.agent_id === "string" ? data.agent_id : MOCK_AGENT.id,
      });
      return { status: 200, body: session };
    }
  }
  const sessionMatch = pathname.match(/^\/api\/chat\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    const session = state.sessions.find((item) => item.id === sessionMatch[1]);
    if (method === "GET") {
      if (session && state.role === "member" && session.creator_id !== MOCK_USER_ID) {
        return { status: 404, body: {} };
      }
      return { status: 200, body: session ?? {} };
    }
    if ((method === "PUT" || method === "PATCH") && session) {
      const patch = asRecord(body);
      if (typeof patch.title === "string") session.title = patch.title;
      session.updated_at = nowIso();
      return { status: 200, body: session };
    }
    if (method === "DELETE" && session) {
      state.sessions = state.sessions.filter((item) => item.id !== session.id);
      return { status: 204, body: undefined };
    }
  }
  const sessionMessages = pathname.match(/^\/api\/chat\/sessions\/([^/]+)\/messages$/);
  if (sessionMessages && method === "GET") {
    const sessionId = sessionMessages[1] ?? "";
    return {
      status: 200,
      body: state.messages.filter((item) => item.chat_session_id === sessionId),
    };
  }

  if (pathname === "/api/inbox" && method === "GET") {
    return { status: 200, body: [] };
  }
  if (pathname === "/api/inbox/unread-count" && method === "GET") {
    return { status: 200, body: { count: 0 } };
  }
  if (pathname === "/api/inbox/unread-summary" && method === "GET") {
    return { status: 200, body: [] };
  }
  if (pathname === "/api/inbox/archived" && method === "GET") {
    return { status: 200, body: [] };
  }
  if (pathname.startsWith("/api/inbox/") && method === "POST") {
    return { status: 200, body: { count: 0 } };
  }

  if (pathname === "/api/notification-preferences" && (method === "GET" || method === "PATCH")) {
    return { status: 200, body: { workspace_id: MOCK_WORKSPACE_ID, preferences: {} } };
  }

  if (pathname === "/api/projects" || pathname.startsWith("/api/projects?")) {
    return { status: 200, body: { projects: [], total: 0 } };
  }
  if (pathname === "/api/projects/search" && method === "GET") {
    return { status: 200, body: { projects: [], total: 0 } };
  }

  if (pathname === "/api/pins" || pathname.startsWith("/api/pins?")) {
    return { status: 200, body: [] };
  }
  if (pathname === "/api/issue-views" || pathname.startsWith("/api/issue-views?")) {
    return { status: 200, body: [] };
  }
  if (pathname === "/api/labels" || pathname.startsWith("/api/labels?")) {
    return { status: 200, body: { labels: [], total: 0 } };
  }
  if (pathname === "/api/properties" || pathname.startsWith("/api/properties?")) {
    return { status: 200, body: { properties: [], total: 0 } };
  }
  if (pathname === "/api/quick-actions" || pathname.startsWith("/api/quick-actions?")) {
    return { status: 200, body: { quick_actions: [], total: 0 } };
  }
  if (pathname === "/api/squads") {
    return { status: 200, body: [] };
  }
  if (pathname === "/api/autopilots" || pathname.startsWith("/api/autopilots?")) {
    return { status: 200, body: { autopilots: [], total: 0 } };
  }
  if (pathname === "/api/skills") {
    return { status: 200, body: [] };
  }
  if (pathname === "/api/working-agents") {
    return { status: 200, body: [] };
  }
  if (pathname === "/api/client-usage" && method === "POST") {
    return { status: 204, body: undefined };
  }

  if (pathname === "/auth/logout" && method === "POST") {
    return { status: 204, body: undefined };
  }
  if (pathname === "/auth/send-code" && method === "POST") {
    return { status: 204, body: undefined };
  }
  if ((pathname === "/auth/verify-code" || pathname === "/auth/google") && method === "POST") {
    return { status: 200, body: { token: "mock-token", user: state.user } };
  }

  const fallback = fallbackBody(method, pathname);
  return { status: method === "DELETE" ? 204 : 200, body: fallback };
}

/**
 * In-process fetch that never touches the network.
 * ApiClient methods keep their real parsing; this only supplies fixture JSON.
 */
export function createMockFetch(): FetchLike {
  return async (input, init) => {
    const { pathname } = parseUrl(input);
    const method = requestMethod(input, init);
    const body = await readBody(input, init);
    const result = resolveMockBody(method, pathname, body);
    return jsonResponse(result.body, result.status);
  };
}
