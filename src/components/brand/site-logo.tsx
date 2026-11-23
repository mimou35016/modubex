/* eslint-disable @next/next/no-img-element -- branding bytes are served by the public /api/files/[id] route. */
import { getTranslations } from "next-intl/server";
import { getBrandLogo } from "@/core/branding/logo";

type Props = {
  size?: "sm" | "md";
  className?: string;
};

const sizeClass = {
  sm: "size-8",
  md: "size-10",
} as const;

/** Shared server component: one logo lookup for the shell and every auth page. */
export async function SiteLogo({ size = "sm", className = "" }: Props) {
  const [logo, t] = await Promise.all([getBrandLogo(), getTranslations("files")]);
  const base = `${sizeClass[size]} shrink-0`;

  if (logo) {
    const pixels = size === "sm" ? 32 : 40;
    return (
      <img
        src={logo.url}
        alt={t("logo")}
        width={pixels}
        height={pixels}
        className={`${base} rounded-md object-contain ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${base} flex items-center justify-center rounded-md bg-accent font-mono text-xs font-bold text-accent-foreground ${className}`}
    >
      MB
    </span>
  );
}
