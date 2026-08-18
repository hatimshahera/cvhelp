import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRequestLimits } from "@/lib/rate-limit";

const profileBankUpsert = vi.fn();
const profileBankUpdate = vi.fn();
const profileBankFindUnique = vi.fn();
const applicationFindFirst = vi.fn();
const applicationFindMany = vi.fn();
const applicationFindUnique = vi.fn();
const applicationCount = vi.fn();
const conversationFindFirst = vi.fn();
const conversationFindMany = vi.fn();
const conversationCreate = vi.fn();
const conversationUpdate = vi.fn();
const chatMessageCreate = vi.fn();
const chatMessageDelete = vi.fn();
const chatMessageDeleteMany = vi.fn();
const chatMessageFindMany = vi.fn();
const chatMessageSourceCreateMany = vi.fn();
const subscriptionFindUnique = vi.fn();
const applicationUpdate = vi.fn();
const applicationCreate = vi.fn();
const sourceFindMany = vi.fn();
const sourceUpdateMany = vi.fn();
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
      update: profileBankUpdate,
      findUnique: profileBankFindUnique
    },
    application: {
      findFirst: applicationFindFirst,
      findMany: applicationFindMany,
      findUnique: applicationFindUnique,
      count: applicationCount,
      create: applicationCreate,
      update: applicationUpdate
    },
    subscription: {
      findUnique: subscriptionFindUnique
    },
    conversation: {
      findFirst: conversationFindFirst,
      findMany: conversationFindMany,
      create: conversationCreate,
      update: conversationUpdate
    },
    chatMessage: {
      create: chatMessageCreate,
      delete: chatMessageDelete,
      deleteMany: chatMessageDeleteMany,
      findMany: chatMessageFindMany
    },
    chatMessageSource: {
      createMany: chatMessageSourceCreateMany
    },
    source: {
      findMany: sourceFindMany,
      updateMany: sourceUpdateMany
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
    resetRequestLimits();
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.CVHELP_CHAT_RATE_LIMIT;
    delete process.env.CVHELP_CHAT_RATE_WINDOW_MS;
    profileBankUpsert.mockResolvedValue(profileBank);
    profileBankUpdate.mockResolvedValue(profileBank);
    profileBankFindUnique.mockResolvedValue(profileBank);
    applicationFindMany.mockResolvedValue([]);
    conversationFindMany.mockResolvedValue([]);
    sourceFindMany.mockResolvedValue([]);
    sourceUpdateMany.mockResolvedValue({ count: 0 });
    chatMessageSourceCreateMany.mockResolvedValue({ count: 0 });
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
        applicationId: "app-1"
      }
    });
    expect(chatMessageCreate).not.toHaveBeenCalled();
    expect(applicationUpdate).not.toHaveBeenCalled();
    expect(responsesCreate).not.toHaveBeenCalled();
  });

  it("returns General Chat thread summaries with the latest General conversation", async () => {
    conversationFindFirst.mockResolvedValueOnce({
      id: "conversation-general-2",
      mode: "general",
      applicationId: null,
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Second chat",
          metadata: null,
          createdAt: new Date("2026-08-13T00:00:00.000Z")
        }
      ]
    });
    conversationFindMany.mockResolvedValueOnce([
      {
        id: "conversation-general-2",
        title: "Second chat",
        mode: "general",
        applicationId: null,
        createdAt: new Date("2026-08-13T00:00:00.000Z"),
        updatedAt: new Date("2026-08-13T00:00:00.000Z")
      },
      {
        id: "conversation-general-1",
        title: "First chat",
        mode: "general",
        applicationId: null,
        createdAt: new Date("2026-08-12T00:00:00.000Z"),
        updatedAt: new Date("2026-08-12T00:00:00.000Z")
      }
    ]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/chat?mode=general"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.conversationId).toBe("conversation-general-2");
    expect(body.conversations).toHaveLength(2);
    expect(conversationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          mode: "general",
          applicationId: null
        }
      })
    );
  });

  it("blocks chat requests when the request limiter is reached", async () => {
    process.env.CVHELP_CHAT_RATE_LIMIT = "0";
    applicationFindFirst.mockResolvedValueOnce(application);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "application",
          applicationId: "app-1",
          message: "Tailor this CV for the role."
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe("Too many chat requests. Wait a moment and try again.");
    expect(conversationCreate).not.toHaveBeenCalled();
    expect(chatMessageCreate).not.toHaveBeenCalled();
    expect(responsesCreate).not.toHaveBeenCalled();
  });

  it("rejects attached sources outside the current chat scope before saving a chat message", async () => {
    applicationFindFirst.mockResolvedValueOnce(application);
    conversationCreate.mockResolvedValueOnce({
      id: "conversation-1",
      mode: "application",
      applicationId: "app-1"
    });
    sourceFindMany.mockResolvedValueOnce([]);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "application",
          applicationId: "app-1",
          message: "Use this source.",
          sourceIds: ["source-from-another-app"]
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("One or more attached sources are unavailable for this chat.");
    expect(sourceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["source-from-another-app"] },
          userId: "user-1",
          scope: "application",
          applicationId: "app-1"
        })
      })
    );
    expect(chatMessageCreate).not.toHaveBeenCalled();
    expect(responsesCreate).not.toHaveBeenCalled();
  });

  it("links valid attached sources to the saved user message", async () => {
    conversationCreate.mockResolvedValueOnce({
      id: "conversation-general",
      mode: "general",
      applicationId: null
    });
    sourceFindMany.mockResolvedValueOnce([
      {
        id: "source-1",
        scope: "general",
        applicationId: null,
        kind: "file_upload_text",
        name: "job.txt",
        textContent: "Example AI is hiring an AI Engineer.",
        metadata: null,
        createdAt: new Date("2026-08-13T00:00:00.000Z")
      }
    ]);
    chatMessageCreate
      .mockResolvedValueOnce({
        id: "message-user",
        role: "user",
        content: "Review the attached source."
      })
      .mockResolvedValueOnce({
        id: "message-assistant",
        role: "assistant",
        content: "I reviewed it."
      });
    chatMessageFindMany
      .mockResolvedValueOnce([
        {
          role: "user",
          content: "Review the attached source."
        }
      ])
      .mockResolvedValueOnce([]);
    responsesCreate.mockResolvedValueOnce({
      output_text: "I reviewed it."
    });
    conversationUpdate.mockResolvedValueOnce({ id: "conversation-general" });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "general",
          message: "Review the attached source.",
          sourceIds: ["source-1"]
        })
      })
    );

    expect(response.status).toBe(200);
    expect(chatMessageSourceCreateMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "user-1",
          messageId: "message-user",
          sourceId: "source-1"
        }
      ],
      skipDuplicates: true
    });
    expect(responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Attached source snippets")
      })
    );
  });

  it("keeps casual general chat context-light", async () => {
    conversationCreate.mockResolvedValueOnce({
      id: "conversation-general",
      mode: "general",
      applicationId: null,
      summary: null,
      lastSummarizedMessageId: null
    });
    chatMessageCreate
      .mockResolvedValueOnce({
        id: "message-user",
        role: "user",
        content: "yo yo yo"
      })
      .mockResolvedValueOnce({
        id: "message-assistant",
        role: "assistant",
        content: "Hey - yes, this works."
      });
    chatMessageFindMany
      .mockResolvedValueOnce([
        {
          role: "user",
          content: "yo yo yo"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "message-user",
          role: "user",
          content: "yo yo yo",
          metadata: null,
          createdAt: new Date("2026-08-13T00:00:00.000Z")
        },
        {
          id: "message-assistant",
          role: "assistant",
          content: "Hey - yes, this works.",
          metadata: null,
          createdAt: new Date("2026-08-13T00:00:01.000Z")
        }
      ]);
    responsesCreate.mockResolvedValueOnce({
      output_text: "Hey - yes, this works."
    });
    conversationUpdate.mockResolvedValueOnce({ id: "conversation-general" });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "general",
          message: "yo yo yo"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(applicationFindMany).not.toHaveBeenCalled();
    expect(profileBankFindUnique).not.toHaveBeenCalled();
    expect(responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining("Behave like a normal chatbot by default"),
        input: expect.stringContaining("General Chat backend tool definitions")
      })
    );
    expect(responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.not.stringContaining("Workspace application summaries")
      })
    );
    expect(responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.not.stringContaining("On-demand workspace context")
      })
    );
  });

  it("creates a separate General Chat thread when the client starts a new chat", async () => {
    conversationCreate.mockResolvedValueOnce({
      id: "conversation-general-new",
      mode: "general",
      applicationId: null,
      summary: null,
      lastSummarizedMessageId: null
    });
    chatMessageCreate
      .mockResolvedValueOnce({
        id: "message-user",
        role: "user",
        content: "hello new chat"
      })
      .mockResolvedValueOnce({
        id: "message-assistant",
        role: "assistant",
        content: "Hi."
      });
    chatMessageFindMany
      .mockResolvedValueOnce([
        {
          role: "user",
          content: "hello new chat"
        }
      ])
      .mockResolvedValueOnce([]);
    responsesCreate.mockResolvedValueOnce({
      output_text: "Hi."
    });
    conversationUpdate.mockResolvedValueOnce({ id: "conversation-general-new" });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "general",
          newConversation: true,
          message: "hello new chat"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(conversationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          mode: "general",
          applicationId: null,
          title: "hello new chat",
          threadKey: expect.any(String)
        })
      })
    );
    expect(conversationCreate.mock.calls[0]?.[0]?.data.threadKey).not.toBe("default");
  });

  it("loads application workspace context only for explicit general workspace requests", async () => {
    conversationCreate.mockResolvedValueOnce({
      id: "conversation-general",
      mode: "general",
      applicationId: null,
      summary: null,
      lastSummarizedMessageId: null
    });
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
    chatMessageCreate
      .mockResolvedValueOnce({
        id: "message-user",
        role: "user",
        content: "show my applications"
      })
      .mockResolvedValueOnce({
        id: "message-assistant",
        role: "assistant",
        content: "You have one draft application."
      });
    chatMessageFindMany
      .mockResolvedValueOnce([
        {
          role: "user",
          content: "show my applications"
        }
      ])
      .mockResolvedValueOnce([]);
    responsesCreate.mockResolvedValueOnce({
      output_text: "You have one draft application."
    });
    conversationUpdate.mockResolvedValueOnce({ id: "conversation-general" });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "general",
          message: "show my applications"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(applicationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" }
      })
    );
    expect(responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("On-demand workspace context")
      })
    );
    expect(responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Example AI")
      })
    );
  });

  it("creates an application from an attached general job source and moves that source to the application", async () => {
    const jobText =
      "Example AI is hiring an AI Engineer. Requirements include Python, RAG, LLM evaluation, backend APIs, and production agent workflows.";
    conversationCreate
      .mockResolvedValueOnce({
        id: "conversation-general",
        mode: "general",
        applicationId: null
      })
      .mockResolvedValueOnce({
        id: "conversation-application",
        mode: "application",
        applicationId: "app-from-source"
      });
    sourceFindMany.mockResolvedValueOnce([
      {
        id: "source-general-job",
        scope: "general",
        applicationId: null,
        kind: "file_upload_text",
        name: "job.txt",
        textContent: jobText,
        metadata: null,
        createdAt: new Date("2026-08-13T00:00:00.000Z")
      }
    ]);
    chatMessageCreate
      .mockResolvedValueOnce({
        id: "message-user",
        role: "user",
        content: "Create an application from this uploaded job source."
      })
      .mockResolvedValueOnce({
        id: "message-assistant",
        role: "assistant",
        content: "Created a new application for Example AI - AI Engineer.",
        metadata: {
          actions: [
            {
              type: "open_application_chat",
              label: "Open application chat",
              applicationId: "app-from-source"
            }
          ]
        }
      });
    chatMessageFindMany
      .mockResolvedValueOnce([
        {
          role: "user",
          content: "Create an application from this uploaded job source."
        }
      ])
      .mockResolvedValueOnce([]);
    responsesCreate.mockResolvedValueOnce({
      output_text: "I can create an application from the attached job source."
    });
    subscriptionFindUnique.mockResolvedValueOnce(null);
    applicationCount.mockResolvedValueOnce(1);
    applicationFindUnique.mockResolvedValueOnce(null);
    applicationCreate.mockResolvedValueOnce({
      id: "app-from-source",
      company: "Example AI",
      role: "AI Engineer",
      slug: "example-ai-ai-engineer",
      status: "draft",
      createdAt: new Date("2026-08-13T00:00:00.000Z"),
      updatedAt: new Date("2026-08-13T00:00:00.000Z")
    });
    applicationFindFirst.mockResolvedValueOnce({ id: "app-from-source" });
    sourceUpdateMany.mockResolvedValueOnce({ count: 1 });
    conversationUpdate.mockResolvedValueOnce({ id: "conversation-general" });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "general",
          message: "Create an application from this uploaded job source.",
          sourceIds: ["source-general-job"]
        })
      })
    );

    expect(response.status).toBe(200);
    expect(applicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          jobPost: expect.objectContaining({
            content: jobText
          })
        })
      })
    );
    expect(sourceUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["source-general-job"] },
        userId: "user-1",
        scope: "general",
        applicationId: null
      },
      data: {
        scope: "application",
        applicationId: "app-from-source"
      }
    });
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

  it("creates a new application from a job description in general chat and returns an open action", async () => {
    const createdApplication = {
      id: "app-general-1",
      company: "Example AI",
      role: "AI Engineer",
      slug: "example-ai-ai-engineer",
      status: "draft",
      createdAt: new Date("2026-08-13T00:00:00.000Z"),
      updatedAt: new Date("2026-08-13T00:00:00.000Z")
    };
    conversationCreate
      .mockResolvedValueOnce({
        id: "conversation-general",
        mode: "general",
        applicationId: null
      })
      .mockResolvedValueOnce({
        id: "conversation-application",
        mode: "application",
        applicationId: "app-general-1"
      });
    chatMessageCreate
      .mockResolvedValueOnce({
        id: "message-user",
        role: "user",
        content:
          "Example AI is hiring an AI Engineer. Requirements include Python, RAG, LLM evaluation, and backend agent workflows."
      })
      .mockResolvedValueOnce({
        id: "message-assistant",
        role: "assistant",
        content: "Created a new application for Example AI - AI Engineer.",
        metadata: {
          actions: [
            {
              type: "open_application_chat",
              label: "Open application chat",
              applicationId: "app-general-1"
            }
          ]
        }
      });
    chatMessageFindMany
      .mockResolvedValueOnce([
        {
          role: "user",
          content:
            "Example AI is hiring an AI Engineer. Requirements include Python, RAG, LLM evaluation, and backend agent workflows."
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "message-user",
          role: "user",
          content:
            "Example AI is hiring an AI Engineer. Requirements include Python, RAG, LLM evaluation, and backend agent workflows.",
          metadata: null,
          createdAt: new Date("2026-08-13T00:00:00.000Z")
        },
        {
          id: "message-assistant",
          role: "assistant",
          content: "Created a new application for Example AI - AI Engineer.",
          metadata: {
            actions: [
              {
                type: "open_application_chat",
                label: "Open application chat",
                applicationId: "app-general-1"
              }
            ]
          },
          createdAt: new Date("2026-08-13T00:00:01.000Z")
        }
      ]);
    responsesCreate.mockResolvedValueOnce({
      output_text: "I can turn that into an application workspace."
    });
    subscriptionFindUnique.mockResolvedValueOnce(null);
    applicationCount.mockResolvedValueOnce(1);
    applicationFindUnique.mockResolvedValueOnce(null);
    applicationCreate.mockResolvedValueOnce(createdApplication);
    conversationUpdate.mockResolvedValueOnce({ id: "conversation-general" });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "general",
          message:
            "Example AI is hiring an AI Engineer. Requirements include Python, RAG, LLM evaluation, and backend agent workflows."
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(applicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          jobPost: expect.objectContaining({
            content: expect.stringContaining("Example AI is hiring")
          })
        })
      })
    );
    expect(chatMessageCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          role: "assistant",
          metadata: {
            actions: [
              {
                type: "open_application_chat",
                label: "Open application chat",
                applicationId: "app-general-1"
              }
            ]
          }
        })
      })
    );
    expect(body.messages[1].metadata.actions[0]).toEqual(
      expect.objectContaining({
        type: "open_application_chat",
        applicationId: "app-general-1"
      })
    );
  });

  it("creates a new application from a readable job URL in general chat", async () => {
    const createdApplication = {
      id: "app-general-url",
      company: "Example AI",
      role: "Senior Full-Stack Engineer",
      slug: "example-ai-senior-full-stack-engineer",
      status: "draft",
      createdAt: new Date("2026-08-13T00:00:00.000Z"),
      updatedAt: new Date("2026-08-13T00:00:00.000Z")
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: vi.fn().mockResolvedValue(`
          <html>
            <body>
              <h1>Senior Full-stack Engineer</h1>
              <p>Example AI is hiring a Senior Full-stack Engineer.</p>
              <p>Must have experience with TypeScript, React, Next.js, Postgres, APIs, LLMs, and RAG.</p>
              <p>Build AI agent workflows, evaluation systems, and backend services for production users.</p>
              <p>Collaborate with product and design teams to deliver customer-facing tools.</p>
            </body>
          </html>
        `)
      })
    );
    conversationCreate
      .mockResolvedValueOnce({
        id: "conversation-general",
        mode: "general",
        applicationId: null
      })
      .mockResolvedValueOnce({
        id: "conversation-application",
        mode: "application",
        applicationId: "app-general-url"
      });
    chatMessageCreate
      .mockResolvedValueOnce({
        id: "message-user",
        role: "user",
        content: "https://example.com/jobs/senior-full-stack-engineer"
      })
      .mockResolvedValueOnce({
        id: "message-assistant",
        role: "assistant",
        content: "Created a new application for Example AI - Senior Full-Stack Engineer.",
        metadata: {
          actions: [
            {
              type: "open_application_chat",
              label: "Open application chat",
              applicationId: "app-general-url"
            }
          ]
        }
      });
    chatMessageFindMany
      .mockResolvedValueOnce([
        {
          role: "user",
          content: "https://example.com/jobs/senior-full-stack-engineer"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "message-user",
          role: "user",
          content: "https://example.com/jobs/senior-full-stack-engineer",
          metadata: null,
          createdAt: new Date("2026-08-13T00:00:00.000Z")
        },
        {
          id: "message-assistant",
          role: "assistant",
          content: "Created a new application for Example AI - Senior Full-Stack Engineer.",
          metadata: {
            actions: [
              {
                type: "open_application_chat",
                label: "Open application chat",
                applicationId: "app-general-url"
              }
            ]
          },
          createdAt: new Date("2026-08-13T00:00:01.000Z")
        }
      ]);
    responsesCreate.mockResolvedValueOnce({
      output_text: "I can create an application workspace from that job URL."
    });
    subscriptionFindUnique.mockResolvedValueOnce(null);
    applicationCount.mockResolvedValueOnce(1);
    applicationFindUnique.mockResolvedValueOnce(null);
    applicationCreate.mockResolvedValueOnce(createdApplication);
    conversationUpdate.mockResolvedValueOnce({ id: "conversation-general" });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "general",
          message: "https://example.com/jobs/senior-full-stack-engineer"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(applicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          jobPost: expect.objectContaining({
            source: "job_post_url",
            sourceUrl: "https://example.com/jobs/senior-full-stack-engineer",
            content: expect.stringContaining("Senior Full-stack Engineer")
          })
        })
      })
    );
  });

  it("creates a profile handoff from general chat without updating the profile bank", async () => {
    conversationCreate.mockResolvedValueOnce({
      id: "conversation-general",
      mode: "general",
      applicationId: null
    });
    conversationFindFirst.mockResolvedValueOnce({
      id: "conversation-profile",
      mode: "build_profile",
      applicationId: null
    });
    chatMessageCreate
      .mockResolvedValueOnce({
        id: "message-user",
        role: "user",
        content: "For my profile, I prefer concise one-page CVs with direct bullet style."
      })
      .mockResolvedValueOnce({
        id: "message-profile-handoff",
        role: "assistant",
        content: "General Chat handoff: confirm the preference."
      })
      .mockResolvedValueOnce({
        id: "message-assistant",
        role: "assistant",
        content: "I added a short handoff note to your Profile Chat.",
        metadata: {
          actions: [
            {
              type: "continue_in_profile_chat",
              label: "Continue in Profile Chat",
              conversationId: "conversation-profile"
            }
          ]
        }
      });
    chatMessageFindMany
      .mockResolvedValueOnce([
        {
          role: "user",
          content: "For my profile, I prefer concise one-page CVs with direct bullet style."
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "message-user",
          role: "user",
          content: "For my profile, I prefer concise one-page CVs with direct bullet style.",
          metadata: null,
          createdAt: new Date("2026-08-13T00:00:00.000Z")
        },
        {
          id: "message-assistant",
          role: "assistant",
          content: "I added a short handoff note to your Profile Chat.",
          metadata: {
            actions: [
              {
                type: "continue_in_profile_chat",
                label: "Continue in Profile Chat",
                conversationId: "conversation-profile"
              }
            ]
          },
          createdAt: new Date("2026-08-13T00:00:01.000Z")
        }
      ]);
    responsesCreate.mockResolvedValueOnce({
      output_text: "That belongs in your reusable profile preferences."
    });
    conversationUpdate
      .mockResolvedValueOnce({ id: "conversation-profile" })
      .mockResolvedValueOnce({ id: "conversation-general" });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "general",
          message: "For my profile, I prefer concise one-page CVs with direct bullet style."
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(profileBankUpdate).not.toHaveBeenCalled();
    expect(chatMessageCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conversation-profile",
          content: expect.stringContaining("General Chat handoff")
        })
      })
    );
    expect(body.messages[1].metadata.actions[0]).toEqual(
      expect.objectContaining({
        type: "continue_in_profile_chat",
        conversationId: "conversation-profile"
      })
    );
  });

  it("routes reusable profile updates from application chat through a profile handoff", async () => {
    applicationFindFirst.mockResolvedValueOnce(application);
    conversationCreate.mockResolvedValueOnce({
      id: "conversation-application",
      mode: "application",
      applicationId: "app-1",
      summary: null,
      lastSummarizedMessageId: null
    });
    conversationFindFirst.mockResolvedValueOnce({
      id: "conversation-profile",
      mode: "build_profile",
      applicationId: null
    });
    chatMessageCreate
      .mockResolvedValueOnce({
        id: "message-user",
        role: "user",
        content: "Update my global profile: I prefer one-page CVs."
      })
      .mockResolvedValueOnce({
        id: "message-profile-handoff",
        role: "assistant",
        content: "Application Chat handoff: confirm the preference."
      })
      .mockResolvedValueOnce({
        id: "message-assistant",
        role: "assistant",
        content: "I added a short handoff note to your Profile Chat.",
        metadata: {
          actions: [
            {
              type: "continue_in_profile_chat",
              label: "Continue in Profile Chat",
              conversationId: "conversation-profile"
            }
          ]
        }
      });
    chatMessageFindMany
      .mockResolvedValueOnce([
        {
          role: "user",
          content: "Update my global profile: I prefer one-page CVs."
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "message-user",
          role: "user",
          content: "Update my global profile: I prefer one-page CVs.",
          metadata: null,
          createdAt: new Date("2026-08-13T00:00:00.000Z")
        },
        {
          id: "message-assistant",
          role: "assistant",
          content: "I added a short handoff note to your Profile Chat.",
          metadata: {
            actions: [
              {
                type: "continue_in_profile_chat",
                label: "Continue in Profile Chat",
                conversationId: "conversation-profile"
              }
            ]
          },
          createdAt: new Date("2026-08-13T00:00:01.000Z")
        }
      ]);
    responsesCreate
      .mockResolvedValueOnce({
        output_text: "That reusable preference belongs in Profile Chat."
      })
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          target: {
            company: "Example AI",
            role: "AI Engineer",
            fit: []
          },
          jobPost: application.jobPost,
          requirements: [],
          responsibilities: [],
          keywords: [],
          selectedEvidence: {
            projects: [],
            research: [],
            experience: [],
            skills: []
          },
          profileSummary: "",
          honestyNotes: [],
          risks: [],
          gaps: [],
          notes: [],
          drafts: {},
          claimProvenance: {},
          nextActions: []
        })
      });
    conversationUpdate
      .mockResolvedValueOnce({ id: "conversation-profile" })
      .mockResolvedValueOnce({ id: "conversation-application" });
    applicationUpdate.mockResolvedValueOnce(application);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          mode: "application",
          applicationId: "app-1",
          message: "Update my global profile: I prefer one-page CVs."
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(profileBankUpdate).not.toHaveBeenCalled();
    expect(chatMessageCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conversation-profile",
          content: expect.stringContaining("Application Chat handoff from Example AI - AI Engineer")
        })
      })
    );
    expect(body.messages[1].metadata.actions[0]).toEqual(
      expect.objectContaining({
        type: "continue_in_profile_chat",
        conversationId: "conversation-profile"
      })
    );
  });
});
