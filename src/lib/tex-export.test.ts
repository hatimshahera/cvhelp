import { describe, expect, it } from "vitest";
import { artifactToTex, texFilename } from "./tex-export";

describe("TeX artifact export", () => {
  it("renders artifact content as escaped TeX", () => {
    const tex = artifactToTex({
      title: "Example_AI & CV",
      type: "cv_draft",
      version: 2,
      content: {
        summary: "Backend & AI engineer",
        bullets: ["Built RAG APIs with 20% lower latency."],
        risks: ["Do not claim $1M impact without proof."]
      }
    });

    expect(tex).toContain("\\documentclass");
    expect(tex).toContain("Example\\_AI \\& CV");
    expect(tex).toContain("\\section*{Summary}");
    expect(tex).toContain("Backend \\& AI engineer");
    expect(tex).toContain("20\\% lower latency");
    expect(tex).toContain("\\$1M impact");
  });

  it("creates a safe TeX filename", () => {
    expect(texFilename({ type: "cv_draft", version: 3 })).toBe("cv_draft-v3.tex");
  });
});
