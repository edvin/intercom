// The dock of what your agents wait on: permission prompts, questions with options and plans to approve, on every
// dashboard page, answered with a click. The same prompts stay up in each agent's terminal; whichever answers first
// counts, and one answered there leaves the dock.

import { type Approval, type Question, pendingApprovals } from "./approvals";
import { type Env } from "./lib";
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

/** The dock, for the bottom corner of every dashboard page (an empty placeholder keeps live redraws able to fill it). */
export async function asksDock(env: Env, me: string, back: string): Promise<string> {
  const pending = await pendingApprovals(env, me);
  if (!pending.length) return `<div id="asks" data-region hidden></div>`;
  const n = pending.length;
  const now = Date.now();
  return `<section class="asks" id="asks" data-region data-n="${n}" aria-label="Waiting for you">
    <button type="button" class="askpill" data-askstoggle title="Show what your agents are waiting on"><span class="askdot"></span><b>${n}</b> waiting for you${icon("chevron", 14)}</button>
    <div class="askpanel">
      <div class="askhd"><span class="askdot"></span><b>Waiting for you</b><span class="badge amber">${n}</span><span class="grow"></span><span class="small muted askor">or answer in the terminal</span><button type="button" class="btn ghost xs icon" data-askstoggle title="Minimize">${icon("chevron", 14)}</button></div>
      <div class="asklist">${pending
        .slice()
        .reverse()
        .map((p) => card(p, me, back, now))
        .join("")}</div>
    </div>
  </section>`;
}
