"use client";

import { useState, useEffect } from "react";
import type { Agent } from "@/lib/types";
import { getSocket, API_BASE } from "@/lib/socket";
import { MOCK_AGENTS } from "@/lib/mockData";

const ROLE_LABELS: Record<string, string> = {
  Chief: "C",
  PM: "PM",
  "Scrum Master": "SM",
  Developer: "DEV",
  QA: "QA",
  "Code Reviewer": "CR",
};

// Normalize backend agent data to match our frontend Agent type
function normalizeAgent(raw: Record<string, unknown>): Agent {
  return {
    id: raw.id as string,
    name: raw.name as string,
    role: raw.role as Agent["role"],
    status: raw.status as Agent["status"],
    color: (raw.color ?? raw.avatar_color ?? "#888") as string,
    current_task_id: (raw.current_task_id ?? raw.current_task ?? null) as string | null,
    avatar_label: (raw.avatar_label ?? ROLE_LABELS[raw.role as string] ?? "?") as string,
  };
}

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Fetch initial agents from REST API
    async function fetchAgents() {
      try {
        const res = await fetch(`${API_BASE}/api/agents`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setAgents(data.map(normalizeAgent));
          }
        }
      } catch {
        console.log("[useAgents] Backend unavailable, using mock data");
        setAgents(MOCK_AGENTS);
      } finally {
        setLoading(false);
      }
    }

    fetchAgents();

    // Subscribe to socket events
    const socket = getSocket();

    socket.on("connect", () => {
      setConnected(true);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("initial_state", (data: { agents?: Record<string, unknown>[] }) => {
      if (data.agents && Array.isArray(data.agents)) {
        setAgents(data.agents.map(normalizeAgent));
        setLoading(false);
      }
    });

    socket.on("agent_update", (raw: Record<string, unknown>) => {
      const updatedAgent = normalizeAgent(raw);
      setAgents((prev) =>
        prev.map((a) => (a.id === updatedAgent.id ? updatedAgent : a))
      );
    });

    return () => {
      socket.off("initial_state");
      socket.off("agent_update");
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  return { agents, loading, connected };
}
