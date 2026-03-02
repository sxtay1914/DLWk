"use client";

import { useState, useEffect, useCallback } from "react";
import type { PendingFileChange } from "@/lib/types";
import { getSocket } from "@/lib/socket";

export function useFileChanges() {
  const [fileChanges, setFileChanges] = useState<PendingFileChange[]>([]);

  useEffect(() => {
    const socket = getSocket();

    socket.on("initial_state", (data: { file_changes?: PendingFileChange[] }) => {
      if (data.file_changes && Array.isArray(data.file_changes)) {
        setFileChanges(data.file_changes);
      }
    });

    socket.on("file_change_pending", (change: PendingFileChange) => {
      setFileChanges((prev) => [...prev, change]);
    });

    socket.on("file_change_resolved", (data: { id: string; status: string }) => {
      setFileChanges((prev) =>
        prev.filter((fc) => fc.id !== data.id)
      );
    });

    return () => {
      socket.off("initial_state");
      socket.off("file_change_pending");
      socket.off("file_change_resolved");
    };
  }, []);

  const respond = useCallback(
    (changeId: string, action: "approve" | "reject", feedback?: string) => {
      const socket = getSocket();
      socket.emit("file_change_response", {
        change_id: changeId,
        action,
        feedback: feedback || "",
      });
      // Optimistic remove
      setFileChanges((prev) => prev.filter((fc) => fc.id !== changeId));
    },
    []
  );

  return { fileChanges, respond };
}
