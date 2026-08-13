import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const userCreate = vi.fn();

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn()
  }
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: userFindUnique,
      create: userCreate
    }
  }
}));

describe("signup API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bcrypt.hash).mockResolvedValue("hashed-password" as never);
  });

  it("creates a user with a normalized email and hashed password", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    userCreate.mockResolvedValueOnce({ id: "user-1" });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/signup", {
        method: "POST",
        body: JSON.stringify({
          name: "Hatim Shaherawala",
          email: " HATIM@example.com ",
          password: "long-password"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { email: "hatim@example.com" },
      select: { id: true }
    });
    expect(bcrypt.hash).toHaveBeenCalledWith("long-password", 12);
    expect(userCreate).toHaveBeenCalledWith({
      data: {
        name: "Hatim Shaherawala",
        email: "hatim@example.com",
        passwordHash: "hashed-password"
      }
    });
  });

  it("rejects duplicate signup attempts", async () => {
    userFindUnique.mockResolvedValueOnce({ id: "user-existing" });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/signup", {
        method: "POST",
        body: JSON.stringify({
          name: "Hatim Shaherawala",
          email: "hatim@example.com",
          password: "long-password"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("An account already exists for this email.");
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("rejects invalid signup details", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/signup", {
        method: "POST",
        body: JSON.stringify({
          name: "H",
          email: "not-an-email",
          password: "short"
        })
      })
    );

    expect(response.status).toBe(400);
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });
});
