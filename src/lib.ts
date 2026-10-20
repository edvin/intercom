import type { Db } from "./db";

/** Request-scoped context the app code runs with (inside the TeamHub Durable Object). */
export interface Env {
  DB: Db;
  /** Called after every stored message, to push it to connected channel sessions. */
  onMessage?: (m: Message) => void;
  /** The calling Claude Code session, when the request came through the local channel server. */
  session?: Session;
  /** Public origin, e.g. https://intercom.mhst.io (for invite links). */
  origin?: string;
}

export interface Message {
  id: number;
  channel: string;
  sender: string;
  recipient: string | null;
  kind: string;
  body: string;
  created_at: number;
  sender_agent: string | null;
  recipient_agent: string | null;
  broadcast: number;
}

/** One Claude Code session of a member, as reported by the hooks. */
export interface Session {
  session_id: string;
  label: string;
  project: string;
}

export interface Lock {
  resource: string;
  holder: string;
  reason: string;
  channel: string;
  created_at: number;
  expires_at: number;
}

export interface Proposal {
  id: number;
  channel: string;
  author: string;
  question: string;
  options: string;
  status: string;
  outcome: string | null;
  created_at: number;
  closes_at: number | null;
}

export interface Project {
  name: string;
  description: string;
  repos: string;
  rules: string;
  updated_by: string | null;
  updated_at: number | null;
}

export const MAX_BODY = 4000;

/** Rows whose `channel` is a project the member belongs to. Binds ?2 = member. */
export const MEMBER_OF = "(channel IN (SELECT project FROM project_members WHERE member = ?2))";
const NOT_MUTED_SENDER = "(sender NOT IN (SELECT muted FROM mutes WHERE member = ?2))";
/**
 * Messages a member receives. Binds ?2 = member.
 * - DMs to them, unless they muted the sender.
 * - Posts in their projects, unless they muted the project or the sender; lock activity (broadcast) always.
 */
export const RECEIVES = `(
  (recipient = ?2 AND ${NOT_MUTED_SENDER})
  OR (recipient IS NULL AND ${MEMBER_OF} AND (broadcast = 1 OR (${NOT_MUTED_SENDER}
      AND channel NOT IN (SELECT channel FROM follows WHERE member = ?2 AND mode = 'mute'))))
)`;

export class UserError extends Error {}

export async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function authenticate(req: Request, env: Env): Promise<string | null> {
  const bearer = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i)?.[1];
  const cookie = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)intercom_token=([^;]+)/)?.[1];
  const token = bearer ?? (cookie ? decodeURIComponent(cookie) : undefined);
  if (!token) return null;
  const row = await env.DB.prepare("SELECT name FROM members WHERE token_hash = ?")
    .bind(await sha256(token))
    .first<{ name: string }>();
  return row?.name ?? null;
}

export function normChannel(channel: unknown, fallback = "general"): string {
  const c = String(channel ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(0, 64);
  return c || fallback;
}

export function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function until(ts: number): string {
  const m = Math.max(0, Math.round((ts - Date.now()) / 60000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}m` : ""}`;
}

export const address = (member: string, agent: string | null | undefined) => (agent ? `${member}/${agent}` : member);

export function fmtMessage(m: Message): string {
  const from = address(m.sender, m.sender_agent);
  const where = m.recipient ? `DM ${from} → ${address(m.recipient, m.recipient_agent)}` : `#${m.channel} · ${from}`;
  const marker = m.kind === "event" ? "• " : "";
  return `[${m.id}] ${where} · ${ago(m.created_at)}: ${marker}${m.body}`;
}

export function fmtLock(l: Lock, me: string): string {
  const who = l.holder === me ? "you" : l.holder;
  const reason = l.reason ? ` — ${l.reason}` : "";
  return `🔒 ${l.resource} held by ${who} (since ${ago(l.created_at)}, expires in ${until(l.expires_at)})${reason}`;
}

/**
 * Map a repo name (from the hook) or project name to one of the member's projects.
 * Only their own projects are considered, so two companies can both have a repo called "api".
 */
export async function resolveProject(env: Env, raw: string, me: string): Promise<Project | null> {
  const p = normChannel(raw, "");
  if (!p) return null;
  return env.DB.prepare(
    `SELECT p.* FROM projects p JOIN project_members pm ON pm.project = p.name AND pm.member = ?2
     WHERE p.name = ?1 OR EXISTS (SELECT 1 FROM json_each(p.repos) WHERE lower(value) = ?1)
     ORDER BY p.name = ?1 DESC, pm.created_at DESC LIMIT 1`,
  )
    .bind(p, me)
    .first<Project>();
}

export async function roleIn(env: Env, me: string, project: string): Promise<"owner" | "member" | null> {
  const row = await env.DB.prepare("SELECT role FROM project_members WHERE project = ? AND member = ?").bind(project, me).first<{ role: "owner" | "member" }>();
  return row?.role ?? null;
}

export async function isAdmin(env: Env, me: string): Promise<boolean> {
  return !!(await env.DB.prepare("SELECT 1 FROM members WHERE name = ? AND is_admin = 1").bind(me).first());
}

/** The member's project names, alphabetically. */
export async function myProjects(env: Env, me: string): Promise<string[]> {
  const { results } = await env.DB.prepare("SELECT project FROM project_members WHERE member = ? ORDER BY project").bind(me).all<{ project: string }>();
  return results.map((r) => r.project);
}

/** Throws unless `me` is a member. Doesn't reveal whether a project they can't see exists. */
export async function requireProject(env: Env, me: string, raw: unknown): Promise<string> {
  const name = normChannel(raw, "");
  if (name && (await roleIn(env, me, name))) return name;
  const mine = await myProjects(env, me);
  throw new UserError(
    `${name ? `You're not a member of a project named #${name}.` : "No project given."} Your projects: ${mine.length ? mine.map((p) => `#${p}`).join(", ") : "none yet (create one with configure_project, or ask for an invite)"}.`,
  );
}

/** Throws unless `me` owns the project (instance admins count as owners everywhere). */
export async function requireOwner(env: Env, me: string, project: string): Promise<void> {
  if ((await roleIn(env, me, project)) === "owner" || (await isAdmin(env, me))) return;
  throw new UserError(`Only owners of #${project} can do that.`);
}

/** People who share at least one project with `me` (including `me`). */
export async function coMembers(env: Env, me: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT b.member FROM project_members a JOIN project_members b ON a.project = b.project WHERE a.member = ? ORDER BY b.member",
  )
    .bind(me)
    .all<{ member: string }>();
  return results.map((r) => r.member);
}

export async function postMessage(
  env: Env,
  m: {
    channel: string;
    sender: string;
    sender_agent?: string | null;
    recipient?: string | null;
    recipient_agent?: string | null;
    kind?: string;
    body: string;
    broadcast?: boolean;
  },
): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO messages (channel, sender, sender_agent, recipient, recipient_agent, kind, body, created_at, broadcast)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      m.channel,
      m.sender,
      m.sender_agent ?? env.session?.label ?? null,
      m.recipient ?? null,
      m.recipient_agent ?? null,
      m.kind ?? "message",
      m.body.slice(0, MAX_BODY),
      Date.now(),
      m.broadcast ? 1 : 0,
    )
    .first<Message>();
  env.onMessage?.(row!);
  return row!.id;
}

// A member with no cursor yet starts at the current end, so new members aren't flooded with history.
async function getCursor(env: Env, me: string): Promise<number> {
  const row = await env.DB.prepare("SELECT last_read_id FROM cursors WHERE member = ?").bind(me).first<{ last_read_id: number }>();
  if (row) return row.last_read_id;
  const max = await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM messages").first<{ id: number }>();
  await env.DB.prepare("INSERT OR IGNORE INTO cursors (member, last_read_id) VALUES (?, ?)").bind(me, max!.id).run();
  return max!.id;
}

/** Register/refresh a session. New sessions start reading where the member's person-level cursor is. */
export async function touchSession(env: Env, me: string, sessionId: string, project: string): Promise<Session & { cursor: number }> {
  const label = `${project || "session"}-${sessionId.replace(/[^a-z0-9]/gi, "").slice(0, 4).toLowerCase()}`;
  const base = await getCursor(env, me);
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO sessions (member, session_id, label, project, cursor, started_at, last_seen) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
     ON CONFLICT(member, session_id) DO UPDATE SET project = ?4, last_seen = ?6
     RETURNING label, cursor`,
  )
    .bind(me, sessionId, label, project, base, now)
    .first<{ label: string; cursor: number }>();
  return { session_id: sessionId, project, ...row! };
}

/**
 * Unread messages for `me`, excluding their own. Without a session this is the person-level view (all DMs);
 * with one, DMs addressed to another of their sessions are skipped and the session's own cursor is used.
 */
export async function unread(
  env: Env,
  me: string,
  limit: number,
  markRead: boolean,
  session?: Session & { cursor: number },
): Promise<{ messages: Message[]; more: boolean }> {
  const cursor = session ? session.cursor : await getCursor(env, me);
  const agentOk = session ? "(recipient IS NULL OR recipient_agent IS NULL OR recipient_agent IN (?4, ?5))" : "?4 IS NULL AND ?5 IS NULL";
  const { results } = await env.DB.prepare(`SELECT * FROM messages WHERE id > ?1 AND sender != ?2 AND ${RECEIVES} AND ${agentOk} ORDER BY id LIMIT ?3`)
    .bind(cursor, me, limit + 1, session?.label ?? null, session?.project ?? null)
    .all<Message>();
  const more = results.length > limit;
  const messages = results.slice(0, limit);
  if (markRead && messages.length) {
    const last = messages[messages.length - 1].id;
    const stmts = [env.DB.prepare("UPDATE cursors SET last_read_id = MAX(last_read_id, ?) WHERE member = ?").bind(last, me)];
    if (session) stmts.push(env.DB.prepare("UPDATE sessions SET cursor = MAX(cursor, ?) WHERE member = ? AND session_id = ?").bind(last, me, session.session_id));
    await env.DB.batch(stmts);
  }
  return { messages, more };
}

/** Active locks in the member's projects. */
export async function activeLocks(env: Env, me: string): Promise<Lock[]> {
  const { results } = await env.DB.prepare(`SELECT * FROM locks WHERE expires_at > ?1 AND ${MEMBER_OF} ORDER BY resource`)
    .bind(Date.now(), me)
    .all<Lock>();
  return results;
}

export async function tally(env: Env, p: Proposal, me: string): Promise<string> {
  const { results } = await env.DB.prepare("SELECT member, choice, comment FROM votes WHERE proposal_id = ? ORDER BY created_at")
    .bind(p.id)
    .all<{ member: string; choice: string; comment: string }>();
  const options: string[] = JSON.parse(p.options);
  const counts = options.map((o) => {
    const voters = results.filter((v) => v.choice === o).map((v) => v.member);
    return `${o}: ${voters.length}${voters.length ? ` (${voters.join(", ")})` : ""}`;
  });
  const expired = p.status === "open" && p.closes_at !== null && p.closes_at <= Date.now();
  const state =
    p.status === "closed"
      ? `closed — outcome: ${p.outcome ?? "n/a"}`
      : expired
        ? "voting period ended (not formally closed)"
        : p.closes_at
          ? `open, closes in ${until(p.closes_at)}`
          : "open";
  const mine = results.find((v) => v.member === me);
  const comments = results.filter((v) => v.comment).map((v) => `    ${v.member}: ${v.comment}`);
  return [
    `#${p.id} [#${p.channel}] ${p.author} asks: "${p.question}" — ${state}`,
    `    votes → ${counts.join(" | ")}`,
    `    ${mine ? `you voted: ${mine.choice}` : p.status === "open" && !expired ? "you have NOT voted yet" : ""}`.trimEnd(),
    ...comments,
  ]
    .filter((l) => l.trim())
    .join("\n");
}

export async function setPresence(env: Env, me: string, project: string | null, note: string | null): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO presence (member, project, note, updated_at) VALUES (?1, COALESCE(?2, ''), COALESCE(?3, ''), ?4)
     ON CONFLICT(member) DO UPDATE SET
       project = COALESCE(?2, presence.project),
       note = CASE WHEN ?2 IS NOT NULL AND ?2 != presence.project THEN COALESCE(?3, '') ELSE COALESCE(?3, presence.note) END,
       updated_at = ?4`,
  )
    .bind(me, project, note, Date.now())
    .run();
}

export const RETENTION_DAYS = 90;

/**
 * Housekeeping, run daily by the hub's alarm. Messages older than the retention period are deleted;
 * decisions (proposals and votes), projects and members are kept.
 */
export async function prune(env: Env, retentionDays = RETENTION_DAYS, now = Date.now()): Promise<Record<string, number>> {
  const day = 86400_000;
  const run = async (q: string, ...p: unknown[]) => (await env.DB.prepare(q).bind(...p).run()).meta.changes;
  return {
    messages: await run("DELETE FROM messages WHERE created_at < ?", now - retentionDays * day),
    locks: await run("DELETE FROM locks WHERE expires_at < ?", now),
    invites: await run("DELETE FROM invites WHERE expires_at < ? OR uses_left <= 0", now - 7 * day),
    sessions: await run("DELETE FROM sessions WHERE last_seen < ?", now - 14 * day),
  };
}
