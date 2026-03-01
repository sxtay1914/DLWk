"use client";

import { useState, useRef } from "react";

interface CommandBarProps {
  onSubmit: (message: string) => void;
  hasTasks: boolean;
}

export default function CommandBar({ onSubmit, hasTasks }: CommandBarProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const placeholder = hasTasks
    ? "What do you want to change?"
    : "What do you want to build?";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-sm hover:border-[var(--accent)]/40 focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent)]/30 transition-all">
        {/* Boss avatar */}
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ backgroundColor: "#F59E0B" }}>
          B
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
        />

        <button
          type="submit"
          disabled={!value.trim()}
          className="px-3 py-1 text-xs font-medium rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </form>
  );
}
