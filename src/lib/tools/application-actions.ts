import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { createInitialApplicationMemory } from "@/lib/memory";
import { prisma } from "@/lib/prisma";

export const createApplicationInputSchema = z.object({
  jobSource: z.string().trim().min(10, "Paste a job link or description.").max(50000),
  company: z.string().trim().max(120).optional(),
  role: z.string().trim().max(160).optional()
});

export type CreateApplicationInput = z.infer<typeof createApplicationInputSchema>;

export function isLikelyUrl(value: string) {
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

export async function resolveJobSource(jobSource: string) {
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

export function extractJobSummary(jobDescription: string) {
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

function cleanRoleCandidate(value: string) {
  return value
    .replace(/\s+(?:to|for|with|who|that|and)\b.*$/i, "")
    .replace(/[.,:;]+$/g, "")
    .replace(/^(?:as\s+)?(?:an?|the)\s+/i, "")
    .trim();
}

export function inferJobMetadata(jobDescription: string) {
  const lines = jobDescription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 25);
  const joined = lines.join(" ");
  const hiringMatch = joined.match(
    /(.{0,120}?)\b(?:is|are|we are|they are)\s+hiring\s+(?:an?|the)?\s*([^.,]+?)(?:\s+to\b|\.|,|$)/i
  );
  const hiringCompany = hiringMatch?.[1]
    ? cleanCompanyCandidate(hiringMatch[1].split(/\s+/).slice(-4).join(" "))
    : "";
  const hiringRole = hiringMatch?.[2] ? titleCase(cleanRoleCandidate(hiringMatch[2])).slice(0, 120) : "";
  const anonymizedClientMatch = joined.match(
    /\bmy client (?:is|are)\s+(?:an?|the)?\s*([A-Z][A-Za-z0-9&.' -]{2,60}?)(?:,|\s+using|\s+who|\s+with|\s+that|\.|$)/i
  );
  const companyMatch =
    joined.match(/\b(?:at|company|employer)[:\s]+([A-Z][A-Za-z0-9&.,' -]{2,80})/) ??
    joined.match(/\b([A-Z][A-Za-z0-9&.' -]{2,60})\s+(?:is|are)\s+hiring\b/);
  const roleHeadingIndex = lines.findIndex((line) => /^the role\b|^role\b/i.test(line));
  const roleSectionMatch =
    roleHeadingIndex >= 0
      ? lines.slice(roleHeadingIndex, roleHeadingIndex + 4).join(" ").match(
          /\b(?:is|are|we are|they are)\s+hiring\s+(?:an?|the)?\s*([^.,]+?)(?:\s+to\b|\.|,|$)/i
        )
      : null;
  const roleMatch =
    lines.find((line) => /engineer|developer|designer|manager|analyst|research|fellow|consultant/i.test(line)) ??
    lines[0];
  const inferredCompany = hiringCompany && !/\b(?:they|we|this|result|growth|role)\b/i.test(hiringCompany)
    ? hiringCompany
    : anonymizedClientMatch?.[1]?.trim() ||
      companyMatch?.[1]?.replace(/\s+(is|are|for|role).*$/i, "").trim() ||
      "Unknown company";
  const inferredRole =
    hiringRole ||
    (roleSectionMatch?.[1] ? titleCase(cleanRoleCandidate(roleSectionMatch[1])).slice(0, 120) : "") ||
    (roleMatch ? titleCase(cleanRoleCandidate(roleMatch)).slice(0, 120) : "Untitled role");

  return {
    company: inferredCompany,
    role: inferredRole || "Untitled role"
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

export async function createApplicationFromJobSource({
  userId,
  input
}: {
  userId: string;
  input: CreateApplicationInput;
}) {
  const resolvedJob = await resolveJobSource(input.jobSource);
  const inferred = inferJobMetadata(resolvedJob.content);
  const company = input.company || inferred.company;
  const role = input.role || inferred.role;
  const slug = await uniqueSlug(userId, company, role);
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
      userId,
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
      userId,
      applicationId: application.id,
      mode: "application",
      threadKey: "default",
      title: `${company} - ${role}`
    }
  });

  return application;
}

export function looksLikeJobSource(message: string) {
  const trimmed = message.trim();
  if (isLikelyUrl(trimmed)) return true;
  if (trimmed.length < 80) return false;

  return /(?:responsibilities|requirements|qualifications|about the role|job description|we are hiring|is hiring|apply|candidate|experience with|salary|location)/i.test(
    trimmed
  );
}
