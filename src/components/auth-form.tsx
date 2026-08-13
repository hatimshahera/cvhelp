"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, LockKeyhole, Mail } from "lucide-react";

type EnabledProviders = {
  google: boolean;
};

export function AuthForm({
  mode,
  enabledProviders
}: {
  mode: "sign-in" | "sign-up";
  enabledProviders: EnabledProviders;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSignup = mode === "sign-up";
  const title = isSignup ? "Create your CVhelp account" : "Sign in to CVhelp";
  const subtitle = isSignup
    ? "Start with email and password, or continue with Google once OAuth is enabled."
    : "Return to your private application workspace.";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    const name = String(formData.get("name") || "");

    try {
      if (isSignup) {
        const response = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password })
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(body?.error || "Signup failed.");
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false
      });

      if (result?.error) {
        setError("Email or password is incorrect.");
        return;
      }

      router.push("/app");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="auth-intro">
        <Link className="brand auth-brand" href="/">
          CVhelp
        </Link>
        <p className="auth-kicker">{isSignup ? "New workspace" : "Private workspace"}</p>
        <h1 id="auth-title">{title}</h1>
        <p className="lead">{subtitle}</p>
      </div>

      <div className="oauth-grid">
        <button
          className="provider-button"
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/app" })}
          disabled={!enabledProviders.google}
          aria-describedby={!enabledProviders.google ? "provider-status" : undefined}
        >
          <span className="provider-mark">G</span>
          <span>Continue with Google</span>
        </button>
      </div>

      <div className="auth-divider">
        <span />
        <p>or</p>
        <span />
      </div>

      <form className="auth-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
        {isSignup ? (
          <label>
            Name
            <input
              name="name"
              autoComplete="name"
              minLength={2}
              placeholder="Jane Applicant"
              required
              disabled={isSubmitting}
            />
          </label>
        ) : null}
        <label>
          Email
          <span className="input-frame">
            <Mail size={17} />
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              disabled={isSubmitting}
            />
          </span>
        </label>
        <label>
          Password
          <span className="input-frame">
            <LockKeyhole size={17} />
            <input
              name="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={isSignup ? 10 : undefined}
              placeholder={isSignup ? "At least 10 characters" : "Your password"}
              required
              disabled={isSubmitting}
            />
          </span>
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button className="submit-button" type="submit" disabled={isSubmitting}>
          <span>
            {isSubmitting
              ? isSignup
                ? "Creating account..."
                : "Signing in..."
              : isSignup
                ? "Create account"
                : "Sign in"}
          </span>
          {isSubmitting ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
        </button>
      </form>

      <p className="auth-switch">
        {isSignup ? "Already have an account?" : "Need an account?"}{" "}
        <Link href={isSignup ? "/sign-in" : "/sign-up"}>
          {isSignup ? "Sign in" : "Sign up"}
        </Link>
      </p>

      {!enabledProviders.google ? (
        <div className="provider-note" id="provider-status">
          <CheckCircle2 size={16} />
          <p>Google unlocks when its OAuth environment variables are added.</p>
        </div>
      ) : null}
    </section>
  );
}
