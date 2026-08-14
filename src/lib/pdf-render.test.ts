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
});
