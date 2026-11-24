import { TwoFactorChallengeForm } from "../_components/two-factor-challenge-form";

type SearchParams = Promise<{ required?: string | string[] }>;

export default async function TwoFactorPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const required = query.required === "1" || query.required === "true";

  return <TwoFactorChallengeForm required={required} />;
}
