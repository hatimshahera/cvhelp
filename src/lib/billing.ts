export type BillingPlan = "free" | "pro" | "internal";
export type BillingFeature = "applications" | "generations" | "exports" | "uploads";

export const planLimits: Record<BillingPlan, Record<BillingFeature, number>> = {
  free: {
    applications: 5,
    generations: 10,
    exports: 3,
    uploads: 20
  },
  pro: {
    applications: 100,
    generations: 500,
    exports: 200,
    uploads: 200
  },
  internal: {
    applications: Number.MAX_SAFE_INTEGER,
    generations: Number.MAX_SAFE_INTEGER,
    exports: Number.MAX_SAFE_INTEGER,
    uploads: Number.MAX_SAFE_INTEGER
  }
};

export function normalizePlan(plan: string | null | undefined): BillingPlan {
  if (plan === "internal") return "internal";
  return plan === "pro" ? "pro" : "free";
}

export function getBillingStatus(subscription: {
  provider?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  plan?: string | null;
  status?: string | null;
  currentPeriodEnd?: Date | string | null;
  trialEndsAt?: Date | string | null;
} | null) {
  const plan = normalizePlan(subscription?.plan);

  return {
    provider: subscription?.provider ?? "stripe",
    plan,
    status: subscription?.status ?? "free",
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    hasCustomer: Boolean(subscription?.providerCustomerId),
    hasSubscription: Boolean(subscription?.providerSubscriptionId),
    hasUnlimitedLimits: plan === "internal",
    limits: planLimits[plan]
  };
}

export function checkFeatureLimit(input: {
  plan: BillingPlan;
  feature: BillingFeature;
  used: number;
}) {
  const limit = planLimits[input.plan][input.feature];

  return {
    allowed: input.used < limit,
    limit,
    remaining: Math.max(limit - input.used, 0)
  };
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}
