"use client";

import { useEffect } from "react";
import { useWorkspacePaths } from "@multica/core/paths";
import { useNavigation } from "../../navigation";

/** Temporary stand-in while the Agents surface is archived for the chat workspace mock. */
export function AgentsArchiveRedirect() {
  const { replace } = useNavigation();
  const chatPath = useWorkspacePaths().chat();

  useEffect(() => {
    replace(chatPath);
  }, [chatPath, replace]);

  return null;
}
