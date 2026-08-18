import { describe, expect, it } from "vitest";
import {
  getLightweightGeneralReply,
  isLightweightGeneralMessage,
  shouldIncludeGeneralWorkspaceContext
} from "./intent";

describe("chat intent gates", () => {
  it("treats simple General Chat health checks as lightweight", () => {
    expect(isLightweightGeneralMessage("Hi there does this work")).toBe(true);
    expect(isLightweightGeneralMessage("ping")).toBe(true);
    expect(isLightweightGeneralMessage("Compare my applications")).toBe(false);
  });

  it("replies normally to lightweight General Chat messages", () => {
    expect(getLightweightGeneralReply("Hi there does this work", "Hatim")).toBe(
      "Hi Hatim. Yes, it works. You can paste a job description here, ask a career question, or route profile updates."
    );
  });

  it("includes General Chat workspace context only when the message needs it", () => {
    expect(
      shouldIncludeGeneralWorkspaceContext({
        message: "Hi there does this work",
        hasAttachedSources: false
      })
    ).toBe(false);
    expect(
      shouldIncludeGeneralWorkspaceContext({
        message: "Compare my active applications",
        hasAttachedSources: false
      })
    ).toBe(true);
  });
});
