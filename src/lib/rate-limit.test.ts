import { describe, expect, it } from "vitest";
import { checkRequestLimit, getIntegerEnv, resetRequestLimits } from "./rate-limit";

describe("request limiter", () => {
  it("allows requests until the configured window limit is reached", () => {
    resetRequestLimits();

    expect(checkRequestLimit({ key: "user-1:chat", limit: 2, windowMs: 1000, now: 100 }).allowed).toBe(true);
    expect(checkRequestLimit({ key: "user-1:chat", limit: 2, windowMs: 1000, now: 200 })).toEqual(
      expect.objectContaining({
        allowed: true,
        remaining: 0
      })
    );
    expect(checkRequestLimit({ key: "user-1:chat", limit: 2, windowMs: 1000, now: 300 })).toEqual(
      expect.objectContaining({
        allowed: false,
        limit: 2,
        remaining: 0
      })
    );
  });

  it("resets the bucket after the window expires", () => {
    resetRequestLimits();

    expect(checkRequestLimit({ key: "user-1:upload", limit: 1, windowMs: 1000, now: 100 }).allowed).toBe(true);
    expect(checkRequestLimit({ key: "user-1:upload", limit: 1, windowMs: 1000, now: 1200 }).allowed).toBe(true);
  });

  it("reads integer env values with a fallback", () => {
    process.env.CVHELP_TEST_LIMIT = "17";

    expect(getIntegerEnv("CVHELP_TEST_LIMIT", 5)).toBe(17);
    expect(getIntegerEnv("CVHELP_MISSING_LIMIT", 5)).toBe(5);

    process.env.CVHELP_TEST_LIMIT = "not-a-number";
    expect(getIntegerEnv("CVHELP_TEST_LIMIT", 5)).toBe(5);
    delete process.env.CVHELP_TEST_LIMIT;
  });
});
