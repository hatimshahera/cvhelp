import { beforeEach, describe, expect, it, vi } from "vitest";

const profileBankUpsert = vi.fn();
const profileBankUpdate = vi.fn();
const applicationFindFirst = vi.fn();
const conversationFindFirst = vi.fn();
const conversationCreate = vi.fn();
const conversationUpdate = vi.fn();
const chatMessageCreate = vi.fn();
const chatMessageDelete = vi.fn();
const chatMessageDeleteMany = vi.fn();
const chatMessageFindMany = vi.fn();
const applicationUpdate = vi.fn();
const responsesCreate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {}
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profileBank: {
      upsert: profileBankUpsert,
      update: profileBankUpdate
    },
    application: {
      findFirst: applicationFindFirst,
      update: applicationUpdate
    },
    conversation: {
      findFirst: conversationFindFirst,
      create: conversationCreate,
      update: conversationUpdate
    },
    chatMessage: {
      create: chatMessageCreate,
      delete: chatMessageDelete,
      deleteMany: chatMessageDeleteMany,
      findMany: chatMessageFindMany
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

const profileBank = {
  id: "bank-1",
  userId: "user-1",
  masterProfile: {
    identity: { name: "Hatim Shaherawala" },
    skills: ["Python"]
  },
  rawSources: { entries: [] },
  checklist: []
};

const application = {
  id: "app-1",
  userId: "user-1",
  company: "Example AI",
  role: "AI Engineer",
  slug: "example-ai-ai-engineer",
  status: "draft",
  nextAction: null,
  jobPost: {
    source: "pasted_job_description",
    sourceUrl: null,
    content: "Build AI agents.",
    capturedAt: "2026-08-13T00:00:00.000Z"
  },
  jobSummary: null,
  memory: null,
  notes: null,
  drafts: null
};

describe("chat API application scoping", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    profileBankUpsert.mockResolvedValue(profileBank);
    profileBankUpdate.mockResolvedValue(profileBank);
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

  it("does not load an application chat when the application is outside the signed-in user's scope", async () => {
    applicationFindFirst.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/chat?mode=application&applicationId=app-2")
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Choose an application first.");
    expect(applicationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app-2", userId: "user-1" }
      })
    );
    expect(conversationFindFirst).not.toHaveBeenCalled();
  });

  it("does not clear another user's application chat", async () => {
    applicationFindFirst.mockResolvedValueOnce(null);
    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/chat?mode=application&applicationId=app-2", {
        method: "DELETE"
      })
    );

    expect(response.status).toBe(400);
    expect(applicationFindFirst).toHaveBeenCalledWith({
      where: { id: "app-2", userId: "user-1" }
    });
    expect(chatMessageDeleteMany).not.toHaveBeenCalled();
    expect(conversationUpdate).not.toHaveBeenCalled();
  });

  it("does not append to an application conversation outside the signed-in user's thread", async () => {
    applicationFindFirst.mockResolvedValueOnce(application);
    conversationFindFirst.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "application",
          applicationId: "app-1",
          conversationId: "conversation-2",
          message: "Tailor this CV for the role."
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Conversation not found.");
    expect(conversationFindFirst).toHaveBeenCalledWith({
      where: {
        id: "conversation-2",
        userId: "user-1",
        mode: "application",
        applicationId: "app-1",
        threadKey: "default"
      }
    });
    expect(chatMessageCreate).not.toHaveBeenCalled();
    expect(applicationUpdate).not.toHaveBeenCalled();
    expect(responsesCreate).not.toHaveBeenCalled();
  });

  it("extracts chat-provided profile facts into the profile bank", async () => {
    profileBankUpdate
      .mockResolvedValueOnce({
        ...profileBank,
        rawSources: {
          entries: [
            {
              id: "source-1",
              type: "chat_note",
              content: "My GitHub project is AI API Gateway.",
              createdAt: "2026-08-13T00:00:00.000Z"
            }
          ]
        },
        checklist: [
          { id: "github", label: "Add GitHub/projects", done: true }
        ]
      })
      .mockResolvedValueOnce({
        ...profileBank,
        masterProfile: {
          projects: [{ name: "AI API Gateway", evidence: "User-provided chat note" }]
        }
      });
    conversationCreate.mockResolvedValueOnce({
      id: "conversation-1",
      mode: "build_profile",
      applicationId: null
    });
    chatMessageCreate
      .mockResolvedValueOnce({
        id: "message-user",
        role: "user",
        content: "My GitHub project is AI API Gateway."
      })
      .mockResolvedValueOnce({
        id: "message-assistant",
        role: "assistant",
        content: "Saved that project to your profile."
      });
    chatMessageFindMany
      .mockResolvedValueOnce([
        {
          role: "user",
          content: "My GitHub project is AI API Gateway."
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "message-user",
          role: "user",
          content: "My GitHub project is AI API Gateway.",
          createdAt: new Date("2026-08-13T00:00:00.000Z")
        },
        {
          id: "message-assistant",
          role: "assistant",
          content: "Saved that project to your profile.",
          createdAt: new Date("2026-08-13T00:00:01.000Z")
        }
      ]);
    responsesCreate
      .mockResolvedValueOnce({
        output_text: "Saved that project to your profile."
      })
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          projects: [{ name: "AI API Gateway", evidence: "User-provided chat note" }]
        })
      });
    conversationUpdate.mockResolvedValueOnce({ id: "conversation-1" });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "build_profile",
          message: "My GitHub project is AI API Gateway."
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.conversationId).toBe("conversation-1");
    expect(profileBankUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { userId: "user-1" },
        data: expect.objectContaining({
          rawSources: expect.objectContaining({
            entries: [
              expect.objectContaining({
                type: "chat_note",
                content: "My GitHub project is AI API Gateway."
              })
            ]
          }),
          checklist: expect.arrayContaining([
            expect.objectContaining({
              id: "github",
              done: true
            })
          ])
        })
      })
    );
    expect(profileBankUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { userId: "user-1" },
        data: {
          masterProfile: {
            projects: [{ name: "AI API Gateway", evidence: "User-provided chat note" }]
          }
        }
      })
    );
  });

  it("instructs the profile updater to keep facts grounded and apply corrections", async () => {
    profileBankUpdate
      .mockResolvedValueOnce(profileBank)
      .mockResolvedValueOnce({
        ...profileBank,
        masterProfile: {
          projects: [{ name: "AI API Gateway", metric: "20% latency reduction" }]
        }
      });
    conversationCreate.mockResolvedValueOnce({
      id: "conversation-2",
      mode: "build_profile",
      applicationId: null
    });
    chatMessageCreate
      .mockResolvedValueOnce({
        id: "message-user",
        role: "user",
        content: "Correction: the project latency reduction was 20%, not 50%."
      })
      .mockResolvedValueOnce({
        id: "message-assistant",
        role: "assistant",
        content: "I will keep the supported 20% metric."
      });
    chatMessageFindMany
      .mockResolvedValueOnce([
        {
          role: "user",
          content: "Correction: the project latency reduction was 20%, not 50%."
        }
      ])
      .mockResolvedValueOnce([]);
    responsesCreate
      .mockResolvedValueOnce({
        output_text: "I will keep the supported 20% metric."
      })
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          projects: [{ name: "AI API Gateway", metric: "20% latency reduction" }]
        })
      });
    conversationUpdate.mockResolvedValueOnce({ id: "conversation-2" });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "build_profile",
          message: "Correction: the project latency reduction was 20%, not 50%."
        })
      })
    );

    expect(response.status).toBe(200);
    expect(responsesCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        instructions: expect.stringContaining("Keep only facts grounded in user-provided information.")
      })
    );
    expect(responsesCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        instructions: expect.stringContaining("If the user corrects or deletes information, apply that correction.")
      })
    );
    expect(responsesCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        instructions: expect.stringContaining("Do not invent dates, metrics, employers, credentials, links, or technologies.")
      })
    );
  });
});
