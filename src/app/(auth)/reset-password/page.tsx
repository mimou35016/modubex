import { ResetPasswordForm } from "../_components/reset-password-form";

type SearchParams = Promise<{ token?: string | string[] }>;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : undefined;

  return <ResetPasswordForm token={token} />;
}
