"use client";

import { useState, useEffect, useCallback } from "react";
import type { PendingFileChange } from "@/lib/types";
import { getSocket } from "@/lib/socket";

export function useFileChanges() {
  const [fileChanges, setFileChanges] = useState<PendingFileChange[]>([]);

  useEffect(() => {
    const socket = getSocket();

    const onInitial = (data: { file_changes?: PendingFileChange[] }) => {
      if (data.file_changes && Array.isArray(data.file_changes)) {
        setFileChanges(data.file_changes);
      }
    };

    const onPending = (change: PendingFileChange) => {
      setFileChanges((prev) => [...prev, change]);
    };

    const onResolved = (data: { id: string; status: string }) => {
      setFileChanges((prev) =>
        prev.filter((fc) => fc.id !== data.id)
      );
    };

    socket.on("initial_state", onInitial);
    socket.on("file_change_pending", onPending);
    socket.on("file_change_resolved", onResolved);

    return () => {
      socket.off("initial_state", onInitial);
      socket.off("file_change_pending", onPending);
      socket.off("file_change_resolved", onResolved);
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
    },
    []
  );

  return { fileChanges, respond };
}
