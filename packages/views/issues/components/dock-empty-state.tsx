"use client";

import { useT } from "../../i18n";
import type { RuntimeSessionErrorCode } from "@multica/core/issues/runtime-session";

export function DockEmptyState({
  code,
}: {
  code: RuntimeSessionErrorCode | string;
}) {
  const { t } = useT("issues");
  const copy = emptyCopy(code, t);
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-1.5 px-4 text-center">
      <p className="text-body font-medium text-foreground">{copy.title}</p>
      <p className="text-caption text-muted-foreground">{copy.body}</p>
    </div>
  );
}

export function DockConnectingState({ reconnecting }: { reconnecting: boolean }) {
  const { t } = useT("issues");
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-background/80 px-4 text-center">
      <p className="text-body font-medium text-foreground">
        {reconnecting
          ? t(($) => $.detail.session_reconnecting_title)
          : t(($) => $.detail.session_connecting_title)}
      </p>
      <p className="text-caption text-muted-foreground">
        {reconnecting
          ? t(($) => $.detail.session_reconnecting)
          : t(($) => $.detail.session_connecting)}
      </p>
    </div>
  );
}

function emptyCopy(
  code: string,
  t: ReturnType<typeof useT<"issues">>["t"],
): { title: string; body: string } {
  switch (code) {
    case "no_runtime":
      return {
        title: t(($) => $.detail.session_no_runtime_title),
        body: t(($) => $.detail.session_no_runtime),
      };
    case "runtime_offline":
      return {
        title: t(($) => $.detail.session_runtime_offline_title),
        body: t(($) => $.detail.session_runtime_offline),
      };
    case "daemon_outdated":
      return {
        title: t(($) => $.detail.session_daemon_outdated_title),
        body: t(($) => $.detail.session_daemon_outdated),
      };
    case "unsupported_os":
      return {
        title: t(($) => $.detail.session_unsupported_os_title),
        body: t(($) => $.detail.session_unsupported_os),
      };
    case "chrome_missing":
      return {
        title: t(($) => $.detail.session_chrome_missing_title),
        body: t(($) => $.detail.session_chrome_missing),
      };
    case "forbidden":
      return {
        title: t(($) => $.detail.session_forbidden_title),
        body: t(($) => $.detail.session_forbidden),
      };
    case "limit_reached":
      return {
        title: t(($) => $.detail.session_limit_title),
        body: t(($) => $.detail.session_limit),
      };
    default:
      return {
        title: t(($) => $.detail.session_open_failed_title),
        body: t(($) => $.detail.session_open_failed),
      };
  }
}
