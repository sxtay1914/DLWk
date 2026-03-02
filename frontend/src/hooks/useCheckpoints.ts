"use client";

import { useState, useEffect, useCallback } from "react";
import type { Checkpoint } from "@/lib/types";
import { getSocket } from "@/lib/socket";

export function useCheckpoints() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);

  useEffect(() => {
    const socket = getSocket();

    socket.on("initial_state", (data: { checkpoints?: Checkpoint[] }) => {
      if (data.checkpoints && Array.isArray(data.checkpoints)) {
        setCheckpoints(data.checkpoints);
      }
    });

    socket.on("task_checkpoint", (cp: Checkpoint) => {
      setCheckpoints((prev) => [...prev, cp]);
    });

    socket.on("checkpoint_resolved", (data: { checkpoint_id: string; status: string }) => {
      setCheckpoints((prev) =>
        prev.filter((cp) => cp.id !== data.checkpoint_id)
      );
    });

    return () => {
      socket.off("initial_state");
      socket.off("task_checkpoint");
      socket.off("checkpoint_resolved");
    };
  }, []);

  const respond = useCallback(
    (checkpointId: string, action: "approve" | "request_changes" | "pause", feedback?: string) => {
      const socket = getSocket();
      socket.emit("checkpoint_response", {
        checkpoint_id: checkpointId,
        action,
        feedback,
      });
      // Optimistic remove
      setCheckpoints((prev) => prev.filter((cp) => cp.id !== checkpointId));
    },
    []
  );

  return { checkpoints, respond };
}
