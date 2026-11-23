import Image from "next/image";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AvatarForm } from "@/app/(app)/_components/profile/avatar-form";
import { PasswordForm } from "@/app/(app)/_components/profile/password-form";
import { ProfileNameForm } from "@/app/(app)/_components/profile/profile-name-form";
import { SessionRevokeForm } from "@/app/(app)/_components/profile/session-revoke-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/core/auth/dal";
import { getCurrentAvatar } from "@/core/files/service";
import { prisma } from "@/lib/prisma";

export default async function ProfilePage() {
  const session = await requireSession();
  const t = await getTranslations("profile");
  const tFiles = await getTranslations("files");
  const locale = await getLocale();
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const sessions = await prisma.session.findMany({
    where: { userId: session.user.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      expiresAt: true,
    },
  });
  const avatar = await getCurrentAvatar(session.user.id);
  const twoFactorEnabled = session.user.twoFactorEnabled === true;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
        <div className="flex items-center gap-4">
          {avatar ? (
            <Image
              src={`/api/files/${avatar.id}`}
              alt={tFiles("avatar")}
              width={64}
              height={64}
              unoptimized
              className="size-16 rounded-full object-cover"
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-full bg-accent-soft font-mono text-lg font-semibold text-accent">
              {(session.user.name || session.user.email || "?").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
          </div>
        </div>
        <Badge tone={twoFactorEnabled ? "accent" : "muted"}>
          {twoFactorEnabled ? t("twoFactorEnabled") : t("twoFactorDisabled")}
        </Badge>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{tFiles("avatar")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <AvatarForm avatarId={avatar?.id ?? null} name={session.user.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("accountTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <p className="text-xs text-muted" dir="ltr">
            {session.user.email}
          </p>
          <ProfileNameForm name={session.user.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("passwordTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <PasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("twoFactorTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-muted">
            {twoFactorEnabled ? t("twoFactorEnabled") : t("twoFactorDisabled")}
          </p>
          <div className="flex flex-wrap gap-4 text-sm font-medium text-accent">
            <Link href="/two-factor/enroll" className="hover:underline">
              {twoFactorEnabled ? t("twoFactorManage") : t("twoFactorEnable")}
            </Link>
            <Link href="/two-factor" className="hover:underline">
              {t("twoFactorChallenge")}
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("sessionsTitle")}</CardTitle>
          <p className="text-xs leading-5 text-muted">{t("sessionsHint")}</p>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.length > 0 ? (
            <ul className="divide-y">
              {sessions.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"
                >
                  <div className="min-w-0 space-y-1 text-xs text-muted">
                    <p>
                      {t("createdAt")}: {dateFormat.format(new Date(item.createdAt))}
                    </p>
                    <p dir="ltr">
                      {t("ipAddress")}: {item.ipAddress ?? t("noValue")}
                    </p>
                    <p className="break-words" dir="ltr">
                      {t("userAgent")}: {item.userAgent ?? t("noValue")}
                    </p>
                    <p>
                      {t("expiresAt")}: {dateFormat.format(new Date(item.expiresAt))}
                    </p>
                    {session.session?.id === item.id ? (
                      <p className="font-medium text-accent">{t("currentSession")}</p>
                    ) : null}
                  </div>
                  <SessionRevokeForm sessionId={item.id} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 py-8 text-sm text-muted">{t("noSessions")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
