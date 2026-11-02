// Tickets that need their person's call before any work starts. An agent that triages a tracker (Jira, say) proposes
// how to handle each ticket: is it still valid, what's actually wrong, the plan, and the questions only its person can
// answer. The ticket itself comes along (description, comments, linked issues, images) and so do its MRs (files,
// commits, the diff), so it all reads in the dashboard without the tracker or the forge. The person asks follow-up
// questions, answers the agent's, and decides: go, go with changes (an edited plan), park or decline. The decision
// goes back to the agent as a YOUR USER message and into the project's decision log.

import { type Env, UserError, postMessage } from "./lib";
import { queuePush } from "./push";
import { logDecision } from "./records";

export const TICKET_OUTCOMES = { go: "Go", go_changes: "Go with changes", park: "Park", decline: "Decline" } as const;
export type TicketOutcome = keyof typeof TICKET_OUTCOMES;
const RECOMMEND = ["go", "park", "decline"] as const;

/** The card is short (a phone, between other things); the ticket's own text may be long, it's read in a view of its own. */
/** An option that is really an outcome (park it, decline, go ahead, don't do it). */
export const OUTCOME_LIKE = /\b(park(ed)?|declin(e|ed)|go ahead|(don't|do not|won't|will not) (do|fix|start)|skip (it|this|the ticket)|close (it|this|the ticket))\b/i;

export const TLIMITS = {
  key: 40,
  title: 200,
  verdict: 200,
  plan: 4000,
  size: 60,
  field: 80,
  description: 20_000,
  comments: 40,
  comment: 4000,
  links: 20,
  questions: 3,
  question: 300,
  options: 4,
  option: 120,
  mrs: 5,
  files: 200,
  commits: 50,
  diff: 300_000, // all the MRs' diffs together
  ask: 500,
  answer: 1500,
};

export interface TicketQuestion {
  question: string;
  options: string[];
}
export interface TicketMR {
  url: string;
  title: string;
  state: string;
  branch: string;
  target: string;
  pipeline: string;
  files: { path: string; added: number; removed: number }[];
  commits: { sha: string; title: string }[];
  diff: string;
}
export interface TicketData {
  fields: { status: string; priority: string; type: string; reporter: string; assignee: string; created: string; updated: string };
  description: string;
  comments: { author: string; at: string; body: string }[];
  links: { key: string; title: string; relation: string; status: string; url: string }[];
  plan: string;
  size: string;
  repos: string[];
  questions: TicketQuestion[];
  mrs: TicketMR[];
}

export interface Ticket {
  id: number;
  member: string;
  session_id: string;
  label: string;
  project: string | null;
  key: string;
  url: string;
  title: string;
  verdict: string;
  recommend: (typeof RECOMMEND)[number];
  data: string;
  status: "open" | "decided" | "withdrawn" | "replaced";
  decision: string | null;
  thread: string;
  created_at: number;
  decided_at: number | null;
  outcome: "" | "done" | "dropped"; // what became of it after the decision, as the agent reported
  outcome_at: number | null;
  outcome_note: string;
  outcome_mr: string;
  merged: number;
}

export interface TicketTurn {
  who: string; // "you", or the agent's label
  text: string;
  at: number;
}

export const dataOf = (t: Ticket): TicketData => {
  try {
    return JSON.parse(t.data) as TicketData;
  } catch {
    return { fields: { status: "", priority: "", type: "", reporter: "", assignee: "", created: "", updated: "" }, description: "", comments: [], links: [], plan: "", size: "", repos: [], questions: [], mrs: [] };
  }
};
export const ticketThread = (t: Ticket): TicketTurn[] => {
  try {
    return JSON.parse(t.thread || "[]") as TicketTurn[];
  } catch {
    return [];
  }
};

const text = (v: unknown, what: string, max: number, required = false): string => {
  const s = typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : typeof v === "number" ? String(v) : "";
  if (!s && required) throw new UserError(`The ticket needs ${what}.`);
  if (s.length > max) throw new UserError(`${what[0]!.toUpperCase()}${what.slice(1)} is ${s.length} characters; keep it under ${max}.`);
  return s;
};
const list = (v: unknown, what: string, max: number): Record<string, unknown>[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new UserError(`${what} must be a list.`);
  if (v.length > max) throw new UserError(`${v.length} ${what}; send at most ${max}.`);
  return v.map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}));
};
const link = (v: unknown, what: string, required = false): string => {
  const s = text(v, what, 600, required);
  if (s && !/^https?:\/\/\S+$/.test(s)) throw new UserError(`${what[0]!.toUpperCase()}${what.slice(1)} must be a web link (https://…).`);
  return s;
};
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

/** An MR as an agent sends it (with a ticket, or with a review): its link, state, branches, files, commits and diff. */
export function mrOf(m: Record<string, unknown>, what: string, urlRequired = true): TicketMR {
  return {
    url: link(m.url, `${what}'s link`, urlRequired),
    title: text(m.title, `${what}'s title`, TLIMITS.title),
    state: text(m.state, `${what}'s state`, TLIMITS.field),
    branch: text(m.branch, `${what}'s branch`, 200),
    target: text(m.target, `${what}'s target branch`, 200),
    pipeline: text(m.pipeline, `${what}'s pipeline`, TLIMITS.field),
    files: list(m.files, `files in ${what}`, TLIMITS.files).map((x) => ({ path: text(x.path, "a file's path", 400, true), added: count(x.added), removed: count(x.removed) })),
    commits: list(m.commits, `commits in ${what}`, TLIMITS.commits).map((x) => ({ sha: text(x.sha, "a commit's sha", 64, true), title: text(x.title, "a commit's title", 300) })),
    diff: typeof m.diff === "string" ? m.diff.replace(/\r\n?/g, "\n") : "",
  };
}

/** A ticket from an agent: an open one with the same key is kept (unless `replace`), so a loop's next run sends nothing new. */
export async function openTicket(env: Env, me: string, a: Record<string, unknown>): Promise<Ticket & { kept?: boolean }> {
  const s = env.session;
  if (!s?.label) throw new UserError("Tickets come from an agent session, so the decision has somewhere to go.");
  const key = text(a.key, "the ticket's key (e.g. SHOP-123)", TLIMITS.key, true);
  const url = link(a.url, "the ticket's link", true);
  const title = text(a.title, "the ticket's title", TLIMITS.title, true);
  const verdict = text(a.verdict, "a one-line verdict (still valid? what's actually wrong?)", TLIMITS.verdict, true);
  if (verdict.includes("\n")) throw new UserError("The verdict is one line.");
  const plan = text(a.plan, "the proposed plan", TLIMITS.plan, true);
  const recommend = String(a.recommend ?? "go") as Ticket["recommend"];
  if (!RECOMMEND.includes(recommend)) throw new UserError(`recommend must be one of: ${RECOMMEND.join(", ")}.`);
  const f = (a.fields && typeof a.fields === "object" ? a.fields : {}) as Record<string, unknown>;
  const fields = {
    status: text(f.status, "fields.status", TLIMITS.field),
    priority: text(f.priority, "fields.priority", TLIMITS.field),
    type: text(f.type, "fields.type", TLIMITS.field),
    reporter: text(f.reporter, "fields.reporter", TLIMITS.field),
    assignee: text(f.assignee, "fields.assignee", TLIMITS.field),
    created: text(f.created, "fields.created", TLIMITS.field),
    updated: text(f.updated, "fields.updated", TLIMITS.field),
  };
  const comments = list(a.comments, "comments", TLIMITS.comments).map((c, i) => ({
    author: text(c.author, `comment ${i + 1}'s author`, TLIMITS.field),
    at: text(c.at, `comment ${i + 1}'s date`, TLIMITS.field),
    body: text(c.body, `comment ${i + 1}`, TLIMITS.comment, true),
  }));
  const links = list(a.links, "linked issues", TLIMITS.links).map((l, i) => ({
    key: text(l.key, `linked issue ${i + 1}'s key`, TLIMITS.key, true),
    title: text(l.title, `linked issue ${i + 1}'s title`, TLIMITS.title),
    relation: text(l.relation, `linked issue ${i + 1}'s relation`, TLIMITS.field),
    status: text(l.status, `linked issue ${i + 1}'s status`, TLIMITS.field),
    url: link(l.url, `linked issue ${i + 1}'s link`),
  }));
  const questions = list(a.questions, "questions", TLIMITS.questions).map((q, i) => ({
    question: text(q.question, `question ${i + 1}`, TLIMITS.question, true),
    options: (Array.isArray(q.options) ? q.options : []).slice(0, TLIMITS.options).map((o, j) => text(o, `question ${i + 1}'s option ${j + 1}`, TLIMITS.option, true)),
  }));
  // Whether to do the ticket at all is the decision itself, always there to pick (Go, Go with changes, Park, Decline):
  // a question offering it too would ask the same thing twice.
  for (const [i, q] of questions.entries()) {
    const o = q.options.find((x) => OUTCOME_LIKE.test(x));
    if (o) throw new UserError(`Question ${i + 1} offers "${o}", but whether to do the ticket is the decision itself: your user always picks Go, Go with changes, Park or Decline. Ask only about how to do it (scope, approach, who to tell), or drop the question.`);
  }
  let diffs = 0;
  const mrs = list(a.mrs, "MRs", TLIMITS.mrs).map((m, i) => {
    const mr = mrOf(m, `MR ${i + 1}`);
    diffs += mr.diff.length;
    if (diffs > TLIMITS.diff) throw new UserError(`The MRs' diffs are over ${TLIMITS.diff} characters together; send the diff of the files that matter (files still lists them all).`);
    return mr;
  });
  const data: TicketData = {
    fields,
    description: text(a.description, "the description", TLIMITS.description),
    comments,
    links,
    plan,
    size: text(a.size, "the size", TLIMITS.size),
    repos: (Array.isArray(a.repos) ? a.repos : []).slice(0, 10).map((r) => text(r, "a repo", 200)).filter(Boolean),
    questions,
    mrs,
  };
  if (a.replace !== true) {
    const same = await env.DB.prepare("SELECT * FROM tickets WHERE member = ? AND key = ? AND status = 'open' ORDER BY id DESC LIMIT 1").bind(me, key).first<Ticket>();
    if (same) return { ...same, kept: true };
  }
  await env.DB.prepare("UPDATE tickets SET status = 'replaced', decided_at = ? WHERE member = ? AND key = ? AND status = 'open'").bind(Date.now(), me, key).run();
  const row = await env.DB.prepare(
    `INSERT INTO tickets (member, session_id, label, project, key, url, title, verdict, recommend, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(me, s.session_id, s.label, s.project || null, key, url, title, verdict, recommend, JSON.stringify(data), Date.now())
    .first<Ticket>();
  env.refreshWeb?.(me);
  await queuePush(env, me, `t${row!.id}`);
  return row!;
}

export async function withdrawTicket(env: Env, me: string, id: number): Promise<string> {
  const res = await env.DB.prepare("UPDATE tickets SET status = 'withdrawn', decided_at = ? WHERE id = ? AND member = ? AND status = 'open'").bind(Date.now(), id, me).run();
  if (!res.meta.changes) throw new UserError(`No open ticket card T${id}.`);
  env.refreshWeb?.(me);
  return `Withdrew T${id}; it's off your user's dashboard.`;
}

export async function pendingTickets(env: Env, me: string): Promise<Ticket[]> {
  const { results } = await env.DB.prepare("SELECT * FROM tickets WHERE member = ? AND status = 'open' ORDER BY id").bind(me).all<Ticket>();
  return results;
}

export async function getTicket(env: Env, me: string, id: number): Promise<Ticket | null> {
  return env.DB.prepare("SELECT * FROM tickets WHERE id = ? AND member = ?").bind(id, me).first<Ticket>();
}

async function openOne(env: Env, me: string, id: number): Promise<Ticket> {
  const t = await getTicket(env, me, id);
  if (!t) throw new UserError(`No ticket card T${id}.`);
  if (t.status !== "open") throw new UserError(`T${id} is ${t.status === "decided" ? "already decided" : "closed"}.`);
  return t;
}

export interface TicketDecision {
  outcome: TicketOutcome;
  plan: string; // the edited plan, for go_changes
  answers: string[];
  note: string;
}

/** The person's call: sent to the agent as YOUR USER, and logged. */
export async function decideTicket(env: Env, me: string, id: number, d: TicketDecision): Promise<string> {
  const t = await getTicket(env, me, id);
  if (!t) throw new UserError("No such ticket.");
  if (t.status !== "open") throw new UserError(t.status === "decided" ? "You already decided this ticket." : "The agent withdrew or replaced this ticket.");
  if (!(d.outcome in TICKET_OUTCOMES)) throw new UserError("Pick an outcome.");
  const data = dataOf(t);
  const edited = d.outcome === "go_changes" && d.plan.trim() && d.plan.trim() !== data.plan.trim() ? d.plan.trim() : "";
  if (d.outcome === "go_changes" && !edited && !d.note) throw new UserError("Say what to change: edit the plan or add a note.");
  const answers = data.questions.map((q, i) => (d.answers[i]?.trim() ? `${i + 1}. ${q.question}\n   ${d.answers[i]!.trim().replace(/\n/g, "\n   ")}` : "")).filter(Boolean);
  const body = [
    `Ticket T${t.id} ${t.key} (${t.title}): ${TICKET_OUTCOMES[d.outcome]}.`,
    d.outcome === "go" ? "Start as you proposed." : "",
    edited ? `Use this plan instead of yours:\n${edited.replace(/^/gm, "> ")}` : d.outcome === "go_changes" ? "Keep your plan, with the change in the note." : "",
    d.outcome === "park" ? "Don't start it; leave the ticket as it is for now." : "",
    d.outcome === "decline" ? "Won't do: don't start it." : "",
    answers.length ? `My answers to your questions:\n${answers.join("\n")}` : "",
    d.note ? `${d.outcome === "decline" ? "Reason" : "Note"}: ${d.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const res = await env.DB.prepare("UPDATE tickets SET status = 'decided', decision = ?, decided_at = ? WHERE id = ? AND status = 'open'").bind(JSON.stringify({ ...d, plan: edited }), Date.now(), id).run();
  if (!res.meta.changes) throw new UserError("This ticket was just closed.");
  await postMessage(env, { channel: t.project || "dm", sender: me, recipient: me, recipient_agent: t.label, body });
  if (t.project) {
    await logDecision(env, me, {
      project: t.project,
      subject: `ticket ${t.key}: ${t.title}`.slice(0, 200),
      verdict: d.outcome === "go" || d.outcome === "go_changes" ? "approved" : d.outcome === "park" ? "held" : "rejected",
      reason: `${TICKET_OUTCOMES[d.outcome]}${edited ? "; plan edited" : ""}${d.note ? `; ${d.note}` : ""}`.slice(0, 1000),
      refs: t.url,
    }).catch(() => undefined);
  }
  env.refreshWeb?.(me);
  return `Sent to ${t.label}: ${TICKET_OUTCOMES[d.outcome]}`;
}

async function addTurn(env: Env, t: Ticket, turn: TicketTurn): Promise<void> {
  const thread = [...ticketThread(t), turn].slice(-40);
  await env.DB.prepare("UPDATE tickets SET thread = ? WHERE id = ?").bind(JSON.stringify(thread), t.id).run();
}

/** Your question about a ticket: to the agent as YOUR USER; its answer lands in the ticket's view. */
export async function askTicket(env: Env, me: string, id: number, q: string): Promise<string> {
  const t = await openOne(env, me, id);
  const question = q.replace(/\r\n?/g, "\n").trim().slice(0, TLIMITS.ask);
  if (!question) throw new UserError("Type your question.");
  await addTurn(env, t, { who: "you", text: question, at: Date.now() });
  await postMessage(env, {
    channel: t.project || "dm",
    sender: me,
    recipient: me,
    recipient_agent: t.label,
    body: `About ticket T${t.id} ${t.key} (${t.title}): ${question}
Answer with the ticket tool (action "answer", id ${t.id}), in at most ${TLIMITS.answer} characters; it shows in the ticket's view. Don't start the work until the decision comes.`,
  });
  env.refreshWeb?.(me);
  return `Asked ${t.label}`;
}

/** The agent's answer, shown in the ticket's view (and sent to the phone). */
export async function answerTicket(env: Env, me: string, id: number, answer: string): Promise<string> {
  const t = await openOne(env, me, id);
  const a = answer.replace(/\r\n?/g, "\n").trim();
  if (!a) throw new UserError("The answer is empty.");
  if (a.length > TLIMITS.answer) throw new UserError(`The answer is ${a.length} characters; keep it under ${TLIMITS.answer}.`);
  await addTurn(env, t, { who: env.session?.label || t.label, text: a, at: Date.now() });
  env.refreshWeb?.(me);
  await queuePush(env, me, `k${t.id}`, 0, a);
  return `Your answer is in T${id}'s view. Wait for the decision before starting.`;
}

/** The agent reports what became of a ticket you said go to: done (its MR, merged or not, a line on the result) or dropped. */
export async function finishTicket(env: Env, me: string, id: number, a: { outcome: "done" | "dropped"; mr: string; merged: boolean; text: string }): Promise<string> {
  const t = await env.DB.prepare("SELECT * FROM tickets WHERE id = ? AND member = ?").bind(id, me).first<Ticket>();
  if (!t) throw new UserError(`No ticket T${id}.`);
  if (t.status !== "decided") throw new UserError(t.status === "open" ? `T${id} isn't decided yet: wait for your user's decision.` : `T${id} was ${t.status}; nothing to report.`);
  const dec = t.decision ? (JSON.parse(t.decision) as TicketDecision) : null;
  if (dec && dec.outcome !== "go" && dec.outcome !== "go_changes") throw new UserError(`Your user decided ${TICKET_OUTCOMES[dec.outcome]} for T${id}: there's no work to report.`);
  const note = a.text.trim().replace(/\s*\n\s*/g, " ");
  if (!note) throw new UserError(a.outcome === "done" ? "Say in a line what was done." : "Say in a line why it was dropped.");
  if (note.length > 300) throw new UserError(`The note is ${note.length} characters; keep it to a line (under 300).`);
  const mr = a.mr.trim();
  if (mr && !/^https?:\/\/\S+$/.test(mr)) throw new UserError("mr must be the MR's (or PR's) web link.");
  await env.DB.prepare("UPDATE tickets SET outcome = ?, outcome_at = ?, outcome_note = ?, outcome_mr = ?, merged = ? WHERE id = ?")
    .bind(a.outcome, Date.now(), note, mr, a.merged ? 1 : 0, id)
    .run();
  env.refreshWeb?.(me);
  return `T${id} (${t.key}) is marked ${a.outcome === "done" ? `done${a.merged ? ", merged" : ""}` : "dropped"} in your user's work log.${a.outcome === "done" && !a.merged && mr ? ' When the MR merges, report it again with merged: true.' : ""}`;
}
