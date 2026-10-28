import type { Db } from "./db";
import { webBase } from "./refs";
import { type LoopEvent, activeLoops, applyLoopEvents, parseLoops } from "./loops";
import { type JobEvent, activeJobs, applyJobEvents, parseJobs } from "./jobs";

/** Request-scoped context the app code runs with (inside the TeamHub Durable Object). */
export interface Env {
  DB: Db;
  /** Called after every stored message, to push it to connected channel sessions. */
  onMessage?: (m: Message) => void;
  /** The calling session (Claude Code or Codex), when the request came through the local intercom server. */
  session?: Session & { cursor: number };
  /** Public origin, e.g. https://intercom.mhst.io (for invite links). */
  origin?: string;
  /** Repo name the calling session runs in, as reported by the client. */
  repo?: string;
  /** GitHub OAuth app, when configured. */
  github?: { client_id: string; client_secret: string };
  /** Caller's IP (for rate limits). */
  ip?: string;
  /** Sessions with a live connection to the hub right now ("member/session_id"); undefined outside the hub. */
  live?: () => Set<string>;
  /** Redraw a member's open dashboards; undefined outside the hub. */
  refreshWeb?: (member: string) => void;
  /** Ask a session's local server for a file on its machine (localfiles.ts); false when it isn't connected. */
  askFile?: (member: string, sessionId: string, req: string, path: string) => boolean;
  /** Where message images live (R2). */
  files?: R2Bucket;
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
  /** A dashboard DM being edited, or one its sender took back before an agent got it (unsend). */
  held_at?: number | null;
  cancelled_at?: number | null;
}

/** One Claude Code session of a member, as reported by the hooks. */
export interface Session {
  session_id: string;
  label: string;
  project: string;
}

/** Git branch names as reported by clients: printable, short. */
export const cleanBranch = (raw: unknown): string | null =>
  typeof raw === "string" ? raw.replace(/[^\w./@+#-]/g, "").slice(0, 80) : null;

export interface Lock {
  resource: string;
  holder: string;
  holder_agent?: string | null;
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
/** Not held or cancelled by its sender: what anyone but the sender (and every agent) may see. */
export const LIVE = "(held_at IS NULL AND cancelled_at IS NULL)";

export const RECEIVES = `(
  (recipient = ?2 AND ${NOT_MUTED_SENDER} AND ${LIVE})
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
  const hash = await sha256(token);
  const row = await env.DB.prepare("SELECT name FROM members WHERE token_hash = ?1 UNION ALL SELECT member FROM tokens WHERE token_hash = ?1 LIMIT 1")
    .bind(hash)
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

/** The compact form for tight spots: now, 5m, 3h, 2d. */
export function short(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function until(ts: number): string {
  const m = Math.max(0, Math.round((ts - Date.now()) / 60000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}m` : ""}`;
}

export const address = (member: string, agent: string | null | undefined) => (agent ? `${member}/${agent}` : member);

/** Written by the person themself in the dashboard (no agent session), as seen by one of their own agents. */
export const fromOwnUser = (m: Message, viewer?: string) => !!viewer && m.sender === viewer && !m.sender_agent;

export function fmtMessage(m: Message, viewer?: string): string {
  const own = fromOwnUser(m, viewer);
  const from = own ? `${m.sender} (YOUR USER, ${m.kind === "event" ? "a dashboard notice; no reply needed" : "from the dashboard"})` : address(m.sender, m.sender_agent);
  const where = m.recipient ? `DM ${from} → ${address(m.recipient, m.recipient_agent)}` : `#${m.channel} · ${from}`;
  const marker = m.kind === "event" ? "• " : "";
  return `[${m.id}] ${where} · ${ago(m.created_at)}: ${marker}${m.body}`;
}

/**
 * Whether a lock is the caller's: as a person (no session: the dashboard) any of their agents' locks; as a session
 * only its own, or one its person took from the dashboard. Another agent of the same person is someone else here.
 */
export function isMyLock(l: Lock, me: string, label?: string | null): boolean {
  if (l.holder !== me) return false;
  if (!label || !l.holder_agent) return true;
  return l.holder_agent === label;
}

/** Who holds a lock, spelled out so an agent can't mistake a sibling session's lock for its own. */
export function lockHolder(l: Lock, me: string, label?: string | null): string {
  const addr = address(l.holder, l.holder_agent ?? null);
  if (l.holder !== me) return addr;
  if (!l.holder_agent) return label ? `your user (${me}, from the dashboard)` : "you";
  if (!label) return `your agent ${addr}`;
  return l.holder_agent === label ? `this session (${addr})` : `${addr}, another of your user's sessions, NOT this one`;
}

export function fmtLock(l: Lock, me: string, label?: string | null): string {
  const who = lockHolder(l, me, label);
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

/**
 * The project a session works in: the one its user set for it from the dashboard (while they're still a member),
 * else the one its repo maps to.
 */
export async function projectFor(env: Env, me: string, raw: string | null | undefined, sessionId?: string | null): Promise<Project | null> {
  if (sessionId) {
    const pinned = await env.DB.prepare(
      `SELECT p.* FROM sessions s JOIN projects p ON p.name = s.project_pin JOIN project_members pm ON pm.project = p.name AND pm.member = s.member
       WHERE s.member = ? AND s.session_id = ? AND s.project_pin != ''`,
    )
      .bind(me, sessionId)
      .first<Project>();
    if (pinned) return pinned;
  }
  return raw ? resolveProject(env, raw, me) : null;
}

/** The web address of the session's git origin, for linking MR/issue/commit references in what it writes. */
export async function setOrigin(env: Env, me: string, sessionId: string, raw: string | null | undefined): Promise<void> {
  const base = webBase(raw);
  if (base) await env.DB.prepare("UPDATE sessions SET origin = ? WHERE member = ? AND session_id = ? AND origin != ?").bind(base, me, sessionId, base).run();
}

/** The directory a session works in, as its client reports it (home already shortened to ~). */
export async function setCwd(env: Env, me: string, sessionId: string, raw: string | null | undefined): Promise<void> {
  const cwd = String(raw ?? "").replace(/[\x00-\x1f]/g, "").slice(0, 300);
  if (cwd) await env.DB.prepare("UPDATE sessions SET cwd = ? WHERE member = ? AND session_id = ? AND cwd != ?").bind(cwd, me, sessionId, cwd).run();
}

/** Remember the repo a session runs in (what the dashboard can link to a project). */
export async function setRepo(env: Env, me: string, sessionId: string, raw: string | null | undefined): Promise<void> {
  const repo = normChannel(raw ?? "", "");
  if (repo) await env.DB.prepare("UPDATE sessions SET repo = ? WHERE member = ? AND session_id = ? AND repo != ?").bind(repo, me, sessionId, repo).run();
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
    /** Longer than MAX_BODY: an agent's reply taken from its terminal. */
    max?: number;
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
      m.body.slice(0, m.max ?? MAX_BODY),
      Date.now(),
      m.broadcast ? 1 : 0,
    )
    .first<Message>();
  // A post from a session counts as it being active.
  if (env.session && (m.sender_agent ?? env.session.label) === env.session.label)
    await env.DB.prepare("UPDATE sessions SET active_at = ? WHERE member = ? AND session_id = ?").bind(row!.created_at, m.sender, env.session.session_id).run();
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
/** The agent a session runs in, as reported by the local server: "claude" (default) or "codex". */
export const cleanClient = (raw: string | null | undefined): string | null => (raw === "codex" || raw === "claude" ? raw : null);

/** A session name as people type it ("Alder" → "alder"), or null if it isn't a usable name. */
export const cleanName = (raw: unknown): string | null => {
  const n = String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return /^[a-z][a-z0-9-]{0,23}$/.test(n) ? n : null;
};

/** `name`, or name-2, name-3 … if another of the member's live sessions already uses it. */
export async function freeLabel(env: Env, me: string, sessionId: string, name: string): Promise<string> {
  for (let i = 1; i < 50; i++) {
    const label = i === 1 ? name : `${name}-${i}`;
    const taken = await env.DB.prepare(
      "SELECT 1 FROM sessions WHERE member = ?1 AND label = ?2 AND session_id != ?3 AND (last_seen > ?4 OR session_id IN (SELECT value FROM json_each(?5)))",
    )
      .bind(me, label, sessionId, Date.now() - GONE_MS, JSON.stringify(liveIds(env, me)))
      .first();
    if (!taken) return label;
  }
  return `${name}-${sessionId.slice(0, 4)}`;
}

export async function touchSession(
  env: Env,
  me: string,
  sessionId: string,
  project: string,
  branch: string | null = null,
  client: string | null = null,
  name: string | null = null,
): Promise<Session & { cursor: number }> {
  // Naming happens once, when the session first appears; after that only set_name renames it.
  const known = await env.DB.prepare("SELECT 1 FROM sessions WHERE member = ? AND session_id = ?").bind(me, sessionId).first();
  let label = `${project || "session"}-${sessionId.replace(/[^a-z0-9]/gi, "").slice(0, 4).toLowerCase()}`;
  let role = "";
  if (!known) {
    const named = cleanName(name);
    if (named) label = await freeLabel(env, me, sessionId, named);
    else if (project) {
      // The member's crew for this agent in this project: take the first name no live session is using.
      const { results: crew } = await env.DB.prepare(
        `SELECT a.name, a.role FROM agent_names a WHERE a.member = ?1 AND a.project = ?2 AND a.client = ?3
           AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.member = ?1 AND s.label = a.name
                             AND (s.last_seen > ?4 OR s.session_id IN (SELECT value FROM json_each(?5))))
         ORDER BY a.updated_at`,
      )
        .bind(me, project, client ?? "claude", Date.now() - GONE_MS, JSON.stringify(liveIds(env, me)))
        .all<{ name: string; role: string }>();
      if (crew[0]) {
        label = crew[0].name;
        role = crew[0].role;
      }
    }
  }
  const base = await getCursor(env, me);
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO sessions (member, session_id, label, project, cursor, started_at, last_seen, branch, client, note, note_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, COALESCE(?7, ''), COALESCE(?8, 'claude'), ?9, CASE WHEN ?9 != '' THEN ?6 END)
     ON CONFLICT(member, session_id) DO UPDATE SET project = ?4, last_seen = ?6, branch = COALESCE(?7, sessions.branch), client = COALESCE(?8, sessions.client)
     RETURNING label, cursor`,
  )
    .bind(me, sessionId, label, project, base, now, branch, client, role)
    .first<{ label: string; cursor: number }>();
  if (!known && row && !label.startsWith(`${project || "session"}-`)) await inheritMailbox(env, me, sessionId, label);
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
  // A session gets the posts of its own project only (another project's lock claims are noise there), and the DMs
  // meant for it. The person-level view (dashboard, no session) still has everything.
  const agentOk = session
    ? "(recipient IS NULL OR recipient_agent IS NULL OR recipient_agent IN (?4, ?5)) AND (recipient IS NOT NULL OR channel = ?5)"
    : "?4 IS NULL AND ?5 IS NULL";
  // A session skips only what it sent itself: the member's other sessions (say Claude Code and Codex in one
  // project) and their posts from the dashboard reach it. Without a session it's the person's view: skip all their own.
  // An agent writing to its own person without naming a session ("edvin") is answering the human in the dashboard;
  // that reply isn't for the person's other agents.
  const notMine = session
    ? "(sender != ?2 OR sender_agent IS NULL OR (sender_agent != ?4 AND NOT (recipient IS NOT NULL AND recipient = ?2 AND recipient_agent IS NULL)))"
    : "sender != ?2";
  const { results } = await env.DB.prepare(`SELECT * FROM messages WHERE id > ?1 AND ${notMine} AND ${RECEIVES} AND ${agentOk} ORDER BY id LIMIT ?3`)
    .bind(cursor, me, limit + 1, session?.label ?? null, session?.project ?? null)
    .all<Message>();
  const more = results.length > limit;
  const messages = results.slice(0, limit);
  if (markRead && messages.length) {
    const last = messages[messages.length - 1].id;
    const stmts = [env.DB.prepare("UPDATE cursors SET last_read_id = MAX(last_read_id, ?) WHERE member = ?").bind(last, me)];
    if (session) {
      stmts.push(env.DB.prepare("UPDATE sessions SET cursor = MAX(cursor, ?) WHERE member = ? AND session_id = ?").bind(last, me, session.session_id));
      const now = Date.now();
      for (const m of messages.filter((m) => m.recipient)) stmts.push(recordDelivery(env, m.id, me, session.session_id, session.label, now));
    }
    await env.DB.batch(stmts);
    // Senders watching the dashboard see their ✓ appear.
    if (session) for (const who of new Set(messages.filter((m) => m.recipient).map((m) => m.sender))) env.refreshWeb?.(who);
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

export async function setPresence(env: Env, me: string, project: string | null, note: string | null, branch: string | null = null): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO presence (member, project, note, updated_at, branch) VALUES (?1, COALESCE(?2, ''), COALESCE(?3, ''), ?4, COALESCE(?5, ''))
     ON CONFLICT(member) DO UPDATE SET
       project = COALESCE(?2, presence.project),
       note = CASE WHEN ?2 IS NOT NULL AND ?2 != presence.project THEN COALESCE(?3, '') ELSE COALESCE(?3, presence.note) END,
       branch = CASE WHEN ?2 IS NOT NULL AND ?2 != presence.project THEN COALESCE(?5, '') ELSE COALESCE(?5, presence.branch) END,
       updated_at = ?4`,
  )
    .bind(me, project, note, Date.now(), branch)
    .run();
}

/** "#billing · feat/ledger · reviewing 0042", for people you share that project with. */
export function workingOn(project: string | null, branch: string | null | undefined, note: string | null | undefined): string {
  return [project ? `#${project}` : "", branch ? `branch ${branch}` : "", note ? `“${note}”` : ""].filter(Boolean).join(" · ");
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
    states: await run("DELETE FROM oauth_states WHERE expires_at < ?", now),
    devices: await run("DELETE FROM device_codes WHERE expires_at < ?", now),
    access: await run("DELETE FROM repo_access WHERE expires_at < ?", now),
    limits: await run("DELETE FROM rate_limits WHERE window_start < ?", now - 2 * day),
    webTokens: await run("DELETE FROM tokens WHERE kind = 'web' AND created_at < ?", now - 365 * day),
    activity: await run("DELETE FROM activity WHERE at < ?", now - 14 * day),
    deliveries: await run("DELETE FROM deliveries WHERE at < ?", now - retentionDays * day),
    // Away-mode questions are answered (or expire) within the hour; a request nobody answered within a month lapses.
    approvals: await run("DELETE FROM approvals WHERE created_at < ?", now - 14 * day),
    joinRequests: await run("DELETE FROM join_requests WHERE created_at < ?", now - 30 * day),
    // Closed votes, settled handoffs and decisions go with the messages that announced them; open ones stay until settled.
    votes: await run("DELETE FROM votes WHERE proposal_id IN (SELECT id FROM proposals WHERE status != 'open' AND created_at < ?)", now - retentionDays * day),
    proposals: await run("DELETE FROM proposals WHERE status != 'open' AND created_at < ?", now - retentionDays * day),
    handoffs: await run("DELETE FROM handoffs WHERE status != 'pending' AND updated_at < ?", now - retentionDays * day),
    decisions: await run("DELETE FROM decisions WHERE created_at < ?", now - retentionDays * day),
  };
}

/** A fresh random token (48 hex chars). */
export const newToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Issue an extra token for a member: a browser session ('web') or a device approved in the browser ('cli'). */
export async function issueToken(env: Env, member: string, kind: "web" | "cli", label: string): Promise<string> {
  const token = newToken();
  await env.DB.prepare("INSERT INTO tokens (token_hash, member, kind, label, created_at) VALUES (?, ?, ?, ?, ?)").bind(await sha256(token), member, kind, label.slice(0, 80), Date.now()).run();
  return token;
}

/**
 * Fixed-window rate limit. Returns false once `key` has been used more than `limit` times in `windowMs`.
 * Keys look like "signup:ip:1.2.3.4" or "post:anna".
 */
export async function rateLimit(env: Env, key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start <= ?2 - ?3 THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start <= ?2 - ?3 THEN ?2 ELSE rate_limits.window_start END
     RETURNING count`,
  )
    .bind(key, now, windowMs)
    .first<{ count: number }>();
  return row!.count <= limit;
}

/** Throws a friendly error when a rate limit is hit. */
export async function limit(env: Env, key: string, max: number, windowMs: number, what: string): Promise<void> {
  if (!(await rateLimit(env, key, max, windowMs))) throw new UserError(`Slow down: too many ${what} in a short time. Try again later.`);
}

export const HANDLE = /^[a-z][a-z0-9_-]{1,31}$/;

/** A free handle derived from a GitHub login ("Anna.Smith" → "anna-smith", or "anna-smith-2" if taken). */
export async function freeHandle(env: Env, login: string): Promise<string> {
  let base = login.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[^a-z]+/, "").slice(0, 28) || "user";
  if (base.length < 2) base = `${base}x`;
  for (let i = 1; i < 100; i++) {
    const name = i === 1 ? base : `${base}-${i}`;
    if (!(await env.DB.prepare("SELECT 1 FROM members WHERE name = ?").bind(name).first())) return name;
  }
  return `${base}-${newToken().slice(0, 6)}`;
}

/** How long without a connection or hook call before a session counts as gone (its name free for others). */
export const GONE_MS = 10 * 60_000;

/** Sessions of `member` that are connected now, or were active in the last few minutes. */
export function liveIds(env: Env, member: string): string[] {
  const live = env.live?.();
  return live ? [...live].filter((k) => k.startsWith(`${member}/`)).map((k) => k.slice(member.length + 1)) : [];
}

/**
 * A named session taking over from an earlier one with the same name (an agent that ended or was killed)
 * starts reading where that one stopped, so DMs sent to the name in between reach it. Returns the new cursor.
 */
export async function inheritMailbox(env: Env, me: string, sessionId: string, label: string): Promise<void> {
  const prev = await env.DB.prepare("SELECT cursor FROM sessions WHERE member = ? AND label = ? AND session_id != ? ORDER BY last_seen DESC LIMIT 1")
    .bind(me, label, sessionId)
    .first<{ cursor: number }>();
  const ended = await env.DB.prepare("SELECT cursor FROM ended_sessions WHERE member = ? AND label = ?").bind(me, label).first<{ cursor: number }>();
  const from = Math.min(prev?.cursor ?? Infinity, ended?.cursor ?? Infinity);
  if (Number.isFinite(from)) await env.DB.prepare("UPDATE sessions SET cursor = MIN(cursor, ?) WHERE member = ? AND session_id = ?").bind(from, me, sessionId).run();
}

/** The machine a session runs on, as its client reports it (a short hostname or a nickname). */
export async function setHost(env: Env, me: string, sessionId: string, raw: string | null | undefined): Promise<void> {
  if (raw === null || raw === undefined) return;
  const host = raw.replace(/\.(local|lan|home|localdomain)$/i, "").replace(/[^\w.-]/g, "").slice(0, 48);
  await env.DB.prepare("UPDATE sessions SET host = ? WHERE member = ? AND session_id = ? AND host != ?").bind(host, me, sessionId, host).run();
}

/**
 * Rename one of `me`'s sessions (by session id). The name is made unique among their live sessions, the session
 * picks up mail sent to that name while nobody had it, and (remember) it joins that project's crew for its agent type.
 */
export async function renameSession(
  env: Env,
  me: string,
  sessionId: string,
  rawName: unknown,
  opts: { remember?: boolean; role?: string } = {},
): Promise<{ label: string; project: string; client: string; crew: { name: string; role: string }[] }> {
  const name = cleanName(rawName);
  if (!name) throw new UserError("Names are letters, digits and -, starting with a letter (max 24), e.g. alder.");
  const s = await env.DB.prepare("SELECT project, client FROM sessions WHERE member = ? AND session_id = ?").bind(me, sessionId).first<{ project: string; client: string }>();
  if (!s) throw new UserError("No such session of yours.");
  const label = await freeLabel(env, me, sessionId, name);
  await env.DB.prepare("UPDATE sessions SET label = ? WHERE member = ? AND session_id = ?").bind(label, me, sessionId).run();
  await inheritMailbox(env, me, sessionId, label);
  const role = (opts.role ?? "").trim().slice(0, 120);
  const remember = opts.remember !== false && !!s.project;
  if (remember) {
    await env.DB.prepare(
      `INSERT INTO agent_names (member, project, client, name, role, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(member, project, client, name) DO UPDATE SET role = CASE WHEN excluded.role != '' THEN excluded.role ELSE agent_names.role END`,
    )
      .bind(me, s.project, s.client, name, role, Date.now())
      .run();
  }
  if (role) {
    await setPresence(env, me, s.project || null, role);
    await env.DB.prepare("UPDATE sessions SET note = ?, note_at = ? WHERE member = ? AND session_id = ?").bind(role, Date.now(), me, sessionId).run();
  }
  const { results: crew } = remember
    ? await env.DB.prepare("SELECT name, role FROM agent_names WHERE member = ? AND project = ? AND client = ? ORDER BY updated_at").bind(me, s.project, s.client).all<{ name: string; role: string }>()
    : { results: [] };
  return { label, project: s.project, client: s.client, crew };
}

/** The member's nicknames for their machines (host → name). */
export async function hostNames(env: Env, me: string): Promise<Map<string, string>> {
  const { results } = await env.DB.prepare("SELECT host, name FROM host_names WHERE member = ?").bind(me).all<{ host: string; name: string }>();
  return new Map(results.map((r) => [r.host, r.name]));
}

export interface Activity {
  id: number;
  session_id: string;
  at: number;
  kind: string;
  text: string;
}

const ACTIVITY_KINDS = new Set(["prompt", "text", "cmd", "edit", "read", "tool", "loop", "job"]);
export const ACTIVITY_KEEP = 300;

/** Store a batch of mirrored activity for one of `me`'s own sessions. */
export async function addActivity(env: Env, me: string, sessionId: string, items: unknown): Promise<number> {
  if (!Array.isArray(items) || !sessionId) return 0;
  const own = await env.DB.prepare("SELECT 1 FROM sessions WHERE member = ? AND session_id = ?").bind(me, sessionId).first();
  if (!own) return 0;
  const now = Date.now();
  const when = (raw: unknown) => {
    const at = Number(raw);
    return Number.isFinite(at) && at > now - 86400_000 && at < now + 60_000 ? at : now;
  };
  // Loop events (the agent scheduling or stopping prompts) update the session's loop list; their readable
  // form goes into the activity like any other step.
  const loopEvents = items.slice(-100).flatMap((it) => {
    const i = it as { at?: unknown; kind?: unknown; text?: unknown };
    if (i.kind !== "loop") return [];
    try {
      return [{ at: when(i.at), ev: JSON.parse(String(i.text)) as LoopEvent }];
    } catch {
      return [];
    }
  });
  const loopLines: { kind: string; text: string; at: number }[] = [];
  if (loopEvents.length) {
    const cur = await env.DB.prepare("SELECT loops FROM sessions WHERE member = ? AND session_id = ?").bind(me, sessionId).first<{ loops: string }>();
    const { loops, lines } = applyLoopEvents(activeLoops(parseLoops(cur?.loops), now), loopEvents);
    await env.DB.prepare("UPDATE sessions SET loops = ? WHERE member = ? AND session_id = ?").bind(JSON.stringify(loops), me, sessionId).run();
    loopLines.push(...lines.map((l) => ({ kind: "loop", text: l.text, at: l.at })));
  }
  // Background jobs the same way: the running list on the session, a line when one ends.
  const jobEvents = items.slice(-100).flatMap((it) => {
    const i = it as { at?: unknown; kind?: unknown; text?: unknown };
    if (i.kind !== "job") return [];
    try {
      return [{ at: when(i.at), ev: JSON.parse(String(i.text)) as JobEvent }];
    } catch {
      return [];
    }
  });
  if (jobEvents.length) {
    const cur = await env.DB.prepare("SELECT jobs FROM sessions WHERE member = ? AND session_id = ?").bind(me, sessionId).first<{ jobs: string }>();
    const { jobs, lines } = applyJobEvents(activeJobs(parseJobs(cur?.jobs), now), jobEvents);
    await env.DB.prepare("UPDATE sessions SET jobs = ? WHERE member = ? AND session_id = ?").bind(JSON.stringify(jobs), me, sessionId).run();
    loopLines.push(...lines.map((l) => ({ kind: "job", text: l.text, at: l.at })));
  }
  const rows = [
    ...items.slice(-100).flatMap((it) => {
      const i = it as { at?: unknown; kind?: unknown; text?: unknown };
      const kind = String(i.kind ?? "");
      const text = String(i.text ?? "").replace(/\s+$/g, "").slice(0, 6000); // the agent's text in full, up to a long answer
      if (!ACTIVITY_KINDS.has(kind) || kind === "loop" || kind === "job" || !text) return [];
      return [{ kind, text, at: when(i.at) }];
    }),
    ...loopLines,
  ];
  if (!rows.length) {
    if (loopEvents.length || jobEvents.length) env.refreshWeb?.(me);
    return loopEvents.length + jobEvents.length;
  }
  await env.DB.batch([
    ...rows.map((r) => env.DB.prepare("INSERT INTO activity (member, session_id, at, kind, text) VALUES (?, ?, ?, ?, ?)").bind(me, sessionId, r.at, r.kind, r.text)),
    env.DB.prepare(
      "DELETE FROM activity WHERE member = ?1 AND session_id = ?2 AND id <= (SELECT id FROM activity WHERE member = ?1 AND session_id = ?2 ORDER BY id DESC LIMIT 1 OFFSET ?3)",
    ).bind(me, sessionId, ACTIVITY_KEEP),
    env.DB.prepare("UPDATE sessions SET active_at = MAX(COALESCE(active_at, 0), ?) WHERE member = ? AND session_id = ?").bind(Math.max(...rows.map((r) => r.at)), me, sessionId),
    // A step after it started waiting: the question was answered in the terminal, so it no longer needs you. A channel
    // session's tool calls never reach the hub (its hooks take the fast path), so the mirror is what tells. The step the
    // prompt was about is written just before it, so a little slack keeps a clock difference from clearing it too early.
    env.DB.prepare("UPDATE sessions SET state = 'working', state_detail = '', state_at = ?1 WHERE member = ?2 AND session_id = ?3 AND state = 'waiting' AND state_at + 1500 < ?4").bind(
      now,
      me,
      sessionId,
      Math.max(...rows.map((r) => r.at)),
    ),
  ]);
  env.refreshWeb?.(me);
  return rows.length;
}

/** The plugin version a session runs, as its client reports it. */
export async function setVersion(env: Env, me: string, sessionId: string, raw: string | null | undefined): Promise<void> {
  const v = String(raw ?? "").match(/^\d+\.\d+\.\d+$/)?.[0];
  if (v) await env.DB.prepare("UPDATE sessions SET version = ? WHERE member = ? AND session_id = ? AND version != ?").bind(v, me, sessionId, v).run();
}

/** Is this lock about `project`? (its channel, or the project part of <action>:<project>:<env>) */
export const lockIn = (l: Lock, project: string | null | undefined) => !!project && (l.channel === project || l.resource.split(":")[1] === project);

/** Locks as shown to a session: its own project's in full, the rest only counted. */
export function scopedLocks(locks: Lock[], me: string, project: string | null | undefined, indent = "", label?: string | null): string {
  const here = locks.filter((l) => lockIn(l, project));
  const elsewhere = locks.length - here.length;
  const lines = here.map((l) => `${indent}${fmtLock(l, me, label)}`);
  if (!project) return locks.length ? `${locks.length} active lock${locks.length > 1 ? "s" : ""} in your projects (this repo isn't in one; the locks tool lists them).` : "No active locks.";
  return [
    here.length ? `Locks on #${project}:\n${lines.join("\n")}` : `No locks on #${project}.`,
    elsewhere ? `${elsewhere} more in your other projects (the locks tool lists them).` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A direct message entering a session's context (hook, inbox, channel push): what the dashboard's delivery marks read. */
export const recordDelivery = (env: Env, messageId: number, member: string, sessionId: string, label: string, at = Date.now()) =>
  env.DB.prepare("INSERT OR IGNORE INTO deliveries (message_id, member, session_id, label, at) VALUES (?, ?, ?, ?, ?)").bind(messageId, member, sessionId, label, at);

/**
 * Where a direct message stands: taken into an agent's context, waiting for a connected one to pick it up, or with
 * nobody connected to take it. Senders see only delivered or not for teammates' agents; details are for the recipient.
 */
export type Delivery = { state: "delivered" | "waiting" | "offline" | "held" | "cancelled"; at?: number; label?: string; detail: boolean };

export async function deliveryMarks(env: Env, me: string, msgs: Message[]): Promise<Map<number, Delivery>> {
  const out = new Map<number, Delivery>();
  const since = Number((await env.DB.prepare("SELECT value FROM settings WHERE key = 'deliveries_since'").first<{ value: string }>())?.value ?? 0);
  // An agent answering its own person in the dashboard isn't delivered to an agent; neither is anything the viewer didn't send or receive.
  const dms = msgs.filter(
    (m) => m.recipient && m.id > since && (m.sender === me || m.recipient === me) && !(m.sender === m.recipient && m.sender_agent && !m.recipient_agent),
  );
  if (!dms.length) return out;
  const { results } = await env.DB.prepare(
    `SELECT message_id, label, MIN(at) AS at FROM deliveries WHERE message_id IN (SELECT value FROM json_each(?)) GROUP BY message_id`,
  )
    .bind(JSON.stringify(dms.map((m) => m.id)))
    .all<{ message_id: number; label: string; at: number }>();
  const got = new Map(results.map((r) => [r.message_id, r]));
  // Who of the viewer's own sessions is around to take a message that hasn't landed yet.
  const pendingMine = dms.some((m) => m.recipient === me && !got.has(m.id));
  const { results: mine } = pendingMine
    ? await env.DB.prepare("SELECT session_id, label, project, last_seen FROM sessions WHERE member = ?").bind(me).all<{ session_id: string; label: string; project: string; last_seen: number }>()
    : { results: [] };
  const live = new Set(liveIds(env, me));
  const recent = Date.now() - GONE_MS;
  for (const m of dms) {
    const detail = m.recipient === me;
    if (m.cancelled_at || m.held_at) {
      out.set(m.id, { state: m.cancelled_at ? "cancelled" : "held", detail });
      continue;
    }
    const d = got.get(m.id);
    if (d) {
      out.set(m.id, detail ? { state: "delivered", at: d.at, label: d.label, detail } : { state: "delivered", detail });
      continue;
    }
    if (!detail) {
      out.set(m.id, { state: "waiting", detail });
      continue;
    }
    const takers = mine.filter((s) => !m.recipient_agent || s.label === m.recipient_agent || s.project === m.recipient_agent);
    const up = takers.some((s) => live.has(s.session_id) || s.last_seen > recent);
    out.set(m.id, { state: up ? "waiting" : "offline", detail });
  }
  return out;
}

/**
 * Take back a direct message you wrote in the dashboard, while no agent has it yet: hold it while you edit it, send it
 * (as it was or edited), or cancel it. A held message is skipped by deliveries, and a later one can move a session's
 * cursor past it, so sending posts it again as a new message (its images follow) instead of releasing the old row.
 * The hub runs one request at a time and its SQL is synchronous, so a delivery can't slip in between the check and the change.
 */
export async function unsend(env: Env, me: string, id: number, op: "hold" | "send" | "edit" | "cancel", body?: string): Promise<{ id: number; text: string }> {
  const m = await env.DB.prepare("SELECT * FROM messages WHERE id = ? AND sender = ? AND sender_agent IS NULL AND recipient IS NOT NULL AND cancelled_at IS NULL")
    .bind(id, me)
    .first<Message>();
  if (!m) throw new UserError("That message can't be changed any more.");
  const took = await env.DB.prepare("SELECT label FROM deliveries WHERE message_id = ? ORDER BY at LIMIT 1").bind(id).first<{ label: string }>();
  if (took) throw new UserError(`Already delivered${took.label ? ` to ${took.label}` : ""}: send a correction instead.`);
  if (op === "hold") {
    await env.DB.prepare("UPDATE messages SET held_at = ? WHERE id = ?").bind(Date.now(), id).run();
    env.refreshWeb?.(me);
    return { id, text: "On hold while you edit it" };
  }
  if (op === "cancel") {
    await env.DB.prepare("UPDATE messages SET cancelled_at = ?, held_at = NULL WHERE id = ?").bind(Date.now(), id).run();
    env.refreshWeb?.(me);
    return { id, text: "Cancelled: it won't be delivered" };
  }
  const text = op === "edit" ? (body ?? "").trim() : m.body;
  if (!text) throw new UserError("The message is empty: cancel it instead.");
  if (text.length > MAX_BODY) throw new UserError(`Too long: ${text.length} characters (max ${MAX_BODY}).`);
  await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(id).run();
  const fresh = await postMessage(env, { channel: m.channel, sender: me, sender_agent: null, recipient: m.recipient, recipient_agent: m.recipient_agent, kind: m.kind, body: text });
  await env.DB.prepare("UPDATE attachments SET message_id = ? WHERE message_id = ?").bind(fresh, id).run();
  return { id: fresh, text: op === "edit" ? "Edited" : "Sent" };
}

/**
 * Move one of `me`'s sessions to a project from the dashboard: for this session only (a pin that beats its repo's
 * mapping), or for its repo (linked to the project, so future sessions there join it too). An empty project
 * clears the pin. The agent is told at its next turn, with the project's rules; this isn't a prompt, so it doesn't wake it.
 */
export async function moveSession(env: Env, me: string, sessionId: string, project: string, scope: "session" | "repo"): Promise<string> {
  const s = await env.DB.prepare("SELECT label, project, repo FROM sessions WHERE member = ? AND session_id = ?")
    .bind(me, sessionId)
    .first<{ label: string; project: string; repo: string }>();
  if (!s) throw new UserError("No such session of yours.");
  if (!project) {
    const fromRepo = s.repo ? ((await resolveProject(env, s.repo, me))?.name ?? "") : "";
    await env.DB.prepare("UPDATE sessions SET project_pin = '', project = ? WHERE member = ? AND session_id = ?").bind(fromRepo, me, sessionId).run();
    await tellSession(env, me, s.label, fromRepo, `this session follows its repo again${fromRepo ? `, which belongs to #${fromRepo}` : ", which isn't in a project"}.`);
    return `${s.label} follows its repo again${fromRepo ? ` (#${fromRepo})` : ""}`;
  }
  const target = await requireProject(env, me, project);
  let linked = "";
  if (scope === "repo") {
    if (!s.repo) throw new UserError(`${s.label} hasn't reported its repo yet; set the project for this session only.`);
    const other = await env.DB.prepare(
      `SELECT p.name FROM projects p JOIN project_members pm ON pm.project = p.name AND pm.member = ?2
       WHERE p.name != ?3 AND (p.name = ?1 OR EXISTS (SELECT 1 FROM json_each(p.repos) WHERE lower(value) = ?1)) LIMIT 1`,
    )
      .bind(s.repo, me, target)
      .first<{ name: string }>();
    if (other) throw new UserError(`${s.repo} already belongs to #${other.name}. Move ${s.label} for this session only, or unlink the repo there first.`);
    const row = await env.DB.prepare("SELECT repos FROM projects WHERE name = ?").bind(target).first<{ repos: string }>();
    const repos: string[] = JSON.parse(row?.repos ?? "[]");
    if (s.repo !== target && !repos.includes(s.repo)) {
      repos.push(s.repo);
      await env.DB.prepare("UPDATE projects SET repos = ?, updated_by = ?, updated_at = ? WHERE name = ?").bind(JSON.stringify(repos), me, Date.now(), target).run();
      await postMessage(env, { channel: target, sender: me, kind: "event", body: `linked repo ${s.repo} to #${target}` });
    }
    linked = s.repo;
  }
  await env.DB.prepare("UPDATE sessions SET project_pin = ?, project = ? WHERE member = ? AND session_id = ?")
    .bind(scope === "repo" ? "" : target, target, me, sessionId)
    .run();
  const p = await env.DB.prepare("SELECT rules FROM projects WHERE name = ?").bind(target).first<{ rules: string }>();
  await tellSession(
    env,
    me,
    s.label,
    target,
    `moved this session to #${target}${linked ? ` and linked its repo ${linked} there, so future sessions in it join #${target} too` : ""}. From now on you work in #${target}: ${
      p?.rules ? `follow its rules:\n${p.rules.slice(0, 1500)}` : "it has no rules yet"
    }\nThe projects tool shows its members and crew roles; handoffs and decisions show its records.`,
  );
  return linked ? `${s.label} moved to #${target}; ${linked} now belongs to #${target}` : `${s.label} moved to #${target} (this session only)`;
}

/** A notice from the user to one of their sessions, delivered with its next turn (not a prompt). */
async function tellSession(env: Env, me: string, label: string, project: string, body: string): Promise<void> {
  await postMessage(env, { channel: project || "dm", sender: me, sender_agent: null, recipient: me, recipient_agent: label, kind: "event", body });
  env.refreshWeb?.(me);
}
