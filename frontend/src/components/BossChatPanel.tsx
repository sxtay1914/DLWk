"use client";

import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@/hooks/useBossChat";

interface BossChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSend: (message: string) => void;
  plan: string[] | null;
  onApprovePlan: () => void;
  isStreaming: boolean;
}

export default function BossChatPanel({
  isOpen,
  onClose,
  messages,
  onSend,
  plan,
  onApprovePlan,
  isStreaming,
}: BossChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, plan]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput("");
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[420px] max-w-[90vw] bg-[var(--bg-card)] border-l border-[var(--border-color)] shadow-xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: "#F59E0B" }}
            >
              B
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                The Boss
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                {isStreaming ? "Typing..." : "AI Orchestrator"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[var(--bg-card-hover)] transition-colors text-[var(--text-muted)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white mb-3"
                style={{ backgroundColor: "#F59E0B" }}
              >
                B
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                The Boss is ready
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Describe what you want to build and the Boss will coordinate the team.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[var(--accent)] text-white rounded-br-sm"
                    : "bg-[var(--bg-column)] text-[var(--text-primary)] rounded-bl-sm"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}

          {/* Plan approval card */}
          {plan && (
            <div className="bg-[var(--bg-column)] border border-[var(--border-color)] rounded-lg p-3">
              <p className="text-xs font-semibold text-[var(--text-primary)] mb-2 uppercase tracking-wider">
                Proposed Plan
              </p>
              <ol className="space-y-1.5 mb-3">
                {plan.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-[var(--text-secondary)]">
                    <span className="text-[var(--accent)] font-mono font-bold shrink-0">
                      {i + 1}.
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
              <div className="flex gap-2">
                <button
                  onClick={onApprovePlan}
                  className="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-[var(--success)] text-white hover:opacity-90 transition-opacity"
                >
                  Approve Plan
                </button>
                <button
                  onClick={() => {
                    onSend("I'd like to modify the plan. Let me explain what I want to change.");
                  }}
                  className="flex-1 px-3 py-1.5 text-xs font-medium rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  Modify
                </button>
              </div>
            </div>
          )}

          {/* Streaming indicator */}
          {isStreaming && messages[messages.length - 1]?.role !== "boss" && (
            <div className="flex justify-start">
              <div className="bg-[var(--bg-column)] text-[var(--text-muted)] px-3 py-2 rounded-lg rounded-bl-sm text-sm">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="px-4 py-3 border-t border-[var(--border-color)]"
        >
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isStreaming ? "Boss is responding..." : "Reply to the Boss..."}
              disabled={isStreaming}
              className="flex-1 px-3 py-2 text-sm bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] disabled:opacity-50 transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="px-3 py-2 text-xs font-medium rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
