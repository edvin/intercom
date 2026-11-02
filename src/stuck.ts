// Sessions that don't take their messages: connected, but idle in a way nothing can wake (a Codex session between turns,
// a turn that stopped on a usage limit or "model at capacity"), or simply not reading. Agents that DM one and wait
// would wait forever, so: the senders are told when they send, the person gets a card in Waiting for you (and one
// notification), and from there moves the waiting messages to another agent, tells the senders not to wait, or
// dismisses it.

import { type Env, GONE_MS, UserError, address, ago, liveIds, postMessage } from "./lib";
import { onlineAgents } from "./reviews";

/** Unread this long, a message counts as stuck; sooner when the session can't take it at all (an idle Codex session, a failed turn). */
export const STUCK_MS = 30 * 60_000;
export const CANT_TAKE_MS = 5 * 60_000;
const WINDOW_MS = 7 * 86_400_000; // older than this is history, not something anyone still waits for

export interface Waiting {
  id: number;
  channel: string;
  sender: string;
  sender_agent: string | null;
  kind: string;
  body: string;
  created_at: number;
  from_user: number;
  delegated: number;
  via: string | null;
}

export interface Stuck {
  agent: string; // the address part: a session's label (or a project)
  reason: string; // why it isn't taking them, for people
  since: number; // the oldest waiting message
  messages: Waiting[];
  handoffs: { id: number; summary: string; created_at: number }[];
  maxId: number;
  client: string;
  /** Why, in plain words for the card, and what wakes it. */
  explain: string;
  /** Its terminal can be typed into from here (screen.ts): "wake it now" works. */
  wake: boolean;
}

interface SessionRow {
  session_id: string;
  label: string;
  project: string;
  client: string;
  state: string;
  state_detail: string;
  last_seen: number;
  active_at: number | null;
  host: string;
  screen: string;
}

/** Why a session can't take messages now, if it can't: "" when it can (as far as the hub knows). */
export async function cantTake(env: Env, member: string, agent: string): Promise<{ reason: string; client: string; activeAt: number | null; host: string; wake: boolean }> {
  const { results } = await env.DB.prepare(
    "SELECT session_id, label, project, client, state, state_detail, last_seen, active_at, host, screen FROM sessions WHERE member = ?1 AND (label = ?2 OR project = ?2) ORDER BY last_seen DESC LIMIT 20",
  )
    .bind(member, agent)
    .all<SessionRow>();
  if (!results.length) return { reason: "", client: "", activeAt: null, host: "", wake: false };
  const live = new Set(liveIds(env, member));
  const up = results.filter((s) => live.has(s.session_id) || Date.now() - s.last_seen < GONE_MS);
  const s = results[0]!;
  const activeAt = Math.max(...results.map((r) => r.active_at ?? 0)) || null;
  if (!up.length) return { reason: `not connected (last seen ${ago(s.last_seen)})`, client: s.client, activeAt, host: s.host, wake: false };
  // A project address is fine while any of its sessions can take it.
  const able = up.filter((r) => !(r.client === "codex" && r.state === "idle") && !(r.state === "waiting" && /limit|login|account/i.test(r.state_detail)));
  const wake = up.some((r) => r.screen === "keys");
  if (able.length) return { reason: "", client: s.client, activeAt, host: s.host, wake };
  const u = up[0]!;
  if (u.state === "waiting") return { reason: `stopped: ${u.state_detail}`, client: u.client, activeAt, host: u.host, wake };
  return { reason: "idle between turns (a Codex session takes messages only when a turn starts, so only typing in its terminal wakes it)", client: u.client, activeAt, host: u.host, wake };
}

/** Your sessions with direct messages waiting too long, oldest first; dismissed ones only come back with a newer message. */
export async function stuckSessions(env: Env, me: string, now = Date.now()): Promise<Stuck[]> {
  const since = Number((await env.DB.prepare("SELECT value FROM settings WHERE key = 'deliveries_since'").first<{ value: string }>())?.value ?? 0);
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.channel, m.sender, m.sender_agent, m.recipient_agent, m.kind, m.body, m.created_at, m.from_user, m.delegated, m.via FROM messages m
     WHERE m.recipient = ?1 AND m.recipient_agent IS NOT NULL AND m.id > ?2 AND m.created_at > ?3 AND m.kind != 'event'
       AND m.cancelled_at IS NULL AND m.held_at IS NULL
       AND NOT (m.sender = ?1 AND m.sender_agent = m.recipient_agent)
       AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.message_id = m.id)
     ORDER BY m.id`,
  )
    .bind(me, since, now - WINDOW_MS)
    .all<Waiting & { recipient_agent: string }>();
  if (!results.length) return [];
  const groups = new Map<string, (Waiting & { recipient_agent: string })[]>();
  for (const m of results) groups.set(m.recipient_agent, [...(groups.get(m.recipient_agent) ?? []), m]);
  const { results: marks } = await env.DB.prepare("SELECT agent, dismissed_upto FROM stuck_marks WHERE member = ?").bind(me).all<{ agent: string; dismissed_upto: number }>();
  const dismissed = new Map(marks.map((k) => [k.agent, k.dismissed_upto]));
  const out: Stuck[] = [];
  for (const [agent, msgs] of groups) {
    const maxId = msgs[msgs.length - 1]!.id;
    if ((dismissed.get(agent) ?? 0) >= maxId) continue;
    const oldest = msgs[0]!.created_at;
    const why = await cantTake(env, me, agent);
    const late = now - oldest >= STUCK_MS;
    if (!late && !(why.reason && now - oldest >= CANT_TAKE_MS)) continue;
    const { results: handoffs } = await env.DB.prepare("SELECT id, summary, created_at FROM handoffs WHERE to_member = ? AND to_agent = ? AND status = 'pending' ORDER BY id")
      .bind(me, agent)
      .all<{ id: number; summary: string; created_at: number }>();
    const on = why.host ? ` on ${why.host}` : "";
    const explain = why.reason.startsWith("idle")
      ? `It's a Codex session that finished its last turn${why.activeAt ? ` ${ago(why.activeAt)}` : ""}. Codex only reads new messages when a turn starts, so it won't see these until someone types in its terminal${on}.`
      : why.reason.startsWith("stopped")
        ? `Its last turn stopped (${why.reason.slice(9)}), so it isn't reading. It picks them up when it runs again: type in its terminal${on}.`
        : why.reason.startsWith("not connected")
          ? `Its session isn't running (${why.reason.slice(14, -1)}). The next session with that name gets them.`
          : `It hasn't read anything since ${ago(oldest)}, though it's connected. It may be stuck in a long task or waiting on its terminal${on}.`;
    out.push({ agent, reason: why.reason || `hasn't picked them up since ${ago(oldest)}`, since: oldest, messages: msgs, handoffs, maxId, client: why.client, explain, wake: why.wake });
  }
  return out.sort((a, b) => a.since - b.since);
}

/** For the agent that just sent a DM: a warning when the recipient won't take it soon. "" when all looks well. */
export async function sendWarning(env: Env, member: string, agent: string): Promise<string> {
  const why = await cantTake(env, member, agent);
  const stale = await env.DB.prepare(
    "SELECT MIN(m.created_at) AS at FROM messages m WHERE m.recipient = ? AND m.recipient_agent = ? AND m.kind != 'event' AND m.cancelled_at IS NULL AND m.created_at > ? AND m.created_at < ? AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.message_id = m.id)",
  )
    .bind(member, agent, Date.now() - WINDOW_MS, Date.now() - STUCK_MS)
    .first<{ at: number | null }>();
  const who = address(member, agent);
  if (why.reason && !why.reason.startsWith("not connected"))
    return ` Note: ${who} is ${why.reason}${why.activeAt ? `, last active ${ago(why.activeAt)}` : ""}. Your message waits until it's back: don't block on it. Tell your user if it's urgent, or send it to another agent.`;
  if (stale?.at) return ` Note: ${who} hasn't picked up messages sent ${ago(stale.at)}. It may be stuck: don't block on it; tell your user if it's urgent.`;
  return "";
}

/** A line for `team`: how a connected session is doing with its messages. */
export async function teamNote(env: Env, member: string, label: string): Promise<string> {
  const why = await cantTake(env, member, label);
  const n = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM messages m WHERE m.recipient = ? AND m.recipient_agent = ? AND m.kind != 'event' AND m.cancelled_at IS NULL AND m.created_at > ? AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.message_id = m.id)",
  )
    .bind(member, label, Date.now() - WINDOW_MS)
    .first<{ n: number }>();
  const parts = [why.reason && !why.reason.startsWith("not connected") ? (why.reason.startsWith("idle") ? `idle${why.activeAt ? ` (last active ${ago(why.activeAt)})` : ""}, can't be woken` : why.reason) : "", n?.n ? `${n.n} unread` : ""].filter(Boolean);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

async function mark(env: Env, me: string, agent: string, col: "dismissed_upto" | "notified_oldest", value: number): Promise<void> {
  await env.DB.prepare(`INSERT INTO stuck_marks (member, agent, ${col}) VALUES (?, ?, ?) ON CONFLICT(member, agent) DO UPDATE SET ${col} = excluded.${col}`).bind(me, agent, value).run();
}

async function one(env: Env, me: string, agent: string): Promise<Stuck> {
  const s = (await stuckSessions(env, me)).find((x) => x.agent === agent);
  if (!s) throw new UserError(`Nothing is waiting on ${agent} any more.`);
  return s;
}

/** The senders, each told once (not you yourself, writing from the dashboard). */
async function tellSenders(env: Env, me: string, s: Stuck, body: (m: Waiting) => string): Promise<number> {
  const seen = new Set<string>();
  for (const m of s.messages) {
    if (m.sender === me && !m.sender_agent) continue;
    const key = `${m.sender}/${m.sender_agent ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await postMessage(env, { channel: m.channel, sender: me, sender_agent: null, recipient: m.sender, recipient_agent: m.sender_agent, body: body(m) });
  }
  return seen.size;
}

/** Hand what's waiting on a stuck agent to another of your agents that's around; the senders hear where it went. */
export async function moveStuck(env: Env, me: string, agent: string, to: string): Promise<string> {
  const s = await one(env, me, agent);
  const target = (await onlineAgents(env, me)).find((a) => a.label === to);
  if (!target) throw new UserError(`${to} isn't connected right now.`);
  if (target.label === agent) throw new UserError(`Pick another agent than ${agent}.`);
  for (const m of s.messages) {
    // A new message: the other agent's read position may be past the old one.
    const id = await postMessage(env, {
      channel: m.channel,
      sender: m.sender,
      sender_agent: m.sender_agent,
      recipient: me,
      recipient_agent: to,
      kind: m.kind,
      body: `(Meant for ${agent}, which isn't answering; sent ${ago(m.created_at)}. You take it over.)\n${m.body}`,
      max: 20_000,
      via: m.via,
    });
    await env.DB.prepare("UPDATE messages SET from_user = ?, delegated = ? WHERE id = ?").bind(m.from_user, m.delegated, id).run();
    await env.DB.prepare("UPDATE attachments SET message_id = ? WHERE message_id = ?").bind(id, m.id).run();
    await env.DB.prepare("UPDATE messages SET cancelled_at = ? WHERE id = ?").bind(Date.now(), m.id).run();
  }
  await env.DB.prepare("UPDATE handoffs SET to_agent = ? WHERE to_member = ? AND to_agent = ? AND status = 'pending'").bind(to, me, agent).run();
  const told = await tellSenders(env, me, s, () => `Your message to ${address(me, agent)} went to ${address(me, to)} instead: ${agent} wasn't answering (${s.reason}). Expect the answer from ${to}.`);
  await mark(env, me, agent, "dismissed_upto", s.maxId);
  env.refreshWeb?.(me);
  return `${to} has them now${told ? `; the sender${told > 1 ? "s were" : " was"} told` : ""}`;
}

/** Tell the senders not to wait; the messages stay, for when the agent is back. */
export async function releaseSenders(env: Env, me: string, agent: string): Promise<string> {
  const s = await one(env, me, agent);
  const told = await tellSenders(env, me, s, (m) => `${address(me, agent)} hasn't read your message from ${ago(m.created_at)} (${s.reason}). Don't wait for it: carry on, or ask another agent. It'll see your message when it's back.`);
  await mark(env, me, agent, "dismissed_upto", s.maxId);
  env.refreshWeb?.(me);
  return told ? `The sender${told > 1 ? "s" : ""} won't wait for ${agent} any more` : "Only you were waiting on it";
}

export async function dismissStuck(env: Env, me: string, agent: string): Promise<string> {
  const s = await one(env, me, agent);
  await mark(env, me, agent, "dismissed_upto", s.maxId);
  env.refreshWeb?.(me);
  return `OK. This shows again only if a new message waits on ${agent}`;
}

/** The notification for a stuck agent (push ref "u<agent>"), once per oldest waiting message; null if it isn't stuck (yet). */
export async function stuckNote(env: Env, me: string, agent: string): Promise<{ title: string; body: string; again: number | null } | null> {
  const all = await stuckSessions(env, me);
  const s = all.find((x) => x.agent === agent);
  if (!s) {
    // Not stuck yet: look again when the oldest waiting message would be.
    const w = await env.DB.prepare(
      "SELECT MIN(m.created_at) AS at FROM messages m WHERE m.recipient = ? AND m.recipient_agent = ? AND m.kind != 'event' AND m.cancelled_at IS NULL AND m.held_at IS NULL AND m.created_at > ? AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.message_id = m.id)",
    )
      .bind(me, agent, Date.now() - WINDOW_MS)
      .first<{ at: number | null }>();
    return w?.at ? { title: "", body: "", again: w.at + STUCK_MS + 60_000 } : null;
  }
  const first = s.messages[0]!.id;
  const prev = await env.DB.prepare("SELECT notified_oldest FROM stuck_marks WHERE member = ? AND agent = ?").bind(me, agent).first<{ notified_oldest: number }>();
  if ((prev?.notified_oldest ?? 0) >= first) return null;
  await mark(env, me, agent, "notified_oldest", first);
  const n = s.messages.length;
  return { title: `${agent} isn't taking messages`, body: `${n} message${n > 1 ? "s" : ""} waiting since ${ago(s.since)}: ${s.reason}.`, again: null };
}

/** Wake it from here: type a line into its terminal (screen.ts), which starts a turn that reads what's waiting. */
export async function wakeStuck(env: Env, me: string, agent: string): Promise<string> {
  const s = await one(env, me, agent);
  if (!s.wake) throw new UserError(`${agent}'s terminal can't be reached from here (not in tmux, or keys are off on its machine).`);
  const { askScreen } = await import("./screen");
  await askScreen(env, me, agent, { op: "keys", text: "You have intercom messages waiting: read them and carry on.", enter: true });
  env.refreshWeb?.(me);
  return `Woke ${agent}: it's reading its messages now`;
}
