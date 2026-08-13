type RequestLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function getIntegerEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function checkRequestLimit(input: RequestLimitInput) {
  const now = input.now ?? Date.now();
  const limit = Math.max(0, input.limit);
  const windowMs = Math.max(1, input.windowMs);
  const current = buckets.get(input.key);
  const bucket =
    current && current.resetAt > now
      ? current
      : {
          count: 0,
          resetAt: now + windowMs
        };

  if (bucket.count >= limit) {
    buckets.set(input.key, bucket);
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: bucket.resetAt
    };
  }

  bucket.count += 1;
  buckets.set(input.key, bucket);

  return {
    allowed: true,
    limit,
    remaining: Math.max(limit - bucket.count, 0),
    resetAt: bucket.resetAt
  };
}

export function resetRequestLimits() {
  buckets.clear();
}
