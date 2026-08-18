import type OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import { getOpenAIModel } from "@/lib/ai/models";
import { prisma } from "@/lib/prisma";
import { getIntegerEnv } from "@/lib/rate-limit";
import { logError } from "@/lib/server-log";
import type { ChatMessageForContext } from "@/lib/chat/conversations";

const defaultRecentMessageLimit = 24;
const defaultOlderMessageScanLimit = 160;
const defaultRelevantOlderMessageLimit = 6;
const defaultSummaryThreshold = 40;
const summaryTextLimit = 5000;

export type ConversationSummary = {
  version: 1;
  text: string;
  updatedAt: string;
  summarizedMessageCount: number;
};

export type ChatContextMessages = {
  recentMessages: ChatMessageForContext[];
  relevantOlderMessages: ChatMessageForContext[];
  summary: ConversationSummary | null;
};

type StoredMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
};

function normalizeSummary(value: unknown): ConversationSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<ConversationSummary>;
  if (candidate.version !== 1 || typeof candidate.text !== "string") return null;

  return {
    version: 1,
    text: candidate.text,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date(0).toISOString(),
    summarizedMessageCount:
      typeof candidate.summarizedMessageCount === "number" ? candidate.summarizedMessageCount : 0
  };
}

export function getConversationSummaryThreshold() {
  return getIntegerEnv("CVHELP_CONVERSATION_SUMMARY_THRESHOLD", defaultSummaryThreshold);
}

export function shouldConsiderConversationSummary({
  recentMessageCount,
  threshold = getConversationSummaryThreshold(),
  recentLimit = defaultRecentMessageLimit
}: {
  recentMessageCount: number;
  threshold?: number;
  recentLimit?: number;
}) {
  return recentMessageCount >= Math.min(threshold, recentLimit);
}

function extractKeywords(text: string) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);
  const stopWords = new Set([
    "and",
    "are",
    "but",
    "can",
    "for",
    "from",
    "have",
    "how",
    "that",
    "the",
    "this",
    "use",
    "with",
    "you",
    "your"
  ]);

  return Array.from(new Set(words.filter((word) => !stopWords.has(word)))).slice(0, 30);
}

export function selectRelevantOlderMessages({
  query,
  olderMessages,
  limit = defaultRelevantOlderMessageLimit
}: {
  query: string;
  olderMessages: StoredMessage[];
  limit?: number;
}): ChatMessageForContext[] {
  const keywords = extractKeywords(query);
  if (!keywords.length) return [];

  return olderMessages
    .map((message, index) => {
      const haystack = message.content.toLowerCase();
      const score = keywords.reduce((total, keyword) => total + (haystack.includes(keyword) ? 1 : 0), 0);
      return { message, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map(({ message }) => ({
      role: message.role,
      content: message.content
    }));
}

export async function getConversationContextMessages({
  conversationId,
  userId,
  currentMessage,
  conversationSummary,
  recentLimit = defaultRecentMessageLimit,
  olderScanLimit = defaultOlderMessageScanLimit,
  olderLimit = defaultRelevantOlderMessageLimit
}: {
  conversationId: string;
  userId: string;
  currentMessage: string;
  conversationSummary?: unknown;
  recentLimit?: number;
  olderScanLimit?: number;
  olderLimit?: number;
}): Promise<ChatContextMessages> {
  const recentDesc = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      userId
    },
    orderBy: { createdAt: "desc" },
    take: recentLimit,
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true
    }
  });
  const recent = [...recentDesc].reverse();

  if (recent.length < recentLimit) {
    return {
      recentMessages: recent.map(({ role, content }) => ({ role, content })),
      relevantOlderMessages: [],
      summary: normalizeSummary(conversationSummary)
    };
  }

  if (olderLimit <= 0) {
    return {
      recentMessages: recent.map(({ role, content }) => ({ role, content })),
      relevantOlderMessages: [],
      summary: normalizeSummary(conversationSummary)
    };
  }

  const oldestRecent = recent[0];
  const olderMessages = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      userId,
      createdAt: {
        lt: oldestRecent.createdAt
      }
    },
    orderBy: { createdAt: "asc" },
    take: olderScanLimit,
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true
    }
  });

  return {
    recentMessages: recent.map(({ role, content }) => ({ role, content })),
    relevantOlderMessages: selectRelevantOlderMessages({
      query: currentMessage,
      olderMessages,
      limit: olderLimit
    }),
    summary: normalizeSummary(conversationSummary)
  };
}

function buildSummaryInput({
  existingSummary,
  messages
}: {
  existingSummary: ConversationSummary | null;
  messages: StoredMessage[];
}) {
  const existing = existingSummary?.text ? `Existing summary:\n${existingSummary.text}\n\n` : "";
  const transcript = messages
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n\n");

  return `${existing}New messages to fold into the rolling summary:\n${transcript}`;
}

export async function maybeSummarizeConversation({
  openai,
  conversationId,
  userId,
  conversationSummary,
  lastSummarizedMessageId,
  threshold = getConversationSummaryThreshold(),
  recentLimit = defaultRecentMessageLimit,
  olderScanLimit = defaultOlderMessageScanLimit
}: {
  openai: OpenAI;
  conversationId: string;
  userId: string;
  conversationSummary?: unknown;
  lastSummarizedMessageId?: string | null;
  threshold?: number;
  recentLimit?: number;
  olderScanLimit?: number;
}) {
  const recentDesc = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      userId
    },
    orderBy: { createdAt: "desc" },
    take: recentLimit,
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true
    }
  });

  if (recentDesc.length < recentLimit) {
    return { summarized: false as const, reason: "below_recent_window" };
  }

  const oldestRecent = recentDesc[recentDesc.length - 1];
  const olderMessages = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      userId,
      createdAt: {
        lt: oldestRecent.createdAt
      }
    },
    orderBy: { createdAt: "asc" },
    take: olderScanLimit,
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true
    }
  });

  const lastSummarizedIndex = lastSummarizedMessageId
    ? olderMessages.findIndex((message) => message.id === lastSummarizedMessageId)
    : -1;
  const unsummarizedMessages = olderMessages.slice(lastSummarizedIndex + 1);

  if (unsummarizedMessages.length < threshold) {
    return { summarized: false as const, reason: "below_threshold" };
  }

  try {
    const response = await openai.responses.create({
      model: getOpenAIModel("conversation_summary"),
      instructions:
        "Maintain a concise rolling summary for a private CVHelp chat. Preserve user facts, decisions, corrections, open tasks, and constraints. Do not invent facts.",
      input: buildSummaryInput({
        existingSummary: normalizeSummary(conversationSummary),
        messages: unsummarizedMessages
      })
    });
    const text = response.output_text?.trim().slice(0, summaryTextLimit);

    if (!text) {
      return { summarized: false as const, reason: "empty_model_output" };
    }

    const summary: ConversationSummary = {
      version: 1,
      text,
      updatedAt: new Date().toISOString(),
      summarizedMessageCount:
        (normalizeSummary(conversationSummary)?.summarizedMessageCount ?? 0) + unsummarizedMessages.length
    };

    await prisma.conversation.updateMany({
      where: {
        id: conversationId,
        userId
      },
      data: {
        summary: summary as Prisma.InputJsonValue,
        lastSummarizedMessageId: unsummarizedMessages[unsummarizedMessages.length - 1].id
      }
    });

    return { summarized: true as const, summary };
  } catch (error) {
    logError("Conversation summarization failed", error, { userId, conversationId });
    return { summarized: false as const, reason: "error" };
  }
}
