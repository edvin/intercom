// Side questions to your own agent (/btw): the intercom-ui mod in that session answers them with $.model.fork,
// a read-only completion over the agent's current context that adds nothing to it. Follow-ups carry the thread's
// earlier exchanges in the question. Owner-only: a fork reads the agent's whole context.
import { type Env, UserError, limit } from "./lib";

export interface Btw {
  id: number;
  member: string;
  session_id: string;
  thread: number;
  question: string;
  answer: string;
  status: "pending" | "answered" | "failed";
  reason: string;
  created_at: number;
  answered_at: number | null;
}

const THREAD_IDLE = 30 * 60_000; // a follow-up continues the thread unless it has been quiet this long
const KEEP = 5; // earlier exchanges carried into a follow-up
export const BTW_TIMEOUT = 10 * 60_000;

/** Ask one of your own sessions a side question; continues its latest thread unless `fresh`. */
export async function askBtw(env: Env, me: string, sessionId: string, question: string, fresh = false): Promise<Btw> {
  const q = question.trim().slice(0, 2000);
  if (!q) throw new UserError("Ask something.");
  const s = await env.DB.prepare("SELECT client FROM sessions WHERE member = ? AND session_id = ?").bind(me, sessionId).first<{ client: string }>();
  if (!s) throw new UserError("You can only ask your own agents side questions.");
  if (s.client === "codex") throw new UserError("Side questions need Claude Code (with the intercom-ui mod); Codex has no way to answer without adding to its context.");
  await limit(env, `btw:${me}`, 60, 3600_000, "side questions");
  const last = fresh
    ? null
    : await env.DB.prepare("SELECT thread, created_at FROM btw WHERE member = ? AND session_id = ? ORDER BY id DESC LIMIT 1")
        .bind(me, sessionId)
        .first<{ thread: number; created_at: number }>();
  const row = await env.DB.prepare("INSERT INTO btw (member, session_id, thread, question, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *")
    .bind(me, sessionId, last && Date.now() - last.created_at < THREAD_IDLE ? last.thread : 0, q, Date.now())
    .first<Btw>();
  if (!row!.thread) await env.DB.prepare("UPDATE btw SET thread = id WHERE id = ?").bind(row!.id).run();
  env.refreshWeb?.(me);
  return { ...row!, thread: row!.thread || row!.id };
}

/** What the mod should ask for each pending question: the thread so far, then the new question. */
export async function pendingBtw(env: Env, me: string, sessionId: string): Promise<{ id: number; prompt: string }[]> {
  const { results: pending } = await env.DB.prepare("SELECT * FROM btw WHERE member = ? AND session_id = ? AND status = 'pending' AND created_at > ? ORDER BY id")
    .bind(me, sessionId, Date.now() - BTW_TIMEOUT)
    .all<Btw>();
  const out: { id: number; prompt: string }[] = [];
  for (const b of pending) {
    const { results: before } = await env.DB.prepare(
      "SELECT question, answer FROM btw WHERE thread = ? AND id < ? AND status = 'answered' ORDER BY id DESC LIMIT ?",
    )
      .bind(b.thread, b.id, KEEP)
      .all<{ question: string; answer: string }>();
    const earlier = before.reverse().map((x) => `Q: ${x.question}\nA: ${x.answer}`).join("\n\n");
    out.push({
      id: b.id,
      prompt:
        `A side question from your user, asked from the intercom dashboard (like /btw): answer it briefly from what you already know. ` +
        `You can't use tools here, and this exchange is not part of your work: don't change plans because of it.\n\n` +
        (earlier ? `Earlier side questions in this thread:\n${earlier}\n\n` : "") +
        `Question: ${b.question}`,
    });
  }
  return out;
}

/** The mod's answer (or why there is none). */
export async function answerBtw(env: Env, me: string, id: number, answer: string | null, reason: string | null): Promise<boolean> {
  const res = await env.DB.prepare("UPDATE btw SET status = ?, answer = ?, reason = ?, answered_at = ? WHERE id = ? AND member = ? AND status = 'pending'")
    .bind(answer ? "answered" : "failed", (answer ?? "").slice(0, 20000), (reason ?? "").slice(0, 200), Date.now(), id, me)
    .run();
  env.refreshWeb?.(me);
  return res.meta.changes > 0;
}

export async function btwFor(env: Env, me: string, sessionId: string): Promise<Btw[]> {
  const { results } = await env.DB.prepare("SELECT * FROM btw WHERE member = ? AND session_id = ? ORDER BY id DESC LIMIT 60").bind(me, sessionId).all<Btw>();
  return results.reverse();
}

export const pruneBtw = async (env: Env, now = Date.now()) =>
  (await env.DB.prepare("DELETE FROM btw WHERE created_at < ?").bind(now - 14 * 86400_000).run()).meta.changes;
