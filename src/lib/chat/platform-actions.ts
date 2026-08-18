import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const applicationStatusSchema = z.enum([
  "draft",
  "researching",
  "tailoring_cv",
  "cover_note_ready",
  "submitted",
  "interviewing",
  "rejected",
  "archived"
]);

export const archiveApplicationActionInputSchema = z.object({
  type: z.literal("archive_application"),
  applicationId: z.string(),
  reason: z.string().trim().max(300).optional(),
  confirmed: z.literal(true)
});

export const restoreApplicationActionInputSchema = z.object({
  type: z.literal("restore_application"),
  applicationId: z.string(),
  reason: z.string().trim().max(300).optional(),
  confirmed: z.literal(true)
});

export const updateApplicationStatusActionInputSchema = z.object({
  type: z.literal("update_application_status"),
  applicationId: z.string(),
  status: applicationStatusSchema.exclude(["archived"]),
  reason: z.string().trim().max(300).optional(),
  confirmed: z.literal(true)
});

export const renameApplicationActionInputSchema = z.object({
  type: z.literal("rename_application"),
  applicationId: z.string(),
  company: z.string().trim().min(1).max(120).optional(),
  role: z.string().trim().min(1).max(160).optional(),
  reason: z.string().trim().max(300).optional(),
  confirmed: z.literal(true)
});

export const compareApplicationsActionInputSchema = z.object({
  type: z.literal("compare_applications"),
  applicationIds: z.array(z.string()).min(2).max(5)
});

export const platformActionInputSchema = z.discriminatedUnion("type", [
  archiveApplicationActionInputSchema,
  restoreApplicationActionInputSchema,
  updateApplicationStatusActionInputSchema,
  renameApplicationActionInputSchema,
  compareApplicationsActionInputSchema
]);

export type PlatformActionInput = z.infer<typeof platformActionInputSchema>;

export class PlatformActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function appendAuditNote({
  notes,
  action,
  reason
}: {
  notes: unknown;
  action: PlatformActionInput["type"];
  reason?: string;
}) {
  const existing = notes && typeof notes === "object" && !Array.isArray(notes) ? notes : {};
  const entries = Array.isArray((existing as { entries?: unknown }).entries)
    ? ((existing as { entries: unknown[] }).entries)
    : [];

  return {
    ...existing,
    entries: [
      ...entries,
      {
        id: crypto.randomUUID(),
        type: "platform_action",
        action,
        reason: reason ?? null,
        createdAt: new Date().toISOString()
      }
    ].slice(-120)
  };
}

async function getApplicationForAction(userId: string, applicationId: string) {
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      userId
    },
    select: {
      id: true,
      company: true,
      role: true,
      status: true,
      archivedAt: true,
      notes: true
    }
  });

  if (!application) {
    throw new PlatformActionError("Application not found.", 404);
  }

  return application;
}

async function updateApplicationWithAudit({
  userId,
  applicationId,
  data,
  action,
  reason
}: {
  userId: string;
  applicationId: string;
  data: Prisma.ApplicationUpdateInput;
  action: PlatformActionInput["type"];
  reason?: string;
}) {
  const application = await getApplicationForAction(userId, applicationId);

  return prisma.application.update({
    where: { id: application.id },
    data: {
      ...data,
      notes: appendAuditNote({
        notes: application.notes,
        action,
        reason
      }) as Prisma.InputJsonValue
    },
    select: {
      id: true,
      company: true,
      role: true,
      status: true,
      nextAction: true,
      archivedAt: true,
      updatedAt: true
    }
  });
}

export async function executePlatformAction({
  userId,
  input
}: {
  userId: string;
  input: PlatformActionInput;
}) {
  switch (input.type) {
    case "archive_application": {
      const application = await updateApplicationWithAudit({
        userId,
        applicationId: input.applicationId,
        action: input.type,
        reason: input.reason,
        data: {
          status: "archived",
          archivedAt: new Date()
        }
      });

      return { type: input.type, application };
    }
    case "restore_application": {
      const application = await updateApplicationWithAudit({
        userId,
        applicationId: input.applicationId,
        action: input.type,
        reason: input.reason,
        data: {
          status: "draft",
          archivedAt: null
        }
      });

      return { type: input.type, application };
    }
    case "update_application_status": {
      const application = await updateApplicationWithAudit({
        userId,
        applicationId: input.applicationId,
        action: input.type,
        reason: input.reason,
        data: {
          status: input.status,
          archivedAt: null
        }
      });

      return { type: input.type, application };
    }
    case "rename_application": {
      if (input.company === undefined && input.role === undefined) {
        throw new PlatformActionError("Provide a company or role to rename the application.");
      }

      const application = await updateApplicationWithAudit({
        userId,
        applicationId: input.applicationId,
        action: input.type,
        reason: input.reason,
        data: {
          ...(input.company !== undefined ? { company: input.company } : {}),
          ...(input.role !== undefined ? { role: input.role } : {})
        }
      });

      return { type: input.type, application };
    }
    case "compare_applications": {
      const applicationIds = uniqueValues(input.applicationIds);
      const applications = await prisma.application.findMany({
        where: {
          userId,
          id: {
            in: applicationIds
          }
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          company: true,
          role: true,
          status: true,
          nextAction: true,
          jobSummary: true,
          updatedAt: true
        }
      });

      if (applications.length !== applicationIds.length) {
        throw new PlatformActionError("One or more applications were not found.", 404);
      }

      return {
        type: input.type,
        applications
      };
    }
  }
}
