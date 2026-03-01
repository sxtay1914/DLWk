"use client";

import { useState, useEffect } from "react";
import type { ActivityEntry } from "@/lib/types";
import { getSocket, API_BASE } from "@/lib/socket";

export function useActivity() {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchActivities() {
      try {
        const res = await fetch(`${API_BASE}/api/activity`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setActivities(data);
          }
        }
      } catch {
        console.log("[useActivity] Backend unavailable");
      } finally {
        setLoading(false);
      }
    }

    fetchActivities();

    const socket = getSocket();

    socket.on("initial_state", (data: { activity?: ActivityEntry[] }) => {
      if (data.activity && Array.isArray(data.activity)) {
        setActivities(data.activity);
        setLoading(false);
      }
    });

    socket.on("activity", (entry: ActivityEntry) => {
      setActivities((prev) => [...prev, entry]);
    });

    return () => {
      socket.off("initial_state");
      socket.off("activity");
    };
  }, []);

  return { activities, loading };
}
