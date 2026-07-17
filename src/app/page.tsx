import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { ArrowRight } from "lucide-react";

export default async function Home() {
  const user = await currentUser();

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
          <Link className="primary-link" href={user ? "/app" : "/sign-in"}>
            {user ? "Open workspace" : "Login"}
            <ArrowRight size={18} />
          </Link>
          {!user ? (
            <Link className="secondary-link" href="/sign-up">
              Signup
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
