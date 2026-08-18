import { z } from "zod";

export const openApplicationChatActionSchema = z.object({
  type: z.literal("open_application_chat"),
  label: z.string(),
  applicationId: z.string()
});

export const continueInProfileChatActionSchema = z.object({
  type: z.literal("continue_in_profile_chat"),
  label: z.string(),
  conversationId: z.string().nullable().optional()
});

export const chatActionSchema = z.discriminatedUnion("type", [
  openApplicationChatActionSchema,
  continueInProfileChatActionSchema
]);

export const chatMessageMetadataSchema = z.object({
  actions: z.array(chatActionSchema).default([])
});

export type ChatAction = z.infer<typeof chatActionSchema>;
export type ChatMessageMetadata = z.infer<typeof chatMessageMetadataSchema>;

export function parseChatMessageMetadata(value: unknown): ChatMessageMetadata {
  const parsed = chatMessageMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : { actions: [] };
}
