import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendRawSource,
  createDefaultProfileBankData,
  markChecklistFromText,
  parseChecklist,
  parseRawSources,
  summarizeProfileBank
} from "@/lib/memory";
import { checkFeatureLimit, getBillingStatus } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { checkRequestLimit, getIntegerEnv } from "@/lib/rate-limit";
import { logError } from "@/lib/server-log";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const maxFiles = 6;
const maxFileBytes = 5 * 1024 * 1024;
const maxBatchBytes = 12 * 1024 * 1024;
const deleteSourceSchema = z.object({
  sourceId: z.string().min(1)
});

function isTextLike(file: File) {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("text/") ||
    [
      ".csv",
      ".json",
      ".md",
      ".markdown",
      ".tex",
      ".txt",
      ".yaml",
      ".yml",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".py",
      ".rb",
      ".go",
      ".rs",
      ".java",
      ".c",
      ".cpp",
      ".h",
      ".css",
      ".html"
    ].some((extension) => name.endsWith(extension))
  );
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isAllowedUpload(file: File) {
  return isTextLike(file) || isPdf(file);
}

async function extractFileText(file: File) {
  if (isTextLike(file)) {
    return {
      extractedText: await file.text(),
      extracted: true,
      sourceType: "file_upload_text"
    };
  }

  if (isPdf(file)) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return {
        extractedText: parsed.text.trim(),
        extracted: Boolean(parsed.text.trim()),
        sourceType: "file_upload_pdf"
      };
    } finally {
      await parser.destroy();
    }
  }

  return {
    extractedText: "",
    extracted: false,
    sourceType: "file_upload_binary"
  };
}

async function getOrCreateProfileBank(userId: string) {
  const defaults = createDefaultProfileBankData();
  return prisma.profileBank.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      masterProfile: defaults.masterProfile as Prisma.InputJsonValue,
      rawSources: defaults.rawSources as Prisma.InputJsonValue,
      checklist: defaults.checklist as Prisma.InputJsonValue
    }
  });
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to upload files." }, { status: 401 });
    }

    const requestLimit = checkRequestLimit({
      key: `upload:${user.id}`,
      limit: getIntegerEnv("CVHELP_UPLOAD_RATE_LIMIT", 20),
      windowMs: getIntegerEnv("CVHELP_UPLOAD_RATE_WINDOW_MS", 60_000)
    });

    if (!requestLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many upload requests. Wait a moment and try again.",
          limit: requestLimit.limit,
          resetAt: new Date(requestLimit.resetAt).toISOString()
        },
        { status: 429 }
      );
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Upload one or more files." }, { status: 400 });
    }

    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File && Boolean(value.name));

    if (!files.length) {
      return NextResponse.json({ error: "Choose at least one file." }, { status: 400 });
    }

    if (files.length > maxFiles) {
      return NextResponse.json({ error: `Upload ${maxFiles} files or fewer at a time.` }, { status: 400 });
    }

    const blockedFile = files.find((file) => !isAllowedUpload(file));
    if (blockedFile) {
      return NextResponse.json(
        { error: `${blockedFile.name} is not a supported upload type. Use PDF or text-based files.` },
        { status: 400 }
      );
    }

    const batchBytes = files.reduce((total, file) => total + file.size, 0);
    if (batchBytes > maxBatchBytes) {
      return NextResponse.json({ error: "Keep each upload batch under 12MB for now." }, { status: 400 });
    }

    const profileBank = await getOrCreateProfileBank(user.id);
    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id }
    });
    const billing = getBillingStatus(subscription);
    const uploadCount = parseRawSources(profileBank.rawSources).entries.filter((entry) =>
      entry.type.startsWith("file_upload")
    ).length;
    const uploadLimit = checkFeatureLimit({
      plan: billing.plan,
      feature: "uploads",
      used: uploadCount
    });

    if (files.length > uploadLimit.remaining) {
      return NextResponse.json(
        {
          error: `You have ${uploadLimit.remaining} uploads remaining on the ${billing.plan} plan.`,
          billing
        },
        { status: 402 }
      );
    }

    let rawSources: unknown = profileBank.rawSources;
    const uploaded = [];

    for (const file of files) {
      if (file.size > maxFileBytes) {
        return NextResponse.json(
          { error: `${file.name} is too large. Keep files under 5MB for now.` },
          { status: 400 }
        );
      }

      const extraction = await extractFileText(file).catch((error) => {
        logError("File extraction failed", error, {
          userId: user.id,
          fileName: file.name,
          fileType: file.type || "unknown",
          fileSize: file.size
        });
        return {
          extractedText: "",
          extracted: false,
          sourceType: isPdf(file) ? "file_upload_pdf_failed" : "file_upload_binary"
        };
      });
      const content = extraction.extracted
        ? [
            `Uploaded file: ${file.name}`,
            `Type: ${file.type || "unknown"}`,
            `Size: ${file.size} bytes`,
            "",
            extraction.extractedText.slice(0, 20000)
          ].join("\n")
        : [
            `Uploaded file: ${file.name}`,
            `Type: ${file.type || "unknown"}`,
            `Size: ${file.size} bytes`,
            "",
            isPdf(file)
              ? "This PDF was saved as an uploaded source, but text extraction failed. If it is scanned or image-only, paste the relevant text into chat for now."
              : "This file was saved as an uploaded source, but text extraction is not available for this file type yet."
          ].join("\n");

      uploaded.push({
        name: file.name,
        size: file.size,
        type: file.type || "unknown",
        isPdf: isPdf(file),
        extractedText: extraction.extracted
      });

      rawSources = appendRawSource(rawSources, {
        id: crypto.randomUUID(),
        type: extraction.sourceType,
        content,
        createdAt: new Date().toISOString(),
        name: file.name,
        metadata: {
          fileType: file.type || "unknown",
          fileSize: file.size
        }
      });
    }

    const lowerNames = uploaded.map((file) => file.name.toLowerCase()).join(" ");
    const checklist = markChecklistFromText(parseChecklist(profileBank.checklist), lowerNames);

    const updatedProfileBank = await prisma.profileBank.update({
      where: { userId: user.id },
      data: {
        rawSources: rawSources as Prisma.InputJsonValue,
        checklist: checklist as Prisma.InputJsonValue
      }
    });

    return NextResponse.json({
      uploaded,
      profileBank: summarizeProfileBank(updatedProfileBank),
      messageContext: uploaded
        .map((file) =>
          file.extractedText
            ? `Uploaded ${file.name}; text was extracted and saved to the profile bank.`
            : file.isPdf
              ? `Uploaded ${file.name}; metadata was saved, but PDF text extraction failed. If this is a scanned PDF, paste the text or upload a text-based PDF.`
              : `Uploaded ${file.name}; metadata was saved, but text extraction is not available for this file type yet.`
        )
        .join("\n")
    });
  } catch (error) {
    logError("Profile source upload failed", error);
    return NextResponse.json({ error: "The file upload failed on the server." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to delete sources." }, { status: 401 });
    }

    const parsed = deleteSourceSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Choose a source to delete." },
        { status: 400 }
      );
    }

    const profileBank = await getOrCreateProfileBank(user.id);
    const rawSources = parseRawSources(profileBank.rawSources);
    const nextEntries = rawSources.entries.filter((entry) => entry.id !== parsed.data.sourceId);

    if (nextEntries.length === rawSources.entries.length) {
      return NextResponse.json({ error: "Source not found." }, { status: 404 });
    }

    const updatedProfileBank = await prisma.profileBank.update({
      where: { userId: user.id },
      data: {
        rawSources: { entries: nextEntries } as Prisma.InputJsonValue
      }
    });

    return NextResponse.json({
      deletedSourceId: parsed.data.sourceId,
      profileBank: summarizeProfileBank(updatedProfileBank)
    });
  } catch (error) {
    console.error("Profile source deletion failed", error);
    return NextResponse.json({ error: "The source delete failed on the server." }, { status: 500 });
  }
}
