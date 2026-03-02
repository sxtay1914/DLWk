"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import type { PhaseSnapshot, SDLCEvent, SDLCPhase } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useSDLC() {
  const [snapshots, setSnapshots] = useState<PhaseSnapshot[]>([]);
  const [phaseEvents, setPhaseEvents] = useState<SDLCEvent[]>([]);
  const [taskData, setTaskData] = useState<{
    events: SDLCEvent[];
    artifacts_by_phase: Record<string, unknown[]>;
  } | null>(null);
  const [activePhase, setActivePhase] = useState<SDLCPhase | null>(null);
  const activePhaseRef = useRef<SDLCPhase | null>(null);
  const [loadingPhase, setLoadingPhase] = useState(false);
  const [loadingTask, setLoadingTask] = useState(false);

  // ── Fetch all phase snapshots for the active trace ──────────────────────
  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sdlc/phases`);
      if (res.ok) {
        const data: PhaseSnapshot[] = await res.json();
        setSnapshots(data);
      }
    } catch {
      // Backend not available — leave empty
    }
  }, []);

  // ── Fetch events for a specific phase (Phase Detail Panel) ─────────────
  const openPhase = useCallback(async (phase: SDLCPhase) => {
    setActivePhase(phase);
    activePhaseRef.current = phase;
    setLoadingPhase(true);
    try {
      const res = await fetch(`${API_BASE}/api/sdlc/phases/${phase}`);
      if (res.ok) {
        const data: SDLCEvent[] = await res.json();
        setPhaseEvents(data);
      }
    } catch {
      setPhaseEvents([]);
    } finally {
      setLoadingPhase(false);
    }
  }, []);

  const closePhase = useCallback(() => {
    setActivePhase(null);
    activePhaseRef.current = null;
    setPhaseEvents([]);
  }, []);

  // ── Fetch events for a single task (Task Activity Panel) ───────────────
  const fetchTaskEvents = useCallback(async (taskId: string) => {
    setLoadingTask(true);
    try {
      const res = await fetch(`${API_BASE}/api/sdlc/task/${taskId}`);
      if (res.ok) {
        const data = await res.json();
        setTaskData(data);
      }
    } catch {
      setTaskData(null);
    } finally {
      setLoadingTask(false);
    }
  }, []);

  // ── Record gate decision ────────────────────────────────────────────────
  const decideGate = useCallback(
    async (gateEventId: string, decision: "approved" | "rejected", feedback?: string) => {
      try {
        await fetch(`${API_BASE}/api/sdlc/gates/${gateEventId}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, feedback: feedback || "" }),
        });
        await fetchSnapshots();
      } catch {}
    },
    [fetchSnapshots]
  );

  // ── Real-time updates ────────────────────────────────────────────────────
  useEffect(() => {
    fetchSnapshots();

    const socket = getSocket();

    const onInitialState = (data: { phase_snapshots?: PhaseSnapshot[] }) => {
      if (data.phase_snapshots) setSnapshots(data.phase_snapshots);
    };

    const onSnapshotUpdate = (snap: PhaseSnapshot) => {
      setSnapshots((prev) => {
        const idx = prev.findIndex((s) => s.phase === snap.phase);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = snap;
          return next;
        }
        return [...prev, snap];
      });
    };

    const onBossChatComplete = () => {
      fetch(`${API_BASE}/api/sdlc/phases`)
        .then((r) => r.json())
        .then((data: PhaseSnapshot[]) => setSnapshots(data))
        .catch(() => {});
    };

    const onSDLCEvent = (evt: SDLCEvent) => {
      const current = activePhaseRef.current;
      if (current && evt.phase === current) {
        setPhaseEvents((prev) => {
          const exists = prev.some((e) => e.event_id === evt.event_id);
          return exists ? prev : [...prev, evt];
        });
      }
    };

    socket.on("initial_state", onInitialState);
    socket.on("phase_snapshot_update", onSnapshotUpdate);
    socket.on("boss_chat_complete", onBossChatComplete);
    socket.on("sdlc_event", onSDLCEvent);

    return () => {
      socket.off("initial_state", onInitialState);
      socket.off("phase_snapshot_update", onSnapshotUpdate);
      socket.off("boss_chat_complete", onBossChatComplete);
      socket.off("sdlc_event", onSDLCEvent);
    };
  }, [fetchSnapshots]);

  return {
    snapshots,
    activePhase,
    phaseEvents,
    taskData,
    loadingPhase,
    loadingTask,
    openPhase,
    closePhase,
    fetchTaskEvents,
    decideGate,
    fetchSnapshots,
  };
}
