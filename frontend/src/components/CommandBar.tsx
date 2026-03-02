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
      <div className="relative flex items-center gap-3 px-4 py-3 bg-[var(--bg-column)] rounded-2xl hover:bg-[#ececec]/60 focus-within:bg-white focus-within:shadow-[0_0_0_1px_var(--border-color)] transition-all">
        {/* Boss avatar */}
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-semibold text-white shrink-0" style={{ backgroundColor: "#F59E0B" }}>
          B
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
        />

        <button
          type="submit"
          disabled={!value.trim()}
          className="p-1.5 rounded-lg bg-[var(--accent)] text-white disabled:opacity-20 disabled:cursor-not-allowed transition-opacity hover:opacity-80"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
          </svg>
        </button>
      </div>
    </form>
  );
}
