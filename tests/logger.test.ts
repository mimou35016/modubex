import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/core/logging/logger";

describe("structured logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits one JSON object with level, message and context", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("Foundation seed complete", { milestone: "M0", records: 0 });

    expect(info).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(info.mock.calls[0][0])) as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: "info",
      message: "Foundation seed complete",
      milestone: "M0",
    });
    expect(typeof entry.timestamp).toBe("string");
  });
});
