const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

export type AiTask = "chat" | "profile_memory_update" | "application_memory_update" | "artifact";

export function getOpenAIModel(_task: AiTask = "chat") {
  const configured = process.env.OPENAI_MODEL?.trim();
  if (!configured || configured === "gpt-5.6-luna") return DEFAULT_OPENAI_MODEL;
  return configured;
}
