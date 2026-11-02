// The dock of what your agents wait on: permission prompts, questions with options and plans to approve, on every
// dashboard page, answered with a click. The same prompts stay up in each agent's terminal; whichever answers first
// counts, and one answered there leaves the dock.

import { type Approval, type Question, pendingApprovals } from "./approvals";
import { type Env } from "./lib";
import { type Review, OUTCOMES, agentOnline, findingsOf, onlineAgents, pendingReviews, threadOf } from "./reviews";
import { type Stuck, stuckSessions } from "./stuck";
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

function card(p: Approval, me: string, back: string, now: number): string {
  const agent = `/dashboard?view=agents&agent=${encodeURIComponent(`${me}/${p.label}`)}`;
  const deadline = p.away ? `<span class="askdue" title="Away mode: unanswered, it's denied then">denied in ${Math.max(0, Math.round((p.expires_at - now) / 60000))}m</span>` : "";
  const head = `<header class="askwho">${agentAvatar(me, p.label, "s")}<a href="${esc(agent)}" class="askname">${esc(p.label)}</a><span class="askk">${p.kind === "permission" ? esc(p.tool) : KIND[p.kind]}</span><span class="grow"></span>${deadline}${time(p.created_at)}</header>`;
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
  return `<article class="ask k-${p.kind}" data-mid="a${p.id}">${head}${body}</article>`;
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

/** An agent that isn't taking its messages (stuck.ts): what waits on it, and what to do. */
function stuckCard(st: Stuck, me: string, back: string, online: { label: string; project: string | null }[]): string {
  const agent = `/dashboard?view=agents&agent=${encodeURIComponent(`${me}/${st.agent}`)}`;
  const home = online.find((o) => o.label === st.agent)?.project ?? null;
  const others = online.filter((o) => o.label !== st.agent).sort((a, b) => Number(b.project === home) - Number(a.project === home) || a.label.localeCompare(b.label));
  const n = st.messages.length;
  const list = st.messages
    .slice(-5)
    .map((m) => `<li><b>${esc(m.sender === me && !m.sender_agent ? "You" : m.sender_agent ? `${m.sender}/${m.sender_agent}` : m.sender)}</b> <span class="muted">${time(m.created_at)}</span><span class="stkb">${esc(m.body.replace(/\s+/g, " ").slice(0, 160))}</span></li>`)
    .join("");
  return `<article class="ask k-stuck" data-mid="u${esc(st.agent)}">
    <header class="askwho">${agentAvatar(me, st.agent, "s")}<a href="${esc(agent)}" class="askname">${esc(st.agent)}</a><span class="askk">Not taking messages</span><span class="grow"></span>${time(st.since)}</header>
    <p class="rvverdict">${n} message${n > 1 ? "s" : ""}${st.handoffs.length ? ` and ${st.handoffs.length} handoff${st.handoffs.length > 1 ? "s" : ""}` : ""} waiting: ${esc(st.reason)}.</p>
    <ul class="stklist">${n > 5 ? `<li class="muted">and ${n - 5} earlier</li>` : ""}${list}${st.handoffs.map((h) => `<li><b>H${h.id}</b> <span class="muted">${time(h.created_at)}</span><span class="stkb">${esc(h.summary.slice(0, 160))}</span></li>`).join("")}</ul>
    <form method="post" action="/stuck">${hidden({ back, agent: st.agent })}
      ${others.length ? `<div class="stkmove"><select name="to" aria-label="Move to">${others.map((o) => `<option value="${esc(o.label)}">${esc(o.label)}${o.project ? ` · #${esc(o.project)}` : ""}</option>`).join("")}</select><button name="op" value="move" class="btn sm primary">${icon("arrow", 13)}Move to it</button></div>` : ""}
      <div class="askact"><button name="op" value="release" class="btn sm">Tell senders not to wait</button><button name="op" value="dismiss" class="btn sm ghost" title="Hide this until another message waits on it">I'll handle it</button></div>
    </form>
  </article>`;
}

/** The dock, for the bottom corner of every dashboard page (an empty placeholder keeps live redraws able to fill it). */
export async function asksDock(env: Env, me: string, back: string): Promise<string> {
  const pending = await pendingApprovals(env, me);
  const reviews = await pendingReviews(env, me);
  const tickets = await pendingTickets(env, me);
  const stuck = await stuckSessions(env, me);
  if (!pending.length && !reviews.length && !tickets.length && !stuck.length) return `<div id="asks" data-region hidden></div>`;
  const n = pending.length + reviews.length + tickets.length + stuck.length;
  const agents = reviews.length || stuck.length ? await onlineAgents(env, me) : [];
  const names = [...new Set(agents.map((a) => a.label))];
  const now = Date.now();
  return `<section class="asks" id="asks" data-region data-n="${n}" aria-label="Waiting for you">
    <button type="button" class="askpill" data-askstoggle title="Show what your agents are waiting on"><span class="askdot"></span><b>${n}</b> waiting for you${icon("chevron", 14)}</button>
    <div class="askpanel">
      <div class="askhd"><span class="askdot"></span><b>Waiting for you</b><span class="badge amber">${n}</span><span class="grow"></span><span class="small muted askor">or answer in the terminal</span><button type="button" class="btn ghost xs askpush" data-pushon hidden title="Get a notification on this device when something is waiting for you">${icon("bell", 13)}Notify me</button><button type="button" class="btn ghost xs icon" data-askstoggle title="Minimize">${icon("chevron", 14)}</button></div>
      <div class="asklist">${pending.map((p) => card(p, me, back, now)).join("")}${reviews
        .map((r) => reviewCard(r, me, back, agentOnline(env, r, agents), names.filter((l) => l !== r.label)))
        .join("")}${tickets.map((t) => ticketCard(t, me, back)).join("")}${stuck.map((st) => stuckCard(st, me, back, agents)).join("")}</div>
    </div>
  </section>`;
}
