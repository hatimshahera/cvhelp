import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({}))
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn()
  }
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: userFindUnique
    }
  }
}));

async function authorize(credentials: { email?: string; password?: string }) {
  const { authOptions } = await import("./auth");
  const credentialsProvider = authOptions.providers.find((provider) => provider.id === "credentials") as {
    authorize?: (credentials: Record<string, string>) => Promise<unknown>;
    options?: {
      authorize?: (credentials: Record<string, string>) => Promise<unknown>;
    };
  };
  const authorizeFn = credentialsProvider.options?.authorize ?? credentialsProvider.authorize;

  if (!authorizeFn) throw new Error("Credentials authorize function was not found.");

  return authorizeFn(credentials as Record<string, string>);
}

describe("credentials auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authorizes valid email/password credentials", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "hatim@example.com",
      name: "Hatim",
      image: null,
      passwordHash: "hashed-password"
    });
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);

    const user = await authorize({
      email: " HATIM@example.com ",
      password: "long-password"
    });

    expect(user).toEqual({
      id: "user-1",
      email: "hatim@example.com",
      name: "Hatim",
      image: null
    });
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { email: "hatim@example.com" }
    });
    expect(bcrypt.compare).toHaveBeenCalledWith("long-password", "hashed-password");
  });

  it("rejects missing credentials", async () => {
    const user = await authorize({ email: "", password: "" });

    expect(user).toBeNull();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("rejects invalid passwords", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "hatim@example.com",
      name: "Hatim",
      image: null,
      passwordHash: "hashed-password"
    });
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

    const user = await authorize({
      email: "hatim@example.com",
      password: "wrong-password"
    });

    expect(user).toBeNull();
  });

  it("rejects users without a password hash", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "hatim@example.com",
      name: "Hatim",
      image: null,
      passwordHash: null
    });

    const user = await authorize({
      email: "hatim@example.com",
      password: "long-password"
    });

    expect(user).toBeNull();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });
});
