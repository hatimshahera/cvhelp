import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveGeneralWorkspaceContext } from "./workspace-tools";

const { applicationFindMany, profileBankFindUnique, sourceFindMany } = vi.hoisted(() => ({
  applicationFindMany: vi.fn(),
  profileBankFindUnique: vi.fn(),
  sourceFindMany: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findMany: applicationFindMany
    },
    profileBank: {
      findUnique: profileBankFindUnique
    },
    source: {
      findMany: sourceFindMany
    }
  }
}));

describe("General Chat workspace tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only tool definitions for context-light turns", async () => {
    const result = await resolveGeneralWorkspaceContext({
      userId: "user-1",
      message: "hi",
      plan: {
        intent: "casual",
        workspaceTools: [],
        reason: "casual"
      }
    });

    expect(result.toolDefinitions).toContain("Available deterministic backend tools");
    expect(result.toolResultsContext).toBe("");
    expect(applicationFindMany).not.toHaveBeenCalled();
    expect(profileBankFindUnique).not.toHaveBeenCalled();
    expect(sourceFindMany).not.toHaveBeenCalled();
  });

  it("lists only user-owned application summaries through bounded selects", async () => {
    applicationFindMany.mockResolvedValueOnce([
      {
        id: "app-1",
        company: "Example AI",
        role: "AI Engineer",
        status: "draft",
        nextAction: "Tailor CV",
        archivedAt: null,
        updatedAt: new Date("2026-08-13T00:00:00.000Z")
      }
    ]);

    const result = await resolveGeneralWorkspaceContext({
      userId: "user-1",
      message: "show my applications",
      plan: {
        intent: "application_lookup",
        workspaceTools: ["list_applications"],
        reason: "application read"
      }
    });

    expect(applicationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        take: 30,
        select: expect.not.objectContaining({
          jobPost: true,
          memory: true,
          drafts: true
        })
      })
    );
    expect(result.toolResultsContext).toContain("list_applications");
    expect(result.toolResultsContext).toContain("Example AI");
  });

  it("searches profile only when the plan asks for profile context", async () => {
    profileBankFindUnique.mockResolvedValueOnce({
      masterProfile: {
        skills: ["Python", "FastAPI"],
        preferences: { tone: "direct" }
      },
      rawSources: { entries: [] },
      checklist: []
    });

    const result = await resolveGeneralWorkspaceContext({
      userId: "user-1",
      message: "what does my profile say about Python?",
      plan: {
        intent: "profile_lookup",
        workspaceTools: ["search_profile"],
        reason: "profile read"
      }
    });

    expect(profileBankFindUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: {
        masterProfile: true,
        rawSources: true,
        checklist: true
      }
    });
    expect(result.toolResultsContext).toContain("search_profile");
    expect(result.toolResultsContext).toContain("Python");
  });

  it("searches sources with metadata and short snippets only", async () => {
    sourceFindMany.mockResolvedValueOnce([
      {
        id: "source-1",
        scope: "general",
        applicationId: null,
        kind: "file_upload_text",
        name: "fastapi.txt",
        textContent: "FastAPI evidence ".repeat(200),
        createdAt: new Date("2026-08-13T00:00:00.000Z")
      }
    ]);

    const result = await resolveGeneralWorkspaceContext({
      userId: "user-1",
      message: "find source evidence about FastAPI",
      plan: {
        intent: "source_lookup",
        workspaceTools: ["search_sources"],
        reason: "source read"
      }
    });

    expect(sourceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        take: 30,
        select: expect.objectContaining({
          textContent: true
        })
      })
    );
    expect(result.toolResultsContext).toContain("search_sources");
    expect(result.toolResultsContext.length).toBeLessThan(4000);
  });
});
