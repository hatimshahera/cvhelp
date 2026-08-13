import OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendApplicationMemoryNote,
  type ApplicationMemory,
  appendRawSource,
  createDefaultProfileBankData,
  createInitialApplicationMemory,
  getRecentSourceContext,
  markChecklistFromText,
  parseApplicationMemory,
  summarizeProfileBank
} from "@/lib/memory";
import { prisma } from "@/lib/prisma";
import { checkRequestLimit, getIntegerEnv } from "@/lib/rate-limit";
import { logError } from "@/lib/server-log";
import { getCurrentUser } from "@/lib/session";

const chatSchema = z.object({
  message: z.string().trim().min(1, "Enter a message.").max(8000),
  conversationId: z.string().nullable().optional(),
  mode: z.enum(["build_profile", "application", "general"]).default("build_profile"),
  applicationId: z.string().nullable().optional()
});

const modeSchema = z.enum(["build_profile", "application", "general"]).default("build_profile");
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

function toTitle(message: string) {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 58 ? `${compact.slice(0, 58)}...` : compact || "New chat";
}

function getOpenAIModel() {
  const configured = process.env.OPENAI_MODEL?.trim();
  if (!configured || configured === "gpt-5.6-luna") return DEFAULT_OPENAI_MODEL;
  return configured;
}

async function getOrCreateProfileBank(userId: string) {
  const defaults = createDefaultProfileBankData();
  return prisma.profileBank.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      masterProfile: defaults.masterProfile as Prisma.InputJsonValue,
      rawSources: defaults.rawSources as Prisma.InputJsonValue,
      checklist: defaults.checklist as Prisma.InputJsonValue
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
  const rawSources = appendRawSource(
    existing.rawSources,
    {
      id: crypto.randomUUID(),
      type: "chat_note",
      content: message,
      createdAt: new Date().toISOString()
    },
    80
  );
  const nextChecklist = markChecklistFromText(existing.checklist, message);

  return prisma.profileBank.update({
    where: { userId },
    data: {
      rawSources: rawSources as Prisma.InputJsonValue,
      checklist: nextChecklist as Prisma.InputJsonValue
    }
  });
}

function getInstructions(mode: "build_profile" | "application" | "general") {
  if (mode === "build_profile") {
    return [
      "You are CVhelp's profile-building agent.",
      "Your only job is to help the user build, clean, delete, and maintain their reusable career profile bank.",
      "Treat the profile bank as structured memory with sections: identity, links, education, experience, projects, research, skills, achievements, preferences, constraints, evidence, and openQuestions.",
      "Follow a guided intake sequence: current CV, LinkedIn/background, GitHub/projects, work experience, education, evidence/metrics, role preferences, then final review.",
      "Ask one focused question at a time unless the user gives a large source such as a CV, LinkedIn text, GitHub/project list, or multiple corrections.",
      "Extract projects, experience, education, skills, achievements, metrics, links, preferences, and evidence.",
      "When a claim needs proof, ask for the source, metric, date, link, or context instead of filling it in yourself.",
      "Keep claims grounded in what the user provides. Never invent credentials, employers, dates, metrics, or project facts.",
      "When useful, summarize what you added to the profile bank and what is still missing.",
      "If the user asks to remove or correct something, acknowledge the correction clearly and ask for the exact replacement if needed.",
      "Be concise and practical."
    ].join(" ");
  }

  if (mode === "application") {
    return [
      "You are CVhelp's application agent.",
      "Your job is to help with one specific job application, using the selected job post and the user's profile bank.",
      "Keep application-specific notes, analysis, CV tailoring, cover letters, and answers focused on this role only.",
      "Do not pollute or rewrite the user's global profile unless they explicitly ask to update reusable profile facts.",
      "Compare the job requirements against the profile bank, identify best evidence, gaps, risks, and concrete next steps.",
      "Help draft tailored CV bullets, cover notes, recruiter messages, and application answers.",
      "Never invent experience, metrics, dates, employers, links, or credentials. If evidence is missing, ask for it.",
      "Be practical, concise, and specific to this application."
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
        "Prefer the canonical sections identity, links, education, experience, projects, research, skills, achievements, preferences, constraints, evidence, openQuestions.",
        "Prefer arrays of concise objects for experience, projects, skills, achievements, and evidence.",
        "When adding or updating profile fact objects, include a provenance array with sourceType, quote, confidence, and createdAt when available.",
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
    logError("Profile bank update failed", error, { userId });
    return profileBank;
  }
}

async function updateApplicationMemory({
  openai,
  memory,
  profileSummary,
  userMessage,
  assistantText
}: {
  openai: OpenAI;
  memory: ApplicationMemory;
  profileSummary: unknown;
  userMessage: string;
  assistantText: string;
}) {
  try {
    const response = await openai.responses.create({
      model: getOpenAIModel(),
      instructions: [
        "Update application-specific memory JSON for one job application.",
        "Return only valid JSON. No markdown. No prose.",
        "Keep information scoped to this application unless the user explicitly asks to update reusable profile facts.",
        "Do not invent dates, employers, metrics, credentials, links, project facts, or submitted status.",
        "Preserve existing useful memory unless the latest turn corrects or removes it.",
        "Use this exact JSON shape: candidateSnapshot, target, jobPost, requirements, responsibilities, keywords, selectedEvidence, profileSummary, honestyNotes, risks, gaps, notes, drafts, nextActions.",
        "Preserve and update claimProvenance as a map from claim groups to provenance arrays with sourceType, quote, confidence, and createdAt.",
        "selectedEvidence must contain arrays for projects, research, experience, and skills.",
        "Use short strings in requirements, responsibilities, keywords, honestyNotes, risks, gaps, and nextActions."
      ].join(" "),
      input: JSON.stringify({
        currentApplicationMemory: memory,
        profileBankSummary: profileSummary,
        latestUserMessage: userMessage,
        latestAssistantResponse: assistantText
      })
    });

    const parsed = parseJsonObject(response.output_text ?? "");
    if (!parsed) return memory;

    return parseApplicationMemory(parsed, memory);
  } catch (error) {
    logError("Application memory update failed", error);
    return memory;
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to use chat." }, { status: 401 });
  }

  const mode = modeSchema.parse(new URL(request.url).searchParams.get("mode") ?? undefined);
  const applicationId = new URL(request.url).searchParams.get("applicationId");
  const profileBank =
    mode === "build_profile" || mode === "application" ? await getOrCreateProfileBank(user.id) : null;
  const application =
    mode === "application" && applicationId
      ? await prisma.application.findFirst({
          where: { id: applicationId, userId: user.id },
          select: {
            id: true,
            company: true,
            role: true,
            slug: true,
            status: true,
            jobPost: true,
            jobSummary: true,
            notes: true,
            drafts: true,
            createdAt: true,
            updatedAt: true
          }
        })
      : null;

  if (mode === "application" && !application) {
    return NextResponse.json({ error: "Choose an application first." }, { status: 400 });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { userId: user.id, mode, applicationId: application?.id ?? null },
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
    profileBank: summarizeProfileBank(profileBank),
    application
  });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to use chat." }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const mode = modeSchema.parse(requestUrl.searchParams.get("mode") ?? undefined);
  const applicationId = requestUrl.searchParams.get("applicationId");
  const profileBank =
    mode === "build_profile" || mode === "application" ? await getOrCreateProfileBank(user.id) : null;
  const application =
    mode === "application" && applicationId
      ? await prisma.application.findFirst({
          where: { id: applicationId, userId: user.id }
        })
      : null;

  if (mode === "application" && !application) {
    return NextResponse.json({ error: "Choose an application first." }, { status: 400 });
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      userId: user.id,
      mode,
      applicationId: application?.id ?? null
    }
  });

  if (conversation) {
    await prisma.chatMessage.deleteMany({
      where: {
        conversationId: conversation.id,
        userId: user.id
      }
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        title: "New chat",
        updatedAt: new Date()
      }
    });
  }

  return NextResponse.json({
    conversationId: conversation?.id ?? null,
    messages: [],
    profileBank: summarizeProfileBank(profileBank),
    application
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

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
  const profileBank =
    mode === "build_profile" || mode === "application" ? await getOrCreateProfileBank(user.id) : null;
  const application =
    mode === "application" && parsed.data.applicationId
      ? await prisma.application.findFirst({
          where: { id: parsed.data.applicationId, userId: user.id }
        })
      : null;

  if (mode === "application" && !application) {
    return NextResponse.json({ error: "Choose an application first." }, { status: 400 });
  }

  const chatLimit = checkRequestLimit({
    key: `chat:${user.id}`,
    limit: getIntegerEnv("CVHELP_CHAT_RATE_LIMIT", 60),
    windowMs: getIntegerEnv("CVHELP_CHAT_RATE_WINDOW_MS", 60_000)
  });

  if (!chatLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many chat requests. Wait a moment and try again.",
        limit: chatLimit.limit,
        resetAt: new Date(chatLimit.resetAt).toISOString()
      },
      { status: 429 }
    );
  }

  const conversation = parsed.data.conversationId
    ? await prisma.conversation.findFirst({
      where: {
        id: parsed.data.conversationId,
        userId: user.id,
        mode,
        applicationId: application?.id ?? null,
        threadKey: "default"
      }
    })
    : await prisma.conversation.create({
        data: {
          userId: user.id,
          mode,
          applicationId: application?.id ?? null,
          threadKey: "default",
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

  const recentMessages = (
    await prisma.chatMessage.findMany({
      where: {
        conversationId: conversation.id,
        userId: user.id
      },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        role: true,
        content: true
      }
    })
  ).reverse();

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    const transcript = recentMessages
      .map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`)
      .join("\n\n");
    const profileContext =
      mode === "build_profile" || mode === "application"
        ? `\n\nCurrent profile bank summary:\n${JSON.stringify(
            summarizeProfileBank(updatedProfileBank),
            null,
          2
          )}\n\nRecent profile-bank sources:\n${getRecentSourceContext(updatedProfileBank?.rawSources) || "No sources yet."}`
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

    const response = await openai.responses.create({
      model: getOpenAIModel(),
      instructions: getInstructions(mode),
      input: `The signed-in user's name is ${user.name}. Continue this private conversation.${profileContext}${applicationContext}\n\n${transcript}`
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

    if (mode === "application" && application) {
      const fallbackMemory = createInitialApplicationMemory({
        company: application.company,
        role: application.role,
        jobPost:
          application.jobPost &&
          typeof application.jobPost === "object" &&
          !Array.isArray(application.jobPost) &&
          typeof application.jobPost.source === "string" &&
          typeof application.jobPost.content === "string" &&
          typeof application.jobPost.capturedAt === "string"
            ? {
                source: application.jobPost.source,
                sourceUrl:
                  typeof application.jobPost.sourceUrl === "string" ? application.jobPost.sourceUrl : null,
                content: application.jobPost.content,
                capturedAt: application.jobPost.capturedAt
              }
            : {
                source: "unknown",
                sourceUrl: null,
                content: "",
                capturedAt: new Date().toISOString()
              },
        jobSummary: application.jobSummary as {
          requirements?: string[];
          responsibilities?: string[];
          keywords?: string[];
        }
      });
      const memory = parseApplicationMemory(application.memory, fallbackMemory);
      const noteUpdatedMemory = appendApplicationMemoryNote(memory, {
        id: crypto.randomUUID(),
        type: "chat_turn",
        content: [
          `User: ${parsed.data.message}`,
          `Assistant: ${assistantText.slice(0, 1200)}`
        ].join("\n\n"),
        createdAt: new Date().toISOString()
      });
      const nextMemory = await updateApplicationMemory({
        openai,
        memory: noteUpdatedMemory,
        profileSummary: summarizeProfileBank(finalProfileBank),
        userMessage: parsed.data.message,
        assistantText
      });
      const existingNotes =
        application.notes && typeof application.notes === "object" && !Array.isArray(application.notes)
          ? (application.notes as { entries?: unknown[] })
          : {};
      const entries = Array.isArray(existingNotes.entries) ? existingNotes.entries : [];

      await prisma.application.update({
        where: { id: application.id },
        data: {
          memory: nextMemory as Prisma.InputJsonValue,
          selectedEvidence: nextMemory.selectedEvidence as Prisma.InputJsonValue,
          candidateSnapshot: nextMemory.candidateSnapshot as Prisma.InputJsonValue,
          nextAction: nextMemory.nextActions[0] ?? application.nextAction,
          notes: {
            ...existingNotes,
            entries: [
              ...entries,
              {
                id: crypto.randomUUID(),
                type: "chat_turn",
                userMessage: parsed.data.message,
                assistantSummary: assistantText.slice(0, 1200),
                createdAt: new Date().toISOString()
              }
            ].slice(-80)
          } as Prisma.InputJsonValue
        }
      });
    }

    const conversationMessages = await prisma.chatMessage.findMany({
      where: {
        conversationId: conversation.id,
        userId: user.id
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true
      }
    });

    return NextResponse.json({
      conversationId: conversation.id,
      messages: conversationMessages,
      profileBank: summarizeProfileBank(finalProfileBank),
      application
    });
  } catch (error) {
    await prisma.chatMessage.delete({
      where: { id: userMessage.id }
    });

    logError("OpenAI chat request failed", error, { userId: user.id, mode });
    return NextResponse.json(
      { error: "The OpenAI request failed. Check the API key and model configuration." },
      { status: 502 }
    );
  }
}
