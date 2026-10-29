// The code view of your own agents: a session's uncommitted changes, its recent commits and its repo's files,
// read on its machine when you open them (plugins/intercom/code.mjs) and drawn here; nothing of it is stored.
// The request goes over the session's WebSocket and the answer comes back as a POST; the hub is one object,
// so the waiting request and the answer meet in memory, as with fetched files (localfiles.ts).

import { type Env, UserError, ago } from "./lib";
import { outdated } from "./version";
import { esc, icon } from "./ui";

/** The first plugin version whose local server answers code requests. */
export const CODE_SINCE = "0.12.23";
/** … and searches (find). */
export const SEARCH_SINCE = "0.12.24";
const WAIT_MS = 20_000;

interface Commit {
  sha: string;
  short: string;
  author: string;
  at: number;
  subject?: string;
  unpushed?: boolean;
}
interface FileStat {
  path: string;
  kind: string;
  add: number | null;
  del: number | null;
}
interface Overview {
  name: string;
  branch: string;
  head: string | null;
  upstream: string;
  ahead: number;
  behind: number;
  log: Commit[];
}
interface CodeData extends Overview {
  files?: FileStat[];
  diff?: string;
  truncated?: boolean;
  commit?: Commit & { message: string; parents: string[]; files: FileStat[]; diff: string; truncated: boolean };
  list?: { dir: string; dirs: string[]; files: string[] };
  file?: { path: string; rev: string; text?: string; binary?: boolean; tooBig?: number; size?: number };
  find?: { q: string; mode: "files" | "text"; hits: { path: string; line?: number; text?: string }[]; more: boolean };
}
export interface CodeQuery {
  op: "changes" | "commit" | "list" | "file" | "find";
  q?: string;
  mode?: "files" | "text";
  sha?: string;
  dir?: string;
  path?: string;
  rev?: string;
}

type Reply = { data: CodeData } | { error: string };
const waiting = new Map<string, { member: string; done: (r: Reply) => void }>();

/** What the URL asks for: ?code=changes, commits, commit&sha=, files&dir= or file&path=&rev= */
export function codeQuery(url: URL): { tab: string; q: CodeQuery } {
  const p = (k: string) => (url.searchParams.get(k) ?? "").slice(0, 1024);
  const tab = p("code");
  if (tab === "commit") return { tab: "commits", q: { op: "commit", sha: p("sha") } };
  if (tab === "commits") return { tab, q: { op: "changes" } };
  if (tab === "files") return { tab, q: { op: "list", dir: p("dir") } };
  if (tab === "search") return { tab: "files", q: { op: "find", q: p("q").slice(0, 200), mode: p("in") === "text" ? "text" : "files" } };
  if (tab === "file") return { tab: p("rev") && p("rev") !== "worktree" ? "commits" : "files", q: { op: "file", path: p("path"), rev: p("rev") || "worktree" } };
  return { tab: "changes", q: { op: "changes" } };
}

/** Ask `me`'s agent `label` (connected, on a recent plugin) about its repo; throws UserError with the reason. */
export async function askCode(env: Env, me: string, label: string, q: CodeQuery): Promise<CodeData> {
  if (!env.askCode) throw new UserError("The code view isn't available here.");
  const s = await env.DB.prepare("SELECT session_id, version FROM sessions WHERE member = ? AND label = ? ORDER BY last_seen DESC LIMIT 1")
    .bind(me, label)
    .first<{ session_id: string; version: string }>();
  if (!s) throw new UserError(`You have no agent named ${label}.`);
  const since = q.op === "find" ? SEARCH_SINCE : CODE_SINCE;
  if (outdated(s.version, since)) throw new UserError(`${label} runs intercom ${s.version || "(unknown)"}; ${q.op === "find" ? "searching" : "the code view"} needs ${since}. Restart it after /intercom:update.`);
  const req = crypto.randomUUID();
  const reply = new Promise<Reply>((resolve) => {
    const timer = setTimeout(() => done({ error: `${label} didn't answer within ${WAIT_MS / 1000} seconds.` }), WAIT_MS);
    const done = (r: Reply) => {
      clearTimeout(timer);
      waiting.delete(req);
      resolve(r);
    };
    waiting.set(req, { member: me, done });
  });
  if (!env.askCode(me, s.session_id, req, q)) waiting.get(req)?.done({ error: `${label} isn't connected right now; its code can be read while it runs.` });
  const r = await reply;
  if ("error" in r) throw new UserError(r.error);
  return r.data;
}

/** A local server's answer to a code request. */
export function codeReply(me: string, body: { req?: unknown; data?: unknown; error?: unknown }): boolean {
  const w = waiting.get(String(body.req ?? ""));
  if (!w || w.member !== me) return false;
  if (typeof body.error === "string") w.done({ error: body.error.slice(0, 300) });
  else if (body.data && typeof body.data === "object") w.done({ data: body.data as CodeData });
  else w.done({ error: "The agent sent an empty answer." });
  return true;
}

// ---------- syntax colours: a small tokenizer (comments, strings, numbers, keywords), enough to read code by ----------

const KEYWORDS = new Set(
  (
    "abstract as async await break case catch class const continue def default defer del delete do elif else enum export extends false final finally fn for from func function go " +
    "if impl implements import in instanceof interface is lambda let loop match mod module mut new nil none null of package pass private protected pub public raise readonly " +
    "return select self static struct super switch this throw throws trait true try type typeof undefined unless use val var void where while with yield None True False " +
    "SELECT FROM WHERE INSERT INTO UPDATE DELETE CREATE TABLE ALTER ADD COLUMN INDEX ON AND OR NOT NULL JOIN LEFT GROUP BY ORDER LIMIT VALUES SET PRIMARY KEY DEFAULT INTEGER TEXT"
  ).split(" "),
);
type Lang = "c" | "hash" | "sql" | "css" | "plain";
const LANGS: Record<string, Lang> = {};
for (const e of "ts tsx js jsx mjs cjs java kt kts rs go c h cc cpp hpp cs swift php scala dart groovy gradle json jsonc zig".split(" ")) LANGS[e] = "c";
for (const e of "py rb sh bash zsh fish yml yaml toml ini conf cfg pl r ex exs nix tf hcl dockerfile makefile mk env properties gitignore".split(" ")) LANGS[e] = "hash";
LANGS.sql = "sql";
for (const e of "css scss less".split(" ")) LANGS[e] = "css";

export function langOf(path: string): Lang {
  const base = path.split("/").pop()!.toLowerCase();
  if (base === "dockerfile" || base === "makefile" || base.startsWith(".")) return LANGS[base.replace(/^\./, "")] ?? "hash";
  return LANGS[base.split(".").pop()!] ?? "plain";
}

const TOKEN: Record<Exclude<Lang, "plain">, RegExp> = {
  c: /(\/\/.*$)|(\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|`(?:\\.|[^`\\])*`?)|(\b(?:0x[\da-f]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)\b)|([A-Za-z_$][\w$]*)/gi,
  hash: /(#.*$)|()("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_][\w-]*)/gi,
  sql: /(--.*$)|(\/\*[\s\S]*?(?:\*\/|$))|('(?:''|[^'])*'?|"[^"]*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/gi,
  css: /()(\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)|(#[\da-f]{3,8}\b|-?\b\d+(?:\.\d+)?(?:px|em|rem|%|s|ms|vh|vw|dvh|fr|deg)?\b)|(@[\w-]+)/gi,
};

/** One line as HTML with its tokens coloured; `st.block` carries an open /* comment to the next line. */
export function highlight(line: string, lang: Lang, st: { block: boolean } = { block: false }): string {
  if (lang === "plain") return esc(line);
  let out = "";
  let rest = line;
  if (st.block) {
    const end = rest.indexOf("*/");
    if (end < 0) return `<span class="hc">${esc(rest)}</span>`;
    out += `<span class="hc">${esc(rest.slice(0, end + 2))}</span>`;
    rest = rest.slice(end + 2);
    st.block = false;
  }
  const re = new RegExp(TOKEN[lang].source, TOKEN[lang].flags);
  let last = 0;
  for (const m of rest.matchAll(re)) {
    const [all, com, block, str, num, word] = m;
    if (!all) continue;
    out += esc(rest.slice(last, m.index));
    last = m.index! + all.length;
    if (com) out += `<span class="hc">${esc(all)}</span>`;
    else if (block) {
      out += `<span class="hc">${esc(all)}</span>`;
      if (!all.endsWith("*/") || all.length < 4) st.block = true;
    } else if (str) out += `<span class="hs">${esc(all)}</span>`;
    else if (num) out += `<span class="hn">${esc(all)}</span>`;
    else if (word && (lang === "css" || KEYWORDS.has(lang === "sql" ? word.toUpperCase() : word))) out += `<span class="hk">${esc(all)}</span>`;
    else out += esc(all);
  }
  return out + esc(rest.slice(last));
}

// ---------- drawing ----------

const enc = encodeURIComponent;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const counts = (f: { add: number | null; del: number | null }) =>
  f.add === null && f.del === null ? '<span class="muted">binary</span>' : `<span class="cadd">+${f.add ?? 0}</span><span class="cdel">−${f.del ?? 0}</span>`;
const KIND: Record<string, [string, string]> = {
  new: ["N", "new, not added to git yet"],
  added: ["A", "added"],
  deleted: ["D", "deleted"],
  renamed: ["R", "renamed"],
  modified: ["M", "modified"],
};

interface DiffFile {
  path: string;
  old: string;
  meta: string[];
  lines: string[];
}

/** A unified diff, split per file. */
export function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  let inHunk = false;
  for (const l of diff.split("\n")) {
    if (l.startsWith("diff --git ")) {
      const m = l.match(/^diff --git a\/(.*) b\/(.*)$/);
      cur = { path: m?.[2] ?? l.slice(11), old: m?.[1] ?? "", meta: [], lines: [] };
      files.push(cur);
      inHunk = false;
    } else if (!cur) continue;
    else if (l.startsWith("@@")) {
      inHunk = true;
      cur.lines.push(l);
    } else if (!inHunk) {
      if (l.startsWith("+++ ") && l !== "+++ /dev/null") cur.path = l.slice(4).replace(/^b\//, "");
      else if (!l.startsWith("--- ") && !l.startsWith("+++ ") && !l.startsWith("index ")) cur.meta.push(l);
    } else cur.lines.push(l);
  }
  for (const f of files) while (f.lines.length && f.lines[f.lines.length - 1] === "") f.lines.pop();
  return files;
}

/** A stable element id for a file's diff, so the file list can jump to it. */
const fid = (path: string) => {
  let h = 0x811c9dc5;
  for (const c of path) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return `df${(h >>> 0).toString(36)}`;
};

const BIG = 800; // a file's diff longer than this starts folded

function drawDiff(diff: string, href: (path: string) => string): string {
  const files = parseDiff(diff);
  if (!files.length) return "";
  return files
    .map((f) => {
      const lang = langOf(f.path);
      const st = { block: false };
      let a = 0;
      let b = 0;
      const rows = f.lines
        .map((l) => {
          if (l.startsWith("@@")) {
            const m = l.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
            a = Number(m?.[1] ?? 0);
            b = Number(m?.[2] ?? 0);
            st.block = false;
            return `<tr class="dh"><td class="ln"></td><td class="ln"></td><td class="dc">${esc(l.replace(/^(@@[^@]*@@).*$/, "$1"))}<span class="muted">${esc(m?.[3] ?? "")}</span></td></tr>`;
          }
          const c = l[0];
          const body = highlight(l.slice(1), lang, st);
          if (c === "+") return `<tr class="da"><td class="ln"></td><td class="ln">${b++}</td><td class="dc"><span class="dm">+</span>${body}</td></tr>`;
          if (c === "-") return `<tr class="dd"><td class="ln">${a++}</td><td class="ln"></td><td class="dc"><span class="dm">−</span>${body}</td></tr>`;
          if (c === "\\") return `<tr class="dx"><td class="ln"></td><td class="ln"></td><td class="dc muted">${esc(l)}</td></tr>`;
          return `<tr><td class="ln">${a++}</td><td class="ln">${b++}</td><td class="dc"><span class="dm"> </span>${body}</td></tr>`;
        })
        .join("");
      const note = f.meta.filter((m) => /^(new|deleted) file|^rename from|^Binary/.test(m)).map((m) => m.replace(/ mode \d+$/, "").replace(/^Binary files .* differ$/, "binary file")).join(" · ");
      return `<details class="dfile" id="${fid(f.path)}"${f.lines.length > BIG ? "" : " open"}><summary><span class="aic">▸</span><a class="dpath" href="${href(f.path)}" data-code title="Open the whole file">${esc(f.path)}</a>${f.old && f.old !== f.path ? `<span class="muted small"> ← ${esc(f.old)}</span>` : ""}${note ? `<span class="muted small"> · ${esc(note)}</span>` : ""}</summary>${rows ? `<div class="dscroll"><table class="diff"><tbody>${rows}</tbody></table></div>` : `<div class="small muted dnone">${note ? "No text changes to show." : "Only its mode changed."}</div>`}</details>`;
    })
    .join("");
}

function fileList(files: FileStat[], anchors: boolean): string {
  return `<div class="cfiles">${files
    .map((f) => {
      const [k, title] = KIND[f.kind] ?? ["M", f.kind];
      return `<a class="cfile" href="#${fid(f.path)}"${anchors ? " data-jump" : ""}><span class="ck ck-${esc(f.kind)}" title="${esc(title)}">${k}</span><span class="cpath">${esc(f.path)}</span><span class="cnum">${counts(f)}</span></a>`;
    })
    .join("")}</div>`;
}

const crumbs = (base: string, dir: string) => {
  const parts = dir ? dir.split("/") : [];
  return `<nav class="crumbs"><a href="${base}&amp;code=files" data-code>${icon("folder", 13)}root</a>${parts.map((p, i) => `<span class="muted">/</span><a href="${base}&amp;code=files&amp;dir=${enc(parts.slice(0, i + 1).join("/"))}" data-code>${esc(p)}</a>`).join("")}</nav>`;
};

/** The code pane for agent `key` ("member/label"): tabs, then what was asked for. */
export function drawCode(key: string, tab: string, q: CodeQuery, d: CodeData): string {
  const base = `/dashboard?view=agents&amp;agent=${enc(key)}`;
  const n = d.files?.length;
  const tabs = [
    ["changes", `Changes${n ? ` <span class="badge">${n}</span>` : ""}`],
    ["commits", `Commits${d.ahead ? ` <span class="badge amber" title="Not pushed yet">${d.ahead}↑</span>` : ""}`],
    ["files", "Files"],
  ]
    .map(([t, label]) => `<a class="ctab${t === tab ? " on" : ""}" href="${base}&amp;code=${t}" data-code>${label}</a>`)
    .join("");
  const where = `<span class="crepo">${icon("folder", 13)}<b>${esc(d.name)}</b>${d.branch ? ` ${icon("branch", 12)} ${esc(d.branch)}` : d.head ? ` <span class="muted">detached at ${esc(d.head.slice(0, 7))}</span>` : ""}${d.upstream ? `<span class="muted" title="Compared with ${esc(d.upstream)}">${d.ahead ? ` · ${d.ahead} to push` : ""}${d.behind ? ` · ${d.behind} behind` : ""}${!d.ahead && !d.behind ? " · up to date" : ""}</span>` : d.head ? '<span class="muted"> · not pushed anywhere</span>' : ""}</span>`;
  const head = `<div class="codebar"><nav class="ctabs">${tabs}</nav><span class="grow"></span>${where}<button type="button" class="btn ghost xs icon" data-coderefresh title="Read it again">${icon("refresh", 13)}</button></div>`;
  return `${head}<div class="codebody">${body(key, base, tab, q, d)}</div>`;
}

/** The search box above Files: file names as you type, or text in the files. */
const searchBox = (q: string, mode: "files" | "text") =>
  `<form class="csearch" data-codesearch>${icon("search", 15)}<input type="search" name="q" value="${esc(q)}" placeholder="${mode === "text" ? "Search text in the files" : "Find a file by name"}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Search"><input type="hidden" name="in" value="${mode}"><nav class="seg" aria-label="What to search"><a href="#" data-in="files"${mode === "files" ? ' class="on"' : ""}>Names</a><a href="#" data-in="text"${mode === "text" ? ' class="on"' : ""}>Text</a></nav></form>`;

/** `text` with each of `words` marked (any case). */
function mark(text: string, words: string[], exact = false): string {
  const ws = words.filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!ws.length) return esc(text);
  const re = new RegExp(`(${ws.join("|")})`, exact ? "g" : "gi");
  return text
    .split(re)
    .map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part)))
    .join("");
}

/** A matching line, cut to start a little before the match, so a narrow screen still shows it. */
function around(text: string, q: string, exact: boolean): string {
  const t = text.trim();
  const i = exact ? t.indexOf(q) : t.toLowerCase().indexOf(q.toLowerCase());
  return i > 24 ? `…${t.slice(i - 16)}` : t;
}

function drawFind(base: string, f: NonNullable<CodeData["find"]>): string {
  if (!f.q) return "";
  const more = f.more ? `<div class="small muted ctrunc">Showing the first ${f.hits.length}; type more to narrow it down.</div>` : "";
  if (!f.hits.length) return `<div class="empty"><div>No ${f.mode === "text" ? "lines contain" : "file names match"} “${esc(f.q)}”.</div><div class="small">Files git ignores aren't searched.</div></div>`;
  if (f.mode === "files") {
    const words = f.q.split(/\s+/);
    return `<div class="flist">${f.hits.map((h) => `<a class="frow" href="${base}&amp;code=file&amp;path=${enc(h.path)}" data-code>${icon("file", 14)}<span>${mark(h.path, words)}</span></a>`).join("")}</div>${more}`;
  }
  // Text: grouped by file, each line opening the file there.
  const groups = new Map<string, { line?: number; text?: string }[]>();
  for (const h of f.hits) groups.set(h.path, [...(groups.get(h.path) ?? []), h]);
  const exact = f.q !== f.q.toLowerCase();
  return `<div class="small muted">${plural(f.hits.length, "line")}${f.more ? " (and more)" : ""} in ${plural(groups.size, "file")}</div>${[...groups]
    .map(
      ([path, hits]) =>
        `<div class="cfiles sgroup"><a class="sfile" href="${base}&amp;code=file&amp;path=${enc(path)}" data-code>${icon("file", 13)}<span>${esc(path)}</span><span class="badge">${hits.length}</span></a>${hits
          .map((h) => `<a class="sline" href="${base}&amp;code=file&amp;path=${enc(path)}#L${h.line}" data-code><span class="ln">${h.line}</span><span class="stext">${mark(around(h.text ?? "", f.q, exact), [f.q], exact)}</span></a>`)
          .join("")}</div>`,
    )
    .join("")}${more}`;
}

function body(key: string, base: string, tab: string, q: CodeQuery, d: CodeData): string {
  if (q.op === "file" && d.file) {
    const f = d.file;
    const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
    const top = `<div class="chead">${crumbs(base, dir)}<span class="muted">/</span><b class="mono">${esc(f.path.split("/").pop()!)}</b><span class="grow"></span>${f.rev === "worktree" ? '<span class="badge" title="As it is on disk now, with uncommitted changes">working tree</span>' : `<a class="badge" href="${base}&amp;code=commit&amp;sha=${enc(f.rev)}" data-code title="As of this commit">${esc(f.rev.slice(0, 7))}</a> <a class="btn ghost xs" href="${base}&amp;code=file&amp;path=${enc(f.path)}" data-code>Now</a>`}</div>`;
    if (f.binary) return `${top}<div class="empty">${icon("file", 26)}<div>A binary file (${Math.round((f.size ?? 0) / 1024)} KB).</div></div>`;
    if (f.tooBig) return `${top}<div class="empty">${icon("file", 26)}<div>Too large to show (${(f.tooBig / 1024 / 1024).toFixed(1)} MB; up to 1 MB is shown).</div></div>`;
    const lang = langOf(f.path);
    const st = { block: false };
    const lines = (f.text ?? "").replace(/\n$/, "").split("\n");
    return `${top}<div class="dscroll fview"><table class="diff code"><tbody>${lines.map((l, i) => `<tr id="L${i + 1}"><td class="ln"><a href="#L${i + 1}" data-jump>${i + 1}</a></td><td class="dc">${highlight(l, lang, st)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  if (q.op === "find" && d.find) return `${searchBox(d.find.q, d.find.mode)}<div id="sresults">${drawFind(base, d.find)}</div>`;
  if (q.op === "list" && d.list) {
    const l = d.list;
    const rows = [
      ...l.dirs.map((x) => `<a class="frow" href="${base}&amp;code=files&amp;dir=${enc(l.dir ? `${l.dir}/${x}` : x)}" data-code>${icon("folder", 14)}<span>${esc(x)}</span></a>`),
      ...l.files.map((x) => `<a class="frow" href="${base}&amp;code=file&amp;path=${enc(l.dir ? `${l.dir}/${x}` : x)}" data-code>${icon("file", 14)}<span>${esc(x)}</span></a>`),
    ].join("");
    return `${searchBox("", "files")}<div id="sresults"><div class="chead">${crumbs(base, l.dir)}</div>${rows ? `<div class="flist">${rows}</div>` : '<div class="empty"><div>Nothing here.</div></div>'}</div>`;
  }
  if (q.op === "commit" && d.commit) {
    const c = d.commit;
    const [subject, ...more] = c.message.split("\n");
    const unpushed = d.log.find((x) => x.sha === c.sha)?.unpushed;
    return `<div class="chead"><a class="btn ghost xs" href="${base}&amp;code=commits" data-code>${icon("back", 13)}Commits</a></div>
      <div class="cmeta"><h3>${esc(subject ?? "")}</h3>${more.join("\n").trim() ? `<pre class="cmsg">${esc(more.join("\n").trim())}</pre>` : ""}<div class="small muted"><span class="mono">${esc(c.short)}</span> · ${esc(c.author)} · ${ago(c.at)}${unpushed ? ' · <span class="badge amber">not pushed</span>' : ""}${c.parents.length > 1 ? " · a merge (its changes against the first parent)" : ""}</div></div>
      ${c.files.length ? fileList(c.files, true) : ""}${c.truncated ? '<div class="small muted ctrunc">Long diff: only the first 512 KB is shown.</div>' : ""}${drawDiff(c.diff, (p) => `${base}&amp;code=file&amp;path=${enc(p)}&amp;rev=${enc(c.sha)}`) || '<div class="empty"><div>No changes in this commit.</div></div>'}`;
  }
  if (tab === "commits") {
    if (!d.log.length) return '<div class="empty"><div>No commits yet.</div></div>';
    return `<div class="clog">${d.log
      .map(
        (c) =>
          `<a class="crow" href="${base}&amp;code=commit&amp;sha=${enc(c.sha)}" data-code><span class="mono csha">${esc(c.short)}</span><span class="csub">${esc(c.subject ?? "")}</span>${c.unpushed && d.upstream ? '<span class="badge amber" title="Not pushed yet">local</span>' : ""}<span class="muted small cwho">${esc(c.author)} · ${ago(c.at)}</span></a>`,
      )
      .join("")}</div>`;
  }
  // Changes
  const files = d.files ?? [];
  if (!files.length) return `<div class="empty">${icon("check", 26)}<div>No uncommitted changes.</div>${d.log[0] ? `<div class="small">Last commit: <a href="${base}&amp;code=commit&amp;sha=${enc(d.log[0].sha)}" data-code>${esc(d.log[0].subject ?? d.log[0].short)}</a>, ${ago(d.log[0].at)}</div>` : ""}</div>`;
  const add = files.reduce((s, f) => s + (f.add ?? 0), 0);
  const del = files.reduce((s, f) => s + (f.del ?? 0), 0);
  return `<div class="chead small"><b>${plural(files.length, "file")} changed</b><span class="cnum"><span class="cadd">+${add}</span><span class="cdel">−${del}</span></span><span class="muted">· not committed</span></div>${fileList(files, true)}${d.truncated ? '<div class="small muted ctrunc">Long diff: only the first 512 KB is shown.</div>' : ""}${drawDiff(d.diff ?? "", (p) => `${base}&amp;code=file&amp;path=${enc(p)}`)}`;
}
