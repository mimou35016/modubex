import { AcceptInvitationForm } from "../_components/accept-invitation-form";

type SearchParams = Promise<{ token?: string | string[] }>;

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : undefined;

  return <AcceptInvitationForm token={token} />;
}
