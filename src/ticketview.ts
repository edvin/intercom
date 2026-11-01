// A ticket in the dashboard (tickets.ts): a short card in Waiting for you, and a view of its own where the whole of it
// reads (the ticket copied from the tracker, the agent's assessment and plan, the MRs with their diffs), where you ask
// the agent about it, and where you decide.

import { drawDiff, fid } from "./code";
import { type Env } from "./lib";
import { type Ticket, type TicketDecision, type TicketMR, TICKET_OUTCOMES, dataOf, getTicket, ticketThread } from "./tickets";
import { agentAvatar, esc, hidden, icon, md, time } from "./ui";

export const ticketHref = (id: number, back = "") => `/dashboard?view=ticket&id=${id}${back && !back.includes("view=ticket") ? `&back=${encodeURIComponent(back)}` : ""}`;
const REC = { go: "Go", park: "Park", decline: "Decline" } as const;

/** The card in Waiting for you: enough to know what it is; the reading and deciding happen in the view. */
export function ticketCard(t: Ticket, me: string, back: string): string {
  const d = dataOf(t);
  const agent = `/dashboard?view=agents&agent=${encodeURIComponent(`${me}/${t.label}`)}`;
  const turns = ticketThread(t);
  const unread = turns.length && turns[turns.length - 1]!.who !== "you";
  const facts = [d.fields.priority, d.fields.status, d.size, d.mrs.length ? `${d.mrs.length} MR${d.mrs.length > 1 ? "s" : ""}` : "", d.questions.length ? `${d.questions.length} question${d.questions.length > 1 ? "s" : ""} for you` : ""].filter(Boolean);
  return `<article class="ask k-ticket" data-mid="t${t.id}">
    <header class="askwho">${agentAvatar(me, t.label, "s")}<a href="${esc(agent)}" class="askname">${esc(t.label)}</a><span class="askk">${esc(t.key)}</span><span class="grow"></span>${time(t.created_at)}</header>
    <a class="rvtitle" href="${esc(ticketHref(t.id, back))}">${esc(t.title)}</a>
    <p class="rvverdict">${esc(t.verdict)}</p>
    ${facts.length ? `<p class="tkfacts">${facts.map((f) => `<span>${esc(f)}</span>`).join("")}</p>` : ""}
    ${unread ? `<p class="tknew">${icon("message", 12)}${esc(t.label)} answered your question</p>` : ""}
    <div class="askact"><span class="tkrec">Recommends <b>${REC[t.recommend] ?? esc(t.recommend)}</b></span><span class="grow"></span><a class="btn sm primary" href="${esc(ticketHref(t.id, back))}">${icon("eye", 13)}Open</a></div>
  </article>`;
}

const chip = (label: string, value: string, cls = "") => (value ? `<span class="tkf${cls}"><span>${label}</span>${esc(value)}</span>` : "");
const tone = (s: string) => (/pass|success|merged|done|closed|resolved/i.test(s) ? " ok" : /fail|error|block|cancel/i.test(s) ? " bad" : /run|pend|progress|review|open|draft/i.test(s) ? " mid" : "");

function mrBlock(m: TicketMR, i: number): string {
  const added = m.files.reduce((n, f) => n + f.added, 0);
  const removed = m.files.reduce((n, f) => n + f.removed, 0);
  const files = m.files.length
    ? `<div class="cfiles tkfiles">${m.files
        .map((f) => `<a class="cfile" href="#${fid(f.path)}"><span class="cpath">${esc(f.path)}</span><span class="cnum"><span class="cadd">+${f.added}</span> <span class="cdel">−${f.removed}</span></span></a>`)
        .join("")}</div>`
    : "";
  const commits = m.commits.length
    ? `<details class="tkcommits"><summary>${m.commits.length} commit${m.commits.length > 1 ? "s" : ""}</summary><ul>${m.commits.map((c) => `<li><code>${esc(c.sha.slice(0, 8))}</code> ${esc(c.title)}</li>`).join("")}</ul></details>`
    : "";
  const diff = m.diff ? drawDiff(m.diff, () => "") : "";
  return `<section class="tkmr" id="mr${i + 1}">
    <div class="tkmrh"><a class="tkmrt" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${icon("branch", 14)}<span>${esc(m.title || m.url)}</span>${icon("link", 12)}</a></div>
    <p class="tkmeta">${m.state ? `<span class="tks${tone(m.state)}">${esc(m.state)}</span>` : ""}${m.pipeline ? `<span class="tks${tone(m.pipeline)}">pipeline ${esc(m.pipeline)}</span>` : ""}${m.branch ? `<code>${esc(m.branch)}</code>${m.target ? ` → <code>${esc(m.target)}</code>` : ""}` : ""}${m.files.length ? `<span class="muted">${m.files.length} file${m.files.length > 1 ? "s" : ""} · <span class="cadd">+${added}</span> <span class="cdel">−${removed}</span></span>` : ""}</p>
    ${files}${commits}
    ${diff ? `<div class="tkdiff">${diff}</div>` : m.files.length ? `<p class="small muted">The agent didn't send the diff; open the MR to see it.</p>` : ""}
  </section>`;
}

/** The thread of questions and answers: a live region of its own, so an answer arriving doesn't touch the rest. */
function threadRegion(t: Ticket, self: string): string {
  const turns = ticketThread(t);
  const ask =
    t.status === "open"
      ? `<form method="post" action="/ticket/${t.id}" class="tkask">${hidden({ back: self })}<textarea name="ask_text" id="tkask${t.id}" rows="2" class="tkta" placeholder="Ask ${esc(t.label)} about the ticket, the plan or the MR" data-enter maxlength="500"></textarea><button name="ask" value="1" class="btn sm">${icon("send", 13)}Ask</button></form>`
      : "";
  return `<div id="tkthread" data-region><div class="tkthread">${
    turns.length
      ? turns.map((x) => `<div class="tkturn${x.who === "you" ? " mine" : ""}" data-mid="k${x.at}"><div class="tkturnh"><b>${x.who === "you" ? "You" : esc(x.who)}</b>${time(x.at)}</div><div class="md">${md(x.text)}</div></div>`).join("")
      : t.status === "open" ? `<p class="small muted">Ask ${esc(t.label)} anything about the ticket or the plan. The answer shows here, and on your phone.</p>` : ""
  }</div>${ask}</div>`;
}

/** The ticket's own view, in the dashboard's main pane. */
export async function ticketView(env: Env, me: string, id: number, back: string): Promise<string> {
  const t = await getTicket(env, me, id);
  if (!t) return `<div class="pane-in"><div class="empty"><h2>No such ticket</h2><p class="muted">It may have been for someone else.</p><a class="btn" href="/dashboard?view=agents">${icon("back", 14)}Back</a></div></div>`;
  const d = dataOf(t);
  const open = t.status === "open";
  const self = ticketHref(t.id, back); // forms come back here
  const agent = `/dashboard?view=agents&agent=${encodeURIComponent(`${me}/${t.label}`)}`;
  const dec = t.decision ? (JSON.parse(t.decision) as TicketDecision) : null;
  const nav = [
    ["tk-ticket", "Ticket"],
    ["tk-plan", "Plan"],
    ...(d.mrs.length ? [["tk-mrs", d.mrs.length > 1 ? `MRs (${d.mrs.length})` : "MR"]] : []),
    ["tk-talk", "Questions"],
    ["tkdecision", open ? "Decide" : "Decision"],
  ]
    .map(([h, l]) => `<a href="#${h}">${l}</a>`)
    .join("");
  const fields = [
    chip("Status", d.fields.status, tone(d.fields.status)),
    chip("Priority", d.fields.priority),
    chip("Type", d.fields.type),
    chip("Reporter", d.fields.reporter),
    chip("Assignee", d.fields.assignee),
    chip("Created", d.fields.created),
    chip("Updated", d.fields.updated),
  ].join("");
  const links = d.links.length
    ? `<h3 class="tkh3">Linked issues</h3><div class="tklinks">${d.links
        .map(
          (l) =>
            `<${l.url ? `a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"` : "div"} class="tklink"><span class="muted">${esc(l.relation)}</span><b>${esc(l.key)}</b><span class="grow tkltitle">${esc(l.title)}</span>${l.status ? `<span class="tks${tone(l.status)}">${esc(l.status)}</span>` : ""}</${l.url ? "a" : "div"}>`,
        )
        .join("")}</div>`
    : "";
  const comments = d.comments.length
    ? `<h3 class="tkh3">Comments <span class="badge">${d.comments.length}</span></h3><div class="tkcomments">${d.comments
        .map((c) => `<article class="tkc"><div class="tkch"><b>${esc(c.author || "Someone")}</b><span class="muted">${esc(c.at)}</span></div><div class="md">${md(c.body)}</div></article>`)
        .join("")}</div>`
    : "";
  const questions = d.questions
    .map(
      (q, i) => `<fieldset class="tkq"><legend class="askqt">${i + 1}. ${esc(q.question)}</legend>${
        q.options.length ? `<div class="askopts">${q.options.map((o) => `<label class="askopt"><input type="radio" name="p${i}" value="${esc(o)}"><span class="askoptx"><b>${esc(o)}</b></span></label>`).join("")}</div>` : ""
      }<textarea name="q${i}" id="tkq${t.id}-${i}" rows="2" class="tkta" placeholder="${q.options.length ? "Or answer in your own words" : "Your answer"}"></textarea></fieldset>`,
    )
    .join("");
  const outcomes = (Object.keys(TICKET_OUTCOMES) as (keyof typeof TICKET_OUTCOMES)[])
    .map((o) => `<label class="o-${o}"><input type="radio" name="outcome" value="${o}"${o === t.recommend ? " checked" : ""}>${TICKET_OUTCOMES[o]}</label>`)
    .join("");
  const status = open
    ? ""
    : `<div class="tkdone">${icon(t.status === "decided" ? "check" : "clock", 15)}<span>${
        t.status === "decided" && dec ? `You decided <b>${TICKET_OUTCOMES[dec.outcome]}</b> ${time(t.decided_at ?? t.created_at)}${dec.note ? `: ${esc(dec.note)}` : ""}` : t.status === "replaced" ? `${esc(t.label)} sent a newer version of this ticket.` : `${esc(t.label)} took this ticket down.`
      }</span></div>`;
  return `<div class="pane-in tkpane">
    <a class="btn ghost sm tkback" href="${esc(back)}">${icon("back", 14)}Back</a>
    <header class="tkhead">
      <div class="tkkey"><a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer" class="tkkeyl">${esc(t.key)}${icon("link", 12)}</a><span class="grow"></span><span class="tkfrom">from ${agentAvatar(me, t.label, "s")}<a href="${esc(agent)}">${esc(t.label)}</a> ${time(t.created_at)}</span></div>
      <h1>${esc(t.title)}</h1>
      ${fields ? `<div class="tkfields">${fields}</div>` : ""}
    </header>
    <nav class="tknav">${nav}</nav>
    <section class="tkverdict" id="tk-plan">
      <div class="tkvh"><span class="askh">${esc(t.label)}'s assessment</span><span class="grow"></span><span class="tkrec">Recommends <b>${REC[t.recommend] ?? esc(t.recommend)}</b></span></div>
      <p class="tkvline">${esc(t.verdict)}</p>
      ${d.size || d.repos.length ? `<p class="tkmeta">${d.size ? `<span class="tks">${esc(d.size)}</span>` : ""}${d.repos.map((r) => `<code>${esc(r)}</code>`).join("")}</p>` : ""}
      <div class="md tkplan">${md(d.plan)}</div>
    </section>
    <section class="tkcard" id="tk-ticket">
      <h2 class="tkh2">${icon("file", 15)}The ticket</h2>
      ${d.description ? `<div class="md tkdesc">${md(d.description)}</div>` : `<p class="muted small">No description.</p>`}
      ${links}${comments}
    </section>
    ${d.mrs.length ? `<section class="tkcard" id="tk-mrs"><h2 class="tkh2">${icon("branch", 15)}${d.mrs.length > 1 ? "Merge requests" : "Merge request"}</h2>${d.mrs.map(mrBlock).join("")}</section>` : ""}
    <section class="tkcard" id="tk-talk">
      <h2 class="tkh2">${icon("messages", 15)}Questions for ${esc(t.label)}</h2>
      ${threadRegion(t, self)}
    </section>
    <div id="tkdecision" data-region>${
      open
        ? `<form method="post" action="/ticket/${t.id}" class="tkcard tkdecide" id="tk-decide">${hidden({ back: self })}
      <h2 class="tkh2">${icon("check", 15)}Your decision</h2>
      ${questions ? `<div class="tkqs"><span class="askh">${esc(t.label)} asks</span>${questions}</div>` : ""}
      <div class="rvout"><span class="askh">Outcome</span><div class="rvseg wide tkout">${outcomes}</div></div>
      <label class="tkplanedit"><span class="askh">The plan, as you want it</span><textarea name="plan" id="tkplan${t.id}" rows="10" class="tkta mono">${esc(d.plan)}</textarea></label>
      <label class="tknote"><span class="askh tknote-n">Note for ${esc(t.label)} (optional)</span><span class="askh tknote-r">Reason (optional)</span><textarea name="note" id="tknote${t.id}" rows="2" class="tkta" maxlength="1000"></textarea></label>
      <div class="askact"><button name="decide" value="1" class="btn primary">${icon("send", 14)}Send decision</button></div>
    </form>`
        : status
    }</div>
  </div>`;
}
