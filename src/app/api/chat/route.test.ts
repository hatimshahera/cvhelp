import { beforeEach, describe, expect, it, vi } from "vitest";

const profileBankUpsert = vi.fn();
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
      upsert: profileBankUpsert
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
  rawSources: [],
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
});
