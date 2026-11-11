// An agent's subagents (Claude Code's Agent tool): what each was asked, its steps and its answer. Claude Code keeps a
// log per subagent beside the session's (<session>/subagents/agent-<id>.jsonl, with a .meta.json naming its type and
// description); the local server follows them (intercom-channel.mjs) and reports each start, step and end here, as
// activity items of kind "sub". Only the session's owner sees them. Codex keeps no such logs.

import type { Env } from "./lib";

export interface Sub {
  id: string;
  type: string; // general-purpose, Explore, Plan, …
  desc: string;
  bg: boolean; // started in the background
  depth: number; // 2: a subagent's subagent
  started: number;
  updated: number;
  status: "running" | "done" | "stopped";
  steps: number;
  last: string; // its latest step, one line
  prompt: string;
  result: string;
}

export interface SubEvent {
  op: "start" | "step" | "end";
  id?: string;
  type?: string;
  desc?: string;
  bg?: boolean;
  depth?: number;
  prompt?: string;
  kind?: string;
  text?: string;
  status?: string;
  result?: string;
}

export interface SubStep {
  id: string;
  rid?: number; // its row
  at: number;
  kind: string;
  text: string;
}

// prompt: a message the agent sent it later (SendMessage), or one you sent it through the agent.
const STEP_KINDS = new Set(["text", "cmd", "edit", "read", "tool", "prompt"]);
export const SUB_KEEP_MS = 2 * 3600_000; // finished ones stay this long
const MAX_SUBS = 30;
export const STEPS_KEEP = 150; // per subagent
const line = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const block = (s: unknown, n: number) => String(s ?? "").replace(/\s+$/g, "").slice(0, n);

export const parseSubs = (raw: string | null | undefined): Sub[] => {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? (v as Sub[]) : [];
  } catch {
    return [];
  }
};

/** Apply events in order: the list (running ones, and those that ended in the last two hours), and the new steps. */
export function applySubEvents(subs: Sub[], events: { at: number; ev: SubEvent }[], now = Date.now()): { subs: Sub[]; steps: SubStep[] } {
  const byId = new Map(subs.map((s) => [s.id, { ...s }]));
  const steps: SubStep[] = [];
  for (const { at, ev } of events) {
    const id = typeof ev?.id === "string" && /^[\w-]{1,64}$/.test(ev.id) ? ev.id : "";
    if (!id) continue;
    let s = byId.get(id);
    if (!s) {
      // A step for one we never saw start (the local server started later): it's running.
      s = { id, type: "", desc: "", bg: false, depth: 1, started: at, updated: at, status: "running", steps: 0, last: "", prompt: "", result: "" };
      byId.set(id, s);
    }
    s.updated = Math.max(s.updated, at);
    if (ev.op === "start") {
      s.type = line(ev.type, 40) || s.type;
      s.desc = line(ev.desc, 160) || s.desc;
      s.bg = !!ev.bg;
      s.depth = Math.max(1, Math.min(5, Number(ev.depth) || 1));
      s.prompt = block(ev.prompt, 1500) || s.prompt;
      s.started = Math.min(s.started, at);
    } else if (ev.op === "step") {
      const kind = String(ev.kind ?? "");
      const text = block(ev.text, 2000);
      if (!STEP_KINDS.has(kind) || !text.trim()) continue;
      // Sent another message after it answered: it goes on.
      if (s.status !== "running" && at >= s.updated) s.status = "running";
      s.steps++;
      s.last = line(text, 200);
      steps.push({ id, at, kind, text: kind === "edit" ? text.split("\n")[0]!.slice(0, 400) : text });
    } else if (ev.op === "end") {
      s.status = ev.status === "stopped" ? "stopped" : "done";
      s.result = block(ev.result, 4000) || s.result;
    }
  }
  const list = [...byId.values()]
    .filter((s) => s.status === "running" || now - s.updated < SUB_KEEP_MS)
    .sort((a, b) => b.started - a.started)
    .slice(0, MAX_SUBS);
  return { subs: list, steps };
}

export const runningSubs = (subs: Sub[]) => subs.filter((s) => s.status === "running");

/** Store a batch of sub events for one session: its list, the new steps, and only the steps of subagents still listed. */
export async function storeSubEvents(env: Env, me: string, sessionId: string, events: { at: number; ev: SubEvent }[]): Promise<number> {
  if (!events.length) return 0;
  const cur = await env.DB.prepare("SELECT subagents FROM sessions WHERE member = ? AND session_id = ?").bind(me, sessionId).first<{ subagents: string | null }>();
  const { subs, steps } = applySubEvents(parseSubs(cur?.subagents), events);
  const touched = [...new Set(steps.map((s) => s.id))];
  await env.DB.batch([
    env.DB.prepare("UPDATE sessions SET subagents = ?, active_at = MAX(COALESCE(active_at, 0), ?) WHERE member = ? AND session_id = ?").bind(
      JSON.stringify(subs),
      Math.max(...events.map((e) => e.at)),
      me,
      sessionId,
    ),
    ...steps.map((s) => env.DB.prepare("INSERT INTO subagent_steps (member, session_id, agent_id, at, kind, text) VALUES (?, ?, ?, ?, ?, ?)").bind(me, sessionId, s.id, s.at, s.kind, s.text)),
    env.DB.prepare("DELETE FROM subagent_steps WHERE member = ? AND session_id = ? AND agent_id NOT IN (SELECT value FROM json_each(?))").bind(me, sessionId, JSON.stringify(subs.map((s) => s.id))),
    ...touched.map((id) =>
      env.DB.prepare(
        "DELETE FROM subagent_steps WHERE member = ?1 AND session_id = ?2 AND agent_id = ?3 AND id <= (SELECT id FROM subagent_steps WHERE member = ?1 AND session_id = ?2 AND agent_id = ?3 ORDER BY id DESC LIMIT 1 OFFSET ?4)",
      ).bind(me, sessionId, id, STEPS_KEEP),
    ),
  ]);
  return events.length;
}

/** The latest steps of each listed subagent of a session (up to `per` each), oldest first. */
export async function subSteps(env: Env, me: string, sessionId: string, per = 40, only?: string): Promise<Map<string, SubStep[]>> {
  const { results } = await env.DB.prepare(
    `SELECT agent_id AS id, rid, at, kind, text FROM (
       SELECT agent_id, at, kind, text, id AS rid, ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY id DESC) AS n
       FROM subagent_steps WHERE member = ? AND session_id = ? AND (? IS NULL OR agent_id = ?)
     ) WHERE n <= ? ORDER BY rid`,
  )
    .bind(me, sessionId, only ?? null, only ?? null, per)
    .all<SubStep>();
  const out = new Map<string, SubStep[]>();
  for (const r of results) out.set(r.id, [...(out.get(r.id) ?? []), r]);
  return out;
}

/** A message you sent a subagent from the dashboard, through its agent (web.ts): its body says which one. */
export const SUB_MSG = /^For your subagent “([^”]*)” \(agent id ([\w-]+)\), from the dashboard:\n\n([\s\S]*?)\n\nPass this on to it with SendMessage/;

export function subMessage(sub: { id: string; desc: string }, text: string): string {
  return `For your subagent “${sub.desc.replace(/”/g, "'") || "a subagent"}” (agent id ${sub.id}), from the dashboard:\n\n${text.trim()}\n\nPass this on to it with SendMessage (to: "${sub.id}"), and tell me what it answers.`;
}

export function parseSubMessage(body: string): { desc: string; id: string; text: string } | null {
  const m = SUB_MSG.exec(body);
  return m ? { desc: m[1]!, id: m[2]!, text: m[3]! } : null;
}
