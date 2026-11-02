// A ticket in the dashboard (tickets.ts): a short card in Waiting for you, and a view of its own where the whole of it
// reads (the ticket copied from the tracker, the agent's assessment and plan, the MRs with their diffs), where you ask
// the agent about it, and where you decide.

import { drawDiff, fid } from "./code";
import { type Env } from "./lib";
import { type Ticket, type TicketDecision, type TicketMR, TICKET_OUTCOMES, dataOf, getTicket, ticketThread } from "./tickets";
import { agentAvatar, avatar, esc, hidden, icon, md, time } from "./ui";

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
    ${unread ? `<a class="tknew" href="${esc(ticketHref(t.id, back))}#ask">${icon("message", 12)}${esc(t.label)} answered your question</a>` : ""}
    <div class="askact"><span class="tkrec">Recommends <b>${REC[t.recommend] ?? esc(t.recommend)}</b></span><span class="grow"></span><a class="btn sm primary" href="${esc(ticketHref(t.id, back))}">${icon("eye", 13)}Open</a></div>
  </article>`;
}

export const tone = (s: string) => (/pass|success|merged|done|closed|resolved|fixed/i.test(s) ? " ok" : /fail|error|block|cancel|reject|declin/i.test(s) ? " bad" : /run|pend|progress|review|open|draft|test/i.test(s) ? " mid" : "");

/** A tracker date ("2026-10-28", "2026-10-30 14:02", ISO) the way people say it; anything else as the agent sent it. */
export function when(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s.trim());
  if (!m) return s;
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1];
  if (!mon) return s;
  return `${Number(m[3])} ${mon} ${m[1]}${m[4] ? `, ${m[4]}:${m[5]}` : ""}`;
}

/** The issue type's icon, coloured the way trackers do: a bug red, a story green, a task blue, an epic purple. */
function typeIcon(type: string): string {
  const t = type.toLowerCase();
  const [c, glyph] = /bug|defect|incident/.test(t)
    ? ["#e5493a", '<circle cx="8" cy="8" r="3" fill="#fff"/>']
    : /story|feature/.test(t)
      ? ["#63ba3c", '<path d="M5.5 4h5v8.2L8 10.4l-2.5 1.8z" fill="#fff"/>']
      : /epic/.test(t)
        ? ["#904ee2", '<path d="M9.2 3.5 5 8.8h2.8L6.8 12.5 11 7.2H8.2z" fill="#fff"/>']
        : /task|sub/.test(t)
          ? ["#4bade8", '<path d="m5 8.2 2 2 4-4.2" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>']
          : ["#8590a2", '<circle cx="8" cy="8" r="2" fill="#fff"/>'];
  return `<svg class="tkti" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="${c}"/>${glyph}</svg>`;
}

/** The priority's arrow: up and red for the urgent ones, a level bar for medium, down and blue for low. */
function priorityIcon(p: string): string {
  const t = p.toLowerCase();
  const up = (y: number) => `<path d="m3.5 ${y + 4} 4.5-4 4.5 4"/>`;
  const down = (y: number) => `<path d="m3.5 ${y} 4.5 4 4.5-4"/>`;
  const [c, d] = /highest|blocker|critical|urgent|p0/.test(t)
    ? ["#e5493a", up(3) + up(7.5)]
    : /high|major|p1/.test(t)
      ? ["#f15b50", up(5.5)]
      : /lowest|trivial|p4/.test(t)
        ? ["#2684ff", down(3) + down(7.5)]
        : /low|minor|p3/.test(t)
          ? ["#2684ff", down(5.5)]
          : /medium|normal|p2/.test(t)
            ? ["#f79233", '<path d="M3.5 6h9M3.5 10h9"/>']
            : ["", ""];
  return c ? `<svg class="tkpi" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>` : "";
}

export const lozenge = (s: string) => `<span class="tklz${tone(s)}">${esc(s)}</span>`;
export const person = (name: string) => (name ? `<span class="tkwho">${avatar(name, "s")}<span>${esc(name)}</span></span>` : `<span class="tkwho none">${icon("user", 14)}<span>Unassigned</span></span>`);
export const row = (label: string, value: string) => (value ? `<div class="tkrow"><dt>${label}</dt><dd>${value}</dd></div>` : "");

export function mrBlock(m: TicketMR, i: number, noteAt?: (path: string, line: number) => string, bare = false): string {
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
  const diff = m.diff ? drawDiff(m.diff, () => "", noteAt) : "";
  return `<section class="tkmr" id="mr${i + 1}">
    ${bare ? "" : `<div class="tkmrh"><a class="tkmrt" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${icon("branch", 14)}<span>${esc(m.title || m.url)}</span>${icon("link", 12)}</a></div>`}
    <p class="tkmeta">${m.state ? `<span class="tks${tone(m.state)}">${esc(m.state)}</span>` : ""}${m.pipeline ? `<span class="tks${tone(m.pipeline)}">pipeline ${esc(m.pipeline)}</span>` : ""}${m.branch ? `<code>${esc(m.branch)}</code>${m.target ? ` → <code>${esc(m.target)}</code>` : ""}` : ""}${m.files.length ? `<span class="muted">${m.files.length} file${m.files.length > 1 ? "s" : ""} · <span class="cadd">+${added}</span> <span class="cdel">−${removed}</span></span>` : ""}</p>
    ${files}${commits}
    ${diff ? `<div class="tkdiff">${diff}</div>` : m.files.length ? `<p class="small muted">The agent didn't send the diff; open the MR to see it.</p>` : ""}
  </section>`;
}

/** The thread of questions and answers: a live region of its own, so an answer arriving doesn't touch the rest. */
function threadRegion(t: Ticket, me: string, self: string): string {
  const turns = ticketThread(t);
  const ask =
    t.status === "open"
      ? `<form method="post" action="/ticket/${t.id}" class="tkask">${hidden({ back: self })}<textarea name="ask_text" id="tkask${t.id}" rows="2" class="tkta" placeholder="Ask ${esc(t.label)} about the ticket, the plan or the MR" data-enter maxlength="500"></textarea><button name="ask" value="1" class="btn sm">${icon("send", 13)}Ask</button></form>`
      : "";
  return `<div id="tkthread" data-region><div class="tkthread">${
    turns.length
      ? turns.map((x) => `<div class="tkturn${x.who === "you" ? " mine" : ""}" data-mid="k${x.at}"><div class="tkturnh">${x.who === "you" ? avatar(me, "s") : agentAvatar(me, t.label, "s")}<b>${x.who === "you" ? "You" : esc(x.who)}</b>${time(x.at)}</div><div class="md">${md(x.text)}</div></div>`).join("")
      : t.status === "open" ? `<p class="small muted">Ask ${esc(t.label)} anything about the ticket or the plan. The answer shows here, and on your phone.</p>` : ""
  }</div>${ask}</div>`;
}

/** The ticket's own view, in the dashboard's main pane: laid out like the tracker's issue page (the ticket to read on the
 * left, its details on the right), with the agent's assessment above it and the questions and the decision below. */
export async function ticketView(env: Env, me: string, id: number, back: string): Promise<string> {
  const t = await getTicket(env, me, id);
  if (!t) return `<div class="pane-in"><div class="empty"><h2>No such ticket</h2><p class="muted">It may have been for someone else.</p><a class="btn" href="/dashboard?view=agents">${icon("back", 14)}Back</a></div></div>`;
  const d = dataOf(t);
  const f = d.fields;
  const open = t.status === "open";
  const self = ticketHref(t.id, back); // forms come back here
  const agent = `/dashboard?view=agents&agent=${encodeURIComponent(`${me}/${t.label}`)}`;
  const dec = t.decision ? (JSON.parse(t.decision) as TicketDecision) : null;
  const turns = ticketThread(t);
  // The tabs: what there is to read (the ticket, the MRs, the talk with the agent). The assessment stays above them and
  // the decision below, so the plan and the decision are in view whatever you read. The open tab is the page's hash.
  const last = turns[turns.length - 1];
  const tabs = [
    ["ticket", "Ticket"],
    ...(d.mrs.length ? [["mr", d.mrs.length > 1 ? `MRs <span class="badge">${d.mrs.length}</span>` : "MR"]] : []),
    ["ask", `Ask ${esc(t.label)}${turns.length ? ` <span class="badge">${turns.length}</span>` : ""}${last && last.who !== "you" ? `<i class="tkdot" data-at="${last.at}" title="New answer"></i>` : ""}`],
  ]
    .map(([k, l]) => `<a href="#${k}" data-tab="${k}" role="tab"${k === "ticket" ? ` class="on"` : ""}>${l}</a>`)
    .join("");
  const nav = `<nav id="tknav" class="tknav" role="tablist" data-region>${tabs}<span class="grow"></span>${open ? `<a href="#tkdecision" class="tkgo" title="Decide">${icon("check", 13)}<span>Decide</span></a>` : ""}</nav>`;
  const links = d.links.length
    ? `<section class="tksec" id="tk-links"><h2 class="tkh2">Linked issues</h2><div class="tklinks">${d.links
        .map(
          (l) =>
            `<${l.url ? `a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"` : "div"} class="tklink"><span class="tkrel">${esc(l.relation)}</span><b>${esc(l.key)}</b><span class="tkltitle">${esc(l.title)}</span>${l.status ? lozenge(l.status) : ""}</${l.url ? "a" : "div"}>`,
        )
        .join("")}</div></section>`
    : "";
  const comments = d.comments.length
    ? `<section class="tksec" id="tk-activity"><h2 class="tkh2">Activity <span class="tkcount">${d.comments.length} comment${d.comments.length > 1 ? "s" : ""}</span></h2><div class="tkcomments">${d.comments
        .map((c) => `<article class="tkc">${avatar(c.author || "?", "m")}<div class="tkcb"><div class="tkch"><b>${esc(c.author || "Someone")}</b>${c.at ? `<span>${esc(when(c.at))}</span>` : ""}</div><div class="md tkprose">${md(c.body)}</div></div></article>`)
        .join("")}</div></section>`
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
  const rec = REC[t.recommend] ?? t.recommend;
  const recTone = t.recommend === "go" ? " ok" : t.recommend === "decline" ? " bad" : " mid";
  const details = [
    row("Assignee", person(f.assignee)),
    row("Reporter", f.reporter ? person(f.reporter) : ""),
    row("Priority", f.priority ? `<span class="tkval">${priorityIcon(f.priority)}${esc(f.priority)}</span>` : ""),
    row("Type", f.type ? `<span class="tkval">${typeIcon(f.type)}${esc(f.type)}</span>` : ""),
    row("Created", f.created ? `<span class="tkval">${esc(when(f.created))}</span>` : ""),
    row("Updated", f.updated ? `<span class="tkval">${esc(when(f.updated))}</span>` : ""),
  ].join("");
  const work = [
    row("Recommends", `<span class="tklz${recTone}">${esc(rec)}</span>`),
    row("Size", d.size ? `<span class="tkval">${esc(d.size)}</span>` : ""),
    row("Repos", d.repos.length ? `<span class="tkrepos">${d.repos.map((r) => `<code>${esc(r)}</code>`).join("")}</span>` : ""),
    row(d.mrs.length > 1 ? "MRs" : "MR", d.mrs.length ? `<span class="tkrepos">${d.mrs.map((m, i) => `<a href="#mr${i + 1}" class="tkmrl">${icon("branch", 12)}${esc(m.state || "open")}${m.pipeline ? ` · ${esc(m.pipeline)}` : ""}</a>`).join("")}</span>` : ""),
  ].join("");
  return `<div class="pane-in tkpane" data-tab="ticket" data-tabs="t${t.id}">
    <div class="tkcrumb"><a class="btn ghost sm tkback" href="${esc(back)}">${icon("back", 14)}Back</a><span class="tksep">/</span>${f.type ? typeIcon(f.type) : ""}<a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer" class="tkkeyl" title="Open in the tracker">${esc(t.key)}${icon("link", 12)}</a><span class="grow"></span><span class="tkfrom">${agentAvatar(me, t.label, "s")}<a href="${esc(agent)}">${esc(t.label)}</a><span>sent it ${time(t.created_at)}</span></span></div>
    <header class="tkhead"><h1>${esc(t.title)}</h1></header>
    <div class="tkgrid">
      <aside class="tkside">
        <div class="tkbox">
          <div class="tkboxh">${f.status ? `<span class="tklz big${tone(f.status)}">${esc(f.status)}</span>` : ""}<span class="grow"></span>${open ? `<a class="btn sm primary" href="#tkdecision">${icon("check", 13)}Decide</a>` : ""}</div>
          ${details ? `<dl class="tkdl">${details}</dl>` : ""}
        </div>
        <div class="tkbox">
          <div class="tkboxt">${agentAvatar(me, t.label, "s")}<span>${esc(t.label)}'s plan</span></div>
          <dl class="tkdl">${work}</dl>
        </div>
      </aside>
      <div class="tkmain">
        <section class="tkverdict" id="tk-plan">
          <div class="tkvh">${agentAvatar(me, t.label, "s")}<span class="tkvwho">${esc(t.label)}'s assessment</span><span class="grow"></span><span class="tkrec">Recommends <b>${esc(rec)}</b></span></div>
          <p class="tkvline">${esc(t.verdict)}</p>
          <div class="md tkprose">${md(d.plan)}</div>
        </section>
        ${nav}
        <article class="tksheet tkpanel on" data-tab="ticket" id="tk-ticket" role="tabpanel">
          <section class="tksec">
            <h2 class="tkh2">Description</h2>
            ${d.description ? `<div class="md tkprose">${md(d.description)}</div>` : `<p class="tkempty">No description.</p>`}
          </section>
          ${links}${comments}
        </article>
        ${d.mrs.length ? `<section class="tkcard tkpanel" data-tab="mr" id="tk-mrs" role="tabpanel">${d.mrs.map((m, i) => mrBlock(m, i)).join("")}</section>` : ""}
        <section class="tkcard tkpanel" data-tab="ask" id="tk-talk" role="tabpanel">
          ${threadRegion(t, me, self)}
        </section>
        <div id="tkdecision" data-region>${
          open
            ? `<form method="post" action="/ticket/${t.id}" class="tkcard tkdecide" id="tk-decide">${hidden({ back: self })}
          <h2 class="tkh2">${icon("check", 16)}Your decision</h2>
          ${questions ? `<div class="tkqs"><span class="askh">${esc(t.label)} asks</span>${questions}</div>` : ""}
          <div class="rvout"><span class="askh">Outcome</span><div class="rvseg wide tkout">${outcomes}</div></div>
          <label class="tkplanedit"><span class="askh">The plan, as you want it</span><textarea name="plan" id="tkplan${t.id}" rows="10" class="tkta mono">${esc(d.plan)}</textarea></label>
          <label class="tknote"><span class="askh tknote-n">Note for ${esc(t.label)} (optional)</span><span class="askh tknote-r">Reason (optional)</span><textarea name="note" id="tknote${t.id}" rows="2" class="tkta" maxlength="1000"></textarea></label>
          <div class="askact"><button name="decide" value="1" class="btn primary">${icon("send", 14)}Send decision</button></div>
        </form>`
            : status
        }</div>
      </div>
    </div>
  </div>`;
}
