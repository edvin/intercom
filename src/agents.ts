// The Agents view: every agent session you can reach (yours first), and a chat with the one you pick.
// What you write there reaches that session as YOUR USER (your own agents act on it like a typed prompt);
// what it answers comes back here. Its project posts show in the thread as activity.

import { awayState, pendingApprovals } from "./approvals";
import { PLUGIN_VERSION, outdated } from "./version";
import { type Activity, type Env, type Message, ago, hostNames, myProjects } from "./lib";
import { avatar, esc, hidden, icon, md, time } from "./ui";

interface Agent {
  member: string;
  session_id: string;
  label: string;
  project: string;
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

const QUICK = ["What's your status?", "Pause and check in with me first.", "Stop, summarize, and wait.", "Commit and push what you have."];

export async function agentsView(env: Env, me: string, url: URL, people: string[]): Promise<string> {
  const mine = await myProjects(env, me);
  const ph = (n: number) => Array.from({ length: n }, () => "?").join(",") || "NULL";
  const everyone = people.includes(me) ? people : [...people, me];
  const { results: agents } = await env.DB.prepare(
    `SELECT member, session_id, label, project, branch, note, client, host, version, last_seen, state, state_detail, state_at FROM sessions
     WHERE member IN (${ph(everyone.length)}) AND (member = ? OR project IN (${ph(mine.length)})) AND last_seen > ?
     ORDER BY member = ? DESC, last_seen DESC`,
  )
    .bind(...everyone, me, ...mine, Date.now() - 24 * 3600_000, me)
    .all<Agent>();
  const connected = env.live?.() ?? new Set<string>();
  const nick = await hostNames(env, me);
  const hostOf = (a: Agent) => (a.member === me ? nick.get(a.host) ?? a.host : a.host);
  const isOn = (a: Agent) => connected.has(`${a.member}/${a.session_id}`) || Date.now() - a.last_seen < 10 * 60_000;
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
        <span class="nm">${clientBadge(a.client)}${a.member === me ? esc(a.label) : `${esc(a.member)}/${esc(a.label)}`}${stateBadge(a)}${a.member === me && isOn(a) && outdated(a.version) ? `<span class="badge amber" title="Runs intercom ${esc(a.version || "an old version")}; ${PLUGIN_VERSION} is available">⬆ update</span>` : ""}</span>
        <span class="sub">${a.host ? `${icon("monitor", 11)} ${esc(hostOf(a))} · ` : ""}${a.project ? `#${esc(a.project)}` : "no project"}${a.branch ? ` · ⎇ ${esc(a.branch)}` : ""}${isOn(a) ? "" : ` · seen ${ago(a.last_seen)}`}</span>
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
    ? `<section class="card updatebar" id="updatebar" data-region><div class="row" style="gap:10px">${icon("download", 16)}
        <div class="grow"><b>Update available: intercom ${PLUGIN_VERSION}</b> <span class="small muted">· ${stale.length} of your running session${stale.length > 1 ? "s run" : " runs"} an older version (${esc(stale.map((a) => a.label).slice(0, 4).join(", "))}${stale.length > 4 ? "…" : ""})</span></div>
        <span class="small muted">Installed automatically at the next session start (unless auto-update is off); restart sessions to load it. Now: <code>/intercom update</code>.</span></div></section>`
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
    `SELECT * FROM messages WHERE
       (sender = ?1 AND sender_agent IS NULL AND recipient = ?2 AND recipient_agent = ?3)
       OR (sender = ?2 AND sender_agent = ?3 AND recipient = ?1 AND (recipient_agent IS NULL OR ?1 != ?2))
       OR (sender = ?2 AND sender_agent = ?3 AND recipient IS NULL AND kind != 'event' AND channel IN (${ph(mine.length)}))
     ORDER BY id DESC LIMIT 150`,
  )
    .bind(me, agent.member, agent.label, ...mine)
    .all<Message>();
  // What the agent is doing, mirrored from its transcript: only ever for your own agents.
  const { results: acts } =
    agent.member === me
      ? await env.DB.prepare("SELECT * FROM activity WHERE member = ? AND session_id = ? ORDER BY id DESC LIMIT 200").bind(me, agent.session_id).all<Activity>()
      : { results: [] as Activity[] };
  const ACT_ICON: Record<string, string> = { cmd: "$", edit: "✎", read: "·", tool: "⚙", text: "●", prompt: "›" };
  const actRow = (a: Activity) =>
    `<div class="act act-${a.kind}" data-mid="a${a.id}"><span class="aic">${ACT_ICON[a.kind] ?? "·"}</span><span class="atx">${
      a.kind === "text" ? md(a.text) : a.kind === "prompt" ? `<span class="muted">typed in the terminal:</span> ${esc(a.text)}` : esc(a.text)
    }</span><span class="when">${time(a.at)}</span></div>`;
  type Item = { at: number; html: string };
  const items: Item[] = [];
  const thread0 = rows
    .reverse()
    .map((m) => {
      if (!m.recipient) {
        return `<div class="activity" data-mid="${m.id}">${icon(m.kind === "event" ? "radio" : "hash", 12)}<span>#${esc(m.channel)} · ${esc(m.body.split("\n")[0]!.slice(0, 240))} · ${time(m.created_at)}</span></div>`;
      }
      const fromMe = m.sender === me && !m.sender_agent;
      return `<div class="bubble md ${fromMe ? "mine" : ""}" data-mid="${m.id}" data-who="${esc(agent.label)}">${md(m.body)}<span class="when">${time(m.created_at)}</span></div>`;
    });
  rows.forEach((m, i) => items.push({ at: m.created_at, html: thread0[i]! }));
  for (const a of [...acts].reverse()) items.push({ at: a.at, html: actRow(a) }); // oldest first; sort is stable
  const thread = items.sort((x, y) => x.at - y.at).map((x) => x.html).join("");
  const on = isOn(agent);
  const ownAgent = agent.member === me;
  const back = `/dashboard?view=agents&agent=${encodeURIComponent(key(agent))}`;
  const chat = `<section class="card chat">
      <div class="hd">
        <span class="presence ${on ? "on" : ""}">${avatar(agent.label, "m")}</span>
        <div class="grow" style="min-width:0">
          <h2 style="display:flex;gap:8px;align-items:center"><span class="grow" style="display:flex;gap:8px;align-items:center">${esc(key(agent))}${ownAgent ? `<button type="button" class="btn ghost xs icon" data-open="dlg-rename" title="Rename this agent">${icon("pencil", 12)}</button>` : ""}${clientBadge(agent.client, true)}</span>
            ${ownAgent ? '<button type="button" class="btn ghost xs" data-acttoggle title="Show or hide what the agent is doing (commands, edits, its text); only you see this">Activity</button>' : ""}<span class="viewtoggle" title="How messages are shown (remembered in this browser)"><button type="button" data-chatstyle="term">Terminal</button><button type="button" data-chatstyle="chat">Chat</button></span></h2>
          <div class="small muted row" style="gap:6px">${stateBadge(agent)}<span>${agent.host ? `on <b style="color:var(--ink-2)">${esc(hostOf(agent))}</b>${ownAgent ? `<button type="button" class="btn ghost xs icon" data-open="dlg-host" title="Rename this machine">${icon("pencil", 11)}</button>` : ""} · ` : ""}${agent.project ? `#${esc(agent.project)}` : "no project"}${agent.branch ? ` · ⎇ ${esc(agent.branch)}` : ""}${on ? "" : ` · last seen ${ago(agent.last_seen)}`}${agent.note ? ` · “${esc(agent.note)}”` : ""}</span></div>
        </div>
      </div>
      ${on && agent.state === "waiting" ? `<div class="toast err" style="box-shadow:none;margin:10px 14px 0">${icon("x")}<span><b>${esc(agent.label)} is waiting:</b> ${esc(agent.state_detail || "for approval or input")}. That can only be answered in its terminal (or with Claude's Remote Control); for unattended runs, start agents in a mode that doesn't stop to ask.</span></div>` : ""}
      <div class="thread" id="thread" data-region>${thread || `<div class="empty" style="margin:auto">${icon("message", 28)}<div>No messages with ${esc(agent.label)} yet.</div><div class="small">${ownAgent ? "Ask a question or give it a new direction; it treats what you write here like a prompt you typed." : "Your message reaches this session; its owner's agent treats it as information from you."}</div></div>`}</div>
      <form method="post" action="/action/post" class="chatbox" id="chatform" data-region data-quiet>${hidden({ back, to: key(agent), channel: agent.project || "" })}
        <div class="row" style="align-items:flex-end;flex-wrap:nowrap">
          <textarea id="chat-input" name="message" data-chat required maxlength="4000" class="grow" rows="2" placeholder="Message ${esc(agent.label)} — Enter to send, Shift+Enter for a new line"></textarea>
          <button class="btn primary" style="height:48px" title="${on ? (ownAgent ? "It picks this up right away if it's idle, or after its current step." : "It sees this on its next step.") : "Not connected: the next session with this name gets it."}">${icon("send", 15)}Send</button>
        </div>
        <div class="chips">${QUICK.map((q) => `<button type="button" class="chip" data-chip="${esc(q)}">${esc(q)}</button>`).join("")}${on ? "" : '<span class="tiny muted" style="align-self:center">· not connected: the next session with this name gets it</span>'}</div>
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
      ${agent.host ? `<dialog id="dlg-host"><div class="hd">${icon("monitor", 18)}<h2>Name this machine</h2></div>
        <form method="post" action="/host/rename" data-native>${hidden({ host: agent.host, back: `/dashboard?view=agents&agent=${encodeURIComponent(key(agent))}` })}<div class="bd stack">
          <label class="field">Shown as <span class="tiny">(only you see this nickname; empty = “${esc(agent.host)}”)</span><input name="name" value="${esc(nick.get(agent.host) ?? "")}" placeholder="${esc(agent.host)}" maxlength="40"></label>
        </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${icon("check", 14)}Save</button></div></form></dialog>` : ""}`
    : "";
  return `${awayBar}${dialogs}<div class="agents" id="agents">${list.replace('<aside class="alist">', '<aside class="alist" id="alist" data-region>')}${chat.replace('<div class="hd">', '<div class="hd" id="chathd" data-region>')}</div>`;
}
