// Processes your agents run (and left running), seen and stopped from the dashboard: a Claude Code agent's own
// commands and what they started (in its info panel); per machine, the commands running under Codex there (its
// app-server runs them for every Codex agent on the machine) and the processes running on their own, started by an
// agent that has ended or detached (dev servers, test runs, servers in deleted worktrees). Read when you open a
// panel, nothing polled; stopping one is logged in the agent's activity and the agent is told.

import { type Env, UserError, liveIds, postMessage } from "./lib";
import { type Proc, askSession } from "./screen";
import { duration } from "./jobs";
import { esc, icon } from "./ui";
import { newer } from "./upkeep";

export const PROCS_SINCE = "0.12.66";

interface Via {
  session_id: string;
  label: string;
  version: string;
  host: string;
  client: string;
}

const supports = (v: string) => !!v && !newer(PROCS_SINCE, v);

async function live(env: Env, me: string, where: string, value: string): Promise<Via[]> {
  const { results } = await env.DB.prepare(`SELECT session_id, label, version, host, client FROM sessions WHERE member = ? AND ${where} = ? AND last_seen > ? ORDER BY last_seen DESC`)
    .bind(me, value, Date.now() - 24 * 3600_000)
    .all<Via>();
  const on = new Set(liveIds(env, me));
  return results.filter((r) => on.has(r.session_id) || !env.live);
}

function webOnly(env: Env): void {
  if (env.authKind !== "web") throw new UserError("Processes can only be seen and stopped from your dashboard.");
}

async function viaAgent(env: Env, me: string, label: string): Promise<Via> {
  webOnly(env);
  const a = (await live(env, me, "label", label))[0];
  if (!a) throw new UserError(`${label} isn't connected, so its processes can't be read.`);
  if (!supports(a.version)) throw new UserError(`Seeing its processes needs intercom ${PROCS_SINCE} on ${a.host || "its machine"} (it runs ${a.version || "an older one"}).`);
  return a;
}

async function viaHost(env: Env, me: string, host: string): Promise<Via> {
  webOnly(env);
  const on = await live(env, me, "host", host);
  if (!on.length) throw new UserError(`None of your agents is connected on ${host}; its processes are read through one.`);
  const able = on.filter((r) => supports(r.version));
  if (!able.length) throw new UserError(`Seeing processes needs intercom ${PROCS_SINCE} on ${host}: update an agent there.`);
  return able[0]!;
}

const note = (via: Via) => ({ label: via.label, by: "from the dashboard" });

const mb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${n} MB`);

function row(p: Proc, target: { agent?: string; host?: string }, home = ""): string {
  const gone = / \(deleted\)$/.test(p.cwd);
  const bare = p.cwd.replace(/ \(deleted\)$/, "");
  const dir = home && (bare === home || bare.startsWith(`${home}/`)) ? `~${bare.slice(home.length)}` : bare;
  const mem = p.total !== undefined && p.kids ? `${mb(p.total)} with ${p.kids} more` : mb(p.mem);
  const attrs = target.agent ? `data-procagent="${esc(target.agent)}"` : `data-prochost="${esc(target.host ?? "")}"`;
  return `<li class="prow${p.child ? " pkid" : ""}">
    <div class="pmain"><code class="pcmd" title="${esc(p.cmd)}">${esc(p.cmd)}</code>
      <span class="pmeta"><span>pid ${p.pid}</span><span>${duration(p.up * 1000)}</span>${p.cpu >= 1 ? `<span>${Math.round(p.cpu)}% CPU</span>` : ""}<span>${mem}</span>${p.ports.map((x) => `<span class="badge">:${x}</span>`).join("")}${dir ? `<span class="pdir" title="${esc(p.cwd)}">${esc(dir)}</span>` : ""}${gone ? `<span class="badge amber" title="The folder it ran in was deleted">folder deleted</span>` : ""}</span></div>
    ${p.child ? "" : `<button type="button" class="btn ghost xs pstop" ${attrs} data-pid="${p.pid}" data-what="${esc(p.cmd.slice(0, 80))}" title="Stop it and what it started: asked to end, forced after 3 seconds">${icon("square", 11)}Stop</button>`}
  </li>`;
}

const list = (ps: Proc[], target: { agent?: string; host?: string }, home = "") => `<ul class="plist">${ps.map((p) => row(p, target, home)).join("")}</ul>`;

/** An agent's own processes, for its info panel. */
export async function agentProcsPanel(env: Env, me: string, label: string): Promise<string> {
  const via = await viaAgent(env, me, label);
  const r = await askSession(env, me, via, { op: "procs" }, note(via));
  const p = r.procs;
  if (!p) throw new UserError(`${label}'s intercom didn't list its processes.`);
  if (via.client === "codex") {
    const here = p.codexHere ?? [];
    return `${here.length ? list(here, { host: via.host }) : `<p class="small muted">Nothing running in its folder.</p>`}<p class="small muted">Codex runs the commands of all its agents on ${esc(via.host)} in its own app-server, so these are the ones in ${esc(label)}'s folder. The Overview's Processes on ${esc(via.host)} lists them all.</p>`;
  }
  const mine = p.agent ?? [];
  return mine.length ? list(mine, { agent: label }) : `<p class="small muted">${esc(label)} isn't running any command right now.</p>`;
}

/** A machine's processes, for the Overview: under Codex, and running on their own. */
export async function hostProcsPanel(env: Env, me: string, host: string): Promise<string> {
  const via = await viaHost(env, me, host);
  const r = await askSession(env, me, via, { op: "procs" }, note(via));
  const p = r.procs;
  if (!p) throw new UserError(`The intercom on ${host} didn't list its processes.`);
  const codex = (p.codex ?? []).filter((x) => !x.child);
  const left = p.left ?? [];
  const home = (left.find((x) => x.cwd.startsWith("/home/") || x.cwd.startsWith("/Users/"))?.cwd.match(/^\/(?:home|Users)\/[^/]+/) ?? [""])[0];
  return `${
    codex.length
      ? `<h4 class="ph">${icon("terminal", 13)}Running under Codex <span class="badge">${codex.length}</span></h4>${list(codex, { host }, home)}`
      : ""
  }<h4 class="ph">${icon("clock", 13)}Running on their own <span class="badge">${left.length}</span></h4>${
    left.length
      ? `<p class="small muted">Started by an agent, now under none: from one that has ended, or started on its own on purpose (a dev server an agent left running). Biggest first.</p>${list(left, { host }, home)}`
      : `<p class="small muted">Nothing: every process here belongs to a running agent.</p>`
  }`;
}

/** Stop a listed process (and what it started), through the agent it belongs to or any agent on its machine. */
export async function stopProc(env: Env, me: string, target: { agent?: string; host?: string }, pid: number): Promise<string> {
  if (!Number.isInteger(pid) || pid < 2) throw new UserError("Which process?");
  const via = target.agent ? await viaAgent(env, me, target.agent) : await viaHost(env, me, target.host ?? "");
  const r = await askSession(env, me, via, { op: "proc-stop", pid }, note(via));
  const s = r.procs?.stopped;
  if (!s) throw new UserError("It didn't say whether it stopped.");
  const what = s.cmd.slice(0, 160);
  await env.DB.prepare("INSERT INTO activity (member, session_id, at, kind, text) VALUES (?, ?, ?, 'keys', ?)")
    .bind(me, via.session_id, Date.now(), `you stopped a process ${target.agent ? "it ran" : `on ${via.host}`} from the dashboard: ${what} (pid ${pid}${s.stopped > 1 ? `, with ${s.stopped - 1} it started` : ""}${s.forced ? ", forced" : ""})`)
    .run();
  if (target.agent)
    await postMessage(env, {
      channel: "dm",
      sender: me,
      recipient: me,
      recipient_agent: target.agent,
      body: `I stopped one of your processes from the dashboard: ${what} (pid ${pid}). Don't wait for its result; start it again only if you still need it.`,
    });
  env.refreshWeb?.(me);
  return `Stopped ${what.slice(0, 80)} (pid ${pid})${s.stopped > 1 ? ` and ${s.stopped - 1} it started` : ""}${s.forced ? "; it had to be forced" : ""}.`;
}

/** A Claude Code background job's output, its last part. */
export async function jobOutput(env: Env, me: string, label: string, id: string): Promise<{ text: string; size: number; at: number }> {
  const via = await viaAgent(env, me, label);
  const r = await askSession(env, me, via, { op: "job-output", id }, note(via));
  if (!r.output) throw new UserError("Its output didn't come.");
  return r.output;
}
