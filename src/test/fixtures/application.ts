import { createInitialApplicationMemory } from "@/lib/memory";
import { jobPostTextFixture, jobSummaryFixture } from "./job-post";

export const applicationRecordFixture = {
  id: "app-fixture-1",
  userId: "user-fixture-1",
  company: "Example AI",
  role: "AI Engineer",
  slug: "example-ai-ai-engineer",
  status: "draft",
  nextAction: "Review the role requirements and choose strongest matching evidence.",
  archivedAt: null,
  jobPost: {
    source: "pasted_job_description",
    sourceUrl: null,
    content: jobPostTextFixture,
    capturedAt: "2026-08-13T00:00:00.000Z"
  },
  jobSummary: jobSummaryFixture,
  candidateSnapshot: {
    name: "Hatim Shaherawala"
  },
  selectedEvidence: {
    projects: ["AI API Gateway"],
    research: [],
    experience: [],
    skills: ["TypeScript", "Python", "PostgreSQL"]
  },
  notes: null,
  drafts: null
};

export const applicationMemoryFixture = createInitialApplicationMemory({
  company: applicationRecordFixture.company,
  role: applicationRecordFixture.role,
  jobPost: applicationRecordFixture.jobPost,
  jobSummary: applicationRecordFixture.jobSummary,
  candidateSnapshot: applicationRecordFixture.candidateSnapshot
});
