import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck, UserRound } from "lucide-react";
import { getCurrentUser } from "@/lib/session";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <main className="account-page">
      <section className="account-panel">
        <Link className="account-back" href="/app">
          <ArrowLeft size={17} />
          Back to workspace
        </Link>

        <div className="account-heading">
          <UserRound size={22} />
          <div>
            <p className="eyebrow">Account</p>
            <h1>Settings</h1>
          </div>
        </div>

        <dl className="account-details">
          <div>
            <dt>Name</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email || "No email on session"}</dd>
          </div>
        </dl>

        <div className="account-note">
          <ShieldCheck size={18} />
          <p>
            Your profile bank, application memory, chats, and generated artifacts are scoped to
            this signed-in account.
          </p>
        </div>
      </section>
    </main>
  );
}
