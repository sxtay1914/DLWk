"use client";

import { useState, useRef, useEffect } from "react";
import type { Agent, ChatMessage } from "@/lib/types";

interface AgentModalProps {
  agent: Agent;
  onClose: () => void;
}

const MOCK_OUTPUT_LINES = [
  "$ Initializing agent workspace...",
  "> Loading project context from /workspace/src",
  "> Analyzing task requirements...",
  "> Generating implementation plan...",
  "",
  "Step 1: Parse requirements document",
  "  - Identified 3 main features",
  "  - Estimated complexity: medium",
  "",
  "Step 2: Writing implementation",
  "  - Creating auth module...",
  "  - Adding JWT token generation...",
  "  - Setting up middleware...",
  "",
  "> Build passed. Running tests...",
  "  PASS  tests/auth.test.ts (2.3s)",
  "  PASS  tests/middleware.test.ts (1.1s)",
  "",
  "> Task progress: 70% complete",
];

export default function AgentModal({ agent, onClose }: AgentModalProps) {
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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, []);

  const sendMessage = () => {
    if (!input.trim()) return;

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
    setInput("");

    // Simulate agent response
    setTimeout(() => {
      const agentReply: ChatMessage = {
        id: `agent-${Date.now()}`,
        agent_id: agent.id,
        agent_name: agent.name,
        agent_color: agent.color,
        content:
          "I understand. Let me look into that and get back to you with an update.",
        sender: "agent",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, agentReply]);
    }, 1200);
  };

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
                        : agent.status === "reviewing"
                        ? "bg-purple-500"
                        : agent.status === "blocked"
                        ? "bg-[var(--error)]"
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
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
            <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">
              Live Output
            </span>
          </div>
          <div
            ref={outputRef}
            className="px-5 pb-3 max-h-[160px] overflow-y-auto"
          >
            <pre className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-mono whitespace-pre-wrap bg-[#f4f5f7] rounded-lg p-3">
              {MOCK_OUTPUT_LINES.join("\n")}
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
          <div className="flex-1 overflow-y-auto px-5 space-y-3 max-h-[200px]">
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
                </div>
              </div>
            ))}
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
                placeholder="Message this agent..."
                className="flex-1 px-3 py-2 text-xs bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
              />
              <button
                onClick={sendMessage}
                className="px-4 py-2 text-xs font-medium bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--border-color)] bg-[var(--bg-column)]">
          <button className="px-3 py-1.5 text-[11px] font-medium bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20 rounded-lg hover:bg-[var(--warning)]/20 transition-colors">
            Pause
          </button>
          <button className="px-3 py-1.5 text-[11px] font-medium bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 rounded-lg hover:bg-[var(--accent)]/20 transition-colors">
            Reassign
          </button>
          <button className="px-3 py-1.5 text-[11px] font-medium bg-[var(--error)]/10 text-[var(--error)] border border-[var(--error)]/20 rounded-lg hover:bg-[var(--error)]/20 transition-colors">
            Cancel Task
          </button>
        </div>
      </div>
    </div>
  );
}
