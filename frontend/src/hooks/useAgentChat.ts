"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatMessage } from "@/lib/types";
import { getSocket, API_BASE } from "@/lib/socket";

interface AgentChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function useAgentChat() {
  const [chats, setChats] = useState<Record<string, AgentChatState>>({});
  const streamBuffers = useRef<Record<string, string>>({});

  useEffect(() => {
    const socket = getSocket();

    const handleStream = (data: { agent_id: string; delta: string }) => {
      const aid = data.agent_id;
      if (!streamBuffers.current[aid]) streamBuffers.current[aid] = "";
      streamBuffers.current[aid] += data.delta;
      const buffered = streamBuffers.current[aid];

      setChats((prev) => {
        const state = prev[aid] ?? { messages: [], isStreaming: true };
        const msgs = state.messages;
        const last = msgs[msgs.length - 1];
        if (last?.id === "streaming") {
          return {
            ...prev,
            [aid]: {
              isStreaming: true,
              messages: [...msgs.slice(0, -1), { ...last, content: buffered }],
            },
          };
        }
        return {
          ...prev,
          [aid]: {
            isStreaming: true,
            messages: [
              ...msgs,
              {
                id: "streaming",
                agent_id: aid,
                agent_name: "",
                agent_color: "",
                content: buffered,
                sender: "agent" as const,
                timestamp: new Date().toISOString(),
              },
            ],
          },
        };
      });
    };

    const handleComplete = (data: { agent_id: string; output: string }) => {
      const aid = data.agent_id;
      const finalContent = data.output || streamBuffers.current[aid] || "Done.";
      streamBuffers.current[aid] = "";

      setChats((prev) => {
        const state = prev[aid] ?? { messages: [], isStreaming: false };
        const withoutStreaming = state.messages.filter((m) => m.id !== "streaming");
        return {
          ...prev,
          [aid]: {
            isStreaming: false,
            messages: [
              ...withoutStreaming,
              {
                id: `agent-${Date.now()}`,
                agent_id: aid,
                agent_name: "",
                agent_color: "",
                content: finalContent,
                sender: "agent" as const,
                timestamp: new Date().toISOString(),
              },
            ],
          },
        };
      });
    };

    const handleRoute = (data: { from_agent_id: string; from_agent_name: string; reason: string }) => {
      const aid = data.from_agent_id;
      streamBuffers.current[aid] = "";

      setChats((prev) => {
        const state = prev[aid] ?? { messages: [], isStreaming: false };
        const withoutStreaming = state.messages.filter((m) => m.id !== "streaming");
        return {
          ...prev,
          [aid]: {
            isStreaming: false,
            messages: [
              ...withoutStreaming,
              {
                id: `handoff-${Date.now()}`,
                agent_id: aid,
                agent_name: "",
                agent_color: "",
                content: `I've passed this along to the Chief — ${data.reason.toLowerCase()}. They'll take it from here!`,
                sender: "agent" as const,
                timestamp: new Date().toISOString(),
              },
            ],
          },
        };
      });
    };

    socket.on("agent_chat_stream", handleStream);
    socket.on("agent_chat_complete", handleComplete);
    socket.on("agent_route", handleRoute);

    return () => {
      socket.off("agent_chat_stream", handleStream);
      socket.off("agent_chat_complete", handleComplete);
      socket.off("agent_route", handleRoute);
    };
  }, []);

  const sendMessage = useCallback(async (agentId: string, agentName: string, agentColor: string, content: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      agent_id: agentId,
      agent_name: "You",
      agent_color: "#0d0d0d",
      content,
      sender: "user",
      timestamp: new Date().toISOString(),
    };

    streamBuffers.current[agentId] = "";

    setChats((prev) => {
      const state = prev[agentId] ?? { messages: [], isStreaming: false };
      return {
        ...prev,
        [agentId]: {
          isStreaming: true,
          messages: [...state.messages, userMsg],
        },
      };
    });

    try {
      await fetch(`${API_BASE}/api/chat/${agentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error("[useAgentChat] Failed to send message:", err);
      setChats((prev) => {
        const state = prev[agentId] ?? { messages: [], isStreaming: false };
        return {
          ...prev,
          [agentId]: {
            isStreaming: false,
            messages: [
              ...state.messages,
              {
                id: `error-${Date.now()}`,
                agent_id: agentId,
                agent_name: agentName,
                agent_color: agentColor,
                content: "Sorry, I couldn't connect to the backend. Please try again.",
                sender: "agent",
                timestamp: new Date().toISOString(),
              },
            ],
          },
        };
      });
    }
  }, []);

  const getMessages = useCallback((agentId: string): ChatMessage[] => {
    return chats[agentId]?.messages ?? [];
  }, [chats]);

  const getIsStreaming = useCallback((agentId: string): boolean => {
    return chats[agentId]?.isStreaming ?? false;
  }, [chats]);

  return { sendMessage, getMessages, getIsStreaming };
}
