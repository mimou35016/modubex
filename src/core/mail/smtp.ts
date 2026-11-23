import nodemailer, { type Transporter } from "nodemailer";
import { z } from "zod";
import { env } from "@/core/config/env";
import { logger } from "@/core/logging/logger";
import { redactMailSecrets } from "./redact";
import {
  preparedMailSchema,
  type MailAdapter,
  type PreparedMail,
  type SendMailResult,
} from "./types";

const smtpConfigSchema = z.object({
  from: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().optional(),
  password: z.string().optional(),
});

/** SMTP adapter; credentials and endpoints come only from validated env values. */
export function createSmtpMailAdapter(): MailAdapter {
  const config = smtpConfigSchema.parse({
    from: env.SMTP_FROM,
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
  });

  let transporter: Transporter | null = null;
  function getTransporter(): Transporter {
    if (!transporter) {
      transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        ...(config.user && config.password
          ? { auth: { user: config.user, pass: config.password } }
          : {}),
      });
    }
    return transporter;
  }

  return {
    async send(message: PreparedMail): Promise<SendMailResult> {
      try {
        const parsed = preparedMailSchema.parse(message);
        await getTransporter().sendMail({
          from: config.from,
          to: parsed.to,
          subject: parsed.subject,
          text: parsed.text,
          ...(parsed.html ? { html: parsed.html } : {}),
        });
        return { ok: true };
      } catch (error: unknown) {
        const reason = redactMailSecrets(error instanceof Error ? error.message : String(error));
        logger.error("SMTP delivery failed", { milestone: "M5", error: reason });
        return { ok: false, error: reason };
      }
    },
  };
}
