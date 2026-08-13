import { describe, expect, it } from "vitest";
import {
  appendApplicationMemoryNote,
  appendRawSource,
  createDefaultProfileBankData,
  createInitialApplicationMemory,
  markChecklistFromText,
  parseCanonicalProfile,
  parseApplicationMemory,
  summarizeProfileBank,
  toProofCvData
} from "./memory";
import { applicationMemoryFromProofCvData, proofCvDataFromApplicationMemory } from "./proofcv";

describe("profile memory helpers", () => {
  it("creates a default profile bank shape", () => {
    const profileBank = createDefaultProfileBankData();

    expect(profileBank.masterProfile).toEqual({});
    expect(profileBank.rawSources.entries).toEqual([]);
    expect(profileBank.checklist.some((item) => item.id === "cv")).toBe(true);
  });

  it("appends raw sources with a max entry limit", () => {
    const first = appendRawSource(
      { entries: [] },
      { id: "1", type: "chat_note", content: "first", createdAt: "2026-08-13T00:00:00.000Z" },
      1
    );
    const second = appendRawSource(
      first,
      { id: "2", type: "chat_note", content: "second", createdAt: "2026-08-13T00:01:00.000Z" },
      1
    );

    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]?.id).toBe("2");
  });

  it("marks checklist items from user-provided evidence text", () => {
    const checklist = markChecklistFromText(
      createDefaultProfileBankData().checklist,
      "My CV includes GitHub projects, university education, and latency metrics."
    );

    expect(checklist.find((item) => item.id === "cv")?.done).toBe(true);
    expect(checklist.find((item) => item.id === "github")?.done).toBe(true);
    expect(checklist.find((item) => item.id === "education")?.done).toBe(true);
    expect(checklist.find((item) => item.id === "proof")?.done).toBe(true);
  });

  it("summarizes populated profile sections", () => {
    const summary = summarizeProfileBank({
      masterProfile: {
        projects: [{ name: "AI API Gateway" }],
        empty: []
      },
      rawSources: {
        entries: [
          { id: "source-1", type: "chat_note", content: "Built projects.", createdAt: "2026-08-13" }
        ]
      },
      checklist: createDefaultProfileBankData().checklist
    });

    expect(summary.sourceCount).toBe(1);
    expect(summary.hasMasterProfile).toBe(true);
    expect(summary.sections).toEqual(["projects"]);
    expect(summary.completeness).toBeGreaterThan(0);
    expect(summary.missingSections).toContain("education");
    expect(summary.evidenceCounts.projects).toBe(1);
  });

  it("normalizes missing canonical profile sections", () => {
    const profile = parseCanonicalProfile({
      identity: { name: "Hatim Shaherawala" },
      projects: [{ name: "AI API Gateway" }]
    });

    expect(profile.identity).toEqual({ name: "Hatim Shaherawala" });
    expect(profile.projects).toEqual([{ name: "AI API Gateway" }]);
    expect(profile.education).toEqual([]);
    expect(profile.openQuestions).toEqual([]);
  });
});

describe("application memory helpers", () => {
  const jobPost = {
    source: "pasted_job_description",
    sourceUrl: null,
    content: "Build AI agents and evaluation systems.",
    capturedAt: "2026-08-13T00:00:00.000Z"
  };

  it("creates initial application memory from a job post", () => {
    const memory = createInitialApplicationMemory({
      company: "Example AI",
      role: "AI Engineer",
      jobPost,
      jobSummary: {
        requirements: ["Python"],
        responsibilities: ["Build agents"],
        keywords: ["LLM"]
      }
    });

    expect(memory.target.company).toBe("Example AI");
    expect(memory.target.role).toBe("AI Engineer");
    expect(memory.requirements).toEqual(["Python"]);
    expect(memory.selectedEvidence.projects).toEqual([]);
    expect(memory.nextActions[0]).toContain("Review the role");
  });

  it("falls back when stored memory is invalid", () => {
    const fallback = createInitialApplicationMemory({
      company: "Example AI",
      role: "AI Engineer",
      jobPost
    });

    expect(parseApplicationMemory({ broken: true }, fallback)).toEqual(fallback);
  });

  it("appends application notes without losing existing memory", () => {
    const memory = createInitialApplicationMemory({
      company: "Example AI",
      role: "AI Engineer",
      jobPost
    });
    const updated = appendApplicationMemoryNote(memory, {
      id: "note-1",
      type: "chat_turn",
      content: "Matched AI API Gateway to backend AI requirements.",
      createdAt: "2026-08-13T00:01:00.000Z"
    });

    expect(updated.notes).toHaveLength(1);
    expect(updated.target.company).toBe("Example AI");
  });

  it("exports a ProofCV-compatible data shape", () => {
    const memory = createInitialApplicationMemory({
      company: "Example AI",
      role: "AI Engineer",
      jobPost
    });
    memory.selectedEvidence.projects = ["AI API Gateway"];
    memory.selectedEvidence.research = ["EV Charging Optimisation"];
    memory.profileSummary = "AI engineer with agent and RAG evidence.";
    memory.honestyNotes = ["Do not claim enterprise-scale production ownership."];

    const cvData = toProofCvData({
      candidate: { name: "Hatim Shaherawala" },
      application: memory
    });

    expect(cvData.candidate).toEqual({ name: "Hatim Shaherawala" });
    expect(cvData.target).toEqual({
      company: "Example AI",
      role: "AI Engineer",
      fit: []
    });
    expect(cvData.selected_projects).toEqual(["AI API Gateway"]);
    expect(cvData.honesty_notes).toEqual(["Do not claim enterprise-scale production ownership."]);
  });

  it("imports ProofCV application data into application memory", () => {
    const memory = applicationMemoryFromProofCvData({
      cvData: {
        candidate: { name: "Hatim Shaherawala" },
        target: {
          company: "WeDoTech",
          role: "AI Engineer",
          fit: ["Python", "RAG"]
        },
        selected_projects: ["AI API Gateway"],
        selected_research: ["EV Charging Optimisation"],
        profile_summary: "AI engineer building agent systems.",
        honesty_notes: ["Do not overstate senior production ownership."]
      }
    });

    expect(memory.candidateSnapshot).toEqual({ name: "Hatim Shaherawala" });
    expect(memory.target.company).toBe("WeDoTech");
    expect(memory.target.fit).toEqual(["Python", "RAG"]);
    expect(memory.selectedEvidence.projects).toEqual(["AI API Gateway"]);
    expect(memory.honestyNotes).toEqual(["Do not overstate senior production ownership."]);
  });

  it("round trips application memory to ProofCV data", () => {
    const memory = applicationMemoryFromProofCvData({
      cvData: {
        candidate: { name: "Hatim Shaherawala" },
        target: {
          company: "WeDoTech",
          role: "AI Engineer",
          fit: ["Python"]
        },
        selected_projects: ["AI API Gateway"],
        profile_summary: "AI engineer building agent systems."
      }
    });
    const cvData = proofCvDataFromApplicationMemory({
      candidate: memory.candidateSnapshot,
      application: memory
    });

    expect(cvData.target.company).toBe("WeDoTech");
    expect(cvData.selected_projects).toEqual(["AI API Gateway"]);
    expect(cvData.profile_summary).toBe("AI engineer building agent systems.");
  });
});
