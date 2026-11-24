// Import the schema directly: the barrel also loads the generated registry,
// which in turn imports this manifest.
import { moduleManifestSchema, type ModuleManifest } from "@/core/modules/manifest";
import { faqSettingsSchema } from "./settings";

const manifest: ModuleManifest = {
  id: "faq",
  name: "FAQ",
  description: "Manage frequently asked questions.",
  version: "1.0.0",
  author: "Internal",
  icon: "CircleHelp",
  requiredPlan: "pro",
  dependencies: [],
  permissions: [
    { key: "faq.read", description: "View FAQ entries." },
    { key: "faq.manage", description: "Create and edit FAQ entries." },
  ],
  routes: [
    {
      key: "questions",
      path: "",
      labelKey: "modules.faq.routes.questions.label",
      permission: "faq.read",
      sidebar: { labelKey: "modules.faq.sidebar.questions", icon: "CircleHelp", order: 10 },
    },
    {
      key: "manage",
      path: "manage",
      labelKey: "modules.faq.routes.manage.label",
      permission: "faq.manage",
      sidebar: { labelKey: "modules.faq.sidebar.manage", icon: "Pencil", order: 20 },
    },
  ],
  settingsSchema: faqSettingsSchema,
  ownedModels: ["FaqQuestion"],
  migrations: ["prisma/migrations/20261123040000_faq_add_questions"],
};

export default moduleManifestSchema.parse(manifest);
