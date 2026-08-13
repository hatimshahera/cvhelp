import { beforeEach, describe, expect, it, vi } from "vitest";

const profileBankUpsert = vi.fn();
const profileBankUpdate = vi.fn();
const subscriptionFindUnique = vi.fn();
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
    expect(body.uploaded[0].extractedText).toBe(true);
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
