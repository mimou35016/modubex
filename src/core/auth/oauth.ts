import { env } from "@/core/config/env";

export type OAuthProviderId = "github" | "google";

export const enabledOAuthProviders: Array<{
  id: OAuthProviderId;
  label: string;
}> = [
  ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    ? ([{ id: "github", label: "GitHub" }] as const)
    : []),
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? ([{ id: "google", label: "Google" }] as const)
    : []),
];
