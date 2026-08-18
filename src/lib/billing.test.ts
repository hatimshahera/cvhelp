import { describe, expect, it } from "vitest";
import { checkFeatureLimit, getBillingStatus, normalizePlan, planLimits } from "./billing";

describe("billing helpers", () => {
  it("returns a free billing status when no subscription exists", () => {
    expect(getBillingStatus(null)).toEqual({
      provider: "stripe",
      plan: "free",
      status: "free",
      currentPeriodEnd: null,
      trialEndsAt: null,
      hasCustomer: false,
      hasSubscription: false,
      hasUnlimitedLimits: false,
      limits: planLimits.free
    });
  });

  it("normalizes unknown plans to free", () => {
    expect(normalizePlan("enterprise")).toBe("free");
    expect(normalizePlan("pro")).toBe("pro");
    expect(normalizePlan("internal")).toBe("internal");
  });

  it("checks feature limits for the selected plan", () => {
    expect(checkFeatureLimit({ plan: "free", feature: "applications", used: 4 })).toEqual({
      allowed: true,
      limit: 5,
      remaining: 1
    });
    expect(checkFeatureLimit({ plan: "free", feature: "applications", used: 5 })).toEqual({
      allowed: false,
      limit: 5,
      remaining: 0
    });
  });

  it("supports temporary internal unlimited limits", () => {
    expect(getBillingStatus({ plan: "internal", status: "active" })).toMatchObject({
      plan: "internal",
      status: "active",
      hasUnlimitedLimits: true
    });
    expect(
      checkFeatureLimit({
        plan: "internal",
        feature: "applications",
        used: 100_000
      }).allowed
    ).toBe(true);
  });
});
