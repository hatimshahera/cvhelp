import { describe, expect, it } from "vitest";
import {
  buildAgentInstructions,
  getAgentDefinition,
  getUserPreferenceInstructions
} from "./agents";

describe("AI agent definitions", () => {
  it("maps the public build_profile mode to the Profile Agent", () => {
    expect(getAgentDefinition("build_profile")).toMatchObject({
      id: "profile",
      name: "Profile Agent"
    });
  });

  it("selects the Application Agent for application mode", () => {
    expect(getAgentDefinition("application")).toMatchObject({
      id: "application",
      name: "Application Agent"
    });
  });

  it("selects the General Agent for general mode", () => {
    expect(getAgentDefinition("general")).toMatchObject({
      id: "general",
      name: "General Agent"
    });
  });

  it("orders inherited instructions before agent-specific instructions", () => {
    const instructions = buildAgentInstructions({
      mode: "application",
      profileBank: {
        masterProfile: {
          preferences: { tone: "direct" },
          constraints: { pageLimit: 1 }
        }
      }
    });

    expect(instructions.indexOf("You are CVhelp")).toBeLessThan(
      instructions.indexOf("User-level global CV/application preferences")
    );
    expect(instructions.indexOf("User-level global CV/application preferences")).toBeLessThan(
      instructions.indexOf("You are CVhelp's application agent.")
    );
    expect(instructions).toContain("direct");
    expect(instructions).toContain("pageLimit");
  });

  it("omits user preference instructions when profile preferences are absent", () => {
    expect(getUserPreferenceInstructions({ masterProfile: {} })).toEqual([]);
  });
});
