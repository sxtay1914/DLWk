"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket, API_BASE } from "@/lib/socket";

export interface ChatMessage {
  id: string;
  role: "user" | "boss";
  content: string;
  timestamp: string;
}

export function useBossChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [plan, setPlan] = useState<string[] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const streamingRef = useRef("");
  const msgIdCounter = useRef(0);

  useEffect(() => {
    const socket = getSocket();

    socket.on("boss_session", (data: { session_id: string }) => {
      setSessionId(data.session_id);
    });

    socket.on("boss_chat_stream", (data: { delta: string; agent: string; session_id?: string }) => {
      streamingRef.current += data.delta;

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "boss" && last.id.startsWith("streaming-")) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: streamingRef.current },
          ];
        }
        // First delta — create new chief message
        return [
          ...prev,
          {
            id: `streaming-${Date.now()}`,
            role: "boss" as const,
            content: streamingRef.current,
            timestamp: new Date().toISOString(),
          },
        ];
      });
    });

    socket.on("boss_chat_complete", (data: { output: string; session_id?: string }) => {
      // Finalize the streaming message
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "boss" && last.id.startsWith("streaming-")) {
          return [
            ...prev.slice(0, -1),
            { ...last, id: `boss-${Date.now()}`, content: data.output },
          ];
        }
        // No streaming message found — add the complete message
        return [
          ...prev,
          {
            id: `boss-${Date.now()}`,
            role: "boss" as const,
            content: data.output,
            timestamp: new Date().toISOString(),
          },
        ];
      });
      streamingRef.current = "";
      setIsStreaming(false);
    });

    socket.on("boss_plan", (data: { plan: string[]; session_id?: string }) => {
      setPlan(data.plan);
    });

    socket.on("boss_plan_approved", () => {
      setPlan(null);
    });

    return () => {
      socket.off("boss_session");
      socket.off("boss_chat_stream");
      socket.off("boss_chat_complete");
      socket.off("boss_plan");
      socket.off("boss_plan_approved");
    };
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      // Add user message to chat
      const userMsg: ChatMessage = {
        id: `user-${++msgIdCounter.current}`,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      streamingRef.current = "";

      try {
        const res = await fetch(`${API_BASE}/api/chat/boss`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            session_id: sessionId,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.session_id) {
            setSessionId(data.session_id);
          }
        }
      } catch (err) {
        console.error("[useBossChat] Failed to send message:", err);
        setIsStreaming(false);
      }
    },
    [sessionId]
  );

  const approvePlan = useCallback(async () => {
    if (!sessionId) return;

    // Add user approval message
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${++msgIdCounter.current}`,
        role: "user" as const,
        content: "Approved. Go ahead!",
        timestamp: new Date().toISOString(),
      },
    ]);
    setPlan(null);
    setIsStreaming(true);
    streamingRef.current = "";

    try {
      await fetch(`${API_BASE}/api/chat/boss/approve-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch (err) {
      console.error("[useBossChat] Failed to approve plan:", err);
      setIsStreaming(false);
    }
  }, [sessionId]);

  return {
    messages,
    isStreaming,
    plan,
    sessionId,
    sendMessage,
    approvePlan,
  };
}
