import { describe, expect, it } from "vitest";
import { planGeneralChatContext } from "./general-intent";

describe("General Chat context planning", () => {
  it("keeps greetings and acknowledgements context-light", () => {
    expect(planGeneralChatContext("hi").workspaceTools).toEqual([]);
    expect(planGeneralChatContext("yo yo yo").intent).toBe("casual");
    expect(planGeneralChatContext("thanks").workspaceTools).toEqual([]);
  });

  it("routes explicit application reads to application workspace tools", () => {
    expect(planGeneralChatContext("show my applications")).toMatchObject({
      intent: "application_lookup",
      workspaceTools: ["list_applications"]
    });
    expect(planGeneralChatContext("compare my machine learning engineer roles")).toMatchObject({
      workspaceTools: ["search_applications"]
    });
  });

  it("routes profile and source reads to scoped read tools", () => {
    expect(planGeneralChatContext("what does my profile say about Python?").workspaceTools).toContain(
      "search_profile"
    );
    expect(planGeneralChatContext("find uploaded evidence about FastAPI").workspaceTools).toContain(
      "search_sources"
    );
  });

  it("detects deterministic handoff and application creation intents without workspace reads", () => {
    expect(planGeneralChatContext("For my profile, I prefer direct CV bullets.")).toMatchObject({
      intent: "profile_handoff",
      workspaceTools: []
    });
    expect(
      planGeneralChatContext(
        "Example AI is hiring an AI Engineer. Requirements include Python, RAG, LLM evaluation, backend APIs, and production agent workflows."
      )
    ).toMatchObject({
      intent: "job_source",
      workspaceTools: []
    });
  });

  it("keeps ambiguous next-step requests context-light", () => {
    expect(planGeneralChatContext("what should I do next?")).toMatchObject({
      intent: "ambiguous",
      workspaceTools: []
    });
  });
});
