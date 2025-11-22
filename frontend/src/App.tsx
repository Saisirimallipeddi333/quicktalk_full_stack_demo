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

const formatTime = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDate = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const dateKey = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};


// Build sidebar chat list from full message history + lastRead map
const buildChatSummaries = (
  me: string,
  msgs: ChatMessage[],
  lastRead: Record<string, string>
): ChatSummary[] => {
  const grouped: Record<string, ChatMessage[]> = {};

  msgs.forEach((m) => {
    const other = m.sender === me ? m.recipient : m.sender;
    if (!other) return;
    if (!grouped[other]) grouped[other] = [];
    grouped[other].push(m);
  });

  const summaries: ChatSummary[] = Object.entries(grouped).map(
    ([other, list]) => {
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

  // -------- AUTH MODE (login vs signup) --------
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [signupStep, setSignupStep] = useState<"FORM" | "VERIFY_EMAIL">("FORM");

  // -------- LOGIN STATE --------
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginName, setLoginName] = useState(""); // will be set from backend username
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginInfo, setLoginInfo] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // -------- SIGNUP STATE --------
  const [signupEmail, setSignupEmail] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupGender, setSignupGender] = useState("");
  const [signupDob, setSignupDob] = useState(""); // YYYY-MM-DD
  const [signupCountry, setSignupCountry] = useState("");
  const [signupOtp, setSignupOtp] = useState("");
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signingUp, setSigningUp] = useState(false);

  // -------- CHAT STATE --------
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatUser, setActiveChatUser] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [lastRead, setLastRead] = useState<Record<string, string>>({});
  
    // -------- EMOJI PICKER --------
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const commonEmojis = ["😀", "😂", "😍", "😎", "👍", "🙏", "🎉", "❤️"];

  const addEmoji = (emoji: string) => {
    setInput((prev) => prev + emoji);
  };


  const clientRef = useRef<Client | null>(null);
  const activeChatUserRef = useRef<string | null>(null);

  // keep ref in sync
  useEffect(() => {
    activeChatUserRef.current = activeChatUser;
  }, [activeChatUser]);

  // Load stored username (auto-login by username only for now)
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

        client.subscribe(`/topic/user.${loggedInUser}`, (message: IMessage) => {
          const body = JSON.parse(message.body) as ChatMessage;

          setMessages((prev) => [...prev, body]);

          const other =
            body.sender === loggedInUser ? body.recipient : body.sender;
          if (!activeChatUserRef.current && other) {
            setActiveChatUser(other);
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

  // ---------- LOGIN HANDLER (email + password) ----------
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginInfo(null);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setLoginError("Please enter both email and password.");
      return;
    }

    try {
      setLoggingIn(true);
      const res = await fetch("http://localhost:8080/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          password: trimmedPassword,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        setLoginError(text || "Login failed.");
        return;
      }

      const data = (await res.json()) as { username: string };

      setLoggedInUser(data.username);
      setLoginName(data.username);
      localStorage.setItem("qt_username", data.username);
      setPassword("");
    } catch (err) {
      console.error(err);
      setLoginError("Could not reach server.");
    } finally {
      setLoggingIn(false);
    }
  };

  // ---------- SIGNUP HANDLERS ----------
  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);

    const emailTrim = signupEmail.trim();
    const usernameTrim = signupUsername.trim();
    const pwdTrim = signupPassword.trim();
    const confirmTrim = signupConfirmPassword.trim();

    if (!emailTrim || !usernameTrim || !pwdTrim || !confirmTrim) {
      setSignupError("Email, username and password are required.");
      return;
    }
    if (pwdTrim !== confirmTrim) {
      setSignupError("Passwords do not match.");
      return;
    }

    try {
      setSigningUp(true);
      const res = await fetch("http://localhost:8080/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailTrim,
          username: usernameTrim,
          firstName: signupFirstName.trim(),
          lastName: signupLastName.trim(),
          password: pwdTrim,
          confirmPassword: confirmTrim,
          gender: signupGender.trim(),
          dateOfBirth: signupDob || null,
          countryOfOrigin: signupCountry.trim(),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        setSignupError(text || "Registration failed.");
        return;
      }

      // Move to OTP step
      setSignupStep("VERIFY_EMAIL");
    } catch (err) {
      console.error(err);
      setSignupError("Could not reach server.");
    } finally {
      setSigningUp(false);
    }
  };

  const handleSignupVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);

    const emailTrim = signupEmail.trim();
    const otpTrim = signupOtp.trim();

    if (!emailTrim || !otpTrim) {
      setSignupError("Email and OTP are required.");
      return;
    }

    try {
      setSigningUp(true);
      const res = await fetch("http://localhost:8080/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailTrim,
          otp: otpTrim,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        setSignupError(text || "Email verification failed.");
        return;
      }

      // After successful verification, switch back to login tab
      setAuthMode("login");
      setSignupStep("FORM");
      setSignupOtp("");
      setSignupError(null);

      // Pre-fill login email so user can log in
      setEmail(emailTrim);
      setLoginError(null);
      setLoginInfo("User created, please login.");
    } catch (err) {
      console.error(err);
      setSignupError("Could not reach server.");
    } finally {
      setSigningUp(false);
    }
  };

  // ---------- LOGOUT ----------
  const handleLogout = () => {
    if (clientRef.current) {
      try {
        clientRef.current.deactivate();
      } catch (e) {
        console.error("Error during WebSocket disconnect", e);
      } finally {
        clientRef.current = null;
      }
    }

    localStorage.removeItem("qt_username");

    setConnected(false);
    setMessages([]);
    setChats([]);
    setActiveChatUser(null);
    setInput("");
    setLastRead({});
    setLoginError(null);

    setLoggedInUser(null);
    setLoginName("");
    setEmail("");
    setPassword("");
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

    markChatRead(activeChatUser);
    setInput("");
  };
    const handleSendLocation = () => {
    if (!clientRef.current || !connected) return;
    if (!loggedInUser || !activeChatUser) return;

    if (!navigator.geolocation) {
      alert("Location is not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const content = `📍 Live location: https://www.google.com/maps?q=${latitude},${longitude}`;

        const msg: ChatMessage = {
          sender: loggedInUser,
          recipient: activeChatUser,
          content,
        };

        clientRef.current!.publish({
          destination: "/app/chat.sendPrivate",
          body: JSON.stringify(msg),
        });

        markChatRead(activeChatUser);
      },
      (err) => {
        console.error(err);
        alert("Could not get your location.");
      }
    );
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
    setActiveChatUser(trimmed);
  };

  // ---------- UI: LOGIN / SIGNUP SCREEN ----------
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
            width: 420,
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
            style={{ marginTop: 0, marginBottom: "1.25rem", color: "#555" }}
          >
            {authMode === "login"
              ? "Sign in with your email and password."
              : "Create your QuickTalk account and verify your email."}
          </p>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              marginBottom: "1rem",
              borderBottom: "1px solid #eee",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setLoginError(null);
              }}
              style={{
                flex: 1,
                padding: "8px 0",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontWeight: authMode === "login" ? 700 : 500,
                borderBottom:
                  authMode === "login"
                    ? "2px solid #25D366"
                    : "2px solid transparent",
              }}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("signup");
                setSignupStep("FORM");
                setSignupError(null);
              }}
              style={{
                flex: 1,
                padding: "8px 0",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontWeight: authMode === "signup" ? 700 : 500,
                borderBottom:
                  authMode === "signup"
                    ? "2px solid #25D366"
                    : "2px solid transparent",
              }}
            >
              Sign up
            </button>
          </div>

          {authMode === "login" ? (
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
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    fontSize: 14,
                  }}
                  placeholder="Enter your password"
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
              {loginInfo && (
                <div
                  style={{
                    marginBottom: "0.8rem",
                    fontSize: 13,
                    color: "#0b8b3b", // nice green
                  }}
                >
                {loginInfo}
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
                {loggingIn ? "Logging in..." : "Login"}
              </button>

              <div
                style={{
                  marginTop: "0.75rem",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "#555",
                }}
              >
                <button
                  type="button"
                  style={{
                    border: "none",
                    background: "none",
                    padding: 0,
                    color: "#075E54",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setAuthMode("signup");
                    setSignupStep("FORM");
                    setSignupError(null);
                  }}
                >
                  Create an account
                </button>
                <button
                  type="button"
                  style={{
                    border: "none",
                    background: "none",
                    padding: 0,
                    color: "#075E54",
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    alert("Forgot password flow will be wired later 🙂")
                  }
                >
                  Forgot password?
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={
                signupStep === "FORM" ? handleSignupSubmit : handleSignupVerify
              }
            >
              {signupStep === "FORM" ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 4,
                          color: "#555",
                        }}
                      >
                        First name
                      </label>
                      <input
                        value={signupFirstName}
                        onChange={(e) => setSignupFirstName(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #ccc",
                          fontSize: 14,
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 4,
                          color: "#555",
                        }}
                      >
                        Last name
                      </label>
                      <input
                        value={signupLastName}
                        onChange={(e) => setSignupLastName(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #ccc",
                          fontSize: 14,
                        }}
                      />
                    </div>
                  </div>

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
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
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
                      Name to show in chats
                    </label>
                    <input
                      value={signupUsername}
                      onChange={(e) => setSignupUsername(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        fontSize: 14,
                      }}
                      placeholder="e.g. Siri"
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 4,
                          color: "#555",
                        }}
                      >
                        New password
                      </label>
                      <input
                        type="password"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #ccc",
                          fontSize: 14,
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 4,
                          color: "#555",
                        }}
                      >
                        Confirm password
                      </label>
                      <input
                        type="password"
                        value={signupConfirmPassword}
                        onChange={(e) =>
                          setSignupConfirmPassword(e.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #ccc",
                          fontSize: 14,
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 4,
                          color: "#555",
                        }}
                      >
                        Gender
                      </label>
                      <input
                        value={signupGender}
                        onChange={(e) => setSignupGender(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #ccc",
                          fontSize: 14,
                        }}
                        placeholder="Optional"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 4,
                          color: "#555",
                        }}
                      >
                        Date of birth
                      </label>
                      <input
                        type="date"
                        value={signupDob}
                        onChange={(e) => setSignupDob(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #ccc",
                          fontSize: 14,
                        }}
                      />
                    </div>
                  </div>

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
                      Country of origin
                    </label>
                    <input
                      value={signupCountry}
                      onChange={(e) => setSignupCountry(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        fontSize: 14,
                      }}
                      placeholder="e.g. India"
                    />
                  </div>
                </>
              ) : (
                <>
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
                      value={signupEmail}
                      disabled
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        fontSize: 14,
                        backgroundColor: "#f3f4f6",
                      }}
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
                      Enter OTP
                    </label>
                    <input
                      value={signupOtp}
                      onChange={(e) => setSignupOtp(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        fontSize: 14,
                        letterSpacing: 4,
                      }}
                      placeholder="6-digit code"
                    />
                    <p
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: "#777",
                      }}
                    >
                      For dev, check backend logs for the OTP.
                    </p>
                  </div>
                </>
              )}

              {signupError && (
                <div
                  style={{
                    marginBottom: "0.8rem",
                    fontSize: 13,
                    color: "#b00020",
                  }}
                >
                  {signupError}
                </div>
              )}

              <button
                type="submit"
                disabled={signingUp}
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
                  opacity: signingUp ? 0.7 : 1,
                }}
              >
                {signupStep === "FORM"
                  ? signingUp
                    ? "Creating account..."
                    : "Create account"
                  : signingUp
                  ? "Verifying..."
                  : "Verify email"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ---------- UI: CHAT SCREEN ----------
  return (
    <div className="app-root">
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
          <button
            className="logout-button"
            onClick={handleLogout}
            style={{
              marginLeft: "0.75rem",
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.3)",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Logout
          </button>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === "light" ? "🌙 Dark" : "☀️ Light"}
          </button>
        </div>
      </header>

      <div className="app-layout">
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
    const currentDateKey = dateKey(m.sentAt);
    const prev = i > 0 ? relevantMessages[i - 1] : null;
    const prevDateKey = prev ? dateKey(prev.sentAt) : null;
    const showDateHeader = i === 0 || currentDateKey !== prevDateKey;

    return (
      <React.Fragment key={m.id ?? i}>
        {showDateHeader && (
          <div className="chat-date-divider">
            <span>{formatDate(m.sentAt)}</span>
          </div>
        )}

        <div
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
            <div className="chat-bubble-text">{m.content}</div>
            <div className="chat-bubble-meta">
              {formatTime(m.sentAt)}
            </div>
          </div>
        </div>
      </React.Fragment>
    );
  })}

          </div>

<div className="chat-input-row">
  {/* Emoji button */}
  <button
    type="button"
    className="chat-icon-button"
    onClick={() => setShowEmojiPicker((prev) => !prev)}
    disabled={!connected || !activeChatUser}
  >
    😊
  </button>

  {/* Location button */}
  <button
    type="button"
    className="chat-icon-button"
    onClick={handleSendLocation}
    disabled={!connected || !activeChatUser}
  >
    📍
  </button>

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

{/* Simple emoji picker */}
{showEmojiPicker && (
  <div className="emoji-picker">
    {commonEmojis.map((emoji) => (
      <button
        key={emoji}
        type="button"
        className="emoji-button"
        onClick={() => addEmoji(emoji)}
      >
        {emoji}
      </button>
    ))}
  </div>
)}

        </main>
      </div>
    </div>
  );
};

export default App;
