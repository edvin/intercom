// The Agents view: every agent session you can reach (yours first), and a chat with the one you pick.
// What you write there reaches that session as YOUR USER (your own agents act on it like a typed prompt);
// what it answers comes back here. Its project posts show in the thread as activity.

import { stuckSessions } from "./stuck";
import { screenAttrs } from "./screen";
import { awayState, pendingApprovals } from "./approvals";
import { pendingReviews } from "./reviews";
import { pendingTickets } from "./tickets";
import { chatAsks } from "./asks";
import { AUTO_UPDATE_SINCE, PLUGIN_VERSION, outdated } from "./version";
import { activeLoops, describe, parseLoops } from "./loops";
import { activeJobs, duration, jobName, parseJobs } from "./jobs";
import { STEPS_KEEP, type Sub, parseSubMessage, parseSubs, subSteps } from "./subagents";
import { commandStep, fileStep } from "./steps";
import { getNote } from "./notes";
import { NEW_AGENT_SINCE } from "./terminals";
import { newer } from "./upkeep";
import { subMark, subMarkOf, subsRegion, subWhen } from "./subview";
import { trackedNeedsYou } from "./tracked";
import { BTW_TIMEOUT, NO_MOD, btwFor, compactable, modAnswers } from "./btw";
import { type Activity, type Env, type Message, DELEGATE_PER_HOUR, LIVE, address, ago, deliveryMarks, short, hostNames, myProjects } from "./lib";
import { LOGO, agentAvatar, agentHue, agentLink, agentName, avatar, deliveryMark, esc, hidden, icon, md, plainSpaces, time } from "./ui";

interface Agent {
  member: string;
  session_id: string;
  label: string;
  project: string;
  project_pin?: string;
  loops?: string;
  jobs?: string;
  subagents?: string | null;
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
  compact_prep?: string | null;
  screen?: string;
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
    `SELECT member, session_id, label, project, project_pin, repo, loops, jobs, subagents, origin, branch, note, client, host, version, last_seen, state, state_detail, state_at, active_at, cwd, ui_at, ui_version, ctx_pct, ctx_tokens, ctx_window, ctx_at, compact_req, compact_prep, screen FROM sessions
     WHERE member IN (${ph(everyone.length)}) AND (member = ? OR project IN (${ph(mine.length)})) AND last_seen > ?
     ORDER BY member = ? DESC, last_seen DESC`,
  )
    .bind(...everyone, me, ...mine, Date.now() - 24 * 3600_000, me)
    .all<Agent>();
  // What a teammate's agent is waiting on can be the very command it wants approved (a password in it, say): they see
  // only that it waits.
  for (const a of agents) if (a.member !== me) a.state_detail = "";
  // The latest message each agent sent you (the last week): the tree marks agents with one you haven't opened (the
  // browser remembers what you've seen).
  const { results: lastRows } = await env.DB.prepare(
    "SELECT sender || '/' || sender_agent AS k, MAX(id) AS id FROM messages WHERE recipient = ? AND sender_agent IS NOT NULL AND kind != 'event' AND created_at > ? GROUP BY sender, sender_agent",
  )
    .bind(me, Date.now() - 7 * 86400_000)
    .all<{ k: string; id: number }>();
  const lastTo = new Map(lastRows.map((r) => [r.k, r.id]));
  const connected = env.live?.() ?? new Set<string>();
  const nick = await hostNames(env, me);
  const hostOf = (a: Agent) => (a.member === me ? nick.get(a.host) ?? a.host : a.host);
  const isOn = (a: Agent) => connected.has(`${a.member}/${a.session_id}`) || Date.now() - a.last_seen < 10 * 60_000;
  // Loops (/loop, scheduled prompts) of your own connected agents, as their transcripts show them.
  const loopsOf = (a: Agent) => (a.member === me && isOn(a) ? activeLoops(parseLoops(a.loops)) : []);
  // Background jobs (shell commands running in the background) of your own connected agents.
  const jobsOf = (a: Agent) => (a.member === me && isOn(a) ? activeJobs(parseJobs(a.jobs)) : []);
  const key = (a: Agent) => `${a.member}/${a.label}`;
  // Reviews your agents sent you (reviews.ts): their rows and chat headers say so, besides the dock.
  // Tickets too (tickets.ts).
  const reviews = await pendingReviews(env, me);
  const tickets = await pendingTickets(env, me);
  const reviewsOf = (a: Agent) => (a.member === me ? reviews.filter((r) => r.label === a.label).length + tickets.filter((t) => t.label === a.label).length : 0);
  const reviewBadge = (a: Agent) => {
    if (a.member !== me) return "";
    const r = reviews.filter((x) => x.label === a.label).length, t = tickets.filter((x) => x.label === a.label).length;
    const what = [r ? (r === 1 ? "review" : `${r} reviews`) : "", t ? (t === 1 ? "ticket" : `${t} tickets`) : ""].filter(Boolean).join(" and ");
    return what ? `<button type="button" class="badge amber rvbadge" data-asksopen title="Open it in Waiting for you">${icon("eye", 11)}${what} waiting for you</button>` : "";
  };
  /** Working / idle / needs you, from the session's own hooks; "gone" once it isn't connected. */
  const stateBadge = (a: Agent) => {
    if (!isOn(a)) return "";
    if (a.state === "waiting") return `<span class="badge red" title="${esc(a.state_detail)}">⚠ ${esc(a.state_detail || "needs you")}</span>`;
    if (a.state === "working") return `<span class="badge accent">⚙ working</span>`;
    if (a.state === "idle") return `<span class="badge green">idle</span>`;
    return "";
  };
  // The agent in the address, and only that one: a live redraw fetches the same address, so falling back to another
  // agent here made the page jump between agents. One not seen for a day is looked up on its own; one that's gone
  // says so. Without ?agent= the first connected agent of yours is shown (the page then pins it in the address).
  const picked = url.searchParams.get("agent");
  let agent = picked ? agents.find((a) => key(a) === picked) : (agents.find((a) => a.member === me && isOn(a)) ?? agents.find(isOn) ?? agents[0]);
  if (picked && !agent) {
    const [pm = "", pl = ""] = picked.split("/");
    agent =
      (await env.DB.prepare(
        `SELECT member, session_id, label, project, project_pin, repo, loops, jobs, subagents, origin, branch, note, client, host, version, last_seen, state, state_detail, state_at, active_at, cwd, ui_at, ui_version, ctx_pct, ctx_tokens, ctx_window, ctx_at, compact_req, compact_prep, screen FROM sessions
         WHERE member = ? AND label = ? AND (member = ? OR project IN (${ph(mine.length)})) ORDER BY last_seen DESC LIMIT 1`,
      )
        .bind(pm, pl, me, ...mine)
        .first<Agent>()) ?? undefined;
    if (agent && agent.member !== me) agent.state_detail = "";
  }


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
    [key(a), a.client === "codex" ? "Codex" : "", loopsOf(a).length ? "running a loop" : "", jobsOf(a).length ? "background jobs" : "", a.member === me && isOn(a) && outdated(a.version) ? "update available" : "", !isOn(a) ? `last seen ${ago(a.last_seen)}` : a.state === "waiting" ? `needs you: ${a.state_detail || "waiting"}` : a.state || "connected", a.host ? `on ${hostOf(a)}` : "", a.branch ? `⎇ ${a.branch}` : "", a.member === me ? a.cwd : "", a.note]
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
  // One thing per row, the one that matters most: it asks for you, its subagents at work, a context nearly full, or
  // (quietly) when it last did something. Loops, jobs, its version and client are in its tooltip and inspector.
  const rowTag = (a: Agent) =>
    (isOn(a) && a.state === "waiting") || reviewsOf(a)
      ? `<span class="tw" title="${reviewsOf(a) ? "a review is waiting for you" : "needs you"}">asks</span>`
      : (a.member === me && isOn(a) && subMark(parseSubs(a.subagents))) ||
        (isOn(a) && ctxLevel(a) ? `<span class="tctx ${ctxLevel(a)}" title="Context ${a.ctx_pct}% full">${a.ctx_pct}%</span>` : "") ||
        since(a);
  const tRow = (a: Agent) => `<a class="ta${sel(a) ? " on" : ""}${isOn(a) ? "" : " gone"}" data-k="${esc(key(a))}"${lastTo.has(key(a)) ? ` data-last="${lastTo.get(key(a))}"` : ""}${isOn(a) && a.state === "waiting" ? " data-w" : ""} href="/dashboard?view=agents&agent=${encodeURIComponent(key(a))}" title="${esc(tip(a))}">
      <span class="tdot ${dot(a)}"></span><span class="tn">${agentName(a.member, a.label, a.member === me ? a.label : `${a.member}/${a.label}`)}</span>
      <span class="tb">${rowTag(a)}</span></a>`;
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
      return branch(p, esc(p), `/dashboard?channel=${encodeURIComponent(p)}`, agents.filter((a) => a.project === p), badges, nav.view === "feed" && nav.channel === p);
    })
    .join("");
  const loose = agents.filter((a) => a.member === me && (!a.project || !nav.mine.includes(a.project)));
  const { away, waitMin } = await awayState(env, me);
  const pending = [...(await pendingApprovals(env, me)), ...reviews, ...tickets];
  const waitingN = pending.length + (await stuckSessions(env, me)).length;
  const stale = agents.filter((a) => a.member === me && isOn(a) && outdated(a.version));
  const trackedN = await trackedNeedsYou(env, me);
  // Starting a new agent (terminals.ts): on a machine where one of your agents runs in tmux with a new enough intercom.
  const ableHosts = [...new Set(agents.filter((a) => a.member === me && isOn(a) && a.screen === "keys" && a.host && a.version && !newer(NEW_AGENT_SINCE, a.version)).map((a) => a.host))];
  const folders = [...new Set(agents.filter((a) => a.member === me && a.cwd).map((a) => a.cwd))].slice(0, 30);
  const newAgentDialog = `<dialog id="dlg-newagent"><div class="hd">${icon("plus", 18)}<h2>New agent</h2></div>
    ${ableHosts.length
      ? `<form method="post" action="/agents/new" data-native><div class="bd stack">
        <div class="row" style="flex-wrap:nowrap"><label class="field grow">Name<input name="name" required pattern="[A-Za-z][A-Za-z0-9\-]{0,23}" placeholder="e.g. birch" autocomplete="off"></label>
          <label class="field">Kind<select name="run"><option value="claude">Claude Code</option><option value="codex">Codex</option></select></label></div>
        <div class="row" style="flex-wrap:nowrap"><label class="field">Machine<select name="host">${ableHosts.map((h) => `<option value="${esc(h)}">${esc(nick.get(h) ?? h)}</option>`).join("")}</select></label>
          <label class="field grow">Folder<input name="cwd" required list="dl-folders" value="${esc(folders[0] ?? "~")}" style="font-family:'Geist Mono',ui-monospace,monospace;font-size:13px"></label></div>
        <datalist id="dl-folders">${folders.map((f) => `<option value="${esc(f)}">`).join("")}</datalist>
        <label class="field">First message <span class="tiny">(optional: what it should do)</span><textarea name="prompt" rows="4" maxlength="4000" placeholder="e.g. Pick up the retry work from core's notes and get it to staging."></textarea></label>
        <p class="tiny muted" style="margin:0">It starts in a tmux terminal of that name on the machine, takes the name on the intercom (and any notes left for it), and shows up here in a few seconds.</p>
      </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${icon("plus", 14)}Start it</button></div></form>`
      : `<div class="bd"><p class="small" style="margin:0">Agents are started through one of yours that runs in tmux on that machine, with intercom ${NEW_AGENT_SINCE} or newer (run <code>/intercom:update</code> there, then <code>/reload-plugins</code>). None qualifies right now.</p></div><div class="ft"><button type="button" class="btn" data-close>OK</button></div>`}
  </dialog>`;
  // The rail: every page as an icon (what needs you as a count on it), then search, away, docs and your account.
  // The tree beside it: projects with their agents, wide enough for their names.
  const rl = (on: boolean, href: string, ic: string, title: string, pill = "", extra = "") =>
    `<a class="rl${on ? " on" : ""}" href="${href}" title="${title}" aria-label="${title}"${extra}>${icon(ic, 18)}${pill}</a>`;
  const pill = (n: number, tone = "") => (n ? `<span class="rpill${tone ? ` ${tone}` : ""}">${n > 99 ? "99+" : n}</span>` : "");
  const rail = `<nav class="irail" id="irail" data-region aria-label="Pages">
    <a class="rlogo" href="/" title="About the intercom">${LOGO.replace(/"lg"/, '"lgr"').replace("url(#lg)", "url(#lgr)")}</a>
    ${rl(nav.view === "agents", "/dashboard?view=agents", "terminal", "Agents")}
    <button type="button" class="rl" id="railasks" data-asksopen title="Waiting for you" aria-label="Waiting for you"${waitingN ? "" : " hidden"}>${icon("bell", 18)}<span class="rpill amber">${waitingN}</span></button>
    ${rl(nav.view === "feed", "/dashboard", "layers", "Everything: your projects and messages", pill(nav.votesTotal))}
    ${rl(nav.view === "work", "/dashboard?view=work", "check", "Work")}
    ${rl(nav.view === "tracked", "/dashboard?view=tracked", "branch", "Tickets &amp; MRs", pill(trackedN, "amber"))}
    ${rl(nav.view === "files", "/dashboard?view=files", "image", "Files from agents")}
    ${rl(nav.view === "fleet", "/dashboard?view=fleet", "monitor", "Agents · versions", pill(stale.length, "amber"))}
    <span class="rsp"></span>
    <button type="button" class="rl${away ? " away" : ""}" data-open="dlg-away" title="${away ? `Away: what your agents ask is denied after ${waitMin} min unless you answer` : "At your desk: what your agents ask waits for your answer"}" aria-label="Away mode">${icon(away ? "door" : "clock", 18)}</button>
    ${rl(false, "/discover", "users", "Find projects to join")}
    <button type="button" class="rl" data-theme-btn="system" title="Appearance" aria-label="Appearance"><span class="th-i th-system">${icon("contrast", 18)}</span><span class="th-i th-light">${icon("sun", 18)}</span><span class="th-i th-dark">${icon("moon", 18)}</span></button>
    ${rl(false, "/docs", "book", "Docs")}
    ${nav.admin ? rl(nav.view === "admin", "/dashboard?view=admin", "shield", "Admin: members and sign-up") : ""}
    <a class="rl rme${nav.view === "account" ? " on" : ""}" href="/dashboard?view=account" title="${esc(me)}: account and notifications" aria-label="Account">${avatar(me, "s")}</a>
  </nav>`;
  const tree = `${rail}<aside class="tree" id="tree" data-region>
    <div class="thead"><b>Agents</b><span class="live" id="live" title="Updates arrive live while this is green"><span class="dot"></span>Connecting</span><span class="grow"></span><button type="button" class="btn ghost xs newag" data-open="dlg-newagent" title="Start a new agent on one of your machines">${icon("plus", 13)}Agent</button><button type="button" class="btn ghost xs icon" data-open="dlg-create" title="New project">${icon("hash", 13)}</button></div>
    <button type="button" class="tsearch" data-kopen>${icon("search", 13)}<span>Find agent or page</span><span class="kbd kbd-k">⌘K</span></button>
    <div class="tbody">${projectNodes || '<p class="tempty">No projects yet.</p>'}${loose.length ? branch("~none", "No project", null, loose, "", false) : ""}</div>
  </aside>
  ${newAgentDialog}
  <dialog id="dlg-away"><div class="hd"><span style="font-size:18px">${away ? "🌙" : "🖥"}</span><h2>${away ? "Away mode is on" : "Going away?"}</h2></div>
    <form method="post" action="/away" data-native><div class="bd stack">
      <p class="small muted" style="margin:0">${away ? `What your agents ask (permissions, questions, plans) and you don't answer within ${waitMin} min is denied, so they move on.` : "What your agents ask (permissions, questions, plans) shows here as well as in their terminal, and waits for you. In away mode, what you don't answer in time is denied, so agents keep moving."}</p>
      ${away ? "" : `<label class="field">Deny unanswered questions after<input name="wait" type="number" min="1" max="60" value="${waitMin}" style="width:90px"> minutes</label>`}
      <input type="hidden" name="away" value="${away ? "off" : "on"}">
    </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${away ? "I'm back" : "I'm leaving"}</button></div></form></dialog>`;

  // One line, until dismissed for this version (the next version shows it again).
  const dismissed = cookie.split(/;\s*/).includes(`ic_upd=${PLUGIN_VERSION}`);
  // Sessions on a version that downloads releases itself only need a restart; older ones need /intercom:update first.
  const selfUpdating = stale.every((a) => !outdated(a.version, AUTO_UPDATE_SINCE));
  const updateBar =
    stale.length && !dismissed
      ? `<div class="updatebar" id="updatebar" data-region title="${esc(`Outdated: ${stale.map((a) => a.label).join(", ")}. ${selfUpdating ? "The new version is downloaded on each machine by itself; restart them to load it." : "Run /intercom:update in one session per machine, then restart them to load it."}`)}">${icon("download", 14)}
        <span class="grow"><b>intercom ${PLUGIN_VERSION}</b> · ${stale.length} of your agents on an older version · <a href="/dashboard?view=fleet">See and update them</a></span>
        <button type="button" class="btn ghost xs icon" data-dismiss="ic_upd=${PLUGIN_VERSION}" title="Dismiss until the next version">${icon("x", 13)}</button></div>`
      : "";
  if (!nav.withChat) return { tree, main: "" };
  if (!agent && picked)
    return { tree, main: `${updateBar}<section class="card chat"><div class="empty" style="margin:auto">${icon("radio", 30)}<div>There's no agent ${esc(picked)} (any more).</div><div class="small">Pick one in the tree, or <a href="/dashboard?view=agents">show your agents</a>.</div></div></section>` };
  if (!agent) return { tree, main: `${updateBar}<section class="card chat"><div class="empty" style="margin:auto">${icon("radio", 30)}<div>No agents to talk to yet.</div><div class="small">Start Claude Code or Codex in a repo; its session shows up in the tree.</div></div></section>` };

  const { results: allRows } = await env.DB.prepare(
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
  const { results: allActs } =
    agent.member === me
      ? await env.DB.prepare(
          // Its latest steps, and its latest texts on their own (they'd fall out of a busy agent's step window).
          "SELECT * FROM (SELECT * FROM activity WHERE member = ?1 AND session_id = ?2 AND kind != 'text' ORDER BY id DESC LIMIT 200) UNION ALL SELECT * FROM (SELECT * FROM activity WHERE member = ?1 AND session_id = ?2 AND kind = 'text' ORDER BY id DESC LIMIT 60) ORDER BY id DESC",
        ).bind(me, agent.session_id).all<Activity>()
      : { results: [] as Activity[] };
  // The chat redraws on every few steps a busy agent takes, sent whole each time: it shows the latest stretch (from
  // where the first of its messages, steps or texts runs out), and everything kept with "Show earlier".
  const earlier = url.searchParams.has("earlier");
  const nth = (ats: number[], n: number) => (ats.length > n ? ats[n - 1]! : 0); // newest first
  // The conversation (messages and the agent's texts) from where the first of those runs out; its commands, reads and
  // edits only within that and their own window, so hundreds of them never push what it wrote out of view.
  const base = earlier ? 0 : Math.max(nth(allRows.map((m) => m.created_at), 50), nth(allActs.filter((a) => a.kind === "text").map((a) => a.at), 25));
  const stepCut = earlier ? 0 : Math.max(base, nth(allActs.filter((a) => a.kind !== "text").map((a) => a.at), 100));
  const rows = base ? allRows.filter((m) => m.created_at >= base) : allRows;
  const acts = allActs.filter((a) => a.at >= (a.kind === "text" ? base : stepCut));
  const cut = rows.length < allRows.length || acts.length < allActs.length;
  const marks = await deliveryMarks(env, me, rows);
  // Each writer's repo, so their !MR / #issue / commit refs link where they belong.
  const origins = new Map(agents.map((a) => [`${a.member}/${a.label}`, a.origin ?? ""]));
  // A commit one of your own agents mentions opens in that agent's code view (code.ts), when it's one of yours here.
  const codeOf = (member: string, label: string | null) => (member === me && label && origins.has(`${member}/${label}`) ? `${member}/${label}` : null);
  const originOf = (member: string, label: string | null) => (label && origins.get(`${member}/${label}`)) || agent.origin || null;
  const ACT_ICON: Record<string, string> = { cmd: "$", edit: "✎", read: "·", tool: "⚙", text: "●", prompt: "›", loop: "↻", job: "" };
  // Paths your own agent mentions link to the file on its machine (localfiles.ts).
  const files = agent.member === me ? `${agent.member}/${agent.label}` : null;
  // Commands, reads and edits as a person would say them (steps.ts); a command opens to the exact command line.
  const STEP_IC: Record<string, string> = { git: "branch", read: "file", search: "search", edit: "pencil", test: "check", run: "terminal", build: "layers", web: "link", cmd: "terminal" };
  const chip = (st: { cwd: string; where: string }) => (st.cwd ? `<span class="scwd" title="${esc(st.where)}">${esc(st.cwd)}</span>` : "");
  const actRow = (a: Activity) => {
    // A step that can't be put in words shows as it is: one odd command never takes the chat down.
    try {
      return stepRow(a);
    } catch {
      return `<div class="act act-${esc(a.kind)}" data-mid="a${a.id}"><span class="aic">·</span><span class="atx">${esc(plainSpaces(a.text))}</span><span class="when">${time(a.at)}</span></div>`;
    }
  };
  const stepRow = (a: Activity) => {
    if (a.kind === "cmd") {
      const st = commandStep(plainSpaces(a.text));
      return `<details class="act act-cmd step s-${st.kind}" data-mid="a${a.id}"><summary><span class="aic">${icon(STEP_IC[st.kind] ?? "terminal", 13)}</span><span class="atx">${st.title}${chip(st)}</span><span class="when">${time(a.at)}</span></summary><div class="stepcmd"><pre>${esc(st.command)}</pre><button type="button" class="mdcopy" data-copystep title="Copy the command">Copy</button></div></details>`;
    }
    if (a.kind === "read" || a.kind === "edit") {
      const st = fileStep(a.kind, plainSpaces(a.text));
      // An image it looked at (a screenshot, a render): a preview, fetched from its machine the first time it's opened.
      const img = files && a.kind === "read" && /\.(png|jpe?g|webp|gif)$/i.test(st.where) ? `<a class="att stepimg" href="/agent-file?agent=${encodeURIComponent(files)}&amp;path=${encodeURIComponent(st.where)}" data-lp="${esc(`${files}|${st.where}`)}" data-name="${esc(st.where.split(/[\\/]/).pop() ?? "")}" title="Show it">${icon("image", 13)}<span>Show</span></a>` : "";
      return `<div class="act act-${a.kind} step s-${st.kind}" data-mid="a${a.id}" title="${esc(st.where)}"><span class="aic">${icon(STEP_IC[st.kind] ?? "file", 13)}</span><span class="atx">${st.title}${chip(st)}</span><span class="when">${img}${time(a.at)}</span></div>`;
    }
    if (a.kind === "loop") {
      // "started a self-paced loop: /loop Keep going on …": what kind of loop as the line, its prompt beneath (it opens).
      const m = plainSpaces(a.text).match(/^(started|stopped)\s+(?:its\s+)?([^:]+?)(?::\s*([\s\S]*))?$/);
      if (m) {
        const what = m[2]!.replace(/^an?\s+/, "").replace(/^self-paced loop/, "self-paced loop");
        const prompt = (m[3] ?? "").replace(/^\/loop\s+/, "").trim();
        const head = `<span class="aic">${icon("repeat", 13)}</span><span class="atx"><b>${m[1] === "started" ? "Started" : "Stopped"} ${esc(what)}</b>${prompt ? `<span class="lpq">${esc(prompt)}</span>` : ""}</span><span class="when">${time(a.at)}</span>`;
        return prompt
          ? `<details class="act act-loop step s-loop${m[1] === "stopped" ? " off" : ""}" data-mid="a${a.id}"><summary>${head}</summary><div class="stepcmd"><pre>${esc(prompt)}</pre></div></details>`
          : `<div class="act act-loop step s-loop${m[1] === "stopped" ? " off" : ""}" data-mid="a${a.id}">${head}</div>`;
      }
    }
    // A long text it wrote in its terminal reads as a message of its own (marked where it was written).
    if (a.kind === "text" && a.text.length >= 280)
      return `<div class="bubble md termtext" data-mid="a${a.id}" data-who="${esc(agent.label)}" style="--h:${agentHue(agent.member, agent.label)}">${md(a.text, agent.origin, files)}<span class="when">${time(a.at)} · in its terminal</span></div>`;
    return `<div class="act act-${a.kind}" data-mid="a${a.id}"><span class="aic">${ACT_ICON[a.kind] ?? "·"}</span><span class="atx${a.kind === "text" ? " md" : ""}">${
      a.kind === "text" ? md(a.text, agent.origin, files) : a.kind === "prompt" ? `<span class="muted">typed in the terminal:</span> ${esc(plainSpaces(a.text))}` : esc(plainSpaces(a.text))
    }</span><span class="when">${time(a.at)}</span></div>`;
  };
  type Item = { at: number; html: string; act?: Activity; you?: boolean; reply?: boolean; pair?: string };
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
        const named = (member: string, agentLabel: string | null, text: string) => (agentLabel ? agentLink(member, agentLabel, text) : esc(text));
        // A card of its own: who wrote to whom (avatars, an arrow), what kind, the text; it sits to the right when the
        // agent you're looking at wrote it, to the left when it came to that agent, in the middle when neither.
        const dir = m.sender === agent.member && m.sender_agent === agent.label ? "out" : m.recipient === agent.member && m.recipient_agent === agent.label ? "in" : "side";
        const face = (member: string, agentLabel: string | null) => (agentLabel ? agentAvatar(member, agentLabel, "s") : avatar(member, "s"));
        const pair = [from, to].sort().join(" ⇄ ");
        return `<div class="bubble md relay r-${dir}" data-mid="${m.id}" data-pair="${esc(pair)}"><div class="rcard"><span class="rhd">${face(m.sender, m.sender_agent)}${named(m.sender, m.sender_agent, from)}<span class="rarrow">→</span>${face(m.recipient!, m.recipient_agent)}${named(m.recipient!, m.recipient_agent, to)}${m.delegated ? ' <span class="badge accent" title="Handed as work: the receiving agent takes work from your other agents">work</span>' : ""}</span><div class="rbody">${md(m.body, originOf(m.sender, m.sender_agent), null, codeOf(m.sender, m.sender_agent))}</div><span class="when">${time(m.created_at)}${mark}</span></div></div>`;
      }
      const speak = fromMe ? "" : `<button type="button" class="speak" data-speak title="Read aloud">${icon("volume", 13)}</button>`;
      // Not taken by an agent yet: you can still edit or cancel it (lib.ts unsend). Held means you're editing it.
      const st = marks.get(m.id)?.state;
      const open = fromMe && (st === "waiting" || st === "offline" || st === "held");
      const ub = (op: string, label: string, title: string) => `<button type="button" data-unsend="${op}" title="${title}">${label}</button>`;
      const unsend = open
        ? `<span class="unsend">${st === "held" ? ub("send", "Send", "Send it as it is") : ""}${st === "waiting" && agent.screen === "keys" && agent.member === me ? ub("now", "Barge in", "Send it now: typed into its terminal and read at its next step, not after its turn") : ""}${ub("edit", "Edit", "Edit it: no agent gets it until you send it again")}${ub("cancel", "Cancel", "Take it back: it won't be delivered")}</span>`
        : "";
      return `<div class="bubble md ${fromMe ? "mine" : ""}${st === "held" || st === "cancelled" ? ` ${st}` : ""}" data-mid="${m.id}"${open ? ` data-raw="${esc(m.body)}"` : ""} data-who="${esc(agent.label)}" style="--h:${agentHue(agent.member, agent.label)}">${(() => {
        const sm = fromMe ? parseSubMessage(m.body) : null;
        return sm ? `<a class="subto" href="/dashboard?view=agents&amp;agent=${encodeURIComponent(key(agent))}&amp;sub=${encodeURIComponent(sm.id)}" title="Sent to its subagent, through ${esc(agent.label)}">${icon("users", 11)}to ${esc(sm.desc || "its subagent")}</a>${md(sm.text, agent.origin)}` : "";
      })() || md(m.body, fromMe ? agent.origin : originOf(m.sender, m.sender_agent), m.sender === me && m.sender_agent === agent.label ? files : null, fromMe ? null : codeOf(m.sender, m.sender_agent))}<span class="when">${m.via ? `<span class="via">via ${esc(m.via)}</span>` : ""}${time(m.created_at)}${mark}${speak}${unsend}</span></div>`;
    });
  rows.forEach((m, i) =>
    items.push({
      at: m.created_at,
      html: thread0[i]!,
      you: m.sender === me && !m.sender_agent && !!m.recipient,
      reply: m.sender === agent.member && m.sender_agent === agent.label && m.recipient === me,
      pair: m.recipient && !(m.sender === me && !m.sender_agent) && !(m.sender === agent.member && m.sender_agent === agent.label && m.recipient === me && (!m.recipient_agent || agent.member !== me)) ? [address(m.sender, m.sender_agent), address(m.recipient, m.recipient_agent)].sort().join(" ⇄ ") : undefined,
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
          ? `<div class="btwa md">${md(b.answer, agent.origin, null, files)}</div>`
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
  // Three or more messages in a row between the same two agents fold into one line ("core ⇄ render · 4 messages").
  let rel: Item[] = [];
  const flushRel = () => {
    if (rel.length >= 3) {
      const first = rel[0]!, last = rel[rel.length - 1]!;
      const [a, b] = first.pair!.split(" ⇄ ");
      out.push(`<details class="relaygroup" id="rg-${/data-mid="(\d+)"/.exec(first.html)?.[1] ?? first.at}" data-gid="rg${first.at}"><summary><span class="rgic">${icon("messages", 13)}</span><span class="rgwho"><b>${esc(a!.split("/").pop()!)}</b> ⇄ <b>${esc(b!.split("/").pop()!)}</b></span><span class="rgn">${rel.length} messages</span><span class="when">${time(last.at)}</span></summary>${rel.map((r) => r.html).join("")}</details>`);
    } else out.push(...rel.map((r) => r.html));
    rel = [];
  };
  let answered = false;
  for (const it of sorted) {
    if (it.pair) {
      if (rel.length && rel[0]!.pair !== it.pair) flushRel();
      if (!rel.length) flush(false);
      rel.push(it);
      continue;
    }
    if (rel.length) flushRel();
    if (it.you || it.act?.kind === "prompt") answered = false;
    // A long text (an answer it wrote in its terminal) is never folded away, even after a reply.
    const long = it.act?.kind === "text" && it.act.text.length >= 280;
    if (it.act && (STEP.has(it.act.kind) || (answered && it.act.kind === "text" && !long))) run.push(it.act);
    else {
      flush(false);
      out.push(it.html);
    }
    if (it.reply) answered = true;
  }
  flushRel();
  flush(true);
  if (cut) out.unshift(`<div class="earlier" data-gid="earlier"><a class="btn ghost xs" href="/dashboard?view=agents&amp;agent=${encodeURIComponent(key(agent))}&amp;earlier=1">${icon("clock", 13)}Show earlier</a></div>`);
  const thread = out.join("");
  const on = isOn(agent);
  const ownAgent = agent.member === me;
  const canBtw = ownAgent && agent.client !== "codex";
  // Compact from the dashboard: the session's intercom-ui mod runs it when its turn ends (Claude Code only).
  const canCompact = ownAgent && !compactable(agent, isOn(agent));
  // Its terminal (a tmux pane), seen and typed into from here (screen.ts).
  const canScreen = ownAgent && isOn(agent) && !!agent.screen;
  const screenCtl = canScreen ? `<button type="button" class="btn ghost xs scrbtn" ${screenAttrs(key(agent), agent.label, agent.screen ?? "", agent.client ?? "")} title="See its terminal and send it keys">${icon("monitor", 12)}Screen</button>` : "";
  const here = `/dashboard?view=agents&agent=${encodeURIComponent(key(agent))}`;
  const compactCtl = !canCompact
    ? ""
    : agent.compact_req || agent.compact_prep
      ? `<form method="post" action="/agent/compact" class="compacting" data-native>${hidden({ session: agent.session_id, back: here, cancel: "1" })}<span class="badge amber" title="${agent.compact_prep ? "It was told to save its state; it's compacted when that turn ends" : "Its intercom-ui mod compacts it when the current turn ends"}">${agent.compact_prep ? "saving its state, then compacting…" : "compacting when idle…"}</span><button class="btn ghost xs">Call off</button></form>`
      : `<button type="button" class="btn ghost xs compactbtn" data-open="dlg-compact" title="Compact its context (like /compact)">Compact</button>`;
  // Whether it takes work your other agents hand it (lib.ts delegatedTo): a switch on your own agents.
  const takesWork = ownAgent && !(await env.DB.prepare("SELECT 1 FROM agent_prefs WHERE member = ? AND label = ? AND takes_work = 0").bind(me, agent.label).first());
  const takesCtl = ownAgent
    ? `<form method="post" action="/agent/takes-work" class="takeswork" data-native>${hidden({ label: agent.label, on: takesWork ? "0" : "1", back: here })}<button class="badge${takesWork ? " accent" : ""}" title="${
        takesWork
          ? `Your other agents can hand ${esc(agent.label)} work: their DMs and handoffs wake it when idle, and it acts on them like a request from you (at most ${DELEGATE_PER_HOUR} an hour). Click to turn off.`
          : `Your other agents' messages are information to ${esc(agent.label)}, as from anyone. Click to let them hand it work again: their DMs and handoffs then wake it when idle, and it acts on them like a request from you.`
      }">${icon("users", 11)}${takesWork ? "takes work from your agents" : "info only from your agents"}</button></form>`
    : "";
  const btwOff = canBtw && !modAnswers(agent) ? NO_MOD(agent.label, hostOf(agent)) : "";
  const back = `/dashboard?view=agents&agent=${encodeURIComponent(key(agent))}`;
  // Your own agent's code (code.ts): its changes, commits and files, read from its machine in place of the chat.
  const codeOn = ownAgent && url.searchParams.has("code");
  const codeSrc = `/agent-code?${new URLSearchParams([["agent", key(agent)], ...[...url.searchParams].filter(([k]) => ["code", "sha", "dir", "path", "rev", "q", "in", "wt"].includes(k))])}`;
  const codePane = `<div class="codepane loading" id="codepane" data-src="${esc(codeSrc)}"><div class="empty">${icon("code", 26)}<div>Reading ${esc(agent.label)}'s repo…</div></div></div>`;
  const seg = ownAgent
    ? `<nav class="seg" aria-label="Chat or code"><a href="${back}"${codeOn ? "" : ' class="on"'}>${icon("message", 13)}<span>Chat</span></a><a href="${back}&code=changes"${codeOn ? ' class="on"' : ""} title="Its uncommitted changes, commits and files, read from its machine">${icon("code", 13)}<span>Code</span></a></nav>`
    : "";
  // The header is one line: who it is, what it's doing, where; then Chat/Code, its subagents (a count), its screen
  // and files, the inspector and ⋯ for the rest. The inspector (right) holds its subagents and its session details;
  // it stays as you left it, and opens by itself when a subagent starts.
  const subs = codeOn || !ownAgent ? [] : parseSubs(agent.subagents);
  const runningN = subs.filter((x) => x.status === "running").length;
  // A subagent's own view (tabs over the chat): what it was asked, its steps folded like the agent's, what you sent
  // it through the agent, and its answer.
  const subSel = subs.find((x) => x.id === url.searchParams.get("sub")) ?? null;
  const subHref = (id: string) => `${back}&sub=${encodeURIComponent(id)}`;
  let subThread = "";
  if (subSel) {
    const steps = (await subSteps(env, me, agent.session_id, STEPS_KEEP, subSel.id)).get(subSel.id) ?? [];
    const asked = (mid: string, text: string, at: number) =>
      `<div class="bubble md subask" data-mid="${mid}"><div class="rhd">${agentAvatar(me, agent.label, "s")}<b>${esc(agent.label)}</b><span class="rarrow">→</span><span class="subav">${icon("users", 11)}</span><b>${esc(subSel.desc || "subagent")}</b></div>${md(text, agent.origin, null, files)}<span class="when">${time(at)}</span></div>`;
    const sItems: { at: number; html: string; act?: Activity }[] = [];
    if (subSel.prompt) sItems.push({ at: subSel.started, html: asked("sp0", subSel.prompt, subSel.started) });
    for (const st of steps) {
      const a: Activity = { id: st.rid ?? 0, session_id: agent.session_id, at: st.at, kind: st.kind, text: st.text };
      sItems.push(st.kind === "prompt" ? { at: st.at, html: asked(`sp${a.id}`, st.text, st.at) } : { at: st.at, html: actRow(a), act: a });
    }
    for (const m of rows) {
      const sm = m.sender === me && !m.sender_agent ? parseSubMessage(m.body) : null;
      if (sm?.id === subSel.id)
        sItems.push({ at: m.created_at, html: `<div class="bubble md mine" data-mid="${m.id}">${md(sm.text, agent.origin)}<span class="when"><span class="via">through ${esc(agent.label)}</span>${time(m.created_at)}${deliveryMark(marks.get(m.id))}</span></div>` });
    }
    if (subSel.result) sItems.push({ at: subSel.updated + 1, html: `<div class="bubble md subans" data-mid="sr${subSel.updated}" style="--h:${agentHue(agent.member, agent.label)}"><div class="rhd"><span class="subav">${icon("users", 11)}</span><b>Its answer</b><span class="muted"> to ${esc(agent.label)}</span></div>${md(subSel.result, agent.origin, null, files)}<span class="when">${time(subSel.updated)}</span></div>` });
    sItems.sort((x, y) => x.at - y.at);
    const sOut: string[] = [];
    let sRun: Activity[] = [];
    const sFlush = (tail: boolean) => {
      if (sRun.length === 1) sOut.push(actRow(sRun[0]!));
      else if (sRun.length) sOut.push(foldSteps(sRun, tail && subSel.status === "running", actRow));
      sRun = [];
    };
    for (const it of sItems) {
      if (it.act && STEP.has(it.act.kind)) sRun.push(it.act);
      else {
        sFlush(false);
        sOut.push(it.html);
      }
    }
    sFlush(true);
    const tags = [subSel.type, subSel.bg ? "in the background" : "", subSel.depth > 1 ? "started by another subagent" : ""].filter(Boolean).map(esc).join(" · ");
    subThread = `<div class="subhead" data-mid="subhd-${esc(subSel.id)}">${subMarkOf(subSel)}<div class="grow"><b>${esc(subSel.desc || "a subagent")}</b><div class="small muted">${tags ? `${tags} · ` : ""}${esc(subWhen(subSel))} · ${subSel.steps} step${subSel.steps === 1 ? "" : "s"}${subSel.steps > steps.length ? ` (the last ${steps.length} shown)` : ""}</div></div><a class="btn ghost xs" href="${back}">${icon("back", 12)}${esc(agent.label)}</a></div>${sOut.join("")}${
      subSel.status === "running" ? `<div class="act subworking"><span class="subspin"></span><span class="atx muted">working…</span></div>` : ""
    }`;
  }
  const subTabs = subs.length
    ? `<nav class="subtabs" id="subtabs" data-region aria-label="The agent or one of its subagents"><a href="${back}"${subSel ? "" : ' class="on"'}>${agentAvatar(agent.member, agent.label, "s")}<span>${esc(agent.label)}</span></a>${[...subs]
        .sort((a, b) => a.started - b.started)
        .map((x: Sub) => `<a href="${subHref(x.id)}"${x === subSel ? ' class="on"' : ""} title="${esc(`${x.desc || "a subagent"}${x.type ? ` · ${x.type}` : ""} · ${subWhen(x)}`)}">${subMarkOf(x)}<span>${esc((x.desc || x.type || "subagent").slice(0, 34))}</span></a>`)
        .join("")}</nav>`
    : `<nav class="subtabs" id="subtabs" data-region hidden></nav>`;
  const inspOpen = /(?:^|;\s*)ic_insp=1/.test(cookie);
  const stateText = !on
    ? `<span class="cstate off">last seen ${ago(agent.last_seen)}</span>`
    : agent.state === "waiting"
      ? `<span class="cstate wait" title="${esc(agent.state_detail)}"><i></i>needs you</span>`
      : agent.state === "working"
        ? `<span class="cstate work"><i></i>working</span>`
        : `<span class="cstate idle"><i></i>idle</span>`;
  const where = [agent.project ? `#${esc(agent.project)}` : "no project", agent.branch ? esc(agent.branch) : ""].filter(Boolean).join(" · ");
  const ctxRow =
    agent.ctx_pct != null && agent.client !== "codex"
      ? `<dt>Context</dt><dd><span class="ctxv ${ctxLevel(agent) ?? ""}" title="Context: ${kTok(agent.ctx_tokens)} of ${kTok(agent.ctx_window)} tokens · ${ago(agent.ctx_at ?? 0)}">${agent.ctx_pct}%</span>${agent.ctx_window ? `<span class="muted"> of ${kTok(agent.ctx_window)}</span>` : ""}${compactCtl}<div class="meter ${ctxLevel(agent) ?? ""}"><i style="width:${Math.min(100, agent.ctx_pct)}%"></i></div></dd>`
      : canCompact ? `<dt>Context</dt><dd>${compactCtl}</dd>` : "";
  const note = ownAgent && agent.project ? await getNote(env, me, agent.project, agent.label) : null;
  const watching = ownAgent && !!(await env.DB.prepare("SELECT 1 FROM agent_watch WHERE member = ? AND label = ?").bind(me, agent.label).first());
  const session = `<section class="ipart" id="isess" data-region><h3>Session</h3><dl class="kv">
      <dt>State</dt><dd>${stateText}${on && agent.state === "waiting" && agent.state_detail ? `<div class="small muted">${esc(agent.state_detail)}</div>` : ""}</dd>
      ${ctxRow}
      ${agent.note ? `<dt>Role</dt><dd>${esc(plainSpaces(agent.note))}</dd>` : ""}
      <dt>Project</dt><dd>${agent.project ? `<a href="/dashboard?channel=${encodeURIComponent(agent.project)}">#${esc(agent.project)}</a>` : "none"}${ownAgent && agent.project_pin ? ` <span class="badge" title="Set from the dashboard for this session; its repo would put it in ${esc(agent.repo ? `whatever ${agent.repo} maps to` : "no project")}">pinned</span>` : ""}${ownAgent ? `<button type="button" class="btn ghost xs icon" data-open="dlg-project" title="Choose its project">${icon("pencil", 11)}</button>` : ""}</dd>
      ${agent.branch ? `<dt>Branch</dt><dd class="mono">${esc(agent.branch)}</dd>` : ""}
      ${agent.host ? `<dt>Machine</dt><dd>${esc(hostOf(agent))}${ownAgent ? `<button type="button" class="btn ghost xs icon" data-open="dlg-host" title="Rename this machine">${icon("pencil", 11)}</button>` : ""}</dd>` : ""}
      ${ownAgent && agent.cwd ? `<dt>Folder</dt><dd class="mono cwd">${esc(agent.cwd)}</dd>` : ""}
      <dt>Client</dt><dd>${clientBadge(agent.client, true)}${agent.version ? ` <span class="muted">${esc(agent.version)}</span>` : ""}</dd>
      ${ownAgent ? `<dt>Your agents</dt><dd>${takesCtl}</dd>` : ""}
    </dl>
    ${ownAgent && agent.project ? `<h3>Notes${note ? `<span class="muted">${ago(note.updated_at)}${note.updated_by && note.updated_by !== me ? ` · by ${esc(note.updated_by)}` : note.updated_by === me ? " · by you" : ""}</span>` : ""}</h3>
      <details class="inotes"${note ? "" : ""}><summary>${note ? `<div class="md inote">${md(note.body, agent.origin, null)}</div><span class="btn ghost xs">${icon("pencil", 12)}Edit</span>` : `<span class="small muted">What it's on and what's next, for whoever has the name after a restart.</span><span class="btn ghost xs">${icon("plus", 12)}Write</span>`}</summary>
        <form method="post" action="/agent/notes" data-native>${hidden({ label: agent.label, project: agent.project, back: here })}<textarea name="body" rows="7" maxlength="4000" placeholder="On: …&#10;Next: …&#10;Watch out for: …">${esc(note?.body ?? "")}</textarea><div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn sm primary">Save</button></div></form>
      </details>` : ""}
    ${loopsOf(agent).length ? `<h3>Loops</h3>${loopsOf(agent).map((l) => `<div class="irow looprow">${icon("repeat", 13)}<span>${esc(describe(l))}</span></div>`).join("")}` : ""}
    ${jobsOf(agent).length ? `<h3>Background jobs</h3>${jobsOf(agent).map((j) => `<div class="irow jobrow" title="${esc(j.command)}"><span>⧗</span><span class="grow">${esc(jobName(j))} <span class="muted">· running ${duration(Date.now() - j.at)}</span></span><form method="post" action="/agent/job-dismiss" data-native>${hidden({ session: agent.session_id, id: j.id, back: here })}<button class="btn ghost xs icon jobx" title="Not running any more? Remove it from this list">${icon("x", 11)}</button></form></div>`).join("")}` : ""}
  </section>`;
  const menu = `<div class="cmenu" role="menu">
      <div class="mrow"><span>Text size</span><span class="fsz"><button type="button" class="btn ghost xs icon" data-fs="-1" title="Smaller text">A</button><button type="button" class="btn ghost xs icon" data-fs="1" title="Larger text">A</button></span></div>
      <button type="button" class="mi ttog" data-relaytoggle>${icon("messages", 15)}<span>Messages between agents</span><span class="mchk">${icon("check", 13)}</span></button>
      ${ownAgent ? `<button type="button" class="mi ttog" data-acttoggle>${icon("eye", 15)}<span>What it's doing</span><span class="mchk">${icon("check", 13)}</span></button>` : ""}
      <a class="mi" href="/dashboard?view=files&amp;agent=${encodeURIComponent(key(agent))}">${icon("image", 15)}<span>Files from ${esc(agent.label)}</span></a>
      ${ownAgent ? `<hr><button type="button" class="mi" data-open="dlg-rename">${icon("pencil", 15)}<span>Rename…</span></button><button type="button" class="mi" data-open="dlg-project">${icon("hash", 15)}<span>Change project…</span></button>${canCompact && !agent.compact_req && !agent.compact_prep ? `<button type="button" class="mi" data-open="dlg-compact">${icon("layers", 15)}<span>Compact…</span></button>` : ""}` : ""}
    </div>`;
  const chat = `<section class="chat${codeOn ? " codemode" : ""}${inspOpen ? " inspon" : ""}">
      <header class="chd" id="chathd" data-region data-subs="${runningN}" data-agent="${esc(key(agent))}" data-state="${on ? esc(agent.state ?? "") : "off"}">
        <button type="button" class="btn ghost icon sm mtree" data-treetoggle title="Agents">${icon("sidebar", 17)}</button>
        <a class="btn ghost icon sm trailback" data-trailback hidden title="Back">${icon("back", 17)}</a>
        <span class="presence ${on ? "on" : ""}">${agentAvatar(agent.member, agent.label, "s")}</span>
        <div class="ctitle"><h2 class="aname">${esc(ownAgent ? agent.label : key(agent))}</h2>${stateText}<span class="csub">${where}</span></div>
        ${reviewBadge(agent)}
        <div class="ctools">
          ${seg}
          ${subs.length ? `<button type="button" class="btn ghost sm cbtn subsbtn${runningN ? " live" : ""}" data-insp title="Subagents: ${runningN} running">${icon("users", 15)}${runningN ? `<span class="cnt">${runningN}</span>` : ""}</button>` : ""}
          ${canScreen ? `<button type="button" class="btn ghost sm icon cbtn scrbtn" ${screenAttrs(key(agent), agent.label, agent.screen ?? "", agent.client ?? "")} title="See its terminal and send it keys">${icon("terminal", 15)}</button>` : ""}
          ${ownAgent ? `<button type="button" class="btn ghost sm icon cbtn watchbtn${watching ? " on" : ""}" data-watch="${esc(agent.label)}" title="${watching ? "You'll get a notification when its turn ends (click to cancel)" : "Tell me when it's done: a notification when its current turn ends"}">${icon("bell", 15)}</button>` : ""}
          <button type="button" class="btn ghost sm icon cbtn inspbtn" data-insp title="Details: subagents, context, machine, folder">${icon("sidebar", 15)}</button>
          <button type="button" class="btn ghost sm icon cbtn" data-hdmore aria-expanded="false" title="More: text size, what to show, rename, project">${icon("dots", 16)}</button>
          ${menu}
        </div>
      </header>
      ${codeOn || !ownAgent ? "" : subTabs}
      ${on && agent.state === "waiting" && !pending.some((p) => p.session_id === agent.session_id) ? `<div class="cbanner"><i></i><span><b>${esc(agent.label)} is waiting${agent.state_at ? ` (asked ${ago(agent.state_at)})` : ""}:</b> ${esc(agent.state_detail || "for approval or input")}. Only its terminal can answer this.${canScreen ? "" : " Already answered? Claude Code doesn't say when, so this stays until the step has run."}</span>${canScreen ? `<button type="button" class="btn sm" ${screenAttrs(key(agent), agent.label, agent.screen ?? "", agent.client ?? "")}>${icon("terminal", 14)}Open its screen</button>` : ""}</div>` : ""}
      <div class="cbody"><div class="cmain">
      ${codeOn ? codePane : `<div class="thread term${/(?:^|;\s*)ic_activity=off/.test(cookie) ? " noact" : ""}${/(?:^|;\s*)ic_relay=off/.test(cookie) ? " norelay" : ""}" id="thread" data-region${subSel ? ` data-sub="${esc(subSel.id)}"` : ""}>${subSel ? subThread : thread || `<div class="empty" style="margin:auto">${icon("message", 28)}<div>No messages with ${esc(agent.label)} yet.</div><div class="small">${ownAgent ? "Ask a question or give it a new direction; it treats what you write here like a prompt you typed." : "Your message reaches this session; its owner's agent treats it as information from you."}</div></div>`}</div>
${ownAgent && !codeOn ? await chatAsks(env, me, agent.session_id, here) : ""}
${(() => {
        // While it works: its latest step and how long it has been at it, live, above the composer.
        if (!on || agent.state !== "working" || codeOn || subSel) return `<div class="nowline" id="nowline" data-region hidden></div>`;
        const last = acts.find((x) => x.kind !== "prompt");
        const what = !last ? "Thinking" : last.kind === "cmd" ? commandStep(plainSpaces(last.text)).title : last.kind === "read" || last.kind === "edit" ? fileStep(last.kind, plainSpaces(last.text)).title : last.kind === "text" ? esc(plainSpaces(last.text).split("\n")[0]!.slice(0, 120)) : esc(plainSpaces(last.text).slice(0, 120));
        const since = last && last.at > (agent.state_at ?? 0) ? last.at : (agent.state_at ?? Date.now());
        return `<div class="nowline" id="nowline" data-region><span class="nowdot"></span><span class="nowtx">${what}</span><span class="nowt" data-elapsed="${since}"></span><span class="nowall" title="Working for">${agent.state_at ? `<span data-elapsed="${agent.state_at}"></span> in all` : ""}</span>${canScreen && agent.screen === "keys" ? `<button type="button" class="btn ghost xs nowstop" data-stopnow="${esc(key(agent))}" title="Interrupt it (Esc in its terminal)">${icon("square", 11)}Stop</button>` : ""}</div>`;
      })()}
      <form method="post" action="/action/post" class="chatbox" id="chatform" data-region data-quiet data-images data-agent="${esc(key(agent))}" data-label="${esc(agent.label)}" data-client="${agent.client === "codex" ? "codex" : "claude"}"${canScreen && agent.screen === "keys" && !subSel ? ' data-keys="1"' : ""}${subSel ? ' data-sub="1"' : ""}>${hidden({ back: subSel ? subHref(subSel.id) : back, to: key(agent), channel: agent.project || "", session: agent.session_id, mode: "", thread: "", edit: "", ...(subSel ? { sub: subSel.id } : {}) })}
        <div class="imgtray" hidden></div>
        <div class="row" style="align-items:flex-end;flex-wrap:nowrap">
          <button type="button" class="btn ghost icon" style="height:48px" data-imgbtn title="Attach files or images (or paste / drop them here)">${icon("paperclip", 16)}</button><input type="file" multiple hidden data-imgpick>
          <textarea id="chat-input" name="message" data-chat required maxlength="4000" class="grow" rows="2" enterkeyhint="send" aria-label="Message ${esc(subSel ? subSel.desc || "the subagent" : agent.label)}"${subSel ? ` placeholder="${esc(`To this subagent, through ${agent.label}`)}"` : ""}></textarea>
          ${canBtw && !subSel ? (btwOff ? `<button type="button" class="btn ghost btwbtn" style="height:48px" disabled title="${esc(btwOff)}">btw</button>` : `<button type="button" class="btn ghost btwbtn" style="height:48px" data-btwtoggle title="Ask on the side (like /btw): answered from its current context, without adding anything to it">btw</button>`) : ""}
          <button class="btn primary" style="height:48px" title="${on ? (ownAgent ? "It picks this up right away if it's idle, or after its current step." : "It sees this on its next step.") : "Not connected: the next session with this name gets it."}">${icon("send", 15)}<span class="lbl">Send</span></button>
        </div>
        <div class="editbar tiny" hidden>${icon("pencil", 12)}<span>Editing your message: no agent gets it until you send it.</span><a href="#" data-editsend>Send it unchanged</a> · <a href="#" data-editcancel>Cancel it</a></div>
        <div class="btwbar tiny muted" hidden>Side question for ${esc(agent.label)}: answered from its current context, not added to it. Follow-ups continue the thread · <a href="#" data-btwnew>start a new side thread</a></div>
        ${subSel ? `<div class="tiny muted chatoff">${icon("users", 11)} ${esc(agent.label)} gets this and passes it on to the subagent (SendMessage), ${subSel.status === "running" ? "which reads it at its next step" : "which carries on from where it ended"}; its answer shows here.</div>` : on ? "" : '<div class="tiny muted chatoff">Not connected: the next session with this name gets it.</div>'}
      </form>`}
      </div>
      <aside class="insp" id="insp" aria-label="Details">
        <div class="ihead"><b>${esc(agent.label)}</b><button type="button" class="btn ghost xs icon" data-insp title="Close">${icon("x", 14)}</button></div>
        ${codeOn || !ownAgent ? "" : subsRegion(subs, subs.length ? await subSteps(env, me, agent.session_id) : new Map(), agent.origin ?? null, Date.now(), subHref)}
        ${session}
      </aside></div>
    </section>`;
  const dialogs = ownAgent
    ? `${canCompact ? `<dialog id="dlg-compact"><div class="hd">${icon("layers", 18)}<h2>Compact ${esc(agent.label)}</h2></div>
        <form method="post" action="/agent/compact" data-native>${hidden({ session: agent.session_id, back: here })}<div class="bd stack">
          <p class="small muted" style="margin:0">Like /compact: the conversation so far becomes a summary, freeing its context${agent.ctx_pct != null ? ` (now ${agent.ctx_pct}% full)` : ""}. It runs when the current turn ends.</p>
          <label class="field">What the summary should keep (optional)<textarea name="instructions" rows="3" maxlength="500" placeholder="e.g. the deploy plan and the open review comments"></textarea></label>
          <label class="check"><input type="checkbox" name="first" value="1" checked> Tell it first, so it can save its state and say what to keep (one more turn)</label>
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
  return { tree, main: `${updateBar}${dialogs}<div class="agents" id="agents">${chat.replace('<div class="hd">', '<div class="hd" id="chathd" data-region>')}</div>` };
}
