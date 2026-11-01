// Reviews that need their person's call. An agent reviewing an MR handles the mechanical part itself (nits, approvals
// with nothing important); what it may not post alone (a security or data-loss problem, a break for clients, a design
// trade-off, anything it isn't sure of) it sends here, briefly. The dashboard shows it as a card in "Waiting for you":
// post or drop each finding (its comment editable), pick the outcome, add a note. The decision goes back to the agent
// as a YOUR USER message and into the project's decision log. The agent doesn't wait meanwhile; it just doesn't act.

import { type Env, GONE_MS, UserError, liveIds, postMessage } from "./lib";
import { logDecision } from "./records";

export const OUTCOMES = { approve: "Approve", approve_after: "Approve once fixed", request_changes: "Request changes", hold: "Hold" } as const;
export type Outcome = keyof typeof OUTCOMES;
export const SEVERITIES = ["blocker", "important", "question"] as const;

/** Short on purpose: the card is read on a phone, between other things. */
export const LIMITS = { title: 100, verdict: 160, summary: 220, comment: 1200, findings: 5, ask: 500, answer: 400 };

export interface Finding {
  severity: (typeof SEVERITIES)[number];
  summary: string;
  comment: string;
  post: boolean; // what the agent recommends
}

export interface Review {
  id: number;
  member: string;
  session_id: string;
  label: string;
  project: string | null;
  url: string;
  title: string;
  verdict: string;
  recommend: Outcome;
  findings: string;
  head: string;
  status: "open" | "decided" | "withdrawn" | "replaced";
  decision: string | null;
  thread: string;
  created_at: number;
  decided_at: number | null;
}

export const findingsOf = (r: Review): Finding[] => {
  try {
    return JSON.parse(r.findings) as Finding[];
  } catch {
    return [];
  }
};

function short(v: unknown, what: string, max: number, required = true): string {
  const s = typeof v === "string" ? v.trim().replace(/\s+\n/g, "\n") : "";
  if (!s && required) throw new UserError(`The review needs ${what}.`);
  if (s.length > max) throw new UserError(`${what[0]!.toUpperCase()}${what.slice(1)} is ${s.length} characters; keep it under ${max}. Your user decides from this on a phone: only what the decision needs, no background.`);
  return s;
}

/** A review from an agent; any open review of the same MR by that agent is replaced. */
export async function openReview(env: Env, me: string, a: Record<string, unknown>): Promise<Review> {
  const s = env.session;
  if (!s?.label) throw new UserError("Reviews come from an agent session, so the decision has somewhere to go.");
  const url = short(a.url, "the MR's link", 400);
  if (!/^https?:\/\/\S+$/.test(url)) throw new UserError("url must be the MR's (or PR's) web link.");
  const title = short(a.title, "a title (the MR's)", LIMITS.title);
  const verdict = short(a.verdict, "a one-line verdict", LIMITS.verdict);
  if (verdict.includes("\n")) throw new UserError("The verdict is one line.");
  const recommend = String(a.recommend ?? "") as Outcome;
  if (!(recommend in OUTCOMES)) throw new UserError(`recommend must be one of: ${Object.keys(OUTCOMES).join(", ")}.`);
  const raw = Array.isArray(a.findings) ? (a.findings as Record<string, unknown>[]) : [];
  if (!raw.length) throw new UserError("No findings for your user to decide on: act on the review yourself (approve, or post nits as a non-blocking note).");
  if (raw.length > LIMITS.findings) throw new UserError(`${raw.length} findings; send at most ${LIMITS.findings}, the ones that need your user's call. Handle nits and mechanical fixes yourself.`);
  const findings: Finding[] = raw.map((f, i) => {
    const severity = String(f?.severity ?? "important") as Finding["severity"];
    if (!SEVERITIES.includes(severity)) throw new UserError(`Finding ${i + 1}: severity must be one of ${SEVERITIES.join(", ")}.`);
    return {
      severity,
      summary: short(f?.summary, `finding ${i + 1}'s summary`, LIMITS.summary),
      comment: short(f?.comment, `finding ${i + 1}'s comment`, LIMITS.comment, false),
      post: f?.post !== false,
    };
  });
  const head = typeof a.head === "string" ? a.head.trim().slice(0, 64) : "";
  await env.DB.prepare("UPDATE reviews SET status = 'replaced', decided_at = ? WHERE member = ? AND label = ? AND url = ? AND status = 'open'").bind(Date.now(), me, s.label, url).run();
  const row = await env.DB.prepare(
    `INSERT INTO reviews (member, session_id, label, project, url, title, verdict, recommend, findings, head, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(me, s.session_id, s.label, s.project || null, url, title, verdict, recommend, JSON.stringify(findings), head, Date.now())
    .first<Review>();
  env.refreshWeb?.(me);
  return row!;
}

export async function withdrawReview(env: Env, me: string, id: number): Promise<string> {
  const res = await env.DB.prepare("UPDATE reviews SET status = 'withdrawn', decided_at = ? WHERE id = ? AND member = ? AND status = 'open'").bind(Date.now(), id, me).run();
  if (!res.meta.changes) throw new UserError(`No open review R${id}.`);
  env.refreshWeb?.(me);
  return `Withdrew R${id}; it's off your user's dashboard.`;
}

export async function pendingReviews(env: Env, me: string): Promise<Review[]> {
  const { results } = await env.DB.prepare("SELECT * FROM reviews WHERE member = ? AND status = 'open' ORDER BY id").bind(me).all<Review>();
  return results;
}

export interface ReviewDecision {
  outcome: Outcome;
  findings: { post: boolean; comment: string; edited: boolean }[];
  note: string;
}

/** The person's call: sent to the agent as YOUR USER, and logged. */
export async function decideReview(env: Env, me: string, id: number, d: ReviewDecision): Promise<string> {
  const r = await env.DB.prepare("SELECT * FROM reviews WHERE id = ? AND member = ?").bind(id, me).first<Review>();
  if (!r) throw new UserError("No such review.");
  if (r.status !== "open") throw new UserError(r.status === "decided" ? "You already decided this review." : "The agent withdrew or replaced this review.");
  if (!(d.outcome in OUTCOMES)) throw new UserError("Pick an outcome.");
  const fs = findingsOf(r);
  const lines = fs.map((f, i) => {
    const c = d.findings[i] ?? { post: f.post, comment: f.comment, edited: false };
    if (!c.post) return `${i + 1}. Drop: ${f.summary}`;
    return `${i + 1}. Post: ${f.summary}${c.edited ? `\n   Post this comment instead of yours:\n${c.comment.replace(/^/gm, "   > ")}` : f.comment ? " (your comment as written)" : ""}`;
  });
  const body = [
    `Review R${r.id} of ${r.url} (${r.title}): ${OUTCOMES[d.outcome]}.`,
    ...lines,
    ...(d.note ? [`Note: ${d.note}`] : []),
    r.head ? `You reviewed ${r.head}; if the MR has moved since, check the new commits before acting.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const res = await env.DB.prepare("UPDATE reviews SET status = 'decided', decision = ?, decided_at = ? WHERE id = ? AND status = 'open'").bind(JSON.stringify(d), Date.now(), id).run();
  if (!res.meta.changes) throw new UserError("This review was just closed.");
  await postMessage(env, { channel: r.project || "dm", sender: me, recipient: me, recipient_agent: r.label, body });
  if (r.project) {
    const posted = fs.filter((_, i) => d.findings[i]?.post ?? fs[i]!.post).map((f) => f.summary);
    await logDecision(env, me, {
      project: r.project,
      subject: `review of ${r.title}`.slice(0, 200),
      verdict: d.outcome === "approve" || d.outcome === "approve_after" ? "approved" : "held",
      reason: `${OUTCOMES[d.outcome]}${posted.length ? `; posted: ${posted.join(" | ")}` : ""}${d.note ? `; note: ${d.note}` : ""}`,
      refs: r.url,
    }).catch(() => undefined);
  }
  env.refreshWeb?.(me);
  return `Sent to ${r.label}: ${OUTCOMES[d.outcome]}`;
}

// ---- follow-up questions, and moving a review to another agent ----

export interface Turn {
  who: string; // "you", or the agent's label
  finding: number; // 1-based; 0 = the review as a whole
  text: string;
  at: number;
}

export const threadOf = (r: Review): Turn[] => {
  try {
    return JSON.parse(r.thread || "[]") as Turn[];
  } catch {
    return [];
  }
};

async function openOne(env: Env, me: string, id: number): Promise<Review> {
  const r = await env.DB.prepare("SELECT * FROM reviews WHERE id = ? AND member = ?").bind(id, me).first<Review>();
  if (!r) throw new UserError(`No review R${id}.`);
  if (r.status !== "open") throw new UserError(`R${id} is ${r.status === "decided" ? "already decided" : "closed"}.`);
  return r;
}

async function addTurn(env: Env, r: Review, t: Turn): Promise<void> {
  const thread = [...threadOf(r), t].slice(-20);
  await env.DB.prepare("UPDATE reviews SET thread = ? WHERE id = ?").bind(JSON.stringify(thread), r.id).run();
}

const about = (r: Review, finding: number) => (finding ? `finding ${finding} (${findingsOf(r)[finding - 1]?.summary ?? ""})` : "the review as a whole");

/** Your question about a review (or one finding): to the agent as YOUR USER; its answer lands on the card. */
export async function askReview(env: Env, me: string, id: number, finding: number, text: string): Promise<string> {
  const r = await openOne(env, me, id);
  const q = text.trim().slice(0, LIMITS.ask);
  if (!q) throw new UserError("Type your question.");
  const n = finding >= 1 && finding <= findingsOf(r).length ? finding : 0;
  await addTurn(env, r, { who: "you", finding: n, text: q, at: Date.now() });
  await postMessage(env, {
    channel: r.project || "dm",
    sender: me,
    recipient: me,
    recipient_agent: r.label,
    body: `About review R${r.id} (${r.title}), ${about(r, n)}: ${q}
Answer with the review tool (action "answer", id ${r.id}${n ? `, finding ${n}` : ""}), in at most ${LIMITS.answer} characters; it shows on the card. Keep holding off on the MR until the decision comes.`,
  });
  env.refreshWeb?.(me);
  return `Asked ${r.label}`;
}

/** The agent's answer, shown on the card. */
export async function answerReview(env: Env, me: string, id: number, finding: number, text: string): Promise<string> {
  const r = await openOne(env, me, id);
  const a = text.trim();
  if (!a) throw new UserError("The answer is empty.");
  if (a.length > LIMITS.answer) throw new UserError(`The answer is ${a.length} characters; keep it under ${LIMITS.answer}. Just what the decision needs.`);
  if (finding && !findingsOf(r)[finding - 1]) throw new UserError(`R${id} has no finding ${finding}.`);
  // To revise the findings themselves, send the review again (it replaces this one).
  await addTurn(env, r, { who: env.session?.label || r.label, finding: finding || 0, text: a, at: Date.now() });
  env.refreshWeb?.(me);
  return `Your answer is on R${id}'s card. Wait for the decision before acting on the MR.`;
}

/** Whether the agent that owns the review is still around. */
export function agentOnline(env: Env, r: Review, sessions: { label: string; session_id: string; last_seen: number }[]): boolean {
  const live = new Set(liveIds(env, r.member));
  return sessions.some((s) => s.label === r.label && (live.has(s.session_id) || Date.now() - s.last_seen < GONE_MS));
}

/** Your agents that are around now (by name), to move a review to. */
export async function onlineAgents(env: Env, me: string): Promise<{ label: string; session_id: string; last_seen: number; project: string | null }[]> {
  const { results } = await env.DB.prepare("SELECT label, session_id, last_seen, project FROM sessions WHERE member = ? AND label IS NOT NULL AND label != '' ORDER BY last_seen DESC LIMIT 200")
    .bind(me)
    .all<{ label: string; session_id: string; last_seen: number; project: string | null }>();
  const live = new Set(liveIds(env, me));
  return results.filter((s) => live.has(s.session_id) || Date.now() - s.last_seen < GONE_MS);
}

/** A review whose agent is gone, handed to another of your agents with everything it needs to carry on. */
export async function moveReview(env: Env, me: string, id: number, to: string): Promise<string> {
  const r = await openOne(env, me, id);
  const target = (await onlineAgents(env, me)).find((s) => s.label === to);
  if (!target) throw new UserError(`${to} isn't connected right now.`);
  if (target.label === r.label) throw new UserError(`R${id} is already ${to}'s.`);
  await env.DB.prepare("UPDATE reviews SET label = ?, session_id = ? WHERE id = ?").bind(target.label, target.session_id, id).run();
  const fs = findingsOf(r);
  const turns = threadOf(r);
  const body = [
    `You take over review R${r.id} from ${r.label}, which is gone: ${r.url} (${r.title})${r.head ? `, reviewed at ${r.head}` : ""}.`,
    `${r.label}'s verdict: ${r.verdict} Recommended: ${OUTCOMES[r.recommend]}.`,
    ...fs.map((f, i) => `${i + 1}. [${f.severity}] ${f.summary}${f.comment ? `\n   Proposed comment:\n${f.comment.replace(/^/gm, "   > ")}` : ""}`),
    ...(turns.length ? ["Questions and answers so far:", ...turns.map((t) => `- ${t.who === "you" ? "Me" : t.who}${t.finding ? ` (finding ${t.finding})` : ""}: ${t.text}`)] : []),
    "Check the findings against the MR yourself. Don't post them or approve until my decision comes (a message about R" + r.id + "); answer questions with the review tool (action \"answer\").",
  ].join("\n");
  await postMessage(env, { channel: r.project || target.project || "dm", sender: me, recipient: me, recipient_agent: target.label, body });
  env.refreshWeb?.(me);
  return `Moved R${id} to ${target.label}`;
}
