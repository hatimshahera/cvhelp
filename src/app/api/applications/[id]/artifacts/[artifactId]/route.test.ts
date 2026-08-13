import { beforeEach, describe, expect, it, vi } from "vitest";

const artifactFindFirst = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {}
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    applicationArtifact: {
      findFirst: artifactFindFirst
    }
  }
}));

describe("application artifact detail API", () => {
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

  it("loads an artifact scoped to the signed-in user and application", async () => {
    artifactFindFirst.mockResolvedValueOnce({
      id: "artifact-1",
      applicationId: "app-1",
      userId: "user-1",
      content: { summary: "Draft" }
    });
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/applications/app-1/artifacts/artifact-1"),
      { params: Promise.resolve({ id: "app-1", artifactId: "artifact-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.artifact.content).toEqual({ summary: "Draft" });
    expect(artifactFindFirst).toHaveBeenCalledWith({
      where: {
        id: "artifact-1",
        applicationId: "app-1",
        userId: "user-1"
      }
    });
  });

  it("returns 404 for artifacts outside the signed-in user's scope", async () => {
    artifactFindFirst.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/applications/app-1/artifacts/artifact-2"),
      { params: Promise.resolve({ id: "app-1", artifactId: "artifact-2" }) }
    );

    expect(response.status).toBe(404);
  });
});
