"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import type { ActivityEntry, Savepoint } from "@/lib/types";

// ── Constants ───────────────────────────────────────────────────────────────
const LANE_ORDER = [
  "agent-boss",
  "agent-pm",
  "agent-sm",
  "agent-dev",
  "agent-dev2",
  "agent-qa",
  "agent-cr",
];
const LANE_W = 14;
const DOT_R = 3.5;
const LINE_W = 1.5;
const ROW_H = 26;
const PAD = 6;
const DIAMOND_SIZE = 5;

// ── Types ───────────────────────────────────────────────────────────────────
interface LaneInfo {
  agentId: string;
  color: string;
  idx: number;
}

interface RowData {
  laneIdx: number;
  color: string;
  vSegments: { idx: number; color: string; top: boolean; bot: boolean }[];
  diagonal: { from: number; to: number; color: string } | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function buildLanes(entries: ActivityEntry[]): Map<string, LaneInfo> {
  const seen = new Set(entries.map((e) => e.agent_id));
  const lanes = new Map<string, LaneInfo>();
  let i = 0;
  for (const id of LANE_ORDER) {
    if (seen.has(id)) {
      const e = entries.find((x) => x.agent_id === id)!;
      lanes.set(id, { agentId: id, color: e.agent_color, idx: i++ });
    }
  }
  for (const e of entries) {
    if (!lanes.has(e.agent_id)) {
      lanes.set(e.agent_id, { agentId: e.agent_id, color: e.agent_color, idx: i++ });
    }
  }
  return lanes;
}

function buildRows(entries: ActivityEntry[], lanes: Map<string, LaneInfo>): RowData[] {
  if (!entries.length) return [];

  const agentRows = new Map<string, number[]>();
  entries.forEach((e, i) => {
    if (!agentRows.has(e.agent_id)) agentRows.set(e.agent_id, []);
    agentRows.get(e.agent_id)!.push(i);
  });

  return entries.map((entry, rowIdx) => {
    const lane = lanes.get(entry.agent_id)!;
    const vSegments: RowData["vSegments"] = [];

    for (const [aid, info] of lanes) {
      const rows = agentRows.get(aid);
      if (!rows?.length) continue;
      const first = rows[0], last = rows[rows.length - 1];
      if (rowIdx < first || rowIdx > last) continue;

      const isActive = aid === entry.agent_id;
      if (isActive) {
        const pos = rows.indexOf(rowIdx);
        vSegments.push({ idx: info.idx, color: info.color, top: pos > 0, bot: pos < rows.length - 1 });
      } else {
        vSegments.push({ idx: info.idx, color: info.color, top: rowIdx > first, bot: rowIdx < last });
      }
    }

    let diagonal: RowData["diagonal"] = null;
    if (rowIdx > 0) {
      const prev = lanes.get(entries[rowIdx - 1].agent_id)!;
      if (prev.idx !== lane.idx) {
        diagonal = { from: prev.idx, to: lane.idx, color: lane.color };
      }
    }

    return { laneIdx: lane.idx, color: lane.color, vSegments, diagonal };
  });
}

function shorten(msg: string): string {
  if (msg.length <= 35) return msg;
  return msg.slice(0, 32) + "...";
}

// ── Revert Modal ────────────────────────────────────────────────────────────
function RevertModal({ savepoint, futureCount, onConfirm, onCancel }: {
  savepoint: Savepoint;
  futureCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/50" onClick={onCancel}>
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-5 max-w-sm w-full mx-4 slide-up shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">Revert to Savepoint</span>
        </div>

        <div className="rounded-lg bg-[var(--bg-column)] px-3 py-2 mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-3 h-3 text-[#F59E0B] shrink-0" viewBox="0 0 10 10">
              <polygon points="5,0 10,5 5,10 0,5" fill="currentColor" />
            </svg>
            <span className="text-[11px] font-medium text-[var(--text-primary)]">{savepoint.label}</span>
          </div>
          <span className="text-[9px] text-[var(--text-muted)] font-mono ml-5">
            {new Date(savepoint.timestamp).toLocaleTimeString()}
          </span>
        </div>

        <p className="text-[12px] text-[var(--text-secondary)] mb-4 leading-relaxed">
          This will <span className="font-semibold text-[#EF4444]">permanently delete {futureCount} savepoint{futureCount !== 1 ? "s" : ""}</span> that
          came after this point. All tasks, code files, and agent memory will be reverted to this state.
        </p>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-lg text-[12px] font-medium border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 rounded-lg text-[12px] font-semibold bg-[#EF4444] text-white hover:bg-[#DC2626] transition-colors"
          >
            Revert
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────
interface GitGraphProps {
  activities: ActivityEntry[];
  savepoints?: Savepoint[];
  onRevert?: (savepointId: string) => void;
  reverting?: boolean;
}

export default function GitGraph({ activities, savepoints = [], onRevert, reverting }: GitGraphProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [revertTarget, setRevertTarget] = useState<Savepoint | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities]);

  const lanes = useMemo(() => buildLanes(activities), [activities]);
  const rows = useMemo(() => buildRows(activities, lanes), [activities, lanes]);
  const numLanes = lanes.size;
  const svgW = numLanes > 0 ? PAD + numLanes * LANE_W + PAD : 0;

  // Build savepoint index: activity_index → savepoint
  const savepointMap = useMemo(() => {
    const map = new Map<number, Savepoint>();
    for (const sp of savepoints) {
      map.set(sp.activity_index, sp);
    }
    return map;
  }, [savepoints]);

  const cx = (i: number) => PAD + i * LANE_W + LANE_W / 2;
  const cy = ROW_H / 2;

  const handleRevertConfirm = () => {
    if (revertTarget && onRevert) {
      onRevert(revertTarget.id);
    }
    setRevertTarget(null);
  };

  return (
    <>
      <div className="flex flex-col rounded-xl bg-[var(--bg-column)] overflow-hidden max-h-[500px] w-[280px] shrink-0">
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Git Graph
          </span>
          {savepoints.length > 0 && (
            <span className="text-[9px] font-mono text-[var(--text-muted)]">
              {savepoints.length} savepoint{savepoints.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 pb-2">
          {reverting && (
            <div className="flex items-center justify-center py-4">
              <span className="text-[10px] text-[#F59E0B] animate-pulse font-medium">Reverting...</span>
            </div>
          )}

          {activities.map((entry, i) => {
            const rd = rows[i];
            if (!rd) return null;
            const sp = savepointMap.get(i);
            const isSavepoint = !!sp;

            return (
              <div key={entry.id}>
                {/* Savepoint marker row */}
                {isSavepoint && (
                  <div
                    className="flex items-center gap-1.5 cursor-pointer group hover:bg-[var(--bg-card-hover)] rounded-md px-1 -mx-1 transition-colors"
                    style={{ height: ROW_H }}
                    onClick={() => setRevertTarget(sp)}
                    title={`Savepoint: ${sp.label} — Click to revert`}
                  >
                    <svg width={svgW} height={ROW_H} className="shrink-0" style={{ minWidth: svgW }}>
                      {/* Horizontal line across all lanes */}
                      <line
                        x1={PAD} y1={cy}
                        x2={svgW - PAD} y2={cy}
                        stroke="#F59E0B" strokeWidth={1} opacity={0.3}
                        strokeDasharray="2 2"
                      />
                      {/* Diamond marker in center */}
                      <polygon
                        points={`${svgW / 2},${cy - DIAMOND_SIZE} ${svgW / 2 + DIAMOND_SIZE},${cy} ${svgW / 2},${cy + DIAMOND_SIZE} ${svgW / 2 - DIAMOND_SIZE},${cy}`}
                        fill="#F59E0B"
                        className="group-hover:opacity-100 transition-opacity"
                        opacity={0.8}
                      />
                    </svg>
                    <span className="text-[9px] font-semibold text-[#F59E0B] truncate group-hover:text-[#FBBF24] transition-colors">
                      {sp.label}
                    </span>
                  </div>
                )}

                {/* Normal activity row */}
                <div className="flex items-center gap-1.5" style={{ height: ROW_H }}>
                  <svg width={svgW} height={ROW_H} className="shrink-0" style={{ minWidth: svgW }}>
                    {rd.vSegments.map((s) => {
                      const x = cx(s.idx);
                      const active = s.idx === rd.laneIdx;
                      const op = active ? 1 : 0.2;
                      return (
                        <g key={s.idx}>
                          {s.top && <line x1={x} y1={0} x2={x} y2={cy} stroke={s.color} strokeWidth={LINE_W} opacity={op} />}
                          {s.bot && <line x1={x} y1={cy} x2={x} y2={ROW_H} stroke={s.color} strokeWidth={LINE_W} opacity={op} />}
                        </g>
                      );
                    })}
                    {rd.diagonal && (
                      <line
                        x1={cx(rd.diagonal.from)} y1={0}
                        x2={cx(rd.diagonal.to)} y2={cy}
                        stroke={rd.diagonal.color} strokeWidth={LINE_W} opacity={0.45}
                      />
                    )}
                    <circle cx={cx(rd.laneIdx)} cy={cy} r={DOT_R} fill={rd.color} />
                  </svg>

                  <span
                    className="text-[10px] leading-tight truncate text-[var(--text-secondary)]"
                    title={`${entry.agent_name}: ${entry.message}`}
                  >
                    <span className="font-semibold" style={{ color: entry.agent_color }}>
                      {entry.agent_name.replace("Developer-", "Dev").replace("ProjectManager", "PM").replace("ScrumMaster", "SM").replace("CodeReviewer", "CR").replace("QA-Tester", "QA")}
                    </span>{" "}
                    {shorten(entry.message)}
                  </span>
                </div>
              </div>
            );
          })}

          {activities.length === 0 && (
            <div className="flex items-center justify-center py-6">
              <span className="text-[10px] text-[var(--text-muted)]">No activity</span>
            </div>
          )}
        </div>
      </div>

      {/* Revert confirmation modal */}
      {revertTarget && (
        <RevertModal
          savepoint={revertTarget}
          futureCount={savepoints.filter((s) => {
            const targetIdx = savepoints.indexOf(revertTarget);
            return savepoints.indexOf(s) > targetIdx;
          }).length}
          onConfirm={handleRevertConfirm}
          onCancel={() => setRevertTarget(null)}
        />
      )}
    </>
  );
}
