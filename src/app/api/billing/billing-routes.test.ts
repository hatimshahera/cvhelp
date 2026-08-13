import { beforeEach, describe, expect, it, vi } from "vitest";

const subscriptionFindUnique = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {}
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: subscriptionFindUnique
    }
  }
}));

describe("billing routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID;
    delete process.env.STRIPE_WEBHOOK_SECRET;

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

  it("returns the default free billing status", async () => {
    subscriptionFindUnique.mockResolvedValueOnce(null);
    const { GET } = await import("./status/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.billing.plan).toBe("free");
    expect(body.billing.status).toBe("free");
    expect(subscriptionFindUnique).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("requires signin before checkout", async () => {
    const { getServerSession } = await import("next-auth");
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const { POST } = await import("./checkout/route");
    const response = await POST();

    expect(response.status).toBe(401);
  });

  it("returns a clear checkout setup error before Stripe is configured", async () => {
    const { POST } = await import("./checkout/route");
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body.error).toBe("Stripe checkout is not configured yet.");
  });

  it("returns a clear webhook setup error before Stripe is configured", async () => {
    const { POST } = await import("./webhook/route");
    const response = await POST(new Request("http://localhost/api/billing/webhook", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body.error).toBe("Stripe webhook handling is not configured yet.");
  });
});
