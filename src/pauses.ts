// Agents you paused (out of tokens, stopped for a while): set from the agent's menu on the dashboard, with why and
// until when. Whoever messages it (another agent, a teammate) is told it won't answer until then, and that their
// message waits for it; `team` shows it, and the intercom doesn't wake it. Gone when you resume it or the time is up.

import { type Env, UserError, address, ago } from "./lib";
import { validTz } from "./work";
import { duration } from "./jobs";

export interface Pause {
  reason: string;
  until: number | null;
  tz: string;
  at: number;
}

export async function pauseOf(env: Env, member: string, label: string, now = Date.now()): Promise<Pause | null> {
  const p = await env.DB.prepare("SELECT reason, until, tz, at FROM agent_pauses WHERE member = ? AND label = ?").bind(member, label).first<Pause>();
  return p && (!p.until || p.until > now) ? p : null;
}

const clock = (at: number, tz: string) => `${new Date(at).toLocaleString("en-GB", { timeZone: validTz(tz), weekday: "short", hour: "2-digit", minute: "2-digit" })}${validTz(tz) === "UTC" ? " UTC" : ""}`;

/** "paused by edvin (out of tokens) until Sun 08:00": for the sender's note and `team`. */
export const pauseReason = (member: string, p: Pause) => `paused by ${member}${p.reason ? ` (${p.reason})` : ""}${p.until ? ` until ${clock(p.until, p.tz)}, in ${duration(p.until - Date.now())}` : " until they resume it"}`;

/** What a sender is told when its message went to a paused agent. */
export const pauseNote = (member: string, label: string, p: Pause) =>
  ` Note: ${address(member, label)} is ${pauseReason(member, p)}, so it won't answer before then. Your message waits for it: don't block on it; carry on with other work, or send it to another agent if it can't wait.`;

export async function pauseAgent(env: Env, me: string, label: string, reason: string, minutes: number | null, tz = ""): Promise<string> {
  const name = label.trim();
  if (!/^[\w.-]{1,64}$/.test(name)) throw new UserError("Which agent?");
  const mine = await env.DB.prepare("SELECT 1 FROM sessions WHERE member = ? AND label = ? UNION ALL SELECT 1 FROM ended_sessions WHERE member = ? AND label = ? LIMIT 1").bind(me, name, me, name).first();
  if (!mine) throw new UserError(`No agent of yours is called ${name}.`);
  const why = reason.replace(/\s+/g, " ").trim().slice(0, 200);
  const until = minutes && minutes > 0 ? Date.now() + Math.min(minutes, 14 * 24 * 60) * 60_000 : null;
  await env.DB.prepare(
    "INSERT INTO agent_pauses (member, label, reason, until, tz, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(member, label) DO UPDATE SET reason = excluded.reason, until = excluded.until, tz = excluded.tz, at = excluded.at",
  )
    .bind(me, name, why, until, validTz(tz), Date.now())
    .run();
  env.refreshWeb?.(me);
  return `${name} is paused${until ? ` until ${clock(until, tz)}` : ""}: whoever messages it is told it won't answer before then.`;
}

export async function resumeAgent(env: Env, me: string, label: string): Promise<string> {
  const r = await env.DB.prepare("DELETE FROM agent_pauses WHERE member = ? AND label = ?").bind(me, label).run();
  env.refreshWeb?.(me);
  return r.meta.changes ? `${label} isn't paused any more.` : `${label} wasn't paused.`;
}

/** The paused banner and its Resume button, in the agent's chat. */
export const pausedBar = (label: string, p: Pause, back: string, esc: (s: string) => string, hidden: (o: Record<string, string>) => string) =>
  `<div class="cbanner pausedbar"><i></i><span><b>Paused${p.until ? ` until ${esc(clock(p.until, p.tz))}` : ""}</b>${p.reason ? `: ${esc(p.reason)}` : ""}. Whoever messages ${esc(label)} is told it won't answer before then (paused ${esc(ago(p.at))}).</span><form method="post" action="/agent/pause">${hidden({ label, resume: "1", back })}<button class="btn sm">Resume</button></form></div>`;
