import OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import {
  type ApplicationMemory,
  canonicalProfileSchema,
  parseApplicationMemory
} from "@/lib/memory";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/server-log";
import { parseJsonObject } from "@/lib/ai/json";
import { getOpenAIModel } from "@/lib/ai/models";

export async function updateMasterProfile({
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
  profileBank: {
    masterProfile: unknown;
    rawSources: unknown;
    checklist: unknown;
  };
  userMessage: string;
  assistantText: string;
}) {
  try {
    const response = await openai.responses.create({
      model: getOpenAIModel("profile_memory_update"),
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
    const validatedProfile = canonicalProfileSchema.safeParse(nextMasterProfile);
    if (!validatedProfile.success) return profileBank;

    return prisma.profileBank.update({
      where: { userId },
      data: { masterProfile: nextMasterProfile as Prisma.InputJsonValue }
    });
  } catch (error) {
    logError("Profile bank update failed", error, { userId });
    return profileBank;
  }
}

export async function updateApplicationMemory({
  openai,
  memory,
  profileSummary,
  userMessage,
  assistantText,
  userId,
  applicationId
}: {
  openai: OpenAI;
  memory: ApplicationMemory;
  profileSummary: unknown;
  userMessage: string;
  assistantText: string;
  userId?: string;
  applicationId?: string;
}) {
  try {
    const response = await openai.responses.create({
      model: getOpenAIModel("application_memory_update"),
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
    logError("Application memory update failed", error, { userId, applicationId });
    return memory;
  }
}
