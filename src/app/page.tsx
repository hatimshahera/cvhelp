import Link from "next/link";
import { getServerSession } from "next-auth";
import { ArrowRight } from "lucide-react";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="brand">CVhelp</p>
        <h1>Tailor applications from one private workspace.</h1>
        <p className="lead">
          Sign in, open the chat, and start building the CV workflow one step at
          a time.
        </p>
        <div className="auth-actions">
          <Link className="primary-link" href={session ? "/app" : "/sign-in"}>
            {session ? "Open workspace" : "Login"}
            <ArrowRight size={18} />
          </Link>
          {!session ? (
            <Link className="secondary-link" href="/sign-up">
              Signup
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
