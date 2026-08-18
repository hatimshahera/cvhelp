import OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkFeatureLimit, getBillingStatus } from "@/lib/billing";
import {
  appendApplicationMemoryNote,
  appendRawSource,
  createDefaultProfileBankData,
  createInitialApplicationMemory,
  markChecklistFromText,
  parseApplicationMemory,
  summarizeProfileBank
} from "@/lib/memory";
import { buildAgentInstructions } from "@/lib/ai/agents";
import { getOpenAIModel } from "@/lib/ai/models";
import { updateApplicationMemory, updateMasterProfile } from "@/lib/ai/memory-updates";
import {
  clearConversationMessages,
  getLatestConversationWithMessages,
  getOrCreateConversation,
  listConversationMessages
} from "@/lib/chat/conversations";
import { buildChatPromptContext } from "@/lib/chat/context";
import {
  getConversationContextMessages,
  maybeSummarizeConversation,
  shouldConsiderConversationSummary
} from "@/lib/chat/summaries";
import type { ChatAction } from "@/lib/chat/actions";
import { createProfileHandoff, looksLikeProfileHandoffRequest } from "@/lib/chat/handoffs";
import {
  getLightweightGeneralReply,
  isLightweightGeneralMessage,
  shouldIncludeGeneralWorkspaceContext
} from "@/lib/chat/intent";
import { chatModeSchema, conversationApplicationIdForMode } from "@/lib/chat/types";
import { prisma } from "@/lib/prisma";
import { checkRequestLimit, getIntegerEnv } from "@/lib/rate-limit";
import { logError } from "@/lib/server-log";
import { getCurrentUser } from "@/lib/session";
import {
  buildSourceSnippetContext,
  getSourcesForChat,
  linkSourcesToMessage,
  moveSourcesToApplication
} from "@/lib/sources";
import {
  createApplicationFromJobSource,
  looksLikeJobSource
} from "@/lib/tools/application-actions";

const chatSchema = z.object({
  message: z.string().trim().min(1, "Enter a message.").max(8000),
  conversationId: z.string().nullable().optional(),
  mode: chatModeSchema.default("build_profile"),
  applicationId: z.string().nullable().optional(),
  sourceIds: z.array(z.string()).max(12).default([])
});

const modeSchema = chatModeSchema.default("build_profile");

function toTitle(message: string) {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 58 ? `${compact.slice(0, 58)}...` : compact || "New chat";
}

async function checkApplicationCreationLimit(userId: string) {
  const [subscription, applicationCount] = await Promise.all([
    prisma.subscription.findUnique({
      where: { userId }
    }),
    prisma.application.count({
      where: { userId, archivedAt: null }
    })
  ]);
  const billing = getBillingStatus(subscription);
  const applicationLimit = checkFeatureLimit({
    plan: billing.plan,
    feature: "applications",
    used: applicationCount
  });

  if (!applicationLimit.allowed) {
    throw new Error(`You have reached the ${applicationLimit.limit} application limit for the ${billing.plan} plan.`);
  }
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

  const conversation = await getLatestConversationWithMessages({
    userId: user.id,
    mode,
    applicationId: conversationApplicationIdForMode(mode, application?.id)
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

  const conversation = await clearConversationMessages({
    userId: user.id,
    mode,
    applicationId: conversationApplicationIdForMode(mode, application?.id)
  });

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

  const conversation = await getOrCreateConversation({
    userId: user.id,
    mode,
    applicationId: conversationApplicationIdForMode(mode, application?.id),
    conversationId: parsed.data.conversationId,
    title: toTitle(parsed.data.message)
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  let attachedSources;
  try {
    attachedSources = await getSourcesForChat({
      userId: user.id,
      mode,
      applicationId: conversationApplicationIdForMode(mode, application?.id),
      sourceIds: parsed.data.sourceIds
    });
  } catch (sourceError) {
    return NextResponse.json(
      {
        error:
          sourceError instanceof Error
            ? sourceError.message
            : "One or more attached sources are unavailable for this chat."
      },
      { status: 400 }
    );
  }

  const isDeterministicLightweightGeneral =
    mode === "general" &&
    attachedSources.length === 0 &&
    isLightweightGeneralMessage(parsed.data.message);

  if (!process.env.OPENAI_API_KEY && !isDeterministicLightweightGeneral) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const userMessage = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      userId: user.id,
      role: "user",
      content: parsed.data.message
    }
  });
  await linkSourcesToMessage({
    userId: user.id,
    messageId: userMessage.id,
    sourceIds: attachedSources.map((source) => source.id)
  });

  const updatedProfileBank =
    mode === "build_profile" && profileBank
      ? await updateProfileBankFromMessage({
          userId: user.id,
          message: parsed.data.message,
          existing: profileBank
      })
      : profileBank;

  if (isDeterministicLightweightGeneral) {
    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        role: "assistant",
        content: getLightweightGeneralReply(parsed.data.message, user.name)
      }
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() }
    });

    const conversationMessages = await listConversationMessages({
      conversationId: conversation.id,
      userId: user.id
    });

    return NextResponse.json({
      conversationId: conversation.id,
      messages: conversationMessages,
      profileBank: summarizeProfileBank(updatedProfileBank),
      application
    });
  }

  const chatContextMessages = await getConversationContextMessages({
    conversationId: conversation.id,
    userId: user.id,
    currentMessage: parsed.data.message,
    conversationSummary: conversation.summary
  });

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    const includeWorkspaceContext = shouldIncludeGeneralWorkspaceContext({
      message: parsed.data.message,
      hasAttachedSources: attachedSources.length > 0
    });
    const workspaceApplications =
      mode === "general" && includeWorkspaceContext
        ? await prisma.application.findMany({
            where: { userId: user.id },
            orderBy: { updatedAt: "desc" },
            take: 20,
            select: {
              id: true,
              company: true,
              role: true,
              status: true,
              nextAction: true
            }
          })
        : [];

    const response = await openai.responses.create({
      model: getOpenAIModel("chat"),
      instructions: buildAgentInstructions({
        mode,
        profileBank: updatedProfileBank
      }),
      input: buildChatPromptContext({
        mode,
        userName: user.name,
        recentMessages: chatContextMessages.recentMessages,
        conversationSummary: chatContextMessages.summary,
        relevantOlderMessages: chatContextMessages.relevantOlderMessages,
        profileBank: updatedProfileBank,
        application,
        workspaceApplications,
        sourceSnippetContext: buildSourceSnippetContext(attachedSources)
      })
    });

    let assistantText =
      response.output_text?.trim() ||
      "I could not produce a response. Try again with a little more context.";
    const actions: ChatAction[] = [];

    const jobSourceFromAttachment =
      mode === "general"
        ? attachedSources.find((source) => source.textContent && looksLikeJobSource(source.textContent))
        : null;
    const jobSourceText = looksLikeJobSource(parsed.data.message)
      ? parsed.data.message
      : jobSourceFromAttachment?.textContent ?? "";

    if (mode === "general" && jobSourceText) {
      try {
        await checkApplicationCreationLimit(user.id);
        const createdApplication = await createApplicationFromJobSource({
          userId: user.id,
          input: {
            jobSource: jobSourceText
          }
        });
        if (jobSourceFromAttachment) {
          await moveSourcesToApplication({
            userId: user.id,
            sourceIds: [jobSourceFromAttachment.id],
            applicationId: createdApplication.id
          });
        }

        assistantText = [
          assistantText,
          `Created a new application for ${createdApplication.company} - ${createdApplication.role}.`
        ].join("\n\n");
        actions.push({
          type: "open_application_chat",
          label: "Open application chat",
          applicationId: createdApplication.id
        });
      } catch (creationError) {
        assistantText = [
          assistantText,
          creationError instanceof Error
            ? `I could not create the application: ${creationError.message}`
            : "I could not create the application from that job source."
        ].join("\n\n");
      }
    } else if (mode === "general" && looksLikeProfileHandoffRequest(parsed.data.message)) {
      const profileConversation = await createProfileHandoff({
        userId: user.id,
        context: parsed.data.message
      });

      actions.push({
        type: "continue_in_profile_chat",
        label: "Continue in Profile Chat",
        conversationId: profileConversation.id
      });
      assistantText = [
        assistantText,
        "I added a short handoff note to your Profile Chat so reusable facts or preferences can be confirmed there."
      ].join("\n\n");
    } else if (mode === "application" && application && looksLikeProfileHandoffRequest(parsed.data.message)) {
      const profileConversation = await createProfileHandoff({
        userId: user.id,
        context: [
          `Application Chat handoff from ${application.company} - ${application.role}:`,
          parsed.data.message
        ].join(" ")
      });

      actions.push({
        type: "continue_in_profile_chat",
        label: "Continue in Profile Chat",
        conversationId: profileConversation.id
      });
      assistantText = [
        assistantText,
        "I added a short handoff note to your Profile Chat so reusable facts or preferences can be confirmed there before changing the global profile."
      ].join("\n\n");
    }

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        role: "assistant",
        content: assistantText,
        metadata: actions.length ? { actions } : undefined
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
        assistantText,
        userId: user.id,
        applicationId: application.id
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

    if (shouldConsiderConversationSummary({ recentMessageCount: chatContextMessages.recentMessages.length })) {
      await maybeSummarizeConversation({
        openai,
        userId: user.id,
        conversationId: conversation.id,
        conversationSummary: conversation.summary,
        lastSummarizedMessageId: conversation.lastSummarizedMessageId
      });
    }

    const conversationMessages = await listConversationMessages({
      conversationId: conversation.id,
      userId: user.id
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
