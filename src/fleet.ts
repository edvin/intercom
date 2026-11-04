// Your agents and their versions (view=fleet): every agent by machine, which intercom it runs, whether its terminal
// can be reached (tmux) and how it gets updated: by itself, through another agent on its machine, or by hand. Update
// one, or every idle one, from here; or let them update by themselves (upkeep.ts).

import { type Env, ago } from "./lib";
import { screenAttrs } from "./screen";
import { type Row, HELPER_SINCE, myRows, newer, upkeepOf } from "./upkeep";
import { agentAvatar, esc, hidden, icon } from "./ui";
import { PLUGIN_VERSION } from "./version";

const atLeast = (v: string, want: string) => v === want || newer(v, want);

export async function fleetView(env: Env, me: string): Promise<string> {
  const { rows, live } = await myRows(env, me);
  const { auto } = await upkeepOf(env, me);
  const back = "/dashboard?view=fleet";
  const on = rows.filter(live);
  const gone = rows.filter((r) => !live(r) && !on.some((x) => x.label === r.label));
  const current = (r: Row) => !!r.version && !newer(PLUGIN_VERSION, r.version);
  const behind = on.filter((r) => !current(r));

  const hosts = [...new Set(on.map((r) => r.host || "unknown machine"))].sort();
  const helperOn = (host: string) => on.find((r) => (r.host || "unknown machine") === host && r.screen === "keys" && atLeast(r.version, HELPER_SINCE));

  const row = (r: Row, host: string) => {
    const helper = helperOn(host);
    const term = r.screen === "keys" ? "tmux" : r.screen === "view" ? "tmux · view only" : "not in tmux";
    const how = current(r)
      ? `<span class="flok">${icon("check", 12)}up to date</span>`
      : r.client === "codex" && !r.launch
        ? `<span class="flwarn">by hand (restart it)</span>`
        : r.client === "codex" && ((r.screen === "keys" && r.pane) || (helper && helper.session_id !== r.session_id))
          ? `<span class="muted" title="Codex loads the new intercom when it starts: it's quit and resumed by its id, same session">restarted in place</span>`
        : r.screen === "keys" && r.pane
          ? `<span class="muted">updates itself</span>`
          : helper && helper.session_id !== r.session_id
            ? `<span class="muted">through ${esc(helper.label)}</span>`
            : `<span class="flwarn">by hand</span>`;
    const canUpdate = !current(r) && (r.client !== "codex" || !!r.launch) && ((r.screen === "keys" && r.pane) || (helper && helper.session_id !== r.session_id));
    return `<tr>
      <td><span class="flag">${agentAvatar(me, r.label, "s")}<span><b>${esc(r.label)}</b>${r.project ? `<span class="muted"> · #${esc(r.project)}</span>` : ""}</span></span></td>
      <td>${r.client === "codex" ? "Codex" : "Claude Code"}</td>
      <td><span class="flver${current(r) ? " ok" : ""}">${esc(r.version || "?")}</span></td>
      <td><span class="flstate s-${esc(r.state || "idle")}">${esc(r.state === "working" ? "working" : r.state === "waiting" ? "waiting" : "idle")}</span></td>
      <td class="muted">${term}</td>
      <td>${how}</td>
      <td class="flact">${r.screen ? `<button type="button" class="btn ghost xs icon" ${screenAttrs(`${me}/${r.label}`, r.label, r.screen, r.client)} title="See its terminal">${icon("monitor", 13)}</button>` : ""}${
        canUpdate
          ? `<form method="post" action="/upkeep">${hidden({ back, op: "update-one", session: r.session_id })}<button class="btn xs${r.state === "working" ? "" : " primary"}"${r.state === "working" ? ' disabled title="Busy: updated when it\'s idle"' : ""}>${icon("refresh", 12)}Update</button></form>`
          : ""
      }</td>
    </tr>`;
  };

  const machines = hosts
    .map((host) => {
      const list = on.filter((r) => (r.host || "unknown machine") === host);
      const helper = helperOn(host);
      const old = list.filter((r) => !current(r));
      const note = !old.length
        ? ""
        : helper
          ? `<p class="flnote">${icon("check", 12)}${esc(helper.label)} can update the others here: it types <code>/reload-plugins</code> into their terminals (same session, nothing lost).</p>`
          : list.some((r) => r.screen)
            ? `<p class="flnote warn">${icon("flag", 12)}No agent here can update the others yet. Update one that runs in tmux by hand (<code>/intercom:update</code>, then <code>/reload-plugins</code> in it); after that the rest can be updated from here.</p>`
            : `<p class="flnote warn">${icon("flag", 12)}None of these run in tmux, so they're updated by hand: <code>/intercom:update</code> once on this machine, then <code>/reload-plugins</code> in each. Started in tmux, they can be updated (and seen) from here.</p>`;
      return `<section class="flhost"><h2 class="flh">${icon("monitor", 15)}${esc(host)}<span class="badge">${list.length}</span></h2>${note}
        <div class="flscroll"><table class="fltable"><thead><tr><th>Agent</th><th>Kind</th><th>Intercom</th><th>State</th><th>Terminal</th><th>Updates</th><th></th></tr></thead><tbody>${list.map((r) => row(r, host)).join("")}</tbody></table></div></section>`;
    })
    .join("");

  return `<div class="pane-in flpane">
    <header class="flhead">
      <div><h1>Agents and versions</h1><p class="muted">Intercom ${esc(PLUGIN_VERSION)} is the newest. ${behind.length ? `${behind.length} of ${on.length} connected agent${on.length > 1 ? "s run" : " runs"} an older one.` : `All ${on.length} connected agents are up to date.`}</p></div>
      <div class="flctl">
        ${behind.length ? `<form method="post" action="/upkeep">${hidden({ back, op: "update" })}<button class="btn primary">${icon("refresh", 14)}Update the idle ones now</button></form>` : ""}
        <form method="post" action="/upkeep" class="flauto">${hidden({ back, op: auto ? "auto-off" : "auto-on" })}<label class="wkswitch"><input type="checkbox" ${auto ? "checked " : ""}onchange="this.form.requestSubmit()"><span>Update idle agents by themselves</span></label></form>
      </div>
    </header>
    <p class="flhow">Updating an agent types <code>/reload-plugins</code> into its terminal when it's idle: it loads the new intercom in the same session. If Claude Code itself has an update waiting (“/restart to apply”), it types <code>/restart</code> instead, which also continues the same session. Busy agents are left alone.</p>
    ${machines || `<div class="wkempty">${icon("radio", 18)}<p>No agents connected right now.</p></div>`}
    ${gone.length ? `<details class="flgone"><summary>${gone.length} not connected (last day)</summary><ul>${gone.map((r) => `<li><b>${esc(r.label)}</b> <span class="muted">intercom ${esc(r.version || "?")} · ${esc(r.host || "")} · last seen ${esc(ago(r.last_seen))}</span></li>`).join("")}</ul></details>` : ""}
  </div>`;
}
