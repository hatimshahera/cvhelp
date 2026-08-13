import { describe, expect, it, vi } from "vitest";
import { parseApplicationMemory } from "@/lib/memory";
import { mockOpenAIJsonResponse, mockOpenAITextResponse } from "./openai";
import { applicationMemoryFixture, applicationRecordFixture } from "./fixtures/application";
import { cvTextFixture, parsedCvProfileFixture } from "./fixtures/cv";
import { jobPostTextFixture, jobSummaryFixture } from "./fixtures/job-post";

describe("test fixtures", () => {
  it("provides a realistic CV text fixture and parsed profile target", () => {
    expect(cvTextFixture).toContain("AI API Gateway");
    expect(parsedCvProfileFixture.projects[0]?.name).toBe("AI API Gateway");
  });

  it("provides a realistic job post fixture and extracted summary target", () => {
    expect(jobPostTextFixture).toContain("Example AI");
    expect(jobSummaryFixture.keywords).toContain("LLM APIs");
  });

  it("provides application data that conforms to the application memory schema", () => {
    const parsed = parseApplicationMemory(applicationMemoryFixture, applicationMemoryFixture);

    expect(applicationRecordFixture.company).toBe("Example AI");
    expect(parsed.target.role).toBe("AI Engineer");
    expect(parsed.claimProvenance.requirements?.[0]).toEqual(
      expect.objectContaining({
        sourceType: "pasted_job_description",
        confidence: "extracted"
      })
    );
  });

  it("provides OpenAI mock response helpers", async () => {
    const mock = vi.fn();
    mockOpenAITextResponse(mock, "Saved profile fact.");
    mockOpenAIJsonResponse(mock, { summary: "Grounded artifact." });

    await expect(mock()).resolves.toEqual({ output_text: "Saved profile fact." });
    await expect(mock()).resolves.toEqual({ output_text: "{\"summary\":\"Grounded artifact.\"}" });
  });
});
