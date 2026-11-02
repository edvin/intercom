// A review's own view (reviews.ts), laid out like a ticket's (ticketview.ts): the MR to read, copied in so it reads
// without the forge, with the agent's findings where they apply in the diff; the ticket the MR implements and what was
// decided for it; asking the agent about any of it; and the decision (post or drop each finding, the outcome).

import { type Env } from "./lib";
import { type Finding, type Review, OUTCOMES, agentOnline, findingsOf, onlineAgents, reviewData, threadOf } from "./reviews";
import { type Ticket, type TicketDecision, TICKET_OUTCOMES, dataOf } from "./tickets";
import { lozenge, mrBlock, person, row, ticketHref } from "./ticketview";
import { agentAvatar, esc, hidden, icon, md, time } from "./ui";

export const reviewHref = (id: number, back = "") => `/dashboard?view=review&id=${id}${back && !back.includes("view=review") ? `&back=${encodeURIComponent(back)}` : ""}`;

const SEV = { blocker: ["Blocker", " bad"], important: ["Important", " warn"], question: ["Question", ""] } as const;
const sev = (f: Finding) => {
  const [label, cls] = SEV[f.severity] ?? [f.severity, ""];
  return `<span class="tklz${cls}">${esc(label)}</span>`;
};
const where = (f: Finding) => (f.file ? `${f.file}${f.line ? `:${f.line}` : ""}` : "");

/** "!412" for a GitLab MR, "#88" for a GitHub PR; else nothing. */
function mrRef(url: string): string {
  const m = /\/merge_requests\/(\d+)/.exec(url) ?? /\/pull\/(\d+)/.exec(url);
  return m ? (url.includes("/pull/") ? `#${m[1]}` : `!${m[1]}`) : "";
}

/** The ticket the MR implements, as you decided it: so you can check the MR does what you approved. */
async function ticketBox(env: Env, me: string, key: string, back: string): Promise<string> {
  if (!key) return "";
  const t = await env.DB.prepare("SELECT * FROM tickets WHERE member = ? AND key = ? ORDER BY id DESC LIMIT 1").bind(me, key).first<Ticket>();
  if (!t) return `<div class="tkbox"><div class="tkboxt">${icon("file", 14)}<span>Ticket</span><span class="grow"></span><b class="rvtkey">${esc(key)}</b></div><p class="tkboxp">No ticket ${esc(key)} was decided here.</p></div>`;
  const dec = t.decision ? (JSON.parse(t.decision) as TicketDecision) : null;
  const plan = dec?.outcome === "go_changes" && dec.plan ? dec.plan : dataOf(t).plan;
  const state =
    t.status === "decided" && dec
      ? `<span class="tklz${dec.outcome === "decline" ? " bad" : dec.outcome === "park" ? "" : " ok"}">${esc(TICKET_OUTCOMES[dec.outcome])}</span><span class="tkboxm">you decided ${time(t.decided_at ?? t.created_at)}</span>`
      : t.status === "open"
        ? `<span class="tklz warn">Not decided</span>`
        : `<span class="tklz">${esc(t.status)}</span>`;
  return `<div class="tkbox">
    <div class="tkboxt">${icon("file", 14)}<span>Ticket</span><span class="grow"></span><a class="rvtkey" href="${esc(ticketHref(t.id, back))}">${esc(t.key)}</a></div>
    <p class="rvttitle">${esc(t.title)}</p>
    <div class="rvtstate">${state}</div>
    ${dec?.note ? `<p class="tkboxp">“${esc(dec.note)}”</p>` : ""}
    ${plan ? `<details class="rvtplan"><summary>${dec?.outcome === "go_changes" ? "The plan as you changed it" : "The plan you saw"}</summary><div class="md tkprose">${md(plan)}</div></details>` : ""}
  </div>`;
}

function askForm(r: Review, n: number, self: string, placeholder: string): string {
  return `<form method="post" action="/review/${r.id}" class="tkask">${hidden({ back: self, ask: String(n) })}<textarea name="a${n}" id="rva${r.id}-${n}" rows="1" class="tkta" placeholder="${esc(placeholder)}" data-enter maxlength="500"></textarea><button class="btn sm">${icon("send", 13)}Ask</button></form>`;
}

function turnsHtml(r: Review, me: string, n: number): string {
  return threadOf(r)
    .filter((t) => t.finding === n)
    .map((x) => `<div class="tkturn${x.who === "you" ? " mine" : ""}" data-mid="q${x.at}"><div class="tkturnh">${x.who === "you" ? `<b>You</b>` : `${agentAvatar(me, r.label, "s")}<b>${esc(x.who)}</b>`}${time(x.at)}</div><div class="md">${md(x.text)}</div></div>`)
    .join("");
}

/** The review's own view, in the dashboard's main pane. */
export async function reviewView(env: Env, me: string, id: number, back: string): Promise<string> {
  const r = await env.DB.prepare("SELECT * FROM reviews WHERE id = ? AND member = ?").bind(id, me).first<Review>();
  if (!r) return `<div class="pane-in"><div class="empty"><h2>No such review</h2><p class="muted">It may have been for someone else.</p><a class="btn" href="${esc(back)}">${icon("back", 14)}Back</a></div></div>`;
  const d = reviewData(r);
  const fs = findingsOf(r);
  const turns = threadOf(r);
  const open = r.status === "open";
  const self = reviewHref(r.id, back);
  const agent = `/dashboard?view=agents&agent=${encodeURIComponent(`${me}/${r.label}`)}`;
  const ref = mrRef(r.url);

  // Which findings show in the diff: those whose file and line are on its new side.
  const placed = new Set<number>();
  const noteAt = (path: string, line: number) =>
    fs
      .map((f, i) => [f, i] as const)
      .filter(([f]) => f.file === path && f.line === line)
      .map(([f, i]) => {
        placed.add(i);
        return `<div class="rvnote s-${esc(f.severity)}" id="rvat${i + 1}">${sev(f)}<span class="rvnoten">Finding ${i + 1}</span><span class="rvnotes">${esc(f.summary)}</span><a href="#rvfind${i + 1}" class="rvnotel">Discuss</a></div>`;
      })
      .join("");
  const hasChanges = !!(d.diff || d.files.length);
  const changes = hasChanges ? mrBlock({ ...d, url: r.url, title: r.title }, 0, noteAt, true) : ""; // fills `placed`
  const lastOf = (n: (f: number) => boolean) => [...turns].reverse().find((t) => n(t.finding));
  const dot = (t: ReturnType<typeof lastOf>) => (t && t.who === "you" ? "" : t ? `<i class="tkdot" data-at="${t.at}" title="New answer"></i>` : "");

  const findings = fs
    .map((f, i) => {
      const n = i + 1;
      const loc = where(f);
      const locHtml = loc ? (placed.has(i) ? `<a class="rvloc" href="#rvat${n}">${icon("code", 12)}${esc(loc)}</a>` : `<span class="rvloc">${icon("code", 12)}${esc(loc)}</span>`) : "";
      return `<article class="rvfind s-${esc(f.severity)}" id="rvfind${n}">
        <div class="rvfindh">${sev(f)}<span class="rvfindn">Finding ${n}</span><span class="grow"></span>${locHtml}</div>
        <p class="rvfinds">${esc(f.summary)}</p>
        ${f.comment ? `<div class="rvcomment"><span class="askh">The comment ${esc(r.label)} would post${f.post ? "" : " (it suggests dropping it)"}</span><div class="md tkprose">${md(f.comment)}</div></div>` : ""}
        <div class="tkthread">${turnsHtml(r, me, n)}</div>
        ${open ? askForm(r, n, self, `Ask ${r.label} about this finding`) : ""}
      </article>`;
    })
    .join("");

  const tabs = [
    ["findings", `Findings <span class="badge">${fs.length}</span>${dot(lastOf((f) => f > 0))}`],
    ...(hasChanges ? [["changes", `Changes${d.files.length ? ` <span class="badge">${d.files.length}</span>` : ""}`]] : []),
    ...(d.description ? [["description", "Description"]] : []),
    ["ask", `Ask ${esc(r.label)}${turns.filter((t) => !t.finding).length ? ` <span class="badge">${turns.filter((t) => !t.finding).length}</span>` : ""}${dot(lastOf((f) => !f))}`],
  ]
    .map(([k, l]) => `<a href="#${k}" data-tab="${k}" role="tab"${k === "findings" ? ` class="on"` : ""}>${l}</a>`)
    .join("");
  const nav = `<nav id="tknav" class="tknav" role="tablist" data-region>${tabs}<span class="grow"></span>${open ? `<a href="#rvdecision" class="tkgo" title="Decide">${icon("check", 13)}<span>Decide</span></a>` : ""}</nav>`;

  const added = d.files.reduce((n, f) => n + f.added, 0);
  const removed = d.files.reduce((n, f) => n + f.removed, 0);
  const counts = { blocker: 0, important: 0, question: 0 } as Record<string, number>;
  fs.forEach((f) => (counts[f.severity] = (counts[f.severity] ?? 0) + 1));
  const details = [
    row("Author", d.author ? person(d.author) : ""),
    row("Branch", d.branch ? `<span class="tkrepos"><code>${esc(d.branch)}</code>${d.target ? `<span class="muted">→</span><code>${esc(d.target)}</code>` : ""}</span>` : ""),
    row("Pipeline", d.pipeline ? lozenge(d.pipeline) : ""),
    row("Changes", d.files.length ? `<span class="tkval">${d.files.length} file${d.files.length > 1 ? "s" : ""}<span class="cadd">+${added}</span><span class="cdel">−${removed}</span></span>` : ""),
    row("Commits", d.commits.length ? `<span class="tkval">${d.commits.length}</span>` : ""),
  ].join("");
  const headRow = row("Reviewed at", r.head ? `<span class="tkrepos"><code>${esc(r.head.slice(0, 10))}</code></span>` : "");
  const rec = OUTCOMES[r.recommend] ?? r.recommend;
  const recTone = r.recommend === "approve" ? " ok" : r.recommend === "request_changes" ? " bad" : r.recommend === "hold" ? "" : " warn";
  const review = [
    row("Recommends", `<span class="tklz${recTone}">${esc(rec)}</span>`),
    row("Findings", `<span class="tkrepos">${(["blocker", "important", "question"] as const).filter((k) => counts[k]).map((k) => `<span class="tklz${SEV[k][1]}">${counts[k]} ${esc(SEV[k][0].toLowerCase())}${counts[k]! > 1 ? "s" : ""}</span>`).join("")}</span>`),
  ].join("");

  // The decision: post or drop each finding (its comment editable), the outcome, a note; or moving it if the agent's gone.
  let decision: string;
  if (open) {
    const agents = await onlineAgents(env, me);
    const others = [...new Set(agents.map((a) => a.label))].filter((l) => l !== r.label);
    const online = agentOnline(env, r, agents);
    const move = online
      ? ""
      : `<div class="rvgone">${icon("clock", 13)}<span>${esc(r.label)} isn't connected. What you send waits for its next session${others.length ? ", or move the review to another agent:" : "."}</span>${
          others.length ? `<span class="rvmove"><select name="to">${others.map((o) => `<option>${esc(o)}</option>`).join("")}</select><button name="move" value="1" class="btn xs">Move</button></span>` : ""
        }</div>`;
    const posts = fs
      .map((f, i) => {
        const n = i + 1;
        return `<div class="rvpost">
          <div class="rvposth">${sev(f)}<span class="rvpostsum">${esc(f.summary)}</span>
            <span class="rvseg"><label><input type="radio" name="f${n}" value="post"${f.post ? " checked" : ""}>Post</label><label><input type="radio" name="f${n}" value="drop"${f.post ? "" : " checked"}>Drop</label></span></div>
          ${f.comment ? `<details class="rvpostc"><summary>Edit the comment</summary><textarea name="c${n}" id="rvc${r.id}-${n}" rows="5" class="tkta">${esc(f.comment)}</textarea></details>` : ""}
        </div>`;
      })
      .join("");
    const outcomes = (Object.keys(OUTCOMES) as (keyof typeof OUTCOMES)[])
      .map((o) => `<label class="o-${o}"><input type="radio" name="outcome" value="${o}"${o === r.recommend ? " checked" : ""}>${OUTCOMES[o]}</label>`)
      .join("");
    decision = `<form method="post" action="/review/${r.id}" class="tkcard tkdecide rvdecide">${hidden({ back: self })}<button name="enter" value="1" hidden></button>
      <h2 class="tkh2">${icon("check", 16)}Your decision</h2>
      ${move}
      <div class="rvposts"><span class="askh">Comments on the MR</span>${posts}</div>
      <div class="rvout"><span class="askh">Outcome</span><div class="rvseg wide tkout">${outcomes}</div></div>
      <label class="tknote"><span class="askh">Note for ${esc(r.label)} (optional)</span><textarea name="note" id="rvnote${r.id}" rows="2" class="tkta" maxlength="500"></textarea></label>
      <div class="askact"><button name="decide" value="1" class="btn primary">${icon("send", 14)}Send decision</button></div>
    </form>`;
  } else {
    let dec: { outcome?: keyof typeof OUTCOMES; note?: string } | null = null;
    try {
      dec = r.decision ? JSON.parse(r.decision) : null;
    } catch {}
    decision = `<div class="tkdone">${icon(r.status === "decided" ? "check" : "clock", 15)}<span>${
      r.status === "decided" && dec?.outcome ? `You decided <b>${OUTCOMES[dec.outcome]}</b> ${time(r.decided_at ?? r.created_at)}${dec.note ? `: ${esc(dec.note)}` : ""}` : `${esc(r.label)} withdrew or replaced this review.`
    }</span></div>`;
  }

  return `<div class="pane-in tkpane rvpane" data-tab="findings" data-tabs="r${r.id}">
    <div class="tkcrumb"><a class="btn ghost sm tkback" href="${esc(back)}">${icon("back", 14)}Back</a><span class="tksep">/</span>${icon("branch", 15)}<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" class="tkkeyl" title="Open on the forge">${esc(ref || "Merge request")}${icon("link", 12)}</a><span class="grow"></span><span class="tkfrom">${agentAvatar(me, r.label, "s")}<a href="${esc(agent)}">${esc(r.label)}</a><span>reviewed it ${time(r.created_at)}</span></span></div>
    <header class="tkhead"><h1>${esc(r.title)}</h1></header>
    <div class="tkgrid">
      <aside class="tkside">
        <div class="tkbox">
          <div class="tkboxh">${lozenge(d.state || "open")}<span class="grow"></span>${open ? `<a class="btn sm primary" href="#rvdecision">${icon("check", 13)}Decide</a>` : ""}</div>
          ${details ? "" : `<p class="tkboxp">${esc(r.label)} sent only its findings; the MR is on the forge.</p>`}${details || headRow ? `<dl class="tkdl">${details}${headRow}</dl>` : ""}
        </div>
        ${await ticketBox(env, me, r.ticket, self)}
        <div class="tkbox">
          <div class="tkboxt">${agentAvatar(me, r.label, "s")}<span>${esc(r.label)}'s review</span></div>
          <dl class="tkdl">${review}</dl>
        </div>
      </aside>
      <div class="tkmain">
        <section class="tkverdict">
          <div class="tkvh">${agentAvatar(me, r.label, "s")}<span class="tkvwho">${esc(r.label)}'s verdict</span><span class="grow"></span><span class="tkrec">Recommends <b>${esc(rec)}</b></span></div>
          <p class="tkvline">${esc(r.verdict)}</p>
        </section>
        ${nav}
        <section class="tkpanel on rvfindings" data-tab="findings" role="tabpanel"><div id="rvfindings" data-region>${findings}</div></section>
        ${hasChanges ? `<section class="tkcard tkpanel" data-tab="changes" role="tabpanel">${changes}</section>` : ""}
        ${d.description ? `<article class="tksheet tkpanel" data-tab="description" role="tabpanel"><section class="tksec"><h2 class="tkh2">Description</h2><div class="md tkprose">${md(d.description)}</div></section></article>` : ""}
        <section class="tkcard tkpanel" data-tab="ask" role="tabpanel"><div id="rvthread" data-region><div class="tkthread">${
          turnsHtml(r, me, 0) || (open ? `<p class="small muted">Ask ${esc(r.label)} anything about the MR or its review. The answer shows here, and on your phone.</p>` : "")
        }</div>${open ? askForm(r, 0, self, `Ask ${r.label} about the MR or the review`) : ""}</div></section>
        <div id="rvdecision" data-region>${decision}</div>
      </div>
    </div>
  </div>`;
}
