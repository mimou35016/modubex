import { getTranslations } from "next-intl/server";
import { withModuleMessages } from "@/app/(app)/_components/modules/module-settings-fields";
import { asModuleTranslator } from "@/app/(app)/_components/modules/module-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModuleRouteProps } from "@/core/modules";
import { getModuleViews } from "@/core/modules/state";
import { prisma } from "@/lib/prisma";
import { faqSettingsSchema } from "../settings";

const WORKSPACE_ID = "";

/** Public FAQ list: workspace-scoped, published only, bounded by module settings. */
export default async function QuestionsRoute({ moduleId }: ModuleRouteProps) {
  const [typedT, views] = await Promise.all([getTranslations(), getModuleViews()]);
  const t = await withModuleMessages(asModuleTranslator(typedT), [moduleId]);

  const view = views.find((item) => item.manifest.id === moduleId);
  const parsedSettings = faqSettingsSchema.safeParse(view?.config ?? {});
  const settings = parsedSettings.success ? parsedSettings.data : faqSettingsSchema.parse({});

  const questions = await prisma.faqQuestion.findMany({
    where: { workspaceId: WORKSPACE_ID, published: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    take: settings.perPage,
    select: { id: true, question: true, answer: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="border-b pb-6">
        <h1 id="faq-questions-title" className="text-3xl font-semibold tracking-tight">
          {t("modules.faq.routes.questions.label")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {t("modules.faq.questions.subtitle")}
        </p>
      </header>

      {questions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted" dir="auto">
            {settings.emptyMessage || t("modules.faq.questions.emptyFallback")}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-4" aria-labelledby="faq-questions-title">
          {questions.map((question) => (
            <li key={question.id}>
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-base" dir="auto">
                    {question.question}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <p className="whitespace-pre-line text-sm leading-7 text-muted" dir="auto">
                    {question.answer}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
