import Link from "next/link";
import { getServerSession } from "next-auth";
import { ArrowRight, CheckCircle2, FileText, LockKeyhole, MessageSquareText, Sparkles } from "lucide-react";
import { authOptions } from "@/lib/auth";

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
        </div>

        <div className="hero-preview" aria-label="CVhelp workflow preview">
          <div className="preview-toolbar">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-content">
            <div className="preview-column">
              <p className="preview-label">Job post</p>
              <h2>AI Engineering Fellowship</h2>
              <p>Research, agents, evaluation, product judgement, written communication.</p>
            </div>
            <div className="preview-column highlighted">
              <p className="preview-label">CVhelp output</p>
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
            <FileText size={22} />
            <h3>Understand the role</h3>
            <p>Paste a job post and break it into the skills, evidence, and priorities that matter.</p>
          </article>
          <article className="feature-card">
            <MessageSquareText size={22} />
            <h3>Draft with context</h3>
            <p>Use chat to shape CV bullets, cover notes, and application answers around your real work.</p>
          </article>
          <article className="feature-card">
            <LockKeyhole size={22} />
            <h3>Keep it private</h3>
            <p>Work from your own account, with saved conversations and a profile base you control.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
