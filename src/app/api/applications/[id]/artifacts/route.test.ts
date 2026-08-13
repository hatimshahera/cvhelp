import { beforeEach, describe, expect, it, vi } from "vitest";

const applicationFindFirst = vi.fn();
const artifactFindMany = vi.fn();
const artifactFindFirst = vi.fn();
const artifactCreate = vi.fn();
const artifactCount = vi.fn();
const subscriptionFindUnique = vi.fn();
const responsesCreate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {}
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findFirst: applicationFindFirst
    },
    applicationArtifact: {
      findMany: artifactFindMany,
      findFirst: artifactFindFirst,
      create: artifactCreate,
      count: artifactCount
    },
    subscription: {
      findUnique: subscriptionFindUnique
    }
  }
}));

vi.mock("openai", () => ({
  default: vi.fn(function MockOpenAI() {
    return {
    responses: {
      create: responsesCreate
    }
    };
  })
}));

const applicationWithMemory = {
  id: "app-1",
  userId: "user-1",
  company: "Example AI",
  role: "AI Engineer",
  jobPost: {
    source: "pasted_job_description",
    sourceUrl: null,
    content: "Build AI agents.",
    capturedAt: "2026-08-13T00:00:00.000Z"
  },
  jobSummary: null,
  candidateSnapshot: { name: "Hatim Shaherawala" },
  memory: {
    candidateSnapshot: { name: "Hatim Shaherawala" },
    target: { company: "Example AI", role: "AI Engineer", fit: ["Python"] },
    jobPost: {
      source: "pasted_job_description",
      sourceUrl: null,
      content: "Build AI agents.",
      capturedAt: "2026-08-13T00:00:00.000Z"
    },
    requirements: [],
    responsibilities: [],
    keywords: [],
    selectedEvidence: {
      projects: ["AI API Gateway"],
      research: [],
      experience: [],
      skills: ["Python"]
    },
    profileSummary: "AI engineer with agent evidence.",
    honestyNotes: ["Do not overstate production scale."],
    risks: [],
    gaps: [],
    notes: [],
    drafts: {},
    nextActions: []
  }
};

describe("application artifacts API", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    subscriptionFindUnique.mockResolvedValue(null);
    artifactCount.mockResolvedValue(0);
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

  it("lists artifacts scoped to the signed-in user and application", async () => {
    applicationFindFirst.mockResolvedValueOnce({ id: "app-1", userId: "user-1" });
    artifactFindMany.mockResolvedValueOnce([{ id: "artifact-1", type: "proofcv_data" }]);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/applications/app-1/artifacts"), {
      params: Promise.resolve({ id: "app-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.artifacts).toHaveLength(1);
    expect(artifactFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { applicationId: "app-1", userId: "user-1" }
      })
    );
  });

  it("creates a versioned ProofCV data artifact from application memory", async () => {
    applicationFindFirst.mockResolvedValueOnce(applicationWithMemory);
    artifactFindFirst.mockResolvedValueOnce({ version: 2 });
    artifactCreate.mockResolvedValueOnce({
      id: "artifact-3",
      type: "proofcv_data",
      version: 3
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/applications/app-1/artifacts", {
        method: "POST",
        body: JSON.stringify({ type: "proofcv_data" })
      }),
      { params: Promise.resolve({ id: "app-1" }) }
    );

    expect(response.status).toBe(201);
    expect(artifactCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          applicationId: "app-1",
          type: "proofcv_data",
          version: 3,
          content: expect.objectContaining({
            selected_projects: ["AI API Gateway"],
            selected_skills: ["Python"]
          })
        })
      })
    );
  });

  it("returns a clear error when AI generation is requested without an API key", async () => {
    applicationFindFirst.mockResolvedValueOnce(applicationWithMemory);
    artifactFindFirst.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/applications/app-1/artifacts", {
        method: "POST",
        body: JSON.stringify({ type: "cv_draft" })
      }),
      { params: Promise.resolve({ id: "app-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe("OPENAI_API_KEY is not configured on the server.");
    expect(artifactCreate).not.toHaveBeenCalled();
  });

  it("blocks ProofCV exports when the export limit is reached", async () => {
    applicationFindFirst.mockResolvedValueOnce(applicationWithMemory);
    artifactCount.mockResolvedValueOnce(3);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/applications/app-1/artifacts", {
        method: "POST",
        body: JSON.stringify({ type: "proofcv_data" })
      }),
      { params: Promise.resolve({ id: "app-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toContain("3 exports limit");
    expect(artifactCreate).not.toHaveBeenCalled();
  });

  it("blocks AI artifacts when the generation limit is reached", async () => {
    applicationFindFirst.mockResolvedValueOnce(applicationWithMemory);
    artifactCount.mockResolvedValueOnce(10);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/applications/app-1/artifacts", {
        method: "POST",
        body: JSON.stringify({ type: "cv_draft" })
      }),
      { params: Promise.resolve({ id: "app-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toContain("10 generations limit");
    expect(responsesCreate).not.toHaveBeenCalled();
    expect(artifactCreate).not.toHaveBeenCalled();
  });

  it("creates a versioned AI-generated CV draft artifact", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    applicationFindFirst.mockResolvedValueOnce(applicationWithMemory);
    artifactFindFirst.mockResolvedValueOnce({ version: 1 });
    responsesCreate.mockResolvedValueOnce({
      output_text: JSON.stringify({
        summary: "AI engineer with backend agent evidence.",
        bullets: ["Built AI API Gateway for LLM routing and request tracking."],
        selectedEvidence: ["AI API Gateway"],
        risks: []
      })
    });
    artifactCreate.mockResolvedValueOnce({
      id: "artifact-2",
      type: "cv_draft",
      version: 2
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/applications/app-1/artifacts", {
        method: "POST",
        body: JSON.stringify({ type: "cv_draft" })
      }),
      { params: Promise.resolve({ id: "app-1" }) }
    );

    expect(response.status).toBe(201);
    expect(responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining("Return JSON with keys: summary, bullets"),
        input: expect.stringContaining("AI API Gateway")
      })
    );
    expect(artifactCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "cv_draft",
          version: 2,
          content: expect.objectContaining({
            bullets: ["Built AI API Gateway for LLM routing and request tracking."]
          }),
          metadata: expect.objectContaining({
            source: "openai",
            model: "gpt-5-mini"
          })
        })
      })
    );
  });
});
