import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRequestLimits } from "@/lib/rate-limit";

const profileBankUpsert = vi.fn();
const profileBankUpdate = vi.fn();
const subscriptionFindUnique = vi.fn();
const sourceCount = vi.fn();
const sourceCreate = vi.fn();
const sourceDeleteMany = vi.fn();
const applicationFindFirst = vi.fn();
const pdfGetText = vi.fn();
const pdfDestroy = vi.fn();

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
    },
    source: {
      count: sourceCount,
      create: sourceCreate,
      deleteMany: sourceDeleteMany
    },
    application: {
      findFirst: applicationFindFirst
    }
  }
}));

vi.mock("pdf-parse", () => ({
  PDFParse: vi.fn(function MockPDFParse() {
    return {
      getText: pdfGetText,
      destroy: pdfDestroy
    };
  })
}));

function formDataWithFile(file: File) {
  const formData = new FormData();
  formData.append("files", file);
  return formData;
}

describe("profile source uploads", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetRequestLimits();
    delete process.env.CVHELP_UPLOAD_RATE_LIMIT;
    delete process.env.CVHELP_UPLOAD_RATE_WINDOW_MS;
    pdfGetText.mockResolvedValue({ text: "Extracted PDF CV text with education and experience." });
    pdfDestroy.mockResolvedValue(undefined);
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
    sourceCount.mockResolvedValue(0);
    sourceCreate.mockResolvedValue({
      id: "source-1"
    });
    sourceDeleteMany.mockResolvedValue({ count: 0 });
    applicationFindFirst.mockResolvedValue({
      id: "app-1"
    });
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

  it("blocks upload bursts before reading profile memory", async () => {
    process.env.CVHELP_UPLOAD_RATE_LIMIT = "0";
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/profile-sources", {
        method: "POST",
        body: formDataWithFile(new File(["CV text"], "cv.txt", { type: "text/plain" }))
      })
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe("Too many upload requests. Wait a moment and try again.");
    expect(profileBankUpsert).not.toHaveBeenCalled();
    expect(profileBankUpdate).not.toHaveBeenCalled();
  });

  it("rejects unsupported upload types", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/profile-sources", {
        method: "POST",
        body: formDataWithFile(new File(["binary"], "archive.zip", { type: "application/zip" }))
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("archive.zip is not a supported upload type. Use PDF or text-based files.");
    expect(profileBankUpsert).not.toHaveBeenCalled();
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
    expect(body.uploaded[0].sourceId).toBe("source-1");
    expect(body.uploaded[0].extractedText).toBe(true);
    expect(sourceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          scope: "profile",
          applicationId: null,
          kind: "file_upload_text",
          name: "cv.txt",
          textContent: expect.stringContaining("CV text")
        })
      })
    );
    expect(profileBankUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        data: expect.objectContaining({
          rawSources: expect.objectContaining({
            entries: [
              expect.objectContaining({
                type: "file_upload_text",
                name: "cv.txt",
                content: expect.stringContaining("CV text")
              })
            ]
          }),
          checklist: expect.arrayContaining([
            expect.objectContaining({
              id: "cv",
              done: true
            })
          ])
        })
      })
    );
  });

  it("stores extracted PDF text when PDF parsing succeeds", async () => {
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
            type: "file_upload_pdf",
            content: "Uploaded file: cv.pdf\n\nExtracted PDF CV text.",
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
        body: formDataWithFile(new File(["%PDF"], "cv.pdf", { type: "application/pdf" }))
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.uploaded[0].isPdf).toBe(true);
    expect(body.uploaded[0].extractedText).toBe(true);
    expect(pdfGetText).toHaveBeenCalled();
    expect(pdfDestroy).toHaveBeenCalled();
    expect(profileBankUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawSources: expect.objectContaining({
            entries: [
              expect.objectContaining({
                type: "file_upload_pdf",
                content: expect.stringContaining("Extracted PDF CV text")
              })
            ]
          })
        })
      })
    );
  });

  it("stores application-scoped uploads without writing profile raw sources", async () => {
    profileBankUpsert.mockResolvedValueOnce({
      masterProfile: {},
      rawSources: { entries: [] },
      checklist: []
    });
    sourceCreate.mockResolvedValueOnce({ id: "source-app-1" });
    const formData = formDataWithFile(
      new File(["Portfolio note for this application"], "role-note.txt", { type: "text/plain" })
    );
    formData.append("mode", "application");
    formData.append("applicationId", "app-1");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/profile-sources", {
        method: "POST",
        body: formData
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.uploaded[0].sourceId).toBe("source-app-1");
    expect(applicationFindFirst).toHaveBeenCalledWith({
      where: { id: "app-1", userId: "user-1" },
      select: { id: true }
    });
    expect(sourceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          scope: "application",
          applicationId: "app-1",
          kind: "file_upload_text"
        })
      })
    );
    expect(profileBankUpdate).not.toHaveBeenCalled();
  });

  it("deletes one saved source from the signed-in user's profile bank", async () => {
    profileBankUpsert.mockResolvedValueOnce({
      masterProfile: {},
      rawSources: {
        entries: [
          {
            id: "source-1",
            type: "file_upload_text",
            content: "Uploaded file: cv.txt",
            createdAt: "2026-08-13T00:00:00.000Z"
          },
          {
            id: "source-2",
            type: "chat_note",
            content: "Keep this note.",
            createdAt: "2026-08-13T00:01:00.000Z"
          }
        ]
      },
      checklist: []
    });
    profileBankUpdate.mockResolvedValueOnce({
      masterProfile: {},
      rawSources: {
        entries: [
          {
            id: "source-2",
            type: "chat_note",
            content: "Keep this note.",
            createdAt: "2026-08-13T00:01:00.000Z"
          }
        ]
      },
      checklist: []
    });
    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/profile-sources", {
        method: "DELETE",
        body: JSON.stringify({ sourceId: "source-1" })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deletedSourceId).toBe("source-1");
    expect(profileBankUpdate).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: {
        rawSources: {
          entries: [
            expect.objectContaining({
              id: "source-2"
            })
          ]
        }
      }
    });
    expect(sourceDeleteMany).toHaveBeenCalledWith({
      where: {
        id: "source-1",
        userId: "user-1",
        scope: "profile"
      }
    });
  });

  it("returns 404 when deleting a source that is not in the user's profile bank", async () => {
    profileBankUpsert.mockResolvedValueOnce({
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
    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/profile-sources", {
        method: "DELETE",
        body: JSON.stringify({ sourceId: "source-2" })
      })
    );

    expect(response.status).toBe(404);
    expect(profileBankUpdate).not.toHaveBeenCalled();
  });
});
