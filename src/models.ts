// Switching an agent's model from the dashboard. Claude Code gives a mod no list of models, so the dashboard offers
// the aliases /model takes (and a name typed in); the session's intercom-ui mod (0.2.11+) runs /model <name> between
// turns, reads the model again and reports it back, or Claude Code's answer when the switch didn't take. Its effort
// (thinking level) goes the same way, with /effort (mod 0.2.13+).
import { modAnswers } from "./btw";
import { type Env, UserError } from "./lib";

export const MODELS: { value: string; label: string; hint: string }[] = [
  { value: "default", label: "Default", hint: "what its settings say" },
  { value: "opus", label: "Opus", hint: "the most capable" },
  { value: "sonnet", label: "Sonnet", hint: "fast and capable" },
  { value: "haiku", label: "Haiku", hint: "the fastest" },
  { value: "fable", label: "Fable", hint: "" },
];

/** What /model takes: an alias or a model id (claude-opus-5-5, with [1m] for the long context), nothing else. */
export const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:\/@-]{0,79}(\[1m\])?$/;

/** A model id the way a person says it: claude-opus-5-5 → Opus 5.5, claude-sonnet-5-5[1m] → Sonnet 5.5 (1M). */
export function modelName(id: string | null | undefined): string {
  if (!id) return "";
  const long = /\[1m\]$/i.test(id) ? " (1M)" : "";
  const m = id.replace(/\[1m\]$/i, "").match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/);
  if (m) return `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ""}${long}`;
  const alias = MODELS.find((x) => x.value === id.toLowerCase());
  return alias ? alias.label + long : id;
}

/** Effort levels /effort takes ("auto": back to the model's default), as offered in the dashboard. */
export const EFFORTS: { value: string; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max" },
  { value: "auto", label: "Auto" },
];
export const EFFORT_NAME = /^(low|medium|high|xhigh|max|auto)$/;
/** An effort as the mod reports it (a level, or a number on internal builds), said for a person. */
export const effortName = (e: string | null | undefined) => (!e ? "" : (EFFORTS.find((x) => x.value === e)?.label ?? e));

const modVersion = (v: string | null | undefined) => {
  const [a = 0, b = 0, c = 0] = (v || "0").split(".").map(Number);
  return a * 1e6 + b * 1e3 + c;
};

/** Whether a session's model can be switched from outside its terminal; else why not. */
export function switchable(s: { client?: string | null; ui_at?: number | null; ui_version?: string | null; label: string }, on: boolean): string {
  if (s.client === "codex") return `${s.label} is a Codex session: its model is chosen in its terminal (/model).`;
  if (!on) return `${s.label} isn't connected.`;
  if (!modAnswers({ ui_at: s.ui_at, ui_version: s.ui_version ?? "" }) || modVersion(s.ui_version) < 2011)
    return `${s.label}'s model can't be switched from here: its intercom-ui mod (0.2.11 or newer) isn't running. Type /model in its terminal, or run /intercom:update there.`;
  return "";
}

/** Whether its effort can be changed from here too (the mod reports and runs /effort from 0.2.13); else why not. */
export function effortSwitchable(s: { client?: string | null; ui_at?: number | null; ui_version?: string | null; label: string }, on: boolean): string {
  const why = switchable(s, on);
  if (why) return why.replace("its model is chosen", "its model and effort are chosen").replace("/model", "/model, /effort");
  return modVersion(s.ui_version) < 2013 ? `${s.label}'s effort can't be changed from here until its intercom-ui mod is 0.2.13 (it runs ${s.ui_version}): run /intercom:update there, or type /effort in its terminal.` : "";
}

type Row = { session_id: string; label: string; client: string | null; ui_at: number | null; ui_version: string | null; last_seen: number; state: string | null };

/**
 * Asks for a switch of model, effort or both: the mod runs /model and /effort once the session is idle (now, if it
 * is). One request at a time; a new one replaces any still waiting.
 */
export async function askModel(env: Env, me: string, sessionId: string, model: string, effort = ""): Promise<string> {
  const t = await env.DB.prepare("SELECT session_id, label, client, ui_at, ui_version, last_seen, state FROM sessions WHERE member = ? AND session_id = ?").bind(me, sessionId).first<Row>();
  if (!t) throw new UserError("No such agent of yours");
  // Connected: its mod polls every few seconds (switchable checks that too).
  const on = Date.now() - t.last_seen < 10 * 60_000 || !!t.ui_at;
  const name = model.trim();
  const level = effort.trim().toLowerCase();
  if (!name && !level) throw new UserError("Say which model or effort to switch to.");
  const why = level ? effortSwitchable(t, on) : switchable(t, on);
  if (why) throw new UserError(why);
  if (name && !MODEL_NAME.test(name)) throw new UserError("That isn't a model name: an alias such as opus, or an id such as claude-opus-5-5");
  if (level && !EFFORT_NAME.test(level)) throw new UserError("That isn't an effort level: low, medium, high, xhigh, max, or auto");
  await env.DB.prepare("UPDATE sessions SET model_req = ?, model_err = NULL WHERE member = ? AND session_id = ?")
    .bind(JSON.stringify({ id: crypto.randomUUID(), ...(name ? { model: name } : {}), ...(level ? { effort: level } : {}) }), me, sessionId)
    .run();
  env.refreshWeb?.(me);
  const what = [name ? modelName(name) : "", level ? `${effortName(level).toLowerCase()} effort` : ""].filter(Boolean).join(" at ");
  return `${t.label} switches to ${what} ${t.state === "working" ? "when its turn ends" : "now"}`;
}
