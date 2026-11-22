import { enabledOAuthProviders } from "@/core/auth/oauth";
import { SignInForm } from "../_components/sign-in-form";

export default function SignInPage() {
  return <SignInForm providers={enabledOAuthProviders} />;
}
