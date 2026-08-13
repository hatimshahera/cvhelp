import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {}
}));

describe("protected API routes", () => {
  beforeEach(async () => {
    const { getServerSession } = await import("next-auth");
    vi.mocked(getServerSession).mockReset();
    vi.mocked(getServerSession).mockResolvedValue(null);
  });

  it("rejects signed-out application list requests", async () => {
    const { GET } = await import("./applications/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Sign in to view applications.");
  });

  it("rejects signed-out application creation requests", async () => {
    const { POST } = await import("./applications/route");
    const response = await POST(
      new Request("http://localhost/api/applications", {
        method: "POST",
        body: JSON.stringify({ jobSource: "A long job description that would otherwise pass validation." })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Sign in to add applications.");
  });

  it("rejects signed-out chat history requests", async () => {
    const { GET } = await import("./chat/route");
    const response = await GET(new Request("http://localhost/api/chat?mode=build_profile"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Sign in to use chat.");
  });

  it("rejects signed-out profile source uploads", async () => {
    const { POST } = await import("./profile-sources/route");
    const response = await POST(
      new Request("http://localhost/api/profile-sources", {
        method: "POST",
        body: new FormData()
      })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Sign in to upload files.");
  });

  it("rejects signed-out profile detail requests", async () => {
    const { GET } = await import("./profile/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Sign in to view your profile.");
  });
});
