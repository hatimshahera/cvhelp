import PDFDocument from "pdfkit";

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizePdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x09\x0a\x0d\x20-\x7e£€]/g, "");
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return normalizePdfText(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => stringifyValue(item)).filter(Boolean).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${formatLabel(key)}: ${stringifyValue(item)}`)
      .join("\n");
  }

  return "";
}

function orderedContentEntries(content: unknown) {
  const record =
    content && typeof content === "object" && !Array.isArray(content)
      ? (content as Record<string, unknown>)
      : { content };
  const sectionOrder = [
    "summary",
    "profile_summary",
    "subject",
    "note",
    "message",
    "bullets",
    "answers",
    "evidenceUsed",
    "selectedEvidence",
    "gaps",
    "risks",
    "assumptions",
    "followUp",
    "selected_projects",
    "selected_research",
    "selected_experience",
    "selected_skills",
    "honesty_notes"
  ];
  const orderedKeys = [
    ...sectionOrder.filter((key) => key in record),
    ...Object.keys(record).filter((key) => !sectionOrder.includes(key))
  ];

  return orderedKeys
    .map((key) => [key, record[key]] as const)
    .filter(([, value]) => stringifyValue(value).trim().length > 0);
}

function writeSection(document: PDFKit.PDFDocument, key: string, value: unknown) {
  document.moveDown(0.8);
  document
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#11623f")
    .text(formatLabel(key), { continued: false });
  document.moveDown(0.25);

  if (Array.isArray(value)) {
    document.font("Helvetica").fontSize(10.5).fillColor("#17201b");
    value.map((item) => stringifyValue(item)).filter(Boolean).forEach((item) => {
      document.text(`- ${item}`, {
        indent: 12,
        lineGap: 3
      });
    });
    return;
  }

  document
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor("#17201b")
    .text(stringifyValue(value), { lineGap: 3 });
}

export function renderArtifactToPdf(input: {
  title: string;
  type: string;
  version: number;
  content: unknown;
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      margins: {
        top: 48,
        right: 48,
        bottom: 48,
        left: 48
      },
      info: {
        Title: normalizePdfText(input.title),
        Subject: formatLabel(input.type)
      }
    });
    const chunks: Buffer[] = [];

    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    document.font("Helvetica-Bold").fontSize(19).fillColor("#17201b").text(normalizePdfText(input.title), {
      lineGap: 2
    });
    document.moveDown(0.35);
    document
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor("#6a746e")
      .text(`${formatLabel(input.type)} v${input.version}`);
    document.moveDown(0.7);
    document.moveTo(48, document.y).lineTo(547, document.y).strokeColor("#dce5dd").stroke();

    const sections = orderedContentEntries(input.content);

    if (sections.length) {
      sections.forEach(([key, value]) => writeSection(document, key, value));
    } else {
      document.moveDown().font("Helvetica").fontSize(11).fillColor("#17201b").text("No artifact content saved.");
    }

    document.end();
  });
}
