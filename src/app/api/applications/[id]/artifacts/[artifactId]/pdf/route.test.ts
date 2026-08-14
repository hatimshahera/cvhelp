import { beforeEach, describe, expect, it, vi } from "vitest";

const artifactFindFirst = vi.fn();
const renderTexToPdf = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {}
}));

vi.mock("@/lib/pdf-render", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf-render")>("@/lib/pdf-render");

  return {
    ...actual,
    renderTexToPdf
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    applicationArtifact: {
      findFirst: artifactFindFirst
    }
  }
}));

describe("application artifact PDF preview API", () => {
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

  it("renders a scoped artifact as an inline PDF", async () => {
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
    renderTexToPdf.mockResolvedValueOnce(new Uint8Array([37, 80, 68, 70]));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/applications/app-1/artifacts/artifact-1/pdf"),
      { params: Promise.resolve({ id: "app-1", artifactId: "artifact-1" }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(response.headers.get("content-disposition")).toContain("cv_draft-v2.pdf");
    expect(renderTexToPdf).toHaveBeenCalledWith(expect.stringContaining("\\section*{Example AI CV Draft}"));
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
      new Request("http://localhost/api/applications/app-1/artifacts/artifact-2/pdf"),
      { params: Promise.resolve({ id: "app-1", artifactId: "artifact-2" }) }
    );

    expect(response.status).toBe(404);
    expect(renderTexToPdf).not.toHaveBeenCalled();
  });

  it("returns 501 when PDF rendering is unavailable", async () => {
    const { PdfRenderUnavailableError } = await import("@/lib/pdf-render");
    artifactFindFirst.mockResolvedValueOnce({
      id: "artifact-1",
      applicationId: "app-1",
      userId: "user-1",
      type: "cv_draft",
      title: "Example AI CV Draft",
      version: 2,
      content: { summary: "AI engineer" }
    });
    renderTexToPdf.mockRejectedValueOnce(new PdfRenderUnavailableError("Install tectonic."));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/applications/app-1/artifacts/artifact-1/pdf"),
      { params: Promise.resolve({ id: "app-1", artifactId: "artifact-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body.error).toBe("Install tectonic.");
  });
});
