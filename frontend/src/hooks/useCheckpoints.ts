"use client";

import { useState, useEffect, useCallback } from "react";
import type { Checkpoint } from "@/lib/types";
import { getSocket } from "@/lib/socket";

export function useCheckpoints() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);

  useEffect(() => {
    const socket = getSocket();

    const onInitial = (data: { checkpoints?: Checkpoint[] }) => {
      if (data.checkpoints && Array.isArray(data.checkpoints)) {
        setCheckpoints(data.checkpoints);
      }
    };

    const onNew = (cp: Checkpoint) => {
      setCheckpoints((prev) => [...prev, cp]);
    };

    const onResolved = (data: { checkpoint_id: string; status: string }) => {
      setCheckpoints((prev) =>
        prev.filter((cp) => cp.id !== data.checkpoint_id)
      );
    };

    socket.on("initial_state", onInitial);
    socket.on("task_checkpoint", onNew);
    socket.on("checkpoint_resolved", onResolved);

    return () => {
      socket.off("initial_state", onInitial);
      socket.off("task_checkpoint", onNew);
      socket.off("checkpoint_resolved", onResolved);
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
    },
    []
  );

  return { checkpoints, respond };
}
