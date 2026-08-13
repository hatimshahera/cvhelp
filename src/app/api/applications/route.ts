import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkFeatureLimit, getBillingStatus } from "@/lib/billing";
import { createInitialApplicationMemory } from "@/lib/memory";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const createApplicationSchema = z.object({
  jobSource: z.string().trim().min(10, "Paste a job link or description.").max(50000),
  company: z.string().trim().max(120).optional(),
  role: z.string().trim().max(160).optional()
});

function isLikelyUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function extractReadableText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveJobSource(jobSource: string) {
  if (!isLikelyUrl(jobSource)) {
    if (jobSource.length < 50) {
      throw new Error("Paste the full job description, or paste a valid job post URL.");
    }

    return {
      sourceType: "pasted_job_description",
      sourceUrl: null,
      content: jobSource
    };
  }

  const response = await fetch(jobSource, {
    headers: {
      "User-Agent": "CVhelp/1.0 (+https://cvhelp.vercel.app)",
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error("I could not open that job link. Paste the job description instead.");
  }

  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  const content = contentType.includes("text/html") ? extractReadableText(raw) : raw.trim();

  if (content.length < 200) {
    throw new Error("I could not extract enough job text from that link. Paste the job description instead.");
  }

  return {
    sourceType: "job_post_url",
    sourceUrl: jobSource,
    content: content.slice(0, 50000)
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferJobMetadata(jobDescription: string) {
  const lines = jobDescription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 25);
  const joined = lines.join(" ");
  const companyMatch =
    joined.match(/\b(?:at|company|employer)[:\s]+([A-Z][A-Za-z0-9&.,' -]{2,80})/) ??
    joined.match(/\b([A-Z][A-Za-z0-9&.' -]{2,60})\s+is hiring\b/);
  const roleMatch =
    lines.find((line) => /engineer|developer|designer|manager|analyst|research|fellow|consultant/i.test(line)) ??
    lines[0];

  return {
    company: companyMatch?.[1]?.replace(/\s+(is|for|role).*$/i, "").trim() || "Unknown company",
    role: roleMatch ? titleCase(roleMatch).slice(0, 120) : "Untitled role"
  };
}

async function uniqueSlug(userId: string, company: string, role: string) {
  const base = slugify(`${company}-${role}`) || `application-${Date.now()}`;
  let candidate = base;
  let suffix = 2;

  while (
    await prisma.application.findUnique({
      where: { userId_slug: { userId, slug: candidate } },
      select: { id: true }
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to view applications." }, { status: 401 });
  }

  const applications = await prisma.application.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      company: true,
      role: true,
      slug: true,
      status: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ applications });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to add applications." }, { status: 401 });
  }

  const [subscription, applicationCount] = await Promise.all([
    prisma.subscription.findUnique({
      where: { userId: user.id }
    }),
    prisma.application.count({
      where: { userId: user.id, archivedAt: null }
    })
  ]);
  const billing = getBillingStatus(subscription);
  const applicationLimit = checkFeatureLimit({
    plan: billing.plan,
    feature: "applications",
    used: applicationCount
  });

  if (!applicationLimit.allowed) {
    return NextResponse.json(
      {
        error: `You have reached the ${applicationLimit.limit} application limit for the ${billing.plan} plan.`,
        billing
      },
      { status: 402 }
    );
  }

  const parsed = createApplicationSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the job description." },
      { status: 400 }
    );
  }

  let resolvedJob;

  try {
    resolvedJob = await resolveJobSource(parsed.data.jobSource);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read the job source." },
      { status: 400 }
    );
  }

  const inferred = inferJobMetadata(resolvedJob.content);
  const company = parsed.data.company || inferred.company;
  const role = parsed.data.role || inferred.role;
  const slug = await uniqueSlug(user.id, company, role);
  const capturedAt = new Date().toISOString();
  const jobPost = {
    source: resolvedJob.sourceType,
    sourceUrl: resolvedJob.sourceUrl,
    content: resolvedJob.content,
    capturedAt
  };
  const jobSummary = {
    inferredCompany: inferred.company,
    inferredRole: inferred.role,
    requirements: [],
    responsibilities: [],
    keywords: []
  };
  const memory = createInitialApplicationMemory({
    company,
    role,
    jobPost,
    jobSummary
  });

  const application = await prisma.application.create({
    data: {
      userId: user.id,
      company,
      role,
      slug,
      nextAction: memory.nextActions[0],
      jobPost: jobPost as Prisma.InputJsonValue,
      jobSummary: jobSummary as Prisma.InputJsonValue,
      memory: memory as Prisma.InputJsonValue,
      candidateSnapshot: memory.candidateSnapshot as Prisma.InputJsonValue,
      selectedEvidence: memory.selectedEvidence as Prisma.InputJsonValue,
      notes: { entries: [] } as Prisma.InputJsonValue,
      drafts: {} as Prisma.InputJsonValue
    },
    select: {
      id: true,
      company: true,
      role: true,
      slug: true,
      status: true,
      createdAt: true,
      updatedAt: true
    }
  });

  await prisma.conversation.create({
    data: {
      userId: user.id,
      applicationId: application.id,
      mode: "application",
      threadKey: "default",
      title: `${company} - ${role}`
    }
  });

  return NextResponse.json({ application }, { status: 201 });
}
