import { describe, expect, it } from "vitest";
import { renderArtifactToPdf } from "./pdf-render";

describe("artifact PDF renderer", () => {
  it("renders artifact content to a PDF buffer", async () => {
    const pdf = await renderArtifactToPdf({
      title: "Noggin CV Draft",
      type: "cv_draft",
      version: 1,
      content: {
        summary: "AI engineer",
        bullets: ["Built an AI workflow system."]
      }
    });

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("renders real-world CV punctuation without throwing", async () => {
    const pdf = await renderArtifactToPdf({
      title: "Noggin - AI Software Engineer Intern 🚀",
      type: "proofcv_data",
      version: 1,
      content: {
        summary: "Built LLM-backed workflows — “production-ready” APIs and résumé tooling.",
        bullets: [
          "Improved recruiter messaging by 20%… with concise evidence.",
          "Worked across café demos, CV drafts, and WhatsApp-style CRM notes."
        ]
      }
    });

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
