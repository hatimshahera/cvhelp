import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { ChatMode } from "@/lib/chat/types";
import { prisma } from "@/lib/prisma";

export const sourceScopeSchema = z.enum(["profile", "application", "general"]);
export type SourceScope = z.infer<typeof sourceScopeSchema>;

export function sourceScopeForChatMode(mode: ChatMode): SourceScope {
  if (mode === "build_profile") return "profile";
  return mode;
}

export async function assertApplicationSourceScope({
  userId,
  applicationId
}: {
  userId: string;
  applicationId: string | null;
}) {
  if (!applicationId) return;

  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    select: { id: true }
  });

  if (!application) {
    throw new Error("Application not found.");
  }
}

export async function createTextSource({
  userId,
  scope,
  applicationId,
  kind,
  name,
  mimeType,
  sizeBytes,
  textContent,
  metadata
}: {
  userId: string;
  scope: SourceScope;
  applicationId?: string | null;
  kind: string;
  name?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  textContent?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  if (scope !== "application" && applicationId) {
    throw new Error("Only application-scoped sources can reference an application.");
  }
  if (scope === "application" && !applicationId) {
    throw new Error("Application-scoped sources require an application.");
  }
  await assertApplicationSourceScope({
    userId,
    applicationId: applicationId ?? null
  });

  return prisma.source.create({
    data: {
      userId,
      scope,
      applicationId: applicationId ?? null,
      kind,
      name: name ?? null,
      mimeType: mimeType ?? null,
      sizeBytes: sizeBytes ?? null,
      textContent: textContent ?? null,
      metadata
    }
  });
}

export async function getSourcesForChat({
  userId,
  mode,
  applicationId,
  sourceIds
}: {
  userId: string;
  mode: ChatMode;
  applicationId: string | null;
  sourceIds: string[];
}) {
  if (!sourceIds.length) return [];

  const scope = sourceScopeForChatMode(mode);
  const sources = await prisma.source.findMany({
    where: {
      id: { in: sourceIds },
      userId,
      scope,
      applicationId: scope === "application" ? applicationId : null
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      scope: true,
      applicationId: true,
      kind: true,
      name: true,
      textContent: true,
      metadata: true,
      createdAt: true
    }
  });

  if (sources.length !== new Set(sourceIds).size) {
    throw new Error("One or more attached sources are unavailable for this chat.");
  }

  return sources;
}

export async function linkSourcesToMessage({
  userId,
  messageId,
  sourceIds
}: {
  userId: string;
  messageId: string;
  sourceIds: string[];
}) {
  const uniqueSourceIds = [...new Set(sourceIds)];
  if (!uniqueSourceIds.length) return;

  await prisma.chatMessageSource.createMany({
    data: uniqueSourceIds.map((sourceId) => ({
      userId,
      messageId,
      sourceId
    })),
    skipDuplicates: true
  });
}

export async function moveSourcesToApplication({
  userId,
  sourceIds,
  applicationId
}: {
  userId: string;
  sourceIds: string[];
  applicationId: string;
}) {
  const uniqueSourceIds = [...new Set(sourceIds)];
  if (!uniqueSourceIds.length) return { count: 0 };

  await assertApplicationSourceScope({
    userId,
    applicationId
  });

  return prisma.source.updateMany({
    where: {
      id: { in: uniqueSourceIds },
      userId,
      scope: "general",
      applicationId: null
    },
    data: {
      scope: "application",
      applicationId
    }
  });
}

export function buildSourceSnippetContext(
  sources: Array<{
    id: string;
    kind: string;
    name: string | null;
    textContent: string | null;
  }>,
  maxCharsPerSource = 4000
) {
  if (!sources.length) return "";

  return sources
    .map((source) =>
      [
        `Source ${source.id}`,
        `Name: ${source.name ?? source.kind}`,
        `Kind: ${source.kind}`,
        "",
        (source.textContent || "No extracted text available.").slice(0, maxCharsPerSource)
      ].join("\n")
    )
    .join("\n\n---\n\n");
}
