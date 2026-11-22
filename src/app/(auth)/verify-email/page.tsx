import { VerifyEmailForm } from "../_components/verify-email-form";

type SearchParams = Promise<{ token?: string | string[] }>;

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : undefined;

  return <VerifyEmailForm token={token} />;
}
