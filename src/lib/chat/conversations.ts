import { prisma } from "@/lib/prisma";
import type { ChatMode } from "@/lib/chat/types";

export type ChatMessageForContext = {
  role: string;
  content: string;
};

export async function getLatestConversationWithMessages({
  userId,
  mode,
  applicationId
}: {
  userId: string;
  mode: ChatMode;
  applicationId: string | null;
}) {
  return prisma.conversation.findFirst({
    where: { userId, mode, applicationId },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          metadata: true,
          createdAt: true
        }
      }
    }
  });
}

export async function clearConversationMessages({
  userId,
  mode,
  applicationId
}: {
  userId: string;
  mode: ChatMode;
  applicationId: string | null;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      userId,
      mode,
      applicationId
    }
  });

  if (!conversation) return null;

  await prisma.chatMessage.deleteMany({
    where: {
      conversationId: conversation.id,
      userId
    }
  });

  return prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      title: "New chat",
      updatedAt: new Date()
    }
  });
}

export async function getOrCreateConversation({
  userId,
  mode,
  applicationId,
  conversationId,
  title
}: {
  userId: string;
  mode: ChatMode;
  applicationId: string | null;
  conversationId?: string | null;
  title: string;
}) {
  if (conversationId) {
    return prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId,
        mode,
        applicationId,
        threadKey: "default"
      }
    });
  }

  return prisma.conversation.create({
    data: {
      userId,
      mode,
      applicationId,
      threadKey: "default",
      title
    }
  });
}

export async function getRecentConversationMessages({
  userId,
  conversationId,
  limit = 24
}: {
  userId: string;
  conversationId: string;
  limit?: number;
}): Promise<ChatMessageForContext[]> {
  return (
    await prisma.chatMessage.findMany({
      where: {
        conversationId,
        userId
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        role: true,
        content: true
      }
    })
  ).reverse();
}

export async function listConversationMessages({
  userId,
  conversationId
}: {
  userId: string;
  conversationId: string;
}) {
  return prisma.chatMessage.findMany({
    where: {
      conversationId,
      userId
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      metadata: true,
      createdAt: true
    }
  });
}
