import { env } from "@/core/config/env";
import { logger } from "@/core/logging/logger";
import { createLogMailAdapter } from "./log";
import { redactMailSecrets } from "./redact";
import { createSmtpMailAdapter } from "./smtp";
import { renderMail } from "./templates";
import {
  sendMailInputSchema,
  type MailAdapter,
  type SendMailInput,
  type SendMailResult,
} from "./types";

export type {
  MailAdapter,
  MailTemplate,
  PreparedMail,
  SendMailInput,
  SendMailResult,
} from "./types";
export { renderMail } from "./templates";

let adapter: MailAdapter | null = null;

/** Resolved driver; additive export used by diagnostics and tests. */
export function getMailDriver(): "smtp" | "log" {
  return env.MAIL_DRIVER === "smtp" ? "smtp" : "log";
}

export function getMailAdapter(): MailAdapter {
  if (!adapter) {
    adapter = getMailDriver() === "smtp" ? createSmtpMailAdapter() : createLogMailAdapter();
  }
  return adapter;
}

/** Clears the cached adapter; an optional fake makes test wiring explicit. */
export function resetMailAdapterForTests(fake?: MailAdapter): void {
  adapter = fake ?? null;
}

/** Never throws: callers can treat delivery as best-effort. */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  try {
    const parsed = sendMailInputSchema.parse(input);
    const result = await getMailAdapter().send(renderMail(parsed));
    if (result.ok) return { ok: true };

    const error = redactMailSecrets(result.error);
    logger.error("Mail delivery failed", {
      milestone: "M5",
      template: parsed.template,
      error,
    });
    return { ok: false, error };
  } catch (error: unknown) {
    const reason = redactMailSecrets(error instanceof Error ? error.message : String(error));
    logger.error("Mail delivery failed", { milestone: "M5", error: reason });
    return { ok: false, error: reason };
  }
}
