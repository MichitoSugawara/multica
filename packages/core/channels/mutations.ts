import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { chatKeys } from "../chat/queries";
import { issueKeys } from "../issues/queries";
import { runtimeKeys } from "../runtimes/queries";
import type { MockPersonaRole, WorkConnection } from "../types";
import { channelKeys, mockPersonaKeys } from "./queries";

export function useCreateWork(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      agent_id: string;
      runtime_id: string;
      connection: WorkConnection;
      assigned_member_id?: string | null;
    }) => api.createWork(data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: chatKeys.sessions(wsId) }),
        qc.invalidateQueries({ queryKey: issueKeys.all(wsId) }),
        qc.invalidateQueries({ queryKey: runtimeKeys.all(wsId) }),
      ]);
    },
  });
}

export function usePromoteChannelMessage(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      channelId: string;
      messageId: string;
      agent_id?: string;
      runtime_id?: string;
      connection?: WorkConnection;
    }) =>
      api.promoteChannelMessage(input.channelId, input.messageId, {
        agent_id: input.agent_id,
        runtime_id: input.runtime_id,
        connection: input.connection,
      }),
    onSuccess: async (_result, input) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: channelKeys.detail(wsId, input.channelId) }),
        qc.invalidateQueries({ queryKey: channelKeys.list(wsId) }),
        qc.invalidateQueries({ queryKey: chatKeys.sessions(wsId) }),
        qc.invalidateQueries({ queryKey: issueKeys.all(wsId) }),
      ]);
    },
  });
}

export function useSetMockPersona(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: MockPersonaRole) => api.setMockPersona(role),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: mockPersonaKeys.all() }),
        qc.invalidateQueries({ queryKey: chatKeys.sessions(wsId) }),
        qc.invalidateQueries({ queryKey: runtimeKeys.all(wsId) }),
        qc.invalidateQueries({ queryKey: ["workspaces", wsId, "members"] }),
      ]);
    },
  });
}
