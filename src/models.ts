// Switching an agent's model from the dashboard. Claude Code gives a mod no list of models, so the dashboard offers
// the aliases /model takes (and a name typed in); the session's intercom-ui mod (0.2.11+) runs /model <name> between
// turns, reads the model again and reports it back, or Claude Code's answer when the switch didn't take.
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

/** Whether a session's model can be switched from outside its terminal; else why not. */
export function switchable(s: { client?: string | null; ui_at?: number | null; ui_version?: string | null; label: string }, on: boolean): string {
  if (s.client === "codex") return `${s.label} is a Codex session: its model is chosen in its terminal (/model).`;
  if (!on) return `${s.label} isn't connected.`;
  const [a = 0, b = 0, c = 0] = (s.ui_version || "0").split(".").map(Number);
  if (!modAnswers({ ui_at: s.ui_at, ui_version: s.ui_version ?? "" }) || a * 1e6 + b * 1e3 + c < 2011)
    return `${s.label}'s model can't be switched from here: its intercom-ui mod (0.2.11 or newer) isn't running. Type /model in its terminal, or run /intercom:update there.`;
  return "";
}

type Row = { session_id: string; label: string; client: string | null; ui_at: number | null; ui_version: string | null; last_seen: number; state: string | null };

/** Asks for a switch: the mod runs it once the session is idle (now, if it is). */
export async function askModel(env: Env, me: string, sessionId: string, model: string): Promise<string> {
  const t = await env.DB.prepare("SELECT session_id, label, client, ui_at, ui_version, last_seen, state FROM sessions WHERE member = ? AND session_id = ?").bind(me, sessionId).first<Row>();
  if (!t) throw new UserError("No such agent of yours");
  // Connected: its mod polls every few seconds (switchable checks that too).
  const why = switchable(t, Date.now() - t.last_seen < 10 * 60_000 || !!t.ui_at);
  if (why) throw new UserError(why);
  const name = model.trim();
  if (!MODEL_NAME.test(name)) throw new UserError("That isn't a model name: an alias such as opus, or an id such as claude-opus-5-5");
  await env.DB.prepare("UPDATE sessions SET model_req = ?, model_err = NULL WHERE member = ? AND session_id = ?").bind(JSON.stringify({ id: crypto.randomUUID(), model: name }), me, sessionId).run();
  env.refreshWeb?.(me);
  return `${t.label} switches to ${modelName(name)} ${t.state === "working" ? "when its turn ends" : "now"}`;
}
