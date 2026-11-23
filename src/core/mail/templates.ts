import { createTranslator, type AbstractIntlMessages } from "next-intl";
import type { Locale } from "@/core/i18n/locales";
import enMessages from "@/core/i18n/messages/en.json";
import arMessages from "@/core/i18n/messages/ar.json";
import frMessages from "@/core/i18n/messages/fr.json";
import { sendMailInputSchema, type PreparedMail, type SendMailInput } from "./types";

type MailTranslator = (key: string, values?: Record<string, string>) => string;

export type RenderMailOptions = {
  /** Override the message tree, primarily for tests and module message trees. */
  messages?: AbstractIntlMessages;
  /** Bypass message loading entirely with a purpose-built translator. */
  translator?: MailTranslator;
};

/**
 * English runtime fallback. Locale message files always win once the `mail`
 * namespace is present, but keeping these defaults inline guarantees a usable
 * message during bootstrap and in tests before catalogs are regenerated.
 */
const FALLBACK_MAIL_MESSAGES: AbstractIntlMessages = {
  subject: {
    verification: "Verify your {appName} email",
    passwordReset: "Reset your {appName} password",
    invitation: "Invitation to {appName}",
  },
  body: {
    verification:
      "Hi {email},\n\nVerify your email address for {appName} by opening this link:\n{url}\n\nIf you did not request this, you can ignore this message.",
    passwordReset:
      "Hi {email},\n\nReset your {appName} password by opening this link:\n{url}\n\nIf you did not request this, you can ignore this message.",
    invitation:
      "Hi {email},\n\nYou have been invited to join {appName}. Accept the invitation here:\n{url}\n\nIf this was not expected, you can ignore this message.",
  },
};

const CORE_MESSAGES: Record<Locale, AbstractIntlMessages> = {
  en: enMessages as AbstractIntlMessages,
  fr: frMessages as AbstractIntlMessages,
  ar: arMessages as AbstractIntlMessages,
};

function asTree(value: unknown): AbstractIntlMessages {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as AbstractIntlMessages)
    : {};
}

function messagesForLocale(locale: Locale): AbstractIntlMessages {
  const loaded = CORE_MESSAGES[locale];
  const mail = asTree(loaded.mail);
  return {
    ...loaded,
    mail: {
      subject: { ...asTree(FALLBACK_MAIL_MESSAGES.subject), ...asTree(mail.subject) },
      body: { ...asTree(FALLBACK_MAIL_MESSAGES.body), ...asTree(mail.body) },
    },
  };
}

function createMailTranslator(locale: Locale, messages: AbstractIntlMessages): MailTranslator {
  const translate = createTranslator({
    locale,
    messages,
    onError: () => {},
    getMessageFallback: ({ key }) => key,
  }) as unknown as MailTranslator;
  return (key, values) => translate(key, values);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toHtml(text: string): string {
  const body = escapeHtml(text).replace(/\r?\n/g, "<br />");
  return `<div style="font-family:system-ui,sans-serif;line-height:1.5">${body}</div>`;
}

/** Renders a validated mail input into adapter-ready plain text and HTML. */
export function renderMail(input: SendMailInput, options: RenderMailOptions = {}): PreparedMail {
  const parsed = sendMailInputSchema.parse(input);
  const values = {
    url: parsed.params.url,
    appName: parsed.params.appName,
    email: parsed.params.email ?? parsed.to,
  };

  const translator =
    options.translator ??
    createMailTranslator(parsed.locale, options.messages ?? messagesForLocale(parsed.locale));

  const subject = translator(`mail.subject.${parsed.template}`, values);
  const text = translator(`mail.body.${parsed.template}`, values);

  return { to: parsed.to, subject, text, html: toHtml(text) };
}
