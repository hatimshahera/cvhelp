import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {}
}));

describe("session helpers", () => {
  it("returns null when there is no signed-in user", async () => {
    const { getServerSession } = await import("next-auth");
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const { getCurrentUser } = await import("./session");

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns normalized current user details from the session", async () => {
    const { getServerSession } = await import("next-auth");
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: {
        id: "user-1",
        name: "Hatim",
        email: "hatim@example.com"
      },
      expires: "2026-08-13T00:00:00.000Z"
    });
    const { getCurrentUser } = await import("./session");

    await expect(getCurrentUser()).resolves.toEqual({
      id: "user-1",
      name: "Hatim",
      email: "hatim@example.com"
    });
  });

  it("throws a stable unauthorized error when a user is required", async () => {
    const { getServerSession } = await import("next-auth");
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const { requireCurrentUser } = await import("./session");

    await expect(requireCurrentUser()).rejects.toThrow("UNAUTHORIZED");
  });
});
