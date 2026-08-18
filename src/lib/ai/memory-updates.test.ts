import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialApplicationMemory } from "@/lib/memory";
import { updateApplicationMemory, updateMasterProfile } from "./memory-updates";

const { profileBankUpdate, logError } = vi.hoisted(() => ({
  profileBankUpdate: vi.fn(),
  logError: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profileBank: {
      update: profileBankUpdate
    }
  }
}));

vi.mock("@/lib/server-log", () => ({
  logError
}));

describe("AI memory updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves profile memory when model JSON is malformed", async () => {
    const profileBank = {
      masterProfile: {
        projects: [{ name: "Existing project" }]
      },
      rawSources: { entries: [] },
      checklist: []
    };
    const openai = {
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: "{not-json"
        })
      }
    };

    const result = await updateMasterProfile({
      openai: openai as never,
      userId: "user-1",
      userName: "Hatim",
      profileBank,
      userMessage: "Update my profile.",
      assistantText: "I will update it."
    });

    expect(result).toBe(profileBank);
    expect(profileBankUpdate).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      "Profile bank update failed",
      expect.any(Error),
      { userId: "user-1" }
    );
  });

  it("preserves profile memory when model output fails the profile schema", async () => {
    const profileBank = {
      masterProfile: {
        projects: [{ name: "Existing project" }]
      },
      rawSources: { entries: [] },
      checklist: []
    };
    const openai = {
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: JSON.stringify({
            projects: "not an array"
          })
        })
      }
    };

    const result = await updateMasterProfile({
      openai: openai as never,
      userId: "user-1",
      userName: "Hatim",
      profileBank,
      userMessage: "Update my profile.",
      assistantText: "I will update it."
    });

    expect(result).toBe(profileBank);
    expect(profileBankUpdate).not.toHaveBeenCalled();
  });

  it("preserves application memory when sidecar output is invalid and logs scoped IDs only", async () => {
    const memory = createInitialApplicationMemory({
      company: "Example AI",
      role: "AI Engineer",
      jobPost: {
        source: "pasted_job_description",
        sourceUrl: null,
        content: "Build AI agents.",
        capturedAt: "2026-08-13T00:00:00.000Z"
      },
      jobSummary: {
        requirements: ["Python"],
        responsibilities: [],
        keywords: ["AI"]
      }
    });
    const openai = {
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: "{broken"
        })
      }
    };

    const result = await updateApplicationMemory({
      openai: openai as never,
      memory,
      profileSummary: {},
      userMessage: "Remember this for this application.",
      assistantText: "Done.",
      userId: "user-1",
      applicationId: "app-1"
    });

    expect(result).toBe(memory);
    expect(logError).toHaveBeenCalledWith(
      "Application memory update failed",
      expect.any(Error),
      {
        userId: "user-1",
        applicationId: "app-1"
      }
    );
  });
});
