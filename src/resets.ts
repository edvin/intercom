// Codex usage-limit resets: when your Codex agents run out (their turn fails on a usage limit, reported by their
// local intercom server from Codex's log), one of them redeems a reset in its terminal (/usage → Redeem reset → Full
// reset → Yes) and each one that ran out carries on: its goal resumed, or told to. The agents on one machine share a
// ChatGPT login, so it's one reset per machine, and not a second one there within two hours unless you ask; when none
// are left, the agents wait for the limit to reset and the card in Waiting for you says so. Off unless you turn it on.

import { type Redeemed, carryOn, redeemReset } from "./codexterm";
import { type Env, UserError, ago } from "./lib";
import { type Row, myRows, outOfUsage, termFor } from "./upkeep";

export const RESET_GAP_MS = 2 * 3_600_000;
const GATHER_MS = 20_000; // agents on one machine run out together: wait a moment, then once for all of them

export interface ResetTry {
  at: number;
  outcome: Redeemed;
  agents: string[];
}

export async function resetsOf(env: Env, me: string): Promise<{ on: boolean; log: Record<string, ResetTry> }> {
  const r = await env.DB.prepare("SELECT resets, reset_log FROM upkeep WHERE member = ?").bind(me).first<{ resets: number; reset_log: string }>();
  let log: Record<string, ResetTry> = {};
  try {
    log = JSON.parse(r?.reset_log ?? "{}");
  } catch {}
  return { on: !!r?.resets, log };
}

export async function setResets(env: Env, me: string, on: boolean): Promise<string> {
  await env.DB.prepare("INSERT INTO upkeep (member, resets) VALUES (?, ?) ON CONFLICT(member) DO UPDATE SET resets = excluded.resets").bind(me, on ? 1 : 0).run();
  env.refreshWeb?.(me);
  return on ? "When your Codex agents run out of usage, a reset is redeemed if one is available" : "Usage resets are only redeemed when you say so";
}

const hostOf = (r: Pick<Row, "host">) => r.host || "unknown machine";

/** A Codex agent's turn failed on a usage limit: if you have this on, redeem a reset for its machine in a moment. */
export async function queueReset(env: Env, me: string, sessionId: string): Promise<void> {
  const row = await env.DB.prepare("SELECT host, client FROM sessions WHERE member = ? AND session_id = ?").bind(me, sessionId).first<{ host: string; client: string }>();
  if (row?.client !== "codex" || !(await resetsOf(env, me)).on) return;
  const ref = `x${hostOf(row)}`.slice(0, 120);
  if (await env.DB.prepare("SELECT 1 FROM push_queue WHERE member = ? AND ref = ?").bind(me, ref).first()) return;
  const due = Date.now() + GATHER_MS;
  await env.DB.prepare("INSERT INTO push_queue (member, ref, due_at, extra) VALUES (?, ?, ?, ?)").bind(me, ref, due, hostOf(row)).run();
  await env.wake?.(due);
}

/**
 * Redeem a reset on a machine and have its agents that ran out carry on. From the alarm (push ref "x…"), or from the
 * card (`force`: even if one was redeemed there lately).
 */
export async function resetHost(env: Env, me: string, host: string, opts: { force?: boolean } = {}): Promise<string> {
  const { rows, live } = await myRows(env, me);
  const out = rows.filter((r) => live(r) && r.client === "codex" && hostOf(r) === host && outOfUsage(r));
  if (!out.length) return `No Codex agent on ${host} is out of usage.`;
  const { log } = await resetsOf(env, me);
  const last = log[host];
  if (!opts.force && last && Date.now() - last.at < RESET_GAP_MS) return `A reset was tried on ${host} ${ago(last.at)} (${last.outcome}); not again so soon.`;
  const by = opts.force ? "from the dashboard (redeeming a usage reset)" : "by itself (redeeming a usage reset)";
  let outcome: Redeemed = "failed: no agent's terminal there could be reached";
  for (const t of out) {
    const term = await termFor(env, me, t, rows, live, by);
    if (!term) continue;
    outcome = await redeemReset(term).catch((e: Error) => `failed: ${e.message}` as Redeemed);
    if (outcome !== "busy") break;
  }
  const done: string[] = [];
  if (outcome === "redeemed") {
    for (const t of out) {
      const term = await termFor(env, me, t, rows, live, by);
      done.push(`${t.label}: ${term ? await carryOn(term).catch((e: Error) => `couldn't carry on (${e.message})`) : "can't be reached; tell it to carry on"}`);
    }
    // Back to work: no longer out of usage (a turn starting says working soon after).
    await env.DB.prepare(`UPDATE sessions SET state = 'idle', state_detail = '', state_at = ? WHERE member = ? AND session_id IN (SELECT value FROM json_each(?))`)
      .bind(Date.now(), me, JSON.stringify(out.map((t) => t.session_id)))
      .run();
  }
  log[host] = { at: Date.now(), outcome, agents: out.map((t) => t.label) };
  await env.DB.prepare("INSERT INTO upkeep (member, reset_log) VALUES (?, ?) ON CONFLICT(member) DO UPDATE SET reset_log = excluded.reset_log").bind(me, JSON.stringify(log)).run();
  env.refreshWeb?.(me);
  if (outcome === "redeemed") return `Redeemed a usage reset on ${host}. ${done.join(" · ")}`;
  if (outcome === "none") return `No usage resets left on that account; the agents on ${host} wait for the limit to reset.`;
  if (outcome === "busy") return `The agents on ${host} are working again; no reset needed.`;
  throw new UserError(`Couldn't redeem a reset on ${host}: ${outcome.slice(8)}. Look at its terminal.`);
}

/** From the alarm. */
export async function resetDue(env: Env, me: string, host: string): Promise<void> {
  try {
    console.log("reset", me, host, await resetHost(env, me, host));
  } catch (e) {
    console.log("reset", me, host, String(e));
  }
}

