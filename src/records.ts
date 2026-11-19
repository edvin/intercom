// Project records that outlive a chat thread: the decision log (calls made, looked up before re-proposing work),
// handoffs (a commit or branch handed to another agent, with evidence, gates and what became of it), and the
// crew's roles (who integrates, who pushes), shown with the project's rules.
import { type Env, UserError, address, ago, postMessage } from "./lib";

export const VERDICTS = ["approved", "rejected", "held", "noted"] as const;
export const HANDOFF_STATES = ["pending", "integrated", "held", "rejected", "withdrawn"] as const;
export const OPEN_HANDOFF = ["pending", "held"];

export interface Decision {
  id: number;
  project: string;
  author: string;
  author_agent: string | null;
  subject: string;
  verdict: string;
  reason: string;
  refs: string;
  handoff_id: number | null;
  superseded_by: number | null;
  created_at: number;
}

export interface Handoff {
  id: number;
  project: string;
  author: string;
  author_agent: string | null;
  to_member: string | null;
  to_agent: string | null;
  ref: string;
  summary: string;
  evidence: string;
  gates: string;
  status: string;
  result: string;
  note: string;
  updated_by: string | null;
  created_at: number;
  updated_at: number;
  /** JSON: Obligation[] (the receiver's checklist). */
  obligations: string;
  /** JSON: Gate[] (older handoffs have their gates as text in `gates`). */
  gate_list: string;
}

/** Something the receiver must do or keep to, ticked off when it records the outcome. */
export interface Obligation {
  text: string;
  state: "open" | "done" | "na" | "waived";
  note: string;
  by?: string;
  at?: number;
}
export const TICKS = ["done", "na", "waived"] as const;

/** A gate the sender ran, and how it came out. */
export interface Gate {
  name: string;
  result: "passed" | "failed" | "not run";
  detail: string;
}

export const MAX_OBLIGATIONS = 12;
const MAX_GATES = 20;

const parsed = <T>(json: string | null | undefined): T[] => {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
export const obligationsOf = (h: Pick<Handoff, "obligations">): Obligation[] => parsed<Obligation>(h.obligations);
export const gatesOf = (h: Pick<Handoff, "gate_list">): Gate[] => parsed<Gate>(h.gate_list);

/** The obligations a handoff is given, one short line each. */
export function readObligations(raw: unknown): Obligation[] {
  if (raw === undefined || raw === null || raw === "") return [];
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.some((o) => typeof o !== "string")) throw new UserError("obligations is a list of short texts, one thing the receiver must do or keep to each.");
  const out = (list as string[]).map((o) => o.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (out.length > MAX_OBLIGATIONS) throw new UserError(`At most ${MAX_OBLIGATIONS} obligations: merge the small ones, or put the detail in the summary.`);
  const long = out.find((o) => o.length > 300);
  if (long) throw new UserError(`An obligation is one requirement in up to 300 characters: "${long.slice(0, 60)}…" is ${long.length}. Split it, or move the background to the summary.`);
  return out.map((text) => ({ text, state: "open", note: "" }));
}

const RESULTS: Record<string, Gate["result"]> = {
  passed: "passed", pass: "passed", green: "passed", ok: "passed", success: "passed",
  failed: "failed", fail: "failed", red: "failed", error: "failed",
  "not run": "not run", "not-run": "not run", skipped: "not run", skip: "not run", "n/a": "not run",
};

/** The gates a handoff is given: a list with a result each, or (older agents) one text. */
export function readGates(raw: unknown): { list: Gate[]; text: string } {
  if (raw === undefined || raw === null || raw === "") return { list: [], text: "" };
  if (typeof raw === "string") return { list: [], text: raw.trim().slice(0, 1000) };
  if (!Array.isArray(raw)) throw new UserError('gates is a list: [{"name": "unit", "result": "passed"}, …].');
  if (raw.length > MAX_GATES) throw new UserError(`At most ${MAX_GATES} gates.`);
  const list = raw.map((g): Gate => {
    if (!g || typeof g !== "object" || typeof (g as Gate).name !== "string" || !(g as Gate).name.trim())
      throw new UserError('Each gate has a name and a result, e.g. {"name": "unit", "result": "passed"}.');
    const result = RESULTS[String((g as Gate).result ?? "").trim().toLowerCase()];
    if (!result) throw new UserError(`Gate "${(g as Gate).name.trim().slice(0, 60)}": result is passed, failed or not run.`);
    const detail = typeof (g as Gate).detail === "string" ? (g as Gate).detail.trim().slice(0, 300) : "";
    return { name: (g as Gate).name.trim().slice(0, 120), result, detail };
  });
  return { list, text: "" };
}

/** "unit passed · e2e FAILED (login flaky) · corpus not run" */
export function fmtGates(h: Pick<Handoff, "gates" | "gate_list">): string {
  const list = gatesOf(h);
  if (!list.length) return h.gates;
  return list.map((g) => `${g.name} ${g.result === "failed" ? "FAILED" : g.result}${g.detail ? ` (${g.detail})` : ""}`).join(" · ");
}

const MARK: Record<Obligation["state"], string> = { open: "[ ]", done: "[x]", na: "[n/a]", waived: "[waived]" };

/** The checklist, one line each: "  [x] 2. Re-run the gallery on the merged tip — 15/15 clean". */
export function fmtObligations(list: Obligation[], indent = "    "): string {
  return list.map((o, i) => `${indent}${MARK[o.state] ?? "[ ]"} ${i + 1}. ${o.text}${o.note ? ` — ${o.note}` : ""}`).join("\n");
}

/** The receiver's ticks, merged into the checklist: [{n: 2, state: "done", note: "…"}]. */
export function applyTicks(list: Obligation[], raw: unknown, by: string): Obligation[] {
  if (raw === undefined || raw === null) return list;
  if (!Array.isArray(raw)) throw new UserError('obligations is a list of ticks: [{"n": 1, "state": "done", "note": "what you did"}].');
  const out = list.map((o) => ({ ...o }));
  for (const t of raw as { n?: unknown; state?: unknown; note?: unknown }[]) {
    const n = Number(t?.n);
    if (!Number.isInteger(n) || n < 1 || n > out.length)
      throw new UserError(out.length ? `No obligation ${String(t?.n)}: this handoff has ${out.length} (1–${out.length}).` : "This handoff has no obligations to tick.");
    const state = String(t.state ?? "").trim().toLowerCase().replace("n/a", "na");
    if (!(TICKS as readonly string[]).includes(state)) throw new UserError(`Obligation ${n}: state is done, na (doesn't apply) or waived.`);
    const note = typeof t.note === "string" ? t.note.trim().slice(0, 300) : "";
    if (state === "waived" && !note) throw new UserError(`Obligation ${n} is waived: say why in its note.`);
    out[n - 1] = { ...out[n - 1]!, state: state as Obligation["state"], note, by, at: Date.now() };
  }
  return out;
}

const MEMBER_PROJECTS = "project IN (SELECT project FROM project_members WHERE member = ?)";

/** "D12 [#loxodon] rejected · candidate 5df5034 — regression on unshared += · refs 5df5034 · edvin/core, 2d ago" */
export function fmtDecision(d: Decision, withProject = true): string {
  return [
    `D${d.id}${withProject ? ` [#${d.project}]` : ""} ${d.verdict.toUpperCase()} · ${d.subject}${d.reason ? ` — ${d.reason}` : ""}`,
    d.refs ? `refs ${d.refs}` : "",
    d.handoff_id ? `from handoff H${d.handoff_id}` : "",
    `${address(d.author, d.author_agent)}, ${ago(d.created_at)}`,
    d.superseded_by ? `superseded by D${d.superseded_by}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A handoff on one line, then its evidence, gates and the receiver's checklist indented. */
export function fmtHandoff(h: Handoff, withProject = true): string {
  const to = h.to_member ? ` → ${address(h.to_member, h.to_agent)}` : "";
  const state = `${h.status.toUpperCase()}${h.status === "integrated" && h.result ? ` as ${h.result}` : ""}`;
  const gates = fmtGates(h);
  const obligations = obligationsOf(h);
  return [
    `H${h.id}${withProject ? ` [#${h.project}]` : ""} ${state} · ${h.ref} — ${h.summary} · ${address(h.author, h.author_agent)}${to}, ${ago(h.created_at)}`,
    h.evidence ? `    evidence: ${h.evidence}` : "",
    gates ? `    gates: ${gates}` : "",
    obligations.length ? `    obligations:\n${fmtObligations(obligations, "      ")}` : "",
    h.note ? `    note${h.updated_by ? ` (${h.updated_by})` : ""}: ${h.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function logDecision(
  env: Env,
  me: string,
  d: { project: string; subject: string; verdict: string; reason?: string; refs?: string; handoff_id?: number | null; supersedes?: number | null },
): Promise<Decision> {
  if (!(VERDICTS as readonly string[]).includes(d.verdict)) throw new UserError(`verdict must be one of: ${VERDICTS.join(", ")}`);
  const subject = d.subject.trim().slice(0, 200);
  if (!subject) throw new UserError("A decision needs a subject, e.g. \"candidate 5df5034\".");
  if (d.supersedes) {
    const old = await env.DB.prepare("SELECT id FROM decisions WHERE id = ? AND project = ?").bind(d.supersedes, d.project).first();
    if (!old) throw new UserError(`No decision D${d.supersedes} in #${d.project}.`);
  }
  const row = await env.DB.prepare(
    `INSERT INTO decisions (project, author, author_agent, subject, verdict, reason, refs, handoff_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(d.project, me, env.session?.label ?? null, subject, d.verdict, (d.reason ?? "").trim().slice(0, 1000), (d.refs ?? "").trim().slice(0, 400), d.handoff_id ?? null, Date.now())
    .first<Decision>();
  if (d.supersedes) await env.DB.prepare("UPDATE decisions SET superseded_by = ? WHERE id = ?").bind(row!.id, d.supersedes).run();
  await postMessage(env, {
    channel: d.project,
    sender: me,
    kind: "event",
    body: `logged decision D${row!.id}: ${d.verdict} — ${subject}${row!.reason ? ` (${row!.reason.split("\n")[0]!.slice(0, 160)})` : ""}${d.supersedes ? `, replacing D${d.supersedes}` : ""}`,
  });
  return row!;
}

/** Decisions in `me`'s projects, newest first; every word of `query` must appear in the subject, reason or refs. */
export async function findDecisions(env: Env, me: string, opts: { project?: string | null; query?: string | null; verdict?: string | null; limit?: number; current?: boolean }): Promise<Decision[]> {
  const where = [MEMBER_PROJECTS];
  const binds: unknown[] = [me];
  if (opts.project) {
    where.push("project = ?");
    binds.push(opts.project);
  }
  if (opts.verdict) {
    where.push("verdict = ?");
    binds.push(opts.verdict);
  }
  if (opts.current) where.push("superseded_by IS NULL");
  for (const word of (opts.query ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8)) {
    where.push("lower(subject || ' ' || reason || ' ' || refs) LIKE ? ESCAPE '\\'");
    binds.push(`%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  const { results } = await env.DB.prepare(`SELECT * FROM decisions WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?`)
    .bind(...binds, opts.limit ?? 20)
    .all<Decision>();
  return results;
}

/** One decision by id, in any of your projects. */
export async function decisionById(env: Env, me: string, id: number): Promise<Decision | null> {
  return env.DB.prepare(`SELECT * FROM decisions WHERE ${MEMBER_PROJECTS} AND id = ?`).bind(me, id).first<Decision>();
}

export async function createHandoff(
  env: Env,
  me: string,
  h: { project: string; ref: string; summary: string; evidence?: string; gates?: unknown; obligations?: unknown; to_member?: string | null; to_agent?: string | null },
): Promise<Handoff> {
  const now = Date.now();
  const gates = readGates(h.gates);
  const obligations = readObligations(h.obligations);
  const row = await env.DB.prepare(
    `INSERT INTO handoffs (project, author, author_agent, to_member, to_agent, ref, summary, evidence, gates, gate_list, obligations, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      h.project,
      me,
      env.session?.label ?? null,
      h.to_member ?? null,
      h.to_agent ?? null,
      h.ref.trim().slice(0, 300),
      h.summary.trim().slice(0, 1000),
      (h.evidence ?? "").trim().slice(0, 1000),
      gates.text,
      JSON.stringify(gates.list),
      JSON.stringify(obligations),
      now,
      now,
    )
    .first<Handoff>();
  const g = fmtGates(row!);
  const must = obligations.length
    ? `\nYou must (${obligations.length === 1 ? "this" : `all ${obligations.length}`}; tick each off in update_handoff's obligations when you record the outcome: done, na or waived with a reason):\n${fmtObligations(obligations, "  ")}`
    : "";
  const text = `handed off H${row!.id}: ${row!.ref} — ${row!.summary}${row!.evidence ? `\nevidence: ${row!.evidence}` : ""}${g ? `\ngates: ${g}` : ""}${must}\nRecord the outcome with update_handoff (id ${row!.id}).`;
  if (h.to_member) await postMessage(env, { channel: h.project, sender: me, recipient: h.to_member, recipient_agent: h.to_agent ?? null, body: text });
  else await postMessage(env, { channel: h.project, sender: me, kind: "event", body: `handed off H${row!.id}: ${row!.ref} — ${row!.summary.split("\n")[0]!.slice(0, 160)}` });
  return row!;
}

export async function getHandoff(env: Env, me: string, id: number): Promise<Handoff> {
  const h = await env.DB.prepare(`SELECT * FROM handoffs WHERE id = ? AND ${MEMBER_PROJECTS}`).bind(id, me).first<Handoff>();
  if (!h) throw new UserError(`No handoff H${id} in your projects.`);
  return h;
}

/**
 * Record what became of a handoff. Its author hears about it (in their agent's context); integrated, held and
 * rejected outcomes also go into the decision log, so nobody re-proposes the same work unaware.
 */
export async function updateHandoff(
  env: Env,
  me: string,
  id: number,
  status: string,
  result = "",
  note = "",
  ticks?: unknown,
): Promise<{ handoff: Handoff; decision: Decision | null }> {
  if (!(HANDOFF_STATES as readonly string[]).includes(status)) throw new UserError(`status must be one of: ${HANDOFF_STATES.join(", ")}`);
  const h = await getHandoff(env, me, id);
  if (status === "withdrawn" && h.author !== me) throw new UserError("Only the author can withdraw a handoff.");
  const by = address(me, env.session?.label);
  const obligations = applyTicks(obligationsOf(h), ticks, by);
  // Integrated means every obligation was met, or said not to apply, or waived with a reason.
  const open = obligations.map((o, i) => ({ o, n: i + 1 })).filter(({ o }) => o.state === "open");
  if (status === "integrated" && open.length)
    throw new UserError(
      `H${h.id} can't be integrated yet: ${open.length === 1 ? "obligation" : "obligations"} ${open.map((x) => x.n).join(", ")} ${open.length === 1 ? "isn't" : "aren't"} ticked off.\n${open.map(({ o, n }) => `  ${n}. ${o.text}`).join("\n")}\nTick each in obligations: [{"n": ${open[0]!.n}, "state": "done", "note": "what you did"}] (done; na when it doesn't apply; waived with the reason). Or record it held while you work on them.`,
    );
  const row = await env.DB.prepare("UPDATE handoffs SET status = ?, result = ?, note = ?, obligations = ?, updated_by = ?, updated_at = ? WHERE id = ? RETURNING *")
    .bind(status, result.trim().slice(0, 200) || h.result, note.trim().slice(0, 1000) || h.note, JSON.stringify(obligations), by, Date.now(), id)
    .first<Handoff>();
  const waived = obligations.map((o, i) => ({ o, n: i + 1 })).filter(({ o }) => o.state === "waived");
  const verdict = status === "integrated" ? "approved" : status === "held" || status === "rejected" ? status : null;
  const decision = verdict
    ? await logDecision(env, me, {
        project: h.project,
        subject: `H${h.id} ${h.ref}${status === "integrated" && row!.result ? ` (integrated as ${row!.result})` : ""}`,
        verdict,
        reason: [note || h.summary, ...waived.map(({ o, n }) => `obligation ${n} waived (${o.text.slice(0, 80)}): ${o.note}`)].join("\n"),
        refs: [h.ref, row!.result].filter(Boolean).join(" "),
        handoff_id: h.id,
      })
    : null;
  const outcome = status === "integrated" && row!.result ? `integrated as ${row!.result}` : status;
  if (!(h.author === me && h.author_agent === (env.session?.label ?? null))) {
    await postMessage(env, {
      channel: h.project,
      sender: me,
      recipient: h.author,
      recipient_agent: h.author_agent,
      body: `Your handoff H${h.id} (${h.ref}) is now ${outcome}${note ? `: ${note}` : "."}${obligations.length ? `\nObligations:\n${fmtObligations(obligations, "  ")}` : ""}`,
    });
  }
  return { handoff: row!, decision };
}

export async function listHandoffs(env: Env, me: string, opts: { project?: string | null; states?: string[]; limit?: number }): Promise<Handoff[]> {
  const where = [MEMBER_PROJECTS];
  const binds: unknown[] = [me];
  if (opts.project) {
    where.push("project = ?");
    binds.push(opts.project);
  }
  if (opts.states?.length) {
    where.push(`status IN (${opts.states.map(() => "?").join(",")})`);
    binds.push(...opts.states);
  }
  // All your projects' latest: from the newest back until there are enough (it read every handoff, 3,300 rows, on each
  // dashboard redraw). One project or a few states: by the project's index.
  const by = opts.project || opts.states?.length ? "" : " INDEXED BY handoffs_updated";
  const { results } = await env.DB.prepare(`SELECT * FROM handoffs${by} WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`)
    .bind(...binds, opts.limit ?? 20)
    .all<Handoff>();
  return results;
}

/** The named agents of a project's members that have a role: "edvin/alder (Codex): works in isolated worktrees". */
export async function crewRoles(env: Env, project: string): Promise<{ member: string; name: string; client: string; role: string }[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.member, a.name, a.client, a.role FROM agent_names a JOIN project_members pm ON pm.project = a.project AND pm.member = a.member
     WHERE a.project = ? AND a.role != '' ORDER BY a.member, a.name`,
  )
    .bind(project)
    .all<{ member: string; name: string; client: string; role: string }>();
  return results;
}

export const fmtCrew = (crew: Awaited<ReturnType<typeof crewRoles>>) =>
  crew.map((c) => `- ${address(c.member, c.name)} (${c.client === "codex" ? "Codex" : "Claude Code"}): ${c.role}`).join("\n");

/** What a session sees about these at start: the project's crew, open handoffs and latest decisions. */
export async function recordsBrief(env: Env, me: string, project: string): Promise<string[]> {
  const [crew, open, recent] = await Promise.all([
    crewRoles(env, project),
    listHandoffs(env, me, { project, states: OPEN_HANDOFF, limit: 8 }),
    findDecisions(env, me, { project, current: true, limit: 6 }),
  ]);
  const out: string[] = [];
  if (crew.length) out.push(`Crew roles in #${project}:\n${fmtCrew(crew)}`);
  if (open.length) out.push(`Open handoffs in #${project} (record outcomes with update_handoff):\n${open.map((h) => fmtHandoff(h, false)).join("\n")}`);
  if (recent.length)
    out.push(
      `Latest decisions in #${project}. Before proposing or re-proposing work, search the log with the decisions tool (e.g. by commit or keyword):\n${recent.map((d) => fmtDecision(d, false)).join("\n")}`,
    );
  return out;
}

/**
 * Close open handoffs as withdrawn, with a note (a later handoff superseded them, or you closed them from the
 * dashboard). Only ones you can see that you or your agents handed over, or that were handed to you; what was closed.
 */
export async function withdrawHandoffs(env: Env, me: string, ids: number[], note: string, by: string): Promise<number[]> {
  if (!ids.length) return [];
  const { results } = await env.DB.prepare(
    `UPDATE handoffs SET status = 'withdrawn', note = ?, updated_by = ?, updated_at = ?
     WHERE id IN (SELECT value FROM json_each(?)) AND status IN ('pending', 'held') AND (author = ? OR to_member = ?)
       AND project IN (SELECT project FROM project_members WHERE member = ?) RETURNING id, ref, to_member, to_agent, created_at`,
  )
    .bind(note.slice(0, 1000), by, Date.now(), JSON.stringify(ids.slice(0, 200)), me, me, me)
    .all<{ id: number; ref: string; to_member: string | null; to_agent: string | null; created_at: number }>();
  // Its message to the receiver, if not taken yet, says there's nothing to do instead of handing the work over.
  for (const h of results.filter((r) => r.to_member && r.to_agent))
    await env.DB.prepare(
      "UPDATE messages SET body = ? WHERE recipient = ? AND recipient_agent = ? AND created_at BETWEEN ? AND ? AND body LIKE ? AND kind != 'event'",
    )
      .bind(`H${h.id} (${h.ref.slice(0, 120)}) was withdrawn before you took it (${note.slice(0, 200)}): nothing to do.`, h.to_member, h.to_agent, h.created_at - 5000, h.created_at + 60_000, `handed off H${h.id}:%`)
      .run();
  return results.map((r) => r.id);
}

/** Handoff ids from what an agent sent: [12, "H13", "14"]. */
export function handoffIds(raw: unknown): number[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" || typeof raw === "number" ? String(raw).split(/[\s,]+/) : [];
  return [...new Set(list.map((x) => Number(String(x).replace(/^H/i, ""))).filter((n) => Number.isInteger(n) && n > 0))];
}

const nudged = new Map<string, number>(); // "member session" → when it was last asked to settle its handoffs
export const NUDGE_EVERY_MS = 3 * 3600_000;
const NUDGE_AFTER_MS = 30 * 60_000;

/**
 * At the end of an agent's turn: the handoffs to it still pending after half an hour, as a request to record what
 * became of each before it stops. Asked at most once every few hours per session; null when there's nothing to ask.
 */
export async function handoffNudge(env: Env, me: string, s: { session_id: string; label: string }): Promise<string | null> {
  const key = `${me} ${s.session_id}`;
  if (Date.now() - (nudged.get(key) ?? 0) < NUDGE_EVERY_MS) return null;
  const { results } = await env.DB.prepare(
    "SELECT id, ref, summary, author, author_agent, created_at FROM handoffs WHERE to_member = ? AND to_agent = ? AND status = 'pending' AND created_at < ? ORDER BY id LIMIT 40",
  )
    .bind(me, s.label, Date.now() - NUDGE_AFTER_MS)
    .all<{ id: number; ref: string; summary: string; author: string; author_agent: string | null; created_at: number }>();
  if (!results.length) return null;
  nudged.set(key, Date.now());
  if (nudged.size > 2000) nudged.delete(nudged.keys().next().value!);
  const line = (h: (typeof results)[number]) => {
    const sum = h.summary.replace(/\s+/g, " ").trim();
    return `- H${h.id} · ${h.ref.slice(0, 80)} — ${sum.length > 140 ? `${sum.slice(0, 139)}…` : sum} (from ${address(h.author, h.author_agent)}, ${ago(h.created_at)})`;
  };
  return [
    `Before you stop: ${results.length === 1 ? "a handoff to you is" : `${results.length}${results.length === 40 ? "+" : ""} handoffs to you are`} still pending on the intercom. Record what became of each with update_handoff, so they don't pile up:`,
    `- integrated (result: the sha it went in as), when it's in;`,
    `- withdrawn (note: "superseded by H…"), when a later handoff replaced it, or it was folded into one you integrated;`,
    `- rejected (note: why), when you won't take it;`,
    `- held (note: what it waits for), when you'll come back to it.`,
    `One you haven't got to: hold it with a note rather than leave it pending. Then stop as you were going to. (You're asked at most every ${NUDGE_EVERY_MS / 3600_000} hours.)`,
    "",
    ...results.map(line),
  ].join("\n");
}
