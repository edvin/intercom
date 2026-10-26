// The Agents view: every agent session you can reach (yours first), and a chat with the one you pick.
// What you write there reaches that session as YOUR USER (your own agents act on it like a typed prompt);
// what it answers comes back here. Its project posts show in the thread as activity.

import { awayState, pendingApprovals } from "./approvals";
import { PLUGIN_VERSION, outdated } from "./version";
import { activeLoops, describe, parseLoops } from "./loops";
import { type Activity, type Env, type Message, address, ago, deliveryMarks, hostNames, myProjects } from "./lib";
import { avatar, deliveryMark, esc, hidden, icon, md, plainSpaces, time } from "./ui";

interface Agent {
  member: string;
  session_id: string;
  label: string;
  project: string;
  project_pin?: string;
  loops?: string;
  repo?: string;
  branch: string;
  note: string;
  client: string;
  host: string;
  version: string;
  last_seen: number;
  state: string;
  state_detail: string;
  state_at: number | null;
}

/** Which agent runs the session, in each tool's own colours. */
// Simple marks, not the companies' logos: Claude's spark (an orange starburst) and Codex's terminal prompt.
const CLAUDE_MARK = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><g stroke="#d97757" stroke-width="2.6" stroke-linecap="round">${[0, 30, 60, 90, 120, 150]
  .map((deg) => `<line x1="12" y1="3.2" x2="12" y2="20.8" transform="rotate(${deg} 12 12)"/>`)
  .join("")}</g></svg>`;
const CODEX_MARK = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="currentColor"/><path d="M7 8.5l3.5 3.5L7 15.5M12.5 15.5h4.5" fill="none" stroke="var(--surface)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Which agent runs the session: an icon, with the name on hover (and next to it when `named`). */
export const clientBadge = (client: string, named = false) =>
  client === "codex"
    ? `<span class="client cx" title="OpenAI Codex">${CODEX_MARK}${named ? "Codex" : ""}</span>`
    : `<span class="client cl" title="Claude Code">${CLAUDE_MARK}${named ? "Claude Code" : ""}</span>`;

const LOOP_CHIPS = ["Stop your loop.", "Run your loop every 30 minutes instead."];
const QUICK = ["What's your status?", "Pause and check in with me first.", "Stop, summarize, and wait.", "Commit and push what you have."];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Ran 3 commands, read 2 files, edited 1 file" for a run of tool steps, expandable to the steps themselves. */
function foldSteps(steps: Activity[], open: boolean, row: (a: Activity) => string): string {
  const n = (k: string) => steps.filter((a) => a.kind === k).length;
  const parts = [
    n("cmd") ? `ran ${plural(n("cmd"), "command", "commands")}` : "",
    n("read") ? `read ${plural(n("read"), "file", "files")}` : "",
    n("edit") ? `edited ${plural(n("edit"), "file", "files")}` : "",
    n("tool") ? plural(n("tool"), "tool call", "tool calls") : "",
  ].filter(Boolean);
  const summary = parts.join(", ").replace(/^./, (c) => c.toUpperCase());
  const last = steps[steps.length - 1]!;
  return `<details class="actgroup" data-gid="g${steps[0]!.id}"${open ? " open data-live" : ""}><summary><span class="aic">▸</span><span class="atx">${summary}<span class="alast"> · ${esc(plainSpaces(last.text).split("\n")[0]!.slice(0, 90))}</span></span><span class="when">${time(last.at)}</span></summary>${steps.map(row).join("")}</details>`;
}

export async function agentsView(env: Env, me: string, url: URL, people: string[], cookie = ""): Promise<string> {
  const mine = await myProjects(env, me);
  const ph = (n: number) => Array.from({ length: n }, () => "?").join(",") || "NULL";
  const everyone = people.includes(me) ? people : [...people, me];
  const { results: agents } = await env.DB.prepare(
    `SELECT member, session_id, label, project, project_pin, repo, loops, branch, note, client, host, version, last_seen, state, state_detail, state_at FROM sessions
     WHERE member IN (${ph(everyone.length)}) AND (member = ? OR project IN (${ph(mine.length)})) AND last_seen > ?
     ORDER BY member = ? DESC, last_seen DESC`,
  )
    .bind(...everyone, me, ...mine, Date.now() - 24 * 3600_000, me)
    .all<Agent>();
  const connected = env.live?.() ?? new Set<string>();
  const nick = await hostNames(env, me);
  const hostOf = (a: Agent) => (a.member === me ? nick.get(a.host) ?? a.host : a.host);
  const isOn = (a: Agent) => connected.has(`${a.member}/${a.session_id}`) || Date.now() - a.last_seen < 10 * 60_000;
  // Loops (/loop, scheduled prompts) of your own connected agents, as their transcripts show them.
  const loopsOf = (a: Agent) => (a.member === me && isOn(a) ? activeLoops(parseLoops(a.loops)) : []);
  const loopBadge = (a: Agent) => {
    const ls = loopsOf(a);
    return ls.length ? `<span class="badge accent" title="${esc(ls.map((l) => describe(l)).join("\n"))}">🔁${ls.length > 1 ? ` ${ls.length}` : ""}</span>` : "";
  };
  const key = (a: Agent) => `${a.member}/${a.label}`;
  /** Working / idle / needs you, from the session's own hooks; "gone" once it isn't connected. */
  const stateBadge = (a: Agent) => {
    if (!isOn(a)) return "";
    if (a.state === "waiting") return `<span class="badge red" title="${esc(a.state_detail)}">⚠ ${esc(a.state_detail || "needs you")}</span>`;
    if (a.state === "working") return `<span class="badge accent">⚙ working</span>`;
    if (a.state === "idle") return `<span class="badge green">idle</span>`;
    return "";
  };
  const picked = url.searchParams.get("agent");
  const agent = agents.find((a) => key(a) === picked) ?? agents.find((a) => a.member === me && isOn(a)) ?? agents.find(isOn) ?? agents[0];

  const card = (a: Agent) => `<a class="acard ${agent && key(a) === key(agent) ? "on" : ""}" href="/dashboard?view=agents&agent=${encodeURIComponent(key(a))}">
      <span class="dot ${isOn(a) ? "on" : ""}" style="margin-top:6px" title="${isOn(a) ? "connected" : `last seen ${ago(a.last_seen)}`}"></span>
      <span class="grow" style="min-width:0">
        <span class="nm">${clientBadge(a.client)}${a.member === me ? esc(a.label) : `${esc(a.member)}/${esc(a.label)}`}${stateBadge(a)}${loopBadge(a)}${a.member === me && isOn(a) && outdated(a.version) ? `<span class="badge amber" title="Runs intercom ${esc(a.version || "an old version")}; ${PLUGIN_VERSION} is available">⬆ update</span>` : ""}</span>
        <span class="sub">${a.host ? `${icon("monitor", 11)} ${esc(hostOf(a))} · ` : ""}${a.project ? `#${esc(a.project)}` : "no project"}${a.branch ? ` · ${icon("branch", 11)} ${esc(a.branch)}` : ""}${isOn(a) ? "" : ` · seen ${ago(a.last_seen)}`}</span>
        ${a.note ? `<span class="st">${esc(a.note)}</span>` : ""}
      </span></a>`;
  // Connected agents first; the rest (ended, killed, laptop asleep) fold away unless one of them is open.
  const sel = (a: Agent) => !!agent && key(a) === key(agent);
  const group = (title: string, list: Agent[], id: string) => {
    const live = list.filter(isOn);
    const gone = list.filter((a) => !isOn(a));
    if (!list.length) return "";
    return `<div class="nav"><div class="label">${title} · ${live.length}${gone.length ? ` <span style="font-weight:500;text-transform:none;letter-spacing:0">(+${gone.length} not connected)</span>` : ""}</div></div>
      ${live.map(card).join("")}
      ${gone.length ? `<details id="gone-${id}" ${gone.some(sel) ? "open" : ""}><summary>Not connected · ${gone.length}</summary>${gone.map(card).join("")}</details>` : ""}`;
  };
  const own = agents.filter((a) => a.member === me);
  const theirs = agents.filter((a) => a.member !== me);
  const list = `<aside class="alist">
      ${own.length ? group("Your agents", own, "own") : `<div class="nav"><div class="label">Your agents</div></div><p class="small muted" style="padding:0 10px">No agent sessions in the last day. Start Claude Code or Codex in a repo of one of your projects.</p>`}
      ${group("Teammates' agents", theirs, "theirs")}
    </aside>`;

  // Away mode and the approval questions waiting for an answer.
  const { away, waitMin } = await awayState(env, me);
  const pending = await pendingApprovals(env, me);
  const now = Date.now();
  const approvalCard = (p: (typeof pending)[number]) => `<div class="approval">
      <div class="row" style="gap:8px">${icon("shield", 15)}<b>${esc(p.label)}</b>${clientBadge(p.client)}<span class="small muted">wants to use ${esc(p.tool)} · ${time(p.created_at)} · denied in ${Math.max(0, Math.round((p.expires_at - now) / 60000))} min if unanswered</span></div>
      <pre class="mdpre" style="margin:8px 0">${esc(p.summary)}</pre>
      <form method="post" action="/approval/${p.id}" class="row" data-quiet>${hidden({ back: url.pathname + url.search })}
        <input name="note" placeholder="Note for the agent (optional), e.g. “use the staging DB instead”" class="grow" style="height:32px;font-size:13px">
        <button name="decision" value="allow" class="btn sm primary">${icon("check", 14)}Allow</button>
        <button name="decision" value="deny" class="btn sm danger">${icon("x", 14)}Deny</button>
      </form>
    </div>`;
  const stale = agents.filter((a) => a.member === me && isOn(a) && outdated(a.version));
  const updateBar = stale.length
    ? `<section class="card updatebar" id="updatebar" data-region><div class="row" style="gap:10px;flex-wrap:nowrap">${icon("download", 16)}
        <div class="grow" style="min-width:0"><b>intercom ${PLUGIN_VERSION} is available</b> <span class="small muted">· <span title="${esc(stale.map((a) => a.label).join(", "))}" style="text-decoration:underline dotted">${stale.length} of your running sessions</span> run${stale.length > 1 ? "" : "s"} an older version. They update automatically at their next start; restart them to load it, or update now with <code>/intercom update</code>.</span></div>
      </div></section>`
    : "";
  const awayBar = `${updateBar}<section class="card awaybar ${away ? "on" : ""}" id="awaybar" data-region>
      <div class="row" style="gap:10px">
        <span style="font-size:18px">${away ? "🌙" : "🖥"}</span>
        <div class="grow"><b>${away ? "Away mode is on" : "At your desk"}</b>
          <span class="small muted"> · ${away ? `approval questions come here; unanswered ones are denied after ${waitMin} min` : "approval questions show in each agent's terminal; turn on away mode to answer them here"}</span></div>
        <form method="post" action="/away" class="row" data-native>
          ${away ? "" : `<label class="small muted">deny after <input name="wait" type="number" min="1" max="60" value="${waitMin}" style="width:64px;height:28px"> min</label>`}
          <input type="hidden" name="away" value="${away ? "off" : "on"}"><button class="btn sm ${away ? "" : "primary"}">${away ? "I'm back" : "I'm leaving"}</button>
        </form>
      </div>
      ${pending.length ? `<div class="stack" style="margin-top:12px">${pending.map(approvalCard).join("")}</div>` : ""}
    </section>`;

  if (!agent) return `${awayBar}<div class="agents" id="agents" data-region>${list}<section class="card chat"><div class="empty" style="margin:auto">${icon("radio", 30)}<div>No agents to talk to yet.</div></div></section></div>`;

  const { results: rows } = await env.DB.prepare(
    // You (or your agents) → it, it → you (or your agents); for your own agents also every DM it sent or got,
    // so agent-to-agent conversations can be followed. A teammate's agent only ever shows what involves you.
    `SELECT * FROM messages WHERE
       (sender = ?1 AND recipient = ?2 AND recipient_agent = ?3)
       OR (sender = ?2 AND sender_agent = ?3 AND recipient = ?1 AND (recipient_agent IS NULL OR ?1 != ?2))
       OR (?1 = ?2 AND sender = ?2 AND sender_agent = ?3 AND recipient IS NOT NULL)
       OR (?1 = ?2 AND recipient = ?2 AND recipient_agent IN (?3, ?4))
       OR (sender = ?2 AND sender_agent = ?3 AND recipient IS NULL AND kind != 'event' AND channel IN (${ph(mine.length)}))
     ORDER BY id DESC LIMIT 150`,
  )
    .bind(me, agent.member, agent.label, agent.project || "\u0000", ...mine)
    .all<Message>();
  // What the agent is doing, mirrored from its transcript: only ever for your own agents.
  const { results: acts } =
    agent.member === me
      ? await env.DB.prepare("SELECT * FROM activity WHERE member = ? AND session_id = ? ORDER BY id DESC LIMIT 200").bind(me, agent.session_id).all<Activity>()
      : { results: [] as Activity[] };
  const marks = await deliveryMarks(env, me, rows);
  const ACT_ICON: Record<string, string> = { cmd: "$", edit: "✎", read: "·", tool: "⚙", text: "●", prompt: "›", loop: "↻" };
  const actRow = (a: Activity) =>
    `<div class="act act-${a.kind}" data-mid="a${a.id}"><span class="aic">${ACT_ICON[a.kind] ?? "·"}</span><span class="atx">${
      a.kind === "text" ? md(a.text) : a.kind === "prompt" ? `<span class="muted">typed in the terminal:</span> ${esc(plainSpaces(a.text))}` : esc(plainSpaces(a.text))
    }</span><span class="when">${time(a.at)}</span></div>`;
  type Item = { at: number; html: string; act?: Activity };
  const items: Item[] = [];
  const thread0 = rows
    .reverse()
    .map((m) => {
      if (!m.recipient) {
        return `<div class="activity" data-mid="${m.id}">${icon("hash", 12)}<span>#${esc(m.channel)} · ${esc(plainSpaces(m.body).split("\n")[0]!.slice(0, 240))}</span><span class="when">${time(m.created_at)}</span></div>`;
      }
      const fromMe = m.sender === me && !m.sender_agent;
      const mark = deliveryMark(marks.get(m.id));
      const replyToYou = m.sender === agent.member && m.sender_agent === agent.label && m.recipient === me && (!m.recipient_agent || agent.member !== me);
      if (!fromMe && !replyToYou) {
        // Agent-to-agent (or a teammate writing to your agent): who to whom, shown apart from your own conversation.
        const from = address(m.sender, m.sender_agent);
        const to = address(m.recipient!, m.recipient_agent);
        return `<div class="bubble md relay" data-mid="${m.id}"><span class="rhd">${esc(from)} → ${esc(to)}</span>${md(m.body)}<span class="when">${time(m.created_at)}${mark}</span></div>`;
      }
      return `<div class="bubble md ${fromMe ? "mine" : ""}" data-mid="${m.id}" data-who="${esc(agent.label)}">${md(m.body)}<span class="when">${time(m.created_at)}${mark}</span></div>`;
    });
  rows.forEach((m, i) => items.push({ at: m.created_at, html: thread0[i]! }));
  // A dashboard message handed to the agent as a prompt (the mod's prompt.submit, codex queue) is also in its
  // transcript, so the mirror would show it twice. The "you" bubble already has it: skip the mirrored copy.
  const flat = (t: string) => plainSpaces(t).replace(/^The intercom-ui plugin sent a message:\s*/i, "").replace(/…$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  const sentByYou = rows.filter((m) => m.sender === me && !m.sender_agent && m.recipient).map((m) => flat(m.body).slice(0, 80)).filter((b) => b.length >= 8);
  const echo = (a: Activity) => {
    if (a.kind !== "prompt") return false;
    const t = flat(a.text);
    return t.length >= 8 && sentByYou.some((b) => t.includes(b.slice(0, Math.min(b.length, t.length))));
  };
  for (const a of [...acts].reverse()) if (!echo(a)) items.push({ at: a.at, html: actRow(a), act: a }); // oldest first; sort is stable
  // Like Claude Code, consecutive tool steps (commands, reads, edits, tool calls) fold into one line; the agent's
  // text, your messages and typed prompts stay out. A working agent's latest run stays open to watch it live.
  const STEP = new Set(["cmd", "edit", "read", "tool"]);
  const sorted = items.sort((x, y) => x.at - y.at);
  const out: string[] = [];
  let run: Activity[] = [];
  const working = isOn(agent) && agent.state === "working";
  const flush = (tail: boolean) => {
    if (run.length === 1) out.push(actRow(run[0]!));
    else if (run.length > 1) out.push(foldSteps(run, tail && working, actRow));
    run = [];
  };
  for (const it of sorted) {
    if (it.act && STEP.has(it.act.kind)) run.push(it.act);
    else {
      flush(false);
      out.push(it.html);
    }
  }
  flush(true);
  const thread = out.join("");
  const on = isOn(agent);
  const ownAgent = agent.member === me;
  const back = `/dashboard?view=agents&agent=${encodeURIComponent(key(agent))}`;
  const chat = `<section class="card chat">
      <div class="hd">
        <span class="presence ${on ? "on" : ""}">${avatar(agent.label, "m")}</span>
        <div class="grow" style="min-width:0">
          <h2 style="display:flex;gap:8px;align-items:center"><span class="grow" style="display:flex;gap:8px;align-items:center">${esc(key(agent))}${ownAgent ? `<button type="button" class="btn ghost xs icon renamebtn" data-open="dlg-rename" title="Rename this agent">${icon("pencil", 12)}</button>` : ""}${clientBadge(agent.client, true)}</span>
            <button type="button" class="btn ghost xs icon ttog" data-relaytoggle title="Messages between agents: click to show or hide">${icon("messages", 14)}</button>${ownAgent ? `<button type="button" class="btn ghost xs icon ttog" data-acttoggle title="Follow what the agent is doing (commands, edits, its text; only you see this): click to turn on or off"><span class="when-on">${icon("eye", 14)}</span><span class="when-off">${icon("eyeOff", 14)}</span></button>` : ""}<span class="viewtoggle" title="How messages are shown (remembered in this browser)"><button type="button" data-chatstyle="term">Terminal</button><button type="button" data-chatstyle="chat">Chat</button></span></h2>
          <div class="meta-row">${stateBadge(agent)}<span>${agent.host ? `on <b style="color:var(--ink-2)">${esc(hostOf(agent))}</b>${ownAgent ? `<button type="button" class="btn ghost xs icon renamebtn" data-open="dlg-host" title="Rename this machine">${icon("pencil", 11)}</button>` : ""} · ` : ""}${agent.project ? `#${esc(agent.project)}` : "no project"}${ownAgent && agent.project_pin ? ` <span class="badge" title="Set from the dashboard for this session; its repo would put it in ${esc(agent.repo ? `whatever ${agent.repo} maps to` : "no project")}">pinned</span>` : ""}${ownAgent ? `<button type="button" class="btn ghost xs icon renamebtn" data-open="dlg-project" title="Choose its project">${icon("pencil", 11)}</button>` : ""}${agent.branch ? ` · ${icon("branch", 12)} ${esc(agent.branch)}` : ""}${on ? "" : ` · last seen ${ago(agent.last_seen)}`}${agent.note ? ` · “${esc(plainSpaces(agent.note))}”` : ""}</span></div>${loopsOf(agent).map((l) => `<div class="meta-row looprow"><span>🔁 ${esc(describe(l))}</span></div>`).join("")}
        </div>
      </div>
      ${on && agent.state === "waiting" ? `<div class="toast err" style="box-shadow:none;margin:10px 14px 0">${icon("x")}<span><b>${esc(agent.label)} is waiting:</b> ${esc(agent.state_detail || "for approval or input")}. That can only be answered in its terminal (or with Claude's Remote Control); for unattended runs, start agents in a mode that doesn't stop to ask.</span></div>` : ""}
      <div class="thread${/(?:^|;\s*)ic_chat=chat/.test(cookie) ? "" : " term"}${/(?:^|;\s*)ic_activity=off/.test(cookie) ? " noact" : ""}${/(?:^|;\s*)ic_relay=off/.test(cookie) ? " norelay" : ""}" id="thread" data-region>${thread || `<div class="empty" style="margin:auto">${icon("message", 28)}<div>No messages with ${esc(agent.label)} yet.</div><div class="small">${ownAgent ? "Ask a question or give it a new direction; it treats what you write here like a prompt you typed." : "Your message reaches this session; its owner's agent treats it as information from you."}</div></div>`}</div>
      <form method="post" action="/action/post" class="chatbox" id="chatform" data-region data-quiet>${hidden({ back, to: key(agent), channel: agent.project || "" })}
        <div class="row" style="align-items:flex-end;flex-wrap:nowrap">
          <textarea id="chat-input" name="message" data-chat required maxlength="4000" class="grow" rows="2" placeholder="Message ${esc(agent.label)} — Enter to send, Shift+Enter for a new line"></textarea>
          <button class="btn primary" style="height:48px" title="${on ? (ownAgent ? "It picks this up right away if it's idle, or after its current step." : "It sees this on its next step.") : "Not connected: the next session with this name gets it."}">${icon("send", 15)}Send</button>
        </div>
        <div class="chips">${[...QUICK, ...(loopsOf(agent).length ? LOOP_CHIPS : [])].map((q) => `<button type="button" class="chip" data-chip="${esc(q)}">${esc(q)}</button>`).join("")}${on ? "" : '<span class="tiny muted" style="align-self:center">· not connected: the next session with this name gets it</span>'}</div>
      </form>
    </section>`;
  const dialogs = ownAgent
    ? `<dialog id="dlg-rename"><div class="hd">${icon("pencil", 18)}<h2>Rename ${esc(agent.label)}</h2></div>
        <form method="post" action="/agent/rename" data-native>${hidden({ session: agent.session_id, back: "/dashboard?view=agents" })}<div class="bd stack">
          <label class="field">Name<input name="name" required value="${esc(agent.label)}" pattern="[A-Za-z][A-Za-z0-9-]{0,23}" autocomplete="off"></label>
          <label class="field">Role <span class="tiny">(optional; shown as its status)</span><input name="role" value="${esc(agent.note)}" placeholder="e.g. reviews migrations"></label>
          ${agent.project ? `<label class="check"><input type="checkbox" name="remember" checked> Remember: new ${agent.client === "codex" ? "Codex" : "Claude Code"} sessions in #${esc(agent.project)} take this name when it's free</label>` : ""}
          <p class="tiny muted" style="margin:0">Messages to the new name reach this session; anything sent to the name while no session had it is delivered too.</p>
        </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${icon("check", 14)}Rename</button></div></form></dialog>
      <dialog id="dlg-project"><div class="hd">${icon("hash", 18)}<h2>Project for ${esc(agent.label)}</h2></div>
        <form method="post" action="/agent/project" data-native>${hidden({ session: agent.session_id, back: `/dashboard?view=agents&agent=${encodeURIComponent(key(agent))}` })}<div class="bd stack">
          <label class="field">Project<select name="project">
            <option value=""${agent.project_pin ? "" : " selected"}>Follow its repo${agent.repo ? ` (${esc(agent.repo)})` : ""}</option>
            ${mine.map((p) => `<option value="${esc(p)}"${agent.project_pin === p ? " selected" : ""}>#${esc(p)}</option>`).join("")}
          </select></label>
          <label class="check"><input type="radio" name="scope" value="session" checked> This session only <span class="tiny muted">(until you change it back; other sessions in the repo are unaffected)</span></label>
          <label class="check"><input type="radio" name="scope" value="repo"${agent.repo ? "" : " disabled"}> Always for ${agent.repo ? `repo <code>${esc(agent.repo)}</code>` : "its repo (not reported yet)"} <span class="tiny muted">(links it to the project; future sessions there join it)</span></label>
          <p class="tiny muted" style="margin:0">The agent is told at its next turn, with the project's rules, crew and records. It isn't woken up for it.</p>
        </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${icon("check", 14)}Save</button></div></form></dialog>
      ${agent.host ? `<dialog id="dlg-host"><div class="hd">${icon("monitor", 18)}<h2>Name this machine</h2></div>
        <form method="post" action="/host/rename" data-native>${hidden({ host: agent.host, back: `/dashboard?view=agents&agent=${encodeURIComponent(key(agent))}` })}<div class="bd stack">
          <label class="field">Shown as <span class="tiny">(only you see this nickname; empty = “${esc(agent.host)}”)</span><input name="name" value="${esc(nick.get(agent.host) ?? "")}" placeholder="${esc(agent.host)}" maxlength="40"></label>
        </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${icon("check", 14)}Save</button></div></form></dialog>` : ""}`
    : "";
  return `${awayBar}${dialogs}<div class="agents" id="agents">${list.replace('<aside class="alist">', '<aside class="alist" id="alist" data-region>')}${chat.replace('<div class="hd">', '<div class="hd" id="chathd" data-region>')}</div>`;
}
