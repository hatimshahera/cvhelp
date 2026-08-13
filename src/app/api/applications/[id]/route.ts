import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const applicationStatusSchema = z.enum([
  "draft",
  "researching",
  "tailoring_cv",
  "cover_note_ready",
  "submitted",
  "interviewing",
  "rejected",
  "archived"
]);

const updateApplicationSchema = z.object({
  company: z.string().trim().min(1).max(120).optional(),
  role: z.string().trim().min(1).max(160).optional(),
  status: applicationStatusSchema.optional(),
  nextAction: z.string().trim().max(300).nullable().optional(),
  archived: z.boolean().optional()
});

type RouteParams = {
  params: Promise<{ id: string }>;
};

async function getApplicationForUser(id: string, userId: string) {
  return prisma.application.findFirst({
    where: { id, userId },
    include: {
      artifacts: {
        orderBy: [{ type: "asc" }, { version: "desc" }],
        select: {
          id: true,
          type: true,
          title: true,
          status: true,
          version: true,
          content: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  });
}

export async function GET(_request: Request, context: RouteParams) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to view this application." }, { status: 401 });
  }

  const { id } = await context.params;
  const application = await getApplicationForUser(id, user.id);

  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  return NextResponse.json({ application });
}

export async function PATCH(request: Request, context: RouteParams) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to update this application." }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await prisma.application.findFirst({
    where: { id, userId: user.id },
    select: { id: true }
  });

  if (!existing) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const parsed = updateApplicationSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the application update." },
      { status: 400 }
    );
  }

  const data: Prisma.ApplicationUpdateInput = {};

  if (parsed.data.company !== undefined) data.company = parsed.data.company;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.nextAction !== undefined) data.nextAction = parsed.data.nextAction;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.archived !== undefined) {
    data.archivedAt = parsed.data.archived ? new Date() : null;
    if (parsed.data.archived) data.status = "archived";
  }

  const application = await prisma.application.update({
    where: { id },
    data,
    include: {
      artifacts: {
        orderBy: [{ type: "asc" }, { version: "desc" }],
        select: {
          id: true,
          type: true,
          title: true,
          status: true,
          version: true,
          content: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  });

  return NextResponse.json({ application });
}
