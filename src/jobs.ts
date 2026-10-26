// Background jobs of an agent (shell commands it runs in the background), as its transcript shows them: the
// local server reports when one starts and when Claude Code says it ended. Only the session's owner sees them.

export interface Job {
  id: string;
  description: string;
  command: string;
  at: number;
}

export interface JobEvent {
  op: "start" | "end";
  id?: string;
  description?: string;
  command?: string;
  status?: string;
  summary?: string;
}

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const MAX_AGE = 24 * 3600_000; // a job we never saw end (the mirror started later) doesn't linger

export const jobName = (j: Pick<Job, "description" | "command">) => j.description || j.command || "a background command";

/** Apply events in order: the running list, and a line for each job that ended. */
export function applyJobEvents(jobs: Job[], events: { at: number; ev: JobEvent }[]): { jobs: Job[]; lines: { at: number; text: string }[] } {
  let list = [...jobs];
  const lines: { at: number; text: string }[] = [];
  for (const { at, ev } of events) {
    const id = clip(ev.id, 64);
    if (!id) continue;
    if (ev.op === "start") {
      list = [...list.filter((j) => j.id !== id), { id, description: clip(ev.description, 160), command: clip(ev.command, 200), at }].slice(-20);
    } else if (ev.op === "end") {
      const job = list.find((j) => j.id === id);
      list = list.filter((j) => j.id !== id);
      // "Background command "Deploy…" completed (exit code 0)": take the name from our record, else the summary.
      const name = job ? jobName(job) : (ev.summary?.match(/"([^"]+)"/)?.[1] ?? "a background job");
      const exit = ev.summary?.match(/exit code (\d+)/)?.[1];
      const took = job ? ` after ${duration(at - job.at)}` : "";
      const status = ev.status ?? "";
      const verb = status === "completed" ? "✓ finished" : status === "failed" ? "✗ failed" : status === "killed" || status === "stopped" ? "■ stopped" : `ended (${clip(status, 20) || "?"})`;
      lines.push({ at, text: `${verb}: ${name}${exit && exit !== "0" ? ` (exit ${exit})` : ""}${took}` });
    }
  }
  return { jobs: list, lines };
}

export const activeJobs = (jobs: Job[], now = Date.now()) => jobs.filter((j) => j.at > now - MAX_AGE);

export function duration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}m` : ""}`;
}

export const parseJobs = (raw: string | null | undefined): Job[] => {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? (v as Job[]) : [];
  } catch {
    return [];
  }
};
