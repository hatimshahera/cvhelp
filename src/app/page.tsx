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
        <header className="landing-site-header">
          <Link className="brand landing-brand" href="/">
            CVhelp
          </Link>
        </header>

        <section className="landing-hero aside-hero" id="workspace">
          <div className="hero-copy aside-hero-copy">
            <p className="hero-kicker">
              <Sparkles size={16} />
              Custom CVs and job tracking
            </p>
            <h1>
              Tailored CVs.
              <br />
              Tracked applications.
            </h1>
            <p className="hero-lead">
              Keep your profile, evidence, and job applications in one workspace, then
              turn saved experience into role-specific CVs.
            </p>
            <div className="hero-actions">
              <Link className="primary-link" href={session ? "/app" : "/sign-up"}>
                {session ? "Open workspace" : "Start free"}
                <ArrowRight size={18} />
              </Link>
              <Link className="secondary-link" href={session ? "/app" : "/sign-in"}>
                {session ? "Open workspace" : "Login"}
              </Link>
            </div>
          </div>
        </section>

        <section className="landing-section product-section" id="product" aria-label="CVhelp product preview">
          <div className="section-frame product-frame">
            <p className="product-copy">
              Add your experience once, compare it against a job post, and keep every
              tailored CV connected to the application it belongs to.
            </p>
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

        <section className="landing-section aside-capabilities" id="workflow" aria-label="CVhelp workflow">
          <div className="section-frame">
            <div className="feature-grid">
              <article className="feature-card">
                <Database size={22} />
                <h3>One profile bank</h3>
                <p>Store CV details, links, projects, achievements, and evidence in one place.</p>
              </article>
              <article className="feature-card">
                <Target size={22} />
                <h3>Tracked applications</h3>
                <p>Keep roles, notes, status, and evidence together as each application moves forward.</p>
              </article>
              <article className="feature-card">
                <MessageSquareText size={22} />
                <h3>Custom CV drafts</h3>
                <p>Create role-specific CVs and answers from the experience you have already saved.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="landing-section aside-privacy" id="privacy" aria-label="CVhelp privacy and control">
          <div className="section-frame privacy-frame">
            <div className="privacy-grid">
              <article>
                <LockKeyhole size={22} />
                <h3>Your data stays organised</h3>
                <p>Profile details, evidence, and drafts stay tied to the role they support.</p>
              </article>
              <article>
                <CheckCircle2 size={22} />
                <h3>Draft with confidence</h3>
                <p>Use saved facts as the source material for sharper CVs, cover notes, and answers.</p>
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
