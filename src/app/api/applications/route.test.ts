import { beforeEach, describe, expect, it, vi } from "vitest";

const subscriptionFindUnique = vi.fn();
const applicationCount = vi.fn();
const applicationFindUnique = vi.fn();
const applicationCreate = vi.fn();
const conversationCreate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {}
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: subscriptionFindUnique
    },
    application: {
      count: applicationCount,
      findUnique: applicationFindUnique,
      create: applicationCreate
    },
    conversation: {
      create: conversationCreate
    }
  }
}));

describe("applications API", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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

  it("blocks application creation when the free application limit is reached", async () => {
    subscriptionFindUnique.mockResolvedValueOnce(null);
    applicationCount.mockResolvedValueOnce(5);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/applications", {
        method: "POST",
        body: JSON.stringify({
          jobSource:
            "Example AI is hiring an AI Engineer to build agents, RAG systems, evaluations, and backend services."
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toContain("5 application limit");
    expect(applicationCreate).not.toHaveBeenCalled();
  });

  it("creates an application when the user is below the plan limit", async () => {
    subscriptionFindUnique.mockResolvedValueOnce(null);
    applicationCount.mockResolvedValueOnce(1);
    applicationFindUnique.mockResolvedValueOnce(null);
    applicationCreate.mockResolvedValueOnce({
      id: "app-1",
      company: "Example AI",
      role: "AI Engineer",
      slug: "example-ai-ai-engineer",
      status: "draft",
      createdAt: new Date("2026-08-13T00:00:00.000Z"),
      updatedAt: new Date("2026-08-13T00:00:00.000Z")
    });
    conversationCreate.mockResolvedValueOnce({ id: "conversation-1" });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/applications", {
        method: "POST",
        body: JSON.stringify({
          jobSource:
            "Example AI is hiring an AI Engineer to build agents, RAG systems, evaluations, and backend services."
        })
      })
    );

    expect(response.status).toBe(201);
    expect(applicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobSummary: expect.objectContaining({
            responsibilities: expect.arrayContaining([
              expect.stringContaining("build agents")
            ]),
            keywords: expect.arrayContaining(["RAG", "agent", "backend"])
          }),
          memory: expect.objectContaining({
            responsibilities: expect.arrayContaining([
              expect.stringContaining("build agents")
            ]),
            keywords: expect.arrayContaining(["RAG", "agent", "backend"])
          })
        })
      })
    );
    expect(conversationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationId: "app-1",
          mode: "application",
          threadKey: "default"
        })
      })
    );
  });

  it("creates an application from a job URL when readable text can be extracted", async () => {
    subscriptionFindUnique.mockResolvedValueOnce(null);
    applicationCount.mockResolvedValueOnce(1);
    applicationFindUnique.mockResolvedValueOnce(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: vi.fn().mockResolvedValue(`
          <html>
            <head><style>.hidden{}</style></head>
            <body>
              <h1>Senior Full-stack Engineer</h1>
              <p>Example AI is hiring a Senior Full-stack Engineer.</p>
              <ul>
                <li>Must have experience with TypeScript, React, Next.js, Postgres, and APIs.</li>
                <li>Build AI agent workflows, evaluations, and backend services.</li>
                <li>Collaborate with product and design to deliver customer-facing tools.</li>
              </ul>
              <p>This role works on LLM and RAG systems for production users.</p>
            </body>
          </html>
        `)
      })
    );
    applicationCreate.mockResolvedValueOnce({
      id: "app-2",
      company: "Example AI",
      role: "Senior Full-Stack Engineer",
      slug: "example-ai-senior-full-stack-engineer",
      status: "draft",
      createdAt: new Date("2026-08-13T00:00:00.000Z"),
      updatedAt: new Date("2026-08-13T00:00:00.000Z")
    });
    conversationCreate.mockResolvedValueOnce({ id: "conversation-2" });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/applications", {
        method: "POST",
        body: JSON.stringify({
          jobSource: "https://example.com/jobs/senior-full-stack-engineer"
        })
      })
    );

    expect(response.status).toBe(201);
    expect(applicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobPost: expect.objectContaining({
            source: "job_post_url",
            sourceUrl: "https://example.com/jobs/senior-full-stack-engineer",
            content: expect.stringContaining("Senior Full-stack Engineer")
          }),
          jobSummary: expect.objectContaining({
            requirements: expect.arrayContaining([
              expect.stringContaining("Must have experience with TypeScript")
            ]),
            responsibilities: expect.arrayContaining([
              expect.stringContaining("Build AI agent workflows")
            ]),
            keywords: expect.arrayContaining(["LLM", "RAG", "agent", "TypeScript", "React", "Next.js", "Postgres"])
          })
        })
      })
    );
  });
});
