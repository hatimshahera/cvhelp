"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, MessageSquare, Send, Settings, UserRound } from "lucide-react";

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
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Paste your first job link or job description here when the chat backend is connected."
    }
  ]);

  function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content: trimmed },
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "Auth is ready. The chat API can be connected here next."
      }
    ]);
    setMessage("");
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

        <div className="message-list">
          {messages.map((item, index) => (
            <article className={`message ${item.role}`} key={item.id ?? `${item.role}-${index}`}>
              <p>{item.content}</p>
            </article>
          ))}
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask CVhelp..."
          />
          <button type="submit" disabled={!message.trim()}>
            <Send size={18} />
            Send
          </button>
        </form>
      </section>
    </main>
  );
}
