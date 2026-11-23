import { logger } from "@/core/logging/logger";
import {
  preparedMailSchema,
  type MailAdapter,
  type PreparedMail,
  type SendMailResult,
} from "./types";

/** Local-development/test adapter: records metadata only, never message content. */
export function createLogMailAdapter(): MailAdapter {
  return {
    async send(message: PreparedMail): Promise<SendMailResult> {
      const parsed = preparedMailSchema.parse(message);
      logger.info("Transactional mail logged locally", {
        milestone: "M5",
        driver: "log",
        subject: parsed.subject,
        textLength: parsed.text.length,
        hasHtml: Boolean(parsed.html),
      });
      return { ok: true };
    },
  };
}
