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

/** A handoff on one line, then its evidence and gates indented. */
export function fmtHandoff(h: Handoff, withProject = true): string {
  const to = h.to_member ? ` → ${address(h.to_member, h.to_agent)}` : "";
  const state = `${h.status.toUpperCase()}${h.status === "integrated" && h.result ? ` as ${h.result}` : ""}`;
  return [
    `H${h.id}${withProject ? ` [#${h.project}]` : ""} ${state} · ${h.ref} — ${h.summary} · ${address(h.author, h.author_agent)}${to}, ${ago(h.created_at)}`,
    h.evidence ? `    evidence: ${h.evidence}` : "",
    h.gates ? `    gates: ${h.gates}` : "",
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

export async function createHandoff(
  env: Env,
  me: string,
  h: { project: string; ref: string; summary: string; evidence?: string; gates?: string; to_member?: string | null; to_agent?: string | null },
): Promise<Handoff> {
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO handoffs (project, author, author_agent, to_member, to_agent, ref, summary, evidence, gates, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
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
      (h.gates ?? "").trim().slice(0, 1000),
      now,
      now,
    )
    .first<Handoff>();
  const text = `handed off H${row!.id}: ${row!.ref} — ${row!.summary}${row!.evidence ? `\nevidence: ${row!.evidence}` : ""}${row!.gates ? `\ngates: ${row!.gates}` : ""}\nRecord the outcome with update_handoff (id ${row!.id}).`;
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
export async function updateHandoff(env: Env, me: string, id: number, status: string, result = "", note = ""): Promise<{ handoff: Handoff; decision: Decision | null }> {
  if (!(HANDOFF_STATES as readonly string[]).includes(status)) throw new UserError(`status must be one of: ${HANDOFF_STATES.join(", ")}`);
  const h = await getHandoff(env, me, id);
  if (status === "withdrawn" && h.author !== me) throw new UserError("Only the author can withdraw a handoff.");
  const row = await env.DB.prepare("UPDATE handoffs SET status = ?, result = ?, note = ?, updated_by = ?, updated_at = ? WHERE id = ? RETURNING *")
    .bind(status, result.trim().slice(0, 200) || h.result, note.trim().slice(0, 1000) || h.note, address(me, env.session?.label), Date.now(), id)
    .first<Handoff>();
  const verdict = status === "integrated" ? "approved" : status === "held" || status === "rejected" ? status : null;
  const decision = verdict
    ? await logDecision(env, me, {
        project: h.project,
        subject: `H${h.id} ${h.ref}${status === "integrated" && row!.result ? ` (integrated as ${row!.result})` : ""}`,
        verdict,
        reason: note || h.summary,
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
      body: `Your handoff H${h.id} (${h.ref}) is now ${outcome}${note ? `: ${note}` : "."}`,
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
  const { results } = await env.DB.prepare(`SELECT * FROM handoffs WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`)
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
