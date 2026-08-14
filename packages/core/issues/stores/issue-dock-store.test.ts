// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ISSUE_DOCK_PROPERTIES_PANE_ID, useIssueDockStore } from "./issue-dock-store";

beforeAll(() => {
  if (typeof globalThis.localStorage?.setItem !== "function") {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (k) => values.get(k) ?? null,
      key: (i) => Array.from(values.keys())[i] ?? null,
      removeItem: (k) => { values.delete(k); },
      setItem: (k, v) => { values.set(k, v); },
    };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  }
});

describe("issue dock store", () => {
  beforeEach(() => {
    useIssueDockStore.setState({ byIssue: {} });
  });

  it("defaults to the properties pane", () => {
    expect(useIssueDockStore.getState().activePaneId("issue-1")).toBe(ISSUE_DOCK_PROPERTIES_PANE_ID);
  });

  it("remembers the active pane id without storing session rows", () => {
    useIssueDockStore.getState().setActivePane("issue-1", "session-1");
    expect(useIssueDockStore.getState().activePaneId("issue-1")).toBe("session-1");
    expect(useIssueDockStore.getState().byIssue["issue-1"]).toEqual({ activePaneId: "session-1" });
  });
});
