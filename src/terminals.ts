// Terminals on your machines (view=fleet): a machine's tmux sessions, opened in the screen window to watch and type
// into, new ones started (a shell, Claude Code or Codex in a folder) and old ones closed. Only you, from the dashboard,
// and only on machines that allow it (INTERCOM_TERMINALS=1 in their intercom config); the requests go through one of
// your agents connected there (its local server runs tmux), and every start and close is noted in its activity.

import { type Env, UserError, liveIds } from "./lib";
import { type Term, askSession, screenAttrs } from "./screen";
import { esc, hidden, icon } from "./ui";
import { newer } from "./upkeep";

export const TERMS_SINCE = "0.12.45";

interface Via {
  session_id: string;
  label: string;
  screen: string;
  client: string;
  version: string;
  host: string;
}

/** A connected agent of yours on `host` that can reach its tmux (in tmux, keys allowed), newest intercom first. */
async function viaOn(env: Env, me: string, host: string): Promise<Via> {
  if (env.authKind !== "web") throw new UserError("Terminals can only be used from your dashboard.");
  const { results } = await env.DB.prepare("SELECT session_id, label, screen, client, version, host FROM sessions WHERE member = ? AND host = ? AND last_seen > ? ORDER BY last_seen DESC")
    .bind(me, host, Date.now() - 24 * 3600_000)
    .all<Via>();
  const live = new Set(liveIds(env, me));
  const on = results.filter((r) => live.has(r.session_id) || !env.live);
  if (!on.length) throw new UserError(`None of your agents is connected on ${host} right now; terminals there go through one.`);
  const able = on.filter((r) => r.screen === "keys" && r.version && !newer(TERMS_SINCE, r.version));
  if (!able.length)
    throw new UserError(
      on.some((r) => r.screen === "keys")
        ? `Terminals need intercom ${TERMS_SINCE} on ${host}: update it there (the agents on this page can be updated from here), then reload this.`
        : `No agent on ${host} runs in tmux with keys allowed, so its terminals can't be reached from here.`,
    );
  return able[0]!;
}

const note = (via: Via) => ({ label: via.label, by: "from the dashboard" });

export async function listTerms(env: Env, me: string, host: string): Promise<{ via: Via; terms: Term[] }> {
  const via = await viaOn(env, me, host);
  const r = await askSession(env, me, via, { op: "tmux" }, note(via));
  if (!r.terms) throw new UserError(`The intercom on ${host} didn't list its terminals; it may need updating to ${TERMS_SINCE}.`);
  return { via, terms: r.terms };
}

export async function newTerm(env: Env, me: string, host: string, name: string, cwd: string, run: string): Promise<string> {
  const via = await viaOn(env, me, host);
  const r = await askSession(env, me, via, { op: "tmux-new", name, cwd, run }, note(via));
  await env.DB.prepare("INSERT INTO activity (member, session_id, at, kind, text) VALUES (?, ?, ?, 'keys', ?)")
    .bind(me, via.session_id, Date.now(), `you started a terminal on ${host} from the dashboard: ${name} (${run} in ${cwd || "~"})`)
    .run();
  return r.made?.pane ?? "";
}

export async function closeTerm(env: Env, me: string, host: string, name: string): Promise<void> {
  const via = await viaOn(env, me, host);
  await askSession(env, me, via, { op: "tmux-kill", name }, note(via));
  await env.DB.prepare("INSERT INTO activity (member, session_id, at, kind, text) VALUES (?, ?, ?, 'keys', ?)")
    .bind(me, via.session_id, Date.now(), `you closed the terminal ${name} on ${host} from the dashboard`)
    .run();
}

/** The machine's terminals as a panel on the Versions page (loaded when you open it). */
export async function termsPanel(env: Env, me: string, host: string, back: string): Promise<string> {
  let data: { via: Via; terms: Term[] };
  try {
    data = await listTerms(env, me, host);
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    return `<div class="termsoff">${icon("terminal", 16)}<p>${esc(e.message)}</p></div>`;
  }
  const { via, terms } = data;
  // Your agents' own panes are marked (closing one would end the agent); the rest are terminals.
  const { results: agentPanes } = await env.DB.prepare("SELECT label, pane FROM sessions WHERE member = ? AND host = ? AND pane != '' AND last_seen > ?")
    .bind(me, host, Date.now() - 24 * 3600_000)
    .all<{ label: string; pane: string }>();
  const agentOf = new Map(agentPanes.map((p) => [p.pane, p.label]));
  const bySession = new Map<string, Term[]>();
  for (const t of terms) bySession.set(t.session, [...(bySession.get(t.session) ?? []), t]);
  const rows = [...bySession]
    .map(([session, panes]) => {
      const main = panes.find((p) => p.active) ?? panes[0]!;
      const agent = panes.map((p) => agentOf.get(p.pane)).find(Boolean);
      const open = `<button type="button" class="btn sm" ${screenAttrs(`${me}/${via.label}@${main.pane}`, session, "keys", "claude")} title="Watch it and type into it">${icon("terminal", 13)}Open</button>`;
      const close = agent
        ? ""
        : `<form method="post" action="/terminals/close" data-native data-confirm="Close the terminal ${esc(session)} on ${esc(host)}? Whatever runs in it is stopped.">${hidden({ host, name: session, back })}<button class="btn ghost sm" title="Close it (tmux kill-session)">Close</button></form>`;
      return `<div class="termrow"><span class="termic${agent ? " ag" : ""}">${icon(agent ? "message" : "terminal", 14)}</span><div class="grow"><b>${esc(session)}</b>${agent ? ` <span class="badge accent">agent ${esc(agent)}</span>` : ""}<div class="small muted">${esc(main.cmd)} · ${esc(main.cwd)}${panes.length > 1 ? ` · ${panes.length} panes` : ""}${main.attached ? " · attached" : ""}</div></div>${open}${close}</div>`;
    })
    .join("");
  const next = `term-${Math.max(0, ...terms.map((t) => Number(/^term-(\d+)$/.exec(t.session)?.[1] ?? 0))) + 1}`;
  return `<div class="termlist">${rows || '<p class="small muted" style="margin:4px 2px">No tmux sessions on this machine.</p>'}</div>
    <form method="post" action="/terminals/new" class="termnew" data-native>${hidden({ host, back })}
      <input name="name" value="${esc(next)}" pattern="[A-Za-z0-9_\\-]{1,32}" required aria-label="Name" title="Its tmux session name">
      <input name="cwd" value="~" required aria-label="Folder" title="The folder it starts in" class="grow">
      <select name="run" aria-label="What to run"><option value="shell">Shell</option><option value="claude">Claude Code</option><option value="codex">Codex</option></select>
      <button class="btn sm primary">${icon("plus", 13)}New terminal</button>
    </form>
    <p class="tiny muted" style="margin:6px 2px 0">Through ${esc(via.label)} on ${esc(host)}. Starting and closing terminals is noted in its activity.</p>`;
}
