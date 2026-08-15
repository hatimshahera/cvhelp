import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  LockKeyhole,
  MessageSquareText,
  Sparkles,
  Target
} from "lucide-react";
import { authOptions } from "@/lib/auth";

const landingMetrics = [
  ["01", "Profile bank"],
  ["02", "Role evidence"],
  ["03", "Grounded drafts"]
];

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link className="brand landing-brand" href="/">
          CVhelp
        </Link>
        <nav className="landing-actions" aria-label="Account">
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
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="hero-kicker">
            <Sparkles size={16} />
            Private CV and application workspace
          </p>
          <h1>Turn job posts into stronger applications.</h1>
          <p className="hero-lead">
            CVhelp helps you keep your experience in one place, compare it against a role,
            and shape focused CVs, cover notes, and application answers without losing track
            of what is true.
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
          <div className="hero-proof" aria-label="CVhelp workflow steps">
            {landingMetrics.map(([number, label]) => (
              <div key={label}>
                <span>{number}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-preview" aria-label="CVhelp workflow preview">
          <div className="preview-toolbar">
            <span>Mercor / AI generalist</span>
            <strong>Evidence desk</strong>
          </div>
          <div className="preview-content">
            <div className="preview-column preview-column-primary">
              <p className="preview-label">Signal pulled from role</p>
              <h2>Agents, evaluation, product judgement, written communication.</h2>
              <div className="preview-tags" aria-label="Role keywords">
                <span>LLM evals</span>
                <span>Research</span>
                <span>Shipping taste</span>
              </div>
            </div>
            <div className="preview-column highlighted">
              <p className="preview-label">Drafting guardrails</p>
              <ul>
                <li>
                  <CheckCircle2 size={16} />
                  Match evidence to role requirements
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  Rewrite bullets with measurable context
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  Keep claims grounded in your profile
                </li>
              </ul>
            </div>
            <div className="preview-column preview-column-footer">
              <p className="preview-label">Next action</p>
              <p>Generate a tailored CV PDF and keep the reasoning attached to this application.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="helps-with">
        <div className="section-heading">
          <p className="eyebrow">What it helps with</p>
          <h2 id="helps-with">A focused workflow for job applications.</h2>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <Target size={22} />
            <h3>Understand the role</h3>
            <p>Paste a job post and break it into the skills, evidence, and priorities that matter.</p>
          </article>
          <article className="feature-card">
            <MessageSquareText size={22} />
            <h3>Draft with context</h3>
            <p>Use chat to shape CV bullets, cover notes, and application answers around your real work.</p>
          </article>
          <article className="feature-card">
            <Database size={22} />
            <h3>Build a source bank</h3>
            <p>Keep source notes, profile sections, saved artifacts, and application files in one workspace.</p>
          </article>
          <article className="feature-card feature-card-dark">
            <LockKeyhole size={22} />
            <h3>Stay grounded</h3>
            <p>Draft stronger applications without inventing claims or losing the evidence trail.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
