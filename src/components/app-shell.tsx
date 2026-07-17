"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Loader2, LogOut, MessageSquare, Send, Settings, UserRound } from "lucide-react";

type Message = {
  id?: string;
  role: "assistant" | "user";
  content: string;
};

export function AppShell({
  userName,
  userEmail
}: {
  userName: string;
  userEmail: string;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadConversation() {
      try {
        const response = await fetch("/api/chat", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Could not load the chat.");
        }

        if (isMounted) {
          setConversationId(data.conversationId);
          setMessages(data.messages);
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
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, isSending]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || isSending) return;

    const optimisticMessage: Message = {
      id: `pending-${Date.now()}`,
      role: "user",
      content: trimmed
    };

    setError("");
    setMessages((current) => [...current, optimisticMessage]);
    setMessage("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: trimmed
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "The message could not be sent.");
      }

      setConversationId(data.conversationId);
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimisticMessage.id),
        ...data.messages
      ]);
    } catch (sendError) {
      setMessages((current) => current.filter((item) => item.id !== optimisticMessage.id));
      setMessage(trimmed);
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
          <button className="active" type="button">
            <MessageSquare size={18} />
            Chat
          </button>
          <button type="button">
            <Settings size={18} />
            Settings
          </button>
        </nav>

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
          <h1>Chat</h1>
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
              Paste a job description, ask for CV help, or start with the role you are targeting.
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
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask CVhelp..."
            disabled={isSending || isLoadingHistory}
          />
          <button type="submit" disabled={isSending || isLoadingHistory || !message.trim()}>
            {isSending ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            Send
          </button>
        </form>
      </section>
    </main>
  );
}
