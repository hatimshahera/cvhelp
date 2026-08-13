function escapeTex(value: string) {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
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

function renderTexSection(key: string, value: unknown) {
  if (value === null || value === undefined) return "";
  const label = escapeTex(formatLabel(key));

  if (Array.isArray(value)) {
    const items = value.map((item) => stringifyValue(item)).filter(Boolean);
    if (!items.length) return "";

    return [
      `\\section*{${label}}`,
      "\\begin{itemize}",
      ...items.map((item) => `  \\item ${escapeTex(item)}`),
      "\\end{itemize}"
    ].join("\n");
  }

  const content = stringifyValue(value);
  if (!content) return "";

  return [`\\section*{${label}}`, escapeTex(content)].join("\n");
}

export function artifactToTex(input: {
  title: string;
  type: string;
  version: number;
  content: unknown;
}) {
  const content =
    input.content && typeof input.content === "object" && !Array.isArray(input.content)
      ? (input.content as Record<string, unknown>)
      : { content: input.content };
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
    ...sectionOrder.filter((key) => key in content),
    ...Object.keys(content).filter((key) => !sectionOrder.includes(key))
  ];
  const sections = orderedKeys.map((key) => renderTexSection(key, content[key])).filter(Boolean);

  return [
    "\\documentclass[11pt]{article}",
    "\\usepackage[margin=0.75in]{geometry}",
    "\\usepackage[T1]{fontenc}",
    "\\usepackage{enumitem}",
    "\\setlist[itemize]{leftmargin=*, itemsep=0.25em}",
    "\\begin{document}",
    `\\section*{${escapeTex(input.title)}}`,
    `\\textbf{Type:} ${escapeTex(formatLabel(input.type))} \\quad \\textbf{Version:} ${input.version}`,
    "",
    sections.join("\n\n") || "No artifact content saved.",
    "\\end{document}",
    ""
  ].join("\n");
}

export function texFilename(input: { type: string; version: number }) {
  return `${input.type}-v${input.version}.tex`.replace(/[^a-zA-Z0-9_.-]/g, "-");
}
