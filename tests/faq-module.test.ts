import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  PermissionDeniedError,
  requirePermission,
  headersGet,
  revalidatePath,
  loggerWarn,
  auditLog,
  findMany,
  findFirst,
  create,
  updateMany,
  deleteMany,
  transaction,
  tx,
  getModuleViews,
  getModuleDefinition,
  getModuleManifests,
  getTranslations,
  withModuleMessages,
} = vi.hoisted(() => {
  class PermissionDeniedError extends Error {
    readonly permission: string;

    constructor(permission: string) {
      super(`Missing required permission: ${permission}`);
      this.name = "PermissionDeniedError";
      this.permission = permission;
    }
  }

  const findFirst = vi.fn();
  const create = vi.fn();
  const updateMany = vi.fn();
  const deleteMany = vi.fn();
  const tx = { faqQuestion: { create, findFirst, updateMany, deleteMany } };

  return {
    PermissionDeniedError,
    requirePermission: vi.fn(),
    headersGet: vi.fn(),
    revalidatePath: vi.fn(),
    loggerWarn: vi.fn(),
    auditLog: vi.fn(),
    findMany: vi.fn(),
    findFirst,
    create,
    updateMany,
    deleteMany,
    transaction: vi.fn(),
    tx,
    getModuleViews: vi.fn(),
    getModuleDefinition: vi.fn(),
    getModuleManifests: vi.fn(),
    getTranslations: vi.fn(),
    withModuleMessages: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    faqQuestion: {
      findMany,
      findFirst,
      create,
      updateMany,
      deleteMany,
    },
    $transaction: transaction,
  },
}));
vi.mock("@/core/audit", () => ({ audit: { log: auditLog } }));
vi.mock("@/core/auth/dal", () => ({ PermissionDeniedError, requirePermission }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGet }) }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/core/logging/logger", () => ({
  logger: { warn: loggerWarn, error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/core/modules/state", () => ({ getModuleViews }));
vi.mock("@/core/modules/registry", () => ({ getModuleDefinition, getModuleManifests }));
vi.mock("next-intl/server", () => ({ getTranslations }));
vi.mock("@/app/(app)/_components/modules/module-settings-fields", () => ({ withModuleMessages }));

import type { ModuleCleanupContext } from "@/core/modules";
import type { Locale } from "@/core/i18n/locales";
import { mergeModuleMessages } from "@/core/modules/messages";
import cleanup from "@/modules/faq/cleanup";
import manifest from "@/modules/faq/manifest";
import arMessages from "@/modules/faq/messages/ar.json";
import enMessages from "@/modules/faq/messages/en.json";
import frMessages from "@/modules/faq/messages/fr.json";
import QuestionsRoute from "@/modules/faq/routes/questions";
import { faqSettingsSchema } from "@/modules/faq/settings";
import {
  createQuestionAction,
  deleteQuestionAction,
  publishQuestionAction,
  updateQuestionAction,
} from "@/modules/faq/actions";

const session = { user: { id: "user_1", email: "owner@example.com" } };
const revalidatedPaths = ["/modules/run/faq", "/modules/run/faq/manage", "/modules"];

function questionRow(
  overrides: Partial<{
    id: string;
    question: string;
    answer: string;
    published: boolean;
    position: number;
  }> = {},
) {
  return {
    id: overrides.id ?? "q1",
    workspaceId: "",
    question: overrides.question ?? "Old question?",
    answer: overrides.answer ?? "Old answer.",
    published: overrides.published ?? false,
    position: overrides.position ?? 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
}

function moduleView(config: Record<string, unknown>) {
  return [
    {
      manifest,
      state: "enabled",
      version: "1.0.0",
      config,
      installedById: null,
      installedAt: null,
      enabledAt: null,
      disabledAt: null,
      uninstalledAt: null,
      dataRetained: false,
    },
  ];
}

function translator() {
  const translate = (key: string) => key;
  return Object.assign(translate, { has: () => true });
}

function resolveMessage(tree: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((value, segment) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[segment];
  }, tree);
}

function form(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.resetAllMocks();

  transaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) =>
    callback(tx),
  );
  requirePermission.mockResolvedValue({ session, permissionKeys: ["faq.manage"] });
  headersGet.mockImplementation((name: string) => {
    if (name === "x-forwarded-for") return "203.0.113.7, 10.0.0.1";
    if (name === "user-agent") return "test-agent";
    return null;
  });
  getModuleViews.mockResolvedValue(
    moduleView({ perPage: 2, emptyMessage: "Nothing published yet." }),
  );
  getTranslations.mockResolvedValue(translator());
  withModuleMessages.mockImplementation(async (base: unknown) => base);
  findMany.mockResolvedValue([]);
  findFirst.mockResolvedValue(questionRow());
  create.mockImplementation(
    async (args: { data: { question: string; answer: string; position: number } }) =>
      questionRow({
        question: args.data.question,
        answer: args.data.answer,
        position: args.data.position,
      }),
  );
  updateMany.mockResolvedValue({ count: 1 });
  deleteMany.mockResolvedValue({ count: 1 });
  auditLog.mockResolvedValue(undefined);
});

describe("faq module manifest and settings", () => {
  it("parses the frozen manifest contract", () => {
    expect(manifest.id).toBe("faq");
    expect(manifest.requiredPlan).toBe("pro");
    expect(manifest.dependencies).toEqual([]);
    expect(manifest.ownedModels).toEqual(["FaqQuestion"]);
    expect(manifest.migrations).toEqual(["prisma/migrations/20261123040000_faq_add_questions"]);
    expect(manifest.permissions.map((permission) => permission.key)).toEqual([
      "faq.read",
      "faq.manage",
    ]);
    expect(
      manifest.routes.map((route) => ({
        key: route.key,
        path: route.path,
        permission: route.permission,
        labelKey: route.labelKey,
        sidebar: route.sidebar,
      })),
    ).toEqual([
      {
        key: "questions",
        path: "",
        permission: "faq.read",
        labelKey: "modules.faq.routes.questions.label",
        sidebar: { labelKey: "modules.faq.sidebar.questions", icon: "CircleHelp", order: 10 },
      },
      {
        key: "manage",
        path: "manage",
        permission: "faq.manage",
        labelKey: "modules.faq.routes.manage.label",
        sidebar: { labelKey: "modules.faq.sidebar.manage", icon: "Pencil", order: 20 },
      },
    ]);
  });

  it("applies settings defaults and rejects out-of-range values", () => {
    expect(faqSettingsSchema.parse({})).toEqual({
      perPage: 10,
      emptyMessage: "No questions yet.",
    });
    expect(faqSettingsSchema.safeParse({ perPage: 0 }).success).toBe(false);
    expect(faqSettingsSchema.safeParse({ perPage: 51 }).success).toBe(false);
    expect(faqSettingsSchema.safeParse({ perPage: 1.5 }).success).toBe(false);
    expect(faqSettingsSchema.safeParse({ emptyMessage: "   " }).success).toBe(false);
    expect(faqSettingsSchema.parse({ perPage: 5, emptyMessage: "  Rien  " })).toEqual({
      perPage: 5,
      emptyMessage: "Rien",
    });
  });
});

describe("faq module nav message keys", () => {
  it("resolves every manifest route label key after module wrapping in all locales", async () => {
    getModuleDefinition.mockReturnValue({
      manifest,
      routes: {},
      messages: {
        en: async () => enMessages as Record<string, unknown>,
        fr: async () => frMessages as Record<string, unknown>,
        ar: async () => arMessages as Record<string, unknown>,
      },
    });
    getModuleManifests.mockReturnValue([manifest]);

    const labelKeys = manifest.routes.flatMap((route) => [
      route.labelKey,
      ...(route.sidebar ? [route.sidebar.labelKey] : []),
    ]);
    const locales: Locale[] = ["en", "fr", "ar"];

    for (const locale of locales) {
      const messages = await mergeModuleMessages(locale, {});
      for (const key of labelKeys) {
        const value = resolveMessage(messages, key);
        expect(typeof value, `${locale}: ${key}`).toBe("string");
        expect((value as string).trim().length, `${locale}: ${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("faq questions route", () => {
  it("reads only published, workspace-scoped questions and honors module settings", async () => {
    findMany.mockResolvedValue([]);

    const html = renderToStaticMarkup(await QuestionsRoute({ moduleId: "faq", slug: [] }));

    expect(findMany).toHaveBeenCalledWith({
      where: { workspaceId: "", published: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      take: 2,
      select: { id: true, question: true, answer: true },
    });
    expect(html).toContain("Nothing published yet.");
    expect(html).toContain('dir="auto"');
  });

  it("renders real question rows with RTL-safe dynamic content", async () => {
    findMany.mockResolvedValue([
      { id: "q1", question: "Comment installer ?", answer: "Ouvrez le store." },
    ]);

    const html = renderToStaticMarkup(await QuestionsRoute({ moduleId: "faq", slug: [] }));

    expect(html).toContain("Comment installer ?");
    expect(html).toContain("Ouvrez le store.");
    expect(html).toContain('dir="auto"');
  });
});

describe("faq server actions", () => {
  it("denies every mutation before touching the database when faq.manage is missing", async () => {
    requirePermission.mockRejectedValue(new PermissionDeniedError("faq.manage"));
    const createForm = form({ question: "Q?", answer: "A.", position: "0" });
    const updateForm = form({ id: "q1", question: "Q?", answer: "A.", position: "0" });
    const publishForm = form({ id: "q1", published: "true" });

    expect(await createQuestionAction({}, createForm)).toEqual({
      error: "modules.faq.errors.denied",
    });
    expect(await updateQuestionAction({}, updateForm)).toEqual({
      error: "modules.faq.errors.denied",
    });
    expect(await publishQuestionAction({}, publishForm)).toEqual({
      error: "modules.faq.errors.denied",
    });
    expect(await deleteQuestionAction({}, publishForm)).toEqual({
      error: "modules.faq.errors.denied",
    });
    expect(requirePermission).toHaveBeenCalledTimes(4);
    expect(create).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("zod-validates create input and never audits rejected submissions", async () => {
    const state = await createQuestionAction(
      {},
      form({ question: "   ", answer: "A.", position: "1" }),
    );

    expect(state).toEqual({ error: "modules.faq.errors.questionRequired" });
    expect(create).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("creates a scoped row, writes a safe audit entry, and revalidates module paths", async () => {
    const state = await createQuestionAction(
      {},
      form({ question: "  Q?  ", answer: " A. ", position: "3" }),
    );

    expect(state).toEqual({ ok: true, message: "modules.faq.status.created" });
    expect(create).toHaveBeenCalledWith({
      data: { workspaceId: "", question: "Q?", answer: "A.", position: 3 },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "faq.question.created",
        actor: {
          userId: "user_1",
          email: "owner@example.com",
          ip: "203.0.113.7",
          userAgent: "test-agent",
        },
        module: "faq",
        workspaceId: "",
        targetType: "FaqQuestion",
        targetId: "q1",
        before: {},
        client: tx,
        strict: true,
      }),
    );
    expect(auditLog.mock.calls[0]?.[0]?.after).toMatchObject({
      id: "q1",
      workspaceId: "",
      question: "Q?",
      answer: "A.",
      position: 3,
      published: false,
    });
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual(revalidatedPaths);
  });

  it("audits before/after snapshots for updates, publication changes, and deletes", async () => {
    findFirst
      .mockResolvedValueOnce(questionRow())
      .mockResolvedValueOnce(questionRow({ question: "New?", position: 4 }));
    expect(
      await updateQuestionAction(
        {},
        form({ id: "q1", question: "New?", answer: "New answer.", position: "4" }),
      ),
    ).toEqual({ ok: true, message: "modules.faq.status.updated" });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "q1", workspaceId: "" },
      data: { question: "New?", answer: "New answer.", position: 4 },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "faq.question.updated",
        before: expect.objectContaining({ question: "Old question?" }),
        after: expect.objectContaining({ question: "New?", position: 4 }),
        module: "faq",
        client: tx,
      }),
    );

    findFirst
      .mockResolvedValueOnce(questionRow())
      .mockResolvedValueOnce(questionRow({ published: true }));
    expect(await publishQuestionAction({}, form({ id: "q1", published: "true" }))).toEqual({
      ok: true,
      message: "modules.faq.status.published",
    });
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: "q1", workspaceId: "" },
      data: { published: true },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "faq.question.published",
        before: expect.objectContaining({ published: false }),
        after: expect.objectContaining({ published: true }),
        metadata: { published: true },
      }),
    );

    expect(await deleteQuestionAction({}, form({ id: "q1" }))).toEqual({
      ok: true,
      message: "modules.faq.status.deleted",
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "q1", workspaceId: "" } });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "faq.question.deleted",
        before: expect.objectContaining({ id: "q1" }),
        after: {},
      }),
    );
    expect(revalidatePath).toHaveBeenCalledTimes(9);
  });

  it("reports a missing scoped question instead of mutating another workspace row", async () => {
    findFirst.mockResolvedValue(null);

    expect(await deleteQuestionAction({}, form({ id: "q1" }))).toEqual({
      error: "modules.faq.errors.notFound",
    });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("logs failures without returning raw error details", async () => {
    create.mockRejectedValueOnce(new Error("db password secret must never leak"));

    expect(await createQuestionAction({}, form({ question: "Q?", answer: "A." }))).toEqual({
      error: "modules.faq.errors.saveFailed",
    });
    expect(loggerWarn).toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("faq cleanup hook", () => {
  it("deletes only the module workspace rows and is idempotent", async () => {
    const clientDeleteMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 0 });
    const client = { faqQuestion: { deleteMany: clientDeleteMany } };
    const context = {
      client: client as unknown as ModuleCleanupContext["client"],
      actor: { userId: "user_1" },
      moduleId: "faq",
    };

    expect(await cleanup(context)).toEqual({ deleted: { faqQuestion: 2 } });
    expect(await cleanup(context)).toEqual({ deleted: { faqQuestion: 0 } });
    expect(clientDeleteMany).toHaveBeenNthCalledWith(1, { where: { workspaceId: "" } });
    expect(clientDeleteMany).toHaveBeenNthCalledWith(2, { where: { workspaceId: "" } });
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
