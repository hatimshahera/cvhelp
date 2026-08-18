"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { signOut } from "next-auth/react";
import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  Loader2,
  LogOut,
  MessageSquareText,
  Paperclip,
  PencilLine,
  Plus,
  Save,
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
  metadata?: ChatMessageMetadata | null;
};

type ChatMode = "build_profile" | "application" | "general";
type ProfileWorkspaceView = "chat" | "profile";

type ChatAction =
  | {
      type: "open_application_chat";
      label: string;
      applicationId: string;
    }
  | {
      type: "continue_in_profile_chat";
      label: string;
      conversationId?: string | null;
    };

type ChatMessageMetadata = {
  actions?: ChatAction[];
};

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

type ConversationItem = {
  id: string;
  title: string;
  mode: string;
  applicationId: string | null;
  createdAt: string;
  updatedAt: string;
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
  jobPost?: {
    source?: string;
    sourceUrl?: string | null;
    content?: string;
    capturedAt?: string;
  } | null;
  jobSummary?: {
    requirements?: string[];
    responsibilities?: string[];
    keywords?: string[];
  } | null;
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

type WorkspaceFile =
  | { kind: "empty"; label: string }
  | { kind: "job_post"; label: string }
  | { kind: "cv_preview"; label: string; artifactId: string }
  | { kind: "artifact"; label: string; artifactId: string };

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

function getCvPreviewArtifact(artifacts: ArtifactItem[] = []) {
  return (
    artifacts.find((artifact) => artifact.type === "cv_pdf") ??
    artifacts.find((artifact) => artifact.type === "cv_draft") ??
    null
  );
}

function artifactFileLabel(artifact: ArtifactItem) {
  const baseTitle = artifact.title?.trim() || `${formatLabel(artifact.type)} v${artifact.version}`;
  return `${baseTitle}.json`;
}

function buildWorkspaceFiles(application: ApplicationDetail | null): WorkspaceFile[] {
  if (!application) return [];

  const cvPreviewArtifact = getCvPreviewArtifact(application.artifacts);

  return [
    ...(cvPreviewArtifact
      ? [
          {
            kind: "cv_preview" as const,
            label: "CV preview.pdf",
            artifactId: cvPreviewArtifact.id
          }
        ]
      : []),
    ...(application.jobPost?.content ? [{ kind: "job_post" as const, label: "Job post.txt" }] : []),
    ...application.artifacts
      .filter((artifact) => artifact.type !== "cv_pdf")
      .map((artifact) => ({
        kind: "artifact" as const,
        label: artifactFileLabel(artifact),
        artifactId: artifact.id
      }))
  ];
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

function shouldGenerateCvDraftArtifact(message: string) {
  const normalized = message.toLowerCase();
  return /\b(generate|create|make|draft|build)\b/.test(normalized) && /\bcv\b/.test(normalized);
}

export function AppShell({
  userName,
  userEmail
}: {
  userName: string;
  userEmail: string;
}) {
  const [activeMode, setActiveMode] = useState<ChatMode>("general");
  const [profileView, setProfileView] = useState<ProfileWorkspaceView>("chat");
  const [isGeneralChatsOpen, setIsGeneralChatsOpen] = useState(true);
  const [isApplicationsOpen, setIsApplicationsOpen] = useState(true);
  const [isArchivedApplicationsOpen, setIsArchivedApplicationsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeApplicationId, setActiveApplicationId] = useState<string | null>(null);
  const [expandedApplicationId, setExpandedApplicationId] = useState<string | null>(null);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(true);
  const [sidePanelWidth, setSidePanelWidth] = useState(400);
  const [isResizingSidePanel, setIsResizingSidePanel] = useState(false);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [generalConversations, setGeneralConversations] = useState<ConversationItem[]>([]);
  const [isNewGeneralChat, setIsNewGeneralChat] = useState(false);
  const [applicationDetail, setApplicationDetail] = useState<ApplicationDetail | null>(null);
  const [isLoadingApplicationDetail, setIsLoadingApplicationDetail] = useState(false);
  const [selectedWorkspaceFile, setSelectedWorkspaceFile] = useState<WorkspaceFile>({ kind: "empty", label: "Workspace" });
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
  const activeTitle =
    activeMode === "general"
      ? "General"
      : activeMode === "build_profile"
      ? profileView === "profile"
        ? "Profile"
        : "Build profile"
      : activeApplication
        ? `${activeApplication.company} - ${activeApplication.role}`
        : "Applications";
  const activeDescription =
    activeMode === "general"
      ? "Create applications, compare roles, and route profile changes"
      : activeMode === "build_profile"
      ? profileView === "profile"
        ? "Review and edit your saved profile sections."
        : "Add CV, LinkedIn, GitHub, projects, evidence."
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

  async function loadGeneralConversations() {
    try {
      const response = await fetch("/api/chat?mode=general", { cache: "no-store" });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not load General Chat threads.");
      }

      setGeneralConversations(data.conversations ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load General Chat threads.");
    }
  }

  useEffect(() => {
    loadApplications();
    loadGeneralConversations();
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
    try {
      const response = await fetch(`/api/applications/${applicationId}`, { cache: "no-store" });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not load application details.");
      }

      setApplicationDetail(data.application);
      setSelectedWorkspaceFile((current) => {
        const files = buildWorkspaceFiles(data.application);
        const firstFile = files[0] ?? { kind: "empty" as const, label: "Workspace" };
        if (current.kind === "empty") return firstFile;
        if (current.kind === "job_post") return files.some((file) => file.kind === "job_post") ? current : firstFile;
        return files.some(
          (file) =>
            file.kind === current.kind &&
            (file.kind === "artifact" || file.kind === "cv_preview") &&
            file.artifactId === current.artifactId
        )
          ? current
          : firstFile;
      });
    } catch (applicationError) {
      setError(applicationError instanceof Error ? applicationError.message : "Could not load application details.");
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
        if (activeMode === "general" && isNewGeneralChat) {
          if (isMounted && loadRequestRef.current === requestId) {
            setConversationId(null);
            setMessages([]);
            setIsLoadingHistory(false);
          }
          return;
        }

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
        if (conversationId && activeMode !== "application") params.set("conversationId", conversationId);
        const response = await fetch(`/api/chat?${params.toString()}`, { cache: "no-store" });
        const data = await readJsonResponse(response);

        if (!response.ok) {
          throw new Error(data.error || "Could not load the chat.");
        }

        if (isMounted && loadRequestRef.current === requestId) {
          setConversationId(data.conversationId);
          setMessages(data.messages);
          if (activeMode === "general") {
            setGeneralConversations(data.conversations ?? []);
          }
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
  }, [activeMode, activeApplicationId, conversationId, isNewGeneralChat]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, isSending]);

  useEffect(() => {
    if (!isResizingSidePanel) return;

    function handlePointerMove(event: PointerEvent) {
      const nextWidth = window.innerWidth - event.clientX;
      setSidePanelWidth(Math.min(620, Math.max(320, nextWidth)));
    }

    function handlePointerUp() {
      setIsResizingSidePanel(false);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingSidePanel]);

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
      let sourceIds: string[] = [];

      if (filesToUpload.length) {
        const formData = new FormData();
        filesToUpload.forEach((file) => formData.append("files", file));
        formData.append("mode", activeMode);
        if (activeApplicationId) formData.append("applicationId", activeApplicationId);

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
        sourceIds = Array.isArray(uploadData.uploaded)
          ? uploadData.uploaded
              .map((file: { sourceId?: unknown }) => file.sourceId)
              .filter((sourceId: unknown): sourceId is string => typeof sourceId === "string")
          : [];
      }

      const finalMessage =
        trimmed ||
        (activeMode === "application"
          ? "I uploaded files for this application. Please review what you can use and tell me what else you need."
          : activeMode === "general"
            ? "I uploaded files. Please review what you can use and tell me what else you need."
            : "I uploaded files to my profile bank. Please review what you can use and tell me what else you need.");

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: finalMessage,
          newConversation: activeMode === "general" && isNewGeneralChat,
          mode: activeMode,
          applicationId: activeApplicationId,
          sourceIds
        })
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "The message could not be sent.");
      }

      setConversationId(data.conversationId);
      if (activeMode === "general") {
        setIsNewGeneralChat(false);
        await loadGeneralConversations();
      }
      setProfileBank(data.profileBank ?? profileBank);
      setMessages(data.messages ?? []);
      if (activeMode === "build_profile") {
        await loadProfileDetails();
      } else if (activeMode === "application" && activeApplicationId) {
        await loadApplicationDetail(activeApplicationId);
        if (shouldGenerateCvDraftArtifact(finalMessage)) {
          const artifactResponse = await fetch(`/api/applications/${activeApplicationId}/artifacts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "cv_draft",
              prompt: finalMessage
            })
          });
          const artifactData = await readJsonResponse(artifactResponse);

          if (!artifactResponse.ok) {
            throw new Error(artifactData.error || "Could not generate the CV draft.");
          }

          await loadApplicationDetail(activeApplicationId);
          setSelectedWorkspaceFile({
            kind: "cv_preview",
            label: "CV preview.pdf",
            artifactId: artifactData.artifact.id
          });
          setIsSidePanelOpen(true);
          setExpandedApplicationId(activeApplicationId);
        }
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

  const selectedArtifact =
    selectedWorkspaceFile.kind === "artifact" || selectedWorkspaceFile.kind === "cv_preview"
      ? applicationDetail?.artifacts.find((artifact) => artifact.id === selectedWorkspaceFile.artifactId) ?? null
      : null;
  const workspaceFiles = activeApplication ? buildWorkspaceFiles(applicationDetail) : [];

  const shellClassName = [
    "workspace-shell",
    isResizingSidePanel ? "side-panel-resizing" : "",
    activeMode === "application" && isSidePanelOpen ? "" : "side-panel-collapsed",
    activeMode === "build_profile" ? "profile-workspace" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const shellStyle = {
    "--workspace-side-panel-width": `${sidePanelWidth}px`
  } as CSSProperties;
  const isProfileEditorActive = activeMode === "build_profile" && profileView === "profile";

  function openProfileChat() {
    setActiveMode("build_profile");
    setProfileView("chat");
    setIsNewGeneralChat(false);
    setActiveApplicationId(null);
    setExpandedApplicationId(null);
    setConversationId(null);
    setMessages([]);
    setMessage("");
    setSelectedFiles([]);
  }

  function openGeneralChat() {
    setActiveMode("general");
    setProfileView("chat");
    setIsNewGeneralChat(false);
    setActiveApplicationId(null);
    setExpandedApplicationId(null);
    setConversationId(null);
    setMessages([]);
    setMessage("");
    setSelectedFiles([]);
  }

  function openNewGeneralChat() {
    setActiveMode("general");
    setProfileView("chat");
    setIsNewGeneralChat(true);
    setActiveApplicationId(null);
    setExpandedApplicationId(null);
    setConversationId(null);
    setMessages([]);
    setMessage("");
    setSelectedFiles([]);
  }

  function openGeneralConversation(nextConversationId: string) {
    setActiveMode("general");
    setProfileView("chat");
    setIsNewGeneralChat(false);
    setActiveApplicationId(null);
    setExpandedApplicationId(null);
    setConversationId(nextConversationId);
    setMessages([]);
    setMessage("");
    setSelectedFiles([]);
  }

  function openProfileEditor() {
    setActiveMode("build_profile");
    setProfileView("profile");
    setIsNewGeneralChat(false);
    setActiveApplicationId(null);
    setExpandedApplicationId(null);
    setConversationId(null);
    setMessages([]);
    setMessage("");
    setSelectedFiles([]);
  }

  async function handleChatAction(action: ChatAction) {
    if (action.type === "open_application_chat") {
      await loadApplications();
      setActiveMode("application");
      setProfileView("chat");
      setIsNewGeneralChat(false);
      setActiveApplicationId(action.applicationId);
      setExpandedApplicationId(action.applicationId);
      setSelectedWorkspaceFile({ kind: "empty", label: "Workspace" });
      setIsSidePanelOpen(true);
      setConversationId(null);
      setMessages([]);
      setMessage("");
      setSelectedFiles([]);
      return;
    }

    setActiveMode("build_profile");
    setProfileView("chat");
    setIsNewGeneralChat(false);
    setActiveApplicationId(null);
    setExpandedApplicationId(null);
    setConversationId(action.conversationId ?? null);
    setMessages([]);
    setMessage("");
    setSelectedFiles([]);
  }

  function renderProfileEditor() {
    return (
      <div className="profile-main-view">
        {profileBank ? (
          <section className="profile-bank-panel profile-bank-summary" aria-label="Profile bank status">
            <div className="profile-bank-title">
              <Database size={17} />
              <strong>Profile bank</strong>
            </div>
            <div className="profile-bank-metrics">
              <span>
                <strong>{profileBank.sourceCount}</strong>
                sources
              </span>
              <span>
                <strong>
                  {profileBank.intake.completedCount}/{profileBank.intake.totalCount}
                </strong>
                {profileBank.intake.complete ? "intake done" : "intake"}
              </span>
              <span>
                <strong>{profileBank.completeness}%</strong>
                complete
              </span>
            </div>
            <p>{profileBank.intake.nextPrompt}</p>
            <div className="profile-completeness" aria-label="Profile completeness">
              <progress value={profileBank.completeness} max={100} />
            </div>
            {profileBank.sections.length ? (
              <div className="profile-sections">
                {profileBank.sections.slice(0, 6).map((section) => (
                  <span key={section}>{section}</span>
                ))}
              </div>
            ) : null}
            {profileBank.missingSections.length ? (
              <p className="profile-missing">
                Missing: {profileBank.missingSections.slice(0, 3).join(", ")}
              </p>
            ) : null}
          </section>
        ) : null}

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
      </div>
    );
  }

  return (
    <main className={shellClassName} style={shellStyle}>
      <aside className="settings-rail">
        <div>
          <p className="brand">CVhelp</p>
        </div>

        <nav className="rail-nav" aria-label="Workspace navigation">
          <button
            className={activeMode === "general" ? "active nav-section-toggle" : "nav-section-toggle"}
            type="button"
            onClick={() => {
              if (activeMode !== "general") {
                openGeneralChat();
                setIsGeneralChatsOpen(true);
                return;
              }
              setIsGeneralChatsOpen((current) => !current);
            }}
            aria-expanded={isGeneralChatsOpen}
          >
            <MessageSquareText size={18} />
            <span>
              <strong>General Chat</strong>
              <small>{generalConversations.length} chats</small>
            </span>
            {isGeneralChatsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {isGeneralChatsOpen ? (
            <div className="nav-subitems general-thread-list" aria-label="General Chat threads">
              <button className={isNewGeneralChat ? "active nav-subitem" : "nav-subitem"} type="button" onClick={openNewGeneralChat}>
                <Plus size={15} />
                New chat
              </button>
              {generalConversations.map((conversation) => (
                <button
                  className={
                    activeMode === "general" && !isNewGeneralChat && conversationId === conversation.id
                      ? "active nav-subitem"
                      : "nav-subitem"
                  }
                  key={conversation.id}
                  type="button"
                  onClick={() => openGeneralConversation(conversation.id)}
                  title={conversation.title}
                >
                  <MessageSquareText size={15} />
                  {conversation.title}
                </button>
              ))}
            </div>
          ) : null}

          <button
            className="nav-section-toggle"
            type="button"
            onClick={() => setIsApplicationsOpen((current) => !current)}
            aria-expanded={isApplicationsOpen}
          >
            <BriefcaseBusiness size={18} />
            <span>
              <strong>Applications</strong>
              <small>{applications.length} saved jobs</small>
            </span>
            {isApplicationsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {isApplicationsOpen ? (
            <div className="applications-list" aria-label="Applications">
              {activeApplications.length ? (
                activeApplications.map((application) => {
                const isActive = activeMode === "application" && activeApplicationId === application.id;

                return (
                  <div className={`application-tree-item ${isActive ? "active" : ""}`} key={application.id}>
                    <button
                      className="application-folder-button"
                      type="button"
                      onClick={() => {
                        setActiveMode("application");
                        setProfileView("chat");
                        setIsNewGeneralChat(false);
                        setActiveApplicationId(application.id);
                        setExpandedApplicationId(null);
                        setSelectedWorkspaceFile({ kind: "empty", label: "Workspace" });
                        setIsSidePanelOpen(true);
                        setConversationId(null);
                        setMessages([]);
                        setMessage("");
                        setSelectedFiles([]);
                      }}
                    >
                      <BriefcaseBusiness size={15} />
                      <span>
                        <strong>{application.company}</strong>
                        <small>{application.role}</small>
                      </span>
                    </button>
                  </div>
                );
              })
            ) : (
                <p>No active applications.</p>
              )}

              <div className="application-tree-item archived-group">
                <button
                  className="application-folder-button"
                  type="button"
                  onClick={() => setIsArchivedApplicationsOpen((current) => !current)}
                  aria-expanded={isArchivedApplicationsOpen}
                >
                  {isArchivedApplicationsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <span>
                    <strong>Archived</strong>
                    <small>{archivedApplications.length} applications</small>
                  </span>
                </button>
                {isArchivedApplicationsOpen ? (
                  <div className="archived-application-list">
                    {archivedApplications.length ? (
                      archivedApplications.map((application) => {
                        const isActive = activeMode === "application" && activeApplicationId === application.id;

                        return (
                          <button
                            className={isActive ? "active archived-application-button" : "archived-application-button"}
                            key={application.id}
                            type="button"
                            onClick={() => {
                              setActiveMode("application");
                              setProfileView("chat");
                              setIsNewGeneralChat(false);
                              setActiveApplicationId(application.id);
                              setExpandedApplicationId(null);
                              setSelectedWorkspaceFile({ kind: "empty", label: "Workspace" });
                              setIsSidePanelOpen(true);
                              setConversationId(null);
                              setMessages([]);
                              setMessage("");
                              setSelectedFiles([]);
                            }}
                          >
                            <BriefcaseBusiness size={14} />
                            <span>
                              <strong>{application.company}</strong>
                              <small>{application.role}</small>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <p>No archived applications.</p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <button
            className={activeMode === "build_profile" ? "active nav-section-toggle" : "nav-section-toggle"}
            type="button"
            onClick={openProfileChat}
          >
            <UserRound size={18} />
            <span>
              <strong>Profile Builder</strong>
              <small>Profile facts and preferences</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </nav>

        <section className="settings-menu" aria-label="Account menu">
          <button
            className="user-tile"
            type="button"
            onClick={() => setIsSettingsOpen((current) => !current)}
            aria-expanded={isSettingsOpen}
          >
            <UserRound size={18} />
            <div>
              <strong>{userName}</strong>
              <span>{userEmail}</span>
            </div>
            {isSettingsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {isSettingsOpen ? (
            <div className="settings-actions">
              <Link className="account-link" href="/app/account">
                <Settings size={16} />
                Account settings
              </Link>
              <button
                className="logout-button"
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                <LogOut size={18} />
                Logout
              </button>
            </div>
          ) : null}
        </section>
      </aside>

      <section className="chat-area">
        <header className="chat-header">
          <div className="chat-header-main">
            <p className="eyebrow">Workspace</p>
            <h1>{activeTitle}</h1>
            <p>{activeDescription}</p>
            {activeMode === "application" ? (
              <div className="workspace-context" aria-label="Workspace status">
                <>
                  <span>
                    <strong>{activeApplication?.company ?? "No company"}</strong>
                    Company
                  </span>
                  <span>
                    <strong>{applicationDetail?.artifacts.length ?? 0}</strong>
                    Artifacts
                  </span>
                  <span>
                    <strong>{workspaceFiles.length}</strong>
                    Files
                  </span>
                </>
              </div>
            ) : null}
          </div>
          <div className="chat-header-actions">
            {activeMode === "build_profile" ? (
              <button
                className="clear-conversation-button"
                type="button"
                onClick={profileView === "profile" ? openProfileChat : openProfileEditor}
                disabled={isSending || isLoadingHistory}
              >
                {profileView === "profile" ? <MessageSquareText size={16} /> : <Database size={16} />}
                {profileView === "profile" ? "Profile chat" : "Profile data"}
              </button>
            ) : null}
            {activeMode === "build_profile" && profileView === "chat" ? (
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
            {activeMode === "application" ? (
              <button
                className="panel-toggle-button"
                type="button"
                onClick={() => setIsSidePanelOpen((current) => !current)}
                aria-label={isSidePanelOpen ? "Hide side panel" : "Show side panel"}
              >
                {isSidePanelOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
            ) : null}
          </div>
        </header>

        {isProfileEditorActive ? (
          renderProfileEditor()
        ) : (
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
                {item.role === "assistant" && item.metadata?.actions?.length ? (
                  <div className="message-actions" aria-label="Suggested actions">
                    {item.metadata.actions.map((action, actionIndex) => (
                      <button
                        key={`${action.type}-${action.label}-${actionIndex}`}
                        type="button"
                        title={action.label}
                        aria-label={action.label}
                        onClick={() => handleChatAction(action)}
                        disabled={isSending || isLoadingHistory}
                      >
                        {action.type === "open_application_chat" ? (
                          <BriefcaseBusiness size={15} />
                        ) : (
                          <UserRound size={15} />
                        )}
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="empty-state">
              {activeMode === "general"
                ? "Paste a job description, compare saved applications, or ask a broader career question."
                : activeMode === "build_profile"
                ? "Start by pasting your CV, LinkedIn summary, GitHub/project list, or tell me what you want added to your profile."
                : activeApplication
                  ? "Ask about this role, tailor your CV, draft a cover letter, or paste application questions."
                  : "Use General Chat to create an application from a job description or URL."}
            </div>
          )}
          {isSending ? (
            <article className="message assistant pending">
              <Loader2 className="spin" size={16} />
              <p>Thinking...</p>
            </article>
          ) : null}
        </div>
        )}

        {error ? <p className="chat-error">{error}</p> : null}

        {!isProfileEditorActive ? (
        <form className="composer" onSubmit={sendMessage}>
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
                activeMode === "general"
                  ? "Paste a job, ask about applications, or route a profile update..."
                  : activeMode === "build_profile"
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
        ) : null}
      </section>

      {activeMode === "application" ? (
      <>
      {isSidePanelOpen ? (
        <div
          className="side-panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize application file panel"
          aria-valuemin={320}
          aria-valuemax={620}
          aria-valuenow={sidePanelWidth}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault();
            setIsResizingSidePanel(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setSidePanelWidth((current) => Math.min(620, current + 24));
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              setSidePanelWidth((current) => Math.max(320, current - 24));
            }
          }}
        />
      ) : null}
      <aside className="memory-side-panel" aria-label="Application files">
          <>
            <div className="side-panel-heading">
              <div>
                <p className="eyebrow">Application</p>
                <div className="side-panel-title-row">
                  <h2>{selectedWorkspaceFile.label}</h2>
                </div>
              </div>
              <button
                className="panel-toggle-button"
                type="button"
                onClick={() => setIsSidePanelOpen(false)}
                aria-label="Hide side panel"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {activeApplication ? (
              <>
                {isLoadingApplicationDetail ? (
                  <div className="empty-side-panel">
                    <Loader2 className="spin" size={16} />
                    Loading application...
                  </div>
                ) : null}

                {selectedWorkspaceFile.kind === "empty" ? (
                  <p className="empty-side-panel">
                    {workspaceFiles.length ? "Choose a file from this application." : "No saved files yet."}
                  </p>
                ) : null}

                {selectedWorkspaceFile.kind === "job_post" ? (
                  <section className="workspace-file-viewer" aria-label="Job post">
                    <pre>{applicationDetail?.jobPost?.content || "No job post saved."}</pre>
                  </section>
                ) : null}

                {selectedWorkspaceFile.kind === "cv_preview" ? (
                  <section className="pdf-preview-workspace" aria-label="CV PDF preview">
                    {activeApplication && selectedArtifact ? (
                      <iframe
                        title={`${activeApplication.company} ${activeApplication.role} CV preview`}
                        src={`/api/applications/${activeApplication.id}/artifacts/${selectedArtifact.id}/pdf#toolbar=1&navpanes=0`}
                      />
                    ) : (
                      <p>No CV artifact is saved for this application yet.</p>
                    )}
                  </section>
                ) : null}

                {selectedWorkspaceFile.kind === "artifact" ? (
                  <section className="workspace-file-viewer" aria-label="Selected artifact">
                    <p>{selectedArtifact ? summarizeArtifactContent(selectedArtifact.content) || "Saved artifact data." : "Artifact not found."}</p>
                    {selectedArtifact?.content ? (
                      <pre>{JSON.stringify(selectedArtifact.content, null, 2)}</pre>
                    ) : null}
                  </section>
                ) : null}
              </>
            ) : (
              <p className="empty-side-panel">Choose an application to view its saved memory.</p>
            )}
          </>
      </aside>
      </>
      ) : null}
    </main>
  );
}
