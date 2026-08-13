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

function uniqueStrings(values: string[], limit: number) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    const key = normalized.toLowerCase();
    if (!normalized || normalized.length < 3 || seen.has(key)) continue;

    seen.add(key);
    output.push(normalized.slice(0, 180));
    if (output.length >= limit) break;
  }

  return output;
}

function extractJobSummary(jobDescription: string) {
  const lines = jobDescription
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line.length >= 8);
  const sentences = jobDescription
    .replace(/\r?\n/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20);
  const requirementMatches = [...lines, ...sentences].filter((line) =>
    /required|requirement|must|need|experience with|proficient|strong|knowledge of|familiar/i.test(line)
  );
  const responsibilityMatches = [...lines, ...sentences].filter((line) =>
    /responsib|build|develop|design|lead|own|collaborate|work with|deliver|maintain|support/i.test(line)
  );
  const keywordCandidates = [
    "AI",
    "LLM",
    "RAG",
    "agent",
    "Python",
    "TypeScript",
    "JavaScript",
    "React",
    "Next.js",
    "Node",
    "Postgres",
    "SQL",
    "AWS",
    "GCP",
    "Azure",
    "Docker",
    "Kubernetes",
    "API",
    "evaluation",
    "machine learning",
    "data",
    "backend",
    "frontend",
    "full-stack"
  ];
  const lower = jobDescription.toLowerCase();
  const keywords = keywordCandidates.filter((keyword) => lower.includes(keyword.toLowerCase()));

  return {
    requirements: uniqueStrings(requirementMatches, 8),
    responsibilities: uniqueStrings(responsibilityMatches, 8),
    keywords: uniqueStrings(keywords, 16)
  };
}

function cleanCompanyCandidate(value: string) {
  const roleWords = new Set([
    "engineer",
    "developer",
    "designer",
    "manager",
    "analyst",
    "researcher",
    "consultant",
    "senior",
    "junior",
    "lead",
    "principal",
    "staff",
    "full-stack",
    "frontend",
    "backend"
  ]);
  const words = value.replace(/[.,]+$/g, "").split(/\s+/).filter(Boolean);

  while (words.length > 1 && roleWords.has(words[0]?.toLowerCase() ?? "")) {
    words.shift();
  }

  return words.join(" ").trim();
}

function inferJobMetadata(jobDescription: string) {
  const lines = jobDescription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 25);
  const joined = lines.join(" ");
  const hiringMatch = joined.match(
    /(.{0,120}?)\bis hiring\s+(?:an?|the)?\s*([^.,]+?)(?:\s+to\b|\.|,|$)/i
  );
  const hiringCompany = hiringMatch?.[1]
    ? cleanCompanyCandidate(hiringMatch[1].split(/\s+/).slice(-4).join(" "))
    : "";
  const hiringRole = hiringMatch?.[2] ? titleCase(hiringMatch[2]).slice(0, 120) : "";
  const companyMatch =
    joined.match(/\b(?:at|company|employer)[:\s]+([A-Z][A-Za-z0-9&.,' -]{2,80})/) ??
    joined.match(/\b([A-Z][A-Za-z0-9&.' -]{2,60})\s+is hiring\b/);
  const roleMatch =
    lines.find((line) => /engineer|developer|designer|manager|analyst|research|fellow|consultant/i.test(line)) ??
    lines[0];

  return {
    company:
      hiringCompany ||
      companyMatch?.[1]?.replace(/\s+(is|for|role).*$/i, "").trim() ||
      "Unknown company",
    role: hiringRole || (roleMatch ? titleCase(roleMatch).slice(0, 120) : "Untitled role")
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
    ...extractJobSummary(resolvedJob.content)
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
