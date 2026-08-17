import type { Issue } from "../../types";
import {
  MOCK_AGENT,
  MOCK_APP_CONFIG,
  MOCK_CHAT_SESSION,
  MOCK_ISSUES,
  MOCK_MEMBER,
  MOCK_RUNTIME,
  MOCK_USER,
  MOCK_WORKSPACE,
  MOCK_WORKSPACE_ID,
} from "./fixtures";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface MockState {
  user: typeof MOCK_USER;
  issues: Issue[];
  nextIssueNumber: number;
}

function cloneIssues(): Issue[] {
  return MOCK_ISSUES.map((item) => ({ ...item, metadata: { ...item.metadata }, properties: { ...item.properties } }));
}

function createState(): MockState {
  return {
    user: { ...MOCK_USER },
    issues: cloneIssues(),
    nextIssueNumber: MOCK_ISSUES.length + 1,
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
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
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

function createIssueFromBody(body: unknown): Issue {
  const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const number = state.nextIssueNumber;
  state.nextIssueNumber += 1;
  const created: Issue = {
    id: `00000000-0000-4000-8000-${String(100000 + number).padStart(12, "0")}`,
    workspace_id: MOCK_WORKSPACE_ID,
    number,
    identifier: `DIO-${number}`,
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  state.issues = [created, ...state.issues];
  return created;
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

function resolveMockBody(method: string, pathname: string, body: unknown): { status: number; body: unknown } {
  if (pathname === "/api/me" && method === "GET") {
    return { status: 200, body: state.user };
  }
  if (pathname === "/api/me" && (method === "PATCH" || method === "PUT")) {
    const patch = (body && typeof body === "object" ? body : {}) as Partial<typeof MOCK_USER>;
    state.user = { ...state.user, ...patch, updated_at: new Date().toISOString() };
    return { status: 200, body: state.user };
  }
  if (pathname.startsWith("/api/me/onboarding") && (method === "POST" || method === "PATCH")) {
    state.user = { ...state.user, onboarded_at: state.user.onboarded_at ?? new Date().toISOString() };
    return { status: 200, body: state.user };
  }

  if (pathname === "/api/config" && method === "GET") {
    return { status: 200, body: MOCK_APP_CONFIG };
  }

  if (pathname === "/api/workspaces" && method === "GET") {
    return { status: 200, body: [MOCK_WORKSPACE] };
  }
  if (pathname === `/api/workspaces/${MOCK_WORKSPACE_ID}` && method === "GET") {
    return { status: 200, body: MOCK_WORKSPACE };
  }
  if (pathname === `/api/workspaces/${MOCK_WORKSPACE_ID}/members` && method === "GET") {
    return { status: 200, body: [MOCK_MEMBER] };
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
      const patch = (body && typeof body === "object" ? body : {}) as Partial<Issue>;
      Object.assign(issue, patch, { updated_at: new Date().toISOString() });
      return { status: 200, body: issue };
    }
    if (method === "DELETE") {
      state.issues = state.issues.filter((item) => item.id !== issue?.id);
      return { status: 204, body: undefined };
    }
  }

  if (pathname === "/api/agents" || pathname.startsWith("/api/agents?")) {
    return { status: 200, body: [MOCK_AGENT] };
  }
  if (pathname === `/api/agents/${MOCK_AGENT.id}` && method === "GET") {
    return { status: 200, body: MOCK_AGENT };
  }

  if (pathname === "/api/runtimes" || pathname.startsWith("/api/runtimes?")) {
    return { status: 200, body: [MOCK_RUNTIME] };
  }

  if (pathname === "/api/chat/sessions" || pathname.startsWith("/api/chat/sessions?")) {
    if (method === "GET") return { status: 200, body: [MOCK_CHAT_SESSION] };
    if (method === "POST") {
      const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
      return {
        status: 200,
        body: {
          ...MOCK_CHAT_SESSION,
          id: `00000000-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, "0")}`,
          title: typeof data.title === "string" ? data.title : "New chat",
          agent_id: typeof data.agent_id === "string" ? data.agent_id : MOCK_AGENT.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };
    }
  }
  if (pathname === `/api/chat/sessions/${MOCK_CHAT_SESSION.id}` && method === "GET") {
    return { status: 200, body: MOCK_CHAT_SESSION };
  }
  if (pathname.startsWith("/api/chat/sessions/") && pathname.endsWith("/messages") && method === "GET") {
    return { status: 200, body: [] };
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
