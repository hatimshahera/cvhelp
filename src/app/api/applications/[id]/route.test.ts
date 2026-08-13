import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const update = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {}
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findFirst,
      update
    }
  }
}));

describe("application detail API", () => {
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

  it("loads an application scoped to the signed-in user", async () => {
    findFirst.mockResolvedValueOnce({
      id: "app-1",
      userId: "user-1",
      company: "Example AI",
      role: "AI Engineer",
      artifacts: []
    });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/applications/app-1"), {
      params: Promise.resolve({ id: "app-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.application.id).toBe("app-1");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app-1", userId: "user-1" }
      })
    );
  });

  it("returns 404 when the application is not owned by the user", async () => {
    findFirst.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/applications/app-2"), {
      params: Promise.resolve({ id: "app-2" })
    });

    expect(response.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app-2", userId: "user-1" }
      })
    );
  });

  it("archives an application only after ownership is verified", async () => {
    findFirst.mockResolvedValueOnce({ id: "app-1" });
    update.mockResolvedValueOnce({
      id: "app-1",
      status: "archived",
      archivedAt: new Date("2026-08-13T00:00:00.000Z"),
      artifacts: []
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/applications/app-1", {
        method: "PATCH",
        body: JSON.stringify({ archived: true })
      }),
      { params: Promise.resolve({ id: "app-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.application.status).toBe("archived");
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "app-1", userId: "user-1" },
      select: { id: true }
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app-1" },
        data: expect.objectContaining({ status: "archived" })
      })
    );
  });
});
