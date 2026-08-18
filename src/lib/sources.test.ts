import { describe, expect, it } from "vitest";
import { buildSourceSnippetContext, sourceScopeForChatMode } from "./sources";

describe("source helpers", () => {
  it("maps chat modes to source scopes", () => {
    expect(sourceScopeForChatMode("build_profile")).toBe("profile");
    expect(sourceScopeForChatMode("application")).toBe("application");
    expect(sourceScopeForChatMode("general")).toBe("general");
  });

  it("builds bounded source snippet context", () => {
    const context = buildSourceSnippetContext(
      [
        {
          id: "source-1",
          kind: "file_upload_text",
          name: "cv.txt",
          textContent: "x".repeat(100)
        }
      ],
      12
    );

    expect(context).toContain("source-1");
    expect(context).toContain("cv.txt");
    expect(context).toContain("x".repeat(12));
    expect(context).not.toContain("x".repeat(13));
  });
});
