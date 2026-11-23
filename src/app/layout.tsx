import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { getMessages } from "next-intl/server";
import { defaultLocale, getLocaleConfig, isLocale, type Locale } from "@/core/i18n/locales";
import { getDefaultLocale, getSettingValue } from "@/core/settings/service";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fallbackMetadata: Metadata = {
  title: "Modubex",
  description: "A lean, modular foundation for web applications and admin dashboards.",
};

async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const requested = cookieStore.get("NEXT_LOCALE")?.value;
  if (isLocale(requested)) return requested;

  try {
    const configured = await getDefaultLocale();
    if (isLocale(configured)) return configured;
  } catch {
    // Registry defaults keep the app renderable when settings are unavailable.
  }
  return defaultLocale;
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [siteName, description, titleSuffix] = await Promise.all([
      getSettingValue("site.name"),
      getSettingValue("seo.description"),
      getSettingValue("seo.titleSuffix"),
    ]);

    return {
      title: { default: siteName, template: `%s — ${titleSuffix}` },
      description: description || fallbackMetadata.description,
    };
  } catch {
    return fallbackMetadata;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await resolveLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={getLocaleConfig(locale).dir}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
