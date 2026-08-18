import { describe, expect, it } from "vitest";
import { inferJobMetadata } from "./application-actions";

describe("application action metadata extraction", () => {
  it("extracts a usable role from recruiter-style The Company / The Role job text", () => {
    expect(
      inferJobMetadata(
        [
          "About the job",
          "The Company",
          "My client are a HealthTech, using AI to optimise the recruitment of candidates for clinical trials.",
          "The Role",
          "As a result of this growth, they are hiring an AI Engineer, to build their core AI layer of multi-agent systems, RAG, Agentic workflows and more.",
          "Requirements",
          "Strong coding experience with Python, Node.js, Rust or similar languages."
        ].join("\n")
      )
    ).toEqual({
      company: "HealthTech",
      role: "AI Engineer"
    });
  });
});
