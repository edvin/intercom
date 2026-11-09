// The dock of what your agents wait on: permission prompts, questions with options and plans to approve, on every
// dashboard page, answered with a click. The same prompts stay up in each agent's terminal; whichever answers first
// counts, and one answered there leaves the dock.

import { type Approval, type Question, pendingApprovals } from "./approvals";
import { type Activity, type Env, ago } from "./lib";
import { type Btw, BTW_TIMEOUT, modAnswers } from "./btw";
import { type Review, OUTCOMES, agentOnline, findingsOf, onlineAgents, pendingReviews, threadOf } from "./reviews";
import { type Stuck, nudgeIsOn, stuckSessions } from "./stuck";
import { screenAttrs } from "./screen";
import { type Row as UpRow, exitedAgents, frozenAgents, fullAgents, myRows, outOfUsage, since, staleAgents, upkeepOf } from "./upkeep";
import { type ResetTry, RESET_GAP_MS, resetsOf } from "./resets";
import { PLUGIN_VERSION } from "./version";
import { pendingTickets } from "./tickets";
import { reviewHref } from "./reviewview";
import { ticketCard } from "./ticketview";
import { agentAvatar, esc, hidden, icon, md, time } from "./ui";

const KIND = { permission: "Permission", question: "Question", plan: "Plan" } as const;

function questionForm(p: Approval, back: string): string {
  let qs: Question[] = [];
  try {
    qs = JSON.parse(p.detail || "[]") as Question[];
  } catch {}
  // One question with one answer: each option sends itself. Otherwise pick, then send.
  const oneClick = qs.length === 1 && !qs[0].multiSelect;
  const body = qs
    .map((q, i) => {
      const opts = q.options
        .map((o) =>
          oneClick
            ? `<button class="askopt" name="q${i}" value="${esc(o.label)}"><span class="askoptx"><b>${esc(o.label)}</b>${o.description ? `<span>${esc(o.description)}</span>` : ""}</span>${icon("arrow", 14)}</button>`
            : `<label class="askopt"><input type="${q.multiSelect ? "checkbox" : "radio"}" name="q${i}" value="${esc(o.label)}"><span class="askoptx"><b>${esc(o.label)}</b>${o.description ? `<span>${esc(o.description)}</span>` : ""}</span></label>`,
        )
        .join("");
      return `<fieldset class="askq">${q.header ? `<span class="askh">${esc(q.header)}</span>` : ""}<p class="askqt">${esc(q.question)}</p>${q.multiSelect ? '<p class="askhint">Pick any</p>' : ""}
        <div class="askopts">${opts}</div>
        <input name="t${i}" class="asktype" placeholder="${oneClick ? "Or type an answer and press Enter" : "Or type an answer"}" autocomplete="off"></fieldset>`;
    })
    .join("");
  return `<form method="post" action="/approval/${p.id}">${hidden({ back })}${body}
    <div class="askact">${oneClick ? "" : `<button name="decision" value="allow" class="btn sm primary">${icon("send", 13)}Send</button>`}<button name="decision" value="deny" class="btn sm ghost" title="Tell the agent you're not answering">Skip</button></div></form>`;
}

type Screens = Map<string, { label: string; screen: string; client: string }>;
const lookBtn = (me: string, x: { label: string; screen: string; client: string } | undefined, text = "") =>
  x ? `<button type="button" class="btn ghost xs${text ? "" : " icon"} asklook" ${screenAttrs(`${me}/${x.label}`, x.label, x.screen, x.client)} title="See its terminal${x.screen === "keys" ? " and answer there" : ""}">${icon("monitor", 13)}${text}</button>` : "";

// What led to a question, a plan or a permission prompt: the agent's steps since your last prompt to it, up to the ask
// (its explanation is usually the text it wrote just before), and side questions you asked about it on the card.
export interface LeadUp {
  acts: Activity[]; // oldest first
  btws: Btw[];
  canAsk: boolean; // a Claude Code session whose intercom-ui mod answers side questions
}
const LEAD_KINDS = ["text", "cmd", "edit", "read", "tool"];
const LEAD_MAX = 30;
const STEP_ICON: Record<string, string> = { cmd: "$", edit: "✎", read: "·", tool: "⚙", text: "●" };

export async function leadUps(env: Env, me: string, pending: Approval[]): Promise<Map<number, LeadUp>> {
  const out = new Map<number, LeadUp>();
  for (const p of pending) {
    const since = await env.DB.prepare("SELECT MAX(at) AS at FROM activity WHERE member = ? AND session_id = ? AND kind = 'prompt' AND at <= ?")
      .bind(me, p.session_id, p.created_at)
      .first<{ at: number | null }>();
    // The transcript reaches the hub a little after the hook that asked, so the last minute after the ask counts too.
    const { results } = await env.DB.prepare(
      `SELECT id, session_id, at, kind, text FROM activity WHERE member = ? AND session_id = ? AND at > ? AND at <= ? AND kind IN (${LEAD_KINDS.map(() => "?").join(",")}) ORDER BY id DESC LIMIT ?`,
    )
      .bind(me, p.session_id, since?.at ?? 0, p.created_at + 60_000, ...LEAD_KINDS, LEAD_MAX)
      .all<Activity>();
    const { results: btws } = await env.DB.prepare("SELECT * FROM btw WHERE member = ? AND session_id = ? AND created_at >= ? ORDER BY id")
      .bind(me, p.session_id, p.created_at)
      .all<Btw>();
    const s = await env.DB.prepare("SELECT client, ui_at, ui_version FROM sessions WHERE member = ? AND session_id = ?")
      .bind(me, p.session_id)
      .first<{ client: string; ui_at: number | null; ui_version: string }>();
    out.set(p.id, { acts: results.reverse(), btws, canAsk: !!s && s.client !== "codex" && modAnswers(s) });
  }
  return out;
}

function leadUpHtml(p: Approval, lead: LeadUp | undefined, back: string, now: number): string {
  if (!lead) return "";
  const texts = lead.acts.filter((a) => a.kind === "text");
  const why = texts[texts.length - 1];
  const rest = lead.acts.filter((a) => a !== why);
  const row = (a: Activity) =>
    `<div class="act act-${esc(a.kind)}"><span class="aic">${STEP_ICON[a.kind] ?? "·"}</span><span class="atx${a.kind === "text" ? " md" : ""}">${a.kind === "text" ? md(a.text) : esc(a.text.replace(/\n/g, " · "))}</span><span class="when">${time(a.at)}</span></div>`;
  const steps = rest.length
    ? `<details class="asklead" id="lead-${p.id}"><summary>${icon("chevron", 11)}What it did before asking · ${rest.length} step${rest.length === 1 ? "" : "s"}${lead.acts.length >= LEAD_MAX ? " (the latest)" : ""}</summary><div class="askleadlist">${rest.map(row).join("")}</div></details>`
    : "";
  const turns = lead.btws
    .map((b) => {
      const late = b.status === "pending" && now - b.created_at > BTW_TIMEOUT;
      const a = b.status === "answered" ? `<div class="md">${md(b.answer)}</div>` : b.status === "failed" || late ? `<span class="muted">no answer${b.reason ? `: ${esc(b.reason)}` : ""}</span>` : `<span class="muted">asking…</span>`;
      return `<div class="rvturn mine"><b>You</b> ${esc(b.question)}</div><div class="rvturn"><b>${esc(p.label)}</b> ${a}</div>`;
    })
    .join("");
  const ask = lead.canAsk
    ? `<details class="rvask askabout" id="askab-${p.id}"${lead.btws.length ? " open" : ""}><summary>${icon("message", 12)}Ask ${esc(p.label)} about it</summary>
        <form method="post" action="/action/post" class="rvaskrow">${hidden({ back, session: p.session_id, mode: "btw" })}<input name="message" class="asktype" placeholder="What do you need to know first?" autocomplete="off" maxlength="2000" required><button class="btn xs">Ask</button></form>
        <p class="askhint">A side question: it answers from what it knows now, without leaving the question or adding to its context.</p></details>`
    : "";
  if (!why && !steps && !turns && !ask) return "";
  return `<div class="askctx">${why ? `<div class="askwhy md" title="What ${esc(p.label)} wrote before asking">${md(why.text)}</div>` : ""}${steps}${turns}${ask}</div>`;
}

function card(p: Approval, me: string, back: string, now: number, screens: Screens = new Map(), lead?: LeadUp): string {
  const agent = `/dashboard?view=agents&agent=${encodeURIComponent(`${me}/${p.label}`)}`;
  const deadline = p.away ? `<span class="askdue" title="Away mode: unanswered, it's denied then">denied in ${Math.max(0, Math.round((p.expires_at - now) / 60000))}m</span>` : "";
  const head = `<header class="askwho">${agentAvatar(me, p.label, "s")}<a href="${esc(agent)}" class="askname">${esc(p.label)}</a><span class="askk">${p.kind === "permission" ? esc(p.tool) : KIND[p.kind]}</span><span class="grow"></span>${deadline}${time(p.created_at)}${lookBtn(me, screens.get(p.session_id))}</header>`;
  let body: string;
  if (p.kind === "question") body = questionForm(p, back);
  else if (p.kind === "plan")
    body = `<div class="askplan md">${md(p.detail)}</div>
      <form method="post" action="/approval/${p.id}">${hidden({ back })}<input name="note" class="asktype" placeholder="What to change (to keep planning)" autocomplete="off">
      <div class="askact"><button name="decision" value="allow" class="btn sm primary">${icon("check", 14)}Approve plan</button><button name="decision" value="deny" class="btn sm ghost">Keep planning</button></div></form>`;
  else {
    const what = p.summary.startsWith(`${p.tool}: `) ? p.summary.slice(p.tool.length + 2) : p.summary;
    body = `<pre class="askcode">${esc(what)}</pre>
      <form method="post" action="/approval/${p.id}">${hidden({ back })}<input name="note" class="asktype" placeholder="Note for the agent (optional)" autocomplete="off">
      <div class="askact"><button name="decision" value="allow" class="btn sm primary">${icon("check", 14)}Allow</button><button name="decision" value="deny" class="btn sm danger">${icon("x", 14)}Deny</button></div></form>`;
  }
  return `<article class="ask k-${p.kind}" data-mid="a${p.id}">${head}${leadUpHtml(p, lead, back, now)}${body}</article>`;
}

const SEV = { blocker: "Blocker", important: "Important", question: "Question" } as const;

/** A review waiting for your call: post or drop each finding, ask about one, pick the outcome. One form; the buttons say what to do. */
function reviewCard(r: Review, me: string, back: string, online: boolean, others: string[]): string {
  const agent = `/dashboard?view=agents&agent=${encodeURIComponent(`${me}/${r.label}`)}`;
  const turns = threadOf(r);
  const thread = (n: number) =>
    turns
      .filter((t) => t.finding === n)
      .map((t) => `<div class="rvturn${t.who === "you" ? " mine" : ""}"><b>${t.who === "you" ? "You" : esc(t.who)}</b> ${esc(t.text)}</div>`)
      .join("");
  const ask = (n: number, label: string) =>
    `<details class="rvask"><summary>${icon("message", 12)}${label}</summary><div class="rvaskrow"><input name="a${n}" class="asktype" placeholder="Ask ${esc(r.label)}…" autocomplete="off" maxlength="500"><button name="ask" value="${n}" class="btn xs">Ask</button></div></details>`;
  const findings = findingsOf(r)
    .map((f, i) => {
      const n = i + 1;
      return `<div class="rvf">
        <div class="rvfh"><span class="rvsev s-${f.severity}">${SEV[f.severity] ?? esc(f.severity)}</span><span class="grow"></span>
          <span class="rvseg"><label><input type="radio" name="f${n}" value="post"${f.post ? " checked" : ""}>Post</label><label><input type="radio" name="f${n}" value="drop"${f.post ? "" : " checked"}>Drop</label></span></div>
        <p class="rvsum">${esc(f.summary)}</p>
        ${f.comment ? `<details class="rvc"><summary>Comment it would post</summary><textarea name="c${n}" rows="4">${esc(f.comment)}</textarea></details>` : ""}
        ${thread(n)}${ask(n, "Ask about this")}
      </div>`;
    })
    .join("");
  const outcomes = (Object.keys(OUTCOMES) as (keyof typeof OUTCOMES)[])
    .map((o) => `<label><input type="radio" name="outcome" value="${o}"${o === r.recommend ? " checked" : ""}>${OUTCOMES[o]}</label>`)
    .join("");
  const move = online
    ? ""
    : `<div class="rvgone">${icon("clock", 13)}<span>${esc(r.label)} isn't connected. What you send waits for its next session${others.length ? ", or move the review to another agent:" : "."}</span>${
        others.length ? `<span class="rvmove"><select name="to">${others.map((o) => `<option>${esc(o)}</option>`).join("")}</select><button name="move" value="1" class="btn xs">Move</button></span>` : ""
      }</div>`;
  return `<article class="ask k-review" data-mid="r${r.id}">
    <header class="askwho">${agentAvatar(me, r.label, "s")}<a href="${esc(agent)}" class="askname">${esc(r.label)}</a><span class="askk">Review R${r.id}</span><span class="grow"></span>${time(r.created_at)}<a class="btn ghost xs icon rvopen" href="${esc(reviewHref(r.id, back))}" title="Open it full size: the MR, the findings in its diff, the ticket">${icon("eye", 13)}</a></header>
    <a class="rvtitle" href="${esc(reviewHref(r.id, back))}">${esc(r.title)}</a>
    <p class="rvverdict">${esc(r.verdict)}</p>
    <form method="post" action="/review/${r.id}">${hidden({ back })}<button name="enter" value="1" hidden></button>
      ${move}${findings}${thread(0)}${ask(0, "Ask about the review")}
      <div class="rvout"><span class="askh">Outcome</span><div class="rvseg wide">${outcomes}</div></div>
      <input name="note" class="asktype" placeholder="Note for ${esc(r.label)} (optional)" autocomplete="off" maxlength="500">
      <div class="askact"><button name="decide" value="1" class="btn sm primary">${icon("send", 13)}Send decision</button></div>
    </form>
  </article>`;
}

/** An agent waiting on its terminal (a question or a prompt it shows there, Codex's own approval dialog) with no card of
 * its own: what it says it waits for, and its screen to answer it. */
function waitCard(w: { session_id: string; label: string; screen: string; client: string; state_detail: string; state_at: number | null }, me: string): string {
  const agent = `/dashboard?view=agents&agent=${encodeURIComponent(`${me}/${w.label}`)}`;
  return `<article class="ask k-wait" data-mid="w${esc(w.session_id)}">
    <header class="askwho">${agentAvatar(me, w.label, "s")}<a href="${esc(agent)}" class="askname">${esc(w.label)}</a><span class="askk">In its terminal</span><span class="grow"></span>${w.state_at ? time(w.state_at) : ""}</header>
    <p class="stkhead">${esc(w.label)} is waiting: ${esc(w.state_detail || "for input")}.</p>
    <p class="stkwhy">${w.client === "codex" ? "Codex asks in its terminal, where the intercom can't answer for you," : "It asks in its terminal,"} but you can see it and answer from here.</p>
    <div class="askact">${lookBtn(me, w, "See it and answer")}</div>
  </article>`;
}

// ---- keeping agents running and current (upkeep.ts) ----

const upkeepForm = (back: string, fields: Record<string, string>, body: string) => `<form method="post" action="/upkeep">${hidden({ back, ...fields })}${body}</form>`;
const uopt = (op: string, title: string, sub: string, primary = false) =>
  `<button class="askopt${primary ? " uprimary" : ""}" name="op" value="${op}"><span class="askoptx"><b>${title}</b><span>${sub}</span></span>${icon("arrow", 14)}</button>`;

function updatesCard(stale: UpRow[], me: string, back: string, auto: boolean): string {
  const names = stale.map((r) => `<li><b>${esc(r.label)}</b> <span class="muted">intercom ${esc(r.version || "?")}${r.host ? ` · ${esc(r.host)}` : ""}${r.state === "working" ? " · busy" : ""}</span></li>`).join("");
  return `<article class="ask k-upkeep" data-mid="upd">
    <header class="askwho"><span class="upic">${icon("refresh", 14)}</span><span class="askname">Updates</span><span class="askk">Intercom ${esc(PLUGIN_VERSION)}</span></header>
    <p class="stkhead">${stale.length} of your agents run${stale.length === 1 ? "s" : ""} an older intercom.</p>
    <p class="stkwhy">Updating types /reload-plugins into an idle one: same session, nothing lost (/restart instead if Claude Code itself has an update waiting). Busy ones are left alone.</p>
    <ul class="stklist">${names}</ul>
    <p class="stkwhy"><a href="/dashboard?view=fleet">All your agents and their versions →</a></p>
    ${upkeepForm(back, { key: `upd:${PLUGIN_VERSION}` }, `<div class="askopts">${uopt("update", "Update the idle ones now", "Each is told to reload; you see how it went.", true)}${uopt(auto ? "auto-off" : "auto-on", auto ? "Stop updating them by themselves" : "Always do this by itself", auto ? "They're updated automatically when idle for 10 minutes." : "Idle agents get each new version within about 20 minutes.")}${uopt("dismiss", "Not now", "Shows again with the next version.")}</div>`)}
  </article>`;
}

/** Agents on one machine that ran out of usage (resets.ts): when it resets, and redeeming a reset for them. */
function limitCard(host: string, out: UpRow[], me: string, back: string, on: boolean, last: ResetTry | undefined): string {
  const codex = out.filter((r) => r.client === "codex");
  const when = out.map((r) => r.state_detail.match(/resets (.+)$/)?.[1]).find(Boolean);
  const value = String(Math.max(...out.map((r) => r.state_at ?? 0)));
  const recent = last && Date.now() - last.at < RESET_GAP_MS ? last : undefined;
  const tried = recent
    ? recent.outcome === "redeemed"
      ? `A reset was redeemed here ${ago(recent.at)}, and they've run out again. Another one is only redeemed when you say so.`
      : recent.outcome === "none"
        ? `No resets were left when one was tried ${ago(recent.at)}.`
        : recent.outcome === "busy"
          ? ""
          : `Redeeming a reset ${ago(recent.at)} didn't work: ${esc(recent.outcome.replace(/^failed: /, ""))}.`
    : codex.length && on
      ? "Redeeming a reset for them in a moment…"
      : "";
  const names = out.map((r) => `<li><b>${esc(r.label)}</b> <span class="muted">${r.client === "codex" ? "Codex" : "Claude Code"}${r.state_at ? ` · since ${esc(ago(r.state_at))}` : ""}</span></li>`).join("");
  return `<article class="ask k-stuck" data-mid="l${esc(host)}">
    <header class="askwho"><span class="upic">${icon("clock", 14)}</span><span class="askname">Out of usage</span><span class="askk">${esc(host)}</span><span class="grow"></span>${time(Number(value))}</header>
    <p class="stkhead">${out.length === 1 ? `${esc(out[0]!.label)} has` : `${out.length} of your agents have`} hit ${out.length === 1 ? "its" : "their"} usage limit${when ? `; it resets ${esc(when)}` : ""}.</p>
    <ul class="stklist">${names}</ul>
    ${tried ? `<p class="stknudged">${tried}</p>` : ""}
    <p class="stkwhy">${codex.length ? "Redeeming a reset runs /usage → Redeem reset → Full reset in one of their terminals (they share the login on this machine), then each carries on: its goal resumed, or told to." : "They carry on by themselves once it resets, or when you write to them."}</p>
    ${upkeepForm(back, { host, key: `limit:${host}`, value }, `<div class="askopts">${codex.length ? uopt("reset-now", "Redeem a reset now", "If the account has one left; you see how it went.", true) + uopt(on ? "resets-off" : "resets-on", on ? "Stop redeeming resets by themselves" : "Always redeem one when they run out", on ? "A reset is redeemed when Codex agents run out, at most once in two hours per machine." : "When your Codex agents run out, a reset is redeemed if one is available.") : ""}${uopt("dismiss", "Wait for the limit to reset", "Put this away until they run out again.")}</div>`)}
  </article>`;
}

function frozenCard(r: UpRow, me: string, back: string): string {
  const x = { label: r.label, screen: r.screen, client: r.client };
  return `<article class="ask k-wait" data-mid="f${esc(r.session_id)}">
    <header class="askwho">${agentAvatar(me, r.label, "s")}<span class="askname">${esc(r.label)}</span><span class="askk">May be frozen</span><span class="grow"></span>${time(Math.max(r.active_at ?? 0, r.state_at ?? 0))}</header>
    <p class="stkhead">${esc(r.label)} has been working for ${esc(since(Math.max(r.active_at ?? 0, r.state_at ?? 0)).replace(/ ago$/, ""))} with nothing new.</p>
    <p class="stkwhy">It may be on a long command, waiting on something in its terminal, or stuck. Look before you stop it.</p>
    ${upkeepForm(back, { session: r.session_id, key: `frozen:${r.session_id}`, value: String(Math.max(r.active_at ?? 0, r.state_at ?? 0)) }, `<div class="askact">${r.screen ? lookBtn(me, x, "Look at it") : ""}<button name="op" value="dismiss" class="btn sm ghost">It's fine</button></div>`)}
  </article>`;
}

function exitedCard(r: UpRow, me: string, back: string): string {
  return `<article class="ask k-stuck" data-mid="x${esc(r.session_id)}">
    <header class="askwho">${agentAvatar(me, r.label, "s")}<span class="askname">${esc(r.label)}</span><span class="askk">Stopped running</span><span class="grow"></span>${time(r.last_seen)}</header>
    <p class="stkhead">${esc(r.label)} stopped ${esc(since(r.last_seen))} without ending its session.</p>
    <p class="stkwhy">It crashed or was killed${r.host ? ` on ${esc(r.host)}` : ""}. Restarting runs it again in its pane, resumed by its session id, so it carries on with the same conversation.</p>
    ${upkeepForm(back, { session: r.session_id, key: `exited:${r.session_id}`, value: String(r.last_seen) }, `<div class="askopts">${uopt("restart", "Restart it", "The command it was started with, plus --resume and its session.", true)}${uopt("dismiss", "Leave it", "It ended for a reason; don't offer this again.")}</div>`)}
  </article>`;
}

function fullCard(r: UpRow, me: string, back: string): string {
  const bucket = Math.floor((r.ctx_pct ?? 0) / 5) * 5;
  return `<article class="ask k-wait" data-mid="c${esc(r.session_id)}">
    <header class="askwho">${agentAvatar(me, r.label, "s")}<span class="askname">${esc(r.label)}</span><span class="askk">Context ${r.ctx_pct}%</span></header>
    <p class="stkhead">${esc(r.label)}'s context is ${r.ctx_pct}% full.</p>
    ${r.compact_err ? `<p class="stknudged">The last compaction from here didn't run: ${esc(r.compact_err)}</p>` : ""}
    <p class="stkwhy">Near the limit it compacts by itself, in the middle of whatever it does. Compacting now, between turns, keeps that on your terms.</p>
    ${upkeepForm(back, { session: r.session_id, key: `full:${r.session_id}`, value: String(bucket) }, `<div class="askopts">${uopt("compact", "Compact it", "It's told first, saves what it would lose and says what the summary must keep; then it's compacted.", true)}${uopt("compact-now", "Compact right away", r.state === "working" ? "When its current turn ends, without a warning." : "Now, without a warning.")}${uopt("dismiss", "Not now", "Asks again at 5% more.")}</div>`)}
  </article>`;
}

/** An agent that isn't reading its messages (stuck.ts): what waits on it, why, and three plain choices. */
function stuckCard(st: Stuck, me: string, back: string, online: { label: string; project: string | null }[], nudgeOn = true): string {
  const agent = `/dashboard?view=agents&agent=${encodeURIComponent(`${me}/${st.agent}`)}`;
  const home = online.find((o) => o.label === st.agent)?.project ?? null;
  const others = online.filter((o) => o.label !== st.agent).sort((a, b) => Number(b.project === home) - Number(a.project === home) || a.label.localeCompare(b.label));
  const n = st.messages.length;
  const what = `${n} message${n > 1 ? "s" : ""}${st.handoffs.length ? ` and ${st.handoffs.length} handoff${st.handoffs.length > 1 ? "s" : ""}` : ""}`;
  const from = (m: Stuck["messages"][number]) => (m.sender === me && !m.sender_agent ? "You" : m.sender_agent ? (m.sender === me ? m.sender_agent : `${m.sender}/${m.sender_agent}`) : m.sender);
  const list = st.messages
    .slice(-4)
    .map((m) => `<li><b>${esc(from(m))}</b> <span class="muted">${time(m.created_at)}</span><span class="stkb">${esc(m.body.replace(/\s+/g, " ").slice(0, 160))}</span></li>`)
    .join("");
  const opt = (value: string, title: string, sub: string) => `<button class="askopt" name="op" value="${value}"><span class="askoptx"><b>${title}</b><span>${sub}</span></span>${icon("arrow", 14)}</button>`;
  return `<article class="ask k-stuck" data-mid="u${esc(st.agent)}">
    <header class="askwho">${agentAvatar(me, st.agent, "s")}<a href="${esc(agent)}" class="askname">${esc(st.agent)}</a><span class="askk">Not reading</span><span class="grow"></span>${time(st.since)}</header>
    <p class="stkhead">${esc(what)} for ${esc(st.agent)} ${n + st.handoffs.length > 1 ? "have" : "has"} gone unread for ${esc(ago(st.since).replace(/ ago$/, ""))}.</p>
    <p class="stkwhy">${esc(st.explain)}</p>
    ${st.nudgedAt ? `<p class="stkwhy stknudged">${icon("refresh", 12)}The intercom woke it ${esc(ago(st.nudgedAt))} (typed “read them and carry on” into its terminal), but it still hasn't read them.</p>` : ""}
    <ul class="stklist">${n > 4 ? `<li class="muted">and ${n - 4} earlier</li>` : ""}${list}${st.handoffs.map((h) => `<li><b>Handoff H${h.id}</b> <span class="muted">${time(h.created_at)}</span><span class="stkb">${esc(h.summary.slice(0, 160))}</span></li>`).join("")}</ul>
    <form method="post" action="/stuck">${hidden({ back, agent: st.agent })}
      <p class="askqt">What should happen?</p>
      <div class="askopts">
        ${
          others.length
            ? `<div class="askopt stkmv"><span class="askoptx"><b>Give them to another agent</b><span>It answers instead, and whoever sent them is told.</span></span><select name="to" aria-label="Which agent">${others.map((o) => `<option value="${esc(o.label)}">${esc(o.label)}</option>`).join("")}</select><button name="op" value="move" class="btn sm primary">Give</button><label class="stkfwd"><input type="checkbox" name="forward" value="1"${online.some((o) => o.label === st.agent) ? "" : " checked"}>Send what comes for ${esc(st.agent)} later to it too, while ${esc(st.agent)} isn't running</label></div>`
            : ""
        }
        ${st.wake ? opt("wake", "Wake it now", `Types “read your intercom messages and carry on” into its terminal, as you would. It starts reading them.`) : ""}
        ${opt("release", "Tell whoever sent them not to wait", `They carry on without an answer. ${esc(st.agent)} still reads them once it's back.`)}
        ${opt("dismiss", "Leave them, I'll wake it", `Nothing changes; ${st.client === "codex" ? "type anything in its terminal and it reads them" : "it reads them when it's back"}. This goes away until a new message waits.`)}
      </div>
    </form>
    ${st.wake ? `<form method="post" action="/upkeep" class="stknudge">${hidden({ back, op: nudgeOn ? "nudge-off" : "nudge-on" })}<span>${nudgeOn ? "The intercom wakes agents that aren't reading first, once, before asking you." : "Agents that aren't reading wait for you to wake them."}</span><button class="btn ghost xs">${nudgeOn ? "Turn off" : "Wake them by itself"}</button></form>` : ""}
  </article>`;
}

/** The dock, for the bottom corner of every dashboard page (an empty placeholder keeps live redraws able to fill it). */
export async function asksDock(env: Env, me: string, back: string): Promise<string> {
  const pending = await pendingApprovals(env, me);
  const leads = await leadUps(env, me, pending);
  const reviews = await pendingReviews(env, me);
  const tickets = await pendingTickets(env, me);
  const stuck = await stuckSessions(env, me);
  const nudgeOn = stuck.length ? await nudgeIsOn(env, me) : true;
  // Your agents whose terminal can be seen from here (screen.ts): for a look at what they're asking, and for the ones
  // waiting there with no card of their own.
  const { results: seen } = await env.DB.prepare(
    "SELECT session_id, label, screen, client, state, state_detail, state_at FROM sessions WHERE member = ? AND screen != '' AND last_seen > ?",
  )
    .bind(me, Date.now() - 10 * 60_000)
    .all<{ session_id: string; label: string; screen: string; client: string; state: string; state_detail: string; state_at: number | null }>();
  const screens: Screens = new Map(seen.map((x) => [x.session_id, x]));
  const carded = new Set([...pending.map((p) => p.session_id), ...stuck.map((x) => x.agent)]);
  const waits = seen.filter((x) => x.state === "waiting" && !carded.has(x.session_id) && !carded.has(x.label) && !/limit|login|account/i.test(x.state_detail) && Date.now() - (x.state_at ?? 0) > 20_000);
  // Keeping them running and current (upkeep.ts).
  const { rows: ups, live: upLive } = await myRows(env, me);
  const { auto, dismissed } = await upkeepOf(env, me);
  const stale = dismissed[`upd:${PLUGIN_VERSION}`] ? [] : staleAgents(ups, upLive, true);
  const frozen = frozenAgents(ups, upLive).filter((r) => (dismissed[`frozen:${r.session_id}`] ?? -1) < Math.max(r.active_at ?? 0, r.state_at ?? 0));
  const exited = exitedAgents(ups, upLive).filter((r) => (dismissed[`exited:${r.session_id}`] ?? -1) < r.last_seen);
  const full = fullAgents(ups, upLive).filter((r) => (dismissed[`full:${r.session_id}`] ?? -1) < Math.floor((r.ctx_pct ?? 0) / 5) * 5);
  // Out of usage, by machine.
  const { on: resetsOn, log: resetLog } = await resetsOf(env, me);
  const outBy = new Map<string, UpRow[]>();
  for (const r of ups.filter((r) => upLive(r) && outOfUsage(r))) outBy.set(r.host || "unknown machine", [...(outBy.get(r.host || "unknown machine") ?? []), r]);
  const limits = [...outBy]
    .filter(([host, rs]) => (dismissed[`limit:${host}`] ?? -1) < Math.max(...rs.map((r) => r.state_at ?? 0)))
    .map(([host, rs]) => limitCard(host, rs, me, back, resetsOn, resetLog[host]));
  const upkeepCards = [...limits, ...exited.map((r) => exitedCard(r, me, back)), ...frozen.map((r) => frozenCard(r, me, back)), ...full.map((r) => fullCard(r, me, back)), ...(stale.length ? [updatesCard(stale, me, back, auto)] : [])];
  if (!pending.length && !reviews.length && !tickets.length && !stuck.length && !waits.length && !upkeepCards.length) return `<div id="asks" data-region hidden></div>`;
  const n = pending.length + reviews.length + tickets.length + stuck.length + waits.length + upkeepCards.length;
  const agents = reviews.length || stuck.length ? await onlineAgents(env, me) : [];
  const names = [...new Set(agents.map((a) => a.label))];
  const now = Date.now();
  return `<section class="asks" id="asks" data-region data-n="${n}" aria-label="Waiting for you">
    <button type="button" class="askpill" data-askstoggle title="Show what your agents are waiting on"><span class="askdot"></span><b>${n}</b> waiting for you${icon("chevron", 14)}</button>
    <div class="askpanel">
      <div class="askhd"><span class="askdot"></span><b>Waiting for you</b><span class="badge amber">${n}</span><span class="grow"></span><span class="small muted askor">or answer in the terminal</span><button type="button" class="btn ghost xs askpush" data-pushon hidden title="Get a notification on this device when something is waiting for you">${icon("bell", 13)}Notify me</button><button type="button" class="btn ghost xs icon" data-askstoggle title="Minimize">${icon("chevron", 14)}</button></div>
      <div class="asklist">${pending.map((p) => card(p, me, back, now, screens, leads.get(p.id))).join("")}${waits.map((w) => waitCard(w, me)).join("")}${reviews
        .map((r) => reviewCard(r, me, back, agentOnline(env, r, agents), names.filter((l) => l !== r.label)))
        .join("")}${tickets.map((t) => ticketCard(t, me, back)).join("")}${stuck.map((st) => stuckCard(st, me, back, agents, nudgeOn)).join("")}${upkeepCards.join("")}</div>
    </div>
  </section>`;
}
