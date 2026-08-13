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
      limits: planLimits.free
    });
  });

  it("normalizes unknown plans to free", () => {
    expect(normalizePlan("enterprise")).toBe("free");
    expect(normalizePlan("pro")).toBe("pro");
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
});
