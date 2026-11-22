import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { betterAuth } from "better-auth/minimal";
import { admin, twoFactor } from "better-auth/plugins";
import { z } from "zod";
import { audit } from "@/core/audit";
import { passwordSchema } from "@/core/auth/schemas";
import { env } from "@/core/config/env";
import { logger } from "@/core/logging/logger";
import { prisma } from "@/lib/prisma";

const deliverySchema = z.object({
  user: z.object({ id: z.string(), email: z.string() }),
  url: z.string(),
  token: z.string(),
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

function redact(value: string): string {
  return env.NODE_ENV === "production" ? "[redacted]" : value;
}

function logDelivery(kind: "verification" | "password-reset", input: unknown): void {
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return;

  logger.info(
    kind === "verification" ? "Email verification requested" : "Password reset requested",
    {
      milestone: "M1",
      userId: parsed.data.user.id,
      email: parsed.data.user.email,
      url: redact(parsed.data.url),
      token: redact(parsed.data.token),
    },
  );
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
    minPasswordLength: env.AUTH_PASSWORD_MIN_LENGTH,
    maxPasswordLength: env.AUTH_PASSWORD_MAX_LENGTH,
    sendResetPassword: async (data) => {
      logDelivery("password-reset", data);
    },
  },

  emailVerification: {
    sendVerificationEmail: async (data) => {
      logDelivery("verification", data);
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

      const result = passwordSchema.safeParse(password);
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
