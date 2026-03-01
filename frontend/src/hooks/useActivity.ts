"use client";

import { useState, useEffect } from "react";
import type { ActivityEntry } from "@/lib/types";
import { getSocket, API_BASE } from "@/lib/socket";
import { MOCK_ACTIVITIES } from "@/lib/mockData";

export function useActivity() {
  const [activities, setActivities] = useState<ActivityEntry[]>(MOCK_ACTIVITIES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchActivities() {
      try {
        const res = await fetch(`${API_BASE}/api/activity`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setActivities(data);
          }
        }
      } catch {
        console.log("[useActivity] Backend unavailable, using mock data");
      } finally {
        setLoading(false);
      }
    }

    fetchActivities();

    const socket = getSocket();

    socket.on("activity", (entry: ActivityEntry) => {
      setActivities((prev) => [...prev, entry]);
    });

    return () => {
      socket.off("activity");
    };
  }, []);

  return { activities, loading };
}
