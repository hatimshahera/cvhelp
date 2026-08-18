import type OpenAI from "openai";
import { buildAgentInstructions } from "@/lib/ai/agents";
import { getOpenAIModel } from "@/lib/ai/models";
import type { ChatMode } from "@/lib/chat/types";

export async function generateChatResponse({
  openai,
  mode,
  profileBank,
  input
}: {
  openai: OpenAI;
  mode: ChatMode;
  profileBank?: unknown;
  input: string;
}) {
  return openai.responses.create({
    model: getOpenAIModel("chat"),
    instructions: buildAgentInstructions({
      mode,
      profileBank
    }),
    input
  });
}
