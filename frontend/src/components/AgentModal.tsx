"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Agent, ChatMessage, ActivityEntry, Checkpoint } from "@/lib/types";
import type { ChatMessage as BossChatMessage } from "@/hooks/useBossChat";
import { getSocket, API_BASE } from "@/lib/socket";

interface AgentModalProps {
  agent: Agent;
  activities: ActivityEntry[];
  onClose: () => void;
  // Checkpoint review (non-boss agents)
  checkpoint?: Checkpoint | null;
  onCheckpointRespond?: (checkpointId: string, action: "approve" | "request_changes" | "pause", feedback?: string) => void;
  // Boss mode props (only used when agent.id === "agent-boss")
  bossMessages?: BossChatMessage[];
  onBossSend?: (msg: string) => void;
  bossPlan?: string[] | null;
  onBossApprovePlan?: () => void;
  bossIsStreaming?: boolean;
}

export default function AgentModal({ agent, activities, onClose, checkpoint, onCheckpointRespond, bossMessages, onBossSend, bossPlan, onBossApprovePlan, bossIsStreaming }: AgentModalProps) {
  const isBoss = agent.id === "agent-boss";

  const [outputLines, setOutputLines] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([
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
  const [localIsStreaming, setLocalIsStreaming] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const streamBufferRef = useRef("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derived values: boss mode uses hook data, non-boss uses local state
  const isStreaming = isBoss ? (bossIsStreaming ?? false) : localIsStreaming;
  const setIsStreaming = isBoss ? (() => {}) : setLocalIsStreaming;
  const setMessages = isBoss ? (() => {}) : setLocalMessages;

  // Convert boss messages to the ChatMessage format used by the modal renderer
  const messages: ChatMessage[] = isBoss
    ? (bossMessages ?? []).map((m) => ({
        id: m.id,
        agent_id: agent.id,
        agent_name: m.role === "user" ? "You" : agent.name,
        agent_color: m.role === "user" ? "#0d0d0d" : agent.color,
        content: m.content,
        sender: m.role === "user" ? ("user" as const) : ("agent" as const),
        timestamp: m.timestamp,
      }))
    : localMessages;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputLines, activities]);

  // Listen for streaming socket events from this agent (skip for boss — useBossChat handles it)
  useEffect(() => {
    if (isBoss) return;

    const socket = getSocket();

    const handleStream = (data: { agent_id: string; delta: string }) => {
      if (data.agent_id !== agent.id) return;

      streamBufferRef.current += data.delta;
      const buffered = streamBufferRef.current;

      setLocalMessages((prev) => {
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
      setLocalIsStreaming(false);

      setLocalMessages((prev) => {
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

    const handleAgentStream = (data: { agent: string; type: string; delta?: string; tool?: string; output?: string }) => {
      if (data.agent !== agent.name) return;

      if (data.type === "tool_call" && data.tool) {
        setOutputLines((prev) => [...prev, `> ${data.tool}()`]);
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
        setOutputLines((prev) => [...prev, "", "> Done"]);
      }
    };

    const handleAgentRoute = (data: { from_agent_id: string; from_agent_name: string; reason: string }) => {
      if (data.from_agent_id !== agent.id) return;

      setLocalIsStreaming(false);
      setLocalMessages((prev) => [
        ...prev.filter((m) => m.id !== "streaming"),
        {
          id: `handoff-${Date.now()}`,
          agent_id: agent.id,
          agent_name: agent.name,
          agent_color: agent.color,
          content: `I've passed this along to the Boss — ${data.reason.toLowerCase()}. They'll take it from here!`,
          sender: "agent" as const,
          timestamp: new Date().toISOString(),
        },
      ]);
    };

    socket.on("agent_chat_stream", handleStream);
    socket.on("agent_chat_complete", handleComplete);
    socket.on("agent_stream", handleAgentStream);
    socket.on("agent_route", handleAgentRoute);

    return () => {
      socket.off("agent_chat_stream", handleStream);
      socket.off("agent_chat_complete", handleComplete);
      socket.off("agent_stream", handleAgentStream);
      socket.off("agent_route", handleAgentRoute);
    };
  }, [isBoss, agent.id, agent.name, agent.color]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const messageText = input.trim();
    setInput("");

    // Boss mode: delegate to useBossChat hook
    if (isBoss && onBossSend) {
      onBossSend(messageText);
      return;
    }

    // Non-boss: local send
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      agent_id: agent.id,
      agent_name: "You",
      agent_color: "#0d0d0d",
      content: messageText,
      sender: "user",
      timestamp: new Date().toISOString(),
    };

    setLocalMessages((prev) => [...prev, userMsg]);
    setLocalIsStreaming(true);
    streamBufferRef.current = "";

    try {
      await fetch(`${API_BASE}/api/chat/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: messageText }),
      });
    } catch (err) {
      console.error("[AgentModal] Failed to send message:", err);
      setLocalIsStreaming(false);
      setLocalMessages((prev) => [
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
  }, [input, isStreaming, isBoss, onBossSend, agent.id, agent.name, agent.color]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/20"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="slide-up w-full max-w-2xl mx-4 bg-[var(--bg-card)] rounded-2xl overflow-hidden shadow-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
              style={{ backgroundColor: agent.color }}
            >
              {agent.avatar_label}
            </div>
            <div>
              <h2 className="text-[14px] font-medium text-[var(--text-primary)]">
                {agent.name}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-muted)] capitalize">
                  {agent.role.replace("_", " ")}
                </span>
                <div className="flex items-center gap-1">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      agent.status === "working"
                        ? "bg-[var(--success)]"
                        : agent.status === "thinking"
                        ? "bg-[var(--text-secondary)]"
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
            className="p-2 rounded-full hover:bg-[var(--bg-column)] transition-colors text-[var(--text-muted)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Live output (non-boss only) */}
        {!isBoss && <div className="border-b border-[var(--border-subtle)]">
          <div className="px-5 py-2 flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${
              agent.status === "working" ? "bg-[var(--success)] animate-pulse" : "bg-[var(--text-muted)]"
            }`} />
            <span className="text-[11px] text-[var(--text-muted)] font-medium">
              Output
            </span>
          </div>
          <div
            ref={outputRef}
            className="px-5 pb-3 max-h-[120px] overflow-y-auto"
          >
            <pre className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-mono whitespace-pre-wrap bg-[var(--bg-column)] rounded-xl p-3">
              {outputLines.length > 0
                ? outputLines.join("\n")
                : activities.length > 0
                ? activities.map((a) => `[${new Date(a.timestamp).toLocaleTimeString("en-US", { hour12: false })}] ${a.message}`).join("\n")
                : agent.status === "idle"
                ? "Agent is idle."
                : "Waiting for output..."}
            </pre>
          </div>
        </div>}

        {/* Chat section */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-5 py-2">
            <span className="text-[11px] text-[var(--text-muted)] font-medium">
              Chat
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 space-y-3 max-h-[360px]">
            {/* Boss empty state */}
            {isBoss && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center px-8">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold text-white mb-4"
                  style={{ backgroundColor: agent.color }}
                >
                  {agent.avatar_label}
                </div>
                <p className="text-[14px] font-medium text-[var(--text-primary)] mb-1">
                  The Boss is ready
                </p>
                <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
                  Describe what you want to build and the team will get to work.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${
                  msg.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.sender === "agent" && (
                  <div
                    className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[8px] font-semibold text-white"
                    style={{ backgroundColor: msg.agent_color }}
                  >
                    {agent.avatar_label}
                  </div>
                )}
                <div
                  className={`px-3.5 py-2 text-[13px] max-w-[80%] leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-[var(--bg-bubble-user)] text-[var(--text-bubble-user)] rounded-3xl rounded-br-lg"
                      : "text-[var(--text-primary)]"
                  }`}
                >
                  {msg.content}
                  {(msg.id === "streaming" || msg.id.startsWith("streaming-")) && (
                    <span className="inline-block w-0.5 h-3.5 bg-[var(--text-muted)] ml-0.5 animate-pulse" />
                  )}
                </div>
              </div>
            ))}

            {/* Boss plan approval card */}
            {isBoss && bossPlan && (
              <div className="bg-[var(--bg-column)] rounded-2xl p-4">
                <p className="text-[11px] font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wider">
                  Proposed Plan
                </p>
                <ol className="space-y-2 mb-4">
                  {bossPlan.map((item, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] text-[var(--text-secondary)]">
                      <span className="text-[var(--text-muted)] font-mono shrink-0">
                        {i + 1}.
                      </span>
                      {item}
                    </li>
                  ))}
                </ol>
                <div className="flex gap-2">
                  <button
                    onClick={onBossApprovePlan}
                    className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full bg-[var(--success)] text-white hover:opacity-90 transition-opacity"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      setInput("I'd like to change the plan: ");
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    Modify
                  </button>
                </div>
              </div>
            )}

            {/* Checkpoint review card (non-boss agents) */}
            {!isBoss && checkpoint && checkpoint.status === "pending" && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-[11px] font-medium text-amber-600 mb-2 uppercase tracking-wider">
                  Awaiting Review
                </p>
                <p className="text-[13px] font-medium text-[var(--text-primary)] mb-1">
                  {checkpoint.task_title}
                </p>
                <p className="text-[12px] text-[var(--text-secondary)] mb-3 leading-relaxed">
                  {checkpoint.message}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mb-3">
                  Next: <span className="font-medium">{checkpoint.next_status}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => onCheckpointRespond?.(checkpoint.id, "approve")}
                    className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full bg-[var(--success)] text-white hover:opacity-90 transition-opacity"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      if (rejectFeedback.trim()) {
                        onCheckpointRespond?.(checkpoint.id, "request_changes", rejectFeedback);
                        setRejectFeedback("");
                      } else {
                        setRejectFeedback(" "); // show input
                      }
                    }}
                    className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    Request Changes
                  </button>
                </div>
                {rejectFeedback && (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={rejectFeedback.trim() ? rejectFeedback : ""}
                      onChange={(e) => setRejectFeedback(e.target.value)}
                      placeholder="What needs to change?"
                      className="flex-1 px-3 py-1.5 text-[12px] rounded-lg border border-amber-200 bg-white text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-amber-400"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        if (rejectFeedback.trim()) {
                          onCheckpointRespond?.(checkpoint.id, "request_changes", rejectFeedback);
                          setRejectFeedback("");
                        }
                      }}
                      disabled={!rejectFeedback.trim()}
                      className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-amber-500 text-white disabled:opacity-40"
                    >
                      Send
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Streaming indicator */}
            {isStreaming && !messages.some((m) => m.id === "streaming" || m.id.startsWith("streaming-")) && (
              <div className="flex gap-2.5 justify-start">
                <div
                  className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[8px] font-semibold text-white"
                  style={{ backgroundColor: agent.color }}
                >
                  {agent.avatar_label}
                </div>
                <div className="text-[var(--text-muted)] text-[14px]">
                  <span className="inline-flex gap-0.5">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="px-5 py-3 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 px-3.5 py-2 bg-[var(--bg-column)] rounded-2xl focus-within:bg-[var(--bg-card)] focus-within:shadow-[0_0_0_1px_var(--border-color)] transition-all">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                ref={inputRef}
                placeholder={isStreaming ? (isBoss ? "Boss is responding..." : "Waiting for response...") : (isBoss ? "Reply to the Boss..." : "Message this agent...")}
                disabled={isStreaming}
                className="flex-1 py-0.5 text-[13px] bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={isStreaming || !input.trim()}
                className="p-1.5 rounded-lg bg-[var(--bg-bubble-user)] text-[var(--text-bubble-user)] disabled:opacity-20 disabled:cursor-not-allowed transition-opacity hover:opacity-80"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Action buttons (non-boss only) */}
        {!isBoss && (
        <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--border-subtle)]">
          <button
            onClick={() => {
              getSocket().emit("pause_agent", { agent_id: agent.id });
              onClose();
            }}
            className="px-3.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] border border-[var(--border-color)] rounded-full hover:bg-[var(--bg-column)] transition-colors"
          >
            Pause
          </button>
          <button
            onClick={() => {
              getSocket().emit("reassign_task", { agent_id: agent.id });
              onClose();
            }}
            className="px-3.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] border border-[var(--border-color)] rounded-full hover:bg-[var(--bg-column)] transition-colors"
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
            className="px-3.5 py-1.5 text-[12px] font-medium text-[var(--error)] border border-[var(--error)]/20 rounded-full hover:bg-[var(--error)]/5 transition-colors"
          >
            Cancel Task
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
