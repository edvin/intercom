// Browsers on your machines (remote-chrome slots): which are there, which agent has which (claimed through the
// `browser` tool, so the dashboard can say whose is whose and what for), what's open in each, and a live picture of
// one you can click and type into from the dashboard, take over and hand back. Agents drive their browsers directly
// on their machine (DevTools on 127.0.0.1): nothing of that goes through here. Only these come here: the claims, the
// tab lists when you open the panel, and pictures while you watch one (a JPEG every second or two, only then).

import { type Env, UserError, liveIds, postMessage } from "./lib";
import { type Shot, type Slot, askSession } from "./screen";
import { agentAvatar, esc, icon } from "./ui";
import { newer } from "./upkeep";

export const BROWSERS_SINCE = "0.12.64";

interface Via {
  session_id: string;
  label: string;
  version: string;
  host: string;
}
export interface Holder {
  session_id: string;
  label: string;
  slot: number;
  purpose: string;
  at: number;
}

const supports = (v: string) => !!v && !newer(BROWSERS_SINCE, v);

/** A connected agent of yours on `host` whose intercom knows browsers (any one: no terminal needed). */
async function viaOn(env: Env, me: string, host: string): Promise<Via> {
  if (env.authKind !== "web") throw new UserError("Browsers can only be used from your dashboard.");
  const { results } = await env.DB.prepare("SELECT session_id, label, version, host FROM sessions WHERE member = ? AND host = ? AND last_seen > ? ORDER BY last_seen DESC")
    .bind(me, host, Date.now() - 24 * 3600_000)
    .all<Via>();
  const live = new Set(liveIds(env, me));
  const on = results.filter((r) => live.has(r.session_id) || !env.live);
  if (!on.length) throw new UserError(`None of your agents is connected on ${host} right now; its browsers are reached through one.`);
  const able = on.filter((r) => supports(r.version));
  if (!able.length) throw new UserError(`Browsers need intercom ${BROWSERS_SINCE} on ${host}: update an agent there, then open this again.`);
  return able[0]!;
}

/** Who has which browser on `host`, as they claimed it with the browser tool. */
export async function holders(env: Env, me: string, host: string): Promise<Map<number, Holder>> {
  const { results } = await env.DB.prepare("SELECT session_id, label, browser FROM sessions WHERE member = ? AND host = ? AND browser IS NOT NULL AND last_seen > ?")
    .bind(me, host, Date.now() - 24 * 3600_000)
    .all<{ session_id: string; label: string; browser: string }>();
  const out = new Map<number, Holder>();
  for (const r of results)
    try {
      const b = JSON.parse(r.browser) as { slot?: number; purpose?: string; at?: number };
      if (b.slot) out.set(b.slot, { session_id: r.session_id, label: r.label, slot: b.slot, purpose: String(b.purpose ?? ""), at: Number(b.at) || 0 });
    } catch {}
  return out;
}

export async function listBrowsers(env: Env, me: string, host: string): Promise<{ via: Via; slots: Slot[]; held: Map<number, Holder> }> {
  const via = await viaOn(env, me, host);
  const r = await askSession(env, me, via, { op: "browsers" }, { label: via.label, by: "from the dashboard" });
  if (!r.browsers) throw new UserError(`The intercom on ${host} didn't list its browsers.`);
  return { via, slots: r.browsers, held: await holders(env, me, host) };
}

/** The panel on the Overview: each slot, whose it is and what for, its tabs, and Watch. */
export async function browsersPanel(env: Env, me: string, host: string): Promise<string> {
  const { slots, held } = await listBrowsers(env, me, host);
  if (!slots.length) return `<p class="small muted">No browser slots on ${esc(host)}.</p>`;
  const rows = slots
    .map((s) => {
      // An agent's claim counts while the slot is still claimed (an idle slot releases itself after a while).
      const h = s.claimed ? held.get(s.slot) : undefined;
      const tab = s.tabs[0];
      const who = h
        ? `<a class="brwho" href="/dashboard?view=agents&amp;agent=${encodeURIComponent(`${me}/${h.label}`)}">${agentAvatar(me, h.label, "s")}<b>${esc(h.label)}</b></a>${h.purpose ? `<span class="brwhy">${esc(h.purpose)}</span>` : ""}`
        : s.claimed
          ? `<span class="muted">claimed outside the intercom</span>`
          : `<span class="muted">free</span>`;
      return `<li class="brslot${s.alive ? "" : " dead"}">
        <span class="brn">${s.slot}</span>
        <div class="brmain"><div class="brhd">${who}${s.profile ? `<span class="badge">profile ${esc(s.profile)}</span>` : ""}</div>
          <div class="brtab" title="${esc(tab?.url ?? "")}">${tab ? `<b>${esc(tab.title || tab.url)}</b><span class="muted">${esc(tab.url)}</span>` : `<span class="muted">${s.alive ? "no tab open" : "not running"}</span>`}${s.tabs.length > 1 ? `<span class="badge">${s.tabs.length} tabs</span>` : ""}</div></div>
        ${s.alive ? `<button type="button" class="btn sm" ${browserAttrs(host, s.slot, h?.label ?? "")}>${icon("eye", 13)}Watch</button>` : ""}
      </li>`;
    })
    .join("");
  return `<ul class="brlist">${rows}</ul>`;
}

/** What a button that opens the browser window carries. */
export const browserAttrs = (host: string, slot: number, label: string) => `data-browser="${esc(host)}" data-brslot="${slot}" data-brname="${esc(label)}"`;

/** A picture of slot `slot` on `host`, after your input if any (from the dashboard only). */
export async function browserShot(env: Env, me: string, host: string, slot: number, opts: { tab?: string; ev?: unknown[]; scale?: number }): Promise<Shot & { holder: string }> {
  if (!Number.isInteger(slot) || slot < 1 || slot > 12) throw new UserError("Which browser?");
  const via = await viaOn(env, me, host);
  const ev = (opts.ev ?? []).slice(0, 40);
  const r = await askSession(env, me, via, { op: "browser-shot", slot, ...(opts.tab ? { tab: opts.tab } : {}), scale: opts.scale ?? 0.6, quality: 60, ...(ev.length ? { ev } : {}) }, { label: via.label, by: "from the dashboard" });
  if (!r.shot) throw new UserError(`The intercom on ${host} didn't send a picture of that browser.`);
  const h = (await holders(env, me, host)).get(slot);
  // What you did in an agent's browser goes in its log: opening a page, going back; clicks and keys are too many.
  const nav = ev.find((e) => (e as { type?: string })?.type === "nav") as { url?: string } | undefined;
  if (h && (nav || ev.some((e) => ["back", "forward", "reload"].includes(String((e as { type?: string })?.type)))))
    await env.DB.prepare("INSERT INTO activity (member, session_id, at, kind, text) VALUES (?, ?, ?, 'keys', ?)")
      .bind(me, h.session_id, Date.now(), `you used its browser (slot ${slot}) from the dashboard: ${nav ? `opened ${String(nav.url ?? "").slice(0, 200)}` : String((ev[0] as { type?: string }).type)}`)
      .run();
  return { ...r.shot, holder: h?.label ?? "" };
}

/** Take over an agent's browser (it's told to keep its hands off it until you hand it back), or hand it back. */
export async function handBrowser(env: Env, me: string, host: string, slot: number, op: "take" | "back", note: string): Promise<string> {
  if (env.authKind !== "web") throw new UserError("Only from your dashboard.");
  const h = (await holders(env, me, host)).get(slot);
  if (!h) throw new UserError("No agent of yours has that browser, so there's nobody to tell.");
  const n = note.trim().slice(0, 600);
  const body =
    op === "take"
      ? `I'm using your browser (slot ${slot} on ${host}) myself now from the dashboard. Don't drive it until I hand it back: no clicks, typing or navigation in it. Carry on with anything else meanwhile.${n ? `\n\n${n}` : ""}`
      : `I've handed your browser (slot ${slot} on ${host}) back: you can drive it again. Look at its page first, as I may have changed it.${n ? `\n\n${n}` : ""}`;
  await postMessage(env, { channel: "dm", sender: me, recipient: me, recipient_agent: h.label, body });
  await env.DB.prepare("INSERT INTO activity (member, session_id, at, kind, text) VALUES (?, ?, ?, 'keys', ?)")
    .bind(me, h.session_id, Date.now(), op === "take" ? `you took over its browser (slot ${slot}) from the dashboard` : `you handed its browser (slot ${slot}) back`)
    .run();
  env.refreshWeb?.(me);
  return op === "take" ? `${h.label} is told to keep off its browser until you hand it back.` : `${h.label} has its browser back.`;
}

// ---- for agents: the browser tool ----

function mine(env: Env): { session_id: string; label: string } {
  if (!env.session) throw new UserError("The browser tool works from an agent's session (Claude Code or Codex with the intercom plugin).");
  return { session_id: env.session.session_id, label: env.session.label };
}

async function heldBy(env: Env, me: string, sessionId: string): Promise<{ slot: number; purpose: string } | null> {
  const r = await env.DB.prepare("SELECT browser FROM sessions WHERE member = ? AND session_id = ?").bind(me, sessionId).first<{ browser: string | null }>();
  try {
    return r?.browser ? (JSON.parse(r.browser) as { slot: number; purpose: string }) : null;
  } catch {
    return null;
  }
}

export async function claimBrowser(env: Env, me: string, a: { purpose: string; profile?: string; copy?: boolean }): Promise<string> {
  const s = mine(env);
  const had = await heldBy(env, me, s.session_id);
  if (had) throw new UserError(`You already have browser slot ${had.slot} (${had.purpose}). Use it, or release it first (action: release).`);
  const r = await askSession(env, me, s, { op: "browser-claim", ...(a.profile ? { profile: a.profile, copy: !!a.copy } : {}) }, { label: s.label, by: "by itself" });
  const c = r.claimed as { slot?: number; mcp?: string; cdp?: string } | undefined;
  if (!c?.slot) throw new UserError("The browsers here didn't give a slot.");
  await env.DB.prepare("UPDATE sessions SET browser = ? WHERE member = ? AND session_id = ?").bind(JSON.stringify({ slot: c.slot, purpose: a.purpose.slice(0, 200), at: Date.now() }), me, s.session_id).run();
  await env.DB.prepare("INSERT INTO activity (member, session_id, at, kind, text) VALUES (?, ?, ?, 'tool', ?)").bind(me, s.session_id, Date.now(), `claimed browser slot ${c.slot}: ${a.purpose.slice(0, 200)}`).run();
  env.refreshWeb?.(me);
  return [
    `You have browser slot ${c.slot}${a.profile ? ` (profile ${a.profile}${a.copy ? ", a throwaway copy" : ""})` : ""}. Drive it with the ${c.mcp || `remote-chrome-slot${c.slot}`} MCP server's tools only (DevTools at ${c.cdp}); never another slot's.`,
    `Your user can watch it and step in from the dashboard. If they take it over, you're told: then keep off it until they hand it back.`,
    `To change its size, use that server's resize_page (or emulate for a phone). To show your user what it shows, use the browser tool's screenshot action. Release it when you're done (action: release): it's wiped for the next agent${a.profile ? ", the profile kept" : ""}.`,
  ].join("\n");
}

export async function releaseBrowser(env: Env, me: string, keep: boolean): Promise<string> {
  const s = mine(env);
  const had = await heldBy(env, me, s.session_id);
  if (!had) throw new UserError("You don't have a browser claimed.");
  await askSession(env, me, s, { op: "browser-release", slot: had.slot, keep }, { label: s.label, by: "by itself" }).catch((e) => {
    if (!(e instanceof UserError)) throw e;
  });
  await env.DB.prepare("UPDATE sessions SET browser = NULL WHERE member = ? AND session_id = ?").bind(me, s.session_id).run();
  env.refreshWeb?.(me);
  return keep ? `Released slot ${had.slot}; its tabs stay open.` : `Released slot ${had.slot}: it's wiped and free for the next agent.`;
}

/** The agent's own slot, pictured at full size: a JPEG for share_file-style posting. */
export async function shootOwn(env: Env, me: string): Promise<{ data: string; slot: number; title: string; url: string }> {
  const s = mine(env);
  const had = await heldBy(env, me, s.session_id);
  if (!had) throw new UserError("You don't have a browser claimed (action: claim).");
  const r = await askSession(env, me, s, { op: "browser-shot", slot: had.slot, scale: 1, quality: 85 }, { label: s.label, by: "by itself" });
  if (!r.shot) throw new UserError("The browser didn't send a picture.");
  return { data: r.shot.img, slot: had.slot, title: r.shot.title, url: r.shot.url };
}

/** What's on this machine, for the agent: each slot, free or whose. */
export async function statusOwn(env: Env, me: string): Promise<string> {
  const s = mine(env);
  const r = await askSession(env, me, s, { op: "browsers" }, { label: s.label, by: "by itself" });
  const host = (await env.DB.prepare("SELECT host FROM sessions WHERE member = ? AND session_id = ?").bind(me, s.session_id).first<{ host: string }>())?.host ?? "";
  const held = await holders(env, me, host);
  return (r.browsers ?? []).map((b) => `slot ${b.slot}: ${held.get(b.slot) ? `${held.get(b.slot)!.label}${held.get(b.slot)!.session_id === s.session_id ? " (you)" : ""}, ${held.get(b.slot)!.purpose}` : b.claimed ? "claimed outside the intercom" : "free"} · ${b.tabs[0] ? `${b.tabs[0].title || ""} ${b.tabs[0].url}` : "no tab"}`).join("\n") || "No browser slots on this machine.";
}

/** The browser window, once per dashboard page: any [data-browser] button opens it for its slot. */
export function browserDialog(): string {
  return `<dialog id="dlg-browser" class="brdlg"><div class="hd">${icon("globe", 18)}<h2 data-brtitle>Browser</h2><span class="scrlive" title="Redrawn every second or two while open"><span class="dot"></span>live</span><span class="grow"></span>
      <button type="button" class="btn sm" data-brhand="take" hidden title="Tell its agent to keep off it until you hand it back">${icon("hand", 13)}Take over</button><button type="button" class="btn sm primary" data-brhand="back" hidden title="Tell its agent it can drive it again">${icon("arrow", 13)}Hand back</button>
      <button type="button" class="btn ghost sm icon" data-close title="Close">${icon("x", 15)}</button></div>
    <div class="brbar"><button type="button" class="btn ghost sm icon" data-brev="back" title="Back">${icon("back", 14)}</button><button type="button" class="btn ghost sm icon" data-brev="forward" title="Forward" style="transform:scaleX(-1)">${icon("back", 14)}</button><button type="button" class="btn ghost sm icon" data-brev="reload" title="Reload">${icon("refresh", 14)}</button>
      <form class="brurl" data-brurl><input name="url" autocomplete="off" spellcheck="false" placeholder="Address" aria-label="Address"></form><select data-brtabs aria-label="Tab" hidden></select></div>
    <div class="brbody" tabindex="0" data-brbody><p class="small muted brmsg">Loading…</p><img data-brimg alt="" hidden></div>
    <p class="brhint"><b>Click the page and type:</b> clicks, keys and scrolling go to the browser. Click outside it to stop.</p>
  </dialog>`;
}
