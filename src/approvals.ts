// Answering agents from the browser. What a Claude Code agent waits on in its terminal (a permission prompt, a
// question with options, a plan to approve) also comes to the dashboard, and whichever answers first counts: Claude
// Code keeps its dialog up while the PermissionRequest hook waits, takes the hook's answer if it comes first and
// ignores it if the terminal was quicker (then the plugin closes the card). The hook asks, then polls until it's
// answered or closed. Away mode ("I'm leaving") adds a deadline: unanswered ones are denied so agents move on.
// Codex, which may not keep its own prompt up meanwhile, only asks here while its person is away.

import { getSetting, setSetting } from "./github";
import { type Env, UserError, ago } from "./lib";
import { outdated } from "./version";

/** Plugin versions whose hook closes a card answered in the terminal, so asking here while at the desk is fine. */
export const ASK_ALWAYS_SINCE = "0.12.30";

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
  decision: string | null; // 'allow' | 'deny' | 'expired' | 'closed' (answered in the terminal, or not any more)
  note: string;
  kind: "permission" | "question" | "plan";
  detail: string;
  answers: string | null;
  away: number;
}

/** An AskUserQuestion question, as the dashboard shows it. */
export interface Question {
  question: string;
  header: string;
  multiSelect: boolean;
  options: { label: string; description: string }[];
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
    ? `Away mode on: what your agents ask that you don't answer (here or in their terminal) within ${wait} minutes is denied, so they move on instead of hanging.`
    : "Away mode off: your agents' questions wait for you, in their terminal and here.";
}

/** What the agent wants to do, in one line: the command, the file, or the tool's input. */
export function summarize(tool: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const pick = i.command ?? i.cmd ?? i.file_path ?? i.path ?? i.url ?? i.pattern;
  const text = typeof pick === "string" ? pick : JSON.stringify(input ?? {});
  return `${tool}: ${text}`.slice(0, 600);
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** AskUserQuestion's questions, cut to what the dashboard shows; null when the input isn't that shape. */
export function questionsOf(input: unknown): Question[] | null {
  const qs = (input as { questions?: unknown })?.questions;
  if (!Array.isArray(qs) || !qs.length) return null;
  const out = qs.slice(0, 4).map((q: Record<string, unknown>) => ({
    question: str(q?.question, 1000),
    header: str(q?.header, 40),
    multiSelect: q?.multiSelect === true,
    options: (Array.isArray(q?.options) ? q.options : []).slice(0, 6).map((o: Record<string, unknown>) => ({ label: str(o?.label, 200), description: str(o?.description, 600) })),
  }));
  return out.every((q) => q.question && q.options.length) ? out : null;
}

/** POST /api/approval (from the hook): null when the dashboard shouldn't ask (the terminal asks as usual). */
export async function requestApproval(env: Env, me: string, session: { session_id: string; label: string; version?: string | null } | null, client: string, body: { tool_name?: string; tool_input?: unknown }): Promise<Approval | null> {
  const { away, waitMin } = await awayState(env, me);
  if (!session) return null;
  // At the desk, only hooks that close a card you answered in the terminal ask here too.
  if (!away && (client !== "claude" || outdated(session.version, ASK_ALWAYS_SINCE))) return null;
  const tool = String(body.tool_name ?? "tool").slice(0, 80);
  const questions = tool === "AskUserQuestion" ? questionsOf(body.tool_input) : null;
  const plan = tool === "ExitPlanMode" ? str((body.tool_input as { plan?: unknown })?.plan, 40_000) : "";
  const kind = questions ? "question" : plan ? "plan" : "permission";
  const summary = questions ? questions.map((q) => q.question).join(" · ").slice(0, 600) : plan ? `Plan: ${plan.trim().split("\n")[0].replace(/^#+\s*/, "").slice(0, 200)}` : summarize(tool, body.tool_input);
  const now = Date.now();
  // The hook waits an hour at most, so that's how long a card stays without away mode's deadline.
  const expires = now + (away ? waitMin : 60) * 60_000;
  const row = await env.DB.prepare(
    "INSERT INTO approvals (member, session_id, label, client, tool, summary, created_at, expires_at, kind, detail, away) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
  )
    .bind(me, session.session_id, session.label, client, tool, summary, now, expires, kind, questions ? JSON.stringify(questions) : plan, away ? 1 : 0)
    .first<Approval>();
  const what = kind === "question" ? "asks" : kind === "plan" ? "plan to approve" : "needs approval";
  await env.DB.prepare("UPDATE sessions SET state = 'waiting', state_detail = ?, state_at = ?, active_at = ?2 WHERE member = ? AND session_id = ?")
    .bind(`${what}: ${row!.summary.slice(0, 120)}`, now, me, session.session_id)
    .run();
  env.refreshWeb?.(me);
  return row;
}

/** GET /api/approval/<id> (the hook polls): pending, closed, or the decision. Expired ones are denied in away mode. */
export async function approvalStatus(env: Env, me: string, id: number): Promise<{ status: string; note: string; answers: Record<string, string> | null; kind?: string }> {
  const a = await env.DB.prepare("SELECT * FROM approvals WHERE id = ? AND member = ?").bind(id, me).first<Approval>();
  if (!a) return { status: "closed", note: "", answers: null };
  if (!a.decision && a.expires_at < Date.now()) {
    await env.DB.prepare("UPDATE approvals SET decision = ?, decided_at = ? WHERE id = ?").bind(a.away ? "expired" : "closed", Date.now(), id).run();
    env.refreshWeb?.(me);
    if (!a.away) return { status: "closed", note: "", answers: null };
    return { status: "deny", note: `Your user is away and didn't answer within ${Math.round((a.expires_at - a.created_at) / 60000)} minutes. Don't retry this; skip it or find another way, and tell them about it with the intercom post tool.`, answers: null };
  }
  if (!a.decision) return { status: "pending", note: "", answers: null };
  if (a.decision === "closed") return { status: "closed", note: "", answers: null };
  return { status: a.decision === "allow" ? "allow" : "deny", note: a.note, answers: a.answers ? (JSON.parse(a.answers) as Record<string, string>) : null, kind: a.kind };
}

/** The plugin's word that the terminal answered (or the turn moved on): the card goes, the waiting hook stops. */
export async function closeApproval(env: Env, me: string, id: number): Promise<void> {
  const r = await env.DB.prepare("UPDATE approvals SET decision = 'closed', decided_at = ? WHERE id = ? AND member = ? AND decision IS NULL").bind(Date.now(), id, me).run();
  if (r.meta.changes) env.refreshWeb?.(me);
}

/** A turn that ended isn't waiting on anything any more. */
export async function closeSessionApprovals(env: Env, me: string, session: string): Promise<void> {
  const r = await env.DB.prepare("UPDATE approvals SET decision = 'closed', decided_at = ? WHERE member = ? AND session_id = ? AND decision IS NULL").bind(Date.now(), me, session).run();
  if (r.meta.changes) env.refreshWeb?.(me);
}

/** The answers to a question card, from the dashboard's form: per question the picked option(s), or what was typed. */
export function answersFrom(questions: Question[], picked: (i: number) => string[], typed: (i: number) => string): Record<string, string> {
  const out: Record<string, string> = {};
  questions.forEach((q, i) => {
    const text = typed(i).trim().slice(0, 2000);
    const labels = picked(i).filter((l) => q.options.some((o) => o.label === l));
    const answer = text || (q.multiSelect ? labels : labels.slice(0, 1)).join(", ");
    if (answer) out[q.question] = answer;
  });
  if (Object.keys(out).length < questions.length) throw new UserError(questions.length > 1 ? "Answer each question (pick an option or type something)." : "Pick an option or type something.");
  return out;
}

/** The dashboard's Allow / Deny. */
export async function decide(env: Env, me: string, id: number, decision: "allow" | "deny", note: string, answers?: Record<string, string>): Promise<string> {
  const res = await env.DB.prepare("UPDATE approvals SET decision = ?, note = ?, answers = ?, decided_at = ? WHERE id = ? AND member = ? AND decision IS NULL RETURNING session_id, summary, label, kind")
    .bind(decision, note.slice(0, 2000), answers ? JSON.stringify(answers) : null, Date.now(), id, me)
    .first<{ session_id: string; summary: string; label: string; kind: string }>();
  if (!res) throw new UserError("That was already answered (maybe in the terminal) or has expired.");
  await env.DB.prepare("UPDATE sessions SET state = 'working', state_detail = '', state_at = ?, active_at = ?1 WHERE member = ? AND session_id = ?").bind(Date.now(), me, res.session_id).run();
  env.refreshWeb?.(me);
  if (res.kind === "question") return answers ? `Answered ${res.label}: ${Object.values(answers).join(" · ").slice(0, 80)}` : `Skipped ${res.label}'s question`;
  if (res.kind === "plan") return decision === "allow" ? `Approved ${res.label}'s plan` : `${res.label} keeps planning`;
  return `${decision === "allow" ? "Allowed" : "Denied"} for ${res.label}: ${res.summary.slice(0, 80)}`;
}

export async function pendingApprovals(env: Env, me: string): Promise<Approval[]> {
  const { results } = await env.DB.prepare("SELECT * FROM approvals WHERE member = ? AND decision IS NULL AND expires_at > ? ORDER BY id").bind(me, Date.now()).all<Approval>();
  return results;
}

export const waitingFor = (a: Approval) => `asked ${ago(a.created_at)}`;
