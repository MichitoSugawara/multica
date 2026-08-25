"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { mockPersonaOptions, useCreateWork } from "@multica/core/channels";
import { useAuthStore } from "@multica/core/auth";
import { useCurrentWorkspace, useWorkspacePaths } from "@multica/core/paths";
import { runtimeDisplayName, runtimeListOptions } from "@multica/core/runtimes";
import { agentListOptions, memberListOptions } from "@multica/core/workspace/queries";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@multica/ui/components/ui/radio-group";
import { PageHeader } from "../layout/page-header";
import { useNavigation } from "../navigation";
import { useT } from "../i18n";
import type { AgentRuntime, WorkConnection } from "@multica/core/types";

function machineBlocked(runtime: AgentRuntime, userId: string | undefined, role: string): boolean {
  if (runtime.visibility === "public") return false;
  if (!userId) return false;
  if (runtime.owner_id === userId) return false;
  return role !== "admin";
}

export function NewWorkPage() {
  const { t } = useT("work");
  const { push } = useNavigation();
  const userId = useAuthStore((s) => s.user?.id);
  const workspace = useCurrentWorkspace();
  const p = useWorkspacePaths();
  const wsId = workspace?.id ?? "";
  const { data: persona } = useQuery(mockPersonaOptions());
  const { data: runtimes = [] } = useQuery(runtimeListOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const createWork = useCreateWork(wsId);
  const role = persona?.role === "member" ? "member" : "admin";

  const defaultRuntime = useMemo(
    () => runtimes.find((item) => item.status === "online" && !machineBlocked(item, userId, role)) ?? runtimes[0],
    [runtimes, userId, role],
  );
  const [title, setTitle] = useState("");
  const [runtimeId, setRuntimeId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [connection, setConnection] = useState<WorkConnection>("direct");
  const [assigneeId, setAssigneeId] = useState("");

  const selectedRuntimeId = runtimeId || defaultRuntime?.id || "";
  const selectedAgentId = agentId || agents[0]?.id || "";
  const selectedRuntime = runtimes.find((item) => item.id === selectedRuntimeId);
  const blocked = selectedRuntime ? machineBlocked(selectedRuntime, userId, role) : false;
  const sharedSelected = selectedRuntime?.visibility === "public";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader>
        <div className="min-w-0">
          <h1 className="text-title font-medium">{t(($) => $.new_work)}</h1>
          <p className="text-caption text-muted-foreground">{t(($) => $.new_work_hint)}</p>
        </div>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <form
          className="mx-auto flex max-w-xl flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedAgentId || !selectedRuntimeId || blocked) return;
            createWork.mutate(
              {
                title: title.trim(),
                agent_id: selectedAgentId,
                runtime_id: selectedRuntimeId,
                connection,
                assigned_member_id: sharedSelected && role === "admin" ? assigneeId || null : null,
              },
              {
                onSuccess: (result) => {
                  if (result.session.id) push(p.chatSession(result.session.id));
                },
              },
            );
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-caption font-medium">{t(($) => $.title_label)}</span>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t(($) => $.title_placeholder)}
              autoFocus
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-caption font-medium">{t(($) => $.machine)}</legend>
            <RadioGroup value={selectedRuntimeId} onValueChange={setRuntimeId} className="gap-1">
              {runtimes.map((runtime) => {
                const forbidden = machineBlocked(runtime, userId, role);
                return (
                  <label
                    key={runtime.id}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-hover has-disabled:cursor-not-allowed has-disabled:opacity-60"
                  >
                    <RadioGroupItem value={runtime.id} disabled={forbidden} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{runtimeDisplayName(runtime)}</span>
                        <span className="text-caption text-muted-foreground">
                          {runtime.status === "online" ? t(($) => $.online) : t(($) => $.offline)}
                        </span>
                      </span>
                      <span className="block text-caption text-muted-foreground">
                        {forbidden ? t(($) => $.personal_blocked) : runtime.device_info}
                      </span>
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
            {sharedSelected && role === "admin" ? (
              <label className="flex flex-col gap-1.5 pl-7">
                <span className="text-caption font-medium">{t(($) => $.assign)}</span>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-body"
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                >
                  <option value="">{t(($) => $.unassigned)}</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.user_id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-caption font-medium">{t(($) => $.ai)}</legend>
            <RadioGroup value={selectedAgentId} onValueChange={setAgentId} className="gap-1">
              {agents.map((agent) => (
                <label
                  key={agent.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-hover"
                >
                  <RadioGroupItem value={agent.id} />
                  <span className="font-medium">{agent.name}</span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-caption font-medium">
              {t(($) => $.connection)}
              <span className="ml-2 font-normal text-muted-foreground">{t(($) => $.connection_hint)}</span>
            </legend>
            <RadioGroup
              value={connection}
              onValueChange={(value) => setConnection(value === "proxy" ? "proxy" : "direct")}
              className="gap-1"
            >
              <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-hover">
                <RadioGroupItem value="direct" className="mt-0.5" />
                <span>
                  <span className="font-medium">{t(($) => $.direct)}</span>
                  <span className="block text-caption text-muted-foreground">{t(($) => $.direct_help)}</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-hover">
                <RadioGroupItem value="proxy" className="mt-0.5" />
                <span>
                  <span className="font-medium">{t(($) => $.proxy)}</span>
                  <span className="block text-caption text-muted-foreground">{t(($) => $.proxy_help)}</span>
                </span>
              </label>
            </RadioGroup>
          </fieldset>

          <Button type="submit" disabled={createWork.isPending || blocked || !selectedRuntimeId}>
            {t(($) => $.start)}
          </Button>
        </form>
      </div>
    </div>
  );
}
