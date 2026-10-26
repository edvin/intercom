// The loops an agent runs (Claude Code's /loop and scheduled prompts), as its transcript shows them: the local
// server reports CronCreate / CronDelete / ScheduleWakeup calls, and each session keeps its current list. Only
// its owner sees them. They live as long as the session; this mirrors what the agent did, it never schedules anything.

export interface Loop {
  kind: "cron" | "wakeup";
  id: string;
  prompt: string;
  cron?: string;
  recurring?: boolean;
  next?: number; // a self-paced loop's next wake-up
  at: number; // when it was set (or last re-armed)
}

/** One loop event from the local server. */
export interface LoopEvent {
  op: "cron" | "cron_delete" | "wakeup" | "wakeup_stop";
  id?: string;
  cron?: string;
  recurring?: boolean;
  prompt?: string;
  delay?: number;
}

const DAY = 86400_000;
const promptText = (p: string) => (/^<<autonomous-loop/.test(p) ? "autonomous loop" : p);
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Apply events in order; returns the new list and a readable line for each change worth showing. */
export function applyLoopEvents(loops: Loop[], events: { at: number; ev: LoopEvent }[]): { loops: Loop[]; lines: { at: number; text: string }[] } {
  let list = [...loops];
  const lines: { at: number; text: string }[] = [];
  for (const { at, ev } of events) {
    if (ev.op === "cron" && ev.cron) {
      const l: Loop = { kind: "cron", id: clip(ev.id, 64) || `cron-${at}`, cron: clip(ev.cron, 64), recurring: ev.recurring !== false, prompt: clip(ev.prompt, 200), at };
      list = [...list.filter((x) => x.id !== l.id), l];
      lines.push({ at, text: `started ${describe(l, at)}` });
    } else if (ev.op === "cron_delete") {
      const crons = list.filter((x) => x.kind === "cron");
      const gone = crons.find((x) => x.id === ev.id) ?? (crons.length === 1 ? crons[0] : undefined);
      if (gone) {
        list = list.filter((x) => x !== gone);
        lines.push({ at, text: `stopped ${describe(gone, at)}` });
      }
    } else if (ev.op === "wakeup") {
      const had = list.some((x) => x.kind === "wakeup");
      const l: Loop = { kind: "wakeup", id: "wakeup", prompt: clip(ev.prompt, 200), next: at + Math.max(0, Number(ev.delay) || 0) * 1000, at };
      list = [...list.filter((x) => x.kind !== "wakeup"), l];
      // Self-paced loops re-arm every turn; only the start is news.
      if (!had) lines.push({ at, text: `started a self-paced loop${l.prompt ? `: ${promptText(l.prompt)}` : ""}` });
    } else if (ev.op === "wakeup_stop") {
      const gone = list.find((x) => x.kind === "wakeup");
      list = list.filter((x) => x.kind !== "wakeup");
      if (gone) lines.push({ at, text: "stopped its self-paced loop" });
    }
  }
  return { loops: list, lines };
}

/**
 * Loops still running: a self-paced one that re-armed in time (a wake-up more than 15 minutes overdue means it
 * stopped re-arming), recurring jobs within Claude Code's 7-day expiry, one-shot jobs for a day.
 */
export function activeLoops(loops: Loop[], now = Date.now()): Loop[] {
  return loops.filter((l) =>
    l.kind === "wakeup" ? (l.next ?? 0) > now - 15 * 60_000 : l.recurring !== false ? l.at > now - 7 * DAY : l.at > now - DAY,
  );
}

/** "every 20m", "hourly at :07", "weekdays at 09:03", or the cron itself. */
export function describeCron(cron: string): string {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return cron;
  const [m, h, dom, mon, dow] = f as [string, string, string, string, string];
  const rest = dom === "*" && mon === "*";
  const hhmm = () => `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  if (rest && dow === "*" && h === "*" && /^\*\/\d+$/.test(m)) return `every ${m.slice(2)}m`;
  if (rest && dow === "*" && h === "*" && /^\d+$/.test(m)) return `hourly at :${m.padStart(2, "0")}`;
  if (rest && dow === "*" && /^\*\/\d+$/.test(h) && /^\d+$/.test(m)) return `every ${h.slice(2)}h`;
  if (rest && /^\d+$/.test(h) && /^\d+$/.test(m)) return dow === "*" ? `daily at ${hhmm()}` : dow === "1-5" ? `weekdays at ${hhmm()}` : `${hhmm()} (${cron})`;
  return cron;
}

/** "loop every 20m: /babysit-prs", "self-paced loop, next in 14m: check the deploy", "one-shot at 14:30: …". */
export function describe(l: Loop, now = Date.now()): string {
  const what = l.prompt ? `: ${promptText(l.prompt)}` : "";
  if (l.kind === "wakeup") {
    const mins = Math.round(((l.next ?? now) - now) / 60_000);
    return `self-paced loop${mins > 0 ? `, next in ${mins}m` : mins > -15 ? ", waking now" : ""}${what}`;
  }
  return `${l.recurring === false ? "one-shot" : "loop"} ${describeCron(l.cron ?? "")}${what}`;
}

export const parseLoops = (raw: string | null | undefined): Loop[] => {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? (v as Loop[]) : [];
  } catch {
    return [];
  }
};
