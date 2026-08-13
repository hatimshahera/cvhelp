import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const update = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {}
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profileBank: {
      upsert,
      update
    }
  }
}));

describe("profile API", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getServerSession } = await import("next-auth");
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user-1",
        name: "Hatim",
        email: "hatim@example.com"
      },
      expires: "2026-08-13T00:00:00.000Z"
    });
  });

  it("returns the signed-in user's canonical profile", async () => {
    upsert.mockResolvedValueOnce({
      masterProfile: {
        identity: { name: "Hatim Shaherawala" },
        projects: [{ name: "AI API Gateway" }]
      },
      rawSources: {
        entries: [
          {
            id: "source-1",
            type: "chat_note",
            content: "Built AI API Gateway with request tracking and model routing.",
            createdAt: "2026-08-13T00:00:00.000Z"
          }
        ]
      },
      checklist: []
    });
    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profile.identity).toEqual({ name: "Hatim Shaherawala" });
    expect(body.profile.projects).toEqual([{ name: "AI API Gateway" }]);
    expect(body.sources).toEqual([
      expect.objectContaining({
        id: "source-1",
        type: "chat_note",
        preview: "Built AI API Gateway with request tracking and model routing."
      })
    ]);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));
  });

  it("updates one canonical profile section", async () => {
    upsert.mockResolvedValueOnce({
      masterProfile: {
        identity: { name: "Hatim Shaherawala" }
      },
      rawSources: { entries: [] },
      checklist: []
    });
    update.mockResolvedValueOnce({
      masterProfile: {
        identity: { name: "Hatim Shaherawala" },
        links: { github: "https://github.com/hatimshahera" },
        education: [],
        experience: [],
        projects: [],
        research: [],
        skills: [],
        achievements: [],
        preferences: {},
        constraints: {},
        evidence: [],
        openQuestions: []
      },
      rawSources: {
        entries: [
          {
            id: "source-2",
            type: "file_upload_text",
            name: "cv.txt",
            content: "Uploaded file: cv.txt Profile content.",
            createdAt: "2026-08-13T00:00:00.000Z"
          }
        ]
      },
      checklist: []
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          section: "links",
          value: { github: "https://github.com/hatimshahera" }
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profile.links.github).toBe("https://github.com/hatimshahera");
    expect(body.sources[0]).toEqual(
      expect.objectContaining({
        id: "source-2",
        name: "cv.txt"
      })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        data: expect.objectContaining({
          masterProfile: expect.objectContaining({
            links: { github: "https://github.com/hatimshahera" }
          })
        })
      })
    );
  });

  it("rejects invalid section values", async () => {
    upsert.mockResolvedValueOnce({
      masterProfile: {},
      rawSources: { entries: [] },
      checklist: []
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          section: "projects",
          value: { name: "This should be an array" }
        })
      })
    );

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
