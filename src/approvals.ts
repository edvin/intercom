// Approvals from the browser. While a member is "away", their agents' permission questions (Claude Code and Codex
// PermissionRequest hooks) come to the dashboard instead of waiting in a terminal nobody watches. The hook asks,
// then polls until the member answers or the wait runs out (then: deny, so the agent moves on instead of hanging).

import { getSetting, setSetting } from "./github";
import { type Env, UserError, ago } from "./lib";

export interface Approval {
  id: number;
  member: string;
  session_id: string;
  label: string;
  client: string;
  tool: string;
  summary: string;
  created_at: number;
  expires_at: number;
  decision: string | null;
  note: string;
}

export const DEFAULT_WAIT_MIN = 30;

export async function awayState(env: Env, me: string): Promise<{ away: boolean; waitMin: number }> {
  const raw = await getSetting(env, `away:${me}`);
  if (!raw) return { away: false, waitMin: DEFAULT_WAIT_MIN };
  const v = JSON.parse(raw) as { away: boolean; waitMin?: number };
  return { away: v.away, waitMin: v.waitMin ?? DEFAULT_WAIT_MIN };
}

export async function setAway(env: Env, me: string, away: boolean, waitMin?: number): Promise<string> {
  const cur = await awayState(env, me);
  // The hook waits at most an hour (its own timeout), so that's the longest an approval can stay open.
  const wait = Math.min(60, Math.max(1, Math.round(waitMin ?? cur.waitMin)));
  await setSetting(env, `away:${me}`, JSON.stringify({ away, waitMin: wait }));
  env.refreshWeb?.(me);
  return away
    ? `Away mode on: your agents' approval questions now come to the dashboard (Agents view). Unanswered ones are denied after ${wait} minutes, so agents move on instead of hanging.`
    : "Away mode off: approval questions show in each agent's terminal again.";
}

/** What the agent wants to do, in one line: the command, the file, or the tool's input. */
export function summarize(tool: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const pick = i.command ?? i.cmd ?? i.file_path ?? i.path ?? i.url ?? i.pattern;
  const text = typeof pick === "string" ? pick : JSON.stringify(input ?? {});
  return `${tool}: ${text}`.slice(0, 600);
}

/** POST /api/approval (from the hook): null when the member isn't away (the terminal asks as usual). */
export async function requestApproval(env: Env, me: string, session: { session_id: string; label: string } | null, client: string, body: { tool_name?: string; tool_input?: unknown }): Promise<Approval | null> {
  const { away, waitMin } = await awayState(env, me);
  if (!away || !session) return null;
  const tool = String(body.tool_name ?? "tool").slice(0, 80);
  const now = Date.now();
  const row = await env.DB.prepare(
    "INSERT INTO approvals (member, session_id, label, client, tool, summary, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
  )
    .bind(me, session.session_id, session.label, client, tool, summarize(tool, body.tool_input), now, now + waitMin * 60_000)
    .first<Approval>();
  await env.DB.prepare("UPDATE sessions SET state = 'waiting', state_detail = ?, state_at = ?, active_at = ?2 WHERE member = ? AND session_id = ?")
    .bind(`needs approval: ${row!.summary.slice(0, 120)}`, now, me, session.session_id)
    .run();
  env.refreshWeb?.(me);
  return row;
}

/** GET /api/approval/<id> (the hook polls): pending, or the decision. Expired ones become a deny. */
export async function approvalStatus(env: Env, me: string, id: number): Promise<{ status: string; note: string }> {
  const a = await env.DB.prepare("SELECT * FROM approvals WHERE id = ? AND member = ?").bind(id, me).first<Approval>();
  if (!a) return { status: "deny", note: "Unknown approval request." };
  if (!a.decision && a.expires_at < Date.now()) {
    await env.DB.prepare("UPDATE approvals SET decision = 'expired', decided_at = ? WHERE id = ?").bind(Date.now(), id).run();
    env.refreshWeb?.(me);
    return { status: "deny", note: `Your user is away and didn't answer within ${Math.round((a.expires_at - a.created_at) / 60000)} minutes. Don't retry this; skip it or find another way, and tell them about it with the intercom post tool.` };
  }
  if (!a.decision) return { status: "pending", note: "" };
  return { status: a.decision === "allow" ? "allow" : "deny", note: a.note };
}

/** The dashboard's Allow / Deny. */
export async function decide(env: Env, me: string, id: number, decision: "allow" | "deny", note: string): Promise<string> {
  const res = await env.DB.prepare("UPDATE approvals SET decision = ?, note = ?, decided_at = ? WHERE id = ? AND member = ? AND decision IS NULL RETURNING session_id, summary, label")
    .bind(decision, note.slice(0, 500), Date.now(), id, me)
    .first<{ session_id: string; summary: string; label: string }>();
  if (!res) throw new UserError("That approval was already answered or has expired.");
  await env.DB.prepare("UPDATE sessions SET state = 'working', state_detail = '', state_at = ?, active_at = ?1 WHERE member = ? AND session_id = ?").bind(Date.now(), me, res.session_id).run();
  env.refreshWeb?.(me);
  return `${decision === "allow" ? "Allowed" : "Denied"} for ${res.label}: ${res.summary.slice(0, 80)}`;
}

export async function pendingApprovals(env: Env, me: string): Promise<Approval[]> {
  const { results } = await env.DB.prepare("SELECT * FROM approvals WHERE member = ? AND decision IS NULL AND expires_at > ? ORDER BY id").bind(me, Date.now()).all<Approval>();
  return results;
}

export const waitingFor = (a: Approval) => `asked ${ago(a.created_at)}`;
