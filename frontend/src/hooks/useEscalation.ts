"use client";

import { useState, useEffect } from "react";
import type { Escalation } from "@/lib/types";
import { getSocket } from "@/lib/socket";
import { MOCK_ESCALATION } from "@/lib/mockData";

export function useEscalation() {
  const [escalation, setEscalation] = useState<Escalation | null>(MOCK_ESCALATION);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    socket.on("escalation", (esc: Escalation) => {
      setEscalation(esc);
    });

    socket.on("escalation_resolved", () => {
      setEscalation(null);
    });

    return () => {
      socket.off("escalation");
      socket.off("escalation_resolved");
    };
  }, []);

  const respond = (action: "approve" | "reject" | "investigate" | "skip") => {
    if (!escalation) return;
    const socket = getSocket();
    socket.emit("escalation_response", {
      escalation_id: escalation.id,
      action,
    });
    setEscalation(null);
  };

  const dismiss = () => {
    setEscalation(null);
  };

  return { escalation, loading, respond, dismiss };
}
