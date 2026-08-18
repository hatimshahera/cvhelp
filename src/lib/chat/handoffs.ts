import { prisma } from "@/lib/prisma";

export function looksLikeProfileHandoffRequest(message: string) {
  const text = message.trim();
  const updateIntent =
    /\b(update|change|save|remember|add|remove|delete|correct|set|prefer|preference|always|never|avoid|do not|don't)\b/i.test(
      text
    );
  const profileScope =
    /\b(profile|profile bank|global preference|cv preference|resume preference|one[- ]page|bullet style|tone|formatting|things to avoid|avoid claiming|do not claim)\b/i.test(
      text
    );

  return updateIntent && profileScope;
}

export async function createProfileHandoff({
  userId,
  context
}: {
  userId: string;
  context: string;
}) {
  const conversation =
    (await prisma.conversation.findFirst({
      where: {
        userId,
        mode: "build_profile",
        applicationId: null,
        threadKey: "default"
      },
      orderBy: { updatedAt: "desc" }
    })) ??
    (await prisma.conversation.create({
      data: {
        userId,
        mode: "build_profile",
        applicationId: null,
        threadKey: "default",
        title: "Profile handoff"
      }
    }));
  const handoffText = [
    "General Chat handoff:",
    context.slice(0, 1200),
    "Confirm what should be saved to the reusable profile bank before updating global facts or preferences."
  ].join(" ");

  await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      userId,
      role: "assistant",
      content: handoffText,
      metadata: {
        source: "general_chat_handoff"
      }
    }
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() }
  });

  return conversation;
}
