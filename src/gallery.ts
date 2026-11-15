// Files from agents (view=files): every image and file an agent shared where you can see it, as a grid of
// thumbnails without the messages around them, or as a list with name, who shared it, size and when (the default for
// files, which have no picture to show). Filter by agent, project and kind; an image opens in the viewer
// (← → step through the grid), a file opens in the reader or downloads. Kept as long as the files are (30 days).

import { RETENTION_DAYS, VIDEO_EXTS, isImage, playable, readableName, size, thumbKey, videoType } from "./attachments";
import { type Env, ago } from "./lib";
import { esc, icon } from "./ui";

interface Item {
  id: number;
  mime: string;
  bytes: number;
  name: string;
  created_at: number;
  sender: string;
  sender_agent: string;
  channel: string;
}

const PAGE = 120;

/** Messages from an agent that `me` can read: sent by one of theirs, sent to them, or posted in one of their projects. */
const VISIBLE = `m.sender_agent IS NOT NULL AND m.cancelled_at IS NULL AND m.held_at IS NULL AND a.created_at > ?2
  AND (m.sender = ?1 OR m.recipient = ?1 OR (m.recipient IS NULL AND m.channel IN (SELECT project FROM project_members WHERE member = ?1)))`;

const IMG = "a.mime IN ('image/png','image/jpeg','image/webp','image/gif')";
// A video by its name or its type (videoType in attachments.ts).
const VID = `(a.mime LIKE 'video/%' OR ${VIDEO_EXTS.map((e) => `lower(a.name) LIKE '%.${e}'`).join(" OR ")})`;

type Kind = "images" | "videos" | "files" | "all";
interface Filters {
  agent: string;
  project: string;
  kind: Kind;
  /** Part of the file's name, any case. */
  q: string;
}
export const galleryFilters = (get: (k: string) => string | null | undefined): Filters => {
  const k = get("kind");
  return { agent: get("agent") ?? "", project: get("project") ?? "", kind: k === "files" || k === "all" || k === "videos" ? k : "images", q: (get("q") ?? "").trim().slice(0, 100) };
};

/** What the grid shows with these filters, as SQL over attachments a JOIN messages m (binds ?1 = me, ?2 = since). */
function scope(me: string, { agent, project, kind, q }: Filters) {
  const where = [VISIBLE];
  const binds: unknown[] = [me, Date.now() - RETENTION_DAYS * 86400_000];
  if (agent.includes("/")) {
    const [member, label] = [agent.slice(0, agent.indexOf("/")), agent.slice(agent.indexOf("/") + 1)];
    binds.push(member, label);
    where.push(`m.sender = ?${binds.length - 1} AND m.sender_agent = ?${binds.length}`);
  }
  if (project) {
    binds.push(project);
    where.push(`m.channel = ?${binds.length}`);
  }
  if (q) {
    binds.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`a.name LIKE ?${binds.length} ESCAPE '\\'`);
  }
  if (kind !== "all") where.push(kind === "images" ? IMG : kind === "videos" ? VID : `NOT ${IMG} AND NOT ${VID}`);
  return { where, binds };
}

/** How far back Clean up can keep: the last day, 3 days, week or 2 weeks. */
export const PRUNE_DAYS = [1, 3, 7, 14];
const keepLabel = (d: number) => (d === 1 ? "the last day" : d === 7 ? "the last week" : d === 14 ? "the last 2 weeks" : `the last ${d} days`);

/**
 * Clean up: delete the files your own agents shared that are older than `days`, among what the filters show (the bytes
 * and thumbnails in R2 too). Teammates' agents' files stay. A message that named one shows it as removed.
 */
export async function pruneFiles(env: Env, me: string, days: number, f: Filters): Promise<{ n: number; bytes: number }> {
  if (!PRUNE_DAYS.includes(days)) throw new Error("Pick how many days to keep");
  const { where, binds } = scope(me, f);
  binds.push(Date.now() - days * 86400_000);
  where.push(`m.sender = ?1 AND a.created_at < ?${binds.length}`);
  const { results } = await env.DB.prepare(`SELECT a.id, a.r2_key, a.bytes FROM attachments a JOIN messages m ON m.id = a.message_id WHERE ${where.join(" AND ")}`)
    .bind(...binds)
    .all<{ id: number; r2_key: string; bytes: number }>();
  for (let i = 0; i < results.length; i += 400) {
    const part = results.slice(i, i + 400);
    await env.files?.delete(part.flatMap((r) => [r.r2_key, thumbKey(r)]));
    await env.DB.prepare("DELETE FROM attachments WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(part.map((r) => r.id))).run();
  }
  return { n: results.length, bytes: results.reduce((s, r) => s + r.bytes, 0) };
}

export async function galleryView(env: Env, me: string, url: URL): Promise<string> {
  const p = url.searchParams;
  const filters = galleryFilters((k) => p.get(k));
  const { agent, project, kind, q } = filters;
  const before = Number(p.get("before")) || 0;
  // A list unless you look at images or videos only: a file has no picture, so a tile of it says little.
  const listDefault = kind === "files" || kind === "all";
  const asList = kind === "files" || (p.get("layout") === "list" ? true : p.get("layout") === "grid" ? false : listDefault);
  const { where, binds } = scope(me, filters);
  const since = binds[1] as number;
  // Clean up: how many of your agents' files (with these filters) each choice would delete.
  const old = scope(me, filters);
  old.where.push("m.sender = ?1");
  const cuts = PRUNE_DAYS.map((d) => Date.now() - d * 86400_000);
  const cutSql = cuts.map((_, i) => `SUM(a.created_at < ?${old.binds.length + 1 + i}) AS n${i}, SUM(CASE WHEN a.created_at < ?${old.binds.length + 1 + i} THEN a.bytes ELSE 0 END) AS b${i}`).join(", ");
  if (before) {
    binds.push(before);
    where.push(`a.id < ?${binds.length}`);
  }
  const [{ results: items }, { results: facets }, olds] = await Promise.all([
    env.DB.prepare(
      `SELECT a.id, a.mime, a.bytes, a.name, a.created_at, m.sender, m.sender_agent, m.channel
       FROM attachments a JOIN messages m ON m.id = a.message_id WHERE ${where.join(" AND ")} ORDER BY a.id DESC LIMIT ${PAGE + 1}`,
    )
      .bind(...binds)
      .all<Item>(),
    // What the filters offer: every agent and project with something in the last 30 days, whatever is picked.
    env.DB.prepare(
      `SELECT m.sender, m.sender_agent, m.channel, COUNT(*) AS n, SUM(${IMG}) AS imgs, SUM(${VID}) AS vids FROM attachments a JOIN messages m ON m.id = a.message_id
       WHERE ${VISIBLE} GROUP BY m.sender, m.sender_agent, m.channel`,
    )
      .bind(me, since)
      .all<{ sender: string; sender_agent: string; channel: string; n: number; imgs: number; vids: number }>(),
    env.DB.prepare(`SELECT ${cutSql} FROM attachments a JOIN messages m ON m.id = a.message_id WHERE ${old.where.join(" AND ")}`)
      .bind(...old.binds, ...cuts)
      .first<Record<string, number | null>>(),
  ]);
  const more = items.length > PAGE;
  const shown = items.slice(0, PAGE);

  const agents = new Map<string, number>();
  const projects = new Map<string, number>();
  for (const f of facets) {
    const k = `${f.sender}/${f.sender_agent}`;
    agents.set(k, (agents.get(k) ?? 0) + f.n);
    projects.set(f.channel, (projects.get(f.channel) ?? 0) + f.n);
  }
  const total = facets.reduce((s, f) => s + f.n, 0);
  const imgs = facets.reduce((s, f) => s + (f.imgs ?? 0), 0);
  const vids = facets.reduce((s, f) => s + (f.vids ?? 0), 0);
  // Your own agents first, then everyone else's, each by name.
  const agentKeys = [...agents.keys()].sort((a, b) => Number(!a.startsWith(`${me}/`)) - Number(!b.startsWith(`${me}/`)) || a.localeCompare(b));
  if (agent && !agents.has(agent)) agentKeys.unshift(agent);
  const projectKeys = [...projects.keys()].sort();
  if (project && !projects.has(project)) projectKeys.unshift(project);

  const link = (over: Record<string, string>) => {
    const qs = new URLSearchParams({ view: "files" });
    const all = { agent, project, q, kind: kind === "images" ? "" : kind, layout: kind !== "files" && asList !== listDefault ? (asList ? "list" : "grid") : "", ...over };
    for (const [k, v] of Object.entries(all)) if (v) qs.set(k, v);
    return `/dashboard?${qs}`;
  };
  const who = (k: string) => (k.startsWith(`${me}/`) ? k.slice(me.length + 1) : k);
  const opt = (v: string, label: string, on: boolean) => `<option value="${esc(v)}"${on ? " selected" : ""}>${esc(label)}</option>`;
  const seg = (k: "images" | "videos" | "files" | "all", label: string, ico: string) =>
    `<a href="${esc(link({ kind: k === "images" ? "" : k, before: "" }))}"${kind === k ? ' class="on"' : ""}>${icon(ico, 13)}<span>${label}</span></a>`;

  const bar = `<form class="galbar" method="get" action="/dashboard" data-native>
    <input type="hidden" name="view" value="files">${kind === "images" ? "" : `<input type="hidden" name="kind" value="${kind}">`}
    <nav class="seg" aria-label="Kind">${seg("images", "Images", "image")}${seg("videos", "Videos", "film")}${seg("files", "Files", "file")}${seg("all", "All", "layers")}</nav>${asList !== listDefault ? `<input type="hidden" name="layout" value="${asList ? "list" : "grid"}">` : ""}
    <label class="galq">${icon("search", 14)}<input type="search" name="q" value="${esc(q)}" placeholder="Find by name" aria-label="Find a file by name" autocomplete="off" spellcheck="false" data-galq${q ? " autofocus" : ""}></label>
    <select name="agent" aria-label="Agent" onchange="this.form.requestSubmit()">${opt("", "All agents", !agent)}${agentKeys.map((k) => opt(k, who(k), k === agent)).join("")}</select>
    <select name="project" aria-label="Project" onchange="this.form.requestSubmit()">${opt("", "All projects", !project)}${projectKeys.map((k) => opt(k, `#${k}`, k === project)).join("")}</select>
    ${agent || project || q ? `<a class="btn ghost sm" href="${esc(link({ agent: "", project: "", q: "", before: "" }))}" title="Clear the filters">${icon("x", 13)}<span class="lbl">Clear</span></a>` : ""}
    ${kind === "files" ? "" : `<nav class="seg gallay" aria-label="Layout"><a href="${esc(link({ layout: listDefault ? "grid" : "" }))}"${asList ? "" : ' class="on"'} title="Thumbnails">${icon("grid", 14)}</a><a href="${esc(link({ layout: listDefault ? "" : "list" }))}"${asList ? ' class="on"' : ""} title="List with sizes and dates">${icon("list", 14)}</a></nav>`}
  </form>`;

  // Each tile only: no message, no name under it. The name, agent and age are its tooltip.
  const tile = (f: Item) => {
    const from = `${who(`${f.sender}/${f.sender_agent}`)} · #${f.channel} · ${ago(f.created_at)}`;
    const tip = esc(`${f.name} · ${from}`);
    if (isImage(f.mime))
      return `<a class="att gtile" href="/attachment/${f.id}" title="${tip}" data-name="${esc(f.name)}"><img src="/attachment/${f.id}/thumb" alt="${esc(f.name)}" loading="lazy" decoding="async"></a>`;
    // A video: its first frame, a play button and its length; it plays in the viewer (← → step through the grid).
    if (playable(videoType(f.name, f.mime)))
      return `<a class="attv gtile gvid" href="/attachment/${f.id}" data-video data-name="${esc(f.name)}" title="${esc(`${f.name} · ${size(f.bytes)} · ${from}`)}"><img src="/attachment/${f.id}/thumb" alt="" loading="lazy" decoding="async" data-poster><span class="attv-play">▶</span><span class="attv-n">${esc(f.name)}</span></a>`;
    const ext = (/\.([a-z0-9]{1,8})$/i.exec(f.name)?.[1] ?? "file").toUpperCase();
    const stem = f.name.replace(/\.[a-z0-9]{1,8}$/i, "");
    const href = readableName(f.name) ? `/attachment/${f.id}/view` : `/attachment/${f.id}`;
    return `<a class="gtile gfile" href="${href}" data-name="${esc(f.name)}" data-size="${esc(size(f.bytes))}"${readableName(f.name) ? ' target="_blank" rel="noopener"' : ` download="${esc(f.name)}"`} title="${esc(`${f.name} · ${size(f.bytes)} · ${from}`)}">${icon("file", 26)}<span class="gext">${esc(ext)}</span><span class="gname">${esc(stem)}</span><span class="gsize">${esc(size(f.bytes))}</span></a>`;
  };

  // A row: a small thumbnail (or the file's type), its name, who shared it where, its size and when. The same link and
  // classes as a tile, so it opens in the viewer and ← → step through the list.
  const row = (f: Item) => {
    const by = `${who(`${f.sender}/${f.sender_agent}`)} · #${f.channel}`;
    const ext = (/\.([a-z0-9]{1,8})$/i.exec(f.name)?.[1] ?? "file").toUpperCase();
    const vid = !isImage(f.mime) && playable(videoType(f.name, f.mime));
    const lead = isImage(f.mime)
      ? `<img src="/attachment/${f.id}/thumb" alt="" loading="lazy" decoding="async">`
      : vid ? `<img src="/attachment/${f.id}/thumb" alt="" loading="lazy" decoding="async" data-poster><span class="glplay">▶</span>` : `<span class="gext">${esc(ext.slice(0, 4))}</span>`;
    const cells = `<span class="glth">${lead}</span><span class="glnm">${esc(f.name)}</span><span class="glby">${esc(by)}</span><span class="glsz">${esc(size(f.bytes))}</span><time class="gldt" data-ts="${f.created_at}" data-date title="${new Date(f.created_at).toISOString()}">${esc(ago(f.created_at))}</time>`;
    if (isImage(f.mime)) return `<a class="att glrow" href="/attachment/${f.id}" data-name="${esc(f.name)}">${cells}</a>`;
    if (vid) return `<a class="attv glrow" href="/attachment/${f.id}" data-video data-name="${esc(f.name)}">${cells}</a>`;
    const href = readableName(f.name) ? `/attachment/${f.id}/view` : `/attachment/${f.id}`;
    return `<a class="gfile glrow" href="${href}" data-name="${esc(f.name)}" data-size="${esc(size(f.bytes))}"${readableName(f.name) ? ' target="_blank" rel="noopener"' : ` download="${esc(f.name)}"`}>${cells}</a>`;
  };

  // Clean up: keep the last day / 3 days / week / 2 weeks of what your agents shared, with the filters as they are.
  const what = kind === "images" ? "image" : kind === "videos" ? "video" : "file";
  const cnt = (n: number) => `${n} ${n === 1 ? what : what + "s"}`;
  const choices = PRUNE_DAYS.map((d, i) => ({ d, n: Number(olds?.[`n${i}`] ?? 0), b: Number(olds?.[`b${i}`] ?? 0) }));
  const first = choices.find((c) => c.d === 7 && c.n) ?? choices.find((c) => c.n);
  const scopeText = [agent ? who(agent) : "", project ? `#${project}` : ""].filter(Boolean).join(" in ") + (q ? `${agent || project ? " " : ""}named “${q}”` : "");
  const prune = first
    ? `<form class="galprune" method="post" action="/action/prunefiles">
      <input type="hidden" name="back" value="${esc(link({ before: "" }))}">
      <input type="hidden" name="agent" value="${esc(agent)}"><input type="hidden" name="project" value="${esc(project)}"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="q" value="${esc(q)}">
      <label for="galkeep">Keep</label>
      <select id="galkeep" name="days" aria-label="How much to keep">${choices
        .map((c) => `<option value="${c.d}"${c === first ? " selected" : ""}${c.n ? "" : " disabled"} data-n="${esc(cnt(c.n))}" data-b="${esc(size(c.b))}">${keepLabel(c.d)}${c.n ? ` (−${c.n})` : ""}</option>`)
        .join("")}</select>
      <button class="btn sm" type="submit" data-scope="${esc(`${kind === "all" ? "files" : kind}${scopeText ? ` ${q && !agent && !project ? "" : "from "}${scopeText}` : ""}`)}" title="Delete older ${what}s your own agents shared${scopeText ? ` (${scopeText})` : ""}; teammates' agents' files stay">${icon("trash", 13)}<span>Delete older</span></button>
    </form>`
    : "";
  const empty = `<div class="empty galempty">${icon(kind === "files" ? "file" : kind === "videos" ? "film" : "image", 30)}<div>${
    total === 0 ? "No files from agents in the last 30 days." : q ? `Nothing named “${esc(q)}”${kind === "all" ? "" : ` among the ${kind}`}.${kind === "all" ? "" : ` <a href="${esc(link({ kind: "all", before: "" }))}">Look in all files</a>`}` : agent || project ? "Nothing here with these filters." : kind === "images" ? "No images from agents; try Files." : kind === "videos" ? "No videos from agents in the last 30 days." : "No files of this kind."
  }</div><div class="small muted">Agents share screenshots, renders and reports with <code>share_file</code>; they show here for ${RETENTION_DAYS} days.</div></div>`;

  return `<div class="pane-in galpane">
    <header class="flhead"><div><h1>Files from agents</h1><p class="muted">${total ? `${imgs} image${imgs === 1 ? "" : "s"}, ${vids} video${vids === 1 ? "" : "s"} and ${total - imgs - vids} other file${total - imgs - vids === 1 ? "" : "s"} in the last ${RETENTION_DAYS} days.` : `Nothing shared in the last ${RETENTION_DAYS} days.`}</p></div>${prune}</header>
    ${bar}
    ${!shown.length ? empty : asList ? `<div class="glist" data-gallery><div class="glhd" aria-hidden="true"><span></span><span>Name</span><span>Shared by</span><span>Size</span><span>When</span></div>${shown.map(row).join("")}</div>` : `<div class="gal" data-gallery>${shown.map(tile).join("")}</div>`}
    ${more || before ? `<nav class="galmore">${before ? `<a class="btn ghost sm" href="${esc(link({ before: "" }))}">${icon("back", 13)}Newest</a>` : ""}${more ? `<a class="btn sm" href="${esc(link({ before: String(shown[shown.length - 1].id) }))}">Older${icon("arrow", 13)}</a>` : ""}</nav>` : ""}
  </div>`;
}
