"use client";

import { useState } from "react";
import { SignOutButton } from "@clerk/nextjs";
import { LogOut, MessageSquare, Settings, UserRound } from "lucide-react";

type Message = {
  role: "assistant" | "user";
  text: string;
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
      text: "You are signed in. Paste a job description, ask for help with a CV, or tell me what you want to build next."
    }
  ]);

  function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    setMessages((current) => [
      ...current,
      { role: "user", text: trimmed },
      {
        role: "assistant",
        text: "Got it. The next backend step will connect this chat to profile setup and CV generation."
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

        <SignOutButton>
          <button className="logout-button" type="button">
            <LogOut size={18} />
            Logout
          </button>
        </SignOutButton>
      </aside>

      <section className="chat-area">
        <header className="chat-header">
          <p className="eyebrow">Workspace</p>
          <h1>Chat</h1>
        </header>

        <div className="message-list">
          {messages.map((item, index) => (
            <article className={`message ${item.role}`} key={`${item.role}-${index}`}>
              <p>{item.text}</p>
            </article>
          ))}
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Type here..."
          />
          <button type="submit">Send</button>
        </form>
      </section>
    </main>
  );
}
