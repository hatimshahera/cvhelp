import { z } from "zod";

export const checklistItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  done: z.boolean()
});

export const rawSourceEntrySchema = z.object({
  id: z.string(),
  type: z.string(),
  content: z.string(),
  createdAt: z.string(),
  name: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const rawSourcesSchema = z.object({
  entries: z.array(rawSourceEntrySchema)
});

export const profileMasterSchema = z.record(z.string(), z.unknown());

export const profileBankMemorySchema = z.object({
  masterProfile: profileMasterSchema,
  rawSources: rawSourcesSchema,
  checklist: z.array(checklistItemSchema)
});

const applicationTargetSchema = z.object({
  company: z.string(),
  role: z.string(),
  fit: z.array(z.string()).default([])
});

export const selectedEvidenceSchema = z.object({
  projects: z.array(z.string()).default([]),
  research: z.array(z.string()).default([]),
  experience: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([])
});

export const applicationMemorySchema = z.object({
  candidateSnapshot: z.record(z.string(), z.unknown()).default({}),
  target: applicationTargetSchema,
  jobPost: z.object({
    source: z.string(),
    sourceUrl: z.string().nullable(),
    content: z.string(),
    capturedAt: z.string()
  }),
  requirements: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  selectedEvidence: selectedEvidenceSchema.default({
    projects: [],
    research: [],
    experience: [],
    skills: []
  }),
  profileSummary: z.string().default(""),
  honestyNotes: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  notes: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      content: z.string(),
      createdAt: z.string()
    })
  ).default([]),
  drafts: z.record(z.string(), z.unknown()).default({}),
  nextActions: z.array(z.string()).default([])
});

export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type RawSourceEntry = z.infer<typeof rawSourceEntrySchema>;
export type RawSources = z.infer<typeof rawSourcesSchema>;
export type ProfileBankMemory = z.infer<typeof profileBankMemorySchema>;
export type ApplicationMemory = z.infer<typeof applicationMemorySchema>;
export type SelectedEvidence = z.infer<typeof selectedEvidenceSchema>;

export const defaultChecklist: ChecklistItem[] = [
  { id: "cv", label: "Add current CV", done: false },
  { id: "linkedin", label: "Add LinkedIn background", done: false },
  { id: "github", label: "Add GitHub/projects", done: false },
  { id: "experience", label: "Confirm work experience", done: false },
  { id: "education", label: "Confirm education", done: false },
  { id: "proof", label: "Collect evidence and metrics", done: false }
];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseChecklist(value: unknown): ChecklistItem[] {
  const parsed = z.array(checklistItemSchema).safeParse(value);
  return parsed.success && parsed.data.length ? parsed.data : defaultChecklist;
}

export function parseRawSources(value: unknown): RawSources {
  const parsed = rawSourcesSchema.safeParse(value);
  return parsed.success ? parsed.data : { entries: [] };
}

export function parseMasterProfile(value: unknown): Record<string, unknown> {
  const parsed = profileMasterSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function createDefaultProfileBankData(): ProfileBankMemory {
  return {
    masterProfile: {},
    rawSources: { entries: [] },
    checklist: defaultChecklist
  };
}

export function summarizeProfileBank(input: {
  masterProfile: unknown;
  rawSources: unknown;
  checklist: unknown;
} | null) {
  const masterProfile = parseMasterProfile(input?.masterProfile);
  const rawSources = parseRawSources(input?.rawSources);
  const checklist = parseChecklist(input?.checklist);
  const sections = Object.keys(masterProfile).filter((key) => {
    const value = masterProfile[key];
    if (Array.isArray(value)) return value.length > 0;
    if (isObject(value)) return Object.keys(value).length > 0;
    return Boolean(value);
  });

  return {
    sourceCount: rawSources.entries.length,
    checklist,
    hasMasterProfile: sections.length > 0,
    sections
  };
}

export function appendRawSource(
  existing: unknown,
  entry: RawSourceEntry,
  maxEntries = 100
): RawSources {
  const rawSources = parseRawSources(existing);
  return {
    entries: [...rawSources.entries, entry].slice(-maxEntries)
  };
}

export function markChecklistFromText(checklist: unknown, text: string): ChecklistItem[] {
  const lower = text.toLowerCase();

  return parseChecklist(checklist).map((item) => {
    if (item.id === "cv" && /\bcv\b|resume|curriculum vitae|curriculum/.test(lower)) {
      return { ...item, done: true };
    }
    if (item.id === "linkedin" && lower.includes("linkedin")) return { ...item, done: true };
    if (item.id === "github" && lower.includes("github")) return { ...item, done: true };
    if (item.id === "experience" && /experience|worked|built|role|company/.test(lower)) {
      return { ...item, done: true };
    }
    if (item.id === "education" && /education|degree|university|college|school/.test(lower)) {
      return { ...item, done: true };
    }
    if (item.id === "proof" && /metric|impact|result|evidence|users|revenue|latency|accuracy/.test(lower)) {
      return { ...item, done: true };
    }
    return item;
  });
}

export function getRecentSourceContext(rawSources: unknown, limit = 6) {
  return parseRawSources(rawSources).entries
    .slice(-limit)
    .map((entry) => {
      const content = entry.content.length > 1800 ? `${entry.content.slice(0, 1800)}...` : entry.content;
      return `Source ${entry.id} (${entry.type}):\n${content}`;
    })
    .join("\n\n");
}

export function createInitialApplicationMemory(input: {
  company: string;
  role: string;
  jobPost: {
    source: string;
    sourceUrl: string | null;
    content: string;
    capturedAt: string;
  };
  jobSummary?: {
    requirements?: string[];
    responsibilities?: string[];
    keywords?: string[];
  };
  candidateSnapshot?: Record<string, unknown>;
}): ApplicationMemory {
  return applicationMemorySchema.parse({
    candidateSnapshot: input.candidateSnapshot ?? {},
    target: {
      company: input.company,
      role: input.role,
      fit: []
    },
    jobPost: input.jobPost,
    requirements: input.jobSummary?.requirements ?? [],
    responsibilities: input.jobSummary?.responsibilities ?? [],
    keywords: input.jobSummary?.keywords ?? [],
    selectedEvidence: {
      projects: [],
      research: [],
      experience: [],
      skills: []
    },
    profileSummary: "",
    honestyNotes: [],
    risks: [],
    gaps: [],
    notes: [],
    drafts: {},
    nextActions: ["Review the role requirements and choose strongest matching evidence."]
  });
}

export function parseApplicationMemory(value: unknown, fallback: ApplicationMemory): ApplicationMemory {
  const parsed = applicationMemorySchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

export function appendApplicationMemoryNote(
  memory: ApplicationMemory,
  note: { id: string; type: string; content: string; createdAt: string },
  maxNotes = 80
): ApplicationMemory {
  return applicationMemorySchema.parse({
    ...memory,
    notes: [...memory.notes, note].slice(-maxNotes)
  });
}

export function toProofCvData(input: {
  candidate: Record<string, unknown>;
  application: ApplicationMemory;
}) {
  return {
    candidate: input.candidate,
    target: {
      company: input.application.target.company,
      role: input.application.target.role,
      fit: input.application.target.fit
    },
    selected_projects: input.application.selectedEvidence.projects,
    selected_research: input.application.selectedEvidence.research,
    selected_experience: input.application.selectedEvidence.experience,
    selected_skills: input.application.selectedEvidence.skills,
    profile_summary: input.application.profileSummary,
    honesty_notes: input.application.honestyNotes
  };
}
