"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  Database,
  FilePlus2,
  Loader2,
  LogOut,
  Paperclip,
  Send,
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
  hasMasterProfile: boolean;
  sections: string[];
};

type ApplicationItem = {
  id: string;
  company: string;
  role: string;
  slug: string;
  status: string;
};

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
  const [isAddingApplication, setIsAddingApplication] = useState(false);
  const [jobSource, setJobSource] = useState("");
  const [isCreatingApplication, setIsCreatingApplication] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [profileBank, setProfileBank] = useState<ProfileBankSummary | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isClearingConversation, setIsClearingConversation] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadRequestRef = useRef(0);
  const activeApplication = applications.find((item) => item.id === activeApplicationId) ?? null;
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
            <BriefcaseBusiness size={17} />
            <strong>Applications</strong>
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

          <div className="applications-list">
            {applications.length ? (
              applications.map((application) => (
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
                  <strong>{application.company}</strong>
                  <span>{application.role}</span>
                </button>
              ))
            ) : (
              <p>No applications yet.</p>
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
                <p>{item.content}</p>
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
    </main>
  );
}
