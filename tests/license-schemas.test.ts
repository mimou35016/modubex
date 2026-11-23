import { describe, expect, it } from "vitest";
import { licenseUpdateSchema } from "@/core/entitlements/schema";

describe("license update schema", () => {
  it("accepts each known plan and normalizes empty optional fields to null", () => {
    const result = licenseUpdateSchema.parse({
      plan: "enterprise",
      licenseKey: "   ",
      validUntil: "",
    });
    expect(result.plan).toBe("enterprise");
    expect(result.licenseKey).toBeNull();
    expect(result.validUntil).toBeNull();
  });

  it("trims a license key and parses an ISO date", () => {
    const result = licenseUpdateSchema.parse({
      plan: "pro",
      licenseKey: "  key-123  ",
      validUntil: "2030-01-02T03:04:05.000Z",
    });
    expect(result.licenseKey).toBe("key-123");
    expect(result.validUntil).toEqual(new Date("2030-01-02T03:04:05.000Z"));
  });

  it("rejects unknown plans and invalid dates", () => {
    expect(
      licenseUpdateSchema.safeParse({ plan: "platinum", licenseKey: "", validUntil: "" }).success,
    ).toBe(false);
    const invalidDate = licenseUpdateSchema.safeParse({
      plan: "free",
      licenseKey: "",
      validUntil: "not-a-date",
    });
    expect(invalidDate.success).toBe(false);
    if (!invalidDate.success) {
      expect(invalidDate.error.issues[0]?.message).toMatch(/ISO date/i);
    }
  });

  it("rejects an overlong license key", () => {
    expect(
      licenseUpdateSchema.safeParse({
        plan: "free",
        licenseKey: "x".repeat(121),
        validUntil: "",
      }).success,
    ).toBe(false);
  });
});
