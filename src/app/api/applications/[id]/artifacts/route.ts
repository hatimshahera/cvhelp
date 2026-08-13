import OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkFeatureLimit, getBillingStatus } from "@/lib/billing";
import { createInitialApplicationMemory, type ApplicationMemory, parseApplicationMemory } from "@/lib/memory";
import { proofCvDataFromApplicationMemory } from "@/lib/proofcv";
import { prisma } from "@/lib/prisma";
import { checkRequestLimit, getIntegerEnv } from "@/lib/rate-limit";
import { logError } from "@/lib/server-log";
import { getCurrentUser } from "@/lib/session";

const createArtifactSchema = z.object({
  type: z.enum(["proofcv_data", "cv_draft", "cover_note", "recruiter_message", "application_answers"]),
  title: z.string().trim().min(1).max(160).optional(),
  prompt: z.string().trim().max(8000).optional(),
  refineFromArtifactId: z.string().trim().min(1).optional()
});

type RouteParams = {
  params: Promise<{ id: string }>;
};

async function getApplicationForUser(id: string, userId: string) {
  return prisma.application.findFirst({
    where: { id, userId }
  });
}

function getJobPostFallback(application: NonNullable<Awaited<ReturnType<typeof getApplicationForUser>>>) {
  if (
    application.jobPost &&
    typeof application.jobPost === "object" &&
    !Array.isArray(application.jobPost) &&
    typeof application.jobPost.source === "string" &&
    typeof application.jobPost.content === "string" &&
    typeof application.jobPost.capturedAt === "string"
  ) {
    return {
      source: application.jobPost.source,
      sourceUrl: typeof application.jobPost.sourceUrl === "string" ? application.jobPost.sourceUrl : null,
      content: application.jobPost.content,
      capturedAt: application.jobPost.capturedAt
    };
  }

  return {
    source: "unknown",
    sourceUrl: null,
    content: "",
    capturedAt: new Date().toISOString()
  };
}

async function nextArtifactVersion(applicationId: string, type: string) {
  const latest = await prisma.applicationArtifact.findFirst({
    where: { applicationId, type },
    orderBy: { version: "desc" },
    select: { version: true }
  });

  return (latest?.version ?? 0) + 1;
}

function getOpenAIModel() {
  const configured = process.env.OPENAI_MODEL?.trim();
  if (!configured || configured === "gpt-5.6-luna") return "gpt-5-mini";
  return configured;
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

function artifactInstructions(type: string) {
  const base = [
    "You generate grounded job application artifacts from saved application memory.",
    "Return only valid JSON. No markdown. No prose outside JSON.",
    "Never invent credentials, employers, dates, links, metrics, project facts, or submitted status.",
    "If evidence is weak or missing, state that as a gap instead of fabricating support.",
    "Keep the result concise, specific to the target role, and useful for review before export."
  ];

  if (type === "cv_draft") {
    return [
      ...base,
      "Return JSON with keys: summary, bullets, selectedEvidence, risks.",
      "bullets must be an array of tailored CV bullet strings grounded in selected evidence."
    ].join(" ");
  }

  if (type === "cover_note") {
    return [
      ...base,
      "Return JSON with keys: subject, note, evidenceUsed, gaps.",
      "note should be a concise cover note."
    ].join(" ");
  }

  if (type === "recruiter_message") {
    return [
      ...base,
      "Return JSON with keys: subject, message, evidenceUsed, followUp.",
      "message should be a short recruiter or hiring-manager outreach message."
    ].join(" ");
  }

  return [
    ...base,
    "Return JSON with keys: answers, assumptions, gaps.",
    "answers must be an array of objects with question and answer keys."
  ].join(" ");
}

function defaultArtifactTitle(type: string, company: string, role: string) {
  const label =
    type === "proofcv_data"
      ? "ProofCV data"
      : type === "cv_draft"
        ? "CV draft"
        : type === "cover_note"
          ? "Cover note"
          : type === "recruiter_message"
            ? "Recruiter message"
            : "Application answers";

  return `${company} ${role} ${label}`;
}

async function generateAiArtifact(input: {
  type: string;
  memory: ApplicationMemory;
  prompt?: string;
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  const response = await openai.responses.create({
    model: getOpenAIModel(),
    instructions: artifactInstructions(input.type),
    input: JSON.stringify({
      artifactType: input.type,
      applicationMemory: input.memory,
      userPrompt: input.prompt || null
    })
  });
  const parsed = parseJsonObject(response.output_text ?? "");

  if (!parsed) {
    throw new Error("The model did not return a valid artifact.");
  }

  return parsed;
}

export async function GET(_request: Request, context: RouteParams) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to view artifacts." }, { status: 401 });
  }

  const { id } = await context.params;
  const application = await getApplicationForUser(id, user.id);

  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const artifacts = await prisma.applicationArtifact.findMany({
    where: { applicationId: application.id, userId: user.id },
    orderBy: [{ type: "asc" }, { version: "desc" }]
  });

  return NextResponse.json({ artifacts });
}

export async function POST(request: Request, context: RouteParams) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to create artifacts." }, { status: 401 });
  }

  const { id } = await context.params;
  const application = await getApplicationForUser(id, user.id);

  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const parsed = createArtifactSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the artifact request." },
      { status: 400 }
    );
  }

  const isExport = parsed.data.type === "proofcv_data";
  const feature = isExport ? "exports" : "generations";

  if (!isExport) {
    const aiLimit = checkRequestLimit({
      key: `artifact:${user.id}`,
      limit: getIntegerEnv("CVHELP_ARTIFACT_RATE_LIMIT", 30),
      windowMs: getIntegerEnv("CVHELP_ARTIFACT_RATE_WINDOW_MS", 60_000)
    });

    if (!aiLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many artifact generation requests. Wait a moment and try again.",
          limit: aiLimit.limit,
          resetAt: new Date(aiLimit.resetAt).toISOString()
        },
        { status: 429 }
      );
    }
  }

  const [subscription, usedCount] = await Promise.all([
    prisma.subscription.findUnique({
      where: { userId: user.id }
    }),
    prisma.applicationArtifact.count({
      where: {
        userId: user.id,
        type: isExport ? "proofcv_data" : { not: "proofcv_data" }
      }
    })
  ]);
  const billing = getBillingStatus(subscription);
  const featureLimit = checkFeatureLimit({
    plan: billing.plan,
    feature,
    used: usedCount
  });

  if (!featureLimit.allowed) {
    return NextResponse.json(
      {
        error: `You have reached the ${featureLimit.limit} ${feature} limit for the ${billing.plan} plan.`,
        billing
      },
      { status: 402 }
    );
  }

  const fallbackMemory = createInitialApplicationMemory({
    company: application.company,
    role: application.role,
    jobPost: getJobPostFallback(application),
    jobSummary: application.jobSummary as {
      requirements?: string[];
      responsibilities?: string[];
      keywords?: string[];
    },
    candidateSnapshot:
      application.candidateSnapshot &&
      typeof application.candidateSnapshot === "object" &&
      !Array.isArray(application.candidateSnapshot)
        ? (application.candidateSnapshot as Record<string, unknown>)
        : {}
  });
  const memory = parseApplicationMemory(application.memory, fallbackMemory);

  const version = await nextArtifactVersion(application.id, parsed.data.type);
  const title = parsed.data.title || defaultArtifactTitle(parsed.data.type, application.company, application.role);
  const refineFromArtifact = parsed.data.refineFromArtifactId
    ? await prisma.applicationArtifact.findFirst({
        where: {
          id: parsed.data.refineFromArtifactId,
          applicationId: application.id,
          userId: user.id,
          type: parsed.data.type
        },
        select: {
          id: true,
          version: true,
          content: true
        }
      })
    : null;

  if (parsed.data.refineFromArtifactId && !refineFromArtifact) {
    return NextResponse.json({ error: "Artifact to refine was not found." }, { status: 404 });
  }

  let content: Record<string, unknown>;

  try {
    content =
      parsed.data.type === "proofcv_data"
        ? proofCvDataFromApplicationMemory({
            candidate: memory.candidateSnapshot,
            application: memory
          })
        : await generateAiArtifact({
            type: parsed.data.type,
            memory,
            prompt: refineFromArtifact
              ? [
                  parsed.data.prompt,
                  "Refine from this previous artifact version:",
                  JSON.stringify({
                    id: refineFromArtifact.id,
                    version: refineFromArtifact.version,
                    content: refineFromArtifact.content
                  })
                ].filter(Boolean).join("\n\n")
              : parsed.data.prompt
          });
  } catch (error) {
    logError("Artifact generation failed", error, {
      userId: user.id,
      applicationId: application.id,
      artifactType: parsed.data.type
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Artifact generation failed." },
      { status: 502 }
    );
  }

  const artifact = await prisma.applicationArtifact.create({
    data: {
      userId: user.id,
      applicationId: application.id,
      type: parsed.data.type,
      title,
      version,
      content: content as Prisma.InputJsonValue,
      metadata: {
        source: parsed.data.type === "proofcv_data" ? "application_memory" : "openai",
        model: parsed.data.type === "proofcv_data" ? null : getOpenAIModel(),
        generatedAt: new Date().toISOString(),
        prompt: parsed.data.prompt || null,
        refineFromArtifactId: refineFromArtifact?.id ?? null,
        refineFromVersion: refineFromArtifact?.version ?? null
      } as Prisma.InputJsonValue
    }
  });

  return NextResponse.json({ artifact }, { status: 201 });
}
