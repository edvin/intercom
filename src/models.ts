// Switching an agent's model from the dashboard. Claude Code gives a mod no list of models, so the dashboard offers
// the aliases /model takes (and a name typed in); the session's intercom-ui mod (0.2.11+) runs /model <name> between
// turns, reads the model again and reports it back, or Claude Code's answer when the switch didn't take. Its effort
// (thinking level) goes the same way, with /effort (mod 0.2.13+). A Codex agent's are read from its log by its intercom
// (0.12.61+, with the models its Codex lists), and switched by the hub typing /model in its terminal (codexterm.ts).
import { modAnswers } from "./btw";
import { switchModel } from "./codexterm";
import { type Env, UserError } from "./lib";
import { myRows, termFor } from "./upkeep";

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
  if (alias) return alias.label + long;
  // Codex's: gpt-6.1-sol → GPT-6.1-Sol, as its /model menu says.
  if (/^gpt-/i.test(id)) return id.replace(/^gpt/i, "GPT").replace(/-([a-z])/g, (_, c: string) => `-${c.toUpperCase()}`);
  return id;
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
export const effortName = (e: string | null | undefined) => (!e ? "" : (EFFORTS.find((x) => x.value === e)?.label ?? { ultra: "Ultra", default: "Default" }[e] ?? e));

/** A Codex agent's models, as its Codex lists them: id, name, default level and the levels it takes. */
export type CodexModel = { slug: string; name: string; def: string; levels: string[] };
export function codexModels(raw: string | null | undefined): CodexModel[] {
  try {
    const v = JSON.parse(raw || "[]") as unknown;
    return Array.isArray(v) ? (v as CodexModel[]).filter((m) => m && typeof m.slug === "string" && Array.isArray(m.levels)) : [];
  } catch {
    return [];
  }
}
/** Codex's reasoning levels, as offered for one of its models ("auto": the one it marks default). */
export const codexEfforts = (m: CodexModel | undefined) => [
  ...EFFORTS.filter((x) => x.value !== "auto" && (!m || m.levels.includes(x.value))),
  ...(!m || m.levels.includes("ultra") ? [{ value: "ultra", label: "Ultra" }] : []),
  { value: "auto", label: `Default${m?.def ? ` (${effortName(m.def).toLowerCase()})` : ""}` },
];

const modVersion = (v: string | null | undefined) => {
  const [a = 0, b = 0, c = 0] = (v || "0").split(".").map(Number);
  return a * 1e6 + b * 1e3 + c;
};

/** Whether a session's model can be switched from outside its terminal; else why not. */
type Switchable = { client?: string | null; ui_at?: number | null; ui_version?: string | null; label: string; screen?: string | null; codex_models?: string | null };
export function switchable(s: Switchable, on: boolean): string {
  if (!on) return `${s.label} isn't connected.`;
  if (s.client === "codex") {
    if (!codexModels(s.codex_models).length)
      return `${s.label}'s model can't be switched from here until the intercom on its machine is 0.12.61 (it reports Codex's models then): run /intercom:update there, or type /model in its terminal.`;
    if (s.screen !== "keys") return `${s.label} doesn't run in tmux with keys allowed, so /model can't be typed for it: type /model in its terminal.`;
    return "";
  }
  if (!modAnswers({ ui_at: s.ui_at, ui_version: s.ui_version ?? "" }) || modVersion(s.ui_version) < 2011)
    return `${s.label}'s model can't be switched from here: its intercom-ui mod (0.2.11 or newer) isn't running. Type /model in its terminal, or run /intercom:update there.`;
  return "";
}

/** Whether its effort can be changed from here too (the mod reports and runs /effort from 0.2.13); else why not. */
export function effortSwitchable(s: Switchable, on: boolean): string {
  const why = switchable(s, on);
  if (s.client === "codex") return why;
  if (why) return why.replace("its model is chosen", "its model and effort are chosen").replace("/model", "/model, /effort");
  return modVersion(s.ui_version) < 2013 ? `${s.label}'s effort can't be changed from here until its intercom-ui mod is 0.2.13 (it runs ${s.ui_version}): run /intercom:update there, or type /effort in its terminal.` : "";
}

type Row = { session_id: string; label: string; client: string | null; ui_at: number | null; ui_version: string | null; last_seen: number; state: string | null; screen: string | null; codex_models: string | null; model: string | null; effort: string | null };

/**
 * Asks for a switch of model, effort or both: the mod runs /model and /effort once the session is idle (now, if it
 * is). One request at a time; a new one replaces any still waiting.
 */
export async function askModel(env: Env, me: string, sessionId: string, model: string, effort = ""): Promise<string> {
  const t = await env.DB.prepare("SELECT session_id, label, client, ui_at, ui_version, last_seen, state, screen, codex_models, model, effort FROM sessions WHERE member = ? AND session_id = ?")
    .bind(me, sessionId)
    .first<Row>();
  if (!t) throw new UserError("No such agent of yours");
  // Connected: its mod polls every few seconds (switchable checks that too).
  const on = Date.now() - t.last_seen < 10 * 60_000 || !!t.ui_at;
  const name = model.trim();
  const level = effort.trim().toLowerCase();
  if (!name && !level) throw new UserError("Say which model or effort to switch to.");
  const why = level ? effortSwitchable(t, on) : switchable(t, on);
  if (why) throw new UserError(why);
  if (t.client === "codex") {
    // Its Codex's own list: the model by its id or name, the level one that model takes.
    const list = codexModels(t.codex_models);
    const m = name ? list.find((x) => x.slug === name.toLowerCase() || x.name.toLowerCase() === name.toLowerCase()) : list.find((x) => x.slug === t.model);
    if (name && !m) throw new UserError(`${t.label}'s Codex doesn't offer ${name}: ${list.map((x) => x.slug).join(", ")}`);
    if (level && !codexEfforts(m).some((x) => x.value === level)) throw new UserError(`${m?.name ?? "Its model"} doesn't take ${level}: ${codexEfforts(m).map((x) => x.value).join(", ")}`);
    await env.DB.prepare("UPDATE sessions SET model_req = ?, model_err = NULL WHERE member = ? AND session_id = ?")
      .bind(JSON.stringify({ id: crypto.randomUUID(), ...(m && name ? { model: m.slug } : {}), ...(level ? { effort: level } : {}) }), me, sessionId)
      .run();
    if (t.state !== "working") await queueCodexModel(env, me, sessionId);
    env.refreshWeb?.(me);
    const what = [m && name ? m.name : "", level ? `${effortName(level).toLowerCase()} reasoning` : ""].filter(Boolean).join(" at ");
    return `${t.label} switches to ${what} ${t.state === "working" ? "when its turn ends" : "now"} (its /model is typed for it)`;
  }
  if (name && !MODEL_NAME.test(name)) throw new UserError("That isn't a model name: an alias such as opus, or an id such as claude-opus-5-5");
  if (level && !EFFORT_NAME.test(level)) throw new UserError("That isn't an effort level: low, medium, high, xhigh, max, or auto");
  await env.DB.prepare("UPDATE sessions SET model_req = ?, model_err = NULL WHERE member = ? AND session_id = ?")
    .bind(JSON.stringify({ id: crypto.randomUUID(), ...(name ? { model: name } : {}), ...(level ? { effort: level } : {}) }), me, sessionId)
    .run();
  env.refreshWeb?.(me);
  const what = [name ? modelName(name) : "", level ? `${effortName(level).toLowerCase()} effort` : ""].filter(Boolean).join(" at ");
  return `${t.label} switches to ${what} ${t.state === "working" ? "when its turn ends" : "now"}`;
}

/** A Codex agent's switch, run by the alarm (push.ts, ref "o"): now, or when its turn ends (its Stop hook). */
export async function queueCodexModel(env: Env, me: string, sessionId: string): Promise<void> {
  const ref = `o${sessionId}`.slice(0, 120);
  if (await env.DB.prepare("SELECT 1 FROM push_queue WHERE member = ? AND ref = ?").bind(me, ref).first()) return;
  await env.DB.prepare("INSERT INTO push_queue (member, ref, due_at, extra) VALUES (?, ?, ?, ?)").bind(me, ref, Date.now(), sessionId).run();
  await env.wake?.(Date.now());
}

/** Type /model into a Codex agent's terminal for the switch asked for: done, failed (said on the agent), or left for its turn's end. */
export async function codexModelDue(env: Env, me: string, sessionId: string): Promise<string> {
  const { rows, live } = await myRows(env, me);
  const t = rows.find((r) => r.session_id === sessionId);
  const s = await env.DB.prepare("SELECT model_req, model, effort, codex_models FROM sessions WHERE member = ? AND session_id = ? AND client = 'codex'")
    .bind(me, sessionId)
    .first<{ model_req: string | null; model: string | null; effort: string | null; codex_models: string | null }>();
  if (!t || !s?.model_req) return "nothing asked";
  const req = JSON.parse(s.model_req) as { id: string; model?: string; effort?: string };
  const finish = async (err: string | null, got?: { model: string; effort: string }) => {
    await env.DB.prepare("UPDATE sessions SET model_req = NULL, model_err = ?, model = COALESCE(?, model), effort = COALESCE(?, effort) WHERE member = ? AND session_id = ? AND json_extract(model_req, '$.id') = ?")
      .bind(err, got?.model ?? null, got ? (got.effort === "auto" ? "default" : got.effort) : null, me, sessionId, req.id)
      .run();
    env.refreshWeb?.(me);
    return err ?? `switched to ${got!.model} ${got!.effort}`;
  };
  const term = await termFor(env, me, t, rows, live, "from the dashboard (switching its model with /model)");
  if (!term) return finish("its terminal can't be reached (not in tmux, or keys aren't allowed on its machine)");
  // The level: the one asked for; else the one it runs, if the new model takes it; else that model's default.
  const m = codexModels(s.codex_models).find((x) => x.slug === (req.model ?? s.model));
  const keep = s.effort && s.effort !== "default" && (!m || m.levels.includes(s.effort)) ? s.effort : "auto";
  const got = await switchModel(term, { model: req.model, effort: req.effort ?? keep }).catch((e: Error) => `failed: ${e.message}` as const);
  if (got === "busy") return "busy: left for when its turn ends";
  if (typeof got === "string") return finish(`${got.slice(8)}. Look at its terminal, or type /model there.`);
  return finish(null, got);
}
