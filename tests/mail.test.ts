import { afterEach, describe, expect, it, vi } from "vitest";
import { getMailAdapter, resetMailAdapterForTests, sendMail } from "@/core/mail";
import { createLogMailAdapter } from "@/core/mail/log";
import { renderMail } from "@/core/mail/templates";
import type { MailAdapter, MailTemplate, PreparedMail, SendMailInput } from "@/core/mail/types";

const RECIPIENT = "member@example.com";
const TOKEN = "abcdef0123456789abcdef0123456789abcdef01";
const RESET_URL = `https://app.example.com/reset-password?token=${TOKEN}`;

const TEMPLATES: readonly MailTemplate[] = ["verification", "passwordReset", "invitation"];
const LOCALES = ["en", "fr", "ar"] as const;

function mailInput(template: MailTemplate, locale: (typeof LOCALES)[number] = "en"): SendMailInput {
  return {
    to: RECIPIENT,
    template,
    locale,
    params: { url: RESET_URL, appName: "Acme", email: RECIPIENT },
  };
}

function catalog(locale: string) {
  return {
    mail: {
      subject: {
        verification: `${locale}:verify:{appName}`,
        passwordReset: `${locale}:reset:{appName}`,
        invitation: `${locale}:invite:{appName}`,
      },
      body: {
        verification: `${locale}:verify body {email} {appName} {url}`,
        passwordReset: `${locale}:reset body {email} {appName} {url}`,
        invitation: `${locale}:invite body {email} {appName} {url}`,
      },
    },
  };
}

const SUBJECT_SEGMENT: Record<MailTemplate, string> = {
  verification: "verify",
  passwordReset: "reset",
  invitation: "invite",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.doUnmock("nodemailer");
  resetMailAdapterForTests();
  vi.resetModules();
});

describe("mail template rendering", () => {
  it("renders every template in every registered locale with all ICU values", () => {
    for (const locale of LOCALES) {
      for (const template of TEMPLATES) {
        const message = renderMail(mailInput(template, locale), { messages: catalog(locale) });

        expect(message.to).toBe(RECIPIENT);
        expect(message.subject).toBe(`${locale}:${SUBJECT_SEGMENT[template]}:Acme`);
        expect(message.text).toBe(
          `${locale}:${SUBJECT_SEGMENT[template]} body ${RECIPIENT} Acme ${RESET_URL}`,
        );
        expect(message.html).toContain(RESET_URL);
      }
    }
  });

  it("works with one argument using the registered locale catalogs", () => {
    for (const locale of LOCALES) {
      for (const template of TEMPLATES) {
        const message = renderMail(mailInput(template, locale));

        expect(message.subject.length).toBeGreaterThan(0);
        expect(message.subject).not.toContain("mail.");
        expect(message.text).toContain(RECIPIENT);
        expect(message.text).toContain("Acme");
        expect(message.text).toContain(RESET_URL);
      }
    }
  });

  it("uses the recipient when the optional email param is absent", () => {
    const input = mailInput("invitation");
    delete input.params.email;
    const message = renderMail(input, { messages: catalog("en") });

    expect(message.text).toContain(RECIPIENT);
  });

  it("supports an injected translator", () => {
    const translator = vi.fn((key: string) => `translated:${key}`);
    const message = renderMail(mailInput("passwordReset"), { translator });

    expect(message.subject).toBe("translated:mail.subject.passwordReset");
    expect(message.text).toBe("translated:mail.body.passwordReset");
  });
});

describe("driver selection", () => {
  it("selects the log adapter and emits metadata only", async () => {
    vi.stubEnv("MAIL_DRIVER", "log");
    vi.resetModules();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const mail = await import("@/core/mail");

    expect(mail.getMailDriver()).toBe("log");
    const result = await mail.getMailAdapter().send({
      to: RECIPIENT,
      subject: "Reset your password",
      text: `Open ${RESET_URL}`,
    });

    expect(result).toEqual({ ok: true });
    const entry = String(info.mock.calls[0]?.[0] ?? "");
    expect(entry).toContain('"driver":"log"');
    expect(entry).toContain('"textLength"');
    expect(entry).not.toContain(RESET_URL);
    expect(entry).not.toContain(TOKEN);
  });

  it("selects the SMTP adapter without sending during local tests", async () => {
    vi.stubEnv("MAIL_DRIVER", "smtp");
    vi.resetModules();
    const sendMailFromTransport = vi.fn(
      async (options: { from: string; to: string; subject: string; text: string }) => {
        void options;
      },
    );
    vi.doMock("nodemailer", () => ({
      default: { createTransport: () => ({ sendMail: sendMailFromTransport }) },
    }));
    const mail = await import("@/core/mail");

    expect(mail.getMailDriver()).toBe("smtp");
    const result = await mail.getMailAdapter().send({
      to: RECIPIENT,
      subject: "Invitation",
      text: `Open ${RESET_URL}`,
    });

    expect(result).toEqual({ ok: true });
    expect(sendMailFromTransport).toHaveBeenCalledTimes(1);
    const options = sendMailFromTransport.mock.calls[0]?.[0];
    expect(options).toMatchObject({ to: RECIPIENT, subject: "Invitation" });
    expect(options.text).toContain(RESET_URL);
  });
});

describe("sendMail delivery handling", () => {
  it("hands rendered mail to an injected fake adapter", async () => {
    const send = vi.fn(async (prepared: PreparedMail): Promise<{ ok: true }> => {
      void prepared;
      return { ok: true };
    });
    const fake: MailAdapter = { send };
    resetMailAdapterForTests(fake);

    await expect(sendMail(mailInput("invitation", "fr"))).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    const prepared = send.mock.calls[0]?.[0];
    expect(prepared?.to).toBe(RECIPIENT);
    expect(prepared?.text).toContain(RESET_URL);
  });

  it("returns a redacted failure when the adapter throws", async () => {
    const errorOutput = vi.spyOn(console, "error").mockImplementation(() => {});
    resetMailAdapterForTests({
      send: async () => {
        throw new Error(`SMTP failure for ${RESET_URL} with ${TOKEN}`);
      },
    });

    const result = await sendMail(mailInput("passwordReset"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain(RESET_URL);
      expect(result.error).not.toContain(TOKEN);
      expect(result.error).toContain("[redacted-url]");
      expect(result.error).toContain("[redacted-token]");
    }
    const logged = errorOutput.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).not.toContain(RESET_URL);
    expect(logged).not.toContain(TOKEN);
  });

  it("logs a returned adapter failure without exposing secrets", async () => {
    const errorOutput = vi.spyOn(console, "error").mockImplementation(() => {});
    resetMailAdapterForTests({
      send: async () => ({ ok: false, error: `Rejected ${RESET_URL}` }),
    });

    const result = await sendMail(mailInput("verification"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain(RESET_URL);
    const logged = errorOutput.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).not.toContain(RESET_URL);
    expect(logged).not.toContain(TOKEN);
    expect(logged).toContain('"template":"verification"');
  });

  it("never throws on invalid input", async () => {
    const send = vi.fn(async (): Promise<{ ok: true }> => ({ ok: true }));
    resetMailAdapterForTests({ send });

    const result = await sendMail({
      ...mailInput("invitation"),
      to: "not-an-email",
    });

    expect(result.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("log adapter logs only non-secret metadata", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await createLogMailAdapter().send({
      to: RECIPIENT,
      subject: "Invitation to Acme",
      text: `Accept ${RESET_URL}`,
      html: `<a href="${RESET_URL}">Accept</a>`,
    });

    expect(result).toEqual({ ok: true });
    const entry = String(info.mock.calls[0]?.[0] ?? "");
    expect(entry).toContain("Invitation to Acme");
    expect(entry).not.toContain(RESET_URL);
    expect(entry).not.toContain(TOKEN);
    expect(entry).not.toContain(RECIPIENT);
  });

  it("resolves the cached adapter once until reset", () => {
    const first = getMailAdapter();
    expect(getMailAdapter()).toBe(first);
    resetMailAdapterForTests();
    expect(getMailAdapter()).not.toBe(first);
  });
});
