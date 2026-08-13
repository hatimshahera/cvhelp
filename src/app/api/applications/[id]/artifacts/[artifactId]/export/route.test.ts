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

describe("application artifact TeX export API", () => {
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

  it("exports a scoped artifact as TeX", async () => {
    artifactFindFirst.mockResolvedValueOnce({
      id: "artifact-1",
      applicationId: "app-1",
      userId: "user-1",
      type: "cv_draft",
      title: "Example AI CV Draft",
      version: 2,
      content: {
        summary: "AI engineer",
        bullets: ["Built AI API Gateway."]
      }
    });
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/applications/app-1/artifacts/artifact-1/export"),
      { params: Promise.resolve({ id: "app-1", artifactId: "artifact-1" }) }
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/x-tex");
    expect(response.headers.get("content-disposition")).toContain("cv_draft-v2.tex");
    expect(text).toContain("\\section*{Example AI CV Draft}");
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
      new Request("http://localhost/api/applications/app-1/artifacts/artifact-2/export"),
      { params: Promise.resolve({ id: "app-1", artifactId: "artifact-2" }) }
    );

    expect(response.status).toBe(404);
  });
});
