import { beforeEach, describe, expect, it, vi } from "vitest";

const executePlatformAction = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {}
}));

vi.mock("@/lib/chat/platform-actions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chat/platform-actions")>(
    "@/lib/chat/platform-actions"
  );

  return {
    ...actual,
    executePlatformAction
  };
});

describe("chat platform action route", () => {
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

  it("rejects signed-out users", async () => {
    const { getServerSession } = await import("next-auth");
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/chat/actions", {
        method: "POST",
        body: JSON.stringify({
          type: "compare_applications",
          applicationIds: ["app-1", "app-2"]
        })
      })
    );

    expect(response.status).toBe(401);
  });

  it("rejects malformed model action payloads safely", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat/actions", {
        method: "POST",
        body: JSON.stringify({
          type: "archive_application",
          applicationId: "app-1"
        })
      })
    );

    expect(response.status).toBe(400);
    expect(executePlatformAction).not.toHaveBeenCalled();
  });

  it("executes a validated action for the signed-in user", async () => {
    executePlatformAction.mockResolvedValueOnce({
      type: "archive_application",
      application: {
        id: "app-1",
        status: "archived"
      }
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat/actions", {
        method: "POST",
        body: JSON.stringify({
          type: "archive_application",
          applicationId: "app-1",
          confirmed: true
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(executePlatformAction).toHaveBeenCalledWith({
      userId: "user-1",
      input: {
        type: "archive_application",
        applicationId: "app-1",
        confirmed: true
      }
    });
    expect(body.result.application.status).toBe("archived");
  });
});
