// Questions for you: an agent that needs your call on its own work (which way to go, whether to open a ticket, what a
// requirement means) asks with the question tool, one card with up to five questions, each with its options as
// buttons (the one it suggests marked) and room for your own words. Your answers go back to it as YOUR USER, and into
// the project's decision log. Not for reviewing someone else's MR (reviews.ts) or triaging tickets (tickets.ts).

import { type Env, UserError, postMessage } from "./lib";
import { queuePush } from "./push";
import { logDecision } from "./records";
import { agentAvatar, esc, hidden, icon, md, time } from "./ui";

export const QLIMITS = { title: 120, questions: 5, question: 300, context: 1500, options: 5, option: 80, detail: 200, answer: 1000 };

export interface QItem {
  question: string;
  context: string;
  options: { label: string; detail: string }[];
  suggest: number | null; // the option it suggests (0-based)
  multi: boolean;
}
export interface Question {
  id: number;
  member: string;
  label: string;
  session_id: string;
  project: string;
  title: string;
  url: string;
  ticket: string;
  refs: string;
  items: string;
  status: string;
  answer: string | null;
  created_at: number;
  answered_at: number | null;
}

/** A ticket or MR a question mentions: linked wherever its key appears, and listed with it. */
export interface QRef {
  key: string;
  url: string;
  title: string;
  status: string;
  about: string;
}
// Ticket keys (PAY-1234) and MR refs (shop!456, !456), as they're written in a question.
const KEY_RE = /(?<![\w!/.-])(?:[A-Z][A-Z0-9]{1,9}-\d{1,7}|[a-z][\w.-]{0,40}!\d{1,7}|!\d{2,7})(?![\w-])/g;
const mentions = (s: string): string[] => [...s.matchAll(KEY_RE)].map((m) => m[0]);

export const refsOf = (q: Question): QRef[] => {
  try {
    return JSON.parse(q.refs || "[]") as QRef[];
  } catch {
    return [];
  }
};

/** Each ref's key as a link (outside tags and existing links) in already-escaped HTML. */
function linkKeys(html: string, refs: QRef[]): string {
  const by = new Map(refs.filter((r) => r.url).map((r) => [r.key.toLowerCase(), r]));
  if (!by.size) return html;
  let inA = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<a[\s>]/i.test(part)) inA++;
        else if (/^<\/a>/i.test(part)) inA = Math.max(0, inA - 1);
        return part;
      }
      if (inA) return part;
      return part.replace(KEY_RE, (k) => {
        const r = by.get(k.toLowerCase());
        return r ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" class="qkey" title="${esc([r.title, r.status].filter(Boolean).join(" · "))}">${k}</a>` : k;
      });
    })
    .join("");
}

/** What they're about, on top: each ticket and MR with its title, status and a line on what it is. */
function refsBox(refs: QRef[]): string {
  if (!refs.length) return "";
  return `<ul class="qrefs">${refs
    .map(
      (r) => `<li>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" class="qrkey">${esc(r.key)}${icon("link", 11)}</a>` : `<b class="qrkey">${esc(r.key)}</b>`}<div class="qrmain">${r.title ? `<b>${esc(r.title)}</b>` : ""}${r.status ? `<span class="tklz">${esc(r.status)}</span>` : ""}${r.about ? `<span class="qrabout">${esc(r.about)}</span>` : ""}</div></li>`,
    )
    .join("")}</ul>`;
}

export const itemsOf = (q: Question): QItem[] => {
  try {
    return JSON.parse(q.items) as QItem[];
  } catch {
    return [];
  }
};

const text = (v: unknown, what: string, max: number, required = true): string => {
  const s = typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "";
  if (!s && required) throw new UserError(`It needs ${what}.`);
  if (s.length > max) throw new UserError(`${what[0]!.toUpperCase()}${what.slice(1)} is ${s.length} characters; keep it under ${max}.`);
  return s;
};

export async function askQuestion(env: Env, me: string, a: Record<string, unknown>): Promise<string> {
  const s = env.session;
  if (!s?.label) throw new UserError("Questions come from an agent session, so the answers have somewhere to go.");
  const title = text(a.title, "a title (what it's about, in a few words)", QLIMITS.title);
  const raw = Array.isArray(a.questions) ? (a.questions as Record<string, unknown>[]) : [];
  if (!raw.length) throw new UserError("No questions: pass questions, each with question and (usually) options.");
  if (raw.length > QLIMITS.questions) throw new UserError(`${raw.length} questions; ask at most ${QLIMITS.questions} at once, the ones you can't decide yourself.`);
  const items: QItem[] = raw.map((r, i) => {
    const opts = Array.isArray(r?.options) ? (r.options as unknown[]) : [];
    if (opts.length > QLIMITS.options) throw new UserError(`Question ${i + 1} has ${opts.length} options; give at most ${QLIMITS.options}.`);
    const options = opts.map((o, j) =>
      typeof o === "string"
        ? { label: text(o, `option ${j + 1} of question ${i + 1}`, QLIMITS.option), detail: "" }
        : { label: text((o as { label?: unknown })?.label, `option ${j + 1} of question ${i + 1}`, QLIMITS.option), detail: text((o as { detail?: unknown })?.detail, `option ${j + 1}'s detail`, QLIMITS.detail, false) },
    );
    const sg = typeof r?.suggest === "number" ? Math.round(r.suggest) - 1 : -1; // 1-based in the tool
    return {
      question: text(r?.question, `question ${i + 1}`, QLIMITS.question),
      context: text(r?.context, `question ${i + 1}'s context`, QLIMITS.context, false),
      options,
      suggest: sg >= 0 && sg < options.length ? sg : null,
      multi: r?.multi === true && options.length > 1,
    };
  });
  const url = typeof a.url === "string" && /^https?:\/\/\S{1,400}$/.test(a.url.trim()) ? a.url.trim() : "";
  const ticket = typeof a.ticket === "string" && /^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(a.ticket.trim()) ? a.ticket.trim().toUpperCase() : "";
  // Every ticket and MR it mentions has to be something your user can open from the card: given in refs, or known here
  // (what agents track for them, tickets and reviews they decided).
  const given: QRef[] = (Array.isArray(a.refs) ? (a.refs as Record<string, unknown>[]) : []).slice(0, 10).flatMap((r) => {
    const key = typeof r?.key === "string" ? r.key.trim().slice(0, 60) : "";
    const u = typeof r?.url === "string" && /^https?:\/\/\S{1,500}$/.test(r.url.trim()) ? r.url.trim() : "";
    return key ? [{ key, url: u, title: String(r.title ?? "").trim().slice(0, 160), status: String(r.status ?? "").trim().slice(0, 40), about: String(r.about ?? "").trim().slice(0, 240) }] : [];
  });
  const said = [title, ...items.flatMap((it) => [it.question, it.context, ...it.options.flatMap((o) => [o.label, o.detail])])].join("\n");
  const named = [...new Set([...mentions(said), ...(ticket ? [ticket] : [])])];
  const refs: QRef[] = [...given];
  const missing: string[] = [];
  for (const k of named) {
    if (refs.some((r) => r.key.toLowerCase() === k.toLowerCase() && r.url)) continue;
    const t = await env.DB.prepare("SELECT key, url, title, state FROM tracked WHERE member = ? AND lower(key) = lower(?) ORDER BY seen_at DESC LIMIT 1").bind(me, k).first<{ key: string; url: string; title: string; state: string }>();
    const tk = t?.url ? null : await env.DB.prepare("SELECT key, url, title FROM tickets WHERE member = ? AND lower(key) = lower(?) ORDER BY id DESC LIMIT 1").bind(me, k).first<{ key: string; url: string; title: string }>();
    const found = t?.url ? { key: k, url: t.url, title: t.title, status: t.state, about: "" } : tk?.url ? { key: k, url: tk.url, title: tk.title, status: "", about: "" } : null;
    if (!found) {
      missing.push(k);
      continue;
    }
    const at = refs.findIndex((r) => r.key.toLowerCase() === k.toLowerCase());
    if (at >= 0) refs[at] = { ...found, ...Object.fromEntries(Object.entries(refs[at]!).filter(([, v]) => v)) } as QRef;
    else refs.push(found);
  }
  if (missing.length)
    throw new UserError(
      `Your user can't open ${missing.join(", ")} from the card, and may have nothing else open. Pass refs: one per ticket or MR you mention, with key, url, title, status and about (a line on what it is), e.g. refs: [{ key: "${missing[0]}", url: "https://…", title: "…", status: "Done", about: "…" }].`,
    );
  // The same title from the same agent while one is open: replaced, not stacked.
  await env.DB.prepare("UPDATE questions SET status = 'withdrawn' WHERE member = ? AND label = ? AND title = ? AND status = 'open'").bind(me, s.label, title).run();
  const row = await env.DB.prepare(
    "INSERT INTO questions (member, label, session_id, project, title, url, ticket, refs, items, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?) RETURNING id",
  )
    .bind(me, s.label, s.session_id, s.project ?? "", title, url, ticket, JSON.stringify(refs), JSON.stringify(items), Date.now())
    .first<{ id: number }>();
  await queuePush(env, me, `y${row!.id}`);
  env.refreshWeb?.(me);
  const page = `${env.origin ?? ""}${questionHref(row!.id)}`;
  return `Asked your user (Q${row!.id}): it's a card in their dashboard, and a page of its own: ${page}\nWherever you mention these questions (a comment on the ticket or the MR, a message), link that page, so your user can answer there. Carry on with other work; their answers come as a YOUR USER message about Q${row!.id}. Don't act on these questions until then.`;
}

export async function pendingQuestions(env: Env, me: string): Promise<Question[]> {
  const { results } = await env.DB.prepare("SELECT * FROM questions WHERE member = ? AND status = 'open' ORDER BY id").bind(me).all<Question>();
  return results;
}

export async function withdrawQuestion(env: Env, me: string, id: number): Promise<string> {
  const s = env.session;
  const r = await env.DB.prepare("UPDATE questions SET status = 'withdrawn' WHERE id = ? AND member = ? AND status = 'open' AND label = ?").bind(id, me, s?.label ?? "").run();
  if (!r.meta.changes) throw new UserError(`Q${id} isn't open (or isn't yours).`);
  env.refreshWeb?.(me);
  return `Withdrew Q${id}.`;
}

/** Your answers: each question's choice(s) and your words, sent to the agent as YOUR USER, and logged. */
export async function answerQuestion(env: Env, me: string, id: number, answers: { choices: number[]; text: string }[]): Promise<string> {
  const q = await env.DB.prepare("SELECT * FROM questions WHERE id = ? AND member = ?").bind(id, me).first<Question>();
  if (!q) throw new UserError("No such question.");
  if (q.status !== "open") throw new UserError(q.status === "answered" ? "You already answered this." : `${q.label} took this question back.`);
  const items = itemsOf(q);
  const lines: string[] = [];
  const short: string[] = [];
  items.forEach((it, i) => {
    const a = answers[i] ?? { choices: [], text: "" };
    const picked = a.choices.filter((c) => c >= 0 && c < it.options.length).map((c) => it.options[c]!.label);
    const said = a.text.trim().slice(0, QLIMITS.answer);
    const ans = [picked.join(" + "), said].filter(Boolean).join(picked.length && said ? ". " : "");
    lines.push(`${i + 1}. ${it.question}\n   → ${ans || "(no answer: decide yourself, or ask again)"}`);
    if (ans) short.push(`${i + 1}. ${ans}`);
  });
  if (!short.length) throw new UserError("Answer at least one of the questions.");
  const res = await env.DB.prepare("UPDATE questions SET status = 'answered', answer = ?, answered_at = ? WHERE id = ? AND status = 'open'").bind(JSON.stringify(answers), Date.now(), id).run();
  if (!res.meta.changes) throw new UserError("This was just answered or taken back.");
  await postMessage(env, { channel: q.project || "dm", sender: me, recipient: me, recipient_agent: q.label, body: [`My answers to Q${q.id}, ${q.title}:`, ...lines].join("\n") });
  if (q.project)
    await logDecision(env, me, { project: q.project, subject: q.title.slice(0, 200), verdict: "noted", reason: short.join(" | ").slice(0, 1000), ...(q.url ? { refs: q.url } : {}) }).catch(() => undefined);
  env.refreshWeb?.(me);
  return `Sent your answers to ${q.label}.`;
}

export const questionHref = (id: number) => `/dashboard?view=question&id=${id}`;

/** Questions about a ticket, for its page and the MR's: each linked to its own page, open ones first. */
export async function questionsAbout(env: Env, me: string, key: string): Promise<string> {
  if (!key) return "";
  const { results } = await env.DB.prepare("SELECT id, label, title, status, created_at FROM questions WHERE member = ? AND ticket = ? AND status != 'withdrawn' ORDER BY status = 'open' DESC, id DESC LIMIT 10")
    .bind(me, key.toUpperCase())
    .all<{ id: number; label: string; title: string; status: string; created_at: number }>();
  if (!results.length) return "";
  return `<ul class="qabout">${results
    .map((q) => `<li><a href="${questionHref(q.id)}">${icon("message", 13)}<span>${esc(q.title)}</span></a><span class="${q.status === "open" ? "tklz warn" : "tklz ok"}">${q.status === "open" ? "to answer" : "answered"}</span></li>`)
    .join("")}</ul>`;
}

/** A question's own page: the questions to answer, or what you answered. */
export async function questionView(env: Env, me: string, id: number, back: string): Promise<string> {
  const q = await env.DB.prepare("SELECT * FROM questions WHERE id = ? AND member = ?").bind(id, me).first<Question>();
  if (!q) return `<div class="pane-in"><div class="empty"><h2>No such question</h2><p class="muted">It may have been for someone else.</p><a class="btn" href="/dashboard">${icon("back", 14)}Back</a></div></div>`;
  const agent = `/dashboard?view=agents&agent=${encodeURIComponent(`${me}/${q.label}`)}`;
  const items = itemsOf(q);
  let body: string;
  if (q.status === "open") body = questionForm(q, `${questionHref(q.id)}&back=${encodeURIComponent(back)}`);
  else {
    let ans: { choices: number[]; text: string }[] = [];
    try {
      ans = q.answer ? (JSON.parse(q.answer) as typeof ans) : [];
    } catch {}
    body = `<div class="tkdone">${icon(q.status === "answered" ? "check" : "clock", 15)}<span>${q.status === "answered" ? `You answered ${time(q.answered_at ?? q.created_at)}` : `${esc(q.label)} took this back.`}</span></div>
      ${items
        .map((it, i) => {
          const a = ans[i] ?? { choices: [], text: "" };
          const picked = a.choices.map((c) => it.options[c]?.label).filter(Boolean).join(" + ");
          return `<div class="qitem"><div class="qlegend"><span class="qn">${i + 1}</span><span class="qq">${linkKeys(esc(it.question), refsOf(q))}</span></div>${it.context ? `<div class="qctx md">${linkKeys(md(it.context), refsOf(q))}</div>` : ""}${
            q.status === "answered" ? `<p class="qans">${icon("arrow", 13)}<span>${esc([picked, a.text.trim()].filter(Boolean).join(". ") || "No answer")}</span></p>` : ""
          }</div>`;
        })
        .join("")}`;
  }
  return `<div class="pane-in tkpane qpane">
    <div class="tkcrumb"><a class="btn ghost sm tkback" href="${esc(back)}">${icon("back", 14)}Back</a><span class="tksep">/</span>${icon("message", 15)}<span class="tkkeyl">Q${q.id}</span>${q.ticket ? `<span class="badge">${esc(q.ticket)}</span>` : ""}${q.url ? `<a href="${esc(q.url)}" target="_blank" rel="noopener noreferrer" class="tkkeyl" title="Open it">${icon("link", 12)}</a>` : ""}<span class="grow"></span><span class="tkfrom">${agentAvatar(me, q.label, "s")}<a href="${esc(agent)}">${esc(q.label)}</a><span>asked ${time(q.created_at)}</span></span></div>
    <header class="tkhead"><h1>${linkKeys(esc(q.title), refsOf(q))}</h1></header>
    ${refsOf(q).length ? `<section class="tkcard qcard qrefcard"><span class="askh">What it's about</span>${refsBox(refsOf(q))}</section>` : ""}
    <section class="tkcard qcard">${body}</section>
  </div>`;
}

function questionForm(q: Question, back: string): string {
  const items = itemsOf(q);
  const refs = refsOf(q);
  const qs = items
    .map((it, i) => {
      const n = i + 1;
      const opts = it.options
        .map(
          (o, j) =>
            `<label class="qopt"><input type="${it.multi ? "checkbox" : "radio"}" name="o${n}" value="${j}"><span><b>${linkKeys(esc(o.label), refs)}</b>${j === it.suggest ? `<em class="qsug">suggested</em>` : ""}${o.detail ? `<span class="qdet">${linkKeys(esc(o.detail), refs)}</span>` : ""}</span></label>`,
        )
        .join("");
      return `<fieldset class="qitem"><legend><span class="qn">${n}</span><span class="qq">${linkKeys(esc(it.question), refs)}</span></legend>
        ${it.context ? `<div class="qctx md">${linkKeys(md(it.context), refs)}</div>` : ""}
        ${opts ? `<div class="qopts">${opts}</div>` : ""}
        <textarea name="t${n}" rows="${opts ? 1 : 2}" class="tkta" maxlength="${QLIMITS.answer}" placeholder="${opts ? "Or in your own words (optional)" : "Your answer"}"></textarea>
      </fieldset>`;
    })
    .join("");
  return `<form method="post" action="/question/${q.id}" class="qform">${hidden({ back })}${qs}
      <div class="askact"><button class="btn primary sm">${icon("send", 13)}Send answers to ${esc(q.label)}</button></div>
    </form>`;
}

/** The card in Waiting for you: each question, its options as buttons (the suggested one marked), your words. */
export function questionCard(q: Question, back: string): string {
  return `<article class="ask k-question" data-mid="y${q.id}">
    <header class="askwho"><span class="upic">${icon("message", 14)}</span><span class="askname">${esc(q.label)}</span><span class="askk">asks you</span><span class="grow"></span><a class="btn ghost xs" href="${questionHref(q.id)}" title="Its own page">${icon("arrow", 12)}Open</a></header>
    <p class="stkhead">${linkKeys(esc(q.title), refsOf(q))}${q.url ? ` <a href="${esc(q.url)}" target="_blank" rel="noopener" class="qlink">${icon("link", 12)}link</a>` : ""}</p>
    ${refsBox(refsOf(q))}
    ${questionForm(q, back)}
  </article>`;
}
