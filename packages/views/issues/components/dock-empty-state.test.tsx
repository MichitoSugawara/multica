// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@multica/core/i18n/react";
import type { RuntimeDevice } from "@multica/core/types";
import enCommon from "../../locales/en/common.json";
import enIssues from "../../locales/en/issues.json";
import { DockConnectingState, DockEmptyState } from "./dock-empty-state";
import { sessionBlockReason } from "./dock-terminal-pane";

const TEST_RESOURCES = { en: { common: enCommon, issues: enIssues } };

function renderEmpty(code: string) {
  return render(
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      <DockEmptyState code={code} />
    </I18nProvider>,
  );
}

describe("DockEmptyState", () => {
  it("explains a missing machine", () => {
    renderEmpty("no_runtime");
    expect(screen.getByText("No machine connected")).toBeInTheDocument();
    expect(
      screen.getByText(/Connect a computer in Runtimes/),
    ).toBeInTheDocument();
  });

  it("explains an offline machine", () => {
    renderEmpty("runtime_offline");
    expect(screen.getByText("Machine offline")).toBeInTheDocument();
  });

  it("explains a daemon that is too old", () => {
    renderEmpty("daemon_outdated");
    expect(screen.getByText("Daemon too old")).toBeInTheDocument();
  });

  it("explains Windows PTY as unsupported", () => {
    renderEmpty("unsupported_os");
    expect(screen.getByText("Not supported")).toBeInTheDocument();
    expect(screen.getByText(/Windows/)).toBeInTheDocument();
  });

  it("explains a missing Chrome install", () => {
    renderEmpty("chrome_missing");
    expect(screen.getByText("Chrome not installed")).toBeInTheDocument();
  });

  it("explains a session limit", () => {
    renderEmpty("limit_reached");
    expect(screen.getByText("Too many sessions")).toBeInTheDocument();
  });
});

describe("DockConnectingState", () => {
  it("shows connecting copy for a first attach", () => {
    render(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <DockConnectingState reconnecting={false} />
      </I18nProvider>,
    );
    expect(screen.getByText("Connecting")).toBeInTheDocument();
  });

  it("shows reconnecting copy after a drop, not an empty state", () => {
    render(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <DockConnectingState reconnecting />
      </I18nProvider>,
    );
    expect(screen.getByText("Reconnecting")).toBeInTheDocument();
    expect(screen.getByText(/Waiting for the machine/)).toBeInTheDocument();
  });
});

describe("sessionBlockReason", () => {
  const pane = { daemonId: null, runtimeId: null };
  const bound = { daemonId: "daemon-1", runtimeId: "rt-1" };
  const online = { id: "rt-1", status: "online" } as RuntimeDevice;
  const offline = { id: "rt-1", status: "offline" } as RuntimeDevice;

  it("requires a selected machine", () => {
    expect(sessionBlockReason(pane, null)).toBe("no_runtime");
  });

  it("does not block attach when a session already has a machine", () => {
    expect(sessionBlockReason(bound, null)).toBeNull();
    expect(sessionBlockReason(bound, offline)).toBeNull();
  });

  it("allows a selected online machine", () => {
    expect(sessionBlockReason(bound, online)).toBeNull();
  });
});
