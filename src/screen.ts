// An agent's screen: what its terminal (a tmux pane) shows right now, and keys typed into it, for the person it belongs
// to only (their dashboard or their Claude.ai connector; never a teammate or another agent). Its local server reads
// the pane on its machine when asked (plugins/intercom/code.mjs); nothing of the screen is stored here. Every key sent
// is noted in the agent's activity, so there's a trail.

import { type Env, UserError, liveIds, recordDelivery } from "./lib";
import { esc, icon } from "./ui";

export interface ScreenData {
  text: string; // the pane, with its colours as ANSI escapes
  cols: number;
  rows: number;
  cursor: [number, number] | null;
  keys: boolean; // whether keys may be sent (its machine allows)
  via?: string;
}

export type ScreenQuery = { op: "capture"; history?: number; pane?: string; fit?: string } | { op: "keys"; keys?: string[]; text?: string; enter?: boolean; after?: string[]; history?: number; pane?: string };

/** An agent on a machine, as another agent there sees it (code.mjs agentPanes). */
export interface AgentPane {
  session: string;
  pane: string | null;
  paneIsAgent: boolean;
  current: string;
  launch: string;
  version: string;
}

/** The keys the dashboard and Claude.ai can send, with how they're shown. */
export const KEY_NAMES: Record<string, string> = {
  enter: "Enter",
  esc: "Esc",
  "ctrl-c": "Ctrl+C",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  tab: "Tab",
  "shift-tab": "Shift+Tab",
  space: "Space",
  backspace: "Backspace",
  y: "y",
  n: "n",
  "ctrl-x": "Ctrl+X",
  "ctrl-s": "Ctrl+S",
  "ctrl-k": "Ctrl+K",
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => [String(d), String(d)])),
};

const WAIT_MS = 12_000;
type Reply = { data: ScreenData & { panes?: AgentPane[] } } | { error: string };
const waiting = new Map<string, { member: string; done: (r: Reply) => void }>();

interface Target {
  session_id: string;
  label: string;
  screen: string;
  client: string;
  version: string;
}

/** One of your agents whose screen can be reached, or why not. */
export async function screenTarget(env: Env, me: string, label: string): Promise<Target> {
  // Only you yourself: from your browser (signed in with GitHub) or Claude.ai; never an agent's token.
  if (env.authKind !== "web" && env.authKind !== "connector") throw new UserError("An agent's screen can only be opened by its person, from the dashboard or Claude.ai.");
  // The connected session with that name, if one is (a name can have an older row too, e.g. a resumed Codex session).
  const { results } = await env.DB.prepare("SELECT session_id, label, screen, client, version, last_seen FROM sessions WHERE member = ? AND label = ? ORDER BY last_seen DESC LIMIT 10")
    .bind(me, label)
    .all<Target & { last_seen: number }>();
  const live = new Set(liveIds(env, me));
  const s = results.find((r) => live.has(r.session_id)) ?? results[0];
  if (!s) throw new UserError(`You have no agent named ${label}.`);
  if (!liveIds(env, me).includes(s.session_id) && env.live) throw new UserError(`${label} isn't connected right now.`);
  if (!s.screen && s.client === "codex")
    throw new UserError(`${label}'s screen can't be seen from here: it isn't running in tmux, its machine turned it off (INTERCOM_SCREEN=0), its folder has more than one fresh Codex terminal (resume it by its session id to tell them apart), or its intercom is older than 0.12.40.`);
  if (!s.screen) throw new UserError(`${label}'s screen can't be seen from here: it isn't running in tmux, its machine turned it off (INTERCOM_SCREEN=0), or its intercom is older than 0.12.32 (run /intercom:update there and restart it).`);
  return s;
}

/** Ask `me`'s agent for its screen, or to type keys and then show it. */
export async function askScreen(env: Env, me: string, label: string, q: ScreenQuery): Promise<ScreenData> {
  const s = await screenTarget(env, me, label);
  if (q.op === "keys" && s.screen !== "keys") throw new UserError(`Sending keys to ${label} is turned off on its machine (INTERCOM_KEYS=0).`);
  return askSession(env, me, s, q, { label, by: env.authKind === "connector" ? "from Claude.ai" : "from the dashboard" });
}

/**
 * The request itself, to the session `via` (its own pane, or with q.pane another pane on its machine). Keys sent are
 * noted in the activity of the session they went to (`target`, when another than `via`).
 */
export async function askSession(
  env: Env,
  me: string,
  via: { session_id: string; label: string },
  q: ScreenQuery | { op: "panes" },
  note: { label: string; by: string; target?: string },
): Promise<ScreenData & { panes?: AgentPane[] }> {
  if (!env.askScreen) throw new UserError("The screen isn't available here.");
  const req = crypto.randomUUID();
  const reply = new Promise<Reply>((resolve) => {
    const timer = setTimeout(() => done({ error: `${note.label} didn't answer within ${WAIT_MS / 1000} seconds.` }), WAIT_MS);
    const done = (r: Reply) => {
      clearTimeout(timer);
      waiting.delete(req);
      resolve(r);
    };
    waiting.set(req, { member: me, done });
  });
  if (!env.askScreen(me, via.session_id, req, q)) waiting.get(req)?.done({ error: `${via.label} isn't connected right now.` });
  const r = await reply;
  if ("error" in r) throw new UserError(r.error);
  if (q.op === "keys") {
    const what = [...(q.keys ?? []).map((k) => KEY_NAMES[k] ?? k), q.text ? `typed “${q.text.slice(0, 120)}”` : "", q.enter && q.text ? "Enter" : "", q.after?.length ? q.after.map((k) => KEY_NAMES[k] ?? k).join(" ") : ""].filter(Boolean).join(", ");
    await env.DB.prepare("INSERT INTO activity (member, session_id, at, kind, text) VALUES (?, ?, ?, 'keys', ?)")
      .bind(me, note.target ?? via.session_id, Date.now(), `${note.by.startsWith("by itself") ? "intercom sent keys" : "you sent keys"} ${note.by}${note.target && note.target !== via.session_id ? ` (through ${via.label})` : ""}: ${what}`)
      .run();
  }
  return { ...r.data, via: via.label };
}

/** A local server's answer to a screen request. */
export function screenReply(me: string, body: { req?: unknown; data?: unknown; error?: unknown }): boolean {
  const w = waiting.get(String(body.req ?? ""));
  if (!w || w.member !== me) return false;
  if (typeof body.error === "string") w.done({ error: body.error.slice(0, 300) });
  else if (body.data && typeof body.data === "object" && typeof (body.data as ScreenData).text === "string") {
    const d = body.data as ScreenData & { panes?: unknown };
    const panes = Array.isArray(d.panes)
      ? (d.panes as Record<string, unknown>[]).slice(0, 100).map((p) => ({
          session: String(p.session ?? ""),
          pane: typeof p.pane === "string" && /^%\d+$/.test(p.pane) ? p.pane : null,
          paneIsAgent: !!p.paneIsAgent,
          current: String(p.current ?? "").slice(0, 60),
          launch: String(p.launch ?? "").slice(0, 500),
          version: String(p.version ?? "").slice(0, 20),
        }))
      : undefined;
    w.done({ data: { text: d.text.slice(0, 400_000), cols: Number(d.cols) || 0, rows: Number(d.rows) || 0, cursor: Array.isArray(d.cursor) ? [Number(d.cursor[0]), Number(d.cursor[1])] : null, keys: !!d.keys, ...(panes ? { panes } : {}) } });
  } else w.done({ error: "The agent sent an empty answer." });
  return true;
}

// ---- drawing it ----

const ANSI = /\x1b\[([0-9;:?]*)([A-Za-z])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Za-z0-9]|\x1b[=>78]|[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f]/g;

/** The screen as plain text (for Claude.ai). */
export const plainScreen = (text: string) => text.replace(ANSI, "").replace(/[ \t]+$/gm, "");

function color256(n: number): string {
  if (n < 16) return "";
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return `rgb(${v},${v},${v})`;
  }
  const c = n - 16;
  const step = (x: number) => (x ? 55 + x * 40 : 0);
  return `rgb(${step(Math.floor(c / 36))},${step(Math.floor(c / 6) % 6)},${step(c % 6)})`;
}

/** The screen as HTML: SGR colours and styles as spans (16 colours by class, the rest inline); everything else dropped. */
export function screenHtml(text: string): string {
  type St = { fg: string; bg: string; fgc: number; bgc: number; b: boolean; d: boolean; i: boolean; u: boolean; inv: boolean };
  const zero = (): St => ({ fg: "", bg: "", fgc: -1, bgc: -1, b: false, d: false, i: false, u: false, inv: false });
  let st = zero();
  let out = "";
  let openTag = ""; // the span open now ("" none)
  // The span the current style needs; opened only when there's text to put in it, so style changes don't leave empty spans.
  const tagFor = () => {
    const fgc = st.inv ? st.bgc : st.fgc;
    const bgc = st.inv ? st.fgc : st.bgc;
    const fg = st.inv ? st.bg : st.fg;
    const bg = st.inv ? st.fg : st.bg;
    const cls = [fgc >= 0 ? `f${fgc}` : st.inv ? "finv" : "", bgc >= 0 ? `b${bgc}` : st.inv ? "binv" : "", st.b ? "sb" : "", st.d ? "sd" : "", st.i ? "si" : "", st.u ? "su" : ""].filter(Boolean);
    const style = [fg ? `color:${fg}` : "", bg ? `background:${bg}` : ""].filter(Boolean).join(";");
    return cls.length || style ? `<span${cls.length ? ` class="${cls.join(" ")}"` : ""}${style ? ` style="${style}"` : ""}>` : "";
  };
  const write = (t: string) => {
    if (!t) return;
    const want = tagFor();
    if (want !== openTag) {
      if (openTag) out += "</span>";
      out += want;
      openTag = want;
    }
    out += esc(t);
  };
  const sgr = (params: string) => {
    const p = (params === "" ? "0" : params).split(/[;:]/).map((x) => Number(x) || 0);
    for (let i = 0; i < p.length; i++) {
      const v = p[i]!;
      if (v === 0) st = zero();
      else if (v === 1) st.b = true;
      else if (v === 2) st.d = true;
      else if (v === 3) st.i = true;
      else if (v === 4) st.u = true;
      else if (v === 7) st.inv = true;
      else if (v === 22) st.b = st.d = false;
      else if (v === 23) st.i = false;
      else if (v === 24) st.u = false;
      else if (v === 27) st.inv = false;
      else if (v >= 30 && v <= 37) (st.fgc = v - 30), (st.fg = "");
      else if (v >= 90 && v <= 97) (st.fgc = v - 82), (st.fg = "");
      else if (v === 39) (st.fgc = -1), (st.fg = "");
      else if (v >= 40 && v <= 47) (st.bgc = v - 40), (st.bg = "");
      else if (v >= 100 && v <= 107) (st.bgc = v - 92), (st.bg = "");
      else if (v === 49) (st.bgc = -1), (st.bg = "");
      else if ((v === 38 || v === 48) && p[i + 1] === 5) {
        const n = p[i + 2] ?? 0;
        if (v === 38) n < 16 ? ((st.fgc = n), (st.fg = "")) : ((st.fgc = -1), (st.fg = color256(n)));
        else n < 16 ? ((st.bgc = n), (st.bg = "")) : ((st.bgc = -1), (st.bg = color256(n)));
        i += 2;
      } else if ((v === 38 || v === 48) && p[i + 1] === 2) {
        const c = `rgb(${p[i + 2] ?? 0},${p[i + 3] ?? 0},${p[i + 4] ?? 0})`;
        if (v === 38) (st.fgc = -1), (st.fg = c);
        else (st.bgc = -1), (st.bg = c);
        i += 4;
      }
    }
  };
  let last = 0;
  for (const m of text.matchAll(ANSI)) {
    write(text.slice(last, m.index));
    last = m.index! + m[0].length;
    if (m[2] === "m") sgr(m[1] ?? "");
  }
  write(text.slice(last));
  if (openTag) out += "</span>";
  return out;
}

/** The dashboard's screen window body: the pane, sized like the terminal, and whether keys may be sent. */
export function drawScreen(d: ScreenData, note = ""): string {
  return `<div class="scrwrap" data-keys="${d.keys ? "1" : "0"}"><pre class="term" style="--cols:${d.cols || 80};--rows:${d.rows || 30}">${screenHtml(d.text)}</pre></div><div class="scrmeta">${d.cols}×${d.rows}${d.keys ? "" : " · sending keys is turned off on its machine"}${note ? ` · <span class="scrnote">${esc(note)}</span>` : ""}</div>`;
}

const atLeast = (v: string, want: string) => {
  const a = v.split(".").map(Number);
  const b = want.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
};

/**
 * Barge in: put a message in front of the agent now, not after its turn. Claude Code: type it and press Ctrl+X Ctrl+S
 * ("send now": it's read at the next step instead of the end of the turn). Codex: type it and press Enter, which steers
 * a running turn.
 */
export async function sendNow(env: Env, me: string, label: string, text: string): Promise<{ data: ScreenData; how: string }> {
  const line = text.replace(/[\r\n]+/g, " ").trim().slice(0, 1000);
  if (!line) throw new UserError("Type what to send.");
  const s = await screenTarget(env, me, label);
  if (s.client === "codex") return { data: await askScreen(env, me, label, { op: "keys", text: line, enter: true }), how: "typed into its terminal and sent (Codex takes it into the running turn)" };
  if (!atLeast(s.version || "0", "0.12.33"))
    return { data: await askScreen(env, me, label, { op: "keys", text: line, enter: true }), how: `typed and queued for the end of its turn (sending it right away needs intercom 0.12.33 on ${label}; /reload-plugins there gets it)` };
  return { data: await askScreen(env, me, label, { op: "keys", text: line, after: ["ctrl-x", "ctrl-s"] }), how: "sent now (Ctrl+X Ctrl+S): it reads it at its next step" };
}

/** Stop what it's doing: Esc interrupts the running turn in Claude Code and in Codex; the session stays. */
export async function stopAgent(env: Env, me: string, label: string): Promise<ScreenData> {
  return askScreen(env, me, label, { op: "keys", keys: ["esc"] });
}

/** What a button that opens an agent's screen carries: who, whether keys may be sent, and which kind of agent. */
export const screenAttrs = (key: string, label: string, screen: string, client: string) =>
  `data-screen="${esc(key)}" data-screenkeys="${screen === "keys" ? "1" : "0"}" data-screenname="${esc(label)}" data-screenclient="${client === "codex" ? "codex" : "claude"}"`;

/** The screen window, once per dashboard page: any [data-screen] button opens it for its agent. */
export function screenDialog(): string {
  const k = (key: string, label: string, title = "") => `<button type="button" class="btn sm scrk" data-key="${key}"${title ? ` title="${title}"` : ""}>${label}</button>`;
  return `<dialog id="dlg-screen" class="scrdlg"><div class="hd">${icon("monitor", 18)}<h2 data-scrname></h2><span class="scrlive" title="Redrawn every 2 seconds while open"><span class="dot"></span>live</span><span class="grow"></span><button type="button" class="btn ghost sm scrfit" data-scrfit aria-pressed="false" title="Resize its terminal to this screen while you watch, so it redraws to fit here (it goes back to its own size when you close this)">${icon("fit", 13)}<span>Fit to screen</span></button><button type="button" class="btn ghost sm icon" data-close title="Close">${icon("x", 15)}</button></div>
    <div class="scrbody" id="scrbody"><div class="screrr"><p>Loading its screen…</p></div></div>
    <div class="scrkeys" data-scrkeys>
      <div class="scrrow"><button type="button" class="btn sm danger scrstop" data-scrstop title="Interrupt what it's doing (Esc); the session stays">${icon("square", 12)}Stop</button><span class="scrsep"></span>${k("enter", "Enter")}${k("esc", "Esc")}${k("ctrl-c", "Ctrl+C", "Interrupts; twice exits")}${k("backspace", "⌫", "Backspace: deletes the character before the cursor")}${k("left", "←", "Left")}${k("right", "→", "Right")}${k("up", "↑", "Up")}${k("down", "↓", "Down")}${k("tab", "Tab")}${k("shift-tab", "⇧Tab", "Shift+Tab: switches mode in Claude Code")}${k("1", "1")}${k("2", "2")}${k("3", "3")}${k("y", "y")}${k("n", "n")}</div>
      <div class="scrtype" data-scrtype><input name="text" maxlength="1000" placeholder="Message it, or type a line into its terminal" autocomplete="off"><label class="screnter" title="Press Enter after the text"><input type="checkbox" name="enter" value="1" checked>Enter</label><button type="button" class="btn sm" data-scrsend title="Type it (with Enter: sent when it's ready, after its current turn)">${icon("send", 13)}Send</button><button type="button" class="btn sm primary" data-scrnow title="Barge in: it reads this at its next step, not after the whole turn">${icon("arrow", 13)}Send now</button></div>
    </div>
    <p class="scrnokeys" data-scrnokeys hidden>Sending keys is turned off on its machine (INTERCOM_KEYS=0).</p>
  </dialog>`;
}

/**
 * A message you wrote in the dashboard that the agent hasn't taken yet: barge in with it instead (send now into its
 * terminal). The message then counts as delivered, and it's kept out of the agent's next read so it doesn't come twice.
 */
export async function bargeIn(env: Env, me: string, id: number): Promise<string> {
  const m = await env.DB.prepare("SELECT * FROM messages WHERE id = ? AND sender = ? AND sender_agent IS NULL AND recipient = ? AND recipient_agent IS NOT NULL AND cancelled_at IS NULL")
    .bind(id, me, me)
    .first<{ id: number; body: string; recipient_agent: string; held_at: number | null }>();
  if (!m) throw new UserError("That message can't be sent now any more.");
  if (await env.DB.prepare("SELECT 1 FROM deliveries WHERE message_id = ?").bind(id).first()) throw new UserError("It already has it.");
  const s = await screenTarget(env, me, m.recipient_agent);
  if (s.screen !== "keys") throw new UserError(`Sending keys to ${s.label} is turned off on its machine (INTERCOM_KEYS=0).`);
  const r = await sendNow(env, me, s.label, m.body);
  await env.DB.prepare("UPDATE messages SET cancelled_at = ?, held_at = NULL WHERE id = ?").bind(Date.now(), id).run();
  await recordDelivery(env, id, me, s.session_id, s.label).run();
  env.refreshWeb?.(me);
  return `${s.label}: ${r.how}`;
}
