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

  it("keeps profile context out of general chat by default while allowing explicit workspace context", () => {
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
      ],
      generalToolDefinitions: "list_applications",
      generalWorkspaceContext: "Tool result: Example AI"
    });

    expect(context).toContain("Example AI");
    expect(context).toContain("General Chat backend tool definitions");
    expect(context).toContain("On-demand workspace context");
    expect(context).toContain("Review fit");
    expect(context).not.toContain("privateDetail");
    expect(context).not.toContain("private source");
  });

  it("does not add workspace tool results to general chat unless provided", () => {
    const context = buildChatPromptContext({
      mode: "general",
      userName: "Hatim",
      recentMessages: [{ role: "user", content: "hi" }],
      generalToolDefinitions: "list_applications"
    });

    expect(context).toContain("General Chat backend tool definitions");
    expect(context).not.toContain("On-demand workspace context");
    expect(context).not.toContain("Workspace application summaries");
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

  it("includes rolling summary and relevant older messages before recent transcript", () => {
    const context = buildChatPromptContext({
      mode: "general",
      userName: "Hatim",
      conversationSummary: {
        version: 1,
        text: "The user previously compared backend AI roles.",
        updatedAt: "2026-08-13T00:00:00.000Z",
        summarizedMessageCount: 40
      },
      relevantOlderMessages: [
        {
          role: "user",
          content: "Earlier note about RAG evaluation roles."
        }
      ],
      recentMessages: [{ role: "user", content: "Compare this to the RAG role." }]
    });

    expect(context).toContain("Conversation summary");
    expect(context).toContain("previously compared backend AI roles");
    expect(context).toContain("Relevant older messages");
    expect(context).toContain("Earlier note about RAG evaluation roles.");
    expect(context).toContain("Compare this to the RAG role.");
  });
});
