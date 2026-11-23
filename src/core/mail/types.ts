import { z } from "zod";

/** Transactional templates owned by core; modules must not extend this union. */
export const mailTemplates = ["verification", "passwordReset", "invitation"] as const;

export type MailTemplate = (typeof mailTemplates)[number];

export const sendMailInputSchema = z.object({
  to: z.email(),
  template: z.enum(mailTemplates),
  locale: z.enum(["en", "fr", "ar"]),
  params: z.object({
    url: z.string().min(1),
    appName: z.string().min(1),
    email: z.email().optional(),
  }),
});

export type SendMailInput = z.infer<typeof sendMailInputSchema>;

export type SendMailResult = { ok: true } | { ok: false; error: string };

export const preparedMailSchema = z.object({
  to: z.email(),
  subject: z.string().min(1),
  text: z.string().min(1),
  html: z.string().optional(),
});

export type PreparedMail = z.infer<typeof preparedMailSchema>;

export interface MailAdapter {
  send(message: PreparedMail): Promise<SendMailResult>;
}
