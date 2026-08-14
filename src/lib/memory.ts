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

export const provenanceEntrySchema = z.object({
  sourceId: z.string().optional(),
  sourceType: z.string(),
  quote: z.string().optional(),
  confidence: z.enum(["user_provided", "extracted", "inferred"]).default("user_provided"),
  createdAt: z.string()
});

export const claimProvenanceSchema = z.record(z.string(), z.array(provenanceEntrySchema));

export const canonicalProfileSchema = z.object({
  identity: z.record(z.string(), z.unknown()).default({}),
  links: z.record(z.string(), z.unknown()).default({}),
  education: z.array(z.record(z.string(), z.unknown())).default([]),
  experience: z.array(z.record(z.string(), z.unknown())).default([]),
  projects: z.array(z.record(z.string(), z.unknown())).default([]),
  research: z.array(z.record(z.string(), z.unknown())).default([]),
  skills: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])).default([]),
  achievements: z.array(z.record(z.string(), z.unknown())).default([]),
  preferences: z.record(z.string(), z.unknown()).default({}),
  constraints: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(z.record(z.string(), z.unknown())).default([]),
  openQuestions: z.array(z.string()).default([])
});

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
  claimProvenance: claimProvenanceSchema.default({}),
  nextActions: z.array(z.string()).default([])
});

export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type RawSourceEntry = z.infer<typeof rawSourceEntrySchema>;
export type RawSources = z.infer<typeof rawSourcesSchema>;
export type ProfileBankMemory = z.infer<typeof profileBankMemorySchema>;
export type ProvenanceEntry = z.infer<typeof provenanceEntrySchema>;
export type CanonicalProfile = z.infer<typeof canonicalProfileSchema>;
export type ApplicationMemory = z.infer<typeof applicationMemorySchema>;
export type SelectedEvidence = z.infer<typeof selectedEvidenceSchema>;
export type CanonicalProfileSection = keyof CanonicalProfile;

export const canonicalProfileSections = Object.keys(
  canonicalProfileSchema.shape
) as CanonicalProfileSection[];

export const defaultChecklist: ChecklistItem[] = [
  { id: "cv", label: "Add current CV", done: false },
  { id: "linkedin", label: "Add LinkedIn background", done: false },
  { id: "github", label: "Add GitHub/projects", done: false },
  { id: "experience", label: "Confirm work experience", done: false },
  { id: "education", label: "Confirm education", done: false },
  { id: "proof", label: "Collect evidence and metrics", done: false },
  { id: "preferences", label: "Confirm role preferences", done: false },
  { id: "review", label: "Review reusable profile", done: false }
];

export const profileIntakePrompts: Record<string, string> = {
  cv: "Paste or upload your current CV so I can build the first profile draft.",
  linkedin: "Add your LinkedIn summary or background notes.",
  github: "Add your GitHub, portfolio, or project list with links where possible.",
  experience: "Confirm your work experience, responsibilities, dates, and scope.",
  education: "Confirm your education, certifications, and relevant coursework.",
  proof: "Add evidence, metrics, outcomes, links, or proof for the strongest claims.",
  preferences: "Tell me the roles, industries, locations, salary range, and constraints you want me to optimize for.",
  review: "Review the structured profile and correct anything that is missing or overstated."
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseChecklist(value: unknown): ChecklistItem[] {
  const parsed = z.array(checklistItemSchema).safeParse(value);
  const current = parsed.success && parsed.data.length ? parsed.data : [];
  const byId = new Map(current.map((item) => [item.id, item]));

  return defaultChecklist.map((defaultItem) => ({
    ...defaultItem,
    done: byId.get(defaultItem.id)?.done ?? defaultItem.done
  }));
}

export function parseRawSources(value: unknown): RawSources {
  const parsed = rawSourcesSchema.safeParse(value);
  return parsed.success ? parsed.data : { entries: [] };
}

export function parseMasterProfile(value: unknown): Record<string, unknown> {
  const parsed = profileMasterSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function normalizeCanonicalProfileInput(value: Record<string, unknown>) {
  const next = { ...value };
  const arraySections: Array<keyof CanonicalProfile> = [
    "education",
    "experience",
    "projects",
    "research",
    "achievements",
    "evidence"
  ];

  for (const section of arraySections) {
    const sectionValue = next[section];
    if (isObject(sectionValue)) {
      next[section] = Object.values(sectionValue).flat().filter(Boolean);
    }
    if (Array.isArray(next[section])) {
      next[section] = next[section].map((item) => {
        if (isObject(item)) return item;
        return { value: item };
      });
    }
  }

  if (isObject(next.skills)) {
    next.skills = Object.entries(next.skills).flatMap(([group, skills]) => {
      if (Array.isArray(skills)) {
        return skills.map((skill) => (typeof skill === "string" ? skill : { group, value: skill }));
      }

      return [{ group, value: skills }];
    });
  }
  if (Array.isArray(next.skills)) {
    next.skills = next.skills
      .filter((skill) => skill !== null && skill !== undefined)
      .map((skill) => (typeof skill === "string" || isObject(skill) ? skill : String(skill)));
  }

  if (next.openQuestions && !Array.isArray(next.openQuestions)) {
    next.openQuestions = isObject(next.openQuestions)
      ? Object.values(next.openQuestions).map(String)
      : [String(next.openQuestions)];
  } else if (Array.isArray(next.openQuestions)) {
    next.openQuestions = next.openQuestions.map(String);
  }

  return next;
}

export function parseCanonicalProfile(value: unknown): CanonicalProfile {
  const normalized = normalizeCanonicalProfileInput(parseMasterProfile(value));
  const parsed = canonicalProfileSchema.safeParse(normalized);

  if (parsed.success) return parsed.data;

  return canonicalProfileSections.reduce((profile, section) => {
    const sectionSchema = canonicalProfileSchema.shape[section];
    const sectionParsed = sectionSchema.safeParse(normalized[section]);
    const defaultParsed = sectionSchema.parse(undefined);

    return {
      ...profile,
      [section]: sectionParsed.success ? sectionParsed.data : defaultParsed
    };
  }, {} as CanonicalProfile);
}

export function parseCanonicalProfileSection(
  section: CanonicalProfileSection,
  value: unknown
): CanonicalProfile[CanonicalProfileSection] {
  const sectionSchema = canonicalProfileSchema.shape[section];
  return sectionSchema.parse(value);
}

export function updateCanonicalProfileSection(
  currentProfile: unknown,
  section: CanonicalProfileSection,
  value: unknown
): CanonicalProfile {
  const profile = parseCanonicalProfile(currentProfile);
  const parsedValue = parseCanonicalProfileSection(section, value);

  return canonicalProfileSchema.parse({
    ...profile,
    [section]: parsedValue
  });
}

export function attachProvenanceToProfileFact<T extends Record<string, unknown>>(
  fact: T,
  provenance: ProvenanceEntry
) {
  const current = Array.isArray(fact.provenance) ? fact.provenance : [];

  return {
    ...fact,
    provenance: [...current, provenanceEntrySchema.parse(provenance)]
  };
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
  const canonicalProfile = parseCanonicalProfile(masterProfile);
  const rawSources = parseRawSources(input?.rawSources);
  const checklist = parseChecklist(input?.checklist);
  const sections = Object.keys(masterProfile).filter((key) => {
    const value = masterProfile[key];
    if (Array.isArray(value)) return value.length > 0;
    if (isObject(value)) return Object.keys(value).length > 0;
    return Boolean(value);
  });
  const requiredSections: Array<keyof CanonicalProfile> = [
    "identity",
    "links",
    "education",
    "experience",
    "projects",
    "skills",
    "evidence"
  ];
  const completedSections = requiredSections.filter((section) => {
    const value = canonicalProfile[section];
    if (Array.isArray(value)) return value.length > 0;
    if (isObject(value)) return Object.keys(value).length > 0;
    return Boolean(value);
  });
  const checklistDoneCount = checklist.filter((item) => item.done).length;
  const intake = getProfileIntakeState(checklist);
  const sectionScore = completedSections.length / requiredSections.length;
  const checklistScore = checklist.length ? checklistDoneCount / checklist.length : 0;
  const completeness = Math.round((sectionScore * 0.65 + checklistScore * 0.35) * 100);
  const missingSections = requiredSections
    .filter((section) => !completedSections.includes(section))
    .map((section) => String(section));

  return {
    sourceCount: rawSources.entries.length,
    checklist,
    intake,
    hasMasterProfile: sections.length > 0,
    sections,
    completeness,
    missingSections,
    evidenceCounts: {
      education: canonicalProfile.education.length,
      experience: canonicalProfile.experience.length,
      projects: canonicalProfile.projects.length,
      research: canonicalProfile.research.length,
      skills: canonicalProfile.skills.length,
      evidence: canonicalProfile.evidence.length
    }
  };
}

export function getProfileIntakeState(checklistInput: unknown) {
  const checklist = parseChecklist(checklistInput);
  const activeStep = checklist.find((item) => !item.done) ?? checklist[checklist.length - 1] ?? null;
  const completedCount = checklist.filter((item) => item.done).length;

  return {
    activeStep,
    nextPrompt: activeStep ? profileIntakePrompts[activeStep.id] ?? activeStep.label : "Profile intake is complete.",
    completedCount,
    totalCount: checklist.length,
    complete: checklist.length > 0 && completedCount === checklist.length
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
    if (item.id === "preferences" && /preference|remote|hybrid|onsite|salary|location|industry|role|roles/.test(lower)) {
      return { ...item, done: true };
    }
    if (item.id === "review" && /review|correct|correction|final|looks good|approved/.test(lower)) {
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
  const sourceProvenance = provenanceEntrySchema.parse({
    sourceType: input.jobPost.source,
    sourceId: input.jobPost.sourceUrl ?? "job_post",
    quote: input.jobPost.content.slice(0, 500),
    confidence: "extracted",
    createdAt: input.jobPost.capturedAt
  });

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
    claimProvenance: {
      requirements: input.jobSummary?.requirements?.length ? [sourceProvenance] : [],
      responsibilities: input.jobSummary?.responsibilities?.length ? [sourceProvenance] : [],
      keywords: input.jobSummary?.keywords?.length ? [sourceProvenance] : []
    },
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
    honesty_notes: input.application.honestyNotes,
    claim_provenance: input.application.claimProvenance
  };
}
