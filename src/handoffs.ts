// Handoffs (view=handoffs): every handoff in your projects, by status (open, pending, held, settled, all), for a
// project and a person or agent (as author or receiver), newest activity first, a page at a time. Each card shows the
// gates, the receiver's checklist with its ticks, the evidence and outcome, and the decision the outcome was logged as.
// The feed's drawer has the short version (the open ones and this week's): web.ts.

import { type Env, address } from "./lib";
import { type Handoff, OPEN_HANDOFF, gatesOf, obligationsOf } from "./records";
import { agentAvatar, avatar, esc, hidden, icon, md, time } from "./ui";

const HANDOFF_PILL: Record<string, string> = { pending: "accent", integrated: "green", held: "amber", rejected: "red", withdrawn: "" };

const GATE_PILL: Record<string, string> = { passed: "green", failed: "red", "not run": "" };
const GATE_ICON: Record<string, string> = { passed: "check", failed: "x", "not run": "dots" };

/** The gates as chips with their results (older handoffs: the text they were given). */
function handoffGates(h: Handoff): string {
  const list = gatesOf(h);
  if (!list.length) return h.gates ? `<div class="hogates"><span class="hogt">${esc(h.gates)}</span></div>` : "";
  return `<div class="hogates" aria-label="Gates">${list
    .map((g) => `<span class="hogate ${GATE_PILL[g.result] ?? ""}"${g.detail ? ` title="${esc(g.detail)}"` : ""}>${icon(GATE_ICON[g.result] ?? "dots", 11)}${esc(g.name)}${g.result === "passed" ? "" : `<i>${esc(g.result)}</i>`}</span>`)
    .join("")}</div>`;
}

const TICK_LABEL: Record<string, string> = { open: "not yet", done: "done", na: "doesn't apply", waived: "waived" };

/** The receiver's obligations, with how each was ticked off: a progress bar, and the list (folded once it's settled). */
function handoffChecklist(h: Handoff): string {
  const list = obligationsOf(h);
  if (!list.length) return "";
  const met = list.filter((o) => o.state !== "open").length;
  const items = `<ol>${list
    .map(
      (o) =>
        `<li class="${o.state}"><span class="hochk" title="${TICK_LABEL[o.state] ?? ""}">${o.state === "open" ? "" : icon(o.state === "done" ? "check" : o.state === "waived" ? "x" : "dots", 11)}</span><span class="hotxt">${esc(o.text)}${o.state !== "open" && o.state !== "done" ? ` <span class="hotag">${TICK_LABEL[o.state]}</span>` : ""}${o.note ? `<span class="hond">${esc(o.note)}${o.by ? ` · ${esc(o.by)}` : ""}</span>` : ""}</span></li>`,
    )
    .join("")}</ol>`;
  const head = `<span class="hoblh">Obligations</span><span class="hobar2" style="--p:${Math.round((met / list.length) * 100)}%"></span><span class="hoblc">${met}/${list.length}</span>`;
  return OPEN_HANDOFF.includes(h.status)
    ? `<div class="hoobl"><div class="hoblhd">${head}</div>${items}</div>`
    : `<details class="hoobl"><summary class="hoblhd">${head}${icon("chevron", 12)}</summary>${items}</details>`;
}

const STATE_ICON: Record<string, string> = { pending: "arrow", held: "clock", integrated: "check", rejected: "x", withdrawn: "back" };
const OUTCOME: Record<string, string> = { integrated: "Integrated", held: "Held", rejected: "Rejected", withdrawn: "Withdrawn", pending: "Back to pending" };

/** Plain text of a bit of markdown, for a title. */
const plain = (s: string) => s.replace(/\*\*|__|`|^#+\s*/gm, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();

/** The summary's first sentence as the card's title, and the rest as its text (all of it when the first sentence won't split cleanly). */
export function splitSummary(summary: string): { title: string; rest: string } {
  const s = summary.trim();
  const m = /[.!?](?=\s|$)|\n/.exec(s);
  const cut = m ? m.index + 1 : s.length;
  const head = s.slice(0, cut);
  const clean = cut <= 160 && (head.match(/`/g) ?? []).length % 2 === 0 && (head.match(/\*\*/g) ?? []).length % 2 === 0;
  if (clean) return { title: plain(head.replace(/[.:]$/, "")), rest: s.slice(cut).trim() };
  const t = plain(s);
  return { title: t.length > 110 ? `${t.slice(0, 110).replace(/\s+\S*$/, "")}…` : t, rest: s };
}

/** The ref, its commit picked out: "5df5034 on /tmp/alder-3". */
function refChip(ref: string): string {
  const m = /^([0-9a-f]{7,40})\b(.*)$/i.exec(ref.trim());
  return `<span class="horef" title="${esc(ref)}">${icon("branch", 12)}${m ? `<b>${esc(m[1]!.slice(0, 10))}</b>${esc(m[2]!)}` : esc(ref)}</span>`;
}

/** A handoff: status, title and ref, then the summary, gates, the receiver's checklist, the outcome and who handed it to whom. */
export function handoffCard(h: Handoff, showProject: boolean, opts: { decision?: { id: number; verdict: string } | null; who?: (member: string, agent: string | null) => string; close?: { me: string; back: string } } = {}): string {
  const face = (m: string, a: string | null) => (a ? agentAvatar(m, a, "s") : avatar(m, "s"));
  const who = (m: string, a: string | null) =>
    `<span class="hop">${face(m, a)}${opts.who ? `<a href="${esc(opts.who(m, a))}" title="Only handoffs by or to ${esc(address(m, a))}">${esc(address(m, a))}</a>` : `<span>${esc(address(m, a))}</span>`}</span>`;
  const open = OPEN_HANDOFF.includes(h.status);
  const settled = h.updated_at > h.created_at && (h.note || h.result || !open);
  const d = opts.decision;
  const { title, rest } = splitSummary(h.summary);
  const outcome = settled
    ? `<div class="hoout${h.note ? "" : " slim"}">${icon(STATE_ICON[h.status] ?? "dots", 13)}<div><b>${OUTCOME[h.status] ?? esc(h.status)}${h.status === "integrated" && h.result ? ` as <code>${esc(h.result)}</code>` : ""}</b>${h.updated_by ? ` <span class="muted">by ${esc(h.updated_by)}</span>` : ""} <span class="muted">· ${time(h.updated_at)}</span>${h.note ? `<div class="honote">${esc(h.note)}</div>` : ""}</div></div>`
    : "";
  return `<article class="hoc s-${esc(h.status)}" id="h${h.id}" data-day="${h.updated_at}">
    <div class="hoic" title="${esc(h.status)}">${icon(STATE_ICON[h.status] ?? "dots", 15)}</div>
    <div class="hobody">
      <div class="hotop"><a class="hoid" href="#h${h.id}">H${h.id}</a><span class="badge ${HANDOFF_PILL[h.status] ?? ""}">${esc(h.status)}</span>${showProject ? `<a class="hochip" href="/dashboard?channel=${encodeURIComponent(h.project)}">#${esc(h.project)}</a>` : ""}${d ? `<a class="hochip" href="/dashboard?channel=${encodeURIComponent(h.project)}&amp;q=D${d.id}#decisionlog" title="In the decision log as ${esc(d.verdict)}">${icon("book", 11)}D${d.id}</a>` : ""}<span class="hotime">${time(h.created_at)}</span></div>
      <h3 class="hotitle">${esc(title)}</h3>
      ${rest ? `<div class="md hosum">${md(rest)}</div>` : ""}
      <div class="horow">${refChip(h.ref)}${h.evidence ? `<span class="horef hoev" title="Evidence: ${esc(h.evidence)}">${icon("paperclip", 12)}${esc(h.evidence)}</span>` : ""}</div>
      ${handoffGates(h)}
      ${handoffChecklist(h)}
      ${outcome}
      <div class="horoute">${who(h.author, h.author_agent)}<span class="hoarr">${icon("arrow", 13)}</span>${h.to_member ? who(h.to_member, h.to_agent) : `<span class="hop"><span class="hohash">#</span><span>${esc(h.project)}</span></span>`}${
        open && opts.close && (h.author === opts.close.me || h.to_member === opts.close.me)
          ? `<form method="post" action="/handoffs/withdraw" class="hoclose" data-confirm="Close H${h.id} as withdrawn? Its receiver no longer has it to do.">${hidden({ ids: String(h.id), back: opts.close.back })}<button class="btn ghost xs" title="Stale, or done some other way: close it as withdrawn">${icon("x", 11)}Withdraw</button></form>`
          : ""
      }</div>
    </div>
  </article>`;
}

const PAGE = 30;
const SHOWS = { open: OPEN_HANDOFF, pending: ["pending"], held: ["held"], settled: ["integrated", "rejected", "withdrawn"], all: [] as string[] } as const;
type Show = keyof typeof SHOWS;
/** An open handoff nobody has touched for this long can be closed with the rest from the Handoffs page. */
export const STALE_MS = 3 * 86400_000;

export async function handoffsView(env: Env, me: string, url: URL): Promise<string> {
  const p = url.searchParams;
  // One handoff (id=N, linked where it's named, as H2409 in a question): it, whatever its status.
  const one = Number(p.get("id")) || 0;
  const show: Show = one ? "all" : ((Object.keys(SHOWS) as Show[]).find((k) => k === p.get("show")) ?? "open");
  const project = p.get("project") ?? "";
  const whoRaw = (p.get("who") ?? "").trim();
  const [wm, wa] = whoRaw.includes("/") ? [whoRaw.slice(0, whoRaw.indexOf("/")), whoRaw.slice(whoRaw.indexOf("/") + 1)] : [whoRaw, ""];
  const [bAt, bId] = (p.get("before") ?? "").split("-").map(Number);

  // Yours, and only yours: every query starts from the projects you're in.
  const { results: mine } = await env.DB.prepare("SELECT project FROM project_members WHERE member = ? ORDER BY project").bind(me).all<{ project: string }>();
  const projects = mine.map((r) => r.project);
  const scope = project && projects.includes(project) ? [project] : projects;
  const ph = scope.map(() => "?").join(",") || "NULL";
  const where = [`project IN (${ph})`];
  const binds: unknown[] = [...scope];
  if (one) {
    where.push("id = ?");
    binds.push(one);
  }
  if (wm) {
    if (wa) {
      where.push("((author = ? AND author_agent = ?) OR (to_member = ? AND to_agent = ?))");
      binds.push(wm, wa, wm, wa);
    } else {
      where.push("(author = ? OR to_member = ?)");
      binds.push(wm, wm);
    }
  }
  const counts = (where: string[], binds: unknown[]) =>
    env.DB.prepare(`SELECT status, COUNT(*) AS n, MIN(created_at) AS oldest FROM handoffs WHERE ${where.join(" AND ")} AND status IN ('pending', 'held') GROUP BY status`)
      .bind(...binds)
      .all<{ status: string; n: number; oldest: number }>();
  // What settled this week: from the newest change back to a week ago, nothing older.
  const weekAgo = Date.now() - 7 * 86400_000;
  const week = () =>
    env.DB.prepare(`SELECT status, COUNT(*) AS n FROM handoffs INDEXED BY handoffs_updated WHERE updated_at > ? AND ${where.join(" AND ")} AND status IN ('integrated', 'rejected', 'withdrawn') GROUP BY status`)
      .bind(weekAgo, ...binds)
      .all<{ status: string; n: number }>();
  const states = SHOWS[show];
  const lw = [...where];
  const lb = [...binds];
  if (states.length) {
    lw.push(`status IN (${states.map(() => "?").join(",")})`);
    lb.push(...states);
  }
  if (bAt) {
    lw.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
    lb.push(bAt, bAt, bId || 0);
  }
  // The open ones by the project index (there are few); settled or all from the newest back until a page is full.
  const by = show === "open" || show === "pending" || show === "held" ? "" : " INDEXED BY handoffs_updated";
  const [{ results: rows }, { results: cs }, people, { results: ws }] = await Promise.all([
    env.DB.prepare(`SELECT * FROM handoffs${by} WHERE ${lw.join(" AND ")} ORDER BY updated_at DESC, id DESC LIMIT ${PAGE + 1}`)
      .bind(...lb)
      .all<Handoff>(),
    counts(where, binds),
    projects.length
      ? env.DB.prepare(`SELECT DISTINCT member FROM project_members WHERE project IN (${projects.map(() => "?").join(",")}) ORDER BY member`)
          .bind(...projects)
          .all<{ member: string }>()
      : Promise.resolve({ results: [] as { member: string }[] }),
    week(),
  ]);
  const more = rows.length > PAGE;
  const shown = rows.slice(0, PAGE);
  // The decision each outcome was logged as (integrated, held, rejected).
  const { results: ds } = shown.length
    ? await env.DB.prepare("SELECT id, handoff_id, verdict FROM decisions WHERE handoff_id IN (SELECT value FROM json_each(?))")
        .bind(JSON.stringify(shown.map((h) => h.id)))
        .all<{ id: number; handoff_id: number; verdict: string }>()
    : { results: [] };
  const decisionOf = new Map(ds.map((d) => [d.handoff_id, d]));
  const n = (s: string) => cs.find((c) => c.status === s)?.n ?? 0;
  // Untouched for days: closed in one go from here (yours, or handed to you).
  const staleN = (
    await env.DB.prepare(`SELECT COUNT(*) AS n FROM handoffs WHERE ${where.join(" AND ")} AND status IN ('pending', 'held') AND updated_at < ? AND (author = ? OR to_member = ?)`)
      .bind(...binds, Date.now() - STALE_MS, me, me)
      .first<{ n: number }>()
  )?.n ?? 0;
  const pending = n("pending");
  const held = n("held");
  const oldest = cs.find((c) => c.status === "pending")?.oldest;
  const wn = (s: string) => ws.find((c) => c.status === s)?.n ?? 0;

  const link = (over: Record<string, string>) => {
    const qs = new URLSearchParams({ view: "handoffs" });
    const all: Record<string, string> = { show: show === "open" ? "" : show, project, who: whoRaw, ...over };
    for (const [k, v] of Object.entries(all)) if (v) qs.set(k, v);
    return `/dashboard?${qs}`;
  };
  const tab = (k: Show, label: string, count?: number) =>
    `<a href="${esc(link({ show: k === "open" ? "" : k, before: "" }))}"${show === k ? ' class="on"' : ""}>${label}${count ? `<span class="muted">${count}</span>` : ""}</a>`;
  const opt = (v: string, label: string, on: boolean) => `<option value="${esc(v)}"${on ? " selected" : ""}>${esc(label)}</option>`;
  const whoOpts = people.results.map((r) => r.member);
  if (whoRaw && !whoOpts.includes(whoRaw)) whoOpts.unshift(whoRaw);
  const bar = `<form class="hobar" method="get" action="/dashboard" data-native>
    <input type="hidden" name="view" value="handoffs">${show === "open" ? "" : `<input type="hidden" name="show" value="${show}">`}
    <nav class="seg" aria-label="Status">${tab("open", "Open", pending + held)}${tab("pending", "Pending", pending)}${tab("held", "Held", held)}${tab("settled", "Settled")}${tab("all", "All")}</nav>
    <select name="project" aria-label="Project" onchange="this.form.requestSubmit()">${opt("", "All projects", !project)}${projects.map((k) => opt(k, `#${k}`, k === project)).join("")}</select>
    <select name="who" aria-label="Person or agent" onchange="this.form.requestSubmit()">${opt("", "Anyone", !whoRaw)}${whoOpts.map((k) => opt(k, k === me ? `${k} (you)` : k, k === whoRaw)).join("")}</select>
    ${project || whoRaw || one ? `<a class="btn ghost sm" href="${esc(one ? "/dashboard?view=handoffs" : link({ project: "", who: "", before: "" }))}" title="Clear the filters">${icon("x", 13)}<span class="lbl">Clear</span></a>` : ""}
  </form>`;

  const whoLink = (m: string, a: string | null) => link({ who: a ? `${m}/${a}` : m, before: "" });
  const what = { open: "open", pending: "pending", held: "held", settled: "settled", all: "" }[show];
  const empty = `<div class="empty">${icon("arrow", 28)}<div>${
    whoRaw || project ? `No ${what ? `${what} ` : ""}handoffs with these filters.` : show === "open" ? "Nothing open: every handoff is settled." : `No ${what ? `${what} ` : ""}handoffs yet.`
  }</div><div class="small muted">Agents hand work over with <code>handoff</code>; the receiver records what became of it with <code>update_handoff</code>.</div></div>`;
  const last = shown[shown.length - 1];
  const scopeTxt = `${project ? ` in #${esc(project)}` : ""}${whoRaw ? ` for ${esc(whoRaw)}` : ""}`;
  const days = (t: number) => Math.max(1, Math.round((Date.now() - t) / 86400_000));
  const tile = (k: Show | "", cls: string, ic: string, n: number, label: string, sub: string) => {
    const inner = `<span class="hotic">${icon(ic, 15)}</span><b>${n.toLocaleString("en")}</b><span class="hotl">${label}</span><span class="hots">${sub}</span>`;
    return k ? `<a class="hotile ${cls}${show === k ? " on" : ""}" href="${esc(link({ show: k === "open" ? "" : k, before: "" }))}">${inner}</a>` : `<div class="hotile ${cls}">${inner}</div>`;
  };
  const tiles = `<div class="hotiles">
    ${tile("pending", "t-pending", "arrow", pending, "Pending", oldest ? `oldest ${days(oldest)} day${days(oldest) === 1 ? "" : "s"} old` : "waiting for the receiver")}
    ${tile("held", "t-held", "clock", held, "Held", "parked for now")}
    ${tile("settled", "t-integrated", "check", wn("integrated"), "Integrated", "last 7 days")}
    ${tile("", "t-rejected", "x", wn("rejected") + wn("withdrawn"), "Rejected", "or withdrawn, 7 days")}
  </div>`;
  return `<div class="pane-in hopane">
    <header class="flhead"><div><h1>Handoffs</h1><p class="muted">${pending + held ? `${(pending + held).toLocaleString("en")} open${scopeTxt}: work handed over and waiting for an outcome.` : `Nothing open${scopeTxt}.`}</p></div>${
      staleN
        ? `<form method="post" action="/handoffs/withdraw" data-confirm="Close ${staleN} handoff${staleN === 1 ? "" : "s"} nobody has touched for ${STALE_MS / 86400_000} days as withdrawn?">${hidden({ stale: "1", project, who: whoRaw, back: link({}) })}<button class="btn sm" title="Open handoffs${scopeTxt} with no change for ${STALE_MS / 86400_000} days">${icon("x", 13)}Close ${staleN} stale</button></form>`
        : ""
    }</header>
    ${tiles}
    ${bar}
    ${shown.length ? `<section class="holist">${shown.map((h) => handoffCard(h, !project, { decision: decisionOf.get(h.id), who: whoLink, close: { me, back: `${link({})}#h${h.id}` } })).join("")}</section>` : empty}
    ${more || bAt ? `<nav class="galmore">${bAt ? `<a class="btn ghost sm" href="${esc(link({ before: "" }))}">${icon("back", 13)}Newest</a>` : ""}${more ? `<a class="btn sm" href="${esc(link({ before: `${last!.updated_at}-${last!.id}` }))}">Older${icon("arrow", 13)}</a>` : ""}</nav>` : ""}
  </div>`;
}
