// Questions for you: an agent that needs your call on its own work (which way to go, whether to open a ticket, what a
// requirement means) asks with the question tool, one card with up to five questions, each with its options as
// buttons (the one it suggests marked) and room for your own words. Your answers go back to it as YOUR USER, and into
// the project's decision log. Not for reviewing someone else's MR (reviews.ts) or triaging tickets (tickets.ts).

import { type Env, UserError, postMessage } from "./lib";
import { queuePush } from "./push";
import { logDecision } from "./records";
import { esc, hidden, icon, md } from "./ui";

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
  items: string;
  status: string;
  answer: string | null;
  created_at: number;
  answered_at: number | null;
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
  // The same title from the same agent while one is open: replaced, not stacked.
  await env.DB.prepare("UPDATE questions SET status = 'withdrawn' WHERE member = ? AND label = ? AND title = ? AND status = 'open'").bind(me, s.label, title).run();
  const row = await env.DB.prepare(
    "INSERT INTO questions (member, label, session_id, project, title, url, items, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?) RETURNING id",
  )
    .bind(me, s.label, s.session_id, s.project ?? "", title, url, JSON.stringify(items), Date.now())
    .first<{ id: number }>();
  await queuePush(env, me, `y${row!.id}`);
  env.refreshWeb?.(me);
  return `Asked your user (Q${row!.id}): it's a card in their dashboard. Carry on with other work; their answers come as a YOUR USER message about Q${row!.id}. Don't act on these questions until then.`;
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

/** The card in Waiting for you: each question, its options as buttons (the suggested one marked), your words. */
export function questionCard(q: Question, back: string): string {
  const items = itemsOf(q);
  const qs = items
    .map((it, i) => {
      const n = i + 1;
      const opts = it.options
        .map(
          (o, j) =>
            `<label class="qopt"><input type="${it.multi ? "checkbox" : "radio"}" name="o${n}" value="${j}"><span><b>${esc(o.label)}</b>${j === it.suggest ? `<em class="qsug">suggested</em>` : ""}${o.detail ? `<span class="qdet">${esc(o.detail)}</span>` : ""}</span></label>`,
        )
        .join("");
      return `<fieldset class="qitem"><legend><span class="qn">${n}</span>${esc(it.question)}</legend>
        ${it.context ? `<div class="qctx md">${md(it.context)}</div>` : ""}
        ${opts ? `<div class="qopts">${opts}</div>` : ""}
        <textarea name="t${n}" rows="${opts ? 1 : 2}" class="tkta" maxlength="${QLIMITS.answer}" placeholder="${opts ? "Or in your own words (optional)" : "Your answer"}"></textarea>
      </fieldset>`;
    })
    .join("");
  return `<article class="ask k-question" data-mid="y${q.id}">
    <header class="askwho"><span class="upic">${icon("message", 14)}</span><span class="askname">${esc(q.label)}</span><span class="askk">asks you</span></header>
    <p class="stkhead">${esc(q.title)}${q.url ? ` <a href="${esc(q.url)}" target="_blank" rel="noopener" class="qlink">${icon("arrow", 12)}open</a>` : ""}</p>
    <form method="post" action="/question/${q.id}" class="qform">${hidden({ back })}${qs}
      <div class="askact"><button class="btn primary sm">${icon("send", 13)}Send answers to ${esc(q.label)}</button></div>
    </form>
  </article>`;
}
