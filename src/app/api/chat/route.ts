import OpenAI from "openai";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const chatSchema = z.object({
  message: z.string().trim().min(1, "Enter a message.").max(8000),
  conversationId: z.string().optional()
});

function toTitle(message: string) {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 58 ? `${compact.slice(0, 58)}...` : compact || "New chat";
}

async function requireUser() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) return null;

  return {
    id: userId,
    name: session.user.name ?? "there"
  };
}

export async function GET() {
  const user = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to use chat." }, { status: 401 });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true
        }
      }
    }
  });

  return NextResponse.json({
    conversationId: conversation?.id ?? null,
    messages: conversation?.messages ?? []
  });
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to use chat." }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const parsed = chatSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check your message." },
      { status: 400 }
    );
  }

  const conversation = parsed.data.conversationId
    ? await prisma.conversation.findFirst({
        where: {
          id: parsed.data.conversationId,
          userId: user.id
        }
      })
    : await prisma.conversation.create({
        data: {
          userId: user.id,
          title: toTitle(parsed.data.message)
        }
      });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const userMessage = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      userId: user.id,
      role: "user",
      content: parsed.data.message
    }
  });

  const recentMessages = await prisma.chatMessage.findMany({
    where: {
      conversationId: conversation.id,
      userId: user.id
    },
    orderBy: { createdAt: "asc" },
    take: 24,
    select: {
      role: true,
      content: true
    }
  });

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    const transcript = recentMessages
      .map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`)
      .join("\n\n");

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
      instructions:
        "You are CVhelp, a concise assistant for CVs, job applications, career evidence, and software project positioning. Be practical, ask for missing context when needed, and never invent user experience, credentials, or project facts.",
      input: `The signed-in user's name is ${user.name}. Continue this private conversation.\n\n${transcript}`
    });

    const assistantText =
      response.output_text?.trim() ||
      "I could not produce a response. Try again with a little more context.";

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        role: "assistant",
        content: assistantText
      }
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() }
    });

    return NextResponse.json({
      conversationId: conversation.id,
      messages: [userMessage, assistantMessage]
    });
  } catch (error) {
    await prisma.chatMessage.delete({
      where: { id: userMessage.id }
    });

    console.error("OpenAI chat request failed", error);
    return NextResponse.json(
      { error: "The OpenAI request failed. Check the API key and model configuration." },
      { status: 502 }
    );
  }
}
