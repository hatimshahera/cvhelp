import { z } from "zod";

export const chatModeSchema = z.enum(["build_profile", "application", "general"]);

export type ChatMode = z.infer<typeof chatModeSchema>;
export type ChatAgentId = "profile" | "application" | "general";

export function chatAgentIdForMode(mode: ChatMode): ChatAgentId {
  return mode === "build_profile" ? "profile" : mode;
}

export function conversationApplicationIdForMode(
  mode: ChatMode,
  applicationId: string | null | undefined
) {
  return mode === "application" ? applicationId ?? null : null;
}
