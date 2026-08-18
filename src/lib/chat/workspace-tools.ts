import { summarizeProfileBank } from "@/lib/memory";
import { prisma } from "@/lib/prisma";
import type { GeneralChatContextPlan, GeneralWorkspaceTool } from "@/lib/chat/general-intent";

const maxApplicationResults = 12;
const maxSourceResults = 8;
const maxSourceSnippetChars = 900;

export const generalWorkspaceToolDefinitions = [
  "Available deterministic backend tools for General Chat:",
  "- list_applications/search_applications: read application summaries owned by the signed-in user.",
  "- get_profile/search_profile: read relevant reusable profile-bank facts and preferences owned by the signed-in user.",
  "- search_sources: read bounded metadata/snippets from user-owned sources and files.",
  "- create_application/archive_application/restore_application/update_application_status/rename_application: state-changing backend actions with validation, ownership checks, and confirmation requirements where appropriate.",
  "Use workspace tools only when the current user request requires workspace information. Do not mention workspace, profile, application, or source details unless provided in the current prompt context."
].join("\n");

function extractSearchTerms(message: string) {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .filter(
      (term) =>
        !new Set([
          "the",
          "and",
          "for",
          "with",
          "that",
          "this",
          "what",
          "which",
          "show",
          "list",
          "find",
          "search",
          "compare",
          "application",
          "applications",
          "profile",
          "source",
          "sources"
        ]).has(term)
    )
    .slice(0, 8);
}

function textMatchesTerms(text: string, terms: string[]) {
  if (!terms.length) return true;
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function compact(value: unknown, maxChars = 8000) {
  const text = JSON.stringify(value, null, 2);
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[Tool result truncated]` : text;
}

async function readApplications({
  userId,
  message,
  search
}: {
  userId: string;
  message: string;
  search: boolean;
}) {
  const applications = await prisma.application.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: {
      id: true,
      company: true,
      role: true,
      status: true,
      nextAction: true,
      archivedAt: true,
      updatedAt: true
    }
  });
  const terms = search ? extractSearchTerms(message) : [];
  const filtered = applications
    .filter((application) =>
      textMatchesTerms(
        [
          application.company,
          application.role,
          application.status,
          application.nextAction ?? "",
          application.archivedAt ? "archived" : "active"
        ].join(" "),
        terms
      )
    )
    .slice(0, maxApplicationResults);

  return {
    tool: search ? "search_applications" : "list_applications",
    result: filtered.map((application) => ({
      id: application.id,
      company: application.company,
      role: application.role,
      status: application.status,
      nextAction: application.nextAction ?? null,
      archived: Boolean(application.archivedAt),
      updatedAt: application.updatedAt
    }))
  };
}

async function readProfile({
  userId,
  message,
  search
}: {
  userId: string;
  message: string;
  search: boolean;
}) {
  const profileBank = await prisma.profileBank.findUnique({
    where: { userId },
    select: {
      masterProfile: true,
      rawSources: true,
      checklist: true
    }
  });
  const summary = summarizeProfileBank(profileBank ?? null);

  if (!search) {
    return {
      tool: "get_profile",
      result: summary
    };
  }

  const terms = extractSearchTerms(message);
  const profileText = compact(summary, 12000);
  const masterProfileText = compact(profileBank?.masterProfile ?? {}, 12000);
  const matchingLines = profileText
    .concat("\n", masterProfileText)
    .split(/\r?\n/)
    .filter((line) => textMatchesTerms(line, terms))
    .slice(0, 30);

  return {
    tool: "search_profile",
    result: {
      summary,
      matchingLines
    }
  };
}

async function readSources({ userId, message }: { userId: string; message: string }) {
  const sources = await prisma.source.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      scope: true,
      applicationId: true,
      kind: true,
      name: true,
      textContent: true,
      createdAt: true
    }
  });
  const terms = extractSearchTerms(message);
  const filtered = sources
    .filter((source) =>
      textMatchesTerms(
        [source.name ?? "", source.kind, source.scope, source.textContent ?? ""].join(" "),
        terms
      )
    )
    .slice(0, maxSourceResults);

  return {
    tool: "search_sources",
    result: filtered.map((source) => ({
      id: source.id,
      scope: source.scope,
      applicationId: source.applicationId,
      kind: source.kind,
      name: source.name,
      createdAt: source.createdAt,
      snippet: (source.textContent ?? "No extracted text available.").slice(0, maxSourceSnippetChars)
    }))
  };
}

export async function resolveGeneralWorkspaceContext({
  userId,
  message,
  plan
}: {
  userId: string;
  message: string;
  plan: GeneralChatContextPlan;
}) {
  if (!plan.workspaceTools.length) {
    return {
      toolDefinitions: generalWorkspaceToolDefinitions,
      toolResultsContext: "",
      executedTools: [] as GeneralWorkspaceTool[]
    };
  }

  const resultBlocks = [];

  if (plan.workspaceTools.includes("list_applications")) {
    resultBlocks.push(await readApplications({ userId, message, search: false }));
  }
  if (plan.workspaceTools.includes("search_applications")) {
    resultBlocks.push(await readApplications({ userId, message, search: true }));
  }
  if (plan.workspaceTools.includes("get_profile")) {
    resultBlocks.push(await readProfile({ userId, message, search: false }));
  }
  if (plan.workspaceTools.includes("search_profile")) {
    resultBlocks.push(await readProfile({ userId, message, search: true }));
  }
  if (plan.workspaceTools.includes("search_sources")) {
    resultBlocks.push(await readSources({ userId, message }));
  }

  return {
    toolDefinitions: generalWorkspaceToolDefinitions,
    toolResultsContext: [
      `General Chat context plan: ${plan.intent}. ${plan.reason}`,
      "Backend workspace tool results:",
      compact(resultBlocks, 14000)
    ].join("\n"),
    executedTools: plan.workspaceTools
  };
}
