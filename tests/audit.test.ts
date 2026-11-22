import { describe, expect, it } from "vitest";
import { auditActionSchema, auditActions, sanitizeAuditValue } from "@/core/audit/audit";

describe("audit action validation", () => {
  it("accepts every typed core action", () => {
    for (const action of Object.values(auditActions)) {
      expect(auditActionSchema.safeParse(action).success).toBe(true);
    }
  });

  it("accepts dotted module actions and rejects malformed or empty actions", () => {
    expect(auditActionSchema.safeParse("modules.installed").success).toBe(true);
    expect(auditActionSchema.safeParse("billing.invoice.updated").success).toBe(true);
    expect(auditActionSchema.safeParse("").success).toBe(false);
    expect(auditActionSchema.safeParse("not an action").success).toBe(false);
    expect(auditActionSchema.safeParse("123.bad").success).toBe(false);
  });
});

describe("audit value sanitization", () => {
  it("redacts credential-like keys recursively", () => {
    const input = {
      userId: "user-1",
      password: "hash",
      nested: {
        accessToken: "secret-token",
        api_key: "key",
        authorization: "Bearer abc",
        backupCodes: ["one", "two"],
        safe: "kept",
      },
      list: [{ clientSecret: "hidden", label: "visible" }],
    };

    const result = sanitizeAuditValue(input) as {
      userId: string;
      password: string;
      nested: Record<string, unknown>;
      list: Array<Record<string, unknown>>;
    };

    expect(result.userId).toBe("user-1");
    expect(result.password).toBe("[REDACTED]");
    expect(result.nested.accessToken).toBe("[REDACTED]");
    expect(result.nested.api_key).toBe("[REDACTED]");
    expect(result.nested.authorization).toBe("[REDACTED]");
    expect(result.nested.backupCodes).toBe("[REDACTED]");
    expect(result.nested.safe).toBe("kept");
    expect(result.list[0]?.clientSecret).toBe("[REDACTED]");
    expect(result.list[0]?.label).toBe("visible");
  });

  it("preserves primitives, dates, and circular references safely", () => {
    const node: Record<string, unknown> = { label: "root" };
    node.self = node;
    const result = sanitizeAuditValue({
      count: 3,
      active: true,
      at: new Date("2026-01-01T00:00:00.000Z"),
      node,
    }) as { count: number; active: boolean; at: string; node: { self: string } };

    expect(result.count).toBe(3);
    expect(result.active).toBe(true);
    expect(result.at).toBe("2026-01-01T00:00:00.000Z");
    expect(result.node.self).toBe("[Circular]");
  });
});
