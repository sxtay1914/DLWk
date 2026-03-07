"use client";

import { useState, useEffect, useCallback } from "react";
import type { Savepoint } from "@/lib/types";
import { getSocket, API_BASE } from "@/lib/socket";

export function useSavepoints() {
  const [savepoints, setSavepoints] = useState<Savepoint[]>([]);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    async function fetchSavepoints() {
      try {
        const res = await fetch(`${API_BASE}/api/savepoints`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setSavepoints(data);
        }
      } catch {
        // backend offline
      }
    }

    fetchSavepoints();

    const socket = getSocket();

    socket.on("initial_state", (data: { savepoints?: Savepoint[] }) => {
      if (data.savepoints && Array.isArray(data.savepoints)) {
        setSavepoints(data.savepoints);
      }
    });

    socket.on("savepoint_created", (sp: Savepoint) => {
      setSavepoints((prev) => [...prev, sp]);
    });

    socket.on("savepoint_reverted", () => {
      // Full page reload to refresh all state from backend
      setTimeout(() => window.location.reload(), 500);
    });

    return () => {
      socket.off("initial_state");
      socket.off("savepoint_created");
      socket.off("savepoint_reverted");
    };
  }, []);

  const revertTo = useCallback(async (savepointId: string) => {
    setReverting(true);
    try {
      const socket = getSocket();
      socket.emit("revert_savepoint", { savepoint_id: savepointId });
    } catch {
      setReverting(false);
    }
  }, []);

  return { savepoints, reverting, revertTo };
}
