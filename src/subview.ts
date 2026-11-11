// An agent's subagents in its chat (subagents.ts): a strip above the thread, one line each (running ones first), that
// opens to what it was asked, its steps and its answer. A live region of its own, so it moves while you read the chat.

import { duration } from "./jobs";
import { type Sub, type SubStep, runningSubs } from "./subagents";
import { esc, icon, md, time } from "./ui";

const STEP_ICON: Record<string, string> = { cmd: "$", edit: "✎", read: "·", tool: "⚙", text: "●" };
const SHOWN_DONE = 4; // finished ones shown before the rest fold away

/** "running 4m", "done 2m ago · took 6m". */
export function subWhen(s: Sub, now = Date.now()): string {
  const quiet = s.status === "running" && now - s.updated > 10 * 60_000;
  return s.status === "running"
    ? `running ${duration(now - s.started)}${quiet ? ` · nothing new for ${duration(now - s.updated)}` : ""}`
    : `${s.status === "stopped" ? "stopped" : "done"} ${duration(now - s.updated)} ago · took ${duration(s.updated - s.started)}`;
}

/** A spinner while it runs, a check when it's done, a square when it was stopped. */
export const subMarkOf = (s: Sub) =>
  s.status === "running" ? `<span class="subspin" aria-label="running"></span>` : s.status === "stopped" ? `<span class="subend stop" aria-label="stopped">■</span>` : `<span class="subend" aria-label="done">${icon("check", 11)}</span>`;

function subItem(s: Sub, steps: SubStep[], origin: string | null, now: number, open?: (id: string) => string): string {
  const running = s.status === "running";
  const when = subWhen(s, now);
  const mark = subMarkOf(s);
  const stepRows = steps
    .map((x) => `<div class="act act-${esc(x.kind)}"><span class="aic">${STEP_ICON[x.kind] ?? "·"}</span><span class="atx${x.kind === "text" ? " md" : ""}">${x.kind === "text" ? md(x.text, origin) : esc(x.text.replace(/\n/g, " · "))}</span><span class="when">${time(x.at)}</span></div>`)
    .join("");
  return `<details class="subag${running ? " on" : ""}" id="sub-${esc(s.id)}">
    <summary>${mark}<span class="subdesc">${esc(s.desc || "a subagent")}</span>${s.bg ? `<span class="subbg" title="Runs in the background: the agent goes on meanwhile">bg</span>` : ""}${s.depth > 1 ? `<span class="subbg" title="Started by another subagent">nested</span>` : ""}<span class="submeta">${s.type ? `${esc(s.type)} · ` : ""}${esc(when)} · ${s.steps} step${s.steps === 1 ? "" : "s"}</span></summary>
    <div class="subbody">
      ${s.prompt ? `<div class="subsec"><span class="askh">Asked</span><div class="subprompt">${esc(s.prompt)}</div></div>` : ""}
      ${stepRows ? `<div class="subsec"><span class="askh">Steps${s.steps > steps.length ? ` (the last ${steps.length} of ${s.steps})` : ""}</span><div class="substeps">${stepRows}</div></div>` : running ? `<p class="small muted">No steps yet.</p>` : ""}
      ${s.result ? `<div class="subsec"><span class="askh">Its answer</span><div class="md tkprose subresult">${md(s.result, origin)}</div></div>` : ""}
      ${open ? `<a class="btn sm subopen" href="${open(s.id)}">${icon("message", 13)}Open its view</a>` : ""}
    </div>
  </details>`;
}

/** The strip: empty (but there, for live updates) when the agent has no subagents. */
export function subsRegion(subs: Sub[], steps: Map<string, SubStep[]>, origin: string | null, now = Date.now(), open?: (id: string) => string): string {
  if (!subs.length) return `<section id="subs" class="subs ipart" data-region hidden></section>`;
  const run = runningSubs(subs);
  const done = subs.filter((s) => s.status !== "running").sort((a, b) => b.updated - a.updated);
  const item = (s: Sub) => subItem(s, steps.get(s.id) ?? [], origin, now, open);
  // In the agent's inspector: a heading with the count, the running ones, then the latest finished.
  return `<section id="subs" class="subs ipart" data-region><h3>Subagents<span class="muted">${run.length ? `${run.length} running` : "none running"}${done.length ? ` · ${done.length} finished` : ""}</span></h3><div class="sublist">${[...run, ...done.slice(0, SHOWN_DONE)].map(item).join("")}${
    done.length > SHOWN_DONE ? `<details class="submore" id="subs-more"><summary>${done.length - SHOWN_DONE} earlier</summary>${done.slice(SHOWN_DONE).map(item).join("")}</details>` : ""
  }</div></section>`;
}

/** The tree's mark on an agent with subagents running. */
export function subMark(subs: Sub[]): string {
  const run = runningSubs(subs);
  if (!run.length) return "";
  return `<span class="tsub" title="${esc(`${run.length} subagent${run.length > 1 ? "s" : ""} running: ${run.map((s) => s.desc || s.type || "a subagent").join(" · ")}`)}">${icon("users", 11)}${run.length}</span>`;
}
