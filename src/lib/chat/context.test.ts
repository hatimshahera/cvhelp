import { describe, expect, it } from "vitest";
import { buildChatPromptContext, buildTranscript } from "./context";

describe("chat context builder", () => {
  it("formats recent messages as the existing transcript shape", () => {
    expect(
      buildTranscript([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" }
      ])
    ).toBe("User: Hello\n\nAssistant: Hi");
  });

  it("builds application context only from the selected application", () => {
    const context = buildChatPromptContext({
      mode: "application",
      userName: "Hatim",
      recentMessages: [{ role: "user", content: "Tailor this." }],
      profileBank: {
        masterProfile: { skills: ["Python"] },
        rawSources: { entries: [] },
        checklist: []
      },
      application: {
        company: "Selected AI",
        role: "AI Engineer",
        status: "draft",
        jobPost: { content: "Build agents." },
        memory: { requirements: ["agents"] }
      }
    });

    expect(context).toContain("Selected AI");
    expect(context).toContain("Build agents.");
    expect(context).not.toContain("Other AI");
  });

  it("keeps profile context out of general chat by default", () => {
    const context = buildChatPromptContext({
      mode: "general",
      userName: "Hatim",
      recentMessages: [{ role: "user", content: "What should I do next?" }],
      profileBank: {
        masterProfile: { privateDetail: "do not include" },
        rawSources: { entries: [{ content: "private source" }] },
        checklist: []
      },
      workspaceApplications: [
        {
          id: "app-1",
          company: "Example AI",
          role: "AI Engineer",
          status: "draft",
          nextAction: "Review fit"
        }
      ]
    });

    expect(context).toContain("Example AI");
    expect(context).toContain("Review fit");
    expect(context).not.toContain("privateDetail");
    expect(context).not.toContain("private source");
  });

  it("preserves the current turn when context is truncated", () => {
    const context = buildChatPromptContext({
      mode: "application",
      userName: "Hatim",
      contextBudget: 400,
      recentMessages: [{ role: "user", content: "This current question must remain." }],
      profileBank: {
        masterProfile: { skills: ["Python"] },
        rawSources: { entries: [] },
        checklist: []
      },
      application: {
        company: "Large Context Corp",
        role: "Engineer",
        status: "draft",
        jobPost: { content: "x".repeat(2000) }
      }
    });

    expect(context).toContain("[Context truncated]");
    expect(context).toContain("This current question must remain.");
  });
});
