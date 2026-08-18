import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executePlatformAction,
  platformActionInputSchema
} from "./platform-actions";

const { applicationFindFirst, applicationFindMany, applicationUpdate } = vi.hoisted(() => ({
  applicationFindFirst: vi.fn(),
  applicationFindMany: vi.fn(),
  applicationUpdate: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findFirst: applicationFindFirst,
      findMany: applicationFindMany,
      update: applicationUpdate
    }
  }
}));

describe("platform chat actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects destructive actions unless explicit confirmation is present", () => {
    expect(
      platformActionInputSchema.safeParse({
        type: "archive_application",
        applicationId: "app-1"
      }).success
    ).toBe(false);
  });

  it("archives an application only after ownership lookup and writes audit metadata", async () => {
    applicationFindFirst.mockResolvedValueOnce({
      id: "app-1",
      company: "Example AI",
      role: "AI Engineer",
      status: "draft",
      archivedAt: null,
      notes: { entries: [] }
    });
    applicationUpdate.mockResolvedValueOnce({
      id: "app-1",
      company: "Example AI",
      role: "AI Engineer",
      status: "archived",
      archivedAt: new Date("2026-08-13T00:00:00.000Z")
    });

    const result = await executePlatformAction({
      userId: "user-1",
      input: {
        type: "archive_application",
        applicationId: "app-1",
        confirmed: true,
        reason: "No longer relevant"
      }
    });

    expect(applicationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "app-1",
          userId: "user-1"
        }
      })
    );
    expect(applicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app-1" },
        data: expect.objectContaining({
          status: "archived",
          notes: expect.objectContaining({
            entries: [
              expect.objectContaining({
                type: "platform_action",
                action: "archive_application",
                reason: "No longer relevant"
              })
            ]
          })
        })
      })
    );
    expect(result.type).toBe("archive_application");
  });

  it("rejects cross-user application IDs before updating state", async () => {
    applicationFindFirst.mockResolvedValueOnce(null);

    await expect(
      executePlatformAction({
        userId: "user-1",
        input: {
          type: "update_application_status",
          applicationId: "app-other",
          status: "submitted",
          confirmed: true
        }
      })
    ).rejects.toMatchObject({
      status: 404,
      message: "Application not found."
    });
    expect(applicationUpdate).not.toHaveBeenCalled();
  });

  it("rejects invalid status transitions into archived through the status action", () => {
    expect(
      platformActionInputSchema.safeParse({
        type: "update_application_status",
        applicationId: "app-1",
        status: "archived",
        confirmed: true
      }).success
    ).toBe(false);
  });

  it("restores an application by clearing archived state deterministically", async () => {
    applicationFindFirst.mockResolvedValueOnce({
      id: "app-1",
      company: "Example AI",
      role: "AI Engineer",
      status: "archived",
      archivedAt: new Date("2026-08-13T00:00:00.000Z"),
      notes: { entries: [] }
    });
    applicationUpdate.mockResolvedValueOnce({
      id: "app-1",
      status: "draft",
      archivedAt: null
    });

    await executePlatformAction({
      userId: "user-1",
      input: {
        type: "restore_application",
        applicationId: "app-1",
        confirmed: true
      }
    });

    expect(applicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "draft",
          archivedAt: null
        })
      })
    );
  });

  it("compares only user-owned application summaries", async () => {
    applicationFindMany.mockResolvedValueOnce([
      {
        id: "app-1",
        company: "Example AI",
        role: "AI Engineer",
        status: "draft",
        nextAction: "Tailor CV",
        jobSummary: { keywords: ["LLM"] },
        updatedAt: new Date("2026-08-13T00:00:00.000Z")
      },
      {
        id: "app-2",
        company: "Data Co",
        role: "Data Engineer",
        status: "submitted",
        nextAction: null,
        jobSummary: { keywords: ["SQL"] },
        updatedAt: new Date("2026-08-14T00:00:00.000Z")
      }
    ]);

    const result = await executePlatformAction({
      userId: "user-1",
      input: {
        type: "compare_applications",
        applicationIds: ["app-1", "app-2"]
      }
    });

    expect(applicationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          id: {
            in: ["app-1", "app-2"]
          }
        }
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        type: "compare_applications",
        applications: expect.arrayContaining([
          expect.objectContaining({ id: "app-1" }),
          expect.objectContaining({ id: "app-2" })
        ])
      })
    );
  });
});
