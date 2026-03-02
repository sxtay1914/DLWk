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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, plan]);

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
          className="fixed inset-0 bg-black/10 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[440px] max-w-[90vw] bg-[var(--bg-card)] border-l border-[var(--border-subtle)] z-50 flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
              style={{ backgroundColor: "#F59E0B" }}
            >
              B
            </div>
            <div>
              <p className="text-[14px] font-medium text-[var(--text-primary)]">
                The Boss
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                {isStreaming ? "Typing..." : "AI Orchestrator"}
              </p>
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

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold text-white mb-4"
                style={{ backgroundColor: "#F59E0B" }}
              >
                B
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
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-4 py-2.5 text-[14px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[var(--bg-bubble-user)] text-[var(--text-bubble-user)] rounded-3xl rounded-br-lg"
                    : "text-[var(--text-primary)]"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}

          {/* Plan approval card */}
          {plan && (
            <div className="bg-[var(--bg-column)] rounded-2xl p-4">
              <p className="text-[11px] font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wider">
                Proposed Plan
              </p>
              <ol className="space-y-2 mb-4">
                {plan.map((item, i) => (
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
                  onClick={onApprovePlan}
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

          {/* Streaming indicator */}
          {isStreaming && messages[messages.length - 1]?.role !== "boss" && (
            <div className="flex justify-start">
              <div className="text-[var(--text-muted)] text-[14px]">
                <span className="inline-flex gap-0.5">
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
          className="px-5 py-4 border-t border-[var(--border-subtle)]"
        >
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-column)] rounded-2xl focus-within:bg-[var(--bg-card)] focus-within:shadow-[0_0_0_1px_var(--border-color)] transition-all">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isStreaming ? "Boss is responding..." : "Reply to the Boss..."}
              disabled={isStreaming}
              className="flex-1 py-0.5 text-[14px] bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="p-1.5 rounded-lg bg-[var(--bg-bubble-user)] text-[var(--text-bubble-user)] disabled:opacity-20 disabled:cursor-not-allowed transition-opacity hover:opacity-80"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
