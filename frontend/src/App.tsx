// frontend/src/App.tsx
import React, { useEffect, useRef, useState } from "react";
import { Client, IMessage } from "@stomp/stompjs";
import SockJS from "sockjs-client";

type ChatMessage = {
  id?: number;
  room?: string;
  sender: string;
  recipient?: string;
  content: string;
  sentAt?: string;
};

type ChatSummary = {
  otherUser: string;
  lastMessage: string;
  lastTime?: string;
  unreadCount: number;
};

// Build sidebar chat list from full message history + lastRead map
const buildChatSummaries = (
  me: string,
  msgs: ChatMessage[],
  lastRead: Record<string, string>
): ChatSummary[] => {
  // group messages by "other user"
  const grouped: Record<string, ChatMessage[]> = {};

  msgs.forEach((m) => {
    const other = m.sender === me ? m.recipient : m.sender;
    if (!other) return;

    if (!grouped[other]) grouped[other] = [];
    grouped[other].push(m);
  });

  const summaries: ChatSummary[] = Object.entries(grouped).map(
    ([other, list]) => {
      // sort list by time/id just in case
      list.sort((a, b) => {
        const t1 = new Date(a.sentAt ?? 0).getTime();
        const t2 = new Date(b.sentAt ?? 0).getTime();
        if (t1 !== t2) return t1 - t2;
        return (a.id ?? 0) - (b.id ?? 0);
      });

      const last = list[list.length - 1];
      const lastTime = last.sentAt ?? new Date().toISOString();

      const lrStr = lastRead[other];
      const lr = lrStr ? new Date(lrStr).getTime() : 0;

      // unread = messages to me after lastRead
      const unreadCount = list.filter((m) => {
        if (m.recipient !== me) return false;
        const t = new Date(m.sentAt ?? 0).getTime();
        return t > lr;
      }).length;

      return {
        otherUser: other,
        lastMessage: last.content,
        lastTime,
        unreadCount,
      };
    }
  );

  // most recent chat on top
  return summaries.sort(
    (a, b) => (b.lastTime ?? "").localeCompare(a.lastTime ?? "")
  );
};

const App: React.FC = () => {
  // -------- THEME --------
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  // -------- LOGIN STATE --------
  const [email, setEmail] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // -------- CHAT STATE --------
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatUser, setActiveChatUser] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [lastRead, setLastRead] = useState<Record<string, string>>({});

  const clientRef = useRef<Client | null>(null);
  const activeChatUserRef = useRef<string | null>(null);

  // keep ref in sync
  useEffect(() => {
    activeChatUserRef.current = activeChatUser;
  }, [activeChatUser]);

  // Load stored username (auto-login)
  useEffect(() => {
    const stored = localStorage.getItem("qt_username");
    if (stored) {
      setLoggedInUser(stored);
      setLoginName(stored);
    }
  }, []);

  // Load last-read timestamps from localStorage for this user
  useEffect(() => {
    if (!loggedInUser) return;
    const prefix = `qt_lastRead_${loggedInUser}_`;
    const map: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const other = key.substring(prefix.length);
        const value = localStorage.getItem(key);
        if (value) map[other] = value;
      }
    }
    setLastRead(map);
  }, [loggedInUser]);

  const markChatRead = (other: string) => {
    if (!loggedInUser) return;
    const now = new Date().toISOString();
    const key = `qt_lastRead_${loggedInUser}_${other}`;
    localStorage.setItem(key, now);
    setLastRead((prev) => ({ ...prev, [other]: now }));
  };

  // Load message history from backend when we know who is logged in
  useEffect(() => {
    if (!loggedInUser) return;

    const controller = new AbortController();

    const loadHistory = async () => {
      try {
        const res = await fetch(
          `http://localhost:8080/api/messages/history?user=${encodeURIComponent(
            loggedInUser
          )}`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          console.error("Failed to load history", res.status);
          return;
        }

        const data: ChatMessage[] = await res.json();
        // sort by time then id, just in case
        data.sort((a, b) => {
          const t1 = new Date(a.sentAt ?? 0).getTime();
          const t2 = new Date(b.sentAt ?? 0).getTime();
          if (t1 !== t2) return t1 - t2;
          return (a.id ?? 0) - (b.id ?? 0);
        });

        setMessages(data);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("Error loading history", e);
      }
    };

    loadHistory();
    return () => controller.abort();
  }, [loggedInUser]);

  // Whenever messages / lastRead / loggedInUser change, rebuild chat list
  useEffect(() => {
    if (!loggedInUser) return;
    setChats(buildChatSummaries(loggedInUser, messages, lastRead));
  }, [loggedInUser, messages, lastRead]);

  // Connect WebSocket AFTER login
  useEffect(() => {
    if (!loggedInUser) return;

    const socket = new SockJS("http://localhost:8080/ws-chat");
    const client = new Client({
      webSocketFactory: () => socket as any,
      debug: () => {},
      reconnectDelay: 5000,
      onConnect: () => {
        setConnected(true);

        // Subscribe to THIS user’s private topic
        client.subscribe(`/topic/user.${loggedInUser}`, (message: IMessage) => {
          const body = JSON.parse(message.body) as ChatMessage;

          setMessages((prev) => [...prev, body]);

          // If no chat selected yet, open the DM we just got
          const other =
            body.sender === loggedInUser ? body.recipient : body.sender;
          if (!activeChatUserRef.current && other) {
            setActiveChatUser(other);
            // user is looking at it now, mark read
            markChatRead(other);
          }
        });
      },
      onDisconnect: () => {
        setConnected(false);
      },
    });

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
      clientRef.current = null;
    };
  }, [loggedInUser]);

  // ---------- LOGIN HANDLER ----------
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const trimmedName = loginName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail) {
      setLoginError("Please enter both email and username.");
      return;
    }

    try {
      setLoggingIn(true);
      const res = await fetch("http://localhost:8080/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: trimmedName,
          email: trimmedEmail,
        }),
      });

      if (!res.ok) {
        setLoginError("Login failed. Check backend /api/users/login.");
        return;
      }

      setLoggedInUser(trimmedName);
      localStorage.setItem("qt_username", trimmedName);
    } catch (err) {
      console.error(err);
      setLoginError("Could not reach server.");
    } finally {
      setLoggingIn(false);
    }
  };

  // ---------- SEND MESSAGE ----------
  const sendMessage = () => {
    if (!clientRef.current || !connected) return;
    if (!input.trim() || !loggedInUser || !activeChatUser) return;

    const msg: ChatMessage = {
      sender: loggedInUser,
      recipient: activeChatUser,
      content: input.trim(),
    };

    clientRef.current.publish({
      destination: "/app/chat.sendPrivate",
      body: JSON.stringify(msg),
    });

    // you’re viewing this chat, so mark as read
    markChatRead(activeChatUser);
    setInput("");
  };

  // current conversation messages
  const relevantMessages = messages.filter((m) => {
    if (!loggedInUser || !activeChatUser) return false;
    const me = loggedInUser;
    const other = activeChatUser;
    return (
      (m.sender === me && m.recipient === other) ||
      (m.sender === other && m.recipient === me)
    );
  });

  const startNewChat = () => {
    const name = prompt("Enter username to chat with:");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === loggedInUser) return;

    // We don’t artificially add it to chats here;
    // as soon as you send the first message, it will appear via messages+WS.
    setActiveChatUser(trimmed);
  };

  // ---------- UI: LOGIN SCREEN ----------
  if (!loggedInUser) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #128C7E, #075E54)",
        }}
      >
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 16,
            padding: "2rem 2.5rem",
            width: 380,
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          }}
        >
          <h1
            style={{
              marginTop: 0,
              marginBottom: "0.5rem",
              color: "#075E54",
            }}
          >
            QuickTalk
          </h1>
          <p
            style={{ marginTop: 0, marginBottom: "1.5rem", color: "#555" }}
          >
            Sign in to start chatting with your contacts.
          </p>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 4,
                  color: "#555",
                }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  fontSize: 14,
                }}
                placeholder="you@example.com"
              />
            </div>

            <div style={{ marginBottom: "1.2rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 4,
                  color: "#555",
                }}
              >
                Username
              </label>
              <input
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  fontSize: 14,
                }}
                placeholder="This will show in chats"
              />
            </div>

            {loginError && (
              <div
                style={{
                  marginBottom: "0.8rem",
                  fontSize: 13,
                  color: "#b00020",
                }}
              >
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              style={{
                width: "100%",
                padding: "9px 0",
                borderRadius: 999,
                border: "none",
                backgroundColor: "#25D366",
                color: "white",
                fontWeight: 600,
                fontSize: 15,
                cursor: "pointer",
                opacity: loggingIn ? 0.7 : 1,
              }}
            >
              {loggingIn ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---------- UI: CHAT SCREEN ----------
  return (
    <div className="app-root">
      {/* TOP BAR */}
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-title">QuickTalk</span>
          <span className="app-status-dot" />
          <span className="app-status-text">
            {connected ? "Connected" : "Connecting..."}
          </span>
        </div>

        <div className="app-header-right">
          <span className="app-user-label">
            Logged in as {loggedInUser ?? "Unknown"}
          </span>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === "light" ? "🌙 Dark" : "☀️ Light"}
          </button>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="app-layout">
        {/* LEFT: CHATS LIST */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-title">Chats</div>
            <div className="sidebar-subtitle">
              Select a chat or start a new one
            </div>
          </div>

          <div className="sidebar-body">
            {chats.length === 0 && (
              <div className="sidebar-empty">
                No chats yet. Start a new one ✨
              </div>
            )}

            {chats.map((chat) => (
              <button
                key={chat.otherUser}
                onClick={() => {
                  setActiveChatUser(chat.otherUser);
                  markChatRead(chat.otherUser);
                }}
                className={
                  "chat-list-item" +
                  (activeChatUser === chat.otherUser
                    ? " chat-list-item--active"
                    : "")
                }
              >
                <div className="chat-list-item-name">
                  {chat.otherUser}
                </div>
                <div className="chat-list-item-last">
                  {chat.lastMessage || "No messages yet"}
                </div>
                {chat.unreadCount > 0 && (
                  <div className="chat-unread-badge">
                    {chat.unreadCount}
                  </div>
                )}
              </button>
            ))}
          </div>

          <button className="new-chat-button" onClick={startNewChat}>
            +
          </button>
        </aside>

        {/* RIGHT: CONVERSATION AREA */}
        <main className="chat-panel">
          <div className="chat-header">
            {activeChatUser ? (
              <>
                <div className="chat-header-title">
                  Chatting with {activeChatUser}
                </div>
                <div className="chat-header-sub">Direct messages</div>
              </>
            ) : (
              <>
                <div className="chat-header-title">
                  No conversation selected
                </div>
                <div className="chat-header-sub">
                  Choose a chat on the left or press + to start a new one.
                </div>
              </>
            )}
          </div>

          <div className="chat-messages">
            {!activeChatUser && (
              <div className="chat-empty-state">
                <p>No conversation selected.</p>
                <p className="chat-empty-sub">
                  Choose a chat on the left or press + to start a new one.
                </p>
              </div>
            )}

            {activeChatUser && relevantMessages.length === 0 && (
              <div className="chat-empty-state">
                <p className="chat-empty-sub">
                  No messages yet. Start by saying hi 👋
                </p>
              </div>
            )}

            {activeChatUser &&
              relevantMessages.map((m, i) => {
                const isMine = m.sender === loggedInUser;
                return (
                  <div
                    key={m.id ?? i}
                    className={
                      "chat-bubble-row " +
                      (isMine
                        ? "chat-bubble-row--me"
                        : "chat-bubble-row--them")
                    }
                  >
                    <div
                      className={
                        "chat-bubble " +
                        (isMine
                          ? "chat-bubble--me"
                          : "chat-bubble--them")
                      }
                    >
                      <div className="chat-bubble-sender">
                        {isMine ? "You" : m.sender}
                      </div>
                      <div className="chat-bubble-text">
                        {m.content}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="chat-input-row">
            <input
              className="chat-input"
              placeholder={
                activeChatUser
                  ? `Message ${activeChatUser}...`
                  : "Select a chat or start a new one"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
              disabled={!connected || !activeChatUser}
            />
            <button
              className="chat-send-button"
              onClick={sendMessage}
              disabled={!connected || !activeChatUser}
            >
              Send
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
