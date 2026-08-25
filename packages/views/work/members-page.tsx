"use client";

import { useQuery } from "@tanstack/react-query";
import { useCurrentWorkspace, useWorkspacePaths } from "@multica/core/paths";
import { memberListOptions } from "@multica/core/workspace/queries";
import { ActorAvatar } from "@multica/ui/components/common/actor-avatar";
import { PageHeader } from "../layout/page-header";
import { AppLink } from "../navigation";
import { useT } from "../i18n";

export function MembersPage() {
  const { t } = useT("work");
  const workspace = useCurrentWorkspace();
  const p = useWorkspacePaths();
  const { data: members = [] } = useQuery(memberListOptions(workspace?.id ?? ""));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader>
        <div className="min-w-0">
          <h1 className="text-title font-medium">{t(($) => $.members_title)}</h1>
          <p className="text-caption text-muted-foreground">{t(($) => $.members_hint)}</p>
        </div>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <ul className="mx-auto flex max-w-xl flex-col gap-1">
          {members.map((member) => (
            <li key={member.id}>
              <AppLink
                href={p.memberDetail(member.user_id)}
                className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-hover"
              >
                <ActorAvatar
                  name={member.name}
                  initials={member.name.slice(0, 1)}
                  avatarUrl={member.avatar_url}
                  size="sm"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{member.name}</span>
                  <span className="block text-caption text-muted-foreground">
                    {member.role === "owner"
                      ? t(($) => $.role_owner)
                      : member.role === "admin"
                        ? t(($) => $.role_admin)
                        : t(($) => $.role_member)}
                  </span>
                </span>
              </AppLink>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
