"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  Database,
  Loader2,
  LogOut,
  Paperclip,
  Send,
  X,
  UserRound
} from "lucide-react";

type Message = {
  id?: string;
  role: "assistant" | "user";
  content: string;
};

type ChatMode = "build_profile" | "general";

type ProfileBankSummary = {
  sourceCount: number;
  checklist: Array<{ id: string; label: string; done: boolean }>;
  hasMasterProfile: boolean;
  sections: string[];
};

const modes: Array<{
  id: ChatMode;
  label: string;
  description: string;
  icon: typeof UserRound;
}> = [
  {
    id: "build_profile",
    label: "Build profile",
    description: "Add CV, LinkedIn, GitHub, projects, evidence",
    icon: UserRound
  },
  {
    id: "general",
    label: "Application chat",
    description: "General CV and job application help",
    icon: BriefcaseBusiness
  }
];

export function AppShell({
  userName,
  userEmail
}: {
  userName: string;
  userEmail: string;
}) {
  const [activeMode, setActiveMode] = useState<ChatMode>("build_profile");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [profileBank, setProfileBank] = useState<ProfileBankSummary | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeModeConfig = modes.find((mode) => mode.id === activeMode) ?? modes[0];

  useEffect(() => {
    let isMounted = true;

    async function loadConversation() {
      setIsLoadingHistory(true);
      setError("");
      try {
        const response = await fetch(`/api/chat?mode=${activeMode}`, { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Could not load the chat.");
        }

        if (isMounted) {
          setConversationId(data.conversationId);
          setMessages(data.messages);
          setProfileBank(data.profileBank ?? null);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load the chat.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingHistory(false);
        }
      }
    }

    loadConversation();

    return () => {
      isMounted = false;
    };
  }, [activeMode]);

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
        const uploadData = await uploadResponse.json();

        if (!uploadResponse.ok) {
          throw new Error(uploadData.error || "The files could not be uploaded.");
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
          mode: activeMode
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "The message could not be sent.");
      }

      setConversationId(data.conversationId);
      setProfileBank(data.profileBank ?? profileBank);
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimisticMessage.id),
        ...data.messages
      ]);
    } catch (sendError) {
      setMessages((current) => current.filter((item) => item.id !== optimisticMessage.id));
      setMessage(trimmed);
      setSelectedFiles(filesToUpload);
      setError(sendError instanceof Error ? sendError.message : "The message could not be sent.");
    } finally {
      setIsSending(false);
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
          {modes.map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                className={activeMode === mode.id ? "active" : ""}
                type="button"
                key={mode.id}
                onClick={() => {
                  setActiveMode(mode.id);
                  setConversationId(null);
                  setMessages([]);
                  setMessage("");
                  setSelectedFiles([]);
                }}
              >
                <Icon size={18} />
                <span>
                  <strong>{mode.label}</strong>
                  <small>{mode.description}</small>
                </span>
              </button>
            );
          })}
        </nav>

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
          <p className="eyebrow">Workspace</p>
          <h1>{activeModeConfig.label}</h1>
          <p>{activeModeConfig.description}</p>
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
                : "Paste a job description, ask for CV help, or start with the role you are targeting."}
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
                  : "Ask CVhelp..."
              }
              disabled={isSending || isLoadingHistory}
            />
          </div>
          <button
            type="submit"
            disabled={isSending || isLoadingHistory || (!message.trim() && !selectedFiles.length)}
          >
            {isSending ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            Send
          </button>
        </form>
      </section>
    </main>
  );
}
