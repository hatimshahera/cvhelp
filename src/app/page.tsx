import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  LockKeyhole,
  MessageSquareText,
  Sparkles,
  Target
} from "lucide-react";
import { authOptions } from "@/lib/auth";
import { LandingThemeShell } from "./LandingThemeShell";

const workspaceNav = ["Build profile", "Applications", "Settings"];

const applicationRows = [
  ["AI generalist", "Evidence matched", "Ready"],
  ["Product engineer", "Drafting answers", "Active"],
  ["Research role", "Profile gaps found", "Review"]
];

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <LandingThemeShell>
      <main className="landing-page">
        <section className="landing-hero aside-hero" id="workspace">
          <div className="hero-copy aside-hero-copy">
            <div className="hero-topline">
              <Link className="brand landing-brand" href="/">
                CVhelp
              </Link>
              <div className="hero-account-actions" aria-label="Account">
                {session ? (
                  <Link className="nav-primary" href="/app">
                    Open workspace
                    <ArrowRight size={17} />
                  </Link>
                ) : (
                  <>
                    <Link className="nav-link" href="/sign-in">
                      Login
                    </Link>
                    <Link className="nav-primary" href="/sign-up">
                      Signup
                      <ArrowRight size={17} />
                    </Link>
                  </>
                )}
              </div>
            </div>
            <p className="hero-kicker">
              <Sparkles size={16} />
              Private workspace for real applications
            </p>
            <h1>Build applications with the evidence already in place.</h1>
            <p className="hero-lead">
              Save your real experience once, match it to each role, and draft with
              grounded evidence.
            </p>
            <div className="hero-actions">
              <Link className="primary-link" href={session ? "/app" : "/sign-up"}>
                {session ? "Open workspace" : "Start free"}
                <ArrowRight size={18} />
              </Link>
              <Link className="secondary-link" href={session ? "/app" : "/sign-in"}>
                {session ? "Continue" : "Login"}
              </Link>
            </div>
          </div>
        </section>

        <section className="landing-section product-section" id="product" aria-labelledby="product-preview">
          <div className="section-frame product-frame">
            <div className="section-heading product-heading">
              <p className="eyebrow">Product</p>
              <h2 id="product-preview">The workspace view.</h2>
              <p>
                Profile bank, role evidence, drafting chat, and settings stay in clear
                lanes instead of fighting for the same screen.
              </p>
            </div>
            <div className="hero-preview aside-browser" aria-label="CVhelp workspace preview">
              <div className="aside-browser-top">
                <div className="browser-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <span>cvhelp.app/workspace</span>
                <strong>Evidence desk</strong>
              </div>

              <div className="workspace-mock">
                <aside className="mock-sidebar" aria-label="Workspace navigation preview">
                  <div className="mock-user">
                    <span>YOU</span>
                    <strong>Your profile</strong>
                  </div>
                  {workspaceNav.map((item, index) => (
                    <div className={index === 0 ? "active" : ""} key={item}>
                      {index === 0 && <Database size={15} />}
                      {index === 1 && <Target size={15} />}
                      {index === 2 && <LockKeyhole size={15} />}
                      <span>{item}</span>
                    </div>
                  ))}
                </aside>

                <section className="mock-chat" aria-label="Build profile preview">
                  <div className="mock-section-header">
                    <span>Build profile</span>
                    <strong>Profile bank</strong>
                  </div>
                  <div className="mock-profile-strip">
                    <div>
                      <strong>100%</strong>
                      <span>complete</span>
                    </div>
                    <div>
                      <strong>7</strong>
                      <span>sources</span>
                    </div>
                    <div>
                      <strong>8/8</strong>
                      <span>intake</span>
                    </div>
                  </div>
                  <div className="mock-message user-message">
                    Add this job post and tell me what evidence I should use.
                  </div>
                  <div className="mock-message assistant-message">
                    <p>Matched your profile to the role and found three strong signals.</p>
                    <div className="mock-tags">
                      <span>LLM evals</span>
                      <span>Research</span>
                      <span>Product judgement</span>
                    </div>
                  </div>
                </section>

                <aside className="mock-applications" aria-label="Applications preview">
                  <div className="mock-section-header">
                    <span>Applications</span>
                    <strong>3 active</strong>
                  </div>
                  {applicationRows.map(([role, signal, status]) => (
                    <div className="mock-row" key={role}>
                      <div>
                        <strong>{role}</strong>
                        <span>{signal}</span>
                      </div>
                      <em>{status}</em>
                    </div>
                  ))}
                  <div className="mock-guardrail">
                    <CheckCircle2 size={16} />
                    Claims stay tied to saved profile evidence.
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section aside-capabilities" id="workflow" aria-labelledby="helps-with">
          <div className="section-frame">
            <div className="section-heading">
              <p className="eyebrow">How it works</p>
              <h2 id="helps-with">One workspace for profile, roles, drafts, and decisions.</h2>
            </div>
            <div className="feature-grid">
              <article className="feature-card">
                <Database size={22} />
                <h3>Profile bank</h3>
                <p>Save CV details, links, projects, evidence, and preferences as source material.</p>
              </article>
              <article className="feature-card">
                <Target size={22} />
                <h3>Role matching</h3>
                <p>Break down each job post into signals, gaps, and evidence-backed application choices.</p>
              </article>
              <article className="feature-card">
                <MessageSquareText size={22} />
                <h3>Drafting chat</h3>
                <p>Shape CV bullets, cover notes, and form answers without drifting away from what is true.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="landing-section aside-privacy" id="privacy" aria-labelledby="privacy-title">
          <div className="section-frame privacy-frame">
            <div>
              <p className="eyebrow">Private by design</p>
              <h2 id="privacy-title">A focused place for sensitive career data.</h2>
            </div>
            <div className="privacy-grid">
              <article>
                <LockKeyhole size={22} />
                <h3>Your profile is the source of truth</h3>
                <p>Drafts are generated around saved evidence, not vague memory or invented claims.</p>
              </article>
              <article>
                <CheckCircle2 size={22} />
                <h3>You stay in control</h3>
                <p>Applications, profile sections, and account settings stay separated so the workspace feels clear.</p>
              </article>
            </div>
          </div>
        </section>

        <footer className="landing-footer">
          <Link href="/">About</Link>
          <Link href="mailto:hello@cvhelp.app">Contacts</Link>
          <span>Copyright Hatim Shaherawala</span>
        </footer>
      </main>
    </LandingThemeShell>
  );
}
