// The code view: what the dashboard shows of a session's repo (its uncommitted changes, recent commits, files),
// read on this machine when its owner opens it, and never stored on the hub. Read-only: only git with fixed
// arguments (no shell), commits by hash, and files git tracks or would add (nothing it ignores, such as .env).

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DIFF_MAX = 512 * 1024; // a diff or commit beyond this is cut (the dashboard says so)
const FILE_MAX = 1024 * 1024;
const UNTRACKED_MAX = 40; // new files shown in full in the diff
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"; // a repo with no commits yet diffs against this

const git = (root, args, { ok = [0], max = 8 * 1024 * 1024 } = {}) =>
  new Promise((resolve, reject) => {
    execFile("git", ["-C", root, "-c", "core.quotepath=off", ...args], { encoding: "utf8", maxBuffer: max, timeout: 15_000 }, (err, stdout) => {
      const code = err ? (typeof err.code === "number" ? err.code : -1) : 0;
      if (ok.includes(code)) resolve(stdout);
      else if (err?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") resolve(stdout ?? "");
      else reject(new Error((err?.message ?? "git failed").split("\n")[0]));
    });
  });

const cap = (s, n) => (s.length > n ? { text: s.slice(0, s.lastIndexOf("\n", n) + 1 || n), truncated: true } : { text: s, truncated: false });
const isHash = (s) => typeof s === "string" && /^[0-9a-f]{7,40}$/.test(s);

/** A path inside the repo, relative and normalized; null for anything that could leave it. */
function cleanPath(p) {
  if (typeof p !== "string" || !p || p.length > 1024 || /[\0\n]/.test(p) || path.isAbsolute(p)) return null;
  const n = path.posix.normalize(p.replace(/\\/g, "/")).replace(/\/+$/, "");
  return n === "." ? "" : n.startsWith("../") || n === ".." ? null : n;
}

async function head(root) {
  try {
    return (await git(root, ["rev-parse", "--verify", "-q", "HEAD"])).trim();
  } catch {
    return null;
  }
}

/** The repo around `dir`, or null when it isn't one. */
export async function repoRoot(dir) {
  try {
    return (await git(dir, ["rev-parse", "--show-toplevel"])).trim() || null;
  } catch {
    return null;
  }
}

const LOG_FORMAT = "%H%x1f%h%x1f%an%x1f%at%x1f%s%x1e";
const parseLog = (out) =>
  out
    .split("\x1e")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, short, author, at, subject] = r.split("\x1f");
      return { sha, short, author, at: Number(at) * 1000, subject };
    });

/** Branch, upstream and the last commits (marked when not pushed yet). */
async function overview(root, base) {
  const branch = (await git(root, ["branch", "--show-current"]).catch(() => "")).trim();
  const upstream = (await git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).catch(() => "")).trim();
  let ahead = 0, behind = 0, unpushed = new Set();
  if (upstream && base) {
    const [b, a] = (await git(root, ["rev-list", "--left-right", "--count", "@{u}...HEAD"]).catch(() => "0 0")).trim().split(/\s+/).map(Number);
    [ahead, behind] = [a || 0, b || 0];
    if (ahead) unpushed = new Set((await git(root, ["rev-list", "-n", "200", "@{u}..HEAD"]).catch(() => "")).split("\n").filter(Boolean));
  }
  const log = base ? parseLog(await git(root, ["log", "-n", "30", `--format=${LOG_FORMAT}`]).catch(() => "")).map((c) => ({ ...c, unpushed: upstream ? unpushed.has(c.sha) : true })) : [];
  return { root, name: path.basename(root), branch, head: base, upstream, ahead, behind, log };
}

/** Uncommitted work: each changed file with its line counts, and the diff (new files included). */
async function changes(root) {
  const base = await head(root);
  const against = base ?? EMPTY_TREE;
  const [numstat, status, diff, others] = await Promise.all([
    git(root, ["diff", against, "--numstat", "-M", "--no-ext-diff"]),
    git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    git(root, ["diff", against, "--no-color", "--no-ext-diff", "-M"], { max: DIFF_MAX * 4 }),
    git(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const files = [];
  const counts = new Map();
  for (const l of numstat.split("\n").filter(Boolean)) {
    const [a, d, ...p] = l.split("\t");
    // A rename reads "old => new" (or "dir/{old => new}"); keep the new name.
    const name = p.join("\t").replace(/\{[^}]* => ([^}]*)\}/, "$1").replace(/^.* => /, "").replace(/\/\//g, "/");
    counts.set(name, { add: a === "-" ? null : Number(a), del: d === "-" ? null : Number(d) });
  }
  const parts = status.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e) continue;
    const xy = e.slice(0, 2), name = e.slice(3);
    if (/[RC]/.test(xy)) i++; // the old name follows a rename
    if (xy === "!!") continue;
    const kind = xy === "??" ? "new" : /D/.test(xy) ? "deleted" : /A/.test(xy) ? "added" : /R/.test(xy) ? "renamed" : "modified";
    files.push({ path: name, kind, ...(counts.get(name) ?? { add: null, del: null }) });
  }
  // New files aren't in `git diff`: show each (text, not too large) as an addition.
  let extra = "";
  const fresh = others.split("\0").filter(Boolean);
  for (const f of fresh.slice(0, UNTRACKED_MAX)) {
    const full = path.join(root, f);
    let st;
    try {
      st = fs.lstatSync(full);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > 256 * 1024) continue;
    const body = fs.readFileSync(full);
    if (body.includes(0)) continue;
    const lines = body.toString("utf8").split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    const row = files.find((x) => x.path === f);
    if (row) Object.assign(row, { add: lines.length, del: 0 });
    extra += `diff --git a/${f} b/${f}\nnew file mode 100644\n--- /dev/null\n+++ b/${f}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}\n`;
  }
  const d = cap(diff + extra, DIFF_MAX);
  return { ...(await overview(root, base)), files, diff: d.text, truncated: d.truncated };
}

/** One commit: who, when, its message, its files and its diff. */
async function commit(root, sha) {
  if (!isHash(sha)) throw new Error("That isn't a commit hash.");
  const meta = await git(root, ["show", "-s", "--format=%H%x1f%h%x1f%an%x1f%at%x1f%P%x1f%B", sha]);
  const [full, short, author, at, parents, ...body] = meta.split("\x1f");
  const [numstat, names] = await Promise.all([git(root, ["show", "--numstat", "--format=", "-M", "--first-parent", sha]), git(root, ["show", "--name-status", "--format=", "-M", "--first-parent", sha])]);
  const kinds = new Map(
    names
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [st, ...p] = l.split("\t");
        return [p[p.length - 1], { A: "added", D: "deleted", R: "renamed", C: "added" }[st[0]] ?? "modified"];
      }),
  );
  const files = numstat
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [a, d, ...p] = l.split("\t");
      const name = p.join("\t").replace(/\{[^}]* => ([^}]*)\}/, "$1").replace(/^.* => /, "").replace(/\/\//g, "/");
      return { path: name, kind: kinds.get(name) ?? "modified", add: a === "-" ? null : Number(a), del: d === "-" ? null : Number(d) };
    });
  const d = cap(await git(root, ["show", "--format=", "--no-color", "--no-ext-diff", "-M", "--first-parent", sha], { max: DIFF_MAX * 4 }), DIFF_MAX);
  return { sha: full, short, author, at: Number(at) * 1000, parents: parents.split(" ").filter(Boolean), message: body.join("\x1f").trim(), files, diff: d.text, truncated: d.truncated };
}

/** The entries of a folder (what git tracks or would add), folders first. */
async function list(root, dir) {
  const d = dir ? cleanPath(dir) : "";
  if (d === null) throw new Error("That folder isn't in the repo.");
  const out = await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", d ? `${d}/` : "."]);
  const dirs = new Set(), files = new Set();
  for (const p of out.split("\0").filter(Boolean)) {
    const rest = d ? p.slice(d.length + 1) : p;
    const i = rest.indexOf("/");
    if (i >= 0) dirs.add(rest.slice(0, i));
    else files.add(rest);
  }
  const sort = (s) => [...s].sort((a, b) => a.localeCompare(b));
  return { dir: d, dirs: sort(dirs), files: sort(files) };
}

/** A file as it is now (in the working tree) or at a commit. Only text, only what git tracks or would add. */
async function file(root, p, rev) {
  const f = cleanPath(p);
  if (!f) throw new Error("That file isn't in the repo.");
  let body;
  if (rev && rev !== "worktree") {
    if (!isHash(rev)) throw new Error("That isn't a commit hash.");
    body = Buffer.from(await git(root, ["show", `${rev}:${f}`], { max: FILE_MAX * 2 }), "utf8");
  } else {
    const known = await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", f]);
    if (!known.split("\0").includes(f)) throw new Error(`${f} isn't a file git tracks here (ignored files, such as secrets, aren't shown).`);
    const full = path.join(root, f);
    let real;
    try {
      real = fs.realpathSync(full);
    } catch {
      throw new Error(`${f} doesn't exist (any more).`);
    }
    if (real !== fs.realpathSync(root) && !real.startsWith(fs.realpathSync(root) + path.sep)) throw new Error(`${f} points outside the repo.`);
    const st = fs.statSync(real);
    if (!st.isFile()) throw new Error(`${f} isn't a file.`);
    if (st.size > FILE_MAX) return { path: f, rev: "worktree", tooBig: st.size };
    body = fs.readFileSync(real);
  }
  if (body.length > FILE_MAX) return { path: f, rev: rev || "worktree", tooBig: body.length };
  if (body.includes(0)) return { path: f, rev: rev || "worktree", binary: true, size: body.length };
  return { path: f, rev: rev || "worktree", text: body.toString("utf8") };
}

const FIND_MAX = 100; // file names shown
const GREP_MAX = 200; // matching lines shown

/** Files whose path holds every word of `q` (any case), names that match first; or lines that contain `q`. */
async function find(root, q, mode) {
  const text = typeof q === "string" ? q.trim().slice(0, 200) : "";
  if (!text) return { q: "", mode, hits: [], more: false };
  if (mode === "text") {
    // Fixed text, not a pattern; case matters only when it has capitals (like an editor's smart case).
    const args = ["grep", "--untracked", "-n", "-I", "-F", "--no-color", "--full-name", ...(text === text.toLowerCase() ? ["-i"] : []), "-e", text, "--", "."];
    const out = await git(root, args, { ok: [0, 1], max: 4 * 1024 * 1024 });
    const lines = out.split("\n").filter(Boolean);
    const hits = lines.slice(0, GREP_MAX).map((l) => {
      const m = l.match(/^(.*?):(\d+):(.*)$/);
      return m ? { path: m[1], line: Number(m[2]), text: m[3].slice(0, 400) } : null;
    });
    return { q: text, mode, hits: hits.filter(Boolean), more: lines.length > GREP_MAX };
  }
  const words = text.toLowerCase().split(/\s+/);
  const all = (await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean);
  const name = (p) => p.slice(p.lastIndexOf("/") + 1).toLowerCase();
  const found = [...new Set(all)]
    .filter((p) => words.every((w) => p.toLowerCase().includes(w)))
    .map((p) => ({ p, score: (words.some((w) => name(p).includes(w)) ? 0 : 1000) + (name(p).startsWith(words[words.length - 1]) ? 0 : 500) + p.length }))
    .sort((a, b) => a.score - b.score);
  return { q: text, mode, hits: found.slice(0, FIND_MAX).map((f) => ({ path: f.p })), more: found.length > FIND_MAX };
}

/** Answer one request from the dashboard: { op: "changes" | "commit" | "list" | "file" | "find", ... }. */
export async function codeRequest(dir, q) {
  const root = await repoRoot(dir);
  if (!root) throw new Error(`${dir} isn't a git repository.`);
  switch (q?.op) {
    case "changes":
      return await changes(root);
    case "commit":
      return { ...(await overview(root, await head(root))), commit: await commit(root, q.sha) };
    case "list":
      return { ...(await overview(root, await head(root))), list: await list(root, q.dir) };
    case "file":
      return { ...(await overview(root, await head(root))), file: await file(root, q.path, q.rev) };
    case "find":
      return { ...(await overview(root, await head(root))), find: await find(root, q.q, q.mode === "text" ? "text" : "files") };
    default:
      throw new Error("Unknown request.");
  }
}
