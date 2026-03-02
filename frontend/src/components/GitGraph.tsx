"use client";

import { useEffect, useRef, useMemo } from "react";
import type { ActivityEntry } from "@/lib/types";

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

/** Shorten message to ~30 chars */
function shorten(msg: string): string {
  if (msg.length <= 35) return msg;
  return msg.slice(0, 32) + "...";
}

// ── Component ───────────────────────────────────────────────────────────────
interface GitGraphProps {
  activities: ActivityEntry[];
}

export default function GitGraph({ activities }: GitGraphProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities]);

  const lanes = useMemo(() => buildLanes(activities), [activities]);
  const rows = useMemo(() => buildRows(activities, lanes), [activities, lanes]);
  const numLanes = lanes.size;
  const svgW = numLanes > 0 ? PAD + numLanes * LANE_W + PAD : 0;

  const cx = (i: number) => PAD + i * LANE_W + LANE_W / 2;
  const cy = ROW_H / 2;

  return (
    <div className="flex flex-col rounded-xl bg-[var(--bg-column)] overflow-hidden h-full w-[280px] shrink-0">
      <div className="px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Git Graph
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 pb-2">
        {activities.map((entry, i) => {
          const rd = rows[i];
          if (!rd) return null;
          return (
            <div key={entry.id} className="flex items-center gap-1.5" style={{ height: ROW_H }}>
              {/* SVG lane graph */}
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

              {/* Brief label */}
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
          );
        })}

        {activities.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <span className="text-[10px] text-[var(--text-muted)]">No activity</span>
          </div>
        )}
      </div>
    </div>
  );
}
