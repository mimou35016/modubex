import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { betterAuth } from "better-auth/minimal";
import { admin, twoFactor } from "better-auth/plugins";
import { z } from "zod";
import { audit } from "@/core/audit";
import { configurePasswordRulesResolver, validatePasswordWithSettings } from "@/core/auth/schemas";
import { env } from "@/core/config/env";
import { defaultLocale, isLocale, type Locale } from "@/core/i18n/locales";
import { logger } from "@/core/logging/logger";
import { sendMail } from "@/core/mail";
import { getDefaultLocale, getPasswordRules, getSettingValue } from "@/core/settings/service";
import { prisma } from "@/lib/prisma";

// Server-only wiring: validation uses live DB settings while client schemas
// keep the static env bootstrap rules.
configurePasswordRulesResolver(getPasswordRules);

const deliverySchema = z.object({
  user: z.object({ id: z.string().min(1), email: z.email() }),
  url: z.string().min(1),
  token: z.string().min(1),
});

const signInBodySchema = z.object({
  email: z.string().optional(),
  providerId: z.string().optional(),
});

const callbackParamsSchema = z.object({
  id: z.string().optional(),
});

const authResultSchema = z.object({
  user: z.object({ id: z.string(), email: z.string().optional() }).optional(),
});

const passwordBodySchema = z.object({
  password: z.string().optional(),
  newPassword: z.string().optional(),
});

const PASSWORD_PATHS = new Set([
  "/sign-up/email",
  "/reset-password",
  "/change-password",
  "/set-password",
]);

function localeFromRequest(request?: Request): Locale | undefined {
  const cookieHeader = request?.headers.get("cookie") ?? "";
  const cookieMatch = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(cookieHeader);
  if (cookieMatch) {
    const requested = decodeURIComponent(cookieMatch[1] ?? "");
    if (isLocale(requested)) return requested;
  }

  const acceptLanguage = request?.headers.get("accept-language");
  const preferred = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim();
  if (preferred && isLocale(preferred)) return preferred;
  return undefined;
}

async function mailLocale(request?: Request): Promise<Locale> {
  const fromRequest = localeFromRequest(request);
  if (fromRequest) return fromRequest;

  try {
    const configured = await getDefaultLocale();
    if (isLocale(configured)) return configured;
  } catch {
    // Settings may be unavailable during bootstrap; keep the static default.
  }
  return defaultLocale;
}

async function mailAppName(): Promise<string> {
  try {
    return await getSettingValue("site.name");
  } catch {
    return "Modubex";
  }
}

async function deliverAuthMail(
  template: "verification" | "passwordReset",
  data: unknown,
  request?: Request,
): Promise<void> {
  const parsed = deliverySchema.safeParse(data);
  if (!parsed.success) {
    logger.warn("Mail delivery input rejected", {
      milestone: "M5",
      template,
      error: "invalid delivery payload",
    });
    return;
  }

  const [locale, appName] = await Promise.all([mailLocale(request), mailAppName()]);
  const result = await sendMail({
    to: parsed.data.user.email,
    template,
    locale,
    params: {
      url: parsed.data.url,
      appName,
      email: parsed.data.user.email,
    },
  });

  logger.info(
    template === "verification" ? "Email verification requested" : "Password reset requested",
    {
      milestone: "M5",
      userId: parsed.data.user.id,
      email: parsed.data.user.email,
      template,
      url: "[redacted]",
      token: "[redacted]",
    },
  );

  if (!result.ok) {
    logger.error("Mail delivery failed", {
      milestone: "M5",
      template,
      userId: parsed.data.user.id,
      error: result.error,
    });
  }
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
    // The live policy is enforced in hooks.before; keep Better Auth's range wide.
    minPasswordLength: 1,
    maxPasswordLength: 256,
    sendResetPassword: async (data, request) => {
      await deliverAuthMail("passwordReset", data, request);
    },
  },

  emailVerification: {
    sendVerificationEmail: async (data, request) => {
      await deliverAuthMail("verification", data, request);
    },
  },

  socialProviders: {
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },

  plugins: [twoFactor({ issuer: "Modubex" }), admin(), nextCookies()],

  advanced: {
    database: {
      joins: true,
    },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "database",
    modelName: "rateLimit",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/two-factor/*": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 5 },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!PASSWORD_PATHS.has(ctx.path)) return;

      const body = passwordBodySchema.safeParse(ctx.body);
      const password = body.success ? (body.data.password ?? body.data.newPassword) : undefined;
      if (password === undefined) return;

      const result = await validatePasswordWithSettings(password);
      if (!result.success) {
        throw new APIError("BAD_REQUEST", {
          message: result.error.issues[0]?.message ?? "Invalid password.",
        });
      }
    }),

    after: createAuthMiddleware(async (ctx) => {
      const path = ctx.path;
      const isSignIn =
        path === "/sign-in/email" ||
        path === "/sign-in/social" ||
        path.startsWith("/callback/") ||
        path.startsWith("/two-factor/verify-");
      if (!isSignIn) return;

      try {
        const headers = new Headers(ctx.headers ?? ctx.request?.headers ?? undefined);
        const ip =
          headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          headers.get("x-real-ip") ||
          undefined;
        const userAgent = headers.get("user-agent") ?? undefined;

        const body = signInBodySchema.safeParse(ctx.body);
        const params = callbackParamsSchema.safeParse(ctx.params);
        const returned = ctx.context.returned;
        const result = authResultSchema.safeParse(returned);
        const sessionUser = ctx.context.newSession?.user;
        const user =
          result.success && result.data.user
            ? result.data.user
            : sessionUser
              ? { id: sessionUser.id, email: sessionUser.email }
              : undefined;

        const failed = isAPIError(returned);
        const provider = body.success
          ? body.data.providerId
          : params.success
            ? params.data.id
            : undefined;

        await audit.log({
          action: failed ? "auth.sign_in.failed" : "auth.sign_in.success",
          userId: user?.id,
          email: user?.email ?? (body.success ? body.data.email : undefined),
          ip,
          userAgent,
          metadata: {
            path,
            ...(provider ? { provider } : {}),
            ...(failed && isAPIError(returned)
              ? { status: returned.statusCode, reason: returned.message }
              : {}),
          },
        });
      } catch (error: unknown) {
        logger.error("Sign-in audit hook failed", {
          path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  },
});
