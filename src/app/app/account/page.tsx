import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CreditCard, ShieldCheck, UserRound } from "lucide-react";
import { getBillingStatus } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id }
  });
  const billing = getBillingStatus(subscription);
  const formatLimit = (limit: number) => (billing.hasUnlimitedLimits ? "Unlimited" : limit);

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

        <section className="account-billing" aria-labelledby="billing-title">
          <div className="account-heading compact">
            <CreditCard size={20} />
            <div>
              <p className="eyebrow">Billing</p>
              <h2 id="billing-title">{billing.plan} plan</h2>
            </div>
          </div>
          <dl className="billing-details">
            <div>
              <dt>Status</dt>
              <dd>{billing.status}</dd>
            </div>
            <div>
              <dt>Applications</dt>
              <dd>{formatLimit(billing.limits.applications)}</dd>
            </div>
            <div>
              <dt>Generations</dt>
              <dd>{formatLimit(billing.limits.generations)}</dd>
            </div>
            <div>
              <dt>Exports</dt>
              <dd>{formatLimit(billing.limits.exports)}</dd>
            </div>
          </dl>
        </section>

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
