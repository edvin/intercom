// The Agents view: every agent session you can reach (yours first), and a chat with the one you pick.
// What you write there reaches that session as YOUR USER (your own agents act on it like a typed prompt);
// what it answers comes back here. Its project posts show in the thread as activity.

import { awayState, pendingApprovals } from "./approvals";
import { type Env, type Message, ago, myProjects } from "./lib";
import { avatar, esc, hidden, icon, md, time } from "./ui";

interface Agent {
  member: string;
  session_id: string;
  label: string;
  project: string;
  branch: string;
  note: string;
  client: string;
  last_seen: number;
  state: string;
  state_detail: string;
  state_at: number | null;
}

const QUICK = ["What's your status?", "Pause and check in with me before going further.", "Stop, summarize what you've done, and wait.", "Commit and push what you have."];

export async function agentsView(env: Env, me: string, url: URL, people: string[]): Promise<string> {
  const mine = await myProjects(env, me);
  const ph = (n: number) => Array.from({ length: n }, () => "?").join(",") || "NULL";
  const everyone = people.includes(me) ? people : [...people, me];
  const { results: agents } = await env.DB.prepare(
    `SELECT member, session_id, label, project, branch, note, client, last_seen, state, state_detail, state_at FROM sessions
     WHERE member IN (${ph(everyone.length)}) AND (member = ? OR project IN (${ph(mine.length)})) AND last_seen > ?
     ORDER BY member = ? DESC, last_seen DESC`,
  )
    .bind(...everyone, me, ...mine, Date.now() - 24 * 3600_000, me)
    .all<Agent>();
  const connected = env.live?.() ?? new Set<string>();
  const isOn = (a: Agent) => connected.has(`${a.member}/${a.session_id}`) || Date.now() - a.last_seen < 10 * 60_000;
  const key = (a: Agent) => `${a.member}/${a.label}`;
  /** Working / idle / needs you, from the session's own hooks; "gone" once it isn't connected. */
  const stateBadge = (a: Agent) => {
    if (!isOn(a)) return `<span class="badge">not connected</span>`;
    if (a.state === "waiting") return `<span class="badge red" title="${esc(a.state_detail)}">⚠ ${esc(a.state_detail || "needs you")}</span>`;
    if (a.state === "working") return `<span class="badge accent">⚙ working</span>`;
    if (a.state === "idle") return `<span class="badge green">idle</span>`;
    return "";
  };
  const picked = url.searchParams.get("agent");
  const agent = agents.find((a) => key(a) === picked) ?? agents.find((a) => a.member === me && isOn(a)) ?? agents[0];

  const card = (a: Agent) => `<a class="acard ${agent && key(a) === key(agent) ? "on" : ""}" href="/dashboard?view=agents&agent=${encodeURIComponent(key(a))}">
      <span class="dot ${isOn(a) ? "on" : ""}" style="margin-top:6px" title="${isOn(a) ? "connected" : `last seen ${ago(a.last_seen)}`}"></span>
      <span class="grow" style="min-width:0">
        <span class="nm">${a.member === me ? esc(a.label) : `${esc(a.member)}/${esc(a.label)}`}${a.client === "codex" ? '<span class="badge">Codex</span>' : ""}</span>
        <span class="sub">${a.project ? `#${esc(a.project)}` : "no project"}${a.branch ? ` · ⎇ ${esc(a.branch)}` : ""}${isOn(a) ? "" : ` · seen ${ago(a.last_seen)}`}</span>
        <span style="display:block;margin-top:3px">${stateBadge(a)}</span>
        ${a.note ? `<span class="st">${esc(a.note)}</span>` : ""}
      </span></a>`;
  const own = agents.filter((a) => a.member === me);
  const theirs = agents.filter((a) => a.member !== me);
  const list = `<aside class="alist">
      <div class="nav"><div class="label" style="margin-top:0">Your agents · ${own.length}</div></div>
      ${own.length ? own.map(card).join("") : `<p class="small muted" style="padding:0 10px">No agent sessions in the last day. Start Claude Code or Codex in a repo of one of your projects.</p>`}
      ${theirs.length ? `<div class="nav"><div class="label">Teammates' agents · ${theirs.length}</div></div>${theirs.map(card).join("")}` : ""}
    </aside>`;

  // Away mode and the approval questions waiting for an answer.
  const { away, waitMin } = await awayState(env, me);
  const pending = await pendingApprovals(env, me);
  const now = Date.now();
  const approvalCard = (p: (typeof pending)[number]) => `<div class="approval">
      <div class="row" style="gap:8px">${icon("shield", 15)}<b>${esc(p.label)}</b>${p.client === "codex" ? '<span class="badge">Codex</span>' : ""}<span class="small muted">wants to use ${esc(p.tool)} · ${time(p.created_at)} · denied in ${Math.max(0, Math.round((p.expires_at - now) / 60000))} min if unanswered</span></div>
      <pre class="mdpre" style="margin:8px 0">${esc(p.summary)}</pre>
      <form method="post" action="/approval/${p.id}" class="row" data-quiet>${hidden({ back: url.pathname + url.search })}
        <input name="note" placeholder="Note for the agent (optional), e.g. “use the staging DB instead”" class="grow" style="height:32px;font-size:13px">
        <button name="decision" value="allow" class="btn sm primary">${icon("check", 14)}Allow</button>
        <button name="decision" value="deny" class="btn sm danger">${icon("x", 14)}Deny</button>
      </form>
    </div>`;
  const awayBar = `<section class="card awaybar ${away ? "on" : ""}" id="awaybar" data-region>
      <div class="row" style="gap:10px">
        <span style="font-size:20px">${away ? "🌙" : "🖥"}</span>
        <div class="grow"><b>${away ? "Away mode is on" : "At your desk"}</b>
          <div class="small muted">${away ? `Approval questions from your agents come here; unanswered ones are denied after ${waitMin} min so nobody hangs.` : "Approval questions show in each agent's terminal. Turn on away mode before you leave to answer them here."}</div></div>
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
       OR (sender = ?2 AND sender_agent = ?3 AND recipient IS NULL AND channel IN (${ph(mine.length)}))
     ORDER BY id DESC LIMIT 150`,
  )
    .bind(me, agent.member, agent.label, ...mine)
    .all<Message>();
  const thread = rows
    .reverse()
    .map((m) => {
      if (!m.recipient) {
        return `<div class="activity" data-mid="${m.id}">${icon(m.kind === "event" ? "radio" : "hash", 12)}<span>#${esc(m.channel)} · ${m.kind === "event" ? esc(m.body) : md(m.body)} · ${time(m.created_at)}</span></div>`;
      }
      const fromMe = m.sender === me && !m.sender_agent;
      return `<div class="bubble ${fromMe ? "me" : ""}" data-mid="${m.id}">${md(m.body)}<span class="when">${fromMe ? "you" : esc(agent.label)} · ${time(m.created_at)}</span></div>`;
    })
    .join("");
  const on = isOn(agent);
  const ownAgent = agent.member === me;
  const back = `/dashboard?view=agents&agent=${encodeURIComponent(key(agent))}`;
  const chat = `<section class="card chat">
      <div class="hd">
        <span class="presence ${on ? "on" : ""}">${avatar(agent.label, "m")}</span>
        <div class="grow" style="min-width:0">
          <h2 style="display:flex;gap:8px;align-items:center">${esc(key(agent))}${agent.client === "codex" ? '<span class="badge">Codex</span>' : '<span class="badge">Claude Code</span>'}</h2>
          <div class="small muted row" style="gap:6px">${stateBadge(agent)}<span>${agent.project ? `#${esc(agent.project)}` : "no project"}${agent.branch ? ` · ⎇ ${esc(agent.branch)}` : ""}${on ? "" : ` · last seen ${ago(agent.last_seen)}`}${agent.note ? ` · “${esc(agent.note)}”` : ""}</span></div>
        </div>
      </div>
      ${on && agent.state === "waiting" ? `<div class="toast err" style="box-shadow:none;margin:10px 14px 0">${icon("x")}<span><b>${esc(agent.label)} is waiting:</b> ${esc(agent.state_detail || "for approval or input")}. That can only be answered in its terminal (or with Claude's Remote Control); for unattended runs, start agents in a mode that doesn't stop to ask.</span></div>` : ""}
      <div class="thread" id="thread" data-region>${thread || `<div class="empty" style="margin:auto">${icon("message", 28)}<div>No messages with ${esc(agent.label)} yet.</div><div class="small">${ownAgent ? "Ask a question or give it a new direction; it treats what you write here like a prompt you typed." : "Your message reaches this session; its owner's agent treats it as information from you."}</div></div>`}</div>
      <form method="post" action="/action/post" class="chatbox" data-quiet>${hidden({ back, to: key(agent), channel: agent.project || "" })}
        <textarea id="chat-input" name="message" data-chat required maxlength="4000" placeholder="Message ${esc(agent.label)} — Enter to send, Shift+Enter for a new line"></textarea>
        <div class="row">
          <div class="chips">${QUICK.map((q) => `<button type="button" class="chip" data-chip="${esc(q)}">${esc(q)}</button>`).join("")}</div>
          <span class="grow"></span>
          <span class="tiny muted">${on ? (ownAgent ? "It picks this up right away if it's idle, or after its current step." : "It sees this on its next step.") : "Not connected: the next session with this name gets it."}</span>
          <button class="btn primary sm">${icon("send", 14)}Send</button>
        </div>
      </form>
    </section>`;
  return `${awayBar}<div class="agents" id="agents">${list.replace('<aside class="alist">', '<aside class="alist" id="alist" data-region>')}${chat.replace('<div class="hd">', '<div class="hd" id="chathd" data-region>')}</div>`;
}
