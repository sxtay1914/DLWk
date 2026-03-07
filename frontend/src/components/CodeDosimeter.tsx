"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import type { ActivityEntry, Task, Agent, Checkpoint, PendingFileChange } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────
interface DosimeterProps {
  activities: ActivityEntry[];
  tasks: Task[];
  agents: Agent[];
  checkpoints: Checkpoint[];
  fileChanges: PendingFileChange[];
}

interface StatItem {
  label: string;
  value: string | number;
  color?: string;
  icon?: "check" | "warn" | "error" | "info";
}

interface RingMeta {
  value: number;
  label: string;
  subtitle: string;
  stats: StatItem[];
}

interface Scores {
  readability: RingMeta;
  risk: RingMeta;
  crConfidence: RingMeta;
  overall: number;
  status: "OPTIMAL" | "MODERATE" | "CAUTION" | "CRITICAL";
  history: { read: number; risk: number; cr: number }[];
}

// ── Score computation ────────────────────────────────────────────────────────
function computeScores(
  activities: ActivityEntry[],
  tasks: Task[],
  agents: Agent[],
  checkpoints: Checkpoint[],
  fileChanges: PendingFileChange[],
): Scores {
  const crActivities = activities.filter((a) => a.agent_id === "agent-cr");

  // ── READABILITY ──────────────────────────────────────────────────────────
  const totalFileDecisions = fileChanges.filter((f) => f.status !== "pending").length;
  const acceptedFiles = fileChanges.filter((f) => f.status === "approved").length;
  const rejectedFiles = fileChanges.filter((f) => f.status === "rejected").length;
  const pendingFiles = fileChanges.filter((f) => f.status === "pending").length;
  const acceptRate = totalFileDecisions > 0 ? acceptedFiles / totalFileDecisions : 0;

  let crPositive = 0, crNegative = 0;
  for (const a of crActivities) {
    const m = a.message.toLowerCase();
    if (m.includes("clean") || m.includes("readable") || m.includes("well") || m.includes("good") || m.includes("solid") || m.includes("lgtm") || m.includes("approved")) crPositive++;
    if (m.includes("complex") || m.includes("nested") || m.includes("refactor") || m.includes("messy") || m.includes("unclear") || m.includes("issue") || m.includes("bug")) crNegative++;
  }

  const sizeMap: Record<string, number> = { small: 1, medium: 2, large: 3, xl: 4 };
  const taskSizes = tasks.map((t) => sizeMap[(t.estimated_size || "medium").toLowerCase()] || 2);
  const avgSize = taskSizes.length > 0 ? taskSizes.reduce((a, b) => a + b, 0) / taskSizes.length : 2;
  const avgSizeLabel = avgSize <= 1.5 ? "Small" : avgSize <= 2.5 ? "Medium" : "Large";
  const filesPerTask = tasks.length > 0 ? (fileChanges.length / tasks.length).toFixed(1) : "0";

  let readVal = 75;
  if (totalFileDecisions > 0) readVal += acceptRate * 20;
  if (crActivities.length > 0) readVal += (crPositive - crNegative) * 3;
  readVal = Math.max(10, Math.min(100, Math.round(readVal)));

  const readStats: StatItem[] = [
    { label: "Task complexity", value: avgSizeLabel, icon: avgSize <= 2 ? "check" : avgSize <= 3 ? "warn" : "error" },
    { label: "Files per task", value: filesPerTask, icon: "info" },
    { label: "Rejected changes", value: `${rejectedFiles}/${totalFileDecisions || fileChanges.length}`, icon: rejectedFiles > 0 ? "warn" : "check" },
    { label: "Clean pass rate", value: totalFileDecisions > 0 ? `${Math.round(acceptRate * 100)}%` : "N/A", icon: acceptRate >= 0.8 ? "check" : acceptRate >= 0.5 ? "warn" : "error" },
  ];

  // ── RISK ─────────────────────────────────────────────────────────────────
  const p0Tasks = tasks.filter((t) => t.priority === "P0" && t.status !== "done").length;
  const stuckInReview = tasks.filter((t) => t.status === "review").length;
  const rejectedCheckpoints = checkpoints.filter((c) => c.status === "changes_requested").length;
  const totalCheckpoints = checkpoints.length;

  const allRiskTags: string[] = [];
  for (const t of tasks) {
    if (t.risk_tags) t.risk_tags.split(",").map((r) => r.trim()).filter(Boolean).forEach((r) => allRiskTags.push(r));
  }
  const uniqueRiskTags = [...new Set(allRiskTags)];

  // Only count activity entries explicitly typed as "error" or "warning"
  const errorTypedActivities = activities.filter((a) => a.type === "error" || a.type === "warning");

  let riskVal = 95;
  riskVal -= p0Tasks * 8;
  riskVal -= stuckInReview * 3;
  riskVal -= rejectedCheckpoints * 5;
  riskVal -= Math.min(20, errorTypedActivities.length * 4);
  riskVal -= Math.min(10, uniqueRiskTags.length * 3);
  riskVal = Math.max(10, Math.min(100, Math.round(riskVal)));

  const riskStats: StatItem[] = [
    { label: "P0 tasks open", value: p0Tasks, icon: p0Tasks > 0 ? "error" : "check" },
    { label: "Stuck in review", value: stuckInReview, icon: stuckInReview > 2 ? "error" : stuckInReview > 0 ? "warn" : "check" },
    { label: "Rejected checkpoints", value: `${rejectedCheckpoints}/${totalCheckpoints}`, icon: rejectedCheckpoints > 0 ? "warn" : "check" },
    { label: "Risk tags", value: uniqueRiskTags.length > 0 ? uniqueRiskTags.slice(0, 3).join(", ") : "None", icon: uniqueRiskTags.length > 2 ? "error" : uniqueRiskTags.length > 0 ? "warn" : "check" },
  ];

  // ── CR CONFIDENCE ────────────────────────────────────────────────────────
  const crAgent = agents.find((a) => a.id === "agent-cr");
  const crIsActive = crAgent && crAgent.status !== "idle";
  const totalFiles = fileChanges.length;
  const crCheckpoints = checkpoints.filter((c) => c.agent_id === "agent-cr");
  const crApproved = crCheckpoints.filter((c) => c.status === "approved").length;
  const crFlagged = crCheckpoints.filter((c) => c.status === "changes_requested").length;

  const lastCrActivity = crActivities.length > 0 ? crActivities[crActivities.length - 1] : null;
  const timeSinceCr = lastCrActivity ? Math.round((Date.now() - new Date(lastCrActivity.timestamp).getTime()) / 60000) : -1;

  let crVal = 0;
  if (crActivities.length > 0) {
    crVal = 50 + Math.min(30, crActivities.length * 4) + crApproved * 6 - crFlagged * 3 + crPositive * 3 - crNegative * 2;
  }
  crVal = Math.max(0, Math.min(100, Math.round(crVal)));

  const crStats: StatItem[] = [
    { label: "Review entries", value: crActivities.length, icon: crActivities.length > 0 ? "check" : "info" },
    { label: "Files staged", value: `${totalFiles} (${pendingFiles} pending)`, icon: pendingFiles > 3 ? "warn" : "check" },
    { label: "Issues flagged", value: crFlagged + crNegative, icon: (crFlagged + crNegative) > 2 ? "error" : (crFlagged + crNegative) > 0 ? "warn" : "check" },
    { label: "Last review", value: timeSinceCr >= 0 ? (timeSinceCr < 1 ? "Just now" : `${timeSinceCr}m ago`) : "Pending", icon: crIsActive ? "check" : timeSinceCr >= 0 ? "info" : "warn" },
  ];

  // ── OVERALL ──────────────────────────────────────────────────────────────
  const overall = Math.round(readVal * 0.4 + riskVal * 0.35 + crVal * 0.25);
  let status: Scores["status"] = "OPTIMAL";
  if (overall < 30) status = "CRITICAL";
  else if (overall < 50) status = "CAUTION";
  else if (overall < 70) status = "MODERATE";

  // ── HISTORY ──────────────────────────────────────────────────────────────
  const history: Scores["history"] = [];
  const step = Math.max(1, Math.floor(activities.length / 10));
  for (let i = step; i <= activities.length; i += step) {
    const slice = activities.slice(0, i);
    const crSlice = slice.filter((a) => a.agent_id === "agent-cr");
    const errSlice = slice.filter((a) => a.type === "error" || a.type === "warning");
    const r = Math.max(10, Math.min(100, 75 + crSlice.filter((a) => a.message.toLowerCase().match(/clean|good|solid/)).length * 3));
    const ri = Math.max(10, Math.min(100, 95 - Math.min(20, errSlice.length * 4)));
    const c = crSlice.length > 0 ? Math.min(100, 50 + crSlice.length * 6) : 0;
    history.push({ read: r, risk: ri, cr: c });
  }
  if (history.length === 0) history.push({ read: readVal, risk: riskVal, cr: crVal });

  return {
    readability: { value: readVal, label: "Readability", subtitle: "Code quality & acceptance rate", stats: readStats },
    risk: { value: riskVal, label: "Stability", subtitle: "Low blockers & clean execution", stats: riskStats },
    crConfidence: { value: crVal, label: "CR Confidence", subtitle: "Review coverage & approval rate", stats: crStats },
    overall, status, history,
  };
}

// ── SVG helpers ──────────────────────────────────────────────────────────────
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function scoreColor(value: number): string {
  if (value >= 75) return "#22C55E";
  if (value >= 50) return "#F59E0B";
  if (value >= 30) return "#F97316";
  return "#EF4444";
}

function statusColor(status: string): string {
  switch (status) {
    case "OPTIMAL": return "#22C55E";
    case "MODERATE": return "#F59E0B";
    case "CAUTION": return "#F97316";
    case "CRITICAL": return "#EF4444";
    default: return "#6B7280";
  }
}

function renderTicks(cx: number, cy: number, r: number, count: number) {
  const ticks = [];
  for (let i = 0; i <= count; i++) {
    const angle = -225 + (i / count) * 270 + 360;
    const inner = polarToCartesian(cx, cy, r - 2, angle);
    const outer = polarToCartesian(cx, cy, r + 2, angle);
    ticks.push(<line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--text-muted)" strokeWidth={0.5} opacity={0.3} />);
  }
  return ticks;
}

// ── Spark particles ──────────────────────────────────────────────────────────
function SparkParticles({ cx, cy, r, color, intensity }: { cx: number; cy: number; r: number; color: string; intensity: number }) {
  const [sparks, setSparks] = useState<{ id: number; angle: number }[]>([]);
  const idRef = useRef(0);
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > intensity / 100) return;
      const id = idRef.current++;
      const angle = -225 + Math.random() * 270 + 360;
      setSparks((prev) => [...prev.slice(-5), { id, angle }]);
      setTimeout(() => setSparks((prev) => prev.filter((s) => s.id !== id)), 600);
    }, 200);
    return () => clearInterval(interval);
  }, [intensity]);
  return (
    <>
      {sparks.map((s) => {
        const pos = polarToCartesian(cx, cy, r, s.angle);
        return <circle key={s.id} cx={pos.x} cy={pos.y} r={1.5} fill={color} className="animate-ping" />;
      })}
    </>
  );
}

// ── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, color, width = 80, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth={1} opacity={0.3} strokeDasharray="2 2" />
      </svg>
    );
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {(() => {
        const lastY = height - ((data[data.length - 1] - min) / range) * (height - 4) - 2;
        return <circle cx={width} cy={lastY} r={2} fill={color} />;
      })()}
    </svg>
  );
}

// ── Status icon ──────────────────────────────────────────────────────────────
function StatusIcon({ icon }: { icon: StatItem["icon"] }) {
  const cls = "w-3 h-3 shrink-0";
  switch (icon) {
    case "check": return <svg className={cls} viewBox="0 0 16 16" fill="#22C55E"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm3.03 4.97a.75.75 0 00-1.06 0L7 8.94 5.53 7.47a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l3.5-3.5a.75.75 0 000-1.06z"/></svg>;
    case "warn": return <svg className={cls} viewBox="0 0 16 16" fill="#F59E0B"><path d="M8 1.5l6.928 12H1.072L8 1.5zM7.25 10.5h1.5V12h-1.5v-1.5zm0-4.5h1.5v3h-1.5V6z"/></svg>;
    case "error": return <svg className={cls} viewBox="0 0 16 16" fill="#EF4444"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zM5.97 5.97a.75.75 0 00-1.06 1.06L6.94 9l-2.03 2.03a.75.75 0 101.06 1.06L8 10.06l1.97 1.97a.75.75 0 101.06-1.06L9.06 9l2.03-2.03a.75.75 0 00-1.06-1.06L8 7.94 5.97 5.97z"/></svg>;
    default: return <svg className={cls} viewBox="0 0 16 16" fill="var(--text-muted)"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm-.75 4v4.5h1.5V5h-1.5zm0 6v1.5h1.5V11h-1.5z"/></svg>;
  }
}

// ── Agent Utilization ────────────────────────────────────────────────────────
const EFFORT_WEIGHT: Record<string, number> = {
  working: 1.0,
  thinking: 0.8,
  meeting: 0.6,
  celebrating: 0.3,
  idle: 0,
};

function AgentUtilization({ agents }: { agents: Agent[] }) {
  const execAgents = agents.filter((a) => a.id !== "agent-boss");
  const efforts = execAgents.map((a) => ({ agent: a, effort: EFFORT_WEIGHT[a.status] ?? 0 }));
  const totalEffort = efforts.reduce((sum, e) => sum + e.effort, 0);
  const utilPct = execAgents.length > 0 ? Math.round((totalEffort / execAgents.length) * 100) : 0;
  // Animation speed: faster when busier (2s at 100%, 8s at 0%)
  const animDuration = utilPct > 0 ? `${Math.max(1.5, 8 - utilPct * 0.065)}s` : "0s";
  const barColor = utilPct > 80 ? "#F59E0B" : utilPct > 0 ? "#22C55E" : "var(--text-muted)";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-[var(--text-secondary)]">Team Utilization</span>
          {/* Tiny agent dots */}
          <div className="flex -space-x-0.5">
            {efforts.map(({ agent, effort }) => (
              <div
                key={agent.id}
                className="w-2.5 h-2.5 rounded-full border border-[var(--bg-column)] transition-all duration-500"
                style={{
                  backgroundColor: effort > 0 ? agent.color : "var(--border-subtle)",
                  opacity: effort > 0 ? 0.4 + effort * 0.6 : 0.25,
                }}
                title={`${agent.name}: ${agent.status}`}
              />
            ))}
          </div>
        </div>
        <span className="text-[10px] font-mono tabular-nums font-semibold" style={{ color: barColor }}>
          {utilPct}%
        </span>
      </div>

      {/* Living bar */}
      <div className="h-1.5 rounded-full bg-[var(--bg-card)] overflow-hidden">
        <div
          className="h-full rounded-full relative overflow-hidden transition-all duration-700"
          style={{ width: `${Math.max(utilPct, 2)}%` }}
        >
          {/* Base fill */}
          <div className="absolute inset-0" style={{ backgroundColor: barColor, opacity: 0.7 }} />
          {/* Animated shimmer that flows faster when busy */}
          {utilPct > 0 && (
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg, transparent 0%, ${barColor} 50%, transparent 100%)`,
                backgroundSize: "200% 100%",
                animation: `shimmer ${animDuration} ease-in-out infinite`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ticker ───────────────────────────────────────────────────────────────────
function Ticker({ activities, tasks, fileChanges, checkpoints }: { activities: ActivityEntry[]; tasks: Task[]; fileChanges: PendingFileChange[]; checkpoints: Checkpoint[] }) {
  const items: string[] = [];

  const crMsgs = activities.filter((a) => a.agent_id === "agent-cr").slice(-4);
  for (const a of crMsgs) items.push(`CR: "${a.message.length > 50 ? a.message.slice(0, 47) + "..." : a.message}"`);

  const accepted = fileChanges.filter((f) => f.status === "approved").length;
  const rejected = fileChanges.filter((f) => f.status === "rejected").length;
  const pending = fileChanges.filter((f) => f.status === "pending").length;
  if (fileChanges.length > 0) items.push(`Files: ${accepted} accepted, ${rejected} rejected, ${pending} pending`);

  const qaFails = activities.filter((a) => a.agent_id === "agent-qa" && a.message.toLowerCase().includes("fail")).slice(-2);
  for (const a of qaFails) items.push(`QA: ${a.message.length > 45 ? a.message.slice(0, 42) + "..." : a.message}`);

  const doneTasks = tasks.filter((t) => t.status === "done").length;
  if (tasks.length > 0) items.push(`Sprint: ${doneTasks}/${tasks.length} tasks complete`);

  const p0Open = tasks.filter((t) => t.priority === "P0" && t.status !== "done").length;
  if (p0Open > 0) items.push(`ALERT: ${p0Open} P0 task${p0Open > 1 ? "s" : ""} open`);

  const pendingCp = checkpoints.filter((c) => c.status === "pending").length;
  if (pendingCp > 0) items.push(`${pendingCp} checkpoint${pendingCp > 1 ? "s" : ""} awaiting approval`);

  if (items.length === 0) items.push("System online — awaiting agent activity...");

  const text = items.join("  \u2022  ");
  return (
    <div className="overflow-hidden whitespace-nowrap px-4 py-2 border-t border-[var(--border-subtle)]">
      <div className="inline-block animate-ticker text-[10px] text-[var(--text-muted)] font-mono">
        {text}<span className="mx-16">{text}</span>
      </div>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ title, subtitle, stats, color, sparkData, score }: {
  title: string; subtitle: string; stats: StatItem[]; color: string; sparkData: number[]; score: number;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 space-y-3">
      {/* Header with score badge */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}50` }} />
            <span className="text-[11px] font-semibold text-[var(--text-primary)]">{title}</span>
          </div>
          <span className="text-[9px] text-[var(--text-muted)]">{subtitle}</span>
        </div>
        <div className="flex items-center gap-2">
          <Sparkline data={sparkData} color={color} width={60} height={20} />
          <div
            className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tabular-nums"
            style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}
          >
            {score}
          </div>
        </div>
      </div>

      {/* Stats list */}
      <div className="space-y-1.5">
        {stats.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <StatusIcon icon={s.icon} />
            <span className="text-[10px] text-[var(--text-muted)] flex-1">{s.label}</span>
            <span className="text-[10px] font-mono tabular-nums font-medium text-[var(--text-primary)]">
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function CodeDosimeter({ activities, tasks, agents, checkpoints, fileChanges }: DosimeterProps) {
  const scores = useMemo(
    () => computeScores(activities, tasks, agents, checkpoints, fileChanges),
    [activities, tasks, agents, checkpoints, fileChanges],
  );
  const [hoveredRing, setHoveredRing] = useState<"readability" | "risk" | "cr" | null>(null);
  const [animatedScores, setAnimatedScores] = useState({ read: 0, risk: 0, cr: 0, overall: 0 });

  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    const from = { ...animatedScores };
    const to = { read: scores.readability.value, risk: scores.risk.value, cr: scores.crConfidence.value, overall: scores.overall };
    function animate(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setAnimatedScores({
        read: Math.round(from.read + (to.read - from.read) * ease),
        risk: Math.round(from.risk + (to.risk - from.risk) * ease),
        cr: Math.round(from.cr + (to.cr - from.cr) * ease),
        overall: Math.round(from.overall + (to.overall - from.overall) * ease),
      });
      if (t < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores]);

  const pulseClass = scores.status === "CRITICAL" ? "animate-pulse" : scores.status === "CAUTION" ? "animate-pulse-slow" : "";

  const SVG_SIZE = 220;
  const CX = SVG_SIZE / 2;
  const CY = SVG_SIZE / 2;
  const ARC_START = 135;
  const ARC_SPAN = 270;

  const RING_LABELS = ["READ", "STAB", "CR"];
  const rings = [
    { key: "readability" as const, r: 96, width: 10, score: animatedScores.read, data: scores.readability },
    { key: "risk" as const, r: 78, width: 10, score: animatedScores.risk, data: scores.risk },
    { key: "cr" as const, r: 60, width: 10, score: animatedScores.cr, data: scores.crConfidence },
  ];

  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const totalTasks = tasks.length;
  const velocity = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <section className="rounded-xl bg-[var(--bg-column)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: statusColor(scores.status), boxShadow: `0 0 10px ${statusColor(scores.status)}60` }}
          />
          <span className="text-[11px] font-semibold text-[var(--text-primary)]">Code Dosimeter</span>
          <span className="text-[9px] text-[var(--text-muted)] font-mono ml-1">Higher = healthier</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)] font-mono">
          <span>{doneTasks}/{totalTasks} tasks</span>
          <span>{velocity}% velocity</span>
          <span>{activities.length} events</span>
        </div>
      </div>

      <div className="flex gap-5 p-4">
        {/* LEFT: Gauge + ring legend */}
        <div className="flex flex-col items-center shrink-0">
          {/* SVG Gauge */}
          <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
            <defs>
              <pattern id="dosimeter-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="var(--text-muted)" strokeWidth={0.15} opacity={0.15} />
              </pattern>
              {rings.map((ring) => {
                const color = scoreColor(ring.score);
                return (
                  <filter key={`glow-${ring.key}`} id={`glow-${ring.key}`}>
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feFlood floodColor={color} floodOpacity="0.4" />
                    <feComposite in2="blur" operator="in" />
                    <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                );
              })}
            </defs>
            <circle cx={CX} cy={CY} r={100} fill="url(#dosimeter-grid)" opacity={0.3} />

            {rings.map((ring, idx) => {
              const color = scoreColor(ring.score);
              const endAngle = ARC_START + (ring.score / 100) * ARC_SPAN;
              const isHovered = hoveredRing === ring.key;

              // Ring label position — at the start of the arc
              const labelPos = polarToCartesian(CX, CY, ring.r, ARC_START - 8);

              return (
                <g key={ring.key}>
                  {renderTicks(CX, CY, ring.r, 10)}
                  <path d={describeArc(CX, CY, ring.r, ARC_START, ARC_START + ARC_SPAN)}
                    fill="none" stroke="var(--text-muted)" strokeWidth={ring.width} strokeLinecap="round" opacity={0.08} />
                  {ring.score > 0 && (
                    <path d={describeArc(CX, CY, ring.r, ARC_START, endAngle)}
                      fill="none" stroke={color} strokeWidth={isHovered ? ring.width + 3 : ring.width}
                      strokeLinecap="round" filter={`url(#glow-${ring.key})`}
                      style={{ transition: "stroke-width 0.2s" }}
                      onMouseEnter={() => setHoveredRing(ring.key)}
                      onMouseLeave={() => setHoveredRing(null)}
                      className="cursor-pointer" />
                  )}
                  {/* Ring label */}
                  <text x={labelPos.x} y={labelPos.y + 1} textAnchor="middle"
                    className="text-[6px] font-bold font-mono" fill={color} opacity={0.7}>
                    {RING_LABELS[idx]}
                  </text>
                  <SparkParticles cx={CX} cy={CY} r={ring.r} color={color} intensity={100 - ring.score} />
                </g>
              );
            })}

            {/* Center */}
            <text x={CX} y={CY - 12} textAnchor="middle"
              className={`text-[32px] font-bold ${pulseClass}`}
              fill={statusColor(scores.status)} style={{ fontVariantNumeric: "tabular-nums" }}>
              {animatedScores.overall}
            </text>
            <text x={CX} y={CY + 6} textAnchor="middle" className="text-[9px] font-mono" fill="var(--text-muted)">
              / 100
            </text>
            <text x={CX} y={CY + 22} textAnchor="middle"
              className="text-[10px] font-bold tracking-[0.15em]" fill={statusColor(scores.status)}>
              {scores.status}
            </text>
          </svg>

          {/* Ring legend below gauge */}
          <div className="flex gap-4 mt-1">
            {rings.map((ring, idx) => {
              const color = scoreColor(ring.score);
              return (
                <div key={ring.key} className="flex items-center gap-1.5 cursor-pointer"
                  onMouseEnter={() => setHoveredRing(ring.key)} onMouseLeave={() => setHoveredRing(null)}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[9px] text-[var(--text-muted)]">{ring.data.label}</span>
                  <span className="text-[9px] font-mono font-bold" style={{ color }}>{ring.score}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Stat cards + utilization */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <StatCard
              title="Readability"
              subtitle={scores.readability.subtitle}
              stats={scores.readability.stats}
              color={scoreColor(animatedScores.read)}
              sparkData={scores.history.map((h) => h.read)}
              score={animatedScores.read}
            />
            <StatCard
              title="Stability"
              subtitle={scores.risk.subtitle}
              stats={scores.risk.stats}
              color={scoreColor(animatedScores.risk)}
              sparkData={scores.history.map((h) => h.risk)}
              score={animatedScores.risk}
            />
            <StatCard
              title="CR Confidence"
              subtitle={scores.crConfidence.subtitle}
              stats={scores.crConfidence.stats}
              color={scoreColor(animatedScores.cr)}
              sparkData={scores.history.map((h) => h.cr)}
              score={animatedScores.cr}
            />
          </div>

          {/* Agent utilization */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
            <AgentUtilization agents={agents} />
          </div>
        </div>
      </div>

      {/* Ticker */}
      <Ticker activities={activities} tasks={tasks} fileChanges={fileChanges} checkpoints={checkpoints} />
    </section>
  );
}
