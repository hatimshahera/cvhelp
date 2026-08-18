import { getRecentSourceContext, summarizeProfileBank } from "@/lib/memory";
import type { ChatMessageForContext } from "@/lib/chat/conversations";
import type { ChatMode } from "@/lib/chat/types";

const defaultContextBudget = 60_000;

type ApplicationContext = {
  company: string;
  role: string;
  status: string;
  nextAction?: string | null;
  jobPost?: unknown;
  jobSummary?: unknown;
  memory?: unknown;
  notes?: unknown;
  drafts?: unknown;
};

type WorkspaceApplicationSummary = {
  id: string;
  company: string;
  role: string;
  status: string;
  nextAction?: string | null;
};

type ProfileBankContext = {
  masterProfile: unknown;
  rawSources: unknown;
  checklist: unknown;
};

export function buildTranscript(messages: ChatMessageForContext[]) {
  return messages
    .map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`)
    .join("\n\n");
}

function truncateSection(section: string, budget: number) {
  if (section.length <= budget) return section;
  return `${section.slice(0, Math.max(0, budget - 28))}\n[Context truncated]`;
}

export function buildChatPromptContext({
  mode,
  userName,
  recentMessages,
  profileBank,
  application,
  workspaceApplications = [],
  sourceSnippetContext = "",
  contextBudget = defaultContextBudget
}: {
  mode: ChatMode;
  userName: string | null;
  recentMessages: ChatMessageForContext[];
  profileBank?: ProfileBankContext | null;
  application?: ApplicationContext | null;
  workspaceApplications?: WorkspaceApplicationSummary[];
  sourceSnippetContext?: string;
  contextBudget?: number;
}) {
  const transcript = buildTranscript(recentMessages);
  const profileContext =
    mode === "build_profile" || mode === "application"
      ? `\n\nCurrent profile bank summary:\n${JSON.stringify(
          summarizeProfileBank(profileBank ?? null),
          null,
          2
        )}\n\nRecent profile-bank sources:\n${getRecentSourceContext(
          profileBank?.rawSources
        ) || "No sources yet."}`
      : "";
  const applicationContext =
    mode === "application" && application
      ? `\n\nSelected application:\n${JSON.stringify(
          {
            company: application.company,
            role: application.role,
            status: application.status,
            nextAction: application.nextAction,
            jobPost: application.jobPost,
            jobSummary: application.jobSummary,
            memory: application.memory,
            notes: application.notes,
            drafts: application.drafts
          },
          null,
          2
        )}`
      : "";
  const generalContext =
    mode === "general" && workspaceApplications.length
      ? `\n\nWorkspace application summaries:\n${JSON.stringify(
          workspaceApplications.map((item) => ({
            id: item.id,
            company: item.company,
            role: item.role,
            status: item.status,
            nextAction: item.nextAction ?? null
          })),
          null,
          2
        )}`
      : "";
  const attachedSourceContext = sourceSnippetContext
    ? `\n\nAttached source snippets:\n${sourceSnippetContext}`
    : "";
  const prefix = `The signed-in user's name is ${userName}. Continue this private conversation.`;
  const context = truncateSection(
    `${profileContext}${applicationContext}${generalContext}${attachedSourceContext}`,
    Math.max(0, contextBudget - prefix.length - transcript.length - 4)
  );

  return `${prefix}${context}\n\n${transcript}`;
}
