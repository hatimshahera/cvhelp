"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

type EnabledProviders = {
  google: boolean;
  apple: boolean;
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
    <section className="auth-panel">
      <div>
        <p className="brand">CVhelp</p>
        <h1>{isSignup ? "Create your account." : "Welcome back."}</h1>
        <p className="lead">
          {isSignup
            ? "Use your email now, or connect Google and Apple once provider keys are added."
            : "Sign in to continue to your private workspace."}
        </p>
      </div>

      <div className="oauth-grid">
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/app" })}
          disabled={!enabledProviders.google}
        >
          Continue with Google
        </button>
        <button
          type="button"
          onClick={() => signIn("apple", { callbackUrl: "/app" })}
          disabled={!enabledProviders.apple}
        >
          Continue with Apple
        </button>
      </div>

      <div className="auth-divider">
        <span />
        <p>or</p>
        <span />
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {isSignup ? (
          <label>
            Name
            <input name="name" autoComplete="name" minLength={2} required />
          </label>
        ) : null}
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? 10 : undefined}
            required
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button className="submit-button" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? isSignup
              ? "Creating account..."
              : "Signing in..."
            : isSignup
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p className="auth-switch">
        {isSignup ? "Already have an account?" : "Need an account?"}{" "}
        <Link href={isSignup ? "/sign-in" : "/sign-up"}>
          {isSignup ? "Sign in" : "Sign up"}
        </Link>
      </p>

      {!enabledProviders.google || !enabledProviders.apple ? (
        <p className="provider-note">
          Google and Apple buttons enable automatically when their environment
          variables are configured.
        </p>
      ) : null}
    </section>
  );
}
