"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  Database,
  FileText,
  FilePlus2,
  Loader2,
  LogOut,
  Paperclip,
  PencilLine,
  Save,
  Search,
  Send,
  Settings,
  Trash2,
  X,
  UserRound
} from "lucide-react";

type Message = {
  id?: string;
  role: "assistant" | "user";
  content: string;
};

type ChatMode = "build_profile" | "application";

type ProfileBankSummary = {
  sourceCount: number;
  checklist: Array<{ id: string; label: string; done: boolean }>;
  intake: {
    activeStep: { id: string; label: string; done: boolean } | null;
    nextPrompt: string;
    completedCount: number;
    totalCount: number;
    complete: boolean;
  };
  hasMasterProfile: boolean;
  sections: string[];
  completeness: number;
  missingSections: string[];
  evidenceCounts: {
    education: number;
    experience: number;
    projects: number;
    research: number;
    skills: number;
    evidence: number;
  };
};

type ProfileSourceSummary = {
  id: string;
  type: string;
  name: string | null;
  createdAt: string;
  preview: string;
};

type ApplicationItem = {
  id: string;
  company: string;
  role: string;
  slug: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

type ArtifactItem = {
  id: string;
  type: string;
  title: string;
  status: string;
  version: number;
  content?: unknown;
};

type ApplicationDetail = ApplicationItem & {
  nextAction: string | null;
  archivedAt: string | null;
  memory: {
    requirements?: string[];
    responsibilities?: string[];
    keywords?: string[];
    selectedEvidence?: {
      projects?: string[];
      research?: string[];
      experience?: string[];
      skills?: string[];
    };
    honestyNotes?: string[];
    risks?: string[];
    gaps?: string[];
    notes?: unknown[];
  } | null;
  artifacts: ArtifactItem[];
};

const applicationStatuses = [
  "draft",
  "researching",
  "tailoring_cv",
  "cover_note_ready",
  "submitted",
  "interviewing",
  "rejected",
  "archived"
];

type ProfileSection =
  | "identity"
  | "links"
  | "education"
  | "experience"
  | "projects"
  | "research"
  | "skills"
  | "achievements"
  | "preferences"
  | "constraints"
  | "evidence"
  | "openQuestions";

type CanonicalProfile = Record<ProfileSection, unknown>;

const profileSections: ProfileSection[] = [
  "identity",
  "links",
  "education",
  "experience",
  "projects",
  "research",
  "skills",
  "achievements",
  "preferences",
  "constraints",
  "evidence",
  "openQuestions"
];

const profileCommandSuggestions = [
  "What profile info do you still need from me?",
  "Summarize my strongest evidence and missing proof.",
  "I need to correct something saved in my profile.",
  "Review the structured profile for gaps or overstated claims."
];

const applicationCommandSuggestions = [
  "Compare this job against my profile and list the best evidence.",
  "Draft tailored CV bullets for this application.",
  "Write a concise recruiter message for this application.",
  "What gaps, risks, and next actions should I handle?"
];

const applicationArtifactCommands = [
  { type: "proofcv_data", label: "ProofCV data" },
  { type: "cv_draft", label: "CV draft" },
  { type: "cover_note", label: "Cover note" },
  { type: "recruiter_message", label: "Recruiter message" }
];

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isEditorSuccessMessage(message: string) {
  return message === "Saved." || message === "Source deleted." || message.startsWith("Correction queued");
}

function renderMessageContent(content: string) {
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const bulletLines = lines
      .map((line) => line.match(/^[-*]\s+(.+)$/)?.[1]?.trim())
      .filter((line): line is string => Boolean(line));

    if (bulletLines.length && bulletLines.length === lines.length) {
      return (
        <ul key={`${blockIndex}-${block.slice(0, 16)}`}>
          {bulletLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      );
    }

    return <p key={`${blockIndex}-${block.slice(0, 16)}`}>{block}</p>;
  });
}

function summarizeArtifactContent(content: unknown) {
  const record = asRecord(content);
  if (!record) return "";

  if (typeof record.summary === "string") return record.summary;
  if (typeof record.note === "string") return record.note;
  if (typeof record.message === "string") return record.message;
  if (Array.isArray(record.bullets) && typeof record.bullets[0] === "string") return record.bullets[0];
  if (Array.isArray(record.answers) && record.answers[0] && typeof record.answers[0] === "object") {
    const firstAnswer = record.answers[0] as Record<string, unknown>;
    if (typeof firstAnswer.answer === "string") return firstAnswer.answer;
  }
  if (typeof record.profile_summary === "string") return record.profile_summary;

  return JSON.stringify(record).slice(0, 180);
}

async function readJsonResponse(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: `${response.status} ${response.statusText || "Request failed"}`.trim() };
  }
}

export function AppShell({
  userName,
  userEmail
}: {
  userName: string;
  userEmail: string;
}) {
  const [activeMode, setActiveMode] = useState<ChatMode>("build_profile");
  const [activeApplicationId, setActiveApplicationId] = useState<string | null>(null);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [applicationSearch, setApplicationSearch] = useState("");
  const [applicationListFilter, setApplicationListFilter] = useState<"active" | "archived" | "all">("active");
  const [isAddingApplication, setIsAddingApplication] = useState(false);
  const [jobSource, setJobSource] = useState("");
  const [isCreatingApplication, setIsCreatingApplication] = useState(false);
  const [applicationDetail, setApplicationDetail] = useState<ApplicationDetail | null>(null);
  const [applicationStatusDraft, setApplicationStatusDraft] = useState("draft");
  const [applicationNextActionDraft, setApplicationNextActionDraft] = useState("");
  const [isLoadingApplicationDetail, setIsLoadingApplicationDetail] = useState(false);
  const [isSavingApplicationDetail, setIsSavingApplicationDetail] = useState(false);
  const [generatingArtifactType, setGeneratingArtifactType] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [artifactRefinePrompt, setArtifactRefinePrompt] = useState("");
  const [applicationEditorMessage, setApplicationEditorMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [profileBank, setProfileBank] = useState<ProfileBankSummary | null>(null);
  const [profileSources, setProfileSources] = useState<ProfileSourceSummary[]>([]);
  const [deletingProfileSourceId, setDeletingProfileSourceId] = useState<string | null>(null);
  const [profileDetails, setProfileDetails] = useState<CanonicalProfile | null>(null);
  const [selectedProfileSection, setSelectedProfileSection] = useState<ProfileSection>("identity");
  const [profileSectionDraft, setProfileSectionDraft] = useState("");
  const [profileCorrectionDraft, setProfileCorrectionDraft] = useState("");
  const [isLoadingProfileDetails, setIsLoadingProfileDetails] = useState(false);
  const [isSavingProfileSection, setIsSavingProfileSection] = useState(false);
  const [profileEditorMessage, setProfileEditorMessage] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isClearingConversation, setIsClearingConversation] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadRequestRef = useRef(0);
  const activeApplication = applications.find((item) => item.id === activeApplicationId) ?? null;
  const activeApplications = applications.filter((item) => item.status !== "archived");
  const archivedApplications = applications.filter((item) => item.status === "archived");
  const filteredApplications = applications.filter((item) => {
    const matchesFilter =
      applicationListFilter === "all" ||
      (applicationListFilter === "archived" ? item.status === "archived" : item.status !== "archived");
    const search = applicationSearch.trim().toLowerCase();
    const matchesSearch =
      !search ||
      [item.company, item.role, item.status].some((value) => value.toLowerCase().includes(search));

    return matchesFilter && matchesSearch;
  });
  const activeTitle =
    activeMode === "build_profile"
      ? "Build profile"
      : activeApplication
        ? `${activeApplication.company} - ${activeApplication.role}`
        : "Applications";
  const activeDescription =
    activeMode === "build_profile"
      ? "Add CV, LinkedIn, GitHub, projects, evidence"
      : activeApplication
        ? "Application-specific chat, notes, CV tailoring, cover letters, and answers"
        : "Add a job description to create an application workspace";

  async function loadApplications() {
    try {
      const response = await fetch("/api/applications", { cache: "no-store" });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not load applications.");
      }

      setApplications(data.applications ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load applications.");
    }
  }

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadProfileDetails() {
    if (activeMode !== "build_profile") return;

    setIsLoadingProfileDetails(true);
    setProfileEditorMessage("");
    try {
      const response = await fetch("/api/profile", { cache: "no-store" });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not load profile details.");
      }

      setProfileDetails(data.profile);
      setProfileBank(data.profileBank ?? profileBank);
      setProfileSources(data.sources ?? []);
      setProfileSectionDraft(JSON.stringify(data.profile?.[selectedProfileSection] ?? null, null, 2));
    } catch (profileError) {
      setProfileEditorMessage(
        profileError instanceof Error ? profileError.message : "Could not load profile details."
      );
    } finally {
      setIsLoadingProfileDetails(false);
    }
  }

  async function loadApplicationDetail(applicationId: string) {
    setIsLoadingApplicationDetail(true);
    setApplicationEditorMessage("");
    try {
      const response = await fetch(`/api/applications/${applicationId}`, { cache: "no-store" });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not load application details.");
      }

      setApplicationDetail(data.application);
      setApplicationStatusDraft(data.application.status || "draft");
      setApplicationNextActionDraft(data.application.nextAction || "");
      setSelectedArtifactId((current) => {
        if (current && data.application.artifacts?.some((artifact: { id: string }) => artifact.id === current)) {
          return current;
        }
        return data.application.artifacts?.[0]?.id ?? null;
      });
    } catch (applicationError) {
      setApplicationEditorMessage(
        applicationError instanceof Error ? applicationError.message : "Could not load application details."
      );
    } finally {
      setIsLoadingApplicationDetail(false);
    }
  }

  useEffect(() => {
    loadProfileDetails();
    // The selected section is intentionally excluded so changing tabs does not refetch the whole profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode]);

  useEffect(() => {
    if (activeMode === "application" && activeApplicationId) {
      loadApplicationDetail(activeApplicationId);
    } else {
      setApplicationDetail(null);
      setApplicationEditorMessage("");
    }
  }, [activeMode, activeApplicationId]);

  useEffect(() => {
    if (!profileDetails) return;
    setProfileSectionDraft(JSON.stringify(profileDetails[selectedProfileSection] ?? null, null, 2));
  }, [profileDetails, selectedProfileSection]);

  useEffect(() => {
    let isMounted = true;
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;

    async function loadConversation() {
      setIsLoadingHistory(true);
      setError("");
      try {
        if (activeMode === "application" && !activeApplicationId) {
          if (isMounted && loadRequestRef.current === requestId) {
            setConversationId(null);
            setMessages([]);
            setProfileBank((current) => current);
            setIsLoadingHistory(false);
          }
          return;
        }

        const params = new URLSearchParams({ mode: activeMode });
        if (activeApplicationId) params.set("applicationId", activeApplicationId);
        const response = await fetch(`/api/chat?${params.toString()}`, { cache: "no-store" });
        const data = await readJsonResponse(response);

        if (!response.ok) {
          throw new Error(data.error || "Could not load the chat.");
        }

        if (isMounted && loadRequestRef.current === requestId) {
          setConversationId(data.conversationId);
          setMessages(data.messages);
          setProfileBank(data.profileBank ?? null);
        }
      } catch (loadError) {
        if (isMounted && loadRequestRef.current === requestId) {
          setError(loadError instanceof Error ? loadError.message : "Could not load the chat.");
        }
      } finally {
        if (isMounted && loadRequestRef.current === requestId) {
          setIsLoadingHistory(false);
        }
      }
    }

    loadConversation();

    return () => {
      isMounted = false;
    };
  }, [activeMode, activeApplicationId]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, isSending]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if ((!trimmed && !selectedFiles.length) || isSending) return;
    const filesToUpload = selectedFiles;
    const optimisticContent = [
      trimmed,
      filesToUpload.length
        ? `Uploaded ${filesToUpload.map((file) => file.name).join(", ")}`
        : ""
    ]
      .filter(Boolean)
      .join("\n\n");

    const optimisticMessage: Message = {
      id: `pending-${Date.now()}`,
      role: "user",
      content: optimisticContent
    };

    setError("");
    setMessages((current) => [...current, optimisticMessage]);
    setMessage("");
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsSending(true);

    try {
      let fileContext = "";

      if (filesToUpload.length) {
        const formData = new FormData();
        filesToUpload.forEach((file) => formData.append("files", file));

        const uploadResponse = await fetch("/api/profile-sources", {
          method: "POST",
          body: formData
        });
        const uploadData = await readJsonResponse(uploadResponse);

        if (!uploadResponse.ok) {
          throw new Error(
            uploadData.error ||
              `The files could not be uploaded. (${uploadResponse.status} ${uploadResponse.statusText})`
          );
        }

        setProfileBank(uploadData.profileBank ?? profileBank);
        fileContext = uploadData.messageContext || "";
      }

      const finalMessage =
        trimmed ||
        "I uploaded files to my profile bank. Please review what you can use and tell me what else you need.";
      const messageWithFiles = [finalMessage, fileContext].filter(Boolean).join("\n\n");

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: messageWithFiles,
          mode: activeMode,
          applicationId: activeApplicationId
        })
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "The message could not be sent.");
      }

      setConversationId(data.conversationId);
      setProfileBank(data.profileBank ?? profileBank);
      setMessages(data.messages ?? []);
      if (activeMode === "build_profile") {
        await loadProfileDetails();
      }
    } catch (sendError) {
      setMessages((current) => current.filter((item) => item.id !== optimisticMessage.id));
      setMessage(trimmed);
      setSelectedFiles(filesToUpload);
      setError(sendError instanceof Error ? sendError.message : "The message could not be sent.");
    } finally {
      setIsSending(false);
    }
  }

  async function createApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = jobSource.trim();
    if (!trimmed || isCreatingApplication) return;

    setError("");
    setIsCreatingApplication(true);

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobSource: trimmed })
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not create the application.");
      }

      await loadApplications();
      setJobSource("");
      setIsAddingApplication(false);
      setActiveMode("application");
      setActiveApplicationId(data.application.id);
      setApplicationDetail(data.application);
      setApplicationStatusDraft(data.application.status || "draft");
      setApplicationNextActionDraft(data.application.nextAction || "");
      setConversationId(null);
      setMessages([]);
      setMessage("");
      setSelectedFiles([]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the application.");
    } finally {
      setIsCreatingApplication(false);
    }
  }

  async function clearConversation() {
    if (activeMode !== "build_profile" || isClearingConversation || isSending || isLoadingHistory) return;
    if (!conversationId && !messages.length) return;

    const confirmed = window.confirm("Clear this profile builder conversation? Your profile bank stays saved.");
    if (!confirmed) return;

    setError("");
    setIsClearingConversation(true);

    try {
      const params = new URLSearchParams({ mode: activeMode });
      const response = await fetch(`/api/chat?${params.toString()}`, { method: "DELETE" });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not clear the conversation.");
      }

      setConversationId(data.conversationId);
      setMessages([]);
      setMessage("");
      setSelectedFiles([]);
      setProfileBank(data.profileBank ?? profileBank);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Could not clear the conversation.");
    } finally {
      setIsClearingConversation(false);
    }
  }

  async function saveProfileSection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavingProfileSection) return;

    let parsedValue: unknown;

    try {
      parsedValue = JSON.parse(profileSectionDraft);
    } catch {
      setProfileEditorMessage("This section must be valid JSON before it can be saved.");
      return;
    }

    setIsSavingProfileSection(true);
    setProfileEditorMessage("");

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: selectedProfileSection,
          value: parsedValue
        })
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not save this profile section.");
      }

      setProfileDetails(data.profile);
      setProfileBank(data.profileBank ?? profileBank);
      setProfileSources(data.sources ?? profileSources);
      setProfileEditorMessage("Saved.");
    } catch (saveError) {
      setProfileEditorMessage(
        saveError instanceof Error ? saveError.message : "Could not save this profile section."
      );
    } finally {
      setIsSavingProfileSection(false);
    }
  }

  async function deleteProfileSource(sourceId: string) {
    if (deletingProfileSourceId) return;

    setDeletingProfileSourceId(sourceId);
    setProfileEditorMessage("");

    try {
      const response = await fetch("/api/profile-sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId })
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not delete this source.");
      }

      setProfileSources((current) => current.filter((source) => source.id !== sourceId));
      setProfileBank(data.profileBank ?? profileBank);
      setProfileEditorMessage("Source deleted.");
    } catch (deleteError) {
      setProfileEditorMessage(
        deleteError instanceof Error ? deleteError.message : "Could not delete this source."
      );
    } finally {
      setDeletingProfileSourceId(null);
    }
  }

  function queueProfileCorrection() {
    const correction = profileCorrectionDraft.trim();
    if (!correction) {
      setProfileEditorMessage("Describe the correction before queueing it.");
      return;
    }

    setActiveMode("build_profile");
    setMessage(
      [
        `Please correct the saved ${selectedProfileSection} section in my profile.`,
        `Correction: ${correction}`,
        "Only update facts that are supported by this correction. If anything is ambiguous, ask me one focused question before saving it."
      ].join("\n\n")
    );
    setProfileCorrectionDraft("");
    setProfileEditorMessage("Correction queued in chat. Press Send when ready.");
  }

  async function saveApplicationDetail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeApplicationId || isSavingApplicationDetail) return;

    setIsSavingApplicationDetail(true);
    setApplicationEditorMessage("");

    try {
      const response = await fetch(`/api/applications/${activeApplicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: applicationStatusDraft,
          nextAction: applicationNextActionDraft || null
        })
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not save this application.");
      }

      setApplicationDetail(data.application);
      setSelectedArtifactId(data.application.artifacts?.[0]?.id ?? null);
      setApplications((current) =>
        current.map((item) =>
          item.id === data.application.id
            ? {
                ...item,
                company: data.application.company,
                role: data.application.role,
                status: data.application.status
              }
            : item
        )
      );
      setApplicationEditorMessage("Saved.");
    } catch (saveError) {
      setApplicationEditorMessage(
        saveError instanceof Error ? saveError.message : "Could not save this application."
      );
    } finally {
      setIsSavingApplicationDetail(false);
    }
  }

  async function generateApplicationArtifact(
    type: string,
    prompt?: string,
    refineFromArtifactId?: string
  ) {
    if (!activeApplicationId || generatingArtifactType) return;

    setGeneratingArtifactType(type);
    setApplicationEditorMessage("");

    try {
      const response = await fetch(`/api/applications/${activeApplicationId}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, prompt, refineFromArtifactId })
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not generate this artifact.");
      }

      await loadApplicationDetail(activeApplicationId);
      if (refineFromArtifactId) setArtifactRefinePrompt("");
      setApplicationEditorMessage("Artifact saved.");
    } catch (generateError) {
      setApplicationEditorMessage(
        generateError instanceof Error ? generateError.message : "Could not generate this artifact."
      );
    } finally {
      setGeneratingArtifactType(null);
    }
  }

  const applicationMemory = applicationDetail?.memory;
  const selectedEvidence = applicationMemory?.selectedEvidence;
  const selectedArtifact =
    applicationDetail?.artifacts.find((artifact) => artifact.id === selectedArtifactId) ??
    applicationDetail?.artifacts[0] ??
    null;
  const selectedArtifactJson = selectedArtifact?.content
    ? JSON.stringify(selectedArtifact.content, null, 2)
    : "";
  const selectedArtifactDownloadHref = selectedArtifactJson
    ? `data:application/json;charset=utf-8,${encodeURIComponent(selectedArtifactJson)}`
    : "";
  const selectedArtifactTexHref =
    activeApplicationId && selectedArtifact
      ? `/api/applications/${activeApplicationId}/artifacts/${selectedArtifact.id}/export`
      : "";
  const commandSuggestions =
    activeMode === "build_profile" ? profileCommandSuggestions : applicationCommandSuggestions;

  function applyCommandSuggestion(command: string) {
    setMessage(command);
  }

  return (
    <main className="workspace-shell">
      <aside className="settings-rail">
        <div>
          <p className="brand">CVhelp</p>
          <div className="user-tile">
            <UserRound size={18} />
            <div>
              <strong>{userName}</strong>
              <span>{userEmail}</span>
            </div>
          </div>
          <Link className="account-link" href="/app/account">
            <Settings size={16} />
            Account settings
          </Link>
        </div>

        <nav className="rail-nav" aria-label="Workspace navigation">
          <button
            className={activeMode === "build_profile" ? "active" : ""}
            type="button"
            onClick={() => {
              setActiveMode("build_profile");
              setActiveApplicationId(null);
              setConversationId(null);
              setMessages([]);
              setMessage("");
              setSelectedFiles([]);
            }}
          >
            <UserRound size={18} />
            <span>
              <strong>Build profile</strong>
              <small>Add CV, LinkedIn, GitHub, projects, evidence</small>
            </span>
          </button>
        </nav>

        <section className="applications-panel" aria-label="Applications">
          <div className="applications-heading">
            <div>
              <BriefcaseBusiness size={17} />
              <strong>Applications</strong>
            </div>
            <span>{applications.length}</span>
          </div>
          <button
            className="add-application-button"
            type="button"
            onClick={() => setIsAddingApplication((current) => !current)}
          >
            <FilePlus2 size={16} />
            Add job description
          </button>

          {isAddingApplication ? (
            <form className="job-description-form" onSubmit={createApplication}>
              <textarea
                value={jobSource}
                onChange={(event) => setJobSource(event.target.value)}
                placeholder="Paste a job post link or the full job description..."
                disabled={isCreatingApplication}
              />
              <button type="submit" disabled={isCreatingApplication || jobSource.trim().length < 10}>
                {isCreatingApplication ? <Loader2 className="spin" size={15} /> : null}
                Create application
              </button>
            </form>
          ) : null}

          <div className="application-list-controls">
            <div className="application-search">
              <Search size={14} />
              <input
                value={applicationSearch}
                onChange={(event) => setApplicationSearch(event.target.value)}
                placeholder="Search applications"
              />
            </div>
            <div className="application-filter-tabs" aria-label="Application filters">
              {[
                ["active", `Active ${activeApplications.length}`],
                ["archived", `Archived ${archivedApplications.length}`],
                ["all", `All ${applications.length}`]
              ].map(([filter, label]) => (
                <button
                  key={filter}
                  className={applicationListFilter === filter ? "active" : ""}
                  type="button"
                  onClick={() => setApplicationListFilter(filter as "active" | "archived" | "all")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="applications-list">
            {filteredApplications.length ? (
              filteredApplications.map((application) => (
                <button
                  className={
                    activeMode === "application" && activeApplicationId === application.id ? "active" : ""
                  }
                  type="button"
                  key={application.id}
                  onClick={() => {
                    setActiveMode("application");
                    setActiveApplicationId(application.id);
                    setConversationId(null);
                    setMessages([]);
                    setMessage("");
                    setSelectedFiles([]);
                  }}
                >
                  <div className="application-list-title">
                    <strong>{application.company}</strong>
                    <span className="status-pill">{formatLabel(application.status)}</span>
                  </div>
                  <span>{application.role}</span>
                  {application.updatedAt ? (
                    <small>{formatShortDate(application.updatedAt)}</small>
                  ) : null}
                </button>
              ))
            ) : (
              <p>No matching applications.</p>
            )}
          </div>
        </section>

        {profileBank ? (
          <section className="profile-bank-panel" aria-label="Profile bank status">
            <div className="profile-bank-title">
              <Database size={17} />
              <strong>Profile bank</strong>
            </div>
            <p>{profileBank.sourceCount} saved source notes</p>
            <div className="profile-intake-status" aria-label="Profile intake next step">
              <div>
                <strong>
                  {profileBank.intake.completedCount}/{profileBank.intake.totalCount}
                </strong>
                <span>{profileBank.intake.complete ? "intake complete" : "intake steps"}</span>
              </div>
              <p>{profileBank.intake.nextPrompt}</p>
            </div>
            <div className="profile-completeness" aria-label="Profile completeness">
              <div>
                <strong>{profileBank.completeness}%</strong>
                <span>complete</span>
              </div>
              <progress value={profileBank.completeness} max={100} />
            </div>
            {profileBank.sections.length ? (
              <div className="profile-sections">
                {profileBank.sections.slice(0, 5).map((section) => (
                  <span key={section}>{section}</span>
                ))}
              </div>
            ) : null}
            <ul>
              {profileBank.checklist.map((item) => (
                <li className={item.done ? "done" : ""} key={item.id}>
                  <CheckCircle2 size={15} />
                  {item.label}
                </li>
              ))}
            </ul>
            {profileBank.missingSections.length ? (
              <p className="profile-missing">
                Missing: {profileBank.missingSections.slice(0, 3).join(", ")}
              </p>
            ) : null}
          </section>
        ) : null}

        <button
          className="logout-button"
          type="button"
          onClick={() => signOut({ callbackUrl: "/sign-in" })}
        >
          <LogOut size={18} />
          Logout
        </button>
      </aside>

      <section className="chat-area">
        <header className="chat-header">
          <div className="chat-header-main">
            <p className="eyebrow">Workspace</p>
            <h1>{activeTitle}</h1>
            {activeMode === "application" && activeApplication ? (
              <div className="chat-status-row">
                <span className="status-pill">{formatLabel(activeApplication.status)}</span>
                <span>One saved thread for this application</span>
              </div>
            ) : null}
            <p>{activeDescription}</p>
          </div>
          {activeMode === "build_profile" ? (
            <button
              className="clear-conversation-button"
              type="button"
              onClick={clearConversation}
              disabled={
                isClearingConversation ||
                isSending ||
                isLoadingHistory ||
                (!conversationId && !messages.length)
              }
            >
              {isClearingConversation ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
              Clear conversation
            </button>
          ) : null}
        </header>

        <div className="message-list" ref={listRef}>
          {isLoadingHistory ? (
            <div className="empty-state">
              <Loader2 className="spin" size={18} />
              Loading chat...
            </div>
          ) : messages.length ? (
            messages.map((item, index) => (
              <article className={`message ${item.role}`} key={item.id ?? `${item.role}-${index}`}>
                <div className="message-meta">{item.role === "assistant" ? "CVhelp" : "You"}</div>
                <div className="message-body">{renderMessageContent(item.content)}</div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              {activeMode === "build_profile"
                ? "Start by pasting your CV, LinkedIn summary, GitHub/project list, or tell me what you want added to your profile."
                : activeApplication
                  ? "Ask about this role, tailor your CV, draft a cover letter, or paste application questions."
                  : "Add a job description from the sidebar to create a separate chat for that application."}
            </div>
          )}
          {isSending ? (
            <article className="message assistant pending">
              <Loader2 className="spin" size={16} />
              <p>Thinking...</p>
            </article>
          ) : null}
        </div>

        {error ? <p className="chat-error">{error}</p> : null}

        <form className="composer" onSubmit={sendMessage}>
          <div className="command-suggestions" aria-label="Suggested chat commands">
            {commandSuggestions.map((command) => (
              <button
                key={command}
                type="button"
                onClick={() => applyCommandSuggestion(command)}
                disabled={isSending || isLoadingHistory || (activeMode === "application" && !activeApplication)}
              >
                {command}
              </button>
            ))}
          </div>
          {selectedFiles.length ? (
            <div className="selected-files">
              {selectedFiles.map((file) => (
                <span key={`${file.name}-${file.size}`}>
                  {file.name}
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedFiles((current) => current.filter((item) => item !== file))
                    }
                    aria-label={`Remove ${file.name}`}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="composer-row">
            <button
              className="attach-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending || isLoadingHistory}
              aria-label="Attach files"
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={fileInputRef}
              className="file-input"
              type="file"
              name="files"
              multiple
              onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
              disabled={isSending || isLoadingHistory}
            />
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={
                activeMode === "build_profile"
                  ? "Add to your profile..."
                  : activeApplication
                    ? "Ask about this application..."
                    : "Add a job description first..."
              }
              disabled={isSending || isLoadingHistory || (activeMode === "application" && !activeApplication)}
            />
          </div>
          <button
            type="submit"
            disabled={
              isSending ||
              isLoadingHistory ||
              (!message.trim() && !selectedFiles.length) ||
              (activeMode === "application" && !activeApplication)
            }
          >
            {isSending ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            Send
          </button>
        </form>
      </section>

      <aside className="memory-side-panel" aria-label="Structured profile editor">
        {activeMode === "build_profile" ? (
          <>
            <div className="side-panel-heading">
              <p className="eyebrow">Profile</p>
              <h2>Structured editor</h2>
            </div>

            <div className="section-tabs" role="tablist" aria-label="Profile sections">
              {profileSections.map((section) => (
                <button
                  key={section}
                  type="button"
                  className={selectedProfileSection === section ? "active" : ""}
                  onClick={() => setSelectedProfileSection(section)}
                >
                  {section}
                </button>
              ))}
            </div>

            <form className="profile-section-editor" onSubmit={saveProfileSection}>
              <label>
                {selectedProfileSection}
                <textarea
                  value={profileSectionDraft}
                  onChange={(event) => setProfileSectionDraft(event.target.value)}
                  disabled={isLoadingProfileDetails || isSavingProfileSection}
                  spellCheck={false}
                />
              </label>

              {profileEditorMessage ? (
                <p className={isEditorSuccessMessage(profileEditorMessage) ? "editor-success" : "editor-error"}>
                  {profileEditorMessage}
                </p>
              ) : null}

              <button type="submit" disabled={isLoadingProfileDetails || isSavingProfileSection}>
                {isSavingProfileSection ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
                Save section
              </button>
            </form>

            <section className="profile-correction-flow" aria-label="Profile correction flow">
              <div>
                <h3>Correction</h3>
                <span>{selectedProfileSection}</span>
              </div>
              <textarea
                value={profileCorrectionDraft}
                onChange={(event) => setProfileCorrectionDraft(event.target.value)}
                placeholder="Example: remove the AWS claim, change the project metric to 20%, or ask me before saving this employer."
                disabled={isSending || isLoadingHistory}
              />
              <button
                type="button"
                onClick={queueProfileCorrection}
                disabled={isSending || isLoadingHistory || !profileCorrectionDraft.trim()}
              >
                <PencilLine size={15} />
                Queue correction
              </button>
            </section>

            <section className="profile-source-list" aria-label="Saved profile sources">
              <div className="source-list-heading">
                <h3>Saved sources</h3>
                <span>{profileSources.length}</span>
              </div>
              {profileSources.length ? (
                <ul>
                  {profileSources.map((source) => (
                    <li key={source.id}>
                      <div>
                        <strong>{source.name || formatLabel(source.type)}</strong>
                        <span>{formatShortDate(source.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => deleteProfileSource(source.id)}
                          disabled={Boolean(deletingProfileSourceId)}
                          aria-label={`Delete ${source.name || source.type}`}
                        >
                          {deletingProfileSourceId === source.id ? (
                            <Loader2 className="spin" size={13} />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </div>
                      <p>{source.preview || "No source preview saved."}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No saved sources yet.</p>
              )}
            </section>
          </>
        ) : (
          <>
            <div className="side-panel-heading">
              <p className="eyebrow">Application</p>
              <div className="side-panel-title-row">
                <h2>Workspace</h2>
                {activeApplication ? (
                  <span className="status-pill">{formatLabel(activeApplication.status)}</span>
                ) : null}
              </div>
              <p>Scoped memory and outputs for the selected role.</p>
            </div>

            {activeApplication ? (
              <>
                <section className="application-workspace-summary" aria-label="Application summary">
                  <div>
                    <span>Company</span>
                    <strong>{activeApplication.company}</strong>
                  </div>
                  <div>
                    <span>Role</span>
                    <strong>{activeApplication.role}</strong>
                  </div>
                  {applicationDetail?.updatedAt ? (
                    <div>
                      <span>Updated</span>
                      <strong>{formatShortDate(applicationDetail.updatedAt)}</strong>
                    </div>
                  ) : null}
                </section>

                <form className="application-detail-form compact" onSubmit={saveApplicationDetail}>
                  <div className="application-status-row">
                    <label>
                      Status
                      <select
                        value={applicationStatusDraft}
                        onChange={(event) => setApplicationStatusDraft(event.target.value)}
                        disabled={isLoadingApplicationDetail || isSavingApplicationDetail}
                      >
                        {applicationStatuses.map((status) => (
                          <option key={status} value={status}>
                            {formatLabel(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      disabled={isLoadingApplicationDetail || isSavingApplicationDetail || !applicationDetail}
                      aria-label="Save application status and next action"
                    >
                      {isSavingApplicationDetail ? (
                        <Loader2 className="spin" size={16} />
                      ) : (
                        <Save size={16} />
                      )}
                      Save
                    </button>
                  </div>

                  <label>
                    Next action
                    <input
                      value={applicationNextActionDraft}
                      onChange={(event) => setApplicationNextActionDraft(event.target.value)}
                      disabled={isLoadingApplicationDetail || isSavingApplicationDetail}
                      placeholder="What should happen next?"
                    />
                  </label>

                  {applicationEditorMessage ? (
                    <p
                      className={
                        applicationEditorMessage === "Saved." || applicationEditorMessage === "Artifact saved."
                          ? "editor-success"
                          : "editor-error"
                      }
                    >
                      {applicationEditorMessage}
                    </p>
                  ) : null}
                </form>

                <div className="memory-stat-grid" aria-label="Application memory summary">
                  <div>
                    <strong>{applicationMemory?.requirements?.length ?? 0}</strong>
                    <span>requirements</span>
                  </div>
                  <div>
                    <strong>{selectedEvidence?.projects?.length ?? 0}</strong>
                    <span>projects</span>
                  </div>
                  <div>
                    <strong>{selectedEvidence?.skills?.length ?? 0}</strong>
                    <span>skills</span>
                  </div>
                  <div>
                    <strong>{applicationMemory?.notes?.length ?? 0}</strong>
                    <span>notes</span>
                  </div>
                </div>

                <section className="application-memory-list" aria-label="Application requirements">
                  <h3>Requirements</h3>
                  {applicationMemory?.requirements?.length ? (
                    <ul>
                      {applicationMemory.requirements.slice(0, 6).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No requirements saved yet.</p>
                  )}
                </section>

                <section className="application-memory-list" aria-label="Application evidence">
                  <h3>Evidence</h3>
                  {selectedEvidence?.projects?.length ||
                  selectedEvidence?.research?.length ||
                  selectedEvidence?.experience?.length ||
                  selectedEvidence?.skills?.length ? (
                    <ul>
                      {[
                        ...(selectedEvidence.projects ?? []),
                        ...(selectedEvidence.research ?? []),
                        ...(selectedEvidence.experience ?? []),
                        ...(selectedEvidence.skills ?? [])
                      ]
                        .slice(0, 8)
                        .map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                    </ul>
                  ) : (
                    <p>No selected evidence yet.</p>
                  )}
                </section>

                <section className="application-memory-list" aria-label="Application risks">
                  <h3>Gaps and risks</h3>
                  {applicationMemory?.gaps?.length || applicationMemory?.risks?.length || applicationMemory?.honestyNotes?.length ? (
                    <ul>
                      {[
                        ...(applicationMemory?.gaps ?? []),
                        ...(applicationMemory?.risks ?? []),
                        ...(applicationMemory?.honestyNotes ?? [])
                      ]
                        .slice(0, 6)
                        .map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                    </ul>
                  ) : (
                    <p>No saved gaps or honesty notes yet.</p>
                  )}
                </section>

                <section className="application-memory-list artifacts-compact" aria-label="Application artifacts">
                  <div className="workspace-section-heading">
                    <h3>Artifacts</h3>
                    <span>{applicationDetail?.artifacts.length ?? 0}</span>
                  </div>
                  <div className="artifact-actions" aria-label="Generate artifacts">
                    {applicationArtifactCommands.map(({ type, label }) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => generateApplicationArtifact(type)}
                        disabled={Boolean(generatingArtifactType) || isLoadingApplicationDetail}
                      >
                        {generatingArtifactType === type ? (
                          <Loader2 className="spin" size={14} />
                        ) : (
                          <FileText size={14} />
                        )}
                        {label}
                      </button>
                    ))}
                  </div>
                  {applicationDetail?.artifacts.length ? (
                    <ul>
                      {applicationDetail.artifacts.slice(0, 5).map((artifact) => (
                        <li key={artifact.id}>
                          <div className="artifact-title-line">
                            <FileText size={14} />
                            <button
                              className={selectedArtifact?.id === artifact.id ? "active" : ""}
                              type="button"
                              onClick={() => setSelectedArtifactId(artifact.id)}
                            >
                              {artifact.title} v{artifact.version}
                            </button>
                          </div>
                          {summarizeArtifactContent(artifact.content) ? (
                            <p>{summarizeArtifactContent(artifact.content)}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No generated artifacts yet.</p>
                  )}
                </section>

                {selectedArtifact ? (
                  <section className="artifact-preview-panel" aria-label="Selected artifact preview">
                    <div>
                      <div>
                        <h3>{selectedArtifact.title}</h3>
                        <p>
                          {formatLabel(selectedArtifact.type)} v{selectedArtifact.version}
                        </p>
                      </div>
                      <div className="artifact-download-links">
                        {selectedArtifactTexHref ? (
                          <a href={selectedArtifactTexHref}>
                            Download TeX
                          </a>
                        ) : null}
                        {selectedArtifactDownloadHref ? (
                          <a
                            href={selectedArtifactDownloadHref}
                            download={`${selectedArtifact.type}-v${selectedArtifact.version}.json`}
                          >
                            Download JSON
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <div className="artifact-preview-summary">
                      <p>{summarizeArtifactContent(selectedArtifact.content) || "Saved artifact data."}</p>
                    </div>
                    {selectedArtifact.type !== "proofcv_data" ? (
                      <form
                        className="artifact-refine-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          generateApplicationArtifact(
                            selectedArtifact.type,
                            artifactRefinePrompt,
                            selectedArtifact.id
                          );
                        }}
                      >
                        <label>
                          Refine this version
                          <textarea
                            value={artifactRefinePrompt}
                            onChange={(event) => setArtifactRefinePrompt(event.target.value)}
                            placeholder="Example: make it shorter, add more Python evidence, reduce hype, or answer in STAR format."
                            disabled={Boolean(generatingArtifactType) || isLoadingApplicationDetail}
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={
                            Boolean(generatingArtifactType) ||
                            isLoadingApplicationDetail ||
                            artifactRefinePrompt.trim().length < 5
                          }
                        >
                          {generatingArtifactType === selectedArtifact.type ? (
                            <Loader2 className="spin" size={14} />
                          ) : (
                            <FileText size={14} />
                          )}
                          Save new version
                        </button>
                      </form>
                    ) : null}
                  </section>
                ) : null}
              </>
            ) : (
              <p className="empty-side-panel">Choose an application to view its saved memory.</p>
            )}
          </>
        )}
      </aside>
    </main>
  );
}
