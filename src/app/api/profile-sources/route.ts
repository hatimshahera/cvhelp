import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const maxFiles = 6;
const maxFileBytes = 5 * 1024 * 1024;

const defaultChecklist = [
  { id: "cv", label: "Add current CV", done: false },
  { id: "linkedin", label: "Add LinkedIn background", done: false },
  { id: "github", label: "Add GitHub/projects", done: false },
  { id: "experience", label: "Confirm work experience", done: false },
  { id: "education", label: "Confirm education", done: false },
  { id: "proof", label: "Collect evidence and metrics", done: false }
];

type RawSources = {
  entries: Array<{
    id: string;
    type: string;
    content: string;
    createdAt: string;
  }>;
};

type ChecklistItem = { id: string; label: string; done: boolean };

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

function isChecklistItem(value: unknown): value is ChecklistItem {
  if (!value || typeof value !== "object") return false;

  return (
    "id" in value &&
    "label" in value &&
    "done" in value &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.done === "boolean"
  );
}

function summarizeProfileBank(profileBank: {
  masterProfile: unknown;
  rawSources: unknown;
  checklist: unknown;
}) {
  const rawSources = profileBank.rawSources as RawSources | null;
  const checklist = Array.isArray(profileBank.checklist) ? profileBank.checklist : defaultChecklist;
  const masterProfile =
    profileBank.masterProfile &&
    typeof profileBank.masterProfile === "object" &&
    !Array.isArray(profileBank.masterProfile)
      ? (profileBank.masterProfile as Record<string, unknown>)
      : {};

  return {
    sourceCount: Array.isArray(rawSources?.entries) ? rawSources.entries.length : 0,
    checklist,
    hasMasterProfile: Object.keys(masterProfile).length > 0,
    sections: Object.keys(masterProfile)
  };
}

async function requireUser() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) return null;
  return { id: userId };
}

async function getOrCreateProfileBank(userId: string) {
  return prisma.profileBank.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      masterProfile: {},
      rawSources: { entries: [] },
      checklist: defaultChecklist
    }
  });
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to upload files." }, { status: 401 });
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

  const profileBank = await getOrCreateProfileBank(user.id);
  const rawSources = profileBank.rawSources as RawSources | null;
  const entries = Array.isArray(rawSources?.entries) ? rawSources.entries : [];
  const uploaded = [];

  for (const file of files) {
    if (file.size > maxFileBytes) {
      return NextResponse.json(
        { error: `${file.name} is too large. Keep files under 5MB for now.` },
        { status: 400 }
      );
    }

    const extraction = await extractFileText(file).catch((error) => {
      console.error("File extraction failed", error);
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

    entries.push({
      id: crypto.randomUUID(),
      type: extraction.sourceType,
      content,
      createdAt: new Date().toISOString()
    });
  }

  const lowerNames = uploaded.map((file) => file.name.toLowerCase()).join(" ");
  const existingChecklist = Array.isArray(profileBank.checklist)
    ? profileBank.checklist.filter(isChecklistItem)
    : defaultChecklist;
  const checklist = (existingChecklist.length ? existingChecklist : defaultChecklist).map(
    (item) => {
      if (item.id === "cv" && /\bcv\b|resume|curriculum/.test(lowerNames)) return { ...item, done: true };
      if (item.id === "linkedin" && lowerNames.includes("linkedin")) return { ...item, done: true };
      if (item.id === "github" && lowerNames.includes("github")) return { ...item, done: true };
      return item;
    }
  );

  const updatedProfileBank = await prisma.profileBank.update({
    where: { userId: user.id },
    data: {
      rawSources: { entries: entries.slice(-100) },
      checklist
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
}
