import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { withModuleMessages } from "@/app/(app)/_components/modules/module-settings-fields";
import { asModuleTranslator } from "@/app/(app)/_components/modules/module-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModuleRouteProps } from "@/core/modules";
import { prisma } from "@/lib/prisma";
import type { FaqQuestionView } from "../types";

const WORKSPACE_ID = "";

/** Management list backed by real server actions; the runner enforces faq.manage. */
export default async function ManageRoute({ moduleId }: ModuleRouteProps) {
  // Loaded after module evaluation: the client forms import server actions,
  // which in turn read the module catalog through the RBAC seam. Importing
  // them at module scope would make the generated registry initialize RBAC
  // while the registry itself is still being evaluated.
  const { CreateQuestionForm, DeleteQuestionForm, PublishQuestionForm, QuestionEditor } =
    await import("../components/question-forms");
  const typedT = await getTranslations();
  const t = await withModuleMessages(asModuleTranslator(typedT), [moduleId]);

  const rows = await prisma.faqQuestion.findMany({
    where: { workspaceId: WORKSPACE_ID },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, question: true, answer: true, published: true, position: true },
  });
  const questions: FaqQuestionView[] = rows.map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    published: row.published,
    position: row.position,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="border-b pb-6">
        <Link href="/modules/run/faq" className="text-xs font-medium text-accent hover:underline">
          {t("modules.faq.routes.questions.label")}
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          {t("modules.faq.routes.manage.label")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {t("modules.faq.manage.subtitle")}
        </p>
      </header>

      <CreateQuestionForm />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("modules.faq.manage.listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {questions.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted" dir="auto">
              {t("modules.faq.manage.empty")}
            </p>
          ) : (
            <ul className="divide-y">
              {questions.map((question) => (
                <li key={question.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium" dir="auto">
                        {question.question}
                      </p>
                      <p className="line-clamp-2 text-sm leading-6 text-muted" dir="auto">
                        {question.answer}
                      </p>
                    </div>
                    <Badge tone={question.published ? "accent" : "muted"}>
                      {t(
                        question.published
                          ? "modules.faq.manage.published"
                          : "modules.faq.manage.draft",
                      )}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">
                    {t("modules.faq.manage.position")}: <span dir="ltr">{question.position}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <PublishQuestionForm id={question.id} published={question.published} />
                    <DeleteQuestionForm id={question.id} question={question.question} />
                  </div>
                  <QuestionEditor question={question} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
