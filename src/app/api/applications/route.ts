import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createApplicationSchema = z.object({
  jobDescription: z.string().trim().min(50, "Paste the full job description.").max(50000),
  company: z.string().trim().max(120).optional(),
  role: z.string().trim().max(160).optional()
});

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

async function requireUser() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) return null;
  return { id: userId };
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
  const user = await requireUser();

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
  const user = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to add applications." }, { status: 401 });
  }

  const parsed = createApplicationSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the job description." },
      { status: 400 }
    );
  }

  const inferred = inferJobMetadata(parsed.data.jobDescription);
  const company = parsed.data.company || inferred.company;
  const role = parsed.data.role || inferred.role;
  const slug = await uniqueSlug(user.id, company, role);

  const application = await prisma.application.create({
    data: {
      userId: user.id,
      company,
      role,
      slug,
      jobPost: {
        source: "pasted_job_description",
        content: parsed.data.jobDescription,
        capturedAt: new Date().toISOString()
      } as Prisma.InputJsonValue,
      jobSummary: {
        inferredCompany: inferred.company,
        inferredRole: inferred.role,
        requirements: [],
        responsibilities: [],
        keywords: []
      } as Prisma.InputJsonValue,
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
      title: `${company} - ${role}`
    }
  });

  return NextResponse.json({ application }, { status: 201 });
}
