import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createInitialApplicationMemory, parseApplicationMemory } from "@/lib/memory";
import { proofCvDataFromApplicationMemory } from "@/lib/proofcv";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const createArtifactSchema = z.object({
  type: z.enum(["proofcv_data", "cv_draft", "cover_note", "recruiter_message", "application_answers"]),
  title: z.string().trim().min(1).max(160).optional()
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

  if (parsed.data.type !== "proofcv_data") {
    return NextResponse.json(
      { error: "Only ProofCV data artifacts are supported in this phase." },
      { status: 400 }
    );
  }

  const version = await nextArtifactVersion(application.id, parsed.data.type);
  const title = parsed.data.title || `${application.company} ${application.role} ProofCV data`;
  const content = proofCvDataFromApplicationMemory({
    candidate: memory.candidateSnapshot,
    application: memory
  });

  const artifact = await prisma.applicationArtifact.create({
    data: {
      userId: user.id,
      applicationId: application.id,
      type: parsed.data.type,
      title,
      version,
      content: content as Prisma.InputJsonValue,
      metadata: {
        source: "application_memory",
        generatedAt: new Date().toISOString()
      } as Prisma.InputJsonValue
    }
  });

  return NextResponse.json({ artifact }, { status: 201 });
}
