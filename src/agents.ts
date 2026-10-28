// The Agents view: every agent session you can reach (yours first), and a chat with the one you pick.
// What you write there reaches that session as YOUR USER (your own agents act on it like a typed prompt);
// what it answers comes back here. Its project posts show in the thread as activity.

import { awayState, pendingApprovals } from "./approvals";
import { PLUGIN_VERSION, outdated } from "./version";
import { activeLoops, describe, parseLoops } from "./loops";
import { activeJobs, duration, jobName, parseJobs } from "./jobs";
import { BTW_TIMEOUT, NO_MOD, btwFor, modAnswers } from "./btw";
import { type Activity, type Env, type Message, LIVE, address, ago, deliveryMarks, short, hostNames, myProjects } from "./lib";
import { agentAvatar, agentHue, agentName, avatar, deliveryMark, esc, hidden, icon, md, plainSpaces, time } from "./ui";

interface Agent {
  member: string;
  session_id: string;
  label: string;
  project: string;
  project_pin?: string;
  loops?: string;
  jobs?: string;
  origin?: string;
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
  active_at: number | null;
  cwd?: string;
  ui_at?: number | null;
  ui_version?: string;
  ctx_pct?: number | null;
  ctx_tokens?: number | null;
  ctx_window?: number | null;
  ctx_at?: number | null;
  compact_req?: string | null;
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
    ? `<span class="client cx" title="OpenAI Codex">${CODEX_MARK}${named ? '<span class="cname">Codex</span>' : ""}</span>`
    : `<span class="client cl" title="Claude Code">${CLAUDE_MARK}${named ? '<span class="cname">Claude Code</span>' : ""}</span>`;

const LOOP_CHIPS = ["Stop your loop.", "Run your loop every 30 minutes instead."];
const QUICK = ["What's your status?", "Stop, summarize, and wait.", "Commit and push what you have."];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Ran 3 commands, read 2 files, edited 1 file" for a run of tool steps, expandable to the steps themselves. */
function foldSteps(steps: Activity[], open: boolean, row: (a: Activity) => string): string {
  const n = (k: string) => steps.filter((a) => a.kind === k).length;
  const parts = [
    n("cmd") ? `ran ${plural(n("cmd"), "command", "commands")}` : "",
    n("read") ? `read ${plural(n("read"), "file", "files")}` : "",
    n("edit") ? `edited ${plural(n("edit"), "file", "files")}` : "",
    n("tool") ? plural(n("tool"), "tool call", "tool calls") : "",
    n("text") ? "a note in its terminal" : "",
  ].filter(Boolean);
  const summary = parts.join(", ").replace(/^./, (c) => c.toUpperCase());
  const last = [...steps].reverse().find((a) => a.kind !== "text");
  return `<details class="actgroup" data-gid="g${steps[0]!.id}"${open ? " open data-live" : ""}><summary><span class="aic">▸</span><span class="atx">${summary}${last ? `<span class="alast"> · ${esc(plainSpaces(last.text).split("\n")[0]!.slice(0, 90))}</span>` : ""}</span><span class="when">${time(steps[steps.length - 1]!.at)}</span></summary>${steps.map(row).join("")}</details>`;
}

/** What the tree needs from the page: where you are, and the per-project counts the dashboard already has. */
export interface Nav {
  view: string;
  channel: string | null;
  mine: string[];
  locksBy: Map<string, number>;
  votesBy: Map<string, number>;
  votesTotal: number;
  admin: boolean;
  /** Build the chat too (the Agents view); otherwise only the tree. */
  withChat: boolean;
}

/**
 * The workspace: a tree on the left (everything, projects with their agents nested, your agents outside projects)
 * and, in the Agents view, the chosen agent's chat at full width.
 */
export async function agentsView(env: Env, me: string, url: URL, people: string[], cookie: string, nav: Nav): Promise<{ tree: string; main: string }> {
  const mine = await myProjects(env, me);
  const ph = (n: number) => Array.from({ length: n }, () => "?").join(",") || "NULL";
  const everyone = people.includes(me) ? people : [...people, me];
  const { results: agents } = await env.DB.prepare(
    `SELECT member, session_id, label, project, project_pin, repo, loops, jobs, origin, branch, note, client, host, version, last_seen, state, state_detail, state_at, active_at, cwd, ui_at, ui_version, ctx_pct, ctx_tokens, ctx_window, ctx_at, compact_req FROM sessions
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
  // Background jobs (shell commands running in the background) of your own connected agents.
  const jobsOf = (a: Agent) => (a.member === me && isOn(a) ? activeJobs(parseJobs(a.jobs)) : []);
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


  // The tree: projects with their agents nested (yours first, then teammates'), connected ones on top and the
  // rest folded; your agents outside any project at the end. Folded projects are remembered (cookie).
  const sel = (a: Agent) => nav.view === "agents" && !!agent && key(a) === key(agent);
  const closed = new Set(
    (cookie.match(/(?:^|;\s*)ic_tc=([^;]*)/)?.[1] ?? "")
      .split(",")
      .map((x) => decodeURIComponent(x))
      .filter(Boolean),
  );
  const dot = (a: Agent) => (!isOn(a) ? "off" : a.state === "waiting" ? "wait" : a.state === "working" ? "work" : "idle");
  const tip = (a: Agent) =>
    [key(a), !isOn(a) ? `last seen ${ago(a.last_seen)}` : a.state === "waiting" ? `needs you: ${a.state_detail || "waiting"}` : a.state || "connected", a.host ? `on ${hostOf(a)}` : "", a.branch ? `⎇ ${a.branch}` : "", a.member === me ? a.cwd : "", a.note]
      .filter(Boolean)
      .join(" · ");
  // When it last did something (a prompt, a step, a post), as a quiet "2m" on the row; working agents show their dot instead.
  const activeAt = (a: Agent) => a.active_at ?? a.state_at ?? a.last_seen;
  const since = (a: Agent) => (isOn(a) && a.state === "working" ? "" : `<time class="tt" data-ts="${activeAt(a)}" data-short title="last active ${ago(activeAt(a))}">${short(activeAt(a))}</time>`);
  // How full a Claude Code session's context is (its intercom-ui mod reports it): amber from 75%, red from 90%.
  const kTok = (n: number | null | undefined) => (n == null ? "?" : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const ctxLevel = (a: Agent) => (a.ctx_pct == null || a.client === "codex" ? null : a.ctx_pct >= 90 ? "red" : a.ctx_pct >= 75 ? "amber" : "");
  const ctxBadge = (a: Agent) =>
    ctxLevel(a) === null ? "" : `<span class="badge ctxb ${ctxLevel(a)}" title="Context: ${kTok(a.ctx_tokens)} of ${kTok(a.ctx_window)} tokens · ${ago(a.ctx_at ?? 0)}">${a.ctx_pct}% context</span>`;
  const tRow = (a: Agent) => `<a class="ta${sel(a) ? " on" : ""}${isOn(a) ? "" : " gone"}" data-k="${esc(key(a))}"${isOn(a) && a.state === "waiting" ? " data-w" : ""} href="/dashboard?view=agents&agent=${encodeURIComponent(key(a))}" title="${esc(tip(a))}">
      <span class="tdot ${dot(a)}"></span>${agentAvatar(a.member, a.label, "s")}<span class="tn">${agentName(a.member, a.label, a.member === me ? a.label : `${a.member}/${a.label}`)}</span>
      <span class="tb">${isOn(a) && a.state === "waiting" ? '<span class="tw" title="needs you">!</span>' : ""}${loopsOf(a).length ? '<span title="running a loop">🔁</span>' : ""}${jobsOf(a).length ? '<span title="background jobs">⧗</span>' : ""}${a.member === me && isOn(a) && outdated(a.version) ? '<span title="update available">⬆</span>' : ""}${isOn(a) && ctxLevel(a) ? `<span class="tctx ${ctxLevel(a)}" title="Context ${a.ctx_pct}% full">${a.ctx_pct}%</span>` : ""}${a.client === "codex" ? '<span class="tcx" title="Codex">cx</span>' : ""}${since(a)}</span></a>`;
  const branch = (id: string, title: string, href: string | null, list: Agent[], badges: string, on: boolean) => {
    // Needs you, then working, then the rest by when they last did something. Live redraws keep the order the
    // page loaded with (see the script), so rows don't move under the pointer.
    const rank = (a: Agent) => (a.state === "waiting" ? 0 : a.state === "working" ? 1 : 2);
    const live = list.filter(isOn).sort((x, y) => rank(x) - rank(y) || activeAt(y) - activeAt(x));
    const gone = list.filter((a) => !isOn(a)).sort((x, y) => activeAt(y) - activeAt(x));
    const open = !closed.has(id) || list.some(sel) || on;
    return `<details class="tp" id="tp-${esc(id)}" data-tp="${esc(id)}"${open ? " open" : ""}>
      <summary><span class="tcaret">${icon("chevron", 11)}</span>${href ? `<a class="tpn${on ? " on" : ""}" href="${href}">${title}</a>` : `<span class="tpn">${title}</span>`}<span class="tbadges">${badges}</span></summary>
      ${live.map(tRow).join("")}
      ${gone.length ? `<details class="toff" id="toff-${esc(id)}"${gone.some(sel) ? " open" : ""}><summary>${gone.length} not connected</summary>${gone.map(tRow).join("")}</details>` : ""}
      ${list.length ? "" : '<div class="tempty">no agents yet</div>'}
    </details>`;
  };
  const projectNodes = nav.mine
    .map((p) => {
      const votes = nav.votesBy.get(p) ?? 0;
      const locks = nav.locksBy.get(p) ?? 0;
      const badges = `${votes ? `<span class="badge accent" title="Votes waiting for you">${votes}</span>` : ""}${locks ? `<span class="badge amber" title="Active locks">${icon("lock", 9)}${locks}</span>` : ""}`;
      return branch(p, `<span class="th">#</span>${esc(p)}`, `/dashboard?channel=${encodeURIComponent(p)}`, agents.filter((a) => a.project === p), badges, nav.view === "feed" && nav.channel === p);
    })
    .join("");
  const loose = agents.filter((a) => a.member === me && (!a.project || !nav.mine.includes(a.project)));
  const { away, waitMin } = await awayState(env, me);
  const pending = await pendingApprovals(env, me);
  const tree = `<aside class="tree" id="tree" data-region>
    <nav class="ttop">
      <button type="button" class="tl" data-kopen>${icon("search", 14)}<span>Search</span><span class="kbd kbd-k" style="margin-left:auto">⌘K</span></button>
      <a class="tl${nav.view === "feed" && !nav.channel ? " on" : ""}" href="/dashboard">${icon("layers", 14)}<span>Everything</span>${nav.votesTotal ? `<span class="badge accent">${nav.votesTotal}</span>` : ""}</a>
      ${pending.length ? `<a class="tl warn" href="/dashboard?view=agents#approvals">${icon("shield", 14)}<span>Approvals</span><span class="badge red">${pending.length}</span></a>` : ""}
    </nav>
    <div class="tsec"><span>Projects</span><button type="button" class="btn ghost xs icon" data-open="dlg-create" title="New project">${icon("plus", 13)}</button></div>
    <div class="tbody">${projectNodes || '<p class="tempty">No projects yet.</p>'}${loose.length ? branch("~none", '<span class="th">∅</span>No project', null, loose, "", false) : ""}</div>
    <div class="tfoot">
      <button type="button" class="tl away${away ? " on" : ""}" data-open="dlg-away" title="${away ? `Away: approval questions come to the dashboard; unanswered ones are denied after ${waitMin} min` : "At your desk: approval questions show in each agent's terminal"}">${away ? "🌙" : "🖥"}<span>${away ? `Away · deny after ${waitMin}m` : "At your desk"}</span></button>
      <div class="row tlinks"><a href="/discover" title="Find projects">${icon("users", 13)}</a>${nav.admin ? `<a href="/dashboard?view=admin" class="${nav.view === "admin" ? "on" : ""}" title="Admin">${icon("shield", 13)}</a>` : ""}<a href="/docs" title="Docs">${icon("book", 13)}</a><span class="grow"></span><button type="button" class="btn ghost xs icon" data-treetoggle title="Hide the tree (⌘B)">${icon("sidebar", 13)}</button></div>
    </div>
  </aside>
  <dialog id="dlg-away"><div class="hd"><span style="font-size:18px">${away ? "🌙" : "🖥"}</span><h2>${away ? "Away mode is on" : "Going away?"}</h2></div>
    <form method="post" action="/away" data-native><div class="bd stack">
      <p class="small muted" style="margin:0">${away ? `Approval questions from your agents come to the dashboard; unanswered ones are denied after ${waitMin} min so agents move on.` : "In away mode, approval questions from your agents come here instead of waiting in a terminal, and unanswered ones are denied after a while so agents keep moving."}</p>
      ${away ? "" : `<label class="field">Deny unanswered questions after<input name="wait" type="number" min="1" max="60" value="${waitMin}" style="width:90px"> minutes</label>`}
      <input type="hidden" name="away" value="${away ? "off" : "on"}">
    </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${away ? "I'm back" : "I'm leaving"}</button></div></form></dialog>`;

  // Away mode and the approval questions waiting for an answer.
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
  // One line, until dismissed for this version (the next version shows it again).
  const stale = agents.filter((a) => a.member === me && isOn(a) && outdated(a.version));
  const dismissed = cookie.split(/;\s*/).includes(`ic_upd=${PLUGIN_VERSION}`);
  const updateBar =
    stale.length && !dismissed
      ? `<div class="updatebar" id="updatebar" data-region title="${esc(`Outdated: ${stale.map((a) => a.label).join(", ")}. Sessions update at their next start; restart them to load it, or run /intercom:update.`)}">${icon("download", 14)}
        <span class="grow"><b>intercom ${PLUGIN_VERSION}</b> · ${stale.length} session${stale.length > 1 ? "s" : ""} on an older version<span class="uphint"> · restart ${stale.length > 1 ? "them" : "it"} or run <code>/intercom:update</code></span></span>
        <button type="button" class="btn ghost xs icon" data-dismiss="ic_upd=${PLUGIN_VERSION}" title="Dismiss until the next version">${icon("x", 13)}</button></div>`
      : "";
  // Approval questions waiting for you: on top of the chat, only while there are any.
  const approvals = pending.length
    ? `<section class="card approvals" id="approvals" data-region><div class="hd"><h2>${icon("shield", 15)}Approvals · ${pending.length}</h2><span class="small muted">${away ? `denied after ${waitMin} min unless you answer` : "also asked in each agent's terminal"}</span></div><div class="stack" style="padding:0 14px 14px">${pending.map(approvalCard).join("")}</div></section>`
    : `<div id="approvals" data-region hidden></div>`;
  if (!nav.withChat) return { tree, main: "" };
  if (!agent) return { tree, main: `${updateBar}${approvals}<section class="card chat"><div class="empty" style="margin:auto">${icon("radio", 30)}<div>No agents to talk to yet.</div><div class="small">Start Claude Code or Codex in a repo; its session shows up in the tree.</div></div></section>` };

  const { results: rows } = await env.DB.prepare(
    // You (or your agents) → it, it → you (or your agents); for your own agents also every DM it sent or got,
    // so agent-to-agent conversations can be followed. A teammate's agent only ever shows what involves you.
    // Held or cancelled messages (unsend) only ever show to the person who wrote them.
    `SELECT * FROM messages WHERE (${LIVE} OR (sender = ?1 AND sender_agent IS NULL)) AND (
       (sender = ?1 AND recipient = ?2 AND recipient_agent = ?3)
       OR (sender = ?2 AND sender_agent = ?3 AND recipient = ?1 AND (recipient_agent IS NULL OR ?1 != ?2))
       OR (?1 = ?2 AND sender = ?2 AND sender_agent = ?3 AND recipient IS NOT NULL)
       OR (?1 = ?2 AND recipient = ?2 AND recipient_agent IN (?3, ?4))
       OR (sender = ?2 AND sender_agent = ?3 AND recipient IS NULL AND kind != 'event' AND channel IN (${ph(mine.length)})))
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
  // Each writer's repo, so their !MR / #issue / commit refs link where they belong.
  const origins = new Map(agents.map((a) => [`${a.member}/${a.label}`, a.origin ?? ""]));
  const originOf = (member: string, label: string | null) => (label && origins.get(`${member}/${label}`)) || agent.origin || null;
  const ACT_ICON: Record<string, string> = { cmd: "$", edit: "✎", read: "·", tool: "⚙", text: "●", prompt: "›", loop: "↻", job: "" };
  // Paths your own agent mentions link to the file on its machine (localfiles.ts).
  const files = agent.member === me ? `${agent.member}/${agent.label}` : null;
  const actRow = (a: Activity) =>
    `<div class="act act-${a.kind}" data-mid="a${a.id}"><span class="aic">${ACT_ICON[a.kind] ?? "·"}</span><span class="atx${a.kind === "text" ? " md" : ""}">${
      a.kind === "text"
        ? md(a.text, agent.origin, files)
        : a.kind === "prompt"
          ? `<span class="muted">typed in the terminal:</span> ${esc(plainSpaces(a.text))}`
          : a.kind === "cmd" && a.text.includes("\n")
            ? // "what it's doing" (the agent's description), then the command, dimmer
              `<span class="adesc">${esc(plainSpaces(a.text.split("\n")[0]!))}</span><span class="acmd">${esc(plainSpaces(a.text.split("\n").slice(1).join(" ")))}</span>`
            : esc(plainSpaces(a.text))
    }</span><span class="when">${time(a.at)}</span></div>`;
  type Item = { at: number; html: string; act?: Activity; you?: boolean; reply?: boolean };
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
        const named = (member: string, agentLabel: string | null, text: string) => (agentLabel ? agentName(member, agentLabel, text) : esc(text));
        return `<div class="bubble md relay" data-mid="${m.id}"><span class="rhd">${named(m.sender, m.sender_agent, from)} → ${named(m.recipient!, m.recipient_agent, to)}</span>${md(m.body, originOf(m.sender, m.sender_agent))}<span class="when">${time(m.created_at)}${mark}</span></div>`;
      }
      const speak = fromMe ? "" : `<button type="button" class="speak" data-speak title="Read aloud">${icon("volume", 13)}</button>`;
      // Not taken by an agent yet: you can still edit or cancel it (lib.ts unsend). Held means you're editing it.
      const st = marks.get(m.id)?.state;
      const open = fromMe && (st === "waiting" || st === "offline" || st === "held");
      const ub = (op: string, label: string, title: string) => `<button type="button" data-unsend="${op}" title="${title}">${label}</button>`;
      const unsend = open
        ? `<span class="unsend">${st === "held" ? ub("send", "Send", "Send it as it is") : ""}${ub("edit", "Edit", "Edit it: no agent gets it until you send it again")}${ub("cancel", "Cancel", "Take it back: it won't be delivered")}</span>`
        : "";
      return `<div class="bubble md ${fromMe ? "mine" : ""}${st === "held" || st === "cancelled" ? ` ${st}` : ""}" data-mid="${m.id}"${open ? ` data-raw="${esc(m.body)}"` : ""} data-who="${esc(agent.label)}" style="--h:${agentHue(agent.member, agent.label)}">${md(m.body, fromMe ? agent.origin : originOf(m.sender, m.sender_agent), m.sender === me && m.sender_agent === agent.label ? files : null)}<span class="when">${time(m.created_at)}${mark}${speak}${unsend}</span></div>`;
    });
  rows.forEach((m, i) =>
    items.push({
      at: m.created_at,
      html: thread0[i]!,
      you: m.sender === me && !m.sender_agent && !!m.recipient,
      reply: m.sender === agent.member && m.sender_agent === agent.label && m.recipient === me,
    }),
  );
  // A dashboard message handed to the agent as a prompt (the mod's prompt.submit, codex queue) is also in its
  // transcript, so the mirror would show it twice. The "you" bubble already has it: skip the mirrored copy.
  const flat = (t: string) => plainSpaces(t).replace(/^The intercom-ui plugin sent a message:\s*/i, "").replace(/…$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  const sentByYou = rows.filter((m) => m.sender === me && !m.sender_agent && m.recipient).map((m) => flat(m.body).slice(0, 80)).filter((b) => b.length >= 8);
  const echo = (a: Activity) => {
    if (a.kind !== "prompt") return false;
    if (a.text.includes("(Sent by you from the intercom dashboard.")) return true; // the mod's wrapper, however short the message
    const t = flat(a.text);
    return t.length >= 8 && sentByYou.some((b) => t.includes(b.slice(0, Math.min(b.length, t.length))));
  };
  // The agent's final message of a turn that answered you becomes its reply (replyFromTurn): the reply bubble has it,
  // so the mirrored copy of that text stays out too.
  const replies = rows.filter((m) => m.sender === agent.member && m.sender_agent === agent.label && m.recipient === me).map((m) => flat(m.body).slice(0, 120));
  const said = (a: Activity) => a.kind === "text" && replies.includes(flat(a.text).slice(0, 120));
  for (const a of [...acts].reverse()) if (!echo(a) && !said(a)) items.push({ at: a.at, html: actRow(a), act: a }); // oldest first; sort is stable
  // Side questions (/btw) to your own agent: shown apart, never part of its context.
  if (agent.member === me) {
    for (const b of await btwFor(env, me, agent.session_id)) {
      // Unanswered: the mod went quiet (or never ran there), or it's simply been too long.
      const late = b.status === "pending" && (Date.now() - b.created_at > BTW_TIMEOUT || (Date.now() - b.created_at > 30_000 && !modAnswers(agent)));
      const answer =
        b.status === "answered"
          ? `<div class="btwa md">${md(b.answer, agent.origin)}</div>`
          : b.status === "failed" || late
            ? `<div class="btwa muted">no answer: ${esc(late ? "nothing picked it up; is the intercom-ui mod running in that session (and on 0.2.4 or newer)?" : b.reason === "nothing-to-fork" ? "it hasn't finished a turn yet, so there's no context to ask" : b.reason)}</div>`
            : `<div class="btwa muted">asking… (a side look at its context)</div>`;
      items.push({ at: b.created_at, html: `<div class="btw" data-mid="b${b.id}"><div class="btwq"><span class="btwtag">btw</span>${esc(b.question)}</div>${answer}</div>` });
    }
  }
  // Like Claude Code, consecutive tool steps (commands, reads, edits, tool calls) fold into one line; the agent's
  // text, your messages and typed prompts stay out. A working agent's latest run stays open to watch it live.
  // Once it has answered you here, what it goes on to write in its terminal that turn (a closing line about the
  // reply) folds in with the steps: the reply already said it.
  const STEP = new Set(["cmd", "edit", "read", "tool"]);
  const sorted = items.sort((x, y) => x.at - y.at);
  const out: string[] = [];
  let run: Activity[] = [];
  const working = isOn(agent) && agent.state === "working";
  const flush = (tail: boolean) => {
    if (run.length === 1 && run[0]!.kind !== "text") out.push(actRow(run[0]!));
    else if (run.length) out.push(foldSteps(run, tail && working, actRow));
    run = [];
  };
  let answered = false;
  for (const it of sorted) {
    if (it.you || it.act?.kind === "prompt") answered = false;
    if (it.act && (STEP.has(it.act.kind) || (answered && it.act.kind === "text"))) run.push(it.act);
    else {
      flush(false);
      out.push(it.html);
    }
    if (it.reply) answered = true;
  }
  flush(true);
  const thread = out.join("");
  const on = isOn(agent);
  const ownAgent = agent.member === me;
  const canBtw = ownAgent && agent.client !== "codex";
  // Compact from the dashboard: the session's intercom-ui mod runs it when its turn ends (Claude Code only).
  const [ma = 0, mb = 0, mc = 0] = (agent.ui_version || "0").split(".").map(Number);
  const canCompact = canBtw && isOn(agent) && modAnswers(agent) && ma * 1e6 + mb * 1e3 + mc >= 2008; // intercom-ui 0.2.8
  const here = `/dashboard?view=agents&agent=${encodeURIComponent(key(agent))}`;
  const compactCtl = !canCompact
    ? ""
    : agent.compact_req
      ? `<form method="post" action="/agent/compact" class="compacting" data-native>${hidden({ session: agent.session_id, back: here, cancel: "1" })}<span class="badge amber" title="Its intercom-ui mod compacts it when the current turn ends">compacting when idle…</span><button class="btn ghost xs">Call off</button></form>`
      : `<button type="button" class="btn ghost xs compactbtn" data-open="dlg-compact" title="Compact its context (like /compact)">Compact</button>`;
  const btwOff = canBtw && !modAnswers(agent) ? NO_MOD(agent.label, hostOf(agent)) : "";
  const back = `/dashboard?view=agents&agent=${encodeURIComponent(key(agent))}`;
  const chat = `<section class="card chat">
      <div class="hd">
        <button type="button" class="btn ghost icon sm mtree" data-treetoggle title="Agents">${icon("sidebar", 17)}</button>
        <a class="btn ghost icon sm trailback" data-trailback hidden title="Back">${icon("back", 17)}</a>
        <span class="presence ${on ? "on" : ""}">${agentAvatar(agent.member, agent.label, "m")}</span>
        <div class="grow" style="min-width:0">
          <h2 style="display:flex;gap:8px;align-items:center"><span class="grow" style="display:flex;gap:8px;align-items:center"><span class="aname">${esc(key(agent))}</span>${ownAgent ? `<button type="button" class="btn ghost xs icon renamebtn" data-open="dlg-rename" title="Rename this agent">${icon("pencil", 12)}</button>` : ""}${clientBadge(agent.client, true)}</span>
            <span class="fsz" title="Text size in the chat"><button type="button" class="btn ghost xs icon" data-fs="-1" title="Smaller text">A</button><button type="button" class="btn ghost xs icon" data-fs="1" title="Larger text">A</button></span>
            <button type="button" class="btn ghost xs icon ttog" data-relaytoggle title="Messages between agents: click to show or hide">${icon("messages", 14)}</button>${ownAgent ? `<button type="button" class="btn ghost xs icon ttog" data-acttoggle title="Follow what the agent is doing (commands, edits, its text; only you see this): click to turn on or off"><span class="when-on">${icon("eye", 14)}</span><span class="when-off">${icon("eyeOff", 14)}</span></button>` : ""}</h2>
          <div class="meta-row">${stateBadge(agent)}${ctxBadge(agent)}${compactCtl}<span>${agent.host ? `on <b style="color:var(--ink-2)">${esc(hostOf(agent))}</b>${ownAgent ? `<button type="button" class="btn ghost xs icon renamebtn" data-open="dlg-host" title="Rename this machine">${icon("pencil", 11)}</button>` : ""} · ` : ""}${agent.project ? `#${esc(agent.project)}` : "no project"}${ownAgent && agent.project_pin ? ` <span class="badge" title="Set from the dashboard for this session; its repo would put it in ${esc(agent.repo ? `whatever ${agent.repo} maps to` : "no project")}">pinned</span>` : ""}${ownAgent ? `<button type="button" class="btn ghost xs icon renamebtn" data-open="dlg-project" title="Choose its project">${icon("pencil", 11)}</button>` : ""}${agent.branch ? ` · ${icon("branch", 12)} ${esc(agent.branch)}` : ""}${ownAgent && agent.cwd ? `<span class="cwd" title="Working directory"> · ${icon("folder", 12)} ${esc(agent.cwd)}</span>` : ""}${on ? "" : ` · last seen ${ago(agent.last_seen)}`}${agent.note ? ` · “${esc(plainSpaces(agent.note))}”` : ""}</span></div>${loopsOf(agent).map((l) => `<div class="meta-row looprow"><span>🔁 ${esc(describe(l))}</span></div>`).join("")}${jobsOf(agent).map((j) => `<div class="meta-row jobrow" title="${esc(j.command)}"><span>⧗ ${esc(jobName(j))} <span class="muted">· running ${duration(Date.now() - j.at)}</span></span></div>`).join("")}
        </div>
      </div>
      ${on && agent.state === "waiting" ? `<div class="toast err" style="box-shadow:none;margin:10px 14px 0">${icon("x")}<span><b>${esc(agent.label)} is waiting:</b> ${esc(agent.state_detail || "for approval or input")}. That can only be answered in its terminal (or with Claude's Remote Control); for unattended runs, start agents in a mode that doesn't stop to ask.</span></div>` : ""}
      <div class="thread term${/(?:^|;\s*)ic_activity=off/.test(cookie) ? " noact" : ""}${/(?:^|;\s*)ic_relay=off/.test(cookie) ? " norelay" : ""}" id="thread" data-region>${thread || `<div class="empty" style="margin:auto">${icon("message", 28)}<div>No messages with ${esc(agent.label)} yet.</div><div class="small">${ownAgent ? "Ask a question or give it a new direction; it treats what you write here like a prompt you typed." : "Your message reaches this session; its owner's agent treats it as information from you."}</div></div>`}</div>
      <form method="post" action="/action/post" class="chatbox" id="chatform" data-region data-quiet data-images data-agent="${esc(key(agent))}" data-label="${esc(agent.label)}">${hidden({ back, to: key(agent), channel: agent.project || "", session: agent.session_id, mode: "", thread: "", edit: "" })}
        <div class="imgtray" hidden></div>
        <div class="row" style="align-items:flex-end;flex-wrap:nowrap">
          <button type="button" class="btn ghost icon" style="height:48px" data-imgbtn title="Attach images (or paste / drop them here)">${icon("image", 16)}</button><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden data-imgpick>
          <textarea id="chat-input" name="message" data-chat required maxlength="4000" class="grow" rows="2" enterkeyhint="send" placeholder="Message ${esc(agent.label)}"></textarea>
          ${canBtw ? (btwOff ? `<button type="button" class="btn ghost btwbtn" style="height:48px" disabled title="${esc(btwOff)}">btw</button>` : `<button type="button" class="btn ghost btwbtn" style="height:48px" data-btwtoggle title="Ask on the side (like /btw): answered from its current context, without adding anything to it">btw</button>`) : ""}
          <button class="btn primary" style="height:48px" title="${on ? (ownAgent ? "It picks this up right away if it's idle, or after its current step." : "It sees this on its next step.") : "Not connected: the next session with this name gets it."}">${icon("send", 15)}<span class="lbl">Send</span></button>
        </div>
        <div class="editbar tiny" hidden>${icon("pencil", 12)}<span>Editing your message: no agent gets it until you send it.</span><a href="#" data-editsend>Send it unchanged</a> · <a href="#" data-editcancel>Cancel it</a></div>
        <div class="btwbar tiny muted" hidden>Side question for ${esc(agent.label)}: answered from its current context, not added to it. Follow-ups continue the thread · <a href="#" data-btwnew>start a new side thread</a></div>
        <div class="chips">${[...QUICK, ...(loopsOf(agent).length ? LOOP_CHIPS : [])].map((q) => `<button type="button" class="chip" data-chip="${esc(q)}">${esc(q)}</button>`).join("")}${on ? "" : '<span class="tiny muted" style="align-self:center">· not connected: the next session with this name gets it</span>'}</div>
      </form>
    </section>`;
  const dialogs = ownAgent
    ? `${canCompact ? `<dialog id="dlg-compact"><div class="hd">${icon("layers", 18)}<h2>Compact ${esc(agent.label)}</h2></div>
        <form method="post" action="/agent/compact" data-native>${hidden({ session: agent.session_id, back: here })}<div class="bd stack">
          <p class="small muted" style="margin:0">Like /compact: the conversation so far becomes a summary, freeing its context${agent.ctx_pct != null ? ` (now ${agent.ctx_pct}% full)` : ""}. It runs when the current turn ends.</p>
          <label class="field">What the summary should keep (optional)<textarea name="instructions" rows="3" maxlength="500" placeholder="e.g. the deploy plan and the open review comments"></textarea></label>
        </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${icon("layers", 14)}Compact</button></div></form></dialog>` : ""}
      <dialog id="dlg-rename"><div class="hd">${icon("pencil", 18)}<h2>Rename ${esc(agent.label)}</h2></div>
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
  return { tree, main: `${updateBar}${approvals}${dialogs}<div class="agents" id="agents">${chat.replace('<div class="hd">', '<div class="hd" id="chathd" data-region>')}</div>` };
}
