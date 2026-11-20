// The overview: the dashboard's landing page. Your agents at a glance, so one look tells you whether they're healthy
// and whether there's enough left on your plans to go through the night: how many work, wait for you or sit idle; each
// account's 5-hour and weekly limits with when they reset and a verdict; what needs attention (a question, a usage
// limit, a full context, an old intercom, an agent that ended, one that's gone quiet, handoffs piling up), each with
// the action that fixes it; and every connected agent as a card by machine, with its state, model, context and limit,
// and Chat, Screen and Compact on it. Redrawn live like the rest of the dashboard.

import { compactable } from "./btw";
import { type Env, ago, hostNames, liveIds } from "./lib";
import { effortName, modelName } from "./models";
import { HANDOFF_PING_MS, queueHandoffCheck } from "./records";
import { screenAttrs } from "./screen";
import { agentAvatar, esc, hidden, icon } from "./ui";
import { type Gone, HELPER_SINCE, endedAgents, newer, outOfUsage, upkeepOf } from "./upkeep";
import { resetsOf } from "./resets";
import { fableOpusOn } from "./fable";
import { PLUGIN_VERSION } from "./version";
import { BROWSERS_SINCE, browserAttrs } from "./browsers";

interface Row {
  session_id: string;
  label: string;
  project: string | null;
  client: string | null;
  host: string;
  version: string;
  last_seen: number;
  state: string | null;
  state_detail: string | null;
  state_at: number | null;
  active_at: number | null;
  note: string | null;
  model: string | null;
  effort: string | null;
  ctx_pct: number | null;
  ctx_window: number | null;
  usage: string | null;
  account: string | null;
  screen: string | null;
  ui_at: number | null;
  ui_version: string | null;
  compact_req: string | null;
  compact_prep: string | null;
  pane: string | null;
  launch: string | null;
  browser: string | null;
}

type Window = { k: string; p: number; r: number | null };
const WINDOW_NAME: Record<string, string> = { five_hour: "5-hour", seven_day: "Week", seven_day_opus: "Week (Opus)", spend_limit: "Spend", short: "Short window", long: "Long window" };
const QUIET_MS = 20 * 60_000; // working, but nothing in its log for this long: worth a look
const HOUR = 3600_000;

function windowsOf(raw: string | null, now: number): Window[] {
  try {
    const u = JSON.parse(raw ?? "null") as { rl?: Window[] } | null;
    return (u?.rl ?? []).filter((w) => typeof w.p === "number" && (!w.r || w.r > now));
  } catch {
    return [];
  }
}
function accountOf(raw: string | null): { email: string; plan: string } | null {
  try {
    const a = JSON.parse(raw ?? "null") as { email?: string; plan?: string } | null;
    return a?.email ? { email: a.email, plan: a.plan ?? "" } : null;
  } catch {
    return null;
  }
}
const planName = (p: string) => p.replace(/^default_claude_/, "").replace(/_(\d+)x$/, " $1×").replace(/^\w/, (c) => c.toUpperCase());
const tone = (p: number) => (p >= 90 ? "red" : p >= 70 ? "amber" : "green");
const until = (t: number, now: number) => {
  const m = Math.max(0, Math.round((t - now) / 60_000));
  return m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${Math.round(m / 1440)}d`;
};
const meter = (p: number, t = tone(p)) => `<div class="meter ${t}"><i style="width:${Math.min(100, Math.max(2, p))}%"></i></div>`;

/** Whether an account's limits last the night: the weekly window decides; a full 5-hour one only pauses. */
function verdict(ws: Window[], now: number): { tone: string; text: string } {
  const week = ws.find((w) => w.k === "seven_day");
  const five = ws.find((w) => w.k === "five_hour");
  if (week && week.p >= 95) return { tone: "red", text: `Weekly limit nearly used: agents will stop${week.r ? ` until it resets in ${until(week.r, now)}` : ""}` };
  if (week && week.p >= 80 && (!week.r || week.r - now > 12 * HOUR)) return { tone: "amber", text: `Tight: ${100 - week.p}% of the week left${week.r ? `, resets in ${until(week.r, now)}` : ""}` };
  if (five && five.p >= 90) return { tone: "amber", text: `5-hour limit nearly used: a pause${five.r ? ` until ${until(five.r, now)} from now` : ""}, then it carries on` };
  if (!ws.length) return { tone: "", text: "No limits reported yet: they show after an agent's next answer" };
  return { tone: "green", text: "Enough for tonight" };
}

export async function homeView(env: Env, me: string): Promise<string> {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT session_id, label, project, client, host, version, last_seen, state, state_detail, state_at, active_at, note, model, effort, ctx_pct, ctx_window, usage, account, screen, ui_at, ui_version, compact_req, compact_prep, pane, launch, browser
     FROM sessions WHERE member = ? AND last_seen > ? ORDER BY label`,
  )
    .bind(me, now - 24 * HOUR)
    .all<Row>();
  const live = new Set(liveIds(env, me));
  const on = (r: Row) => live.has(r.session_id) || now - r.last_seen < 10 * 60_000;
  const agents = results.filter(on);
  const nick = await hostNames(env, me);
  const hostOf = (h: string) => nick.get(h) ?? (h || "unknown machine");
  // Versions: an agent behind is updated by itself (its terminal is in tmux), through another agent on its machine that
  // can type into the others' terminals, or by hand. Codex is quit and resumed by its id.
  const current = (a: Row) => !!a.version && !newer(PLUGIN_VERSION, a.version);
  const atLeast = (v: string, want: string) => v === want || newer(v, want);
  const helperOn = (host: string) => agents.find((r) => r.host === host && r.screen === "keys" && atLeast(r.version, HELPER_SINCE));
  const updateHow = (a: Row): { can: boolean; how: string } => {
    const helper = helperOn(a.host);
    const viaOther = !!helper && helper.session_id !== a.session_id;
    if (a.client === "codex" && !a.launch) return { can: false, how: "by hand: restart it" };
    if (a.client === "codex" && ((a.screen === "keys" && a.pane) || viaOther)) return { can: true, how: "Codex is quit and resumed by its id: same session" };
    if (a.screen === "keys" && a.pane) return { can: true, how: "it reloads itself: same session" };
    if (viaOther) return { can: true, how: `through ${helper!.label}, which types /reload-plugins into its terminal` };
    return { can: false, how: "by hand: /intercom:update on its machine, then /reload-plugins in it" };
  };
  const behind = agents.filter((a) => !current(a));
  const gone: Gone[] = (await endedAgents(env, me, 1)).filter((g) => now - g.at < 12 * HOUR && !agents.some((a) => a.label === g.label));
  // What each did last (one row per agent, by the activity index), and the handoffs waiting on each.
  const ids = agents.map((a) => a.session_id);
  const [{ results: lastSteps }, { results: handoffs }] = await Promise.all([
    ids.length
      ? env.DB.prepare(
          "SELECT session_id, kind, text, at FROM activity WHERE id IN (SELECT (SELECT MAX(id) FROM activity a WHERE a.member = ?1 AND a.session_id = s.value) FROM json_each(?2) s)",
        )
          .bind(me, JSON.stringify(ids))
          .all<{ session_id: string; kind: string; text: string; at: number }>()
      : Promise.resolve({ results: [] as { session_id: string; kind: string; text: string; at: number }[] }),
    env.DB.prepare("SELECT to_agent, COUNT(*) AS n, MIN(created_at) AS oldest FROM handoffs WHERE to_member = ? AND status = 'pending' GROUP BY to_agent")
      .bind(me)
      .all<{ to_agent: string | null; n: number; oldest: number }>(),
  ]);
  const stepOf = new Map(lastSteps.map((s) => [s.session_id, s]));
  // Handoffs from before the daily check existed have none queued: one is set for when the oldest is a day old.
  if (handoffs.length && !(await env.DB.prepare("SELECT 1 FROM push_queue WHERE member = ? AND ref = ?").bind(me, `w${me}`.slice(0, 120)).first())) {
    const oldest = await env.DB.prepare("SELECT MIN(created_at) AS at FROM handoffs WHERE to_member = ? AND status = 'pending' AND pinged_at IS NULL AND to_agent IS NOT NULL").bind(me).first<{ at: number | null }>();
    if (oldest?.at) await queueHandoffCheck(env, me, oldest.at + HANDOFF_PING_MS);
  }
  const handoffsOf = new Map(handoffs.map((h) => [h.to_agent ?? "", h]));

  const chat = (label: string) => `/dashboard?view=agents&agent=${encodeURIComponent(`${me}/${label}`)}`;
  const working = agents.filter((a) => a.state === "working");
  const waiting = agents.filter((a) => a.state === "waiting");
  const idle = agents.filter((a) => a.state !== "working" && a.state !== "waiting");

  // ---- limits, per Anthropic account (Claude Code shares one per machine; the latest report of each window) ----
  const accounts = new Map<string, { plan: string; ws: Map<string, Window & { at: number }>; agents: string[] }>();
  for (const a of agents.filter((x) => x.client !== "codex")) {
    const acct = accountOf(a.account);
    const key = acct?.email ?? `machine ${hostOf(a.host)}`;
    const e = accounts.get(key) ?? { plan: acct?.plan ?? "", ws: new Map<string, Window & { at: number }>(), agents: [] as string[] };
    e.agents.push(a.label);
    for (const w of windowsOf(a.usage, now)) {
      const prev = e.ws.get(w.k);
      if (!prev || (a.ui_at ?? 0) > prev.at) e.ws.set(w.k, { ...w, at: a.ui_at ?? 0 });
    }
    accounts.set(key, e);
  }
  const codex = agents.filter((a) => a.client === "codex");
  const order = ["five_hour", "seven_day", "seven_day_opus", "spend_limit"];
  const acctCards = [...accounts].map(([email, e]) => {
    const ws = [...e.ws.values()].sort((x, y) => order.indexOf(x.k) - order.indexOf(y.k));
    const v = verdict(ws, now);
    return `<article class="hmacct">
      <header><span class="hmlogo">${icon("sparkles", 14)}</span><div class="grow"><b title="${esc(email)}">${esc(email)}</b><span class="muted">${e.plan ? `${esc(planName(e.plan))} · ` : ""}Claude Code · ${e.agents.length} agent${e.agents.length === 1 ? "" : "s"}</span></div></header>
      <div class="hmwins">${
        ws.length
          ? ws.map((w) => `<div class="hmwin"><div class="hmwh"><span>${esc(WINDOW_NAME[w.k] ?? w.k)}</span><b class="${tone(w.p)}">${w.p}%</b></div>${meter(w.p)}<span class="hmsub">${w.r ? `resets in ${until(w.r, now)}` : "&nbsp;"}</span></div>`).join("")
          : `<p class="small muted" style="margin:0">Its agents haven't reported their limits yet.</p>`
      }</div>
      <div class="hmverdict ${v.tone}">${icon(v.tone === "green" ? "check" : v.tone === "red" ? "x" : "clock", 13)}<span>${esc(v.text)}</span></div>
    </article>`;
  });
  // Codex: its limits come with each model call (intercom 0.12.63+), per machine (each logs in on its own), plan from Codex.
  const planOf = (raw: string | null) => {
    try {
      return String((JSON.parse(raw ?? "null") as { plan?: unknown } | null)?.plan ?? "");
    } catch {
      return "";
    }
  };
  const codexHosts = [...new Set(codex.map((a) => a.host))].sort((x, y) => hostOf(x).localeCompare(hostOf(y)));
  for (const h of codexHosts) {
    const here = codex.filter((a) => a.host === h);
    const ws = new Map<string, Window & { at: number }>();
    for (const a of here)
      for (const w of windowsOf(a.usage, now)) {
        const prev = ws.get(w.k);
        if (!prev || (a.state_at ?? 0) > prev.at) ws.set(w.k, { ...w, at: a.state_at ?? 0 });
      }
    const list = [...ws.values()].sort((x, y) => order.indexOf(x.k) - order.indexOf(y.k));
    const out = here.filter((a) => outOfUsage({ state: a.state ?? "", state_detail: a.state_detail ?? "" }));
    const plan = here.map((a) => planOf(a.usage)).find(Boolean) ?? "";
    const v = out.length
      ? { tone: "red", text: `${out.map((a) => a.label).join(", ")} ${out.length === 1 ? "is" : "are"} out of usage${out[0]!.state_detail ? `: ${out[0]!.state_detail.replace(/^usage limit · ?/, "")}` : ""}` }
      : list.length
        ? verdict(list, now)
        : { tone: "", text: "No limits reported yet: they show after its next answer (intercom 0.12.63+)" };
    acctCards.push(`<article class="hmacct">
      <header><span class="hmlogo cx">${icon("terminal", 14)}</span><div class="grow"><b>Codex${codexHosts.length > 1 ? ` on ${esc(hostOf(h))}` : ""}</b><span class="muted">${plan ? `${esc(/^pro_?max$/i.test(plan) ? "Pro Max" : plan.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()))} · ` : ""}${here.length} agent${here.length === 1 ? "" : "s"}</span></div></header>
      <div class="hmwins">${
        list.length
          ? list.map((w) => `<div class="hmwin"><div class="hmwh"><span>${esc(WINDOW_NAME[w.k] ?? w.k)}</span><b class="${tone(w.p)}">${w.p}%</b></div>${meter(w.p)}<span class="hmsub">${w.r ? `resets in ${until(w.r, now)}` : "&nbsp;"}</span></div>`).join("")
          : `<p class="small muted" style="margin:0">Its agents haven't reported their limits yet.</p>`
      }</div>
      <div class="hmverdict ${v.tone}">${icon(v.tone === "green" ? "check" : v.tone === "red" ? "x" : "clock", 13)}<span>${esc(v.text)}</span></div>
    </article>`);
  }

  // ---- what needs attention, worst first, each with its fix ----
  type Item = { tone: string; ic: string; who: string; text: string; act: string };
  const items: Item[] = [];
  const back = "/dashboard";
  const post = (fields: Record<string, string>, label: string, cls = "btn sm", confirm = "") =>
    `<form method="post" action="/upkeep"${confirm ? ` data-confirm="${esc(confirm)}"` : ""}>${hidden({ back, ...fields })}<button class="${cls}">${label}</button></form>`;
  for (const a of waiting) {
    if (outOfUsage({ state: a.state ?? "", state_detail: a.state_detail ?? "" }))
      items.push({ tone: "red", ic: "clock", who: a.label, text: `out of usage: ${a.state_detail?.replace(/^usage limit · ?/, "") || "waits for its limit to reset"}`, act: a.client === "codex" && a.host ? post({ op: "reset-now", host: a.host }, "Redeem a reset") : "" });
    else items.push({ tone: "amber", ic: "bell", who: a.label, text: `needs you${a.state_detail ? `: ${a.state_detail}` : ""}`, act: `<button type="button" class="btn sm primary" data-asksopen>Answer</button>` });
  }
  for (const a of agents) {
    if (a.ctx_pct != null && a.ctx_pct >= 85 && a.client !== "codex" && !a.compact_req && !a.compact_prep)
      items.push({
        tone: a.ctx_pct >= 92 ? "red" : "amber",
        ic: "layers",
        who: a.label,
        text: `context ${a.ctx_pct}% full`,
        act: compactable(a, true) ? `<a class="btn sm" href="${chat(a.label)}">Open</a>` : `<form method="post" action="/agent/compact">${hidden({ session: a.session_id, back })}<button class="btn sm">Compact</button></form>`,
      });
    if (a.state === "working" && a.active_at && now - a.active_at > QUIET_MS)
      items.push({ tone: "amber", ic: "eye", who: a.label, text: `working, but quiet for ${ago(a.active_at).replace(/ ago$/, "")}`, act: a.screen ? `<button type="button" class="btn sm" ${screenAttrs(`${me}/${a.label}`, a.label, a.screen, a.client ?? "")}>Screen</button>` : "" });
    if (a.version && !current(a)) {
      const u = updateHow(a);
      items.push({ tone: "", ic: "download", who: a.label, text: `runs intercom ${a.version}${u.can ? "" : `; update it ${u.how}`}`, act: u.can ? post({ op: "update-one", session: a.session_id }, "Update") : "" });
    }
    const h = handoffsOf.get(a.label);
    if (h && now - h.oldest > 2 * HOUR) items.push({ tone: "", ic: "arrow", who: a.label, text: `${h.n} handoff${h.n === 1 ? "" : "s"} to it still pending, oldest ${ago(h.oldest)}`, act: `<a class="btn sm" href="/dashboard?view=handoffs&amp;who=${encodeURIComponent(`${me}/${a.label}`)}">Handoffs</a>` });
  }
  // Handoffs to an agent that isn't connected, a day on: nobody will take them; hand them on or withdraw them.
  for (const h of handoffs)
    if (h.to_agent && !agents.some((a) => a.label === h.to_agent) && now - h.oldest > 24 * HOUR)
      items.push({ tone: "amber", ic: "arrow", who: h.to_agent, text: `${h.n} handoff${h.n === 1 ? "" : "s"} to it pending, and it isn't connected`, act: `<a class="btn sm" href="/dashboard?view=handoffs&amp;who=${encodeURIComponent(`${me}/${h.to_agent}`)}">Withdraw…</a>` });
  for (const g of gone) items.push({ tone: "amber", ic: "door", who: g.label, text: `${g.how === "exited" ? "exited" : "ended"} ${ago(g.at)}${g.host ? ` on ${hostOf(g.host)}` : ""}`, act: post({ op: "revive", label: g.label }, "Bring back") });
  const rank = (t: string) => (t === "red" ? 0 : t === "amber" ? 1 : 2);
  items.sort((x, y) => rank(x.tone) - rank(y.tone));
  const attention = items.length
    ? `<ul class="hmlist">${items
        .map((i) => `<li class="${i.tone}"><span class="hmic">${icon(i.ic, 14)}</span><a class="hmwho" href="${chat(i.who)}">${agentAvatar(me, i.who, "s")}<b>${esc(i.who)}</b></a><span class="hmtxt">${esc(i.text)}</span>${i.act ? `<span class="hmact">${i.act}</span>` : ""}</li>`)
        .join("")}</ul>`
    : `<div class="hmok">${icon("check", 16)}<span>All healthy: nothing waits for you, no context is near full, every agent is current.</span></div>`;

  // ---- every connected agent, by machine ----
  const stateChip = (a: Row) => {
    const since = a.state_at ? ` · ${ago(a.state_at).replace(/ ago$/, "")}` : "";
    if (a.state === "waiting") return `<span class="hmst wait"><i></i>${outOfUsage({ state: a.state, state_detail: a.state_detail ?? "" }) ? "out of usage" : "needs you"}${since}</span>`;
    if (a.state === "working") return `<span class="hmst work"><i></i>working${since}</span>`;
    return `<span class="hmst idle"><i></i>idle${since}</span>`;
  };
  const card = (a: Row) => {
    const wins = windowsOf(a.usage, now);
    const five = wins.find((w) => w.k === "five_hour") ?? wins.find((w) => w.k === "seven_day");
    const step = stepOf.get(a.session_id);
    const stepText = step ? (step.kind === "text" ? step.text.replace(/\s+/g, " ") : step.text.split("\n").pop()!.replace(/\s+/g, " ")) : "";
    const canCompact = a.client !== "codex" && !compactable(a, true) && !a.compact_req && !a.compact_prep;
    const model = [a.model ? modelName(a.model) : "", a.effort ? effortName(a.effort).toLowerCase() : ""].filter(Boolean).join(" · ");
    const ok = current(a);
    const u = ok ? null : updateHow(a);
    return `<article class="hmcard s-${esc(a.state || "idle")}">
      <header><a href="${chat(a.label)}" class="hmname">${agentAvatar(me, a.label, "s")}<b>${esc(a.label)}</b></a>${stateChip(a)}</header>
      <div class="hmmeta">${a.project ? `<span>#${esc(a.project)}</span>` : ""}${model ? `<span>${esc(model)}</span>` : ""}${a.client === "codex" ? `<span>Codex</span>` : ""}<span class="hmver${ok ? "" : " old"}" title="${esc(ok ? `Intercom ${a.version}: the newest` : `Intercom ${a.version || "?"}; ${PLUGIN_VERSION} is out. Updated ${u!.how}.`)}">${ok ? "" : icon("download", 11)}${esc(a.version || "?")}</span></div>
      ${a.note ? `<p class="hmnote">${esc(a.note)}</p>` : ""}
      <div class="hmbars">
        ${a.ctx_pct != null ? `<div class="hmbar"><span>Context</span>${meter(a.ctx_pct, a.ctx_pct >= 90 ? "red" : a.ctx_pct >= 75 ? "amber" : "")}<b>${a.ctx_pct}%</b></div>` : ""}
        ${five ? `<div class="hmbar"><span>${five.k === "five_hour" ? "5-hour" : "Week"}</span>${meter(five.p)}<b>${five.p}%</b></div>` : ""}
      </div>
      ${(() => {
        try {
          const b = a.browser ? (JSON.parse(a.browser) as { slot: number; purpose?: string }) : null;
          return b ? `<p class="hmbrowse">${icon("globe", 12)}<span>browser ${b.slot}${b.purpose ? ` · ${esc(b.purpose)}` : ""}</span><button type="button" class="btn ghost xs" ${browserAttrs(a.host, b.slot, a.label)}>${icon("eye", 12)}Watch</button></p>` : "";
        } catch {
          return "";
        }
      })()}
      ${stepText ? `<p class="hmstep" title="${esc(stepText.slice(0, 300))}">${icon(step!.kind === "cmd" ? "terminal" : step!.kind === "edit" ? "pencil" : step!.kind === "text" ? "message" : "dots", 12)}<span>${esc(stepText.slice(0, 140))}</span><time>${esc(ago(step!.at))}</time></p>` : ""}
      <footer><a class="btn ghost xs" href="${chat(a.label)}">${icon("message", 12)}Chat</a>${a.screen ? `<button type="button" class="btn ghost xs" ${screenAttrs(`${me}/${a.label}`, a.label, a.screen, a.client ?? "")}>${icon("monitor", 12)}Screen</button>` : ""}${
        canCompact ? `<form method="post" action="/agent/compact" data-confirm="Compact ${esc(a.label)}? It saves what it would lose first, then its conversation becomes a summary.">${hidden({ session: a.session_id, back })}<button class="btn ghost xs">${icon("layers", 12)}Compact</button></form>` : ""
      }${
        u?.can
          ? `<form method="post" action="/upkeep">${hidden({ back, op: "update-one", session: a.session_id })}<button class="btn ghost xs"${a.state === "working" ? ' disabled title="Busy: updated when it\'s idle"' : ` title="${esc(`Update it ${u.how}`)}"`}>${icon("refresh", 12)}Update</button></form>`
          : ""
      }</footer>
    </article>`;
  };
  const hosts = [...new Set(agents.map((a) => a.host))].sort((x, y) => hostOf(x).localeCompare(hostOf(y)));
  const machines = hosts
    .map((h) => {
      const here = agents.filter((a) => a.host === h).sort((x, y) => rank(x.state === "waiting" ? "red" : x.state === "working" ? "amber" : "") - rank(y.state === "waiting" ? "red" : y.state === "working" ? "amber" : "") || x.label.localeCompare(y.label));
      const old = here.filter((a) => !current(a));
      const note = !old.length || helperOn(h)
        ? ""
        : here.some((a) => a.screen)
          ? `<p class="flnote warn">${icon("flag", 12)}No agent here can update the others yet. Update one that runs in tmux by hand (<code>/intercom:update</code>, then <code>/reload-plugins</code> in it); after that the rest can be updated from here.</p>`
          : `<p class="flnote warn">${icon("flag", 12)}None of these run in tmux, so they're updated by hand: <code>/intercom:update</code> once on this machine, then <code>/reload-plugins</code> in each. Started in tmux, they can be updated (and seen) from here.</p>`;
      return `<section class="hmhost"><h3>${icon("monitor", 14)}<span>${esc(hostOf(h))}</span><span class="muted">${here.length} agent${here.length === 1 ? "" : "s"}</span></h3>${note}<div class="hmgrid">${here.map(card).join("")}</div></section>`;
    })
    .join("");

  const tile = (n: number, label: string, cls: string, ic: string) => `<div class="hmtile ${cls}"><span class="hmtic">${icon(ic, 15)}</span><b>${n}</b><span>${label}</span></div>`;
  // ---- machines and upkeep: drawn once (not redrawn live), so an open Terminals panel stays as it is ----
  const { auto } = await upkeepOf(env, me);
  const { on: resets } = await resetsOf(env, me);
  const fable = await fableOpusOn(env, me);
  const sw = (op: string, on: boolean, label: string, title = "") =>
    `<form method="post" action="/upkeep" class="flauto">${hidden({ back, op: `${op}-${on ? "off" : "on"}` })}<label class="wkswitch"${title ? ` title="${esc(title)}"` : ""}><input type="checkbox" ${on ? "checked " : ""}onchange="this.form.requestSubmit()"><span>${label}</span></label></form>`;
  const termHosts = hosts.filter((h) => h);
  const upkeep = `<section class="hmupkeep">
    <h2 class="hmh">Machines and upkeep</h2>
    <div class="hmupk">
      <div class="hmupkhd"><div class="grow"><b>Intercom ${esc(PLUGIN_VERSION)}</b><span class="muted">${behind.length ? `${behind.length} of ${agents.length} connected agent${agents.length === 1 ? " runs" : "s run"} an older one` : agents.length ? "Every connected agent runs it" : ""}</span></div>${behind.length ? `<form method="post" action="/upkeep">${hidden({ back, op: "update" })}<button class="btn sm primary">${icon("refresh", 13)}Update the idle ones now</button></form>` : ""}</div>
      <div class="flctl">${sw("auto", auto, "Update idle agents by themselves")}${sw("resets", resets, "Redeem a usage reset when Codex runs out", "When your Codex agents hit their usage limit, redeem a usage reset (if the account has one) and have them carry on. At most once in two hours per machine.")}${sw("fable", fable, "Switch Fable agents to Opus when Fable's weekly limit runs out", "When an agent on Fable uses up Fable's weekly limit, Claude Code asks in its terminal whether to switch models. This answers Switch to Opus for that session, so it keeps working (its terminal has to be in tmux).")}</div>
      <p class="flhow">Updating an agent types <code>/reload-plugins</code> into its terminal when it's idle: it loads the new intercom in the same session. If Claude Code itself has an update waiting (“/restart to apply”), it types <code>/restart</code> instead, which also continues the same session. Busy agents are left alone.</p>
    </div>
    ${termHosts
      .filter((h) => agents.some((a) => a.host === h && a.version && !newer(BROWSERS_SINCE, a.version)))
      .map((h) => `<details class="terms brs" data-browsers="${esc(h)}"><summary>${icon("globe", 14)}<b>Browsers on ${esc(hostOf(h))}</b><span class="small muted">remote-chrome slots there: whose each is, what's open, watch and step in</span></summary><div class="termsbody"><p class="small muted">Asking ${esc(hostOf(h))}…</p></div></details>`)
      .join("")}
    ${termHosts.map((h) => `<details class="terms" id="terms-${esc(h.replace(/[^\w-]/g, "_"))}" data-terms="${esc(h)}"><summary>${icon("terminal", 14)}<b>Terminals on ${esc(hostOf(h))}</b><span class="small muted">tmux sessions there: open, start or close them</span></summary><div class="termsbody"><p class="small muted">Asking ${esc(hostOf(h))}…</p></div></details>`).join("")}
  </section>`;

  return `<div class="pane-in hmpane"><div class="hmlive" id="home" data-region>
    <header class="flhead"><div><h1>Overview</h1><p class="muted">${agents.length ? `${agents.length} agent${agents.length === 1 ? "" : "s"} connected${hosts.length > 1 ? ` on ${hosts.length} machines` : ""}.` : "None of your agents is connected right now."}</p></div><a class="btn sm ghost" href="/dashboard?view=feed">${icon("layers", 13)}Messages</a></header>
    <div class="hmtiles">${tile(working.length, "working", "t-work", "refresh")}${tile(waiting.length, "need you", "t-wait", "bell")}${tile(idle.length, "idle", "t-idle", "clock")}${tile(gone.length, "ended, 12h", "t-gone", "door")}</div>
    ${acctCards.length ? `<h2 class="hmh">Plan limits</h2><div class="hmaccts">${acctCards.join("")}</div>` : ""}
    <h2 class="hmh">Needs attention${items.length ? ` <span class="badge ${items.some((i) => i.tone === "red") ? "red" : "amber"}">${items.length}</span>` : ""}</h2>
    ${attention}
    ${machines ? `<h2 class="hmh">Agents</h2>${machines}` : ""}
  </div>${upkeep}</div>`;
}
