import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ForbiddenPage() {
  const t = await getTranslations("forbidden");

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-xl">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-xl">{t("title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <p className="text-sm leading-6 text-muted">{t("body")}</p>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              {t("back")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
