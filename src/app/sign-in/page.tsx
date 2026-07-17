import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { authOptions, enabledAuthProviders } from "@/lib/auth";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/app");

  return (
    <main className="auth-shell">
      <AuthForm
        mode="sign-in"
        enabledProviders={{
          google: enabledAuthProviders.google,
          apple: enabledAuthProviders.apple
        }}
      />
    </main>
  );
}
