/**
 * Frontend UI mock — no Go API, DB, tunnel, or real login.
 *
 * Start the web app with `pnpm mock` (sets NEXT_PUBLIC_MOCK=1).
 * Core never reads process.env; the host app passes `mock: true` into CoreProvider.
 */
import { ApiClient, type ApiClientOptions } from "../client";
import { createMockFetch } from "./fetch";

export {
  MOCK_AGENT,
  MOCK_AGENT_ID,
  MOCK_AGENTS,
  MOCK_APP_CONFIG,
  MOCK_CHANNEL_DEV_ID,
  MOCK_CHANNEL_MSG_1_ID,
  MOCK_CHANNELS,
  MOCK_CHAT_SESSION,
  MOCK_CHAT_SESSION_ID,
  MOCK_CODEX_AGENT_ID,
  MOCK_ISSUES,
  MOCK_ISSUE_1_ID,
  MOCK_ISSUE_2_ID,
  MOCK_ISSUE_3_ID,
  MOCK_KENTA_CHAT_SESSION_ID,
  MOCK_KENTA_RUNTIME_ID,
  MOCK_KENTA_USER_ID,
  MOCK_MEMBER,
  MOCK_MEMBER_ID,
  MOCK_MEMBERS,
  MOCK_RUNTIME,
  MOCK_RUNTIME_ID,
  MOCK_RUNTIMES,
  MOCK_SHARED_RUNTIME_ID,
  MOCK_USER,
  MOCK_USER_EMAIL,
  MOCK_USER_ID,
  MOCK_USER_NAME,
  MOCK_WORKSPACE,
  MOCK_WORKSPACE_ID,
  MOCK_WORKSPACE_NAME,
  MOCK_WORKSPACE_SLUG,
} from "./fixtures";
export { createMockFetch, resetMockState } from "./fetch";
export type { FetchLike } from "./fetch";

/** ApiClient that answers from in-memory fixtures and never calls the network. */
export function createMockApiClient(
  baseUrl = "",
  options: Omit<ApiClientOptions, "fetch"> = {},
): ApiClient {
  return new ApiClient(baseUrl, { ...options, fetch: createMockFetch() });
}
