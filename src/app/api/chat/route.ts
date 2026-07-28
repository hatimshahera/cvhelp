import OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const chatSchema = z.object({
  message: z.string().trim().min(1, "Enter a message.").max(8000),
  conversationId: z.string().nullable().optional(),
  mode: z.enum(["build_profile", "general"]).default("build_profile")
});

const modeSchema = z.enum(["build_profile", "general"]).default("build_profile");
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

const defaultChecklist = [
  { id: "cv", label: "Add current CV", done: false },
  { id: "linkedin", label: "Add LinkedIn background", done: false },
  { id: "github", label: "Add GitHub/projects", done: false },
  { id: "experience", label: "Confirm work experience", done: false },
  { id: "education", label: "Confirm education", done: false },
  { id: "proof", label: "Collect evidence and metrics", done: false }
];

type ProfileBankShape = {
  masterProfile: Record<string, unknown>;
  rawSources: {
    entries: Array<{
      id: string;
      type: string;
      content: string;
      createdAt: string;
    }>;
  };
  checklist: Array<{ id: string; label: string; done: boolean }>;
};

function toTitle(message: string) {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 58 ? `${compact.slice(0, 58)}...` : compact || "New chat";
}

function getOpenAIModel() {
  const configured = process.env.OPENAI_MODEL?.trim();
  if (!configured || configured === "gpt-5.6-luna") return DEFAULT_OPENAI_MODEL;
  return configured;
}

function summarizeProfileBank(profileBank: {
  masterProfile: unknown;
  rawSources: unknown;
  checklist: unknown;
} | null) {
  const rawSources = profileBank?.rawSources as ProfileBankShape["rawSources"] | null;
  const checklist = profileBank?.checklist as ProfileBankShape["checklist"] | null;
  const masterProfile =
    profileBank?.masterProfile &&
    typeof profileBank.masterProfile === "object" &&
    !Array.isArray(profileBank.masterProfile)
      ? (profileBank.masterProfile as Record<string, unknown>)
      : {};
  const entries = Array.isArray(rawSources?.entries) ? rawSources.entries : [];
  const tasks = Array.isArray(checklist) ? checklist : defaultChecklist;
  const sections = Object.keys(masterProfile).filter((key) => {
    const value = masterProfile[key];
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return Boolean(value);
  });

  return {
    sourceCount: entries.length,
    checklist: tasks,
    hasMasterProfile: sections.length > 0,
    sections
  };
}

function getRecentSourceContext(profileBank: {
  rawSources: unknown;
} | null) {
  const rawSources = profileBank?.rawSources as ProfileBankShape["rawSources"] | null;
  const entries = Array.isArray(rawSources?.entries) ? rawSources.entries : [];

  return entries
    .slice(-6)
    .map((entry) => {
      const content = entry.content.length > 1800 ? `${entry.content.slice(0, 1800)}...` : entry.content;
      return `Source ${entry.id} (${entry.type}):\n${content}`;
    })
    .join("\n\n");
}

async function getOrCreateProfileBank(userId: string) {
  return prisma.profileBank.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      masterProfile: {},
      rawSources: { entries: [] },
      checklist: defaultChecklist
    }
  });
}

async function updateProfileBankFromMessage({
  userId,
  message,
  existing
}: {
  userId: string;
  message: string;
  existing: Awaited<ReturnType<typeof getOrCreateProfileBank>>;
}) {
  const rawSources = existing.rawSources as ProfileBankShape["rawSources"] | null;
  const checklist = existing.checklist as ProfileBankShape["checklist"] | null;
  const entries = Array.isArray(rawSources?.entries) ? rawSources.entries : [];
  const nextEntries = [
    ...entries,
    {
      id: crypto.randomUUID(),
      type: "chat_note",
      content: message,
      createdAt: new Date().toISOString()
    }
  ].slice(-80);

  const lower = message.toLowerCase();
  const nextChecklist = (Array.isArray(checklist) ? checklist : defaultChecklist).map((item) => {
    if (item.id === "cv" && /\bcv\b|resume|curriculum vitae/.test(lower)) return { ...item, done: true };
    if (item.id === "linkedin" && lower.includes("linkedin")) return { ...item, done: true };
    if (item.id === "github" && lower.includes("github")) return { ...item, done: true };
    if (item.id === "experience" && /experience|worked|built|role|company/.test(lower)) {
      return { ...item, done: true };
    }
    if (item.id === "education" && /education|degree|university|college|school/.test(lower)) {
      return { ...item, done: true };
    }
    if (item.id === "proof" && /metric|impact|result|evidence|users|revenue|latency|accuracy/.test(lower)) {
      return { ...item, done: true };
    }
    return item;
  });

  return prisma.profileBank.update({
    where: { userId },
    data: {
      rawSources: { entries: nextEntries },
      checklist: nextChecklist
    }
  });
}

function getInstructions(mode: "build_profile" | "general") {
  if (mode === "build_profile") {
    return [
      "You are CVhelp's profile-building agent.",
      "Your only job is to help the user build, clean, delete, and maintain their career profile bank.",
      "Ask one focused question at a time unless the user gives a large source such as a CV, LinkedIn text, or GitHub/project list.",
      "Extract projects, experience, education, skills, achievements, metrics, links, preferences, and evidence.",
      "Keep claims grounded in what the user provides. Never invent credentials, employers, dates, metrics, or project facts.",
      "When useful, summarize what you added to the profile bank and what is still missing.",
      "If the user asks to remove or correct something, acknowledge the correction clearly and ask for the exact replacement if needed.",
      "Be concise and practical."
    ].join(" ");
  }

  return "You are CVhelp, a concise assistant for CVs, job applications, career evidence, and software project positioning. Be practical, ask for missing context when needed, and never invent user experience, credentials, or project facts.";
}

function parseJsonObject(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

async function updateMasterProfile({
  openai,
  userId,
  userName,
  profileBank,
  userMessage,
  assistantText
}: {
  openai: OpenAI;
  userId: string;
  userName: string;
  profileBank: Awaited<ReturnType<typeof getOrCreateProfileBank>>;
  userMessage: string;
  assistantText: string;
}) {
  try {
    const response = await openai.responses.create({
      model: getOpenAIModel(),
      instructions: [
        "Update a user's private career master profile JSON from the latest chat turn.",
        "Return only valid JSON. No markdown. No prose.",
        "Keep only facts grounded in user-provided information.",
        "If the user corrects or deletes information, apply that correction.",
        "Use stable sections such as summary, links, experience, projects, education, skills, achievements, preferences, evidence, openQuestions.",
        "Prefer arrays of concise objects for experience, projects, skills, achievements, and evidence.",
        "Do not invent dates, metrics, employers, credentials, links, or technologies."
      ].join(" "),
      input: JSON.stringify({
        userName,
        currentMasterProfile: profileBank.masterProfile ?? {},
        latestUserMessage: userMessage,
        latestAssistantResponse: assistantText
      })
    });

    const nextMasterProfile = parseJsonObject(response.output_text ?? "");
    if (!nextMasterProfile) return profileBank;

    return prisma.profileBank.update({
      where: { userId },
      data: { masterProfile: nextMasterProfile as Prisma.InputJsonValue }
    });
  } catch (error) {
    console.error("Profile bank update failed", error);
    return profileBank;
  }
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

export async function GET(request: Request) {
  const user = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to use chat." }, { status: 401 });
  }

  const mode = modeSchema.parse(new URL(request.url).searchParams.get("mode") ?? undefined);
  const profileBank = mode === "build_profile" ? await getOrCreateProfileBank(user.id) : null;

  const conversation = await prisma.conversation.findFirst({
    where: { userId: user.id, mode },
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
    messages: conversation?.messages ?? [],
    profileBank: summarizeProfileBank(profileBank)
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

  const mode = parsed.data.mode;
  const profileBank = mode === "build_profile" ? await getOrCreateProfileBank(user.id) : null;

  const conversation = parsed.data.conversationId
    ? await prisma.conversation.findFirst({
        where: {
          id: parsed.data.conversationId,
          userId: user.id,
          mode
        }
      })
    : await prisma.conversation.create({
        data: {
          userId: user.id,
          mode,
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

  const updatedProfileBank =
    mode === "build_profile" && profileBank
      ? await updateProfileBankFromMessage({
          userId: user.id,
          message: parsed.data.message,
          existing: profileBank
        })
      : profileBank;

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
    const profileContext =
      mode === "build_profile"
        ? `\n\nCurrent profile bank summary:\n${JSON.stringify(
            summarizeProfileBank(updatedProfileBank),
            null,
            2
          )}\n\nRecent profile-bank sources:\n${getRecentSourceContext(updatedProfileBank) || "No sources yet."}`
        : "";

    const response = await openai.responses.create({
      model: getOpenAIModel(),
      instructions: getInstructions(mode),
      input: `The signed-in user's name is ${user.name}. Continue this private conversation.${profileContext}\n\n${transcript}`
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

    const finalProfileBank =
      mode === "build_profile" && updatedProfileBank
        ? await updateMasterProfile({
            openai,
            userId: user.id,
            userName: user.name,
            profileBank: updatedProfileBank,
            userMessage: parsed.data.message,
            assistantText
          })
        : updatedProfileBank;

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() }
    });

    return NextResponse.json({
      conversationId: conversation.id,
      messages: [userMessage, assistantMessage],
      profileBank: summarizeProfileBank(finalProfileBank)
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
