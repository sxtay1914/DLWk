"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Agent, ChatMessage, ActivityEntry } from "@/lib/types";
import { getSocket, API_BASE } from "@/lib/socket";

interface AgentModalProps {
  agent: Agent;
  activities: ActivityEntry[];
  onClose: () => void;
}

export default function AgentModal({ agent, activities, onClose }: AgentModalProps) {
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "sys-1",
      agent_id: agent.id,
      agent_name: agent.name,
      agent_color: agent.color,
      content: `Hello! I'm ${agent.name}. How can I help you?`,
      sender: "agent",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const streamBufferRef = useRef("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-scroll live output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputLines, activities]);

  // Listen for streaming socket events from this agent
  useEffect(() => {
    const socket = getSocket();

    const handleStream = (data: { agent_id: string; delta: string }) => {
      if (data.agent_id !== agent.id) return;

      streamBufferRef.current += data.delta;
      const buffered = streamBufferRef.current;

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.id === "streaming") {
          return [...prev.slice(0, -1), { ...last, content: buffered }];
        }
        return [
          ...prev,
          {
            id: "streaming",
            agent_id: agent.id,
            agent_name: agent.name,
            agent_color: agent.color,
            content: buffered,
            sender: "agent" as const,
            timestamp: new Date().toISOString(),
          },
        ];
      });
    };

    const handleComplete = (data: { agent_id: string; output: string }) => {
      if (data.agent_id !== agent.id) return;

      const finalContent = data.output || streamBufferRef.current || "Done.";
      streamBufferRef.current = "";
      setIsStreaming(false);

      setMessages((prev) => {
        const withoutStreaming = prev.filter((m) => m.id !== "streaming");
        return [
          ...withoutStreaming,
          {
            id: `agent-${Date.now()}`,
            agent_id: agent.id,
            agent_name: agent.name,
            agent_color: agent.color,
            content: finalContent,
            sender: "agent" as const,
            timestamp: new Date().toISOString(),
          },
        ];
      });
    };

    // Listen for agent_stream events (tool calls, text output during task execution)
    const handleAgentStream = (data: { agent: string; type: string; delta?: string; tool?: string; output?: string }) => {
      // Match by agent name (runner.py uses agent name, not id)
      if (data.agent !== agent.name) return;

      if (data.type === "tool_call" && data.tool) {
        setOutputLines((prev) => [...prev, `> Running: ${data.tool}()`]);
      } else if (data.type === "text" && data.delta) {
        const text = data.delta;
        setOutputLines((prev) => {
          const last = prev[prev.length - 1];
          if (last && !last.startsWith(">")) {
            return [...prev.slice(0, -1), last + text];
          }
          return [...prev, text];
        });
      } else if (data.type === "complete") {
        setOutputLines((prev) => [...prev, "", "> Task completed."]);
      }
    };

    socket.on("agent_chat_stream", handleStream);
    socket.on("agent_chat_complete", handleComplete);
    socket.on("agent_stream", handleAgentStream);

    return () => {
      socket.off("agent_chat_stream", handleStream);
      socket.off("agent_chat_complete", handleComplete);
      socket.off("agent_stream", handleAgentStream);
    };
  }, [agent.id, agent.name, agent.color]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      agent_id: agent.id,
      agent_name: "You",
      agent_color: "#0052cc",
      content: input.trim(),
      sender: "user",
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    const messageText = input.trim();
    setInput("");
    setIsStreaming(true);
    streamBufferRef.current = "";

    try {
      await fetch(`${API_BASE}/api/chat/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: messageText }),
      });
    } catch (err) {
      console.error("[AgentModal] Failed to send message:", err);
      setIsStreaming(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          agent_id: agent.id,
          agent_name: agent.name,
          agent_color: agent.color,
          content: "Sorry, I couldn't connect to the backend. Please try again.",
          sender: "agent",
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [input, isStreaming, agent.id, agent.name, agent.color]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="slide-up w-full max-w-2xl mx-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            {/* Agent avatar */}
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: agent.color }}
            >
              {agent.avatar_label}
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {agent.name}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-muted)] capitalize">
                  {agent.role.replace("_", " ")}
                </span>
                <span className="text-[var(--text-muted)]">&middot;</span>
                <div className="flex items-center gap-1">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      agent.status === "working"
                        ? "bg-[var(--success)]"
                        : agent.status === "thinking"
                        ? "bg-blue-500"
                        : agent.status === "meeting"
                        ? "bg-amber-500"
                        : agent.status === "celebrating"
                        ? "bg-purple-500"
                        : "bg-[var(--text-muted)]"
                    }`}
                  />
                  <span className="text-[11px] text-[var(--text-muted)] capitalize">
                    {agent.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Live output */}
        <div className="border-b border-[var(--border-color)]">
          <div className="px-5 py-2 flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${
              agent.status === "working" ? "bg-[var(--success)] animate-pulse" : "bg-[var(--text-muted)]"
            }`} />
            <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">
              Live Output
            </span>
          </div>
          <div
            ref={outputRef}
            className="px-5 pb-3 max-h-[140px] overflow-y-auto"
          >
            <pre className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-mono whitespace-pre-wrap bg-[#f4f5f7] rounded-lg p-3">
              {outputLines.length > 0
                ? outputLines.join("\n")
                : activities.length > 0
                ? activities.map((a) => `[${new Date(a.timestamp).toLocaleTimeString("en-US", { hour12: false })}] ${a.message}`).join("\n")
                : agent.status === "idle"
                ? "Agent is idle. No recent activity."
                : "Waiting for output..."}
            </pre>
          </div>
        </div>

        {/* Chat section */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-5 py-2">
            <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">
              Chat
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 space-y-3 max-h-[360px]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${
                  msg.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.sender === "agent" && (
                  <div
                    className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ backgroundColor: msg.agent_color }}
                  >
                    {agent.avatar_label}
                  </div>
                )}
                <div
                  className={`px-3 py-2 rounded-lg text-xs max-w-[80%] ${
                    msg.sender === "user"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-column)] text-[var(--text-primary)] border border-[var(--border-color)]"
                  }`}
                >
                  {msg.content}
                  {msg.id === "streaming" && (
                    <span className="inline-block w-1.5 h-3.5 bg-[var(--text-muted)] ml-0.5 animate-pulse" />
                  )}
                </div>
              </div>
            ))}

            {/* Streaming indicator when waiting for first delta */}
            {isStreaming && !messages.some((m) => m.id === "streaming") && (
              <div className="flex gap-2 justify-start">
                <div
                  className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
                  style={{ backgroundColor: agent.color }}
                >
                  {agent.avatar_label}
                </div>
                <div className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-column)] border border-[var(--border-color)]">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="px-5 py-3 border-t border-[var(--border-color)]">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? "Waiting for response..." : "Message this agent..."}
                disabled={isStreaming}
                className="flex-1 px-3 py-2 text-xs bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={isStreaming || !input.trim()}
                className="px-4 py-2 text-xs font-medium bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--border-color)] bg-[var(--bg-column)]">
          <button
            onClick={() => {
              getSocket().emit("pause_agent", { agent_id: agent.id });
              onClose();
            }}
            className="px-3 py-1.5 text-[11px] font-medium bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20 rounded-lg hover:bg-[var(--warning)]/20 transition-colors"
          >
            Pause
          </button>
          <button
            onClick={() => {
              getSocket().emit("reassign_task", { agent_id: agent.id });
              onClose();
            }}
            className="px-3 py-1.5 text-[11px] font-medium bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 rounded-lg hover:bg-[var(--accent)]/20 transition-colors"
          >
            Reassign
          </button>
          <button
            onClick={() => {
              if (confirm("Cancel this agent's current task? This will delete the task.")) {
                getSocket().emit("cancel_task", { agent_id: agent.id });
                onClose();
              }
            }}
            className="px-3 py-1.5 text-[11px] font-medium bg-[var(--error)]/10 text-[var(--error)] border border-[var(--error)]/20 rounded-lg hover:bg-[var(--error)]/20 transition-colors"
          >
            Cancel Task
          </button>
        </div>
      </div>
    </div>
  );
}
