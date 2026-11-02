// Keeping your agents running and current, through their terminals (screen.ts), on your call or (updates) by itself:
// - updates: an agent on an older intercom gets /reload-plugins typed in when it's idle (no restart: the same session),
//   and one whose Claude Code has an update waiting (its status line says "/restart to apply") gets /restart;
// - watchdog: one that's been "working" a long while with nothing new may be frozen (see it, stop it), and one that
//   stopped running without ending (crashed, killed) can be restarted in its pane, resumed by its session id;
// - context: one whose context is nearly full is offered a compaction.
// An agent too old to take keys, or that's gone, is reached through another of your agents on the same machine.

import { compactable } from "./btw";
import { type Env, GONE_MS, UserError, ago, liveIds } from "./lib";
import { type AgentPane, type ScreenData, type ScreenQuery, askSession, plainScreen } from "./screen";
import { PLUGIN_VERSION } from "./version";

/** A helper must run at least this to list the agents on its machine and type into their panes. */
export const HELPER_SINCE = "0.12.34";
const FROZEN_MS = 20 * 60_000;
const FULL_PCT = 85;
const TICK_MS = 20 * 60_000;
const IDLE_FOR_MS = 10 * 60_000;

export interface Row {
  session_id: string;
  label: string;
  project: string;
  client: string;
  version: string;
  state: string;
  state_detail: string;
  state_at: number | null;
  active_at: number | null;
  last_seen: number;
  host: string;
  screen: string;
  pane: string;
  launch: string;
  ctx_pct: number | null;
  compact_req: string | null;
  ui_at: number | null;
  ui_version: string;
}

export const newer = (v: string, than: string) => {
  const a = (v || "0").split(".").map(Number);
  const b = than.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
};
const atLeast = (v: string, want: string) => v === want || newer(v, want);

export async function myRows(env: Env, me: string): Promise<{ rows: Row[]; live: (r: Row) => boolean }> {
  const { results } = await env.DB.prepare(
    `SELECT session_id, label, project, client, version, state, state_detail, state_at, active_at, last_seen, host, screen, pane, launch, ctx_pct, compact_req, ui_at, ui_version
     FROM sessions WHERE member = ? AND last_seen > ? ORDER BY last_seen DESC`,
  )
    .bind(me, Date.now() - 86_400_000)
    .all<Row>();
  const ids = new Set(liveIds(env, me));
  const live = (r: Row) => ids.has(r.session_id) || Date.now() - r.last_seen < GONE_MS;
  return { rows: results, live };
}

/** Another of your agents on the same machine that can reach other panes there. */
function helperFor(rows: Row[], live: (r: Row) => boolean, t: Row): Row | null {
  return rows.find((r) => r.session_id !== t.session_id && r.host && r.host === t.host && live(r) && r.screen === "keys" && atLeast(r.version, HELPER_SINCE)) ?? null;
}

interface Located {
  via: Row;
  pane: string | undefined; // set when going through another agent
  info?: AgentPane;
}

/** How to reach an agent's terminal: itself, or through another agent on its machine. */
async function locate(env: Env, me: string, t: Row, rows: Row[], live: (r: Row) => boolean): Promise<Located | null> {
  if (live(t) && t.screen === "keys" && t.pane) return { via: t, pane: undefined };
  const h = helperFor(rows, live, t);
  if (!h) return null;
  if (!live(t) && t.pane) return { via: h, pane: t.pane };
  const found = (await askSession(env, me, h, { op: "panes" }, { label: h.label, by: "" })).panes?.find((p) => p.session === t.session_id);
  return found?.pane ? { via: h, pane: found.pane, info: found } : null;
}

async function ask(env: Env, me: string, at: Located, t: Row, q: ScreenQuery, by: string): Promise<ScreenData> {
  return askSession(env, me, at.via, { ...q, ...(at.pane ? { pane: at.pane } : {}) } as ScreenQuery, { label: t.label, by, target: t.session_id });
}

// ---- updates ----

/** Your connected Claude Code agents on an older intercom than the newest (`reachable`: only those whose terminal can be typed into, themselves or through another agent on their machine). */
export function staleAgents(rows: Row[], live: (r: Row) => boolean, reachable = false): Row[] {
  return rows.filter((r) => live(r) && r.client !== "codex" && r.version && newer(PLUGIN_VERSION, r.version) && (!reachable || (r.screen === "keys" && r.pane) || helperFor(rows, live, r)));
}

/** Update one idle agent in place: /restart when Claude Code has an update waiting, else /reload-plugins. */
export async function updateAgent(env: Env, me: string, t: Row, rows: Row[], live: (r: Row) => boolean, by: string): Promise<string> {
  if (t.client === "codex") return `${t.label}: a Codex session; update it in its terminal for now`;
  if (t.state === "working") return `${t.label}: busy, left alone`;
  const at = await locate(env, me, t, rows, live);
  if (!at) return `${t.label}: can't reach its terminal (not in tmux, or no updated agent on ${t.host || "its machine"} to go through)`;
  const screen = plainScreen((await ask(env, me, at, t, { op: "capture" }, by)).text);
  const cli = /\/restart to apply/.test(screen);
  if (!cli && !newer(PLUGIN_VERSION, t.version)) return `${t.label}: up to date`;
  const cmd = cli ? "/restart" : "/reload-plugins";
  await ask(env, me, at, t, { op: "keys", text: cmd, enter: true }, by);
  return `${t.label}: ${cmd}${cli ? " (a Claude Code update was waiting)" : ` (intercom ${t.version || "?"} → ${PLUGIN_VERSION})`}`;
}

/** Update every idle agent that's behind (or, `quietFor`, only those idle that long). */
export async function updateIdle(env: Env, me: string, by: string, quietFor = 0): Promise<string[]> {
  const { rows, live } = await myRows(env, me);
  const out: string[] = [];
  for (const t of staleAgents(rows, live)) {
    if (quietFor && Date.now() - (t.active_at ?? t.state_at ?? 0) < quietFor) continue;
    try {
      out.push(await updateAgent(env, me, t, rows, live, by));
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      out.push(`${t.label}: ${e.message}`);
    }
  }
  return out;
}

// ---- watchdog ----

/** Working a long while, with nothing new: possibly frozen. */
export function frozenAgents(rows: Row[], live: (r: Row) => boolean): Row[] {
  const now = Date.now();
  return rows.filter((r) => live(r) && r.state === "working" && now - Math.max(r.active_at ?? 0, r.state_at ?? 0) > FROZEN_MS);
}

/** Gone without ending (a clean exit removes the session): restartable when its pane and command are known and another agent on its machine is around. */
export function exitedAgents(rows: Row[], live: (r: Row) => boolean): Row[] {
  const now = Date.now();
  return rows.filter((r) => !live(r) && now - r.last_seen < 86_400_000 && r.pane && r.launch && !rows.some((x) => x.label === r.label && x.session_id !== r.session_id && live(x)) && helperFor(rows, live, r));
}

/** The command that starts this agent again, resumed by its session id (never --continue: several can share a folder). */
export function resumeCommand(t: { launch: string; session_id: string; client: string }): string {
  if (!/^[\w-]+$/.test(t.session_id)) throw new UserError("That session id can't be resumed.");
  const words = t.launch.trim().split(/\s+/).filter(Boolean);
  if (t.client === "codex") return `codex resume ${t.session_id}`;
  if (words.some((w) => /[;&|`$<>(){}\\'"]/.test(w))) throw new UserError("Its command line has shell characters; restart it by hand.");
  const bin = words[0] && /(^|\/)claude$/.test(words[0]) ? words[0] : "claude";
  const flags: string[] = [];
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    if (/^(--resume|-r|--session-id)$/.test(w)) {
      if (words[i + 1] && !words[i + 1]!.startsWith("-")) i++;
      continue;
    }
    if (/^(--resume=|--session-id=)/.test(w) || /^(--continue|-c|--fork-session)$/.test(w)) continue;
    if (/[;&|`$<>(){}\\'"]/.test(w)) throw new UserError("Its command line has shell characters; restart it by hand.");
    flags.push(w);
  }
  const channel = /plugin:intercom@intercom/.test(t.launch) ? "INTERCOM_CHANNEL=1 " : "";
  return `${channel}${bin} ${[...flags, "--resume", t.session_id].join(" ")}`.replace(/\s+/g, " ").trim();
}

/** Start an agent that stopped running again, in its pane, in the same session. */
export async function restartAgent(env: Env, me: string, sessionId: string): Promise<string> {
  const { rows, live } = await myRows(env, me);
  const t = rows.find((r) => r.session_id === sessionId);
  if (!t) throw new UserError("No such agent of yours (in the last day).");
  if (live(t)) throw new UserError(`${t.label} is running: nothing to restart.`);
  const at = await locate(env, me, t, rows, live);
  if (!at?.pane) throw new UserError(`${t.label}'s terminal can't be reached: no updated agent of yours on ${t.host || "its machine"} to go through.`);
  const screen = plainScreen((await ask(env, me, at, t, { op: "capture" }, "from the dashboard")).text).trimEnd();
  const lastLine = screen.split("\n").pop() ?? "";
  if (!/(?<![\d\w])[$#%>❯] ?$|[\w~\/\])][$#] ?$/.test(lastLine)) throw new UserError(`${t.label}'s pane doesn't show a shell prompt (it ends with “${lastLine.slice(-60)}”): look at it before restarting.`);
  const cmd = resumeCommand(t);
  await ask(env, me, at, t, { op: "keys", text: cmd, enter: true }, "from the dashboard");
  return `Restarting ${t.label} in its pane: ${cmd}`;
}

// ---- context ----

export function fullAgents(rows: Row[], live: (r: Row) => boolean): Row[] {
  return rows.filter((r) => live(r) && (r.ctx_pct ?? 0) >= FULL_PCT && !r.compact_req);
}

/** Compact it: through its mod when it runs one (when its turn ends), else by typing /compact when it's idle. */
export async function compactAgent(env: Env, me: string, sessionId: string): Promise<string> {
  const { rows, live } = await myRows(env, me);
  const t = rows.find((r) => r.session_id === sessionId);
  if (!t || !live(t)) throw new UserError("That agent isn't connected.");
  if (!compactable(t, true)) {
    await env.DB.prepare("UPDATE sessions SET compact_req = ? WHERE member = ? AND session_id = ?").bind(JSON.stringify({ id: crypto.randomUUID(), instructions: "" }), me, sessionId).run();
    env.refreshWeb?.(me);
    return `${t.label} compacts ${t.state === "working" ? "when its turn ends" : "now"}`;
  }
  if (t.state === "working") throw new UserError(`${t.label} is in the middle of a turn: compact it when it's idle.`);
  const at = await locate(env, me, t, rows, live);
  if (!at) throw new UserError(`${t.label} can't be compacted from here: type /compact in its terminal.`);
  await ask(env, me, at, t, { op: "keys", text: "/compact", enter: true }, "from the dashboard");
  env.refreshWeb?.(me);
  return `Typed /compact into ${t.label}'s terminal`;
}

// ---- settings and cards put away ----

export async function upkeepOf(env: Env, me: string): Promise<{ auto: boolean; dismissed: Record<string, number> }> {
  const r = await env.DB.prepare("SELECT auto, dismissed FROM upkeep WHERE member = ?").bind(me).first<{ auto: number; dismissed: string }>();
  let dismissed: Record<string, number> = {};
  try {
    dismissed = JSON.parse(r?.dismissed ?? "{}");
  } catch {}
  return { auto: !!r?.auto, dismissed };
}

export async function setAuto(env: Env, me: string, on: boolean): Promise<string> {
  await env.DB.prepare("INSERT INTO upkeep (member, auto) VALUES (?, ?) ON CONFLICT(member) DO UPDATE SET auto = excluded.auto").bind(me, on ? 1 : 0).run();
  if (on) await env.wake?.(Date.now() + 60_000);
  env.refreshWeb?.(me);
  return on ? "Your idle agents update by themselves now" : "Your agents update only when you say so";
}

/** Put a card away: it comes back when what it's about changes (`value` grows). */
export async function dismiss(env: Env, me: string, key: string, value: number): Promise<string> {
  const { dismissed } = await upkeepOf(env, me);
  dismissed[key.slice(0, 80)] = value;
  const keep = Object.fromEntries(Object.entries(dismissed).slice(-200));
  await env.DB.prepare("INSERT INTO upkeep (member, dismissed) VALUES (?, ?) ON CONFLICT(member) DO UPDATE SET dismissed = excluded.dismissed").bind(me, JSON.stringify(keep)).run();
  env.refreshWeb?.(me);
  return "OK";
}

/** From the hub's alarm: update the idle agents of those who asked for it. Returns when to look again, or null. */
export async function upkeepTick(env: Env): Promise<number | null> {
  const { results } = await env.DB.prepare("SELECT member FROM upkeep WHERE auto = 1").all<{ member: string }>();
  for (const { member } of results) {
    try {
      const done = (await updateIdle(env, member, "by itself (automatic update)", IDLE_FOR_MS)).filter((x) => /\/(reload-plugins|restart)/.test(x));
      if (done.length) console.log("upkeep", member, done.join("; "));
    } catch (e) {
      console.log("upkeep", member, String(e));
    }
  }
  return results.length ? Date.now() + TICK_MS : null;
}

export const since = (t: number | null) => (t ? ago(t) : "a while ago");
