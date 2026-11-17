// Handoffs (view=handoffs): every handoff in your projects, by status (open, pending, held, settled, all), for a
// project and a person or agent (as author or receiver), newest activity first, a page at a time. Each card shows the
// gates, the receiver's checklist with its ticks, the evidence and outcome, and the decision the outcome was logged as.
// The feed's drawer has the short version (the open ones and this week's): web.ts.

import { type Env, address } from "./lib";
import { type Handoff, OPEN_HANDOFF, gatesOf, obligationsOf } from "./records";
import { esc, icon, md, time } from "./ui";

const HANDOFF_PILL: Record<string, string> = { pending: "accent", integrated: "green", held: "amber", rejected: "red", withdrawn: "" };

const GATE_PILL: Record<string, string> = { passed: "green", failed: "red", "not run": "" };
const GATE_ICON: Record<string, string> = { passed: "check", failed: "x", "not run": "dots" };

/** The gates as chips with their results (older handoffs: the text they were given). */
function handoffGates(h: Handoff): string {
  const list = gatesOf(h);
  if (!list.length) return h.gates ? `<div class="tiny muted">gates: ${esc(h.gates)}</div>` : "";
  return `<div class="hogates" aria-label="Gates">${list
    .map((g) => `<span class="badge ${GATE_PILL[g.result] ?? ""}"${g.detail ? ` title="${esc(g.detail)}"` : ""}>${icon(GATE_ICON[g.result] ?? "dots", 11)}${esc(g.name)}${g.result === "passed" ? "" : ` · ${esc(g.result)}`}</span>`)
    .join("")}</div>`;
}

const TICK_LABEL: Record<string, string> = { open: "not yet", done: "done", na: "doesn't apply", waived: "waived" };

/** The receiver's obligations, with how each was ticked off. */
function handoffChecklist(h: Handoff): string {
  const list = obligationsOf(h);
  if (!list.length) return "";
  const met = list.filter((o) => o.state !== "open").length;
  return `<div class="hoobl"><div class="tiny muted">Obligations · ${met} of ${list.length} ticked off</div><ol>${list
    .map(
      (o) =>
        `<li class="${o.state}"><span class="hochk" title="${TICK_LABEL[o.state] ?? ""}">${o.state === "open" ? "" : icon(o.state === "done" ? "check" : o.state === "waived" ? "x" : "dots", 11)}</span><span class="hotxt">${esc(o.text)}${o.state !== "open" && o.state !== "done" ? ` <span class="tiny muted">(${TICK_LABEL[o.state]})</span>` : ""}${o.note ? `<span class="tiny muted hond">${esc(o.note)}${o.by ? ` — ${esc(o.by)}` : ""}</span>` : ""}</span></li>`,
    )
    .join("")}</ol></div>`;
}

/** A handoff: its ref and state, summary, gates, the receiver's checklist, evidence, the outcome's note, and who to whom. */
export function handoffCard(h: Handoff, showProject: boolean, opts: { decision?: { id: number; verdict: string } | null; who?: (member: string, agent: string | null) => string } = {}): string {
  const state = h.status === "integrated" && h.result ? `integrated as ${h.result}` : h.status;
  const who = (m: string, a: string | null) => (opts.who ? `<a href="${esc(opts.who(m, a))}">${esc(address(m, a))}</a>` : esc(address(m, a)));
  const settled = !OPEN_HANDOFF.includes(h.status) && h.updated_at > h.created_at;
  const d = opts.decision;
  return `<div class="recc" id="h${h.id}">
    <div class="row" style="gap:8px;flex-wrap:wrap"><span class="tiny muted">H${h.id}</span><span class="res">${esc(h.ref)}</span><span class="badge ${HANDOFF_PILL[h.status] ?? ""}">${esc(state)}</span>${showProject ? `<a class="tag" href="/dashboard?channel=${encodeURIComponent(h.project)}">#${esc(h.project)}</a>` : ""}${d ? `<a class="tag" href="/dashboard?channel=${encodeURIComponent(h.project)}&amp;q=D${d.id}#decisionlog" title="In the decision log as ${esc(d.verdict)}">D${d.id}</a>` : ""}</div>
    <div class="md small" style="margin-top:4px">${md(h.summary)}</div>
    ${handoffGates(h)}
    ${handoffChecklist(h)}
    ${h.evidence ? `<div class="tiny muted">evidence: <span class="mono">${esc(h.evidence)}</span></div>` : ""}
    ${h.note ? `<div class="tiny" style="margin-top:2px">${esc(h.note)}${h.updated_by ? ` <span class="muted">— ${esc(h.updated_by)}</span>` : ""}</div>` : ""}
    <div class="tiny muted" style="margin-top:4px">${who(h.author, h.author_agent)}${h.to_member ? ` → ${who(h.to_member, h.to_agent)}` : ` → #${esc(h.project)}`} · ${time(h.created_at)}${settled ? ` · ${esc(h.status)} ${time(h.updated_at)}` : ""}</div>
  </div>`;
}

const PAGE = 30;
const SHOWS = { open: OPEN_HANDOFF, pending: ["pending"], held: ["held"], settled: ["integrated", "rejected", "withdrawn"], all: [] as string[] } as const;
type Show = keyof typeof SHOWS;

export async function handoffsView(env: Env, me: string, url: URL): Promise<string> {
  const p = url.searchParams;
  const show: Show = (Object.keys(SHOWS) as Show[]).find((k) => k === p.get("show")) ?? "open";
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
    env.DB.prepare(`SELECT status, COUNT(*) AS n FROM handoffs WHERE ${where.join(" AND ")} AND status IN ('pending', 'held') GROUP BY status`)
      .bind(...binds)
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
  const [{ results: rows }, { results: cs }, people] = await Promise.all([
    env.DB.prepare(`SELECT * FROM handoffs${by} WHERE ${lw.join(" AND ")} ORDER BY updated_at DESC, id DESC LIMIT ${PAGE + 1}`)
      .bind(...lb)
      .all<Handoff>(),
    counts(where, binds),
    projects.length
      ? env.DB.prepare(`SELECT DISTINCT member FROM project_members WHERE project IN (${projects.map(() => "?").join(",")}) ORDER BY member`)
          .bind(...projects)
          .all<{ member: string }>()
      : Promise.resolve({ results: [] as { member: string }[] }),
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
  const pending = n("pending");
  const held = n("held");

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
    ${project || whoRaw ? `<a class="btn ghost sm" href="${esc(link({ project: "", who: "", before: "" }))}" title="Clear the filters">${icon("x", 13)}<span class="lbl">Clear</span></a>` : ""}
  </form>`;

  const whoLink = (m: string, a: string | null) => link({ who: a ? `${m}/${a}` : m, before: "" });
  const what = { open: "open", pending: "pending", held: "held", settled: "settled", all: "" }[show];
  const empty = `<div class="empty">${icon("arrow", 28)}<div>${
    whoRaw || project ? `No ${what ? `${what} ` : ""}handoffs with these filters.` : show === "open" ? "Nothing open: every handoff is settled." : `No ${what ? `${what} ` : ""}handoffs yet.`
  }</div><div class="small muted">Agents hand work over with <code>handoff</code>; the receiver records what became of it with <code>update_handoff</code>.</div></div>`;
  const last = shown[shown.length - 1];
  const sub = pending + held ? `${pending} pending and ${held} held${project ? ` in #${esc(project)}` : ""}${whoRaw ? ` for ${esc(whoRaw)}` : ""}.` : `Nothing open${project ? ` in #${esc(project)}` : ""}${whoRaw ? ` for ${esc(whoRaw)}` : ""}.`;
  return `<div class="pane-in hopane">
    <header class="flhead"><div><h1>Handoffs</h1><p class="muted">${sub}</p></div></header>
    ${bar}
    ${shown.length ? `<section class="card holist">${shown.map((h) => handoffCard(h, !project, { decision: decisionOf.get(h.id), who: whoLink })).join("")}</section>` : empty}
    ${more || bAt ? `<nav class="galmore">${bAt ? `<a class="btn ghost sm" href="${esc(link({ before: "" }))}">${icon("back", 13)}Newest</a>` : ""}${more ? `<a class="btn sm" href="${esc(link({ before: `${last!.updated_at}-${last!.id}` }))}">Older${icon("arrow", 13)}</a>` : ""}</nav>` : ""}
  </div>`;
}
