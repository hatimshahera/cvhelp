import { beforeEach, describe, expect, it, vi } from "vitest";

const profileBankUpsert = vi.fn();
const profileBankUpdate = vi.fn();
const subscriptionFindUnique = vi.fn();

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
    subscription: {
      findUnique: subscriptionFindUnique
    }
  }
}));

function formDataWithFile(file: File) {
  const formData = new FormData();
  formData.append("files", file);
  return formData;
}

describe("profile source uploads", () => {
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
    subscriptionFindUnique.mockResolvedValue(null);
  });

  it("blocks uploads when the upload limit is reached", async () => {
    profileBankUpsert.mockResolvedValueOnce({
      masterProfile: {},
      rawSources: {
        entries: Array.from({ length: 20 }, (_, index) => ({
          id: `source-${index}`,
          type: "file_upload_text",
          content: "Uploaded file",
          createdAt: "2026-08-13T00:00:00.000Z"
        }))
      },
      checklist: []
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/profile-sources", {
        method: "POST",
        body: formDataWithFile(new File(["CV text"], "cv.txt", { type: "text/plain" }))
      })
    );
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toBe("You have 0 uploads remaining on the free plan.");
    expect(profileBankUpdate).not.toHaveBeenCalled();
  });

  it("stores a text upload when the user is below the upload limit", async () => {
    profileBankUpsert.mockResolvedValueOnce({
      masterProfile: {},
      rawSources: { entries: [] },
      checklist: []
    });
    profileBankUpdate.mockResolvedValueOnce({
      masterProfile: {},
      rawSources: {
        entries: [
          {
            id: "source-1",
            type: "file_upload_text",
            content: "Uploaded file: cv.txt",
            createdAt: "2026-08-13T00:00:00.000Z"
          }
        ]
      },
      checklist: []
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/profile-sources", {
        method: "POST",
        body: formDataWithFile(new File(["CV text"], "cv.txt", { type: "text/plain" }))
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.uploaded[0].name).toBe("cv.txt");
    expect(profileBankUpdate).toHaveBeenCalled();
  });
});
