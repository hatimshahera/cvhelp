import {
  type ApplicationMemory,
  createInitialApplicationMemory,
  selectedEvidenceSchema,
  toProofCvData
} from "./memory";

type ProofCvData = {
  candidate?: Record<string, unknown>;
  target?: {
    company?: string;
    role?: string;
    fit?: string[];
  };
  selected_projects?: string[];
  selected_research?: string[];
  selected_experience?: string[];
  selected_skills?: string[];
  profile_summary?: string;
  honesty_notes?: string[];
};

export function applicationMemoryFromProofCvData(input: {
  cvData: ProofCvData;
  jobPost?: {
    source: string;
    sourceUrl: string | null;
    content: string;
    capturedAt: string;
  };
}): ApplicationMemory {
  const company = input.cvData.target?.company || "Unknown company";
  const role = input.cvData.target?.role || "Untitled role";
  const memory = createInitialApplicationMemory({
    company,
    role,
    jobPost: input.jobPost ?? {
      source: "proofcv_import",
      sourceUrl: null,
      content: "",
      capturedAt: new Date().toISOString()
    },
    candidateSnapshot: input.cvData.candidate ?? {}
  });

  return {
    ...memory,
    target: {
      ...memory.target,
      fit: input.cvData.target?.fit ?? []
    },
    selectedEvidence: selectedEvidenceSchema.parse({
      projects: input.cvData.selected_projects ?? [],
      research: input.cvData.selected_research ?? [],
      experience: input.cvData.selected_experience ?? [],
      skills: input.cvData.selected_skills ?? []
    }),
    profileSummary: input.cvData.profile_summary ?? "",
    honestyNotes: input.cvData.honesty_notes ?? []
  };
}

export function proofCvDataFromApplicationMemory(input: {
  candidate: Record<string, unknown>;
  application: ApplicationMemory;
}) {
  return toProofCvData(input);
}
