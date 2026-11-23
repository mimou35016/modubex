import { getPasswordRules } from "@/core/settings/service";
import { SignUpForm } from "../_components/sign-up-form";

export default async function SignUpPage() {
  const rules = await getPasswordRules();
  return <SignUpForm rules={rules} />;
}
