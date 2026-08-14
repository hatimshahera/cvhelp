import { beforeEach, describe, expect, it, vi } from "vitest";

const artifactFindFirst = vi.fn();
const renderArtifactToPdf = vi.fn();

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
    renderArtifactToPdf
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
    renderArtifactToPdf.mockResolvedValueOnce(new Uint8Array([37, 80, 68, 70]));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/applications/app-1/artifacts/artifact-1/pdf"),
      { params: Promise.resolve({ id: "app-1", artifactId: "artifact-1" }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(response.headers.get("content-disposition")).toContain("cv_draft-v2.pdf");
    expect(renderArtifactToPdf).toHaveBeenCalledWith({
      title: "Example AI CV Draft",
      type: "cv_draft",
      version: 2,
      content: {
        summary: "AI engineer",
        bullets: ["Built AI API Gateway."]
      }
    });
    expect(artifactFindFirst).toHaveBeenCalledWith({
      where: {
        id: "artifact-1",
        applicationId: "app-1",
        userId: "user-1"
      }
    });
  });

  it("serves an imported stored PDF artifact directly", async () => {
    artifactFindFirst.mockResolvedValueOnce({
      id: "artifact-1",
      applicationId: "app-1",
      userId: "user-1",
      type: "cv_pdf",
      title: "Imported CV PDF",
      version: 1,
      content: {
        filename: "HatimShaherawala.pdf",
        mimeType: "application/pdf",
        base64: Buffer.from("%PDF imported").toString("base64")
      }
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/applications/app-1/artifacts/artifact-1/pdf"),
      { params: Promise.resolve({ id: "app-1", artifactId: "artifact-1" }) }
    );
    const body = Buffer.from(await response.arrayBuffer()).toString();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("HatimShaherawala.pdf");
    expect(body).toBe("%PDF imported");
    expect(renderArtifactToPdf).not.toHaveBeenCalled();
  });

  it("returns 404 for artifacts outside the signed-in user's scope", async () => {
    artifactFindFirst.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/applications/app-1/artifacts/artifact-2/pdf"),
      { params: Promise.resolve({ id: "app-1", artifactId: "artifact-2" }) }
    );

    expect(response.status).toBe(404);
    expect(renderArtifactToPdf).not.toHaveBeenCalled();
  });

  it("does not render non-CV artifacts as PDF previews", async () => {
    artifactFindFirst.mockResolvedValueOnce({
      id: "artifact-1",
      applicationId: "app-1",
      userId: "user-1",
      type: "proofcv_data",
      title: "Imported ProofCV data",
      version: 1,
      content: { candidate: { name: "Hatim" } }
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/applications/app-1/artifacts/artifact-1/pdf"),
      { params: Promise.resolve({ id: "app-1", artifactId: "artifact-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Only CV draft artifacts can be previewed as PDF.");
    expect(renderArtifactToPdf).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid stored PDF artifacts", async () => {
    artifactFindFirst.mockResolvedValueOnce({
      id: "artifact-1",
      applicationId: "app-1",
      userId: "user-1",
      type: "cv_pdf",
      title: "Imported CV PDF",
      version: 1,
      content: { filename: "broken.pdf" }
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/applications/app-1/artifacts/artifact-1/pdf"),
      { params: Promise.resolve({ id: "app-1", artifactId: "artifact-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("Saved PDF artifact is invalid.");
    expect(renderArtifactToPdf).not.toHaveBeenCalled();
  });

  it("returns 500 when PDF rendering fails", async () => {
    artifactFindFirst.mockResolvedValueOnce({
      id: "artifact-1",
      applicationId: "app-1",
      userId: "user-1",
      type: "cv_draft",
      title: "Example AI CV Draft",
      version: 2,
      content: { summary: "AI engineer" }
    });
    renderArtifactToPdf.mockRejectedValueOnce(new Error("Render failed."));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/applications/app-1/artifacts/artifact-1/pdf"),
      { params: Promise.resolve({ id: "app-1", artifactId: "artifact-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Could not render this PDF preview.");
  });
});
