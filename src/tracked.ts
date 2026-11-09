// Tickets and MRs your agents track for you (view=tracked). The intercom doesn't read any tracker or forge itself: an
// agent that looks after your tickets (a coordinating agent going through Jira and GitLab, say) publishes what it saw
// with the track tool after each look: each ticket and MR with its key (PAY-1234, shop!456) and link, its state, who
// it's waiting on and the next step, and an MR under its ticket. The dashboard groups them by who they wait on (you,
// an agent, someone else), keeps a history of each one's changes, and says when a board hasn't been updated lately.

import type { Stmt } from "./db";
import { type Env, UserError, ago } from "./lib";
import { reviewHref } from "./reviewview";
import { OUTCOMES } from "./reviews";
import { TICKET_OUTCOMES } from "./tickets";
import { ticketHref } from "./ticketview";
import { agentAvatar, esc, icon } from "./ui";

export const STAGES = { you: "Needs you", working: "Agent working", waiting: "Waiting on others", parked: "Parked", done: "Done" } as const;
export type Stage = keyof typeof STAGES;
export const KINDS = ["ticket", "mr", "item"] as const;
type Kind = (typeof KINDS)[number];

export const TRACK_LIMITS = { items: 300, key: 60, url: 500, title: 200, state: 60, who: 80, next: 300, label: 40, labels: 8, refs: 8 };
const DONE_DAYS = 14; // done items stay on the board this long
const EVENT_DAYS = 60;
const STALE_MS = 3 * 3600_000; // a board not published for this long is shown as not current

export interface Facts {
  pipeline?: string;
  approvals?: string;
  conflicts?: boolean;
  threads?: number;
  draft?: boolean;
  assignee?: string;
  priority?: string;
  labels?: string[];
}

export interface Tracked {
  id: number;
  member: string;
  board: string;
  agent: string;
  kind: Kind;
  key: string;
  url: string;
  title: string;
  parent: string;
  state: string;
  stage: Stage;
  waiting_on: string;
  next: string;
  owner: string;
  facts: string;
  refs: string;
  created_at: number;
  changed_at: number;
  seen_at: number;
  done_at: number | null;
}

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : typeof v === "number" ? String(v) : undefined);

/** What kind a key is, when the agent didn't say: shop!456 or !456 is an MR, PAY-1234 a ticket. */
export const kindOf = (key: string): Kind => (/!\d+$/.test(key) ? "mr" : /^[A-Z][A-Z0-9_]*-\d+$/.test(key) ? "ticket" : "item");

const safeUrl = (u: string | undefined) => (u && /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : undefined);

interface Input {
  key: string;
  kind?: Kind;
  url?: string;
  title?: string;
  parent?: string;
  state?: string;
  stage?: Stage;
  waiting_on?: string;
  next?: string;
  owner?: string;
  refs?: string;
  facts: Facts;
}

function parseItem(raw: unknown, i: number): Input {
  if (!raw || typeof raw !== "object") throw new UserError(`items[${i}] must be an object.`);
  const r = raw as Record<string, unknown>;
  const key = clip(r.key, TRACK_LIMITS.key);
  if (!key) throw new UserError(`items[${i}] needs a key, e.g. PAY-1234 or shop!456.`);
  const kind = r.kind === undefined ? undefined : (KINDS as readonly unknown[]).includes(r.kind) ? (r.kind as Kind) : undefined;
  if (r.kind !== undefined && !kind) throw new UserError(`items[${i}] (${key}): kind is ticket, mr or item.`);
  let stage = r.stage === undefined ? undefined : (Object.keys(STAGES) as unknown[]).includes(r.stage) ? (r.stage as Stage) : undefined;
  if (r.stage !== undefined && !stage) throw new UserError(`items[${i}] (${key}): stage is ${Object.keys(STAGES).join(", ")}.`);
  if (r.done === true) stage = "done";
  if (r.url !== undefined && r.url !== "" && !safeUrl(String(r.url))) throw new UserError(`items[${i}] (${key}): url must be an http(s) link.`);
  const facts: Facts = {};
  if (r.pipeline !== undefined) facts.pipeline = clip(r.pipeline, 30) ?? "";
  if (r.approvals !== undefined) facts.approvals = clip(r.approvals, 30) ?? "";
  if (r.conflicts !== undefined) facts.conflicts = r.conflicts === true;
  if (r.threads !== undefined) facts.threads = Math.max(0, Math.min(999, Math.round(Number(r.threads)) || 0));
  if (r.draft !== undefined) facts.draft = r.draft === true;
  if (r.assignee !== undefined) facts.assignee = clip(r.assignee, TRACK_LIMITS.who) ?? "";
  if (r.priority !== undefined) facts.priority = clip(r.priority, 30) ?? "";
  if (r.labels !== undefined) {
    if (!Array.isArray(r.labels)) throw new UserError(`items[${i}] (${key}): labels is a list of strings.`);
    facts.labels = r.labels.map((l) => clip(l, TRACK_LIMITS.label)).filter((l): l is string => !!l).slice(0, TRACK_LIMITS.labels);
  }
  let refs: string | undefined;
  if (r.refs !== undefined) {
    const list = Array.isArray(r.refs) ? r.refs : String(r.refs).split(/[\s,]+/);
    refs = list
      .map((x) => String(x).trim().toUpperCase())
      .filter((x) => /^[TRHD]\d{1,9}$/.test(x))
      .slice(0, TRACK_LIMITS.refs)
      .join(" ");
  }
  return {
    key,
    kind,
    url: r.url === undefined ? undefined : safeUrl(String(r.url)) ?? "",
    title: clip(r.title, TRACK_LIMITS.title),
    parent: clip(r.parent, TRACK_LIMITS.key),
    state: clip(r.state, TRACK_LIMITS.state),
    stage,
    waiting_on: clip(r.waiting_on, TRACK_LIMITS.who),
    next: clip(r.next, TRACK_LIMITS.next),
    owner: clip(r.owner, TRACK_LIMITS.who),
    refs,
    facts,
  };
}

const factsOf = (t: Pick<Tracked, "facts">): Facts => {
  try {
    return JSON.parse(t.facts) as Facts;
  } catch {
    return {};
  }
};

/** The board a session publishes to when it doesn't name one: its project. */
export const defaultBoard = (env: Env) => (env.session?.project || env.session?.label || "work").slice(0, 60);

const STAGE_SAY: Record<Stage, string> = { you: "now needs you", working: "an agent is on it", waiting: "waiting on others", parked: "parked", done: "done" };

/** What changed between what was there and what came, as history lines (none for a field that wasn't sent). */
function changes(old: Tracked, n: Input): string[] {
  const out: string[] = [];
  if (n.state !== undefined && n.state !== old.state) out.push(old.state ? `${old.state} → ${n.state}` : n.state);
  if (n.stage !== undefined && n.stage !== old.stage) out.push(STAGE_SAY[n.stage] + (n.stage !== "done" && n.waiting_on ? ` (${n.waiting_on})` : ""));
  else if (n.waiting_on !== undefined && n.waiting_on !== old.waiting_on && n.waiting_on && old.stage !== "done") out.push(`waiting on ${n.waiting_on}`);
  const f = factsOf(old);
  if (n.facts.pipeline !== undefined && n.facts.pipeline !== (f.pipeline ?? "") && n.facts.pipeline) out.push(`pipeline ${n.facts.pipeline}`);
  if (n.facts.approvals !== undefined && n.facts.approvals !== (f.approvals ?? "") && n.facts.approvals) out.push(`approvals ${n.facts.approvals}`);
  if (n.facts.conflicts !== undefined && n.facts.conflicts !== !!f.conflicts) out.push(n.facts.conflicts ? "has conflicts" : "conflicts resolved");
  return out;
}

/** The track tool: publish items to a board. `complete` says the batch is everything of that kind still open. */
export async function publish(env: Env, me: string, a: Record<string, unknown>): Promise<string> {
  const board = (typeof a.board === "string" && a.board.trim() ? a.board.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-") : defaultBoard(env)).slice(0, 60);
  if (!Array.isArray(a.items)) throw new UserError("items is a list of tickets and MRs, each with at least its key.");
  if (a.items.length > TRACK_LIMITS.items) throw new UserError(`At most ${TRACK_LIMITS.items} items in one call.`);
  const complete = a.complete === undefined ? null : a.complete === "all" || a.complete === "tickets" || a.complete === "mrs" ? (a.complete as string) : undefined;
  if (complete === undefined) throw new UserError("complete is all, tickets or mrs.");
  const items = a.items.map(parseItem);
  const seenKeys = new Set<string>();
  for (const it of items) {
    if (seenKeys.has(it.key)) throw new UserError(`${it.key} is in the list twice.`);
    seenKeys.add(it.key);
  }
  const now = Date.now();
  const agent = env.session?.label ?? "";
  const { results: had } = await env.DB.prepare("SELECT * FROM tracked WHERE member = ? AND board = ?").bind(me, board).all<Tracked>();
  const byKey = new Map(had.map((t) => [t.key, t]));
  const stmts: Stmt[] = [];
  const events: { key: string; what: string }[] = [];
  let added = 0;
  let changed = 0;
  for (const n of items) {
    const old = byKey.get(n.key);
    if (!old) {
      added++;
      const stage = n.stage ?? "waiting";
      stmts.push(
        env.DB.prepare(
          `INSERT INTO tracked (member, board, agent, kind, key, url, title, parent, state, stage, waiting_on, next, owner, facts, refs, created_at, changed_at, seen_at, done_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16, ?16, ?17)`,
        ).bind(me, board, agent, n.kind ?? kindOf(n.key), n.key, n.url ?? "", n.title ?? "", n.parent ?? "", n.state ?? "", stage, n.waiting_on ?? "", n.next ?? "", n.owner ?? "", JSON.stringify(n.facts), n.refs ?? "", now, stage === "done" ? now : null),
      );
      events.push({ key: n.key, what: [n.state, stage === "done" ? "done" : stage === "you" ? "needs you" : ""].filter(Boolean).join(" · ") || "tracked" });
      continue;
    }
    const diff = changes(old, n);
    if (diff.length) changed++;
    for (const what of diff) events.push({ key: n.key, what });
    const stage = n.stage ?? (old.stage === "done" && complete ? "waiting" : old.stage); // back on the open list: open again
    const moved = n.state !== undefined && n.state !== old.state || stage !== old.stage;
    const facts = { ...factsOf(old), ...n.facts };
    stmts.push(
      env.DB.prepare(
        `UPDATE tracked SET agent = ?, kind = ?, url = ?, title = ?, parent = ?, state = ?, stage = ?, waiting_on = ?, next = ?, owner = ?, facts = ?, refs = ?, changed_at = ?, seen_at = ?, done_at = ? WHERE id = ?`,
      ).bind(
        agent || old.agent,
        n.kind ?? old.kind,
        n.url ?? old.url,
        n.title ?? old.title,
        n.parent ?? old.parent,
        n.state ?? old.state,
        stage,
        n.waiting_on ?? old.waiting_on,
        n.next ?? old.next,
        n.owner ?? old.owner,
        JSON.stringify(facts),
        n.refs ?? old.refs,
        moved ? now : old.changed_at,
        now,
        stage === "done" ? (old.done_at ?? now) : null,
        old.id,
      ),
    );
  }
  // Everything of that kind still open, so what's missing from it has left the board: merged, closed, reassigned.
  let gone = 0;
  if (complete) {
    for (const t of had) {
      if (seenKeys.has(t.key) || t.stage === "done") continue;
      if (complete === "tickets" && t.kind !== "ticket") continue;
      if (complete === "mrs" && t.kind !== "mr") continue;
      gone++;
      stmts.push(env.DB.prepare("UPDATE tracked SET stage = 'done', changed_at = ?1, done_at = ?1 WHERE id = ?2").bind(now, t.id));
      events.push({ key: t.key, what: "left the board" });
    }
  }
  stmts.push(
    env.DB.prepare("INSERT INTO tracked_boards (member, board, agent, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(member, board) DO UPDATE SET agent = excluded.agent, updated_at = excluded.updated_at").bind(me, board, agent, now),
  );
  for (const e of events)
    stmts.push(env.DB.prepare("INSERT INTO tracked_events (item, at, what) SELECT id, ?, ? FROM tracked WHERE member = ? AND board = ? AND key = ?").bind(now, e.what.slice(0, 200), me, board, e.key));
  await env.DB.batch(stmts);
  env.refreshWeb?.(me);
  const open = items.filter((n) => (n.stage ?? byKey.get(n.key)?.stage) !== "done").length;
  return `Board "${board}" updated: ${items.length} sent (${open} open), ${added} new, ${changed} changed${complete ? `, ${gone} no longer there marked done` : ""}. Your user sees it in their dashboard under Tickets & MRs.`;
}

export async function listBoard(env: Env, me: string, a: Record<string, unknown>): Promise<string> {
  const board = typeof a.board === "string" && a.board.trim() ? a.board.trim().toLowerCase() : defaultBoard(env);
  const { results } = await env.DB.prepare("SELECT * FROM tracked WHERE member = ? AND board = ? AND stage != 'done' ORDER BY kind, key").bind(me, board).all<Tracked>();
  if (!results.length) return `Nothing open on board "${board}".`;
  return `Open on "${board}":\n${results.map((t) => `${t.key} [${t.stage}] ${t.state}${t.waiting_on ? ` · on ${t.waiting_on}` : ""} — ${t.title} (changed ${ago(t.changed_at)})`).join("\n")}`;
}

export async function removeItems(env: Env, me: string, a: Record<string, unknown>): Promise<string> {
  const board = typeof a.board === "string" && a.board.trim() ? a.board.trim().toLowerCase() : defaultBoard(env);
  const keys = Array.isArray(a.keys) ? a.keys.map((k) => String(k).trim()).filter(Boolean) : [];
  if (!keys.length) throw new UserError("keys: the items to take off the board.");
  const ids = (await env.DB.prepare(`SELECT id FROM tracked WHERE member = ? AND board = ? AND key IN (SELECT value FROM json_each(?))`).bind(me, board, JSON.stringify(keys)).all<{ id: number }>()).results.map((r) => r.id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM tracked_events WHERE item IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)),
    env.DB.prepare("DELETE FROM tracked WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)),
  ]);
  env.refreshWeb?.(me);
  return `Removed ${ids.length} from "${board}".`;
}

/** Daily: done items leave after two weeks, history after two months. */
export async function pruneTracked(env: Env, now = Date.now()): Promise<number> {
  const old = now - DONE_DAYS * 86400_000;
  await env.DB.prepare("DELETE FROM tracked_events WHERE at < ?1 OR item IN (SELECT id FROM tracked WHERE stage = 'done' AND done_at < ?2)").bind(now - EVENT_DAYS * 86400_000, old).run();
  return (await env.DB.prepare("DELETE FROM tracked WHERE stage = 'done' AND done_at < ?").bind(old).run()).meta.changes;
}

/** For the tree: how many items need you. */
export async function trackedNeedsYou(env: Env, me: string): Promise<number> {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM tracked WHERE member = ? AND stage = 'you'").bind(me).first<{ n: number }>())?.n ?? 0;
}

// ---------- the view ----------

const RANK: Record<Stage, number> = { you: 0, working: 1, waiting: 2, parked: 3, done: 4 };
const SHOWS = ["you", "working", "waiting", "parked", "all"] as const;
type Show = (typeof SHOWS)[number];

/** The card about an item: a ticket card by its key, a review card by the MR's link (the latest one). */
interface Card {
  kind: "T" | "R";
  id: number;
  open: boolean;
  outcome: string;
  at: number;
}

/** A key as it reads: an MR's repo quiet before its !number. */
function keyHtml(t: Tracked): string {
  const m = /^(.*?)(!\d+)$/.exec(t.key);
  const inner = m && m[1] ? `<span class="trkrepo">${esc(m[1])}</span>${esc(m[2])}` : esc(t.key);
  return t.url ? `<a class="trkkey" href="${esc(t.url)}" target="_blank" rel="noopener" title="Open ${esc(t.key)}">${inner}</a>` : `<span class="trkkey">${inner}</span>`;
}

function pipeHtml(p: string): string {
  const s = p.toLowerCase();
  const tone = /pass|success|green/.test(s) ? "green" : /fail|error|red/.test(s) ? "red" : /run|pend|creat|wait|queue/.test(s) ? "accent" : "mute";
  return `<span class="trkpipe ${tone}" title="Pipeline ${esc(p)}"><span class="dot"></span>${esc(p)}</span>`;
}

function refsHtml(refs: string, back: string, card: Card | undefined): string {
  return refs
    .split(" ")
    .filter(Boolean)
    .filter((r) => !card || r !== `${card.kind}${card.id}`) // the card's own button says it
    .map((r) => {
      const id = Number(r.slice(1));
      if (r[0] === "T") return `<a class="badge accent" href="${esc(ticketHref(id, back))}" title="The ticket card">${esc(r)}</a>`;
      if (r[0] === "R") return `<a class="badge accent" href="${esc(reviewHref(id, back))}" title="The review card">${esc(r)}</a>`;
      return `<span class="badge" title="${r[0] === "H" ? "Handoff" : "Decision"}">${esc(r)}</span>`;
    })
    .join("");
}

function ownerHtml(me: string, owner: string): string {
  if (!owner) return "";
  const [m, l] = owner.includes("/") ? [owner.slice(0, owner.indexOf("/")), owner.slice(owner.indexOf("/") + 1)] : [me, owner];
  return `<span class="trkowner" title="${esc(`${m}/${l}`)} is on it">${agentAvatar(m, l, "s")}<span>${esc(m === me ? l : `${m}/${l}`)}</span></span>`;
}

/** What you can do about it here: the card to decide, what you decided on it, or that there's no card to decide on. */
function cardHtml(t: Tracked, card: Card | undefined, back: string): string {
  const href = card ? (card.kind === "T" ? ticketHref(card.id, back) : reviewHref(card.id, back)) : "";
  if (card?.open) return `<a class="btn sm primary trkact" href="${esc(href)}">${card.kind === "T" ? "Decide" : "Review"}<span class="muted">${card.kind}${card.id}</span></a>`;
  if (card && t.stage === "you")
    return `<a class="trkdecided" href="${esc(href)}" title="Your decision on ${card.kind}${card.id}">${icon("check", 12)}You said ${esc(card.outcome || "something")} ${ago(card.at)}</a>`;
  if (card) return `<a class="badge" href="${esc(href)}" title="${card.kind === "T" ? "The ticket card" : "The review card"}: ${esc(card.outcome)}">${card.kind}${card.id}</a>`;
  if (t.stage === "you" && t.kind === "ticket") return `<span class="trknocard" title="The agent says this needs your decision, but it hasn't sent you a card to decide on">No card yet</span>`;
  return "";
}

function row(t: Tracked, me: string, back: string, events: Map<number, { at: number; what: string }[]>, opts: { nested: boolean; card?: Card; mrs?: number; parentShown?: boolean }): string {
  const f = factsOf(t);
  const chips = [
    t.state ? `<span class="badge${t.stage === "done" ? " green" : ""}">${esc(t.state)}</span>` : "",
    f.draft && !/draft/i.test(t.state) ? '<span class="badge">Draft</span>' : "",
    f.pipeline ? pipeHtml(f.pipeline) : "",
    f.approvals ? `<span class="trkfact" title="Approvals">${icon("check", 12)}${esc(f.approvals)}</span>` : "",
    f.conflicts ? '<span class="badge red">Conflicts</span>' : "",
    f.threads ? `<span class="badge amber" title="Unresolved threads">${f.threads} open thread${f.threads === 1 ? "" : "s"}</span>` : "",
    f.priority ? `<span class="trkfact">${esc(f.priority)}</span>` : "",
    refsHtml(t.refs, back, opts.card),
  ].join("");
  // How it hangs together: a ticket says how many MRs it has; an MR whose ticket isn't on the board names it.
  const rel = opts.mrs ? `<span class="trkrel" title="Its MRs are listed under it">${icon("branch", 12)}${opts.mrs} MR${opts.mrs === 1 ? "" : "s"}</span>` : t.kind === "mr" && t.parent && !opts.parentShown ? `<span class="trkrel" title="The ticket it implements">for ${esc(t.parent)}</span>` : "";
  const sub = [
    t.stage !== "done" && t.next ? `<span class="trknext">${esc(t.next)}</span>` : "",
    t.stage === "waiting" && t.waiting_on ? `<span class="trkon">on ${esc(t.waiting_on)}</span>` : t.stage === "you" && t.waiting_on ? `<span class="trkon">${esc(t.waiting_on)}</span>` : "",
  ].filter(Boolean).join("");
  const hist = events.get(t.id) ?? [];
  const more = [
    f.assignee ? `<span><b>Assignee</b> ${esc(f.assignee)}</span>` : "",
    f.labels?.length ? `<span><b>Labels</b> ${f.labels.map(esc).join(", ")}</span>` : "",
    `<span><b>Tracked by</b> ${esc(t.agent || "an agent")} on ${esc(t.board)} · since ${ago(t.created_at)}</span>`,
  ].join("");
  const kindIco = t.kind === "mr" ? icon("branch", 14) : t.kind === "ticket" ? icon("flag", 14) : icon("square", 14);
  return `<details class="trkrow s-${t.stage}${opts.nested ? " nested" : ""}" data-key="${esc(t.key)}"><summary>
      <span class="trkk">${kindIco}</span>
      <span class="trkmain"><span class="trkline">${keyHtml(t)}<span class="trktitle">${esc(t.title || t.key)}</span>${rel}</span>${sub ? `<span class="trksub">${sub}</span>` : ""}</span>
      <span class="trkchips">${chips}</span>
      ${cardHtml(t, opts.card, back)}
      ${ownerHtml(me, t.owner)}
      <span class="trkage" title="Last change ${new Date(t.changed_at).toISOString().slice(0, 16).replace("T", " ")} UTC">${ago(t.changed_at)}</span>
    </summary>
    <div class="trkmore"><div class="trkmeta">${more}</div>${
      hist.length ? `<ol class="trkhist">${hist.map((e) => `<li><span class="muted">${ago(e.at)}</span>${esc(e.what)}</li>`).join("")}</ol>` : ""
    }</div></details>`;
}

const outcomeWord = (kind: "T" | "R", decision: string | null): string => {
  try {
    const o = (JSON.parse(decision ?? "{}") as { outcome?: string }).outcome ?? "";
    return kind === "T" ? (TICKET_OUTCOMES as Record<string, string>)[o] ?? o : (OUTCOMES as Record<string, string>)[o] ?? o;
  } catch {
    return "";
  }
};

export async function trackedView(env: Env, me: string, url: URL): Promise<string> {
  const p = url.searchParams;
  const pickBoard = p.get("board") ?? "";
  const kind = p.get("kind") === "ticket" ? "ticket" : p.get("kind") === "mr" ? "mr" : "";
  const q = (p.get("q") ?? "").trim().slice(0, 80);
  const back = url.pathname + url.search;
  const since = Date.now() - 7 * 86400_000;
  const [{ results: all }, { results: boards }] = await Promise.all([
    env.DB.prepare(`SELECT * FROM tracked WHERE member = ?1 AND (stage != 'done' OR done_at > ?2) ${pickBoard ? "AND board = ?3" : ""} ORDER BY changed_at DESC`)
      .bind(me, since, ...(pickBoard ? [pickBoard] : []))
      .all<Tracked>(),
    env.DB.prepare("SELECT b.board, b.agent, b.updated_at, (SELECT COUNT(*) FROM tracked t WHERE t.member = b.member AND t.board = b.board AND t.stage != 'done') AS open FROM tracked_boards b WHERE b.member = ? ORDER BY b.board")
      .bind(me)
      .all<{ board: string; agent: string; updated_at: number; open: number }>(),
  ]);

  // The cards about these items, so each says whether there's something to decide and what you decided.
  const cards = new Map<string, Card>();
  if (all.length) {
    const keys = JSON.stringify(all.filter((t) => t.kind !== "mr").map((t) => t.key));
    const urls = JSON.stringify(all.filter((t) => t.kind === "mr" && t.url).map((t) => t.url));
    const [{ results: tks }, { results: rvs }] = await Promise.all([
      env.DB.prepare("SELECT id, key, status, decision, created_at, decided_at FROM tickets WHERE member = ? AND status IN ('open', 'decided') AND key IN (SELECT value FROM json_each(?)) ORDER BY id")
        .bind(me, keys)
        .all<{ id: number; key: string; status: string; decision: string | null; created_at: number; decided_at: number | null }>(),
      env.DB.prepare("SELECT id, url, status, decision, created_at, decided_at FROM reviews WHERE member = ? AND status IN ('open', 'decided') AND url IN (SELECT value FROM json_each(?)) ORDER BY id")
        .bind(me, urls)
        .all<{ id: number; url: string; status: string; decision: string | null; created_at: number; decided_at: number | null }>(),
    ]);
    for (const c of tks) cards.set(`t:${c.key}`, { kind: "T", id: c.id, open: c.status === "open", outcome: outcomeWord("T", c.decision), at: c.decided_at ?? c.created_at });
    for (const c of rvs) cards.set(`r:${c.url}`, { kind: "R", id: c.id, open: c.status === "open", outcome: outcomeWord("R", c.decision), at: c.decided_at ?? c.created_at });
  }
  const cardOf = (t: Tracked) => (t.kind === "mr" ? cards.get(`r:${t.url}`) : cards.get(`t:${t.key}`));

  // An MR goes under its ticket; the group sits with whichever of them is most urgent.
  const tickets = new Map(all.filter((t) => t.kind !== "mr").map((t) => [`${t.board}\n${t.key}`, t]));
  const kids = new Map<string, Tracked[]>();
  const loose: Tracked[] = [];
  for (const t of all) {
    if (t.kind !== "mr") continue;
    const k = `${t.board}\n${t.parent}`;
    if (t.parent && tickets.has(k) && kind !== "mr") kids.set(k, [...(kids.get(k) ?? []), t]);
    else loose.push(t);
  }
  type Group = { head: Tracked; mrs: Tracked[]; stage: Stage; at: number };
  let groups: Group[] = [];
  for (const [k, t] of tickets) {
    const mrs = (kids.get(k) ?? []).sort((a, b) => RANK[a.stage] - RANK[b.stage] || a.key.localeCompare(b.key));
    const live = [t, ...mrs].filter((x) => x.stage !== "done");
    const stage = live.length ? live.reduce((s, x) => (RANK[x.stage] < RANK[s] ? x.stage : s), "parked" as Stage) : "done";
    groups.push({ head: t, mrs, stage, at: Math.max(t.changed_at, ...mrs.map((m) => m.changed_at)) });
  }
  for (const m of loose) groups.push({ head: m, mrs: [], stage: m.stage, at: m.changed_at });
  groups.sort((a, b) => b.at - a.at);

  // Filters: tickets or MRs, and words in the key, title, next step or who it waits on.
  if (kind) groups = groups.filter((g) => g.head.kind === kind);
  if (q) {
    const words = q.toLowerCase().split(/\s+/);
    const text = (t: Tracked) => `${t.key} ${t.title} ${t.next} ${t.waiting_on} ${t.state} ${t.owner} ${t.parent}`.toLowerCase();
    groups = groups.filter((g) => words.every((w) => [g.head, ...g.mrs].some((t) => text(t).includes(w))));
  }
  const count = (s: Stage) => groups.filter((g) => g.stage === s).length;
  const asked = p.get("show") as Show | null;
  // What needs you comes first: that's the page, unless you ask for more (or nothing needs you).
  const show: Show = asked && (SHOWS as readonly string[]).includes(asked) ? asked : count("you") ? "you" : "all";

  const ids = all.map((t) => t.id);
  const events = new Map<number, { at: number; what: string }[]>();
  if (ids.length) {
    const { results } = await env.DB.prepare("SELECT item, at, what FROM tracked_events WHERE item IN (SELECT value FROM json_each(?)) ORDER BY at DESC, id DESC").bind(JSON.stringify(ids)).all<{ item: number; at: number; what: string }>();
    for (const e of results) {
      const l = events.get(e.item) ?? [];
      if (l.length < 20) l.push(e);
      events.set(e.item, l);
    }
  }

  const groupHtml = (g: Group) =>
    `<div class="trkgroup${g.mrs.length ? " fam" : ""}">${row(g.head, me, back, events, { nested: false, card: cardOf(g.head), mrs: g.mrs.length })}${g.mrs.map((m) => row(m, me, back, events, { nested: true, card: cardOf(m), parentShown: true })).join("")}</div>`;
  const ICO: Record<Stage, string> = { you: "bell", working: "sparkles", waiting: "clock", parked: "square", done: "check" };
  const head = (s: Stage, n: number, label: string = STAGES[s]) => `${icon(ICO[s], 15)}<span>${label}</span><span class="badge${s === "you" ? " amber" : ""}">${n}</span>`;
  const section = (s: Stage) => {
    const gs = groups.filter((g) => g.stage === s);
    if (!gs.length) return "";
    if (s === "you") {
      // What each one asks of you: decide a ticket, merge, review... with the cards you can act on here first.
      const ask = (g: Group) => ([g.head, ...g.mrs].find((t) => t.stage === "you")?.waiting_on || "other").trim();
      const cardFirst = (g: Group) => ([g.head, ...g.mrs].some((t) => cardOf(t)?.open) ? 0 : 1);
      const asks = new Map<string, Group[]>();
      for (const g of gs) asks.set(ask(g).toLowerCase(), [...(asks.get(ask(g).toLowerCase()) ?? []), g]);
      const subs = [...asks.entries()].sort((a, b) => b[1].length - a[1].length);
      const body = subs
        .map(([, list]) => {
          list.sort((a, b) => cardFirst(a) - cardFirst(b) || b.at - a.at);
          return `<div class="trkask"><h3>${esc(ask(list[0]!))}<span class="muted">${list.length}</span></h3>${list.map(groupHtml).join("")}</div>`;
        })
        .join("");
      return `<section class="trksec s-you"><h2 class="trkh">${head(s, gs.length)}</h2>${body}</section>`;
    }
    const body = gs.map(groupHtml).join("");
    if (s === "done" || (s === "parked" && show === "all")) return `<details class="trksec s-${s}"><summary class="trkh">${head(s, gs.length, s === "done" ? "Done in the last 7 days" : STAGES[s])}</summary>${body}</details>`;
    return `<section class="trksec s-${s}"><h2 class="trkh">${head(s, gs.length)}</h2>${body}</section>`;
  };

  const link = (over: Record<string, string>) => {
    const u = new URLSearchParams({ view: "tracked" });
    for (const [k, v] of Object.entries({ board: pickBoard, kind, q, show: asked ?? "", ...over })) if (v) u.set(k, v);
    return `/dashboard?${u}`;
  };
  const now = Date.now();
  const shownBoards = pickBoard ? boards.filter((b) => b.board === pickBoard) : boards;
  const freshness = shownBoards
    .map((b) => {
      const stale = now - b.updated_at > STALE_MS;
      return `<span class="trkfresh${stale ? " stale" : ""}" title="${esc(`Board ${b.board}, published by ${b.agent || "an agent"}`)}">${stale ? icon("clock", 13) : ""}${esc(b.agent || b.board)}${b.agent && b.agent !== b.board ? ` <span class="muted">· ${esc(b.board)}</span>` : ""}<span>: ${stale ? `not updated since ${ago(b.updated_at)}` : `updated ${ago(b.updated_at)}`}</span></span>`;
    })
    .join("");
  const boardSeg = boards.length > 1
    ? `<nav class="seg" aria-label="Board"><a href="${esc(link({ board: "" }))}"${pickBoard ? "" : ' class="on"'}>All boards</a>${boards.map((b) => `<a href="${esc(link({ board: b.board }))}"${b.board === pickBoard ? ' class="on"' : ""}>${esc(b.board)}<span class="muted">${b.open}</span></a>`).join("")}</nav>`
    : "";
  const tab = (s: Show, label: string, n: number | null) =>
    `<a href="${esc(link({ show: s }))}"${show === s ? ' class="on"' : ""}>${label}${n !== null ? `<span class="${s === "you" && n ? "badge amber" : "muted"}">${n}</span>` : ""}</a>`;
  const openGroups = groups.filter((g) => g.stage !== "done").length;
  const kindSeg = (k: string, label: string) => `<a href="${esc(link({ kind: k }))}"${kind === k ? ' class="on"' : ""}>${label}</a>`;
  const filters = `<div class="trkbar">
    <nav class="seg trkshow" aria-label="Show">${tab("you", "Needs you", count("you"))}${tab("working", "Working", count("working"))}${tab("waiting", "Waiting", count("waiting"))}${count("parked") ? tab("parked", "Parked", count("parked")) : ""}${tab("all", "All", openGroups)}</nav>
    <nav class="seg" aria-label="Kind">${kindSeg("", "Both")}${kindSeg("ticket", "Tickets")}${kindSeg("mr", "MRs")}</nav>
    <form class="trkq" method="get" action="/dashboard" data-native><input type="hidden" name="view" value="tracked">${pickBoard ? `<input type="hidden" name="board" value="${esc(pickBoard)}">` : ""}${kind ? `<input type="hidden" name="kind" value="${kind}">` : ""}${asked ? `<input type="hidden" name="show" value="${esc(asked)}">` : ""}<input type="search" name="q" value="${esc(q)}" placeholder="Filter: key, title, who…" aria-label="Filter">${q ? `<a class="btn ghost xs icon" href="${esc(link({ q: "" }))}" title="Clear the filter">${icon("x", 13)}</a>` : ""}</form>
  </div>`;

  const openN = all.filter((t) => t.stage !== "done");
  const plural = (n: number, w: string) => `${n} open ${w}${n === 1 ? "" : "s"}`;
  const counts = `${plural(openN.filter((t) => t.kind === "ticket").length, "ticket")} and ${plural(openN.filter((t) => t.kind === "mr").length, "MR")}`;
  const decide = [...cards.values()].filter((c) => c.open).length;
  const stages: Stage[] = show === "all" ? ["you", "working", "waiting", "parked", "done"] : [show];
  const shown = stages.map(section).join("");
  const nothing = `<div class="empty trkempty">${icon(q || kind ? "search" : "check", 26)}<div>${q || kind ? "Nothing matches." : show === "you" ? "Nothing needs you." : "Nothing here."}</div></div>`;
  const empty = `<div class="empty trkempty">${icon("branch", 30)}<div>No tickets or MRs yet.</div><div class="small muted">An agent that looks after your tickets publishes them here with the <code>track</code> tool after each check: each with its key and link, its state, who it's waiting on and the next step. Ask it to.</div></div>`;
  return `<div class="pane-in trkpane">
    <header class="flhead"><div><h1>Tickets &amp; MRs</h1><p class="muted">${all.length ? `${counts}${decide ? ` · <b class="trkdecide">${decide} card${decide === 1 ? "" : "s"} to decide</b>` : ""}` : "What your agents track for you."}</p></div>${boardSeg}</header>
    ${freshness ? `<div class="trkfreshes">${freshness}</div>` : ""}
    ${all.length ? `${filters}${shown || nothing}` : empty}
  </div>`;
}
