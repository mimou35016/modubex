import type { ModuleCleanupHook } from "@/core/modules";

const WORKSPACE_ID = "";

/** Removes only this module's rows; safe to run more than once. */
const cleanup: ModuleCleanupHook = async ({ client }) => {
  const { count } = await client.faqQuestion.deleteMany({
    where: { workspaceId: WORKSPACE_ID },
  });
  return { deleted: { faqQuestion: count } };
};

export default cleanup;
