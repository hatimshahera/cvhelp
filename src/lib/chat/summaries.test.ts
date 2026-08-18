import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConversationContextMessages,
  maybeSummarizeConversation,
  selectRelevantOlderMessages,
  shouldConsiderConversationSummary
} from "./summaries";

const { chatMessageFindMany, conversationUpdateMany } = vi.hoisted(() => ({
  chatMessageFindMany: vi.fn(),
  conversationUpdateMany: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatMessage: {
      findMany: chatMessageFindMany
    },
    conversation: {
      updateMany: conversationUpdateMany
    }
  }
}));

vi.mock("@/lib/server-log", () => ({
  logError: vi.fn()
}));

const message = (id: string, content: string, offset: number, role = "user") => ({
  id,
  role,
  content,
  createdAt: new Date(Date.UTC(2026, 7, 13, 12, 0, offset))
});

describe("conversation summaries and retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CVHELP_CONVERSATION_SUMMARY_THRESHOLD;
  });

  it("skips summary consideration below the configured threshold", () => {
    expect(
      shouldConsiderConversationSummary({
        recentMessageCount: 6,
        threshold: 10,
        recentLimit: 24
      })
    ).toBe(false);
  });

  it("retrieves relevant older messages only from the same conversation query", async () => {
    const recentDesc = Array.from({ length: 3 }, (_, index) =>
      message(`recent-${index}`, `Recent ${index}`, 20 + index)
    ).reverse();
    const older = [
      message("older-1", "Discussed a frontend role.", 1),
      message("older-2", "Discussed RAG evaluation and Python APIs.", 2),
      message("older-3", "Discussed billing copy.", 3)
    ];
    chatMessageFindMany.mockResolvedValueOnce(recentDesc).mockResolvedValueOnce(older);

    const result = await getConversationContextMessages({
      conversationId: "conversation-1",
      userId: "user-1",
      currentMessage: "How does this compare with the RAG evaluation role?",
      recentLimit: 3,
      olderLimit: 1
    });

    expect(chatMessageFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          conversationId: "conversation-1",
          userId: "user-1"
        }
      })
    );
    expect(chatMessageFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          conversationId: "conversation-1",
          userId: "user-1",
          createdAt: {
            lt: recentDesc[recentDesc.length - 1].createdAt
          }
        }
      })
    );
    expect(result.relevantOlderMessages).toEqual([
      {
        role: "user",
        content: "Discussed RAG evaluation and Python APIs."
      }
    ]);
  });

  it("can skip older-message retrieval for context-light chat modes", async () => {
    const recentDesc = Array.from({ length: 3 }, (_, index) =>
      message(`recent-${index}`, `Recent ${index}`, 20 + index)
    ).reverse();
    chatMessageFindMany.mockResolvedValueOnce(recentDesc);

    const result = await getConversationContextMessages({
      conversationId: "conversation-general",
      userId: "user-1",
      currentMessage: "hi",
      recentLimit: 3,
      olderLimit: 0
    });

    expect(chatMessageFindMany).toHaveBeenCalledTimes(1);
    expect(result.relevantOlderMessages).toEqual([]);
  });

  it("selects older messages by deterministic keyword relevance", () => {
    const selected = selectRelevantOlderMessages({
      query: "Need RAG Python evidence",
      olderMessages: [
        message("older-1", "React dashboard work", 1),
        message("older-2", "Python RAG evaluation project", 2),
        message("older-3", "Python data pipelines", 3)
      ],
      limit: 2
    });

    expect(selected.map((item) => item.content)).toEqual([
      "Python RAG evaluation project",
      "Python data pipelines"
    ]);
  });

  it("skips model summarization when older unsummarized messages are below threshold", async () => {
    const openai = {
      responses: {
        create: vi.fn()
      }
    };
    chatMessageFindMany
      .mockResolvedValueOnce(Array.from({ length: 3 }, (_, index) => message(`recent-${index}`, "Recent", index + 20)))
      .mockResolvedValueOnce([message("older-1", "One older message", 1)]);

    const result = await maybeSummarizeConversation({
      openai: openai as never,
      conversationId: "conversation-1",
      userId: "user-1",
      threshold: 2,
      recentLimit: 3
    });

    expect(result).toEqual({ summarized: false, reason: "below_threshold" });
    expect(openai.responses.create).not.toHaveBeenCalled();
    expect(conversationUpdateMany).not.toHaveBeenCalled();
  });

  it("updates a rolling summary scoped to the same conversation and user", async () => {
    const openai = {
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: "User wants AI engineer roles and values concise CV bullets."
        })
      }
    };
    chatMessageFindMany
      .mockResolvedValueOnce(Array.from({ length: 3 }, (_, index) => message(`recent-${index}`, "Recent", index + 20)))
      .mockResolvedValueOnce([
        message("older-1", "I prefer concise CV bullets.", 1),
        message("older-2", "I am targeting AI engineer roles.", 2)
      ]);
    conversationUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await maybeSummarizeConversation({
      openai: openai as never,
      conversationId: "conversation-1",
      userId: "user-1",
      threshold: 2,
      recentLimit: 3
    });

    expect(result.summarized).toBe(true);
    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "conversation-1",
        userId: "user-1"
      },
      data: expect.objectContaining({
        lastSummarizedMessageId: "older-2",
        summary: expect.objectContaining({
          version: 1,
          text: "User wants AI engineer roles and values concise CV bullets.",
          summarizedMessageCount: 2
        })
      })
    });
  });
});
