import { describe, expect, it } from "vitest";
import { invitationRoleLookup, inviteSchema } from "@/core/auth/schemas";

describe("invitation role persistence", () => {
  it("requires a database role id on new invitations", () => {
    expect(inviteSchema.parse({ email: "teammate@example.com", roleId: "role_123" })).toEqual({
      email: "teammate@example.com",
      roleId: "role_123",
    });
    expect(inviteSchema.safeParse({ email: "teammate@example.com", role: "member" }).success).toBe(
      false,
    );
  });

  it("prefers the persisted role id over the legacy key", () => {
    expect(invitationRoleLookup({ roleId: "role_123", role: "admin" })).toEqual({
      by: "id",
      value: "role_123",
    });
  });

  it("falls back to the legacy key for older invitations", () => {
    expect(invitationRoleLookup({ roleId: null, role: " member " })).toEqual({
      by: "key",
      value: "member",
    });
  });

  it("returns null when neither identifier is present", () => {
    expect(invitationRoleLookup({ roleId: "", role: null })).toBeNull();
  });
});
