import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { authOptions, enabledAuthProviders } from "@/lib/auth";
import { LandingThemeShell } from "../LandingThemeShell";

export default async function SignUpPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/app");

  return (
    <LandingThemeShell>
      <main className="auth-shell">
        <AuthForm
          mode="sign-up"
          enabledProviders={{
            google: enabledAuthProviders.google
          }}
        />
      </main>
    </LandingThemeShell>
  );
}
