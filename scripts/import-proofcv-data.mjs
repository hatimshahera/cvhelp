import { PrismaClient } from "@prisma/client";
import { readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();
const root = path.resolve(process.cwd(), "..");
const proofcvRoot = path.join(root, "proofcv");
const applicationsRoot = path.join(proofcvRoot, "applications");
const profileRoot = path.join(proofcvRoot, "profile");
const profileKnowledgeRoot = path.join(root, "cv-work", "profile-knowledge-base");
const userEmail = process.env.CVHELP_IMPORT_USER_EMAIL || "hatimshahera@gmail.com";

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function uniqueStrings(values, limit = 20) {
  const seen = new Set();
  const output = [];

  for (const value of values.flat(Infinity)) {
    if (typeof value !== "string") continue;
    const normalized = value.replace(/\s+/g, " ").trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    output.push(normalized.slice(0, 220));
    if (output.length >= limit) break;
  }

  return output;
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function findCvPdf(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const pdfNames = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => entry.name)
    .filter((name) => !name.toLowerCase().includes("cover"));
  const preferred =
    pdfNames.find((name) => /^hatim/i.test(name)) ??
    pdfNames.find((name) => /cv|resume|résumé/i.test(name)) ??
    pdfNames[0];

  return preferred ? path.join(dir, preferred) : null;
}

function jobPostContent(jobPost) {
  if (!jobPost) return "";
  if (typeof jobPost === "string") return jobPost;
  if (typeof jobPost.description === "string") return jobPost.description;
  if (typeof jobPost.content === "string") return jobPost.content;
  return JSON.stringify(jobPost, null, 2);
}

function getCompany(cvData, jobPost, slug) {
  return (
    cvData?.target?.company ||
    cvData?.target_role?.company ||
    jobPost?.company ||
    jobPost?.employer ||
    slug.split("-").slice(0, 2).join(" ")
  );
}

function getRole(cvData, jobPost, slug) {
  return (
    cvData?.target?.role ||
    cvData?.target_role?.role_title ||
    cvData?.target_role?.role ||
    jobPost?.role ||
    jobPost?.role_title ||
    jobPost?.title ||
    slug.split("-").slice(2).join(" ") ||
    "Application"
  );
}

function normalizeTitle(value) {
  return String(value || "Untitled")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getJobSummary(cvData, jobPost) {
  return {
    requirements: uniqueStrings([
      asArray(jobPost?.requirements),
      asArray(jobPost?.must_haves),
      asArray(jobPost?.candidate_focus)
    ], 12),
    responsibilities: uniqueStrings([
      asArray(jobPost?.responsibilities),
      asArray(jobPost?.focus),
      asArray(jobPost?.duties)
    ], 12),
    keywords: uniqueStrings([
      asArray(cvData?.target?.fit),
      asArray(cvData?.target_role?.keywords),
      asArray(jobPost?.keywords),
      asArray(jobPost?.focus)
    ], 18)
  };
}

function getSelectedEvidence(cvData) {
  return {
    projects: uniqueStrings([
      asArray(cvData?.selected_projects),
      asArray(cvData?.projects)
    ], 20),
    research: uniqueStrings([
      asArray(cvData?.selected_research),
      asArray(cvData?.research)
    ], 20),
    experience: uniqueStrings([
      asArray(cvData?.selected_experience),
      asArray(cvData?.experience)
    ], 20),
    skills: uniqueStrings([
      asArray(cvData?.selected_skills),
      asArray(cvData?.skills),
      asArray(cvData?.target_role?.keywords)
    ], 30)
  };
}

function buildMemory({ cvData, jobPost, company, role, capturedAt, noteEntries }) {
  const content = jobPostContent(jobPost);
  const summary = getJobSummary(cvData, jobPost);
  const provenance = {
    sourceType: "proofcv_import",
    sourceId: "job_post.json",
    quote: content.slice(0, 500),
    confidence: "extracted",
    createdAt: capturedAt
  };

  return {
    candidateSnapshot: cvData?.candidate ?? {},
    target: {
      company,
      role,
      fit: uniqueStrings([asArray(cvData?.target?.fit), asArray(cvData?.target_role?.keywords)], 18)
    },
    jobPost: {
      source: "proofcv_import",
      sourceUrl: typeof jobPost?.url === "string" ? jobPost.url : null,
      content,
      capturedAt
    },
    requirements: summary.requirements,
    responsibilities: summary.responsibilities,
    keywords: summary.keywords,
    selectedEvidence: getSelectedEvidence(cvData),
    profileSummary: cvData?.profile_summary || cvData?.positioning || "",
    honestyNotes: uniqueStrings([
      asArray(cvData?.honesty_notes),
      asArray(cvData?.risks),
      asArray(jobPost?.excluded_projects)
    ], 20),
    risks: uniqueStrings([asArray(cvData?.risks)], 20),
    gaps: uniqueStrings([asArray(cvData?.gaps)], 20),
    notes: noteEntries,
    drafts: {},
    claimProvenance: {
      requirements: summary.requirements.length ? [provenance] : [],
      responsibilities: summary.responsibilities.length ? [provenance] : [],
      keywords: summary.keywords.length ? [provenance] : []
    },
    nextActions: ["Review imported ProofCV evidence and tailor the next output."]
  };
}

async function findApplicationDirs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const dirs = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name === "archive") {
      dirs.push(...(await findApplicationDirs(fullPath)));
      continue;
    }

    const cvPath = path.join(fullPath, "cv_data.json");
    const cvStat = await stat(cvPath).catch(() => null);
    if (!cvStat) continue;

    dirs.push({
      slug: entry.name,
      dir: fullPath,
      archived: fullPath.includes(`${path.sep}archive${path.sep}`),
      modifiedAt: cvStat.mtime
    });
  }

  return dirs;
}

async function buildNoteEntries(dir, importedAt) {
  const names = ["application_note.md", "email.md", "email_to_pierre.md", "interview_q_and_a.md"];
  const entries = [];

  for (const name of names) {
    const content = (await readText(path.join(dir, name))).trim();
    if (!content) continue;
    entries.push({
      id: crypto.randomUUID(),
      type: name.replace(/\.md$/, ""),
      content,
      createdAt: importedAt
    });
  }

  return entries;
}

async function buildProfileBank() {
  const master = (await readJson(path.join(profileRoot, "master_profile.json"), {})) ?? {};
  const projectBank = (await readJson(path.join(profileRoot, "project_bank.json"), {})) ?? {};
  const rawFiles = [
    "README.md",
    "experience.md",
    "skills.md",
    "projects.md",
    "research-and-papers.md",
    "sources.md",
    path.join("raw-sources", "github-repos.json")
  ];
  const now = new Date().toISOString();
  const entries = [];

  for (const name of rawFiles) {
    const filePath = path.join(profileKnowledgeRoot, name);
    const content = (await readText(filePath)).trim();
    if (!content) continue;
    entries.push({
      id: crypto.randomUUID(),
      type: name.endsWith(".json") ? "profile_source_json" : "profile_source_markdown",
      name,
      content,
      createdAt: now,
      metadata: {
        importedFrom: path.relative(root, filePath)
      }
    });
  }

  return {
    masterProfile: {
      identity: {
        name: master.name,
        headline: master.headline,
        location: master.location,
        summary: master.summary
      },
      links: master.links ?? {},
      education: asArray(master.education),
      experience: asArray(master.experience),
      projects: asArray(projectBank.projects),
      research: asArray(master.research),
      skills: master.skills ?? {},
      achievements: asArray(master.leadership),
      preferences: master.preferences ?? {
        roles: [
          "AI engineer",
          "full-stack AI engineer",
          "AI product engineer",
          "developer tools engineer"
        ],
        location: "United Kingdom"
      },
      constraints: master.constraints ?? {},
      evidence: [
        ...asArray(master.experience),
        ...asArray(projectBank.projects),
        ...asArray(master.research)
      ],
      openQuestions: []
    },
    rawSources: { entries },
    checklist: [
      { id: "cv", label: "Add current CV", done: true },
      { id: "linkedin", label: "Add LinkedIn background", done: true },
      { id: "github", label: "Add GitHub/projects", done: true },
      { id: "experience", label: "Confirm work experience", done: true },
      { id: "education", label: "Confirm education", done: true },
      { id: "proof", label: "Collect evidence and metrics", done: true },
      { id: "preferences", label: "Confirm role preferences", done: true },
      { id: "review", label: "Review reusable profile", done: true }
    ]
  };
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true, email: true }
  });

  if (!user) {
    throw new Error(`No CVhelp user found for ${userEmail}`);
  }

  const profileBank = await buildProfileBank();
  await prisma.profileBank.upsert({
    where: { userId: user.id },
    update: profileBank,
    create: {
      userId: user.id,
      ...profileBank
    }
  });

  const dirs = (await findApplicationDirs(applicationsRoot))
    .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
    .slice(0, 20);
  const imported = [];

  for (const item of dirs) {
    const cvData = await readJson(path.join(item.dir, "cv_data.json"), {});
    const jobPost = await readJson(path.join(item.dir, "job_post.json"), {});
    const company = normalizeTitle(getCompany(cvData, jobPost, item.slug));
    const role = normalizeTitle(getRole(cvData, jobPost, item.slug));
    const capturedAt = item.modifiedAt.toISOString();
    const noteEntries = await buildNoteEntries(item.dir, capturedAt);
    const memory = buildMemory({ cvData, jobPost, company, role, capturedAt, noteEntries });
    const slug = slugify(`${company}-${role}`) || item.slug;
    const archivedAt = item.archived ? item.modifiedAt : null;
    const status = item.archived ? "archived" : "draft";
    const timestamps = {
      createdAt: item.modifiedAt,
      updatedAt: item.modifiedAt
    };

    const application = await prisma.application.upsert({
      where: {
        userId_slug: {
          userId: user.id,
          slug
        }
      },
      update: {
        company,
        role,
        status,
        nextAction: memory.nextActions[0],
        archivedAt,
        jobPost: memory.jobPost,
        jobSummary: getJobSummary(cvData, jobPost),
        memory,
        candidateSnapshot: memory.candidateSnapshot,
        selectedEvidence: memory.selectedEvidence,
        notes: { entries: noteEntries },
        drafts: {},
        ...timestamps
      },
      create: {
        userId: user.id,
        company,
        role,
        slug,
        status,
        nextAction: memory.nextActions[0],
        archivedAt,
        jobPost: memory.jobPost,
        jobSummary: getJobSummary(cvData, jobPost),
        memory,
        candidateSnapshot: memory.candidateSnapshot,
        selectedEvidence: memory.selectedEvidence,
        notes: { entries: noteEntries },
        drafts: {},
        ...timestamps
      }
    });

    await prisma.conversation.upsert({
      where: {
        userId_mode_applicationId_threadKey: {
          userId: user.id,
          mode: "application",
          applicationId: application.id,
          threadKey: "default"
        }
      },
      update: {
        title: `${company} - ${role}`
      },
      create: {
        userId: user.id,
        applicationId: application.id,
        mode: "application",
        threadKey: "default",
        title: `${company} - ${role}`
      }
    });

    await prisma.applicationArtifact.upsert({
      where: {
        applicationId_type_version: {
          applicationId: application.id,
          type: "proofcv_data",
          version: 1
        }
      },
      update: {
        title: `${company} ${role} ProofCV data`,
        content: cvData,
        metadata: {
          source: "proofcv_import",
          importedFrom: path.relative(root, path.join(item.dir, "cv_data.json")),
          importedAt: new Date().toISOString()
        }
      },
      create: {
        userId: user.id,
        applicationId: application.id,
        type: "proofcv_data",
        title: `${company} ${role} ProofCV data`,
        version: 1,
        content: cvData,
        metadata: {
          source: "proofcv_import",
          importedFrom: path.relative(root, path.join(item.dir, "cv_data.json")),
          importedAt: new Date().toISOString()
        }
      }
    });

    const cvPdfPath = await findCvPdf(item.dir);

    if (cvPdfPath) {
      const pdfBytes = await readFile(cvPdfPath);
      const pdfFilename = path.basename(cvPdfPath);

      await prisma.applicationArtifact.upsert({
        where: {
          applicationId_type_version: {
            applicationId: application.id,
            type: "cv_pdf",
            version: 1
          }
        },
        update: {
          title: `${company} ${role} CV PDF`,
          status: "ready",
          content: {
            filename: pdfFilename,
            mimeType: "application/pdf",
            base64: pdfBytes.toString("base64")
          },
          metadata: {
            source: "proofcv_import",
            importedFrom: path.relative(root, cvPdfPath),
            importedAt: new Date().toISOString()
          }
        },
        create: {
          userId: user.id,
          applicationId: application.id,
          type: "cv_pdf",
          title: `${company} ${role} CV PDF`,
          status: "ready",
          version: 1,
          content: {
            filename: pdfFilename,
            mimeType: "application/pdf",
            base64: pdfBytes.toString("base64")
          },
          metadata: {
            source: "proofcv_import",
            importedFrom: path.relative(root, cvPdfPath),
            importedAt: new Date().toISOString()
          }
        }
      });
    }

    imported.push({
      slug,
      company,
      role,
      archived: item.archived,
      source: path.relative(root, item.dir)
    });
  }

  const counts = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      _count: {
        select: {
          applications: true,
          conversations: true,
          artifacts: true
        }
      }
    }
  });

  console.log(JSON.stringify({ user: counts, imported }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
