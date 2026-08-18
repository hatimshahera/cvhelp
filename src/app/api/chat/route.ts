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
import { updateApplicationMemory, updateMasterProfile } from "@/lib/ai/memory-updates";
import {
  clearConversationMessages,
  getConversationWithMessages,
  getLatestConversationWithMessages,
  getOrCreateConversation,
  listConversations,
  listConversationMessages
} from "@/lib/chat/conversations";
import { buildChatPromptContext } from "@/lib/chat/context";
import { planGeneralChatContext } from "@/lib/chat/general-intent";
import {
  getConversationContextMessages,
  maybeSummarizeConversation,
  shouldConsiderConversationSummary
} from "@/lib/chat/summaries";
import { generateChatResponse } from "@/lib/chat/response-generation";
import type { ChatAction } from "@/lib/chat/actions";
import { createProfileHandoff, looksLikeProfileHandoffRequest } from "@/lib/chat/handoffs";
import { chatModeSchema, conversationApplicationIdForMode } from "@/lib/chat/types";
import { resolveGeneralWorkspaceContext } from "@/lib/chat/workspace-tools";
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
  newConversation: z.boolean().optional(),
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
  const requestUrl = new URL(request.url);
  const applicationId = requestUrl.searchParams.get("applicationId");
  const conversationId = requestUrl.searchParams.get("conversationId");
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

  const scopedApplicationId = conversationApplicationIdForMode(mode, application?.id);
  const conversation = conversationId
    ? await getConversationWithMessages({
        userId: user.id,
        mode,
        applicationId: scopedApplicationId,
        conversationId
      })
    : await getLatestConversationWithMessages({
        userId: user.id,
        mode,
        applicationId: scopedApplicationId
      });
  const conversations =
    mode === "general"
      ? await listConversations({
          userId: user.id,
          mode,
          applicationId: null
        })
      : [];

  return NextResponse.json({
    conversationId: conversation?.id ?? null,
    messages: conversation?.messages ?? [],
    conversations,
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

  const conversation = await getOrCreateConversation({
    userId: user.id,
    mode,
    applicationId: conversationApplicationIdForMode(mode, application?.id),
    conversationId: parsed.data.conversationId,
    title: toTitle(parsed.data.message),
    forceNew: mode === "general" && parsed.data.newConversation === true
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

  const chatContextMessages = await getConversationContextMessages({
    conversationId: conversation.id,
    userId: user.id,
    currentMessage: parsed.data.message,
    conversationSummary: conversation.summary,
    olderLimit: mode === "general" ? 0 : undefined
  });

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    const generalContextPlan =
      mode === "general" ? planGeneralChatContext(parsed.data.message) : null;
    const generalWorkspaceContext =
      generalContextPlan
        ? await resolveGeneralWorkspaceContext({
            userId: user.id,
            message: parsed.data.message,
            plan: generalContextPlan
          })
        : null;

    const response = await generateChatResponse({
      openai,
      mode,
      profileBank: updatedProfileBank,
      input: buildChatPromptContext({
        mode,
        userName: user.name,
        recentMessages: chatContextMessages.recentMessages,
        conversationSummary: chatContextMessages.summary,
        relevantOlderMessages: chatContextMessages.relevantOlderMessages,
        profileBank: updatedProfileBank,
        application,
        generalToolDefinitions: generalWorkspaceContext?.toolDefinitions,
        generalWorkspaceContext: generalWorkspaceContext?.toolResultsContext,
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
