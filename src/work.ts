// Your work log (view=work): what your agents brought you and what you decided, day by day: tickets sent, decided,
// shipped or dropped; MRs reviewed, sent back, merged; deploys and handoffs. Stats over a week or a month (how long
// things wait for you, lead time, how often you go along with each agent), a CSV of it all, and an evening summary
// on your phone. Days are your days: the time zone your browser reports.

import { type Env, UserError } from "./lib";
import { OUTCOMES, type Review, type ReviewDecision, findingsOf } from "./reviews";
import { reviewHref } from "./reviewview";
import { TICKET_OUTCOMES, type Ticket, type TicketDecision } from "./tickets";
import { ticketHref } from "./ticketview";
import { agentAvatar, esc, hidden, icon } from "./ui";

const DAY = 86_400_000;

// ---- days in your time zone ----

export function validTz(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** Minutes the zone is ahead of UTC at `at`. */
function offsetMin(tz: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(at));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Math.round((Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(at / 1000) * 1000) / 60000);
}

/** "2026-11-02" for `at`, in the zone. */
export function dateIn(tz: string, at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

/** The moment it's `hour`:00 on `date` in the zone. */
export function localTime(date: string, hour: number, tz: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, hour);
  let t = guess - offsetMin(tz, guess) * 60000;
  const again = guess - offsetMin(tz, t) * 60000; // across a DST change
  if (again !== t) t = again;
  return t;
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const clock = (tz: string, at: number) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at));
const dayLabel = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(`${date}T12:00:00Z`));

/** Monday of the week `date` is in. */
const weekStart = (date: string) => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));

// ---- settings ----

export interface WorkSettings {
  tz: string;
  summary_on: number;
  summary_hour: number;
}

export async function workSettings(env: Env, me: string): Promise<WorkSettings> {
  const s = await env.DB.prepare("SELECT tz, summary_on, summary_hour FROM work_settings WHERE member = ?").bind(me).first<WorkSettings>();
  return s ?? { tz: "UTC", summary_on: 0, summary_hour: 18 };
}

/** Turn the evening summary on or off, at an hour, in the browser's time zone; schedules the next one. */
export async function saveWorkSettings(env: Env, me: string, on: boolean, hour: number, tz: string): Promise<string> {
  const h = Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 18;
  const zone = validTz(tz);
  await env.DB.prepare(
    "INSERT INTO work_settings (member, tz, summary_on, summary_hour) VALUES (?, ?, ?, ?) ON CONFLICT(member) DO UPDATE SET tz = excluded.tz, summary_on = excluded.summary_on, summary_hour = excluded.summary_hour",
  )
    .bind(me, zone, on ? 1 : 0, h)
    .run();
  await env.DB.prepare("DELETE FROM push_queue WHERE member = ? AND ref = 's'").bind(me).run();
  if (on) await scheduleSummary(env, me);
  env.refreshWeb?.(me);
  return on ? `Evening summary on, at ${String(h).padStart(2, "0")}:00 (${zone})` : "Evening summary off";
}

/** Queue the next evening summary (push ref "s"). */
export async function scheduleSummary(env: Env, me: string, now = Date.now()): Promise<void> {
  const s = await workSettings(env, me);
  if (!s.summary_on) return;
  const today = dateIn(s.tz, now);
  let at = localTime(today, s.summary_hour, s.tz);
  if (at <= now + 60_000) at = localTime(addDays(today, 1), s.summary_hour, s.tz);
  await env.DB.prepare("DELETE FROM push_queue WHERE member = ? AND ref = 's'").bind(me).run();
  await env.DB.prepare("INSERT INTO push_queue (member, ref, due_at, extra) VALUES (?, 's', ?, ?)").bind(me, at, dateIn(s.tz, at)).run();
  await env.wake?.(at);
}

// ---- what happened ----

export type Kind = "ticket-in" | "ticket-decided" | "ticket-done" | "ticket-dropped" | "review-in" | "review-decided" | "review-closed" | "deploy" | "handoff" | "decision";

export interface WorkEvent {
  at: number;
  kind: Kind;
  agent: string; // the agent's label, or ""
  what: string; // the line, as plain text
  title: string; // the ticket's or MR's title, etc.
  href: string;
  tone: "" | "ok" | "bad" | "warn";
  outcome?: string; // for decisions: the outcome's key
}

interface Range {
  from: number;
  to: number;
}

const parse = <T>(s: string | null): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};

/** Everything in [from, to), oldest first. */
export async function workEvents(env: Env, me: string, { from, to }: Range): Promise<WorkEvent[]> {
  const out: WorkEvent[] = [];
  const within = (t: number | null | undefined) => t != null && t >= from && t < to;
  const { results: tickets } = await env.DB.prepare(
    "SELECT * FROM tickets WHERE member = ?1 AND ((created_at >= ?2 AND created_at < ?3) OR (decided_at >= ?2 AND decided_at < ?3) OR (outcome_at >= ?2 AND outcome_at < ?3))",
  )
    .bind(me, from, to)
    .all<Ticket>();
  for (const t of tickets) {
    const href = ticketHref(t.id);
    if (within(t.created_at)) out.push({ at: t.created_at, kind: "ticket-in", agent: t.label, what: `${t.label} sent ${t.key}`, title: t.title, href, tone: "" });
    const dec = parse<TicketDecision>(t.decision);
    if (t.status === "decided" && dec && within(t.decided_at))
      out.push({
        at: t.decided_at!,
        kind: "ticket-decided",
        agent: t.label,
        what: `You decided ${TICKET_OUTCOMES[dec.outcome]} on ${t.key}`,
        title: t.title,
        href,
        tone: dec.outcome === "decline" ? "bad" : dec.outcome === "park" ? "" : "ok",
        outcome: dec.outcome,
      });
    if (t.outcome && within(t.outcome_at))
      out.push({
        at: t.outcome_at!,
        kind: t.outcome === "done" ? "ticket-done" : "ticket-dropped",
        agent: t.label,
        what: t.outcome === "done" ? `${t.key} ${t.merged ? "shipped" : "done"}${t.outcome_note ? `: ${t.outcome_note}` : ""}` : `${t.key} dropped${t.outcome_note ? `: ${t.outcome_note}` : ""}`,
        title: t.title,
        href: t.outcome_mr || href,
        tone: t.outcome === "done" ? "ok" : "warn",
      });
  }
  const { results: reviews } = await env.DB.prepare(
    "SELECT * FROM reviews WHERE member = ?1 AND ((created_at >= ?2 AND created_at < ?3) OR (decided_at >= ?2 AND decided_at < ?3) OR (closed_at >= ?2 AND closed_at < ?3))",
  )
    .bind(me, from, to)
    .all<Review>();
  for (const r of reviews) {
    const href = reviewHref(r.id);
    if (within(r.created_at)) out.push({ at: r.created_at, kind: "review-in", agent: r.label, what: `${r.label} reviewed an MR`, title: r.title, href, tone: "" });
    const dec = parse<ReviewDecision>(r.decision);
    if (r.status === "decided" && dec && within(r.decided_at))
      out.push({
        at: r.decided_at!,
        kind: "review-decided",
        agent: r.label,
        what: `You decided ${OUTCOMES[dec.outcome]}`,
        title: r.title,
        href,
        tone: dec.outcome === "request_changes" ? "bad" : dec.outcome === "hold" ? "warn" : "ok",
        outcome: dec.outcome,
      });
    if (r.closed && within(r.closed_at)) out.push({ at: r.closed_at!, kind: "review-closed", agent: r.label, what: r.closed === "merged" ? "Merged" : "Closed without merging", title: r.title, href: r.url, tone: r.closed === "merged" ? "ok" : "" });
  }
  const { results: deploys } = await env.DB.prepare(
    "SELECT body, created_at, sender_agent, channel FROM messages WHERE sender = ? AND kind = 'event' AND body LIKE 'released lock deploy:%' AND created_at >= ? AND created_at < ?",
  )
    .bind(me, from, to)
    .all<{ body: string; created_at: number; sender_agent: string | null; channel: string }>();
  for (const d of deploys) {
    const m = /^released lock (\S+?)(?: \(forced\))?(?: — (.*))?$/s.exec(d.body);
    out.push({ at: d.created_at, kind: "deploy", agent: d.sender_agent ?? "", what: `Deployed ${(m?.[1] ?? "").replace(/^deploy:/, "")}`, title: m?.[2] ?? "", href: `/dashboard?channel=${encodeURIComponent(d.channel)}`, tone: "" });
  }
  const { results: handoffs } = await env.DB.prepare(
    "SELECT id, project, author_agent, to_agent, summary, result, updated_at FROM handoffs WHERE (author = ?1 OR to_member = ?1) AND status = 'integrated' AND updated_at >= ?2 AND updated_at < ?3",
  )
    .bind(me, from, to)
    .all<{ id: number; project: string; author_agent: string | null; to_agent: string | null; summary: string; result: string; updated_at: number }>();
  for (const h of handoffs)
    out.push({ at: h.updated_at, kind: "handoff", agent: h.to_agent ?? "", what: `Handoff H${h.id} integrated${h.result ? ` as ${h.result}` : ""}`, title: h.summary, href: `/dashboard?channel=${encodeURIComponent(h.project)}`, tone: "ok" });
  // The decision log, besides the ticket and review decisions already above.
  const { results: decisions } = await env.DB.prepare(
    "SELECT id, project, author_agent, subject, verdict, created_at FROM decisions WHERE author = ? AND created_at >= ? AND created_at < ? AND subject NOT LIKE 'ticket %' AND subject NOT LIKE 'review of %'",
  )
    .bind(me, from, to)
    .all<{ id: number; project: string; author_agent: string | null; subject: string; verdict: string; created_at: number }>();
  for (const d of decisions)
    out.push({ at: d.created_at, kind: "decision", agent: d.author_agent ?? "", what: `D${d.id} ${d.verdict}`, title: d.subject, href: `/dashboard?channel=${encodeURIComponent(d.project)}`, tone: d.verdict === "approved" ? "ok" : d.verdict === "rejected" ? "bad" : "" });
  return out.sort((a, b) => a.at - b.at);
}

// ---- stats ----

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function duration(ms: number | null): string {
  if (ms == null) return "–";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = ms / 3_600_000;
  if (h < 24) return `${h < 10 ? h.toFixed(1).replace(/\.0$/, "") : Math.round(h)}h`;
  const d = ms / DAY;
  return `${d < 10 ? d.toFixed(1).replace(/\.0$/, "") : Math.round(d)}d`;
}

export interface AgentStats {
  label: string;
  tickets: number;
  decided: number;
  agreed: number; // you went with its recommendation
  changed: number; // go with changes
  shipped: number;
  reviews: number;
  reviewsDecided: number;
  reviewsAgreed: number;
  findings: number;
  kept: number; // findings you posted
}

export interface Stats {
  ticketsIn: number;
  decided: Record<string, number>;
  shipped: number;
  merged: number;
  dropped: number;
  reviewsIn: number;
  reviewed: Record<string, number>;
  mrsMerged: number;
  findings: number;
  kept: number;
  deploys: number;
  handoffs: number;
  decisions: number;
  waitMs: number | null; // from sent to your decision, median
  leadMs: number | null; // from go to done, median
  agents: AgentStats[];
}

export async function workStats(env: Env, me: string, range: Range, events: WorkEvent[]): Promise<Stats> {
  const s: Stats = { ticketsIn: 0, decided: {}, shipped: 0, merged: 0, dropped: 0, reviewsIn: 0, reviewed: {}, mrsMerged: 0, findings: 0, kept: 0, deploys: 0, handoffs: 0, decisions: 0, waitMs: null, leadMs: null, agents: [] };
  const agents = new Map<string, AgentStats>();
  const agent = (label: string) => {
    let a = agents.get(label);
    if (!a) agents.set(label, (a = { label, tickets: 0, decided: 0, agreed: 0, changed: 0, shipped: 0, reviews: 0, reviewsDecided: 0, reviewsAgreed: 0, findings: 0, kept: 0 }));
    return a;
  };
  const waits: number[] = [];
  const leads: number[] = [];
  const { results: tickets } = await env.DB.prepare("SELECT * FROM tickets WHERE member = ?1 AND ((created_at >= ?2 AND created_at < ?3) OR (decided_at >= ?2 AND decided_at < ?3) OR (outcome_at >= ?2 AND outcome_at < ?3))")
    .bind(me, range.from, range.to)
    .all<Ticket>();
  const inRange = (t: number | null) => t != null && t >= range.from && t < range.to;
  for (const t of tickets) {
    const a = agent(t.label);
    if (inRange(t.created_at)) {
      s.ticketsIn++;
      a.tickets++;
    }
    const dec = parse<TicketDecision>(t.decision);
    if (t.status === "decided" && dec && inRange(t.decided_at)) {
      s.decided[dec.outcome] = (s.decided[dec.outcome] ?? 0) + 1;
      a.decided++;
      if (dec.outcome === t.recommend) a.agreed++;
      if (dec.outcome === "go_changes") a.changed++;
      waits.push(t.decided_at! - t.created_at);
    }
    if (t.outcome && inRange(t.outcome_at)) {
      if (t.outcome === "done") {
        s.shipped++;
        a.shipped++;
        if (t.merged) s.merged++;
        if (t.decided_at) leads.push(t.outcome_at! - t.decided_at);
      } else s.dropped++;
    }
  }
  const { results: reviews } = await env.DB.prepare("SELECT * FROM reviews WHERE member = ?1 AND ((created_at >= ?2 AND created_at < ?3) OR (decided_at >= ?2 AND decided_at < ?3) OR (closed_at >= ?2 AND closed_at < ?3))")
    .bind(me, range.from, range.to)
    .all<Review>();
  for (const r of reviews) {
    const a = agent(r.label);
    if (inRange(r.created_at)) {
      s.reviewsIn++;
      a.reviews++;
    }
    const dec = parse<ReviewDecision>(r.decision);
    if (r.status === "decided" && dec && inRange(r.decided_at)) {
      s.reviewed[dec.outcome] = (s.reviewed[dec.outcome] ?? 0) + 1;
      a.reviewsDecided++;
      if (dec.outcome === r.recommend) a.reviewsAgreed++;
      waits.push(r.decided_at! - r.created_at);
      const fs = findingsOf(r);
      fs.forEach((f, i) => {
        s.findings++;
        a.findings++;
        if (dec.findings[i]?.post ?? f.post) {
          s.kept++;
          a.kept++;
        }
      });
    }
    if (r.closed === "merged" && inRange(r.closed_at)) s.mrsMerged++;
  }
  for (const e of events) {
    if (e.kind === "deploy") s.deploys++;
    else if (e.kind === "handoff") s.handoffs++;
    else if (e.kind === "decision") s.decisions++;
  }
  s.waitMs = median(waits);
  s.leadMs = median(leads);
  s.agents = [...agents.values()].filter((a) => a.tickets || a.decided || a.shipped || a.reviews || a.reviewsDecided).sort((x, y) => y.decided + y.reviewsDecided + y.shipped - (x.decided + x.reviewsDecided + x.shipped));
  return s;
}

/** Tickets you said go to that aren't reported done or dropped yet, oldest first. */
async function inProgress(env: Env, me: string): Promise<Ticket[]> {
  const { results } = await env.DB.prepare("SELECT * FROM tickets WHERE member = ? AND status = 'decided' AND outcome = '' ORDER BY decided_at").bind(me).all<Ticket>();
  return results.filter((t) => {
    const d = parse<TicketDecision>(t.decision);
    return d?.outcome === "go" || d?.outcome === "go_changes";
  });
}

// ---- the evening summary ----

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One day in a sentence or two, for the notification; null when nothing happened. */
export async function daySummary(env: Env, me: string, date: string): Promise<{ title: string; body: string } | null> {
  const s = await workSettings(env, me);
  const range = { from: localTime(date, 0, s.tz), to: localTime(addDays(date, 1), 0, s.tz) };
  const events = await workEvents(env, me, range);
  if (!events.length) return null;
  const st = await workStats(env, me, range, events);
  const decided = Object.values(st.decided).reduce((n, v) => n + v, 0);
  const reviewed = Object.values(st.reviewed).reduce((n, v) => n + v, 0);
  const sentBack = st.reviewed.request_changes ?? 0;
  const head = [st.shipped ? `${st.shipped} shipped` : "", decided ? `${decided} decided` : "", reviewed ? `${reviewed} reviewed` : ""].filter(Boolean);
  const title = head.length ? `Today: ${head.join(", ")}` : "Today in your work log";
  const parts = [
    decided ? `Tickets: ${decided} decided (${Object.entries(st.decided).map(([k, v]) => `${v} ${TICKET_OUTCOMES[k as keyof typeof TICKET_OUTCOMES]}`).join(", ")})${st.shipped ? `, ${st.shipped} shipped` : ""}.` : st.shipped ? `${plural(st.shipped, "ticket")} shipped.` : "",
    reviewed ? `MRs: ${reviewed} reviewed${sentBack ? `, ${sentBack} sent back` : ""}${st.mrsMerged ? `, ${st.mrsMerged} merged` : ""}.` : "",
    st.deploys ? `${plural(st.deploys, "deploy")}.` : "",
    st.handoffs ? `${plural(st.handoffs, "handoff")} integrated.` : "",
  ].filter(Boolean);
  const waiting = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM tickets WHERE member = ?1 AND status = 'open') + (SELECT COUNT(*) FROM reviews WHERE member = ?1 AND status = 'open') AS n").bind(me).first<{ n: number }>();
  if (waiting?.n) parts.push(`${waiting.n} still waiting for you.`);
  if (!parts.length) parts.push(`${plural(events.length, "thing")} in your work log.`);
  return { title, body: parts.join(" ") };
}

// ---- the view ----

const KIND_ICON: Record<Kind, string> = {
  "ticket-in": "file",
  "ticket-decided": "check",
  "ticket-done": "sparkles",
  "ticket-dropped": "x",
  "review-in": "eye",
  "review-decided": "check",
  "review-closed": "branch",
  deploy: "refresh",
  handoff: "arrow",
  decision: "flag",
};

function eventRow(me: string, tz: string, e: WorkEvent, back: string): string {
  const ext = /^https?:/.test(e.href);
  const to = /^\/dashboard\?view=(ticket|review)&/.test(e.href) ? `${e.href}&back=${encodeURIComponent(back)}` : e.href;
  return `<a class="wkev k-${e.kind}${e.tone ? ` t-${e.tone}` : ""}" href="${esc(to)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>
    <time class="wkt">${clock(tz, e.at)}</time>
    <span class="wkic">${icon(KIND_ICON[e.kind], 13)}</span>
    <span class="wkx"><span class="wkw">${esc(e.what)}</span>${e.title ? `<span class="wktt">${esc(e.title)}</span>` : ""}</span>
    ${e.agent ? agentAvatar(me, e.agent, "s") : ""}
  </a>`;
}

const tile = (label: string, value: string, sub = "") => `<div class="wktile"><span class="wkl">${label}</span><b class="wkv">${value}</b>${sub ? `<span class="wks">${sub}</span>` : ""}</div>`;
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "–");

/** Bars per day: what got decided or shipped, so a busy day stands out. Hover a bar for the day's numbers. */
function dayBars(days: string[], events: WorkEvent[], tz: string, base: string): string {
  const counted = new Set<Kind>(["ticket-decided", "ticket-done", "review-decided", "deploy", "handoff"]);
  const per = new Map(days.map((d) => [d, { n: 0, shipped: 0, decided: 0, reviewed: 0, other: 0 }]));
  for (const e of events) {
    if (!counted.has(e.kind)) continue;
    const c = per.get(dateIn(tz, e.at));
    if (!c) continue;
    c.n++;
    if (e.kind === "ticket-done") c.shipped++;
    else if (e.kind === "ticket-decided") c.decided++;
    else if (e.kind === "review-decided") c.reviewed++;
    else c.other++;
  }
  const max = Math.max(1, ...[...per.values()].map((c) => c.n));
  const short = days.length > 10;
  return `<div class="wkbars${short ? " dense" : ""}" role="img" aria-label="Things decided or shipped per day">${days
    .map((d) => {
      const c = per.get(d)!;
      const tip = `${dayLabel(d, { weekday: "short", day: "numeric", month: "short" })}: ${c.n ? [c.decided ? `${c.decided} ticket${c.decided > 1 ? "s" : ""} decided` : "", c.shipped ? `${c.shipped} shipped` : "", c.reviewed ? `${c.reviewed} MR${c.reviewed > 1 ? "s" : ""} reviewed` : "", c.other ? `${c.other} deploy${c.other > 1 ? "s" : ""} or handoff${c.other > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ") : "nothing"}`;
      return `<a class="wkbar" href="${base}&amp;range=day&amp;date=${d}" data-tip="${esc(tip)}" aria-label="${esc(tip)}"><span class="wkbarv" style="--h:${Math.round((c.n / max) * 100)}"></span><span class="wkbarl">${short ? Number(d.slice(8)) : dayLabel(d, { weekday: "short" })}</span></a>`;
    })
    .join("")}</div>`;
}

export async function workView(env: Env, me: string, url: URL, cookieTz: string | null): Promise<string> {
  const settings = await workSettings(env, me);
  const tz = validTz(cookieTz || settings.tz);
  const today = dateIn(tz, Date.now());
  const range = (["day", "week", "month"] as const).find((r) => r === url.searchParams.get("range")) ?? "day";
  const asked = url.searchParams.get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today;
  const first = range === "day" ? date : range === "week" ? weekStart(date) : `${date.slice(0, 8)}01`;
  const next = range === "day" ? addDays(first, 1) : range === "week" ? addDays(first, 7) : (() => {
    const [y, m] = first.split("-").map(Number) as [number, number];
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  })();
  const prev = range === "day" ? addDays(first, -1) : range === "week" ? addDays(first, -7) : (() => {
    const [y, m] = first.split("-").map(Number) as [number, number];
    return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
  })();
  const span = { from: localTime(first, 0, tz), to: localTime(next, 0, tz) };
  const events = await workEvents(env, me, span);
  const st = await workStats(env, me, span, events);
  const going = await inProgress(env, me);
  const base = "/dashboard?view=work";
  const self = `${base}&range=${range}&date=${date}`;
  const href = (r: string, d: string) => `${base}&amp;range=${r}&amp;date=${d}`;

  const title =
    range === "day"
      ? date === today
        ? "Today"
        : date === addDays(today, -1)
          ? "Yesterday"
          : dayLabel(date)
      : range === "week"
        ? `${dayLabel(first, { day: "numeric", month: "short" })} – ${dayLabel(addDays(next, -1), { day: "numeric", month: "short", year: "numeric" })}`
        : dayLabel(first, { month: "long", year: "numeric" });
  const isNow = today >= first && today < next;

  const decided = Object.values(st.decided).reduce((n, v) => n + v, 0);
  const reviewed = Object.values(st.reviewed).reduce((n, v) => n + v, 0);
  const tiles = [
    tile("Tickets decided", String(decided), decided ? Object.entries(st.decided).map(([k, v]) => `${v} ${esc(TICKET_OUTCOMES[k as keyof typeof TICKET_OUTCOMES])}`).join(" · ") : `${st.ticketsIn} sent to you`),
    tile("Shipped", String(st.shipped), st.dropped ? `${st.dropped} dropped` : st.merged ? `${st.merged} merged` : ""),
    tile("MRs reviewed", String(reviewed), reviewed ? `${st.reviewed.request_changes ?? 0} sent back${st.mrsMerged ? ` · ${st.mrsMerged} merged` : ""}` : `${st.reviewsIn} sent to you`),
    tile("Deploys", String(st.deploys), st.handoffs ? `${st.handoffs} handoff${st.handoffs > 1 ? "s" : ""} integrated` : ""),
    tile("Waited for you", duration(st.waitMs), "median, sent to decided"),
    tile("Lead time", duration(st.leadMs), "median, go to done"),
  ].join("");

  // The timeline: one day as it went; a week or month by day, newest day first.
  const byDay = new Map<string, WorkEvent[]>();
  for (const e of events) {
    const d = dateIn(tz, e.at);
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }
  const timeline = events.length
    ? range === "day"
      ? `<div class="wklist">${events.map((e) => eventRow(me, tz, e, self)).join("")}</div>`
      : [...byDay.entries()]
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .map(([d, es]) => `<div class="wkday"><a class="wkdayh" href="${href("day", d)}">${esc(dayLabel(d, { weekday: "long", day: "numeric", month: "short" }))}<span class="badge">${es.length}</span></a><div class="wklist">${es.map((e) => eventRow(me, tz, e, self)).join("")}</div></div>`)
          .join("")
    : `<div class="wkempty">${icon("clock", 18)}<p>${isNow ? "Nothing yet. What your agents bring you and what you decide shows up here as it happens." : "Nothing happened then."}</p></div>`;

  const days: string[] = [];
  if (range !== "day") for (let d = first; d < next; d = addDays(d, 1)) days.push(d);

  const agentsTable = st.agents.length
    ? `<div class="wkbox"><h3 class="wkh">${icon("users", 14)}Per agent</h3><div class="wkscroll"><table class="wktable"><thead><tr><th>Agent</th><th title="Tickets decided / sent">Tickets</th><th title="You went with its recommendation">Agreed</th><th>Shipped</th><th title="Reviews decided / sent">Reviews</th><th title="Findings you posted">Kept</th></tr></thead><tbody>${st.agents
        .map(
          (a) =>
            `<tr><td><span class="wkag">${agentAvatar(me, a.label, "s")}${esc(a.label)}</span></td><td>${a.decided}<span class="muted">/${a.tickets}</span></td><td title="${a.changed ? `You changed its plan ${a.changed}×` : ""}">${a.decided ? pct(a.agreed, a.decided) : "–"}</td><td>${a.shipped || "–"}</td><td>${a.reviewsDecided}<span class="muted">/${a.reviews}</span></td><td>${a.findings ? pct(a.kept, a.findings) : "–"}</td></tr>`,
        )
        .join("")}</tbody></table></div><p class="wknote">Agreed: you decided what it recommended (hover it for how often you changed its plan). Kept: the review findings you posted.</p></div>`
    : "";
  const progress = going.length
    ? `<div class="wkbox"><h3 class="wkh">${icon("clock", 14)}In progress <span class="badge">${going.length}</span></h3><div class="wkgo">${going
        .map((t) => `<a class="wkgoi" href="${esc(ticketHref(t.id, `${base}&range=${range}&date=${date}`))}">${agentAvatar(me, t.label, "s")}<span class="wkx"><span class="wkw">${esc(t.key)}</span><span class="wktt">${esc(t.title)}</span></span><span class="wkage" title="Since you said go">${duration(Date.now() - (t.decided_at ?? t.created_at))}</span></a>`)
        .join("")}</div><p class="wknote">Tickets you said go to that their agent hasn't reported done yet.</p></div>`
    : "";
  const reviewsBox =
    st.findings || reviewed
      ? `<div class="wkbox"><h3 class="wkh">${icon("eye", 14)}Reviews</h3><dl class="wkdl">${Object.entries(st.reviewed)
          .map(([k, v]) => `<div><dt>${esc(OUTCOMES[k as keyof typeof OUTCOMES] ?? k)}</dt><dd>${v}</dd></div>`)
          .join("")}<div><dt>Findings posted</dt><dd>${st.kept}<span class="muted">/${st.findings}</span></dd></div>${st.mrsMerged ? `<div><dt>Merged since</dt><dd>${st.mrsMerged}</dd></div>` : ""}</dl></div>`
      : "";

  const summary = `<form method="post" action="/work/settings" class="wksum" data-quiet>${hidden({ back: `${base}&range=${range}&date=${date}` })}<input type="hidden" name="tz" value="${esc(tz)}" data-tz>
    ${icon("bell", 14)}<label class="wkswitch"><input type="checkbox" name="on" value="1"${settings.summary_on ? " checked" : ""} onchange="this.form.requestSubmit()"><span>Evening summary</span></label>
    <select name="hour" onchange="this.form.requestSubmit()" aria-label="When">${Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === settings.summary_hour ? " selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("")}</select>
  </form>`;

  return `<div class="pane-in wkpane">
    <header class="wkhead">
      <div class="wktitle"><h1>${esc(title)}</h1><span class="wkzone">${esc(tz.replace(/_/g, " "))}</span></div>
      <div class="wkctl">
        <div class="rvseg wkrange">${(["day", "week", "month"] as const).map((r) => `<a href="${href(r, date)}"${r === range ? ' class="on"' : ""}>${r[0]!.toUpperCase() + r.slice(1)}</a>`).join("")}</div>
        <div class="wknav"><a class="btn ghost sm icon wkprev" href="${href(range, prev)}" title="Earlier">${icon("chevron", 15)}</a>${isNow ? "" : `<a class="btn ghost sm" href="${href(range, today)}">Today</a>`}${next <= today ? `<a class="btn ghost sm icon wknext" href="${href(range, next)}" title="Later">${icon("chevron", 15)}</a>` : ""}</div>
        <span class="grow"></span>
        ${summary}
        <a class="btn ghost sm" href="/work.csv?from=${first}&amp;to=${next}&amp;tz=${encodeURIComponent(tz)}" download>${icon("download", 14)}CSV</a>
      </div>
    </header>
    <div class="wktiles">${tiles}</div>
    ${days.length ? `<div class="wkbox wkchart"><h3 class="wkh">Decided or shipped, per day</h3>${dayBars(days, events, tz, base)}</div>` : ""}
    <div class="wkgrid">
      <section class="wkmain">${timeline}</section>
      <aside class="wkside">${progress}${agentsTable}${reviewsBox}</aside>
    </div>
  </div>`;
}

/** Everything in a date range as CSV, one row per event. */
export async function workCsv(env: Env, me: string, from: string, to: string, tzRaw: string | null): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to <= from) throw new UserError("from and to must be dates (YYYY-MM-DD), to after from.");
  const tz = validTz(tzRaw || (await workSettings(env, me)).tz);
  const events = await workEvents(env, me, { from: localTime(from, 0, tz), to: localTime(to, 0, tz) });
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = events.map((e) => [dateIn(tz, e.at), clock(tz, e.at), e.kind, e.outcome ?? "", e.agent, e.what, e.title, /^https?:/.test(e.href) ? e.href : ""].map(cell).join(","));
  return ["date,time,kind,outcome,agent,what,title,link", ...rows].join("\n") + "\n";
}
