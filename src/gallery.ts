// Files from agents (view=files): every image and file an agent shared where you can see it, as a grid of
// thumbnails without the messages around them (a file that isn't an image shows its type, name and size). Filter by agent, project and kind; an image opens in the viewer
// (← → step through the grid), a file opens in the reader or downloads. Kept as long as the files are (30 days).

import { RETENTION_DAYS, isImage, readableName, size } from "./attachments";
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

export async function galleryView(env: Env, me: string, url: URL): Promise<string> {
  const p = url.searchParams;
  const agent = p.get("agent") ?? "";
  const project = p.get("project") ?? "";
  const kind = p.get("kind") === "files" ? "files" : p.get("kind") === "all" ? "all" : "images";
  const before = Number(p.get("before")) || 0;
  const since = Date.now() - RETENTION_DAYS * 86400_000;
  const IMG = "a.mime IN ('image/png','image/jpeg','image/webp','image/gif')";

  const where = [VISIBLE];
  const binds: unknown[] = [me, since];
  if (agent.includes("/")) {
    const [member, label] = [agent.slice(0, agent.indexOf("/")), agent.slice(agent.indexOf("/") + 1)];
    binds.push(member, label);
    where.push(`m.sender = ?${binds.length - 1} AND m.sender_agent = ?${binds.length}`);
  }
  if (project) {
    binds.push(project);
    where.push(`m.channel = ?${binds.length}`);
  }
  if (kind !== "all") where.push(kind === "images" ? IMG : `NOT ${IMG}`);
  if (before) {
    binds.push(before);
    where.push(`a.id < ?${binds.length}`);
  }
  const [{ results: items }, { results: facets }] = await Promise.all([
    env.DB.prepare(
      `SELECT a.id, a.mime, a.bytes, a.name, a.created_at, m.sender, m.sender_agent, m.channel
       FROM attachments a JOIN messages m ON m.id = a.message_id WHERE ${where.join(" AND ")} ORDER BY a.id DESC LIMIT ${PAGE + 1}`,
    )
      .bind(...binds)
      .all<Item>(),
    // What the filters offer: every agent and project with something in the last 30 days, whatever is picked.
    env.DB.prepare(
      `SELECT m.sender, m.sender_agent, m.channel, COUNT(*) AS n, SUM(${IMG}) AS imgs FROM attachments a JOIN messages m ON m.id = a.message_id
       WHERE ${VISIBLE} GROUP BY m.sender, m.sender_agent, m.channel`,
    )
      .bind(me, since)
      .all<{ sender: string; sender_agent: string; channel: string; n: number; imgs: number }>(),
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
  // Your own agents first, then everyone else's, each by name.
  const agentKeys = [...agents.keys()].sort((a, b) => Number(!a.startsWith(`${me}/`)) - Number(!b.startsWith(`${me}/`)) || a.localeCompare(b));
  if (agent && !agents.has(agent)) agentKeys.unshift(agent);
  const projectKeys = [...projects.keys()].sort();
  if (project && !projects.has(project)) projectKeys.unshift(project);

  const link = (over: Record<string, string>) => {
    const q = new URLSearchParams({ view: "files" });
    const all = { agent, project, kind: kind === "images" ? "" : kind, ...over };
    for (const [k, v] of Object.entries(all)) if (v) q.set(k, v);
    return `/dashboard?${q}`;
  };
  const who = (k: string) => (k.startsWith(`${me}/`) ? k.slice(me.length + 1) : k);
  const opt = (v: string, label: string, on: boolean) => `<option value="${esc(v)}"${on ? " selected" : ""}>${esc(label)}</option>`;
  const seg = (k: "images" | "files" | "all", label: string, ico: string) =>
    `<a href="${esc(link({ kind: k === "images" ? "" : k, before: "" }))}"${kind === k ? ' class="on"' : ""}>${icon(ico, 13)}<span>${label}</span></a>`;

  const filters = `<form class="galbar" method="get" action="/dashboard" data-native>
    <input type="hidden" name="view" value="files">${kind === "images" ? "" : `<input type="hidden" name="kind" value="${kind}">`}
    <nav class="seg" aria-label="Kind">${seg("images", "Images", "image")}${seg("files", "Files", "file")}${seg("all", "All", "layers")}</nav>
    <select name="agent" aria-label="Agent" onchange="this.form.requestSubmit()">${opt("", "All agents", !agent)}${agentKeys.map((k) => opt(k, who(k), k === agent)).join("")}</select>
    <select name="project" aria-label="Project" onchange="this.form.requestSubmit()">${opt("", "All projects", !project)}${projectKeys.map((k) => opt(k, `#${k}`, k === project)).join("")}</select>
    ${agent || project ? `<a class="btn ghost sm" href="${esc(link({ agent: "", project: "", before: "" }))}" title="Clear the filters">${icon("x", 13)}<span class="lbl">Clear</span></a>` : ""}
  </form>`;

  // Each tile only: no message, no name under it. The name, agent and age are its tooltip.
  const tile = (f: Item) => {
    const from = `${who(`${f.sender}/${f.sender_agent}`)} · #${f.channel} · ${ago(f.created_at)}`;
    const tip = esc(`${f.name} · ${from}`);
    if (isImage(f.mime))
      return `<a class="att gtile" href="/attachment/${f.id}" title="${tip}" data-name="${esc(f.name)}"><img src="/attachment/${f.id}" alt="${esc(f.name)}" loading="lazy" decoding="async"></a>`;
    const ext = (/\.([a-z0-9]{1,8})$/i.exec(f.name)?.[1] ?? "file").toUpperCase();
    const stem = f.name.replace(/\.[a-z0-9]{1,8}$/i, "");
    const href = readableName(f.name) ? `/attachment/${f.id}/view` : `/attachment/${f.id}`;
    return `<a class="gtile gfile" href="${href}"${readableName(f.name) ? ' target="_blank" rel="noopener"' : ` download="${esc(f.name)}"`} title="${esc(`${f.name} · ${size(f.bytes)} · ${from}`)}">${icon("file", 26)}<span class="gext">${esc(ext)}</span><span class="gname">${esc(stem)}</span><span class="gsize">${esc(size(f.bytes))}</span></a>`;
  };

  const empty = `<div class="empty galempty">${icon(kind === "files" ? "file" : "image", 30)}<div>${
    total === 0 ? "No files from agents in the last 30 days." : agent || project ? "Nothing here with these filters." : kind === "images" ? "No images from agents; try Files." : "No files of this kind."
  }</div><div class="small muted">Agents share screenshots, renders and reports with <code>share_file</code>; they show here for ${RETENTION_DAYS} days.</div></div>`;

  return `<div class="pane-in galpane">
    <header class="flhead"><div><h1>Files from agents</h1><p class="muted">${total ? `${imgs} image${imgs === 1 ? "" : "s"} and ${total - imgs} file${total - imgs === 1 ? "" : "s"} in the last ${RETENTION_DAYS} days.` : `Nothing shared in the last ${RETENTION_DAYS} days.`}</p></div></header>
    ${filters}
    ${shown.length ? `<div class="gal" data-gallery>${shown.map(tile).join("")}</div>` : empty}
    ${more || before ? `<nav class="galmore">${before ? `<a class="btn ghost sm" href="${esc(link({ before: "" }))}">${icon("back", 13)}Newest</a>` : ""}${more ? `<a class="btn sm" href="${esc(link({ before: String(shown[shown.length - 1].id) }))}">Older${icon("arrow", 13)}</a>` : ""}</nav>` : ""}
  </div>`;
}
