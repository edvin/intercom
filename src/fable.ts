// Fable's weekly limit. When an agent on Fable uses up its plan's Fable allowance for the week, Claude Code stops the
// turn on a dialog in its terminal ("You've reached your Fable limit for this week. Switch models?" with "1. Switch to
// Opus 5.5 · For this session"), and with nobody there it gives up after five minutes. With this on (the default) the hub
// answers it: it picks Switch to Opus, so the turn carries on there, for that session only, and tells the agent why.
// When the dialog had already given up, it switches the model with /model and has the agent carry on.
// Nothing new is needed on the agent's machine: the hub reads its screen the way the dashboard does (screen.ts). It
// looks at a Fable agent's screen when its turn has gone quiet (its mod polls every few seconds: app.ts handleUi),
// when it shows as waiting (prompts.ts), and when a turn ends on a limit.

import { pause, typeLine, waitFor } from "./codexterm";
import { type Env, postMessage } from "./lib";
import { screenPrompt } from "./prompts";
import { plainScreen } from "./screen";
import { myRows, termFor } from "./upkeep";

/** The dialog Claude Code asks when Fable's weekly allowance is used up. */
export const FABLE_ASKS = /reached your Fable limit/i;
/** What it shows once that dialog went unanswered (or someone said Not now), and the turn stopped. */
const FABLE_STOPPED = /Fable limit reached|reached your Fable limit|used your included Fable usage/i;
export const isFable = (model: string | null | undefined) => /fable/i.test(model ?? "");

const QUIET_MS = 45_000; // a turn with no hook this long: its screen is worth a look
const LOOK_GAP_MS = 90_000; // and not more often than this per agent
const looked = new Map<string, number>();

export async function fableOpusOn(env: Env, me: string): Promise<boolean> {
  const r = await env.DB.prepare("SELECT fable_opus FROM upkeep WHERE member = ?").bind(me).first<{ fable_opus: number }>();
  return r ? !!r.fable_opus : true;
}

export async function setFableOpus(env: Env, me: string, on: boolean): Promise<string> {
  await env.DB.prepare("INSERT INTO upkeep (member, fable_opus) VALUES (?, ?) ON CONFLICT(member) DO UPDATE SET fable_opus = excluded.fable_opus").bind(me, on ? 1 : 0).run();
  env.refreshWeb?.(me);
  return on ? "Agents on Fable switch to Opus when Fable's weekly limit runs out" : "Agents on Fable stop and ask when Fable's weekly limit runs out";
}

/** Look at its screen right away (the alarm, push.ts "f"), unless it was looked at lately. */
export async function queueFableLook(env: Env, me: string, sessionId: string, inMs = 0): Promise<void> {
  const key = `${me} ${sessionId}`;
  if (Date.now() - (looked.get(key) ?? 0) < LOOK_GAP_MS) return;
  looked.set(key, Date.now());
  const ref = `f${sessionId}`.slice(0, 120);
  if (await env.DB.prepare("SELECT 1 FROM push_queue WHERE member = ? AND ref = ?").bind(me, ref).first()) return;
  const due = Date.now() + inMs;
  await env.DB.prepare("INSERT INTO push_queue (member, ref, due_at, extra) VALUES (?, ?, ?, ?)").bind(me, ref, due, sessionId).run();
  await env.wake?.(due);
}

/** From the mod's poll: a Fable agent mid-turn with no hook for a while may be sitting on the dialog. */
export async function maybeFableLook(env: Env, me: string, s: { session_id: string; model: string | null; state: string | null; last_seen: number }): Promise<void> {
  if (!isFable(s.model) || (s.state !== "working" && s.state !== "waiting") || Date.now() - s.last_seen < QUIET_MS) return;
  if (Date.now() - (looked.get(`${me} ${s.session_id}`) ?? 0) < LOOK_GAP_MS) return;
  if (!(await fableOpusOn(env, me))) return;
  await queueFableLook(env, me, s.session_id);
}

/** The keys that pick "Switch to …" in the Fable-limit dialog on this screen; null when it isn't showing. */
export function fableSwitchKeys(text: string): { keys: string[]; option: string } | null {
  const p = screenPrompt(text);
  if (!p || !FABLE_ASKS.test(p.question)) return null;
  const want = p.options.findIndex((o) => /^Switch to\b/i.test(o));
  if (want < 0) return null;
  const d = want + 1 - p.on;
  return { keys: [...Array(Math.abs(d)).fill(d > 0 ? "down" : "up"), "enter"], option: p.options[want]!.replace(/\s{2,}.*$/, "") };
}

/** Whether a stopped screen's last lines say Fable's limit stopped it (and no dialog is up). */
export function fableStopped(text: string): boolean {
  const tail = plainScreen(text).replace(/\s+$/, "").split("\n").slice(-30).join("\n");
  return FABLE_STOPPED.test(tail) && !/esc to interrupt/i.test(tail);
}

const opusOf = (option: string) => option.replace(/^Switch to\s+/i, "").trim() || "Opus";

/** The alarm: if its screen shows the Fable-limit dialog, switch to Opus; if the turn already gave up, switch and carry on. */
export async function fableDue(env: Env, me: string, sessionId: string): Promise<string> {
  if (!(await fableOpusOn(env, me))) return "off";
  const { rows, live } = await myRows(env, me);
  const t = rows.find((r) => r.session_id === sessionId);
  if (!t || !live(t) || t.client === "codex") return "not connected";
  const term = await termFor(env, me, t, rows, live, "by itself, to switch it from Fable to Opus (Fable's weekly limit ran out)");
  if (!term) return "terminal out of reach";
  const s = await term({ op: "capture" });
  const pick = fableSwitchKeys(s.text);
  let said: string;
  if (pick) {
    await term({ op: "keys", keys: pick.keys });
    said = `Fable's weekly limit ran out, so intercom picked “${pick.option}” in your terminal: you're on ${opusOf(pick.option)} for the rest of this session, and your turn carried on there.`;
  } else if (fableStopped(s.text) && t.state !== "working") {
    // The dialog went unanswered and the turn stopped: switch for this session, then carry on.
    const after = await typeLine(term, "/model opus");
    await waitFor(term, after, /Opus/i, 2);
    await pause();
    await typeLine(term, "Fable's weekly limit ran out, so intercom switched this session to Opus: carry on with your work where you left off.");
    said = "Fable's weekly limit ran out and your turn stopped, so intercom switched this session to Opus (/model opus) and told you to carry on.";
  } else return "no Fable limit on screen";
  await env.DB.prepare("UPDATE sessions SET prompt = NULL, model_err = NULL, state = 'working', state_detail = '', state_at = ? WHERE member = ? AND session_id = ?").bind(Date.now(), me, sessionId).run();
  await postMessage(env, { channel: t.project || "dm", sender: me, sender_agent: null, recipient: me, recipient_agent: t.label, kind: "event", body: said });
  env.refreshWeb?.(me);
  return pick ? "switched" : "switched and carried on";
}
