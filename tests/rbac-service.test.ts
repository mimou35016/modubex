import { describe, expect, it } from "vitest";
import { wouldRemoveLastActiveOwner } from "@/core/rbac/service";

describe("last active Owner invariant", () => {
  it("blocks removing the only active Owner", () => {
    expect(
      wouldRemoveLastActiveOwner({
        isOwnerRole: true,
        hasOwnerAssignment: true,
        targetIsActive: true,
        activeOwnerCount: 1,
      }),
    ).toBe(true);
  });

  it("allows removing an Owner when another active Owner remains", () => {
    expect(
      wouldRemoveLastActiveOwner({
        isOwnerRole: true,
        hasOwnerAssignment: true,
        targetIsActive: true,
        activeOwnerCount: 2,
      }),
    ).toBe(false);
  });

  it("ignores non-Owner roles, unassigned users, and already inactive users", () => {
    const base = {
      isOwnerRole: false,
      hasOwnerAssignment: true,
      targetIsActive: true,
      activeOwnerCount: 1,
    };
    expect(wouldRemoveLastActiveOwner(base)).toBe(false);
    expect(
      wouldRemoveLastActiveOwner({ ...base, isOwnerRole: true, hasOwnerAssignment: false }),
    ).toBe(false);
    expect(wouldRemoveLastActiveOwner({ ...base, isOwnerRole: true, targetIsActive: false })).toBe(
      false,
    );
  });
});
