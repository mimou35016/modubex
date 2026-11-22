import { requirePagePermission } from "@/core/auth/dal";
import { InviteForm } from "../_components/invite-form";

export default async function InvitePage() {
  await requirePagePermission("users.invite");

  return <InviteForm />;
}
