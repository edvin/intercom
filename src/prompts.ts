// A question an agent asks in its terminal with no card of its own: Codex's approval dialog while you're at your desk,
// a Claude Code dialog its hook doesn't bring here (an older intercom, a prompt no hook sees). The agent shows as waiting;
// a little later the hub reads its screen (screen.ts), and when it shows a question with numbered options, the card in
// Waiting for you shows them as buttons. Picking one reads the screen again and only presses keys when the same
// question is still there: the arrows to the option, then Enter.

import { type Env, UserError } from "./lib";
import { plainScreen } from "./screen";
import { type Row, myRows, termFor } from "./upkeep";

export interface ScreenPrompt {
  at: number;
  question: string;
  options: string[];
  on: number; // the option the cursor is on, from 1
}

const LOOK_AFTER_MS = 15_000;
const LOOKS = 3; // a dialog still drawing, or one that came up later than the hook said: look again, 30 s apart

/** The dialog at the bottom of a screen: numbered options (one with the cursor) under a question; null when there's none. */
export function screenPrompt(text: string): Omit<ScreenPrompt, "at"> | null {
  // Box borders off (Claude Code draws its dialogs in one), trailing blanks dropped.
  const ls = plainScreen(text)
    .split("\n")
    .map((l) => l.replace(/^\s*[│┃|]\s?/, "").replace(/\s*[│┃|]\s*$/, "").replace(/\s+$/, ""));
  while (ls.length && !ls[ls.length - 1]!.trim()) ls.pop();
  const opt = /^\s*([›❯>▶])?\s*(\d)\.\s+(.+?)\s*$/;
  // The options are at the bottom, under at most a few lines of hints ("Esc to cancel", a box's bottom edge).
  let end = -1;
  for (let i = ls.length - 1; i >= Math.max(0, ls.length - 6); i--) if (opt.test(ls[i]!)) { end = i; break; }
  if (end < 0) return null;
  const options: string[] = [];
  let on = -1, start = end;
  for (let i = end; i >= 0; i--) {
    const m = opt.exec(ls[i]!);
    if (!m) {
      if (!ls[i]!.trim() || /^\s{3,}\S/.test(ls[i]!)) continue; // an option's description on its own line
      break;
    }
    if (options.length && Number(m[2]) !== Number(opt.exec(ls[start]!)![2]) - 1) break;
    options.unshift(m[3]!.replace(/\s+\((?:esc|[a-z])\)$/i, ""));
    if (m[1]) on = options.length; // counted from the end for now
    start = i;
    if (m[2] === "1") break;
  }
  if (options.length < 2 || opt.exec(ls[start]!)![2] !== "1" || on < 0) return null;
  // The question: the lines above, up to a blank run or a box's top edge; it has to ask something.
  const q: string[] = [];
  for (let i = start - 1; i >= 0 && q.length < 12; i--) {
    const l = ls[i]!;
    if (/^\s*[╭┌─━╌]{3,}|[─━]{6,}/.test(l) || /^\s*[•⏺●✻⎿]/.test(l)) break; // a box's top edge, or the agent's transcript
    if (!l.trim()) {
      if (q.length && !ls[i - 1]?.trim()) break;
      if (q.length) q.unshift("");
      continue;
    }
    q.unshift(l.trim());
  }
  const question = q.join("\n").replace(/^\n+|\n+$/g, "");
  if (!/\?/.test(question)) return null;
  return { question: question.slice(-1500), options: options.map((o) => o.slice(0, 200)), on: options.length - on + 1 };
}

/** Look at its screen in a moment (the alarm, push.ts "p"). */
export async function queuePromptLook(env: Env, me: string, sessionId: string, looks = LOOKS): Promise<void> {
  const ref = `p${sessionId}`.slice(0, 120);
  if (await env.DB.prepare("SELECT 1 FROM push_queue WHERE member = ? AND ref = ?").bind(me, ref).first()) return;
  const due = Date.now() + LOOK_AFTER_MS * (looks === LOOKS ? 1 : 2);
  await env.DB.prepare("INSERT INTO push_queue (member, ref, due_at, extra) VALUES (?, ?, ?, ?)").bind(me, ref, due, `${sessionId} ${looks}`).run();
  await env.wake?.(due);
}

const stillWaiting = (t: Row | undefined, live: (r: Row) => boolean) => !!t && live(t) && t.state === "waiting" && !/limit|login|account/i.test(t.state_detail ?? "");

/** The alarm: read the screen of an agent that's still waiting, and keep the question it shows. Returns it for the notification. */
export async function lookForPrompt(env: Env, me: string, extra: string): Promise<{ label: string; prompt: ScreenPrompt } | null> {
  const [sessionId = "", n = "1"] = extra.split(" ");
  const { rows, live } = await myRows(env, me);
  const t = rows.find((r) => r.session_id === sessionId);
  if (!stillWaiting(t, live)) return null;
  // A card of its own (the hook asks here) is answered there.
  if (await env.DB.prepare("SELECT 1 FROM approvals WHERE member = ? AND session_id = ? AND decision IS NULL AND expires_at > ?").bind(me, sessionId, Date.now()).first()) return null;
  const term = await termFor(env, me, t!, rows, live, "by itself, to read what it asks");
  if (!term) return null;
  const found = screenPrompt((await term({ op: "capture" })).text);
  if (!found) {
    if (Number(n) > 1) await queuePromptLook(env, me, sessionId, Number(n) - 1);
    return null;
  }
  const prompt: ScreenPrompt = { at: Date.now(), ...found };
  await env.DB.prepare("UPDATE sessions SET prompt = ? WHERE member = ? AND session_id = ?").bind(JSON.stringify(prompt), me, sessionId).run();
  env.refreshWeb?.(me);
  return { label: t!.label, prompt };
}

/** The question an agent shows in its terminal right now, as last read; null once it's moved on. */
export function promptOf(r: { prompt?: string | null; state: string; state_at: number | null }): ScreenPrompt | null {
  if (!r.prompt || r.state !== "waiting") return null;
  try {
    const p = JSON.parse(r.prompt) as ScreenPrompt;
    return p.at >= (r.state_at ?? 0) ? p : null;
  } catch {
    return null;
  }
}

/** Pick option `n` (from 1) of the question it showed, when its screen still shows that question. */
export async function pickPrompt(env: Env, me: string, sessionId: string, n: number): Promise<string> {
  const { rows, live } = await myRows(env, me);
  const t = rows.find((r) => r.session_id === sessionId);
  if (!t || !live(t)) throw new UserError("That agent isn't connected any more.");
  const row = await env.DB.prepare("SELECT prompt, state, state_at FROM sessions WHERE member = ? AND session_id = ?").bind(me, sessionId).first<{ prompt: string | null; state: string; state_at: number | null }>();
  const was = row ? promptOf(row) : null;
  if (!was) throw new UserError(`${t.label} isn't waiting on that any more.`);
  const term = await termFor(env, me, t, rows, live, "from the dashboard");
  if (!term) throw new UserError(`${t.label}'s terminal can't be reached from here.`);
  const now = screenPrompt((await term({ op: "capture" })).text);
  if (!now || now.question !== was.question || now.options.join("\n") !== was.options.join("\n")) {
    await env.DB.prepare("UPDATE sessions SET prompt = NULL WHERE member = ? AND session_id = ?").bind(me, sessionId).run();
    throw new UserError(`${t.label}'s screen doesn't show that question any more: look at it before answering.`);
  }
  const want = Math.min(Math.max(1, Math.floor(n)), now.options.length);
  const d = want - now.on;
  await term({ op: "keys", keys: [...Array(Math.abs(d)).fill(d > 0 ? "down" : "up"), "enter"] });
  await env.DB.prepare("UPDATE sessions SET prompt = NULL WHERE member = ? AND session_id = ?").bind(me, sessionId).run();
  env.refreshWeb?.(me);
  return `Picked “${now.options[want - 1]}” in ${t.label}'s terminal`;
}
