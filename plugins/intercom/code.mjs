// The code view: what the dashboard shows of a session's repo (its uncommitted changes, recent commits, files),
// read on this machine when its owner opens it, and never stored on the hub. Read-only: only git with fixed
// arguments (no shell), commits by hash, and files git tracks or would add (nothing it ignores, such as .env).

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIFF_MAX = 512 * 1024; // a diff or commit beyond this is cut (the dashboard says so)
const FILE_MAX = 1024 * 1024;
const UNTRACKED_MAX = 40; // new files shown in full in the diff
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"; // a repo with no commits yet diffs against this

// A repo can carry settings that make git run commands (an embedded bare repo's core.fsmonitor, textconv or diff
// drivers): none of that runs when the code view reads it.
const SAFE = ["-c", "safe.bareRepository=explicit", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "-c", "diff.external=", "-c", "core.quotepath=off"];
const git = (root, args, { ok = [0], max = 8 * 1024 * 1024 } = {}) =>
  new Promise((resolve, reject) => {
    execFile("git", ["-C", root, ...SAFE, ...args], { encoding: "utf8", maxBuffer: max, timeout: 15_000 }, (err, stdout) => {
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
    git(root, ["diff", against, "--no-color", "--no-ext-diff", "--no-textconv", "-M"], { max: DIFF_MAX * 4 }),
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
  const d = cap(await git(root, ["show", "--format=", "--no-color", "--no-ext-diff", "--no-textconv", "-M", "--first-parent", sha], { max: DIFF_MAX * 4 }), DIFF_MAX);
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
    body = Buffer.from(await git(root, ["show", "--no-textconv", `${rev}:${f}`], { max: FILE_MAX * 2 }), "utf8");
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

const WORKTREES_MAX = 20;
const shown = (p) => (p === os.homedir() || p.startsWith(os.homedir() + path.sep) ? `~${p.slice(os.homedir().length)}` : p);

/** The worktrees of the repos around `roots`: folder, branch, and how many files have uncommitted changes. */
async function worktrees(roots) {
  const seen = new Map();
  for (const r of roots.filter(Boolean)) {
    const out = await git(r, ["worktree", "list", "--porcelain"]).catch(() => "");
    for (const block of out.split("\n\n")) {
      const p = block.match(/^worktree (.+)$/m)?.[1];
      if (!p || seen.has(p) || /^(bare|prunable)/m.test(block) || !fs.existsSync(p)) continue;
      seen.set(p, { path: p, label: shown(p), branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? "", head: block.match(/^HEAD ([0-9a-f]+)$/m)?.[1]?.slice(0, 7) ?? "" });
    }
  }
  const list = [...seen.values()].slice(0, WORKTREES_MAX);
  await Promise.all(
    list.map(async (w) => {
      w.changed = (await git(w.path, ["status", "--porcelain=v1", "--untracked-files=normal"]).catch(() => "")).split("\n").filter(Boolean).length;
    }),
  );
  return list;
}

/**
 * Answer one request from the dashboard: { op: "changes" | "commit" | "list" | "file" | "find", wt?, ... }. It reads the
 * repo the agent works in now (`agentDir`, from its transcript), else the one it started in; `wt` picks another
 * worktree of those repos, and only one of them.
 */
export async function codeRequest(dir, q, { agentDir, editOn = true } = {}) {
  if ((q?.op === "save" || q?.op === "gitcommit") && !editOn) throw new Error("Editing from the dashboard is turned off on that machine (INTERCOM_EDIT=0).");
  const start = await repoRoot(dir);
  let current = agentDir && fs.existsSync(agentDir) ? await repoRoot(agentDir) : null;
  // The agent's folder counts only as a worktree of the repo the session started in (when it started in one).
  const trees = await worktrees(start ? [start] : [current]);
  if (current && !trees.some((t) => t.path === current)) current = null;
  let root = current ?? start;
  if (q?.wt) {
    root = trees.find((t) => t.path === q.wt)?.path;
    if (!root) throw new Error("That folder isn't one of this agent's worktrees (any more).");
  }
  if (!root) throw new Error(`${dir} isn't a git repository.`);
  const where = { worktrees: trees.map((t) => ({ ...t, agent: t.path === current, start: t.path === start })), here: root, hereLabel: shown(root) };
  return { ...(await answer(root, q)), ...where };
}

// ---- editing from the dashboard: a file written, chosen files committed (and pushed), for the session's owner ----

const NEVER = /(^|\/)(\.git(\/|$)|\.env(\.|$)|\.npmrc$|\.netrc$|\.pgpass$|id_[a-z0-9]+$)|\.(pem|key|p12|pfx)$/i;
async function save(root, p, text) {
  const f = cleanPath(p);
  if (!f) throw new Error("That isn't a path in the repo.");
  if (NEVER.test(f)) throw new Error(`${f} is a file that isn't written from the dashboard (git's own files, secrets, keys).`);
  if (typeof text !== "string" || text.length > FILE_MAX) throw new Error("The text is too long (up to 1 MB).");
  const full = path.join(root, f);
  const realRoot = fs.realpathSync(root);
  // The folder it goes in must be inside the repo (created if it isn't there yet); the file itself, if it exists, too.
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const dir = fs.realpathSync(path.dirname(full));
  if (dir !== realRoot && !dir.startsWith(realRoot + path.sep)) throw new Error(`${f} is outside the repo.`);
  if (fs.existsSync(full) && fs.lstatSync(full).isSymbolicLink()) throw new Error(`${f} is a symlink; edit what it points to.`);
  fs.writeFileSync(full, text);
  return { saved: f };
}
async function commitPaths(root, paths, message, push) {
  const files = (Array.isArray(paths) ? paths : []).map(cleanPath).filter((f) => f && !NEVER.test(f));
  if (!files.length) throw new Error("Nothing to commit.");
  const msg = String(message ?? "").trim();
  if (!msg) throw new Error("Write a commit message.");
  await git(root, ["add", "--", ...files]);
  await git(root, ["commit", "-q", "-m", msg, "--", ...files]);
  const sha = (await git(root, ["rev-parse", "--short", "HEAD"])).trim();
  let pushed = "";
  if (push) {
    try {
      const up = await git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { ok: [0, 128] });
      await new Promise((resolve, reject) =>
        execFile("git", ["-C", root, "push", ...(up.trim() ? [] : ["-u", "origin", "HEAD"])], { encoding: "utf8", timeout: 60_000 }, (err, _o, e) => (err ? reject(new Error(((l) => l.find((x) => /^(fatal|error):/.test(x)) ?? l.pop())(String(e || err.message).trim().split("\n")).replace(/^(fatal|error):\s*/, ""))) : resolve())),
      );
      pushed = "pushed";
    } catch (e) {
      pushed = `not pushed: ${e.message}`.slice(0, 300);
    }
  }
  return { committed: { sha, files: files.length, pushed } };
}

async function answer(root, q) {
  switch (q?.op) {
    case "save":
      return { ...(await save(root, q.path, q.text)), ...(await overview(root, await head(root))) };
    case "gitcommit":
      return { ...(await commitPaths(root, q.paths, q.message, !!q.push)), ...(await overview(root, await head(root))) };
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

// ---- the screen: what this session's tmux pane shows, and keys sent to it, for its owner only ----
// The hub asks only for the person the session belongs to (their dashboard or their Claude.ai connector); never for a
// teammate or another agent. INTERCOM_SCREEN=0 in the config turns it off on this machine, INTERCOM_KEYS=0 just the keys.

const tmux = (args) =>
  new Promise((resolve) => {
    execFile("tmux", args, { encoding: "utf8", timeout: 4000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) =>
      resolve(err ? { err: String(stderr || err.message).trim().split("\n")[0] } : { out: stdout }),
    );
  });
const ps = (pid) =>
  new Promise((resolve) => execFile("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8", timeout: 2000 }, (err, out) => resolve(err ? 0 : Number(out.trim()) || 0)));

/** Keys that can be sent by name: the ones a stuck agent needs (answer a dialog, interrupt, scroll a list). */
export const SCREEN_KEYS = {
  enter: "Enter",
  esc: "Escape",
  "ctrl-c": "C-c",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  tab: "Tab",
  "shift-tab": "BTab",
  space: "Space",
  backspace: "BSpace",
  y: "y",
  n: "n",
  "ctrl-x": "C-x", // Claude Code: Ctrl+X Ctrl+S sends what's typed now (barge in), Ctrl+X Ctrl+K stops its subagents
  "ctrl-s": "C-s",
  "ctrl-k": "C-k",
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => [String(d), String(d)])),
};

/** The tmux pane this process runs in: $TMUX_PANE, or (when the agent didn't pass it on, as Codex may not) the pane whose process is one of our ancestors. */
export async function findPane(env = process.env, ppid = process.ppid) {
  if (env.TMUX_PANE && /^%\d+$/.test(env.TMUX_PANE)) return env.TMUX_PANE;
  const r = await tmux(["list-panes", "-a", "-F", "#{pane_id} #{pane_pid}"]);
  if (r.err) return null;
  const panes = new Map(
    r.out
      .trim()
      .split("\n")
      .map((l) => l.split(" "))
      .filter(([id, pid]) => /^%\d+$/.test(id) && pid)
      .map(([id, pid]) => [Number(pid), id]),
  );
  for (let pid = ppid, i = 0; pid > 1 && i < 25; i++, pid = await ps(pid)) if (panes.has(pid)) return panes.get(pid);
  return null;
}

/**
 * capture: the pane as it looks now (colours as ANSI), and `history` lines above it. keys: send named keys and/or a
 * line of text (typed literally, then Enter if asked), then capture what it looks like after.
 */
// Terminals on this machine (unless INTERCOM_TERMINALS=0): its tmux sessions listed, a new one started (a shell,
// Claude Code or Codex, in a folder), or one closed. Seeing and typing into one goes through the pane ops below.
const TERM_RUN = { shell: null, claude: "claude", codex: "codex" };
async function terminalOp(q) {
  if (q.op === "tmux") {
    const r = await tmux(["list-panes", "-a", "-F", "#{session_name}\t#{window_index}\t#{pane_id}\t#{pane_current_command}\t#{pane_current_path}\t#{session_attached}\t#{pane_width}x#{pane_height}\t#{session_created}\t#{pane_active}\t#{window_active}"]);
    if (r.err && /no server running|error connecting/i.test(r.err)) return [];
    if (r.err) throw new Error(`tmux: ${r.err}`);
    return r.out.trim().split("\n").filter(Boolean).slice(0, 200).map((l) => {
      const [session, win, pane, cmd, cwd, attached, size, created, active, winActive] = l.split("\t");
      return { session, window: Number(win), pane, cmd, cwd: cwd.replace(os.homedir(), "~"), attached: attached !== "0", size, created: Number(created) * 1000, active: active === "1" && winActive === "1" };
    });
  }
  if (q.op === "tmux-new") {
    const name = String(q.name ?? "").trim();
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) throw new Error("A name of letters, digits, - and _ (up to 32).");
    const run = String(q.run ?? "shell");
    if (!(run in TERM_RUN)) throw new Error("Start a shell, claude or codex.");
    const dir = path.resolve(String(q.cwd || "~").replace(/^~(?=$|\/)/, os.homedir()));
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`${dir} isn't a folder on this machine.`);
    const args = ["new-session", "-d", "-P", "-F", "#{pane_id}", "-s", name, "-c", dir, "-x", "160", "-y", "45"];
    // An agent takes the terminal's name as its intercom name, and starts on the first message, if one was given.
    if (TERM_RUN[run]) {
      const prompt = typeof q.prompt === "string" ? q.prompt.trim().slice(0, 4000) : "";
      args.push("-e", `INTERCOM_NAME=${name}`, TERM_RUN[run], ...(prompt ? [prompt] : []));
    }
    const r = await tmux(args);
    if (r.err) throw new Error(`tmux: ${r.err}`);
    return { pane: r.out.trim() };
  }
  if (q.op === "tmux-kill") {
    const name = String(q.name ?? "");
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(name)) throw new Error("Not a tmux session name.");
    const r = await tmux(["kill-session", "-t", `=${name}`]);
    if (r.err) throw new Error(`tmux: ${r.err}`);
    return { closed: name };
  }
  return null;
}

export async function screenRequest(q, { pane, keysOn = true, termsOn = false } = {}) {
  if (q.op === "tmux" || q.op === "tmux-new" || q.op === "tmux-kill") {
    if (!termsOn) throw new Error("Terminals are turned off on that machine (INTERCOM_TERMINALS=0, or seeing screens or sending keys is off there).");
    if (q.op !== "tmux" && !keysOn) throw new Error("Sending keys is turned off on that machine (INTERCOM_KEYS=0), so terminals can't be started or closed from here.");
    const r = await terminalOp(q);
    return { text: "", cols: 0, rows: 0, cursor: null, keys: keysOn, terms: Array.isArray(r) ? r : undefined, made: r && !Array.isArray(r) ? r : undefined };
  }
  // Another agent's pane on this machine (one whose own intercom can't take keys, or that exited): its owner asks
  // through this one. Only a pane id; tmux refuses anything that isn't a pane of this machine's tmux.
  if (q.pane !== undefined) {
    if (typeof q.pane !== "string" || !/^%\d+$/.test(q.pane)) throw new Error("Not a tmux pane.");
    pane = q.pane;
  }
  if (q.op === "panes") return { text: "", cols: 0, rows: 0, cursor: null, keys: keysOn, panes: await agentPanes() };
  if (!pane) throw new Error("This session isn't running in tmux, so its screen can't be seen from here.");
  if (q.fit !== undefined) {
    if (!keysOn) throw new Error("Resizing its terminal is turned off on that machine with sending keys (INTERCOM_KEYS=0).");
    await fitPane(pane, String(q.fit));
  }
  if (q.op === "keys") {
    if (!keysOn) throw new Error("Sending keys is turned off on that machine (INTERCOM_KEYS=0 in its intercom config).");
    const keys = Array.isArray(q.keys) ? q.keys.slice(0, 20) : [];
    const after = Array.isArray(q.after) ? q.after.slice(0, 10) : []; // keys pressed after the text (e.g. send it now)
    for (const k of [...keys, ...after]) if (!SCREEN_KEYS[k]) throw new Error(`Unknown key "${k}". Keys: ${Object.keys(SCREEN_KEYS).join(", ")}.`);
    const text = typeof q.text === "string" ? q.text : "";
    if (text.length > 1000) throw new Error("The text is over 1000 characters.");
    if (/[\r\n]/.test(text)) throw new Error("Send one line at a time.");
    for (const k of keys) {
      const r = await tmux(["send-keys", "-t", pane, SCREEN_KEYS[k]]);
      if (r.err) throw new Error(`tmux: ${r.err}`);
    }
    if (text) {
      const r = await tmux(["send-keys", "-t", pane, "-l", "--", text]);
      if (r.err) throw new Error(`tmux: ${r.err}`);
    }
    if (q.enter) await tmux(["send-keys", "-t", pane, "Enter"]);
    for (const k of after) {
      await new Promise((r) => setTimeout(r, 80)); // a chord's keys one after another, as typed
      const r = await tmux(["send-keys", "-t", pane, SCREEN_KEYS[k]]);
      if (r.err) throw new Error(`tmux: ${r.err}`);
    }
    await new Promise((r) => setTimeout(r, 600)); // let it redraw
  }
  const history = Math.max(0, Math.min(500, Number(q.history) || 0));
  const cap = await tmux(["capture-pane", "-p", "-e", "-t", pane, ...(history ? ["-S", `-${history}`] : [])]);
  if (cap.err) throw new Error(`tmux: ${cap.err}`);
  const info = await tmux(["display-message", "-p", "-t", pane, "#{pane_width} #{pane_height} #{cursor_x} #{cursor_y}"]);
  const [cols, rows, cx, cy] = (info.out ?? "").trim().split(" ").map(Number);
  return { text: cap.out.replace(/\n+$/, "\n"), cols: cols || 0, rows: rows || 0, cursor: Number.isFinite(cx) ? [cx, cy + history] : null, keys: keysOn };
}

// "Fit to this screen": the agent's tmux window takes the size of the screen it's watched on (a phone), so it redraws
// to fit there instead of being read sideways. Only its own window; it goes back to following its terminal when the
// watcher says "off" (the window closed) or a minute after the last look.
const fitted = new Map(); // pane → timer
const unfit = async (pane) => {
  await tmux(["resize-window", "-A", "-t", pane]);
  await tmux(["set-option", "-w", "-t", pane, "-u", "window-size"]);
};
async function fitPane(pane, fit) {
  clearTimeout(fitted.get(pane));
  if (fit === "off") {
    fitted.delete(pane);
    if ((await tmux(["show-options", "-w", "-v", "-t", pane, "window-size"])).out?.trim() === "manual") await unfit(pane);
    return;
  }
  const m = /^(\d{2,3})x(\d{1,3})$/.exec(fit);
  if (!m) throw new Error("fit is COLSxROWS or off.");
  const cols = Math.max(40, Math.min(300, Number(m[1]))), rows = Math.max(10, Math.min(120, Number(m[2])));
  const now = (await tmux(["display-message", "-p", "-t", pane, "#{window_width}x#{window_height}"])).out?.trim();
  if (now !== `${cols}x${rows}`) {
    const r = await tmux(["resize-window", "-t", pane, "-x", String(cols), "-y", String(rows)]);
    if (r.err) throw new Error(`tmux: ${r.err}`);
    await new Promise((r) => setTimeout(r, 400)); // let it redraw at the new size
  }
  fitted.set(pane, setTimeout(() => { fitted.delete(pane); unfit(pane); }, 60_000));
}

// ---- the agents on this machine: which tmux pane each runs in and how it was started ----
// For keeping them up to date and restarting one that exited, from another agent on the same machine (an agent whose
// own intercom is too old to take keys, or that's gone). Found through the intercom servers running here: each is a
// child of its agent and carries its session in its environment.

const sh = (cmd, args) =>
  new Promise((resolve) => execFile(cmd, args, { encoding: "utf8", timeout: 4000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => resolve(err ? "" : out)));

async function envOf(pid) {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(`/proc/${pid}/environ`, "utf8")
        .split("\0")
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
  } catch {
    // macOS: ps shows a process's environment after its command (only for your own processes).
    const out = await sh("ps", ["eww", "-o", "command=", "-p", String(pid)]);
    return Object.fromEntries([...out.matchAll(/(?:^|\s)(CLAUDE_CODE_SESSION_ID|TMUX_PANE|TMUX)=(\S+)/g)].map((m) => [m[1], m[2]]));
  }
}

/** Every agent on this machine that runs an intercom server: its session, pane (if in tmux), command line and intercom version. */
export async function agentPanes() {
  const ps = await sh("ps", ["-eo", "pid=,ppid=,args="]);
  const procs = ps
    .split("\n")
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] }));
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const panesOut = await sh("tmux", ["list-panes", "-a", "-F", "#{pane_id} #{pane_pid} #{pane_current_command}"]);
  const panes = new Map(
    panesOut
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split(" "))
      .map(([id, pid, cmd]) => [Number(pid), { id, cmd }]),
  );
  const current = new Map([...panes.values()].map((p) => [p.id, p.cmd]));
  const out = [];
  for (const p of procs.filter((x) => /intercom-channel\.mjs/.test(x.args))) {
    const env = await envOf(p.pid);
    const session = env.CLAUDE_CODE_SESSION_ID;
    if (!session) continue; // Codex sessions say where they are themselves
    let pane = /^%\d+$/.test(env.TMUX_PANE ?? "") ? env.TMUX_PANE : null;
    for (let pid = p.ppid, i = 0; !pane && pid > 1 && i < 25; i++, pid = byPid.get(pid)?.ppid ?? 0) if (panes.has(pid)) pane = panes.get(pid).id;
    const agent = byPid.get(p.ppid);
    out.push({
      session,
      pane,
      // The pane's own program is the agent (exiting it closes the pane), or a shell runs it.
      paneIsAgent: !!pane && [...panes.entries()].some(([pid, x]) => x.id === pane && pid === p.ppid),
      current: pane ? current.get(pane) ?? "" : "",
      launch: (agent?.args ?? "").slice(0, 500),
      version: p.args.match(/intercom\/([\d.]+)\/intercom-channel/)?.[1] ?? "",
    });
  }
  return out;
}

/** A process's working folder (Linux /proc, else lsof), or "". */
async function cwdOf(pid) {
  try {
    return fs.readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    const out = await sh("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
    return out.match(/^n(.*)$/m)?.[1] ?? "";
  }
}
const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};

/**
 * Codex: the tmux pane of the Codex terminal this server belongs to, and its command line. Codex 0.16x starts MCP
 * servers (and hooks) from one app-server daemon per machine, so neither our ancestors nor our TMUX_PANE (the
 * daemon's, from whichever pane first started it) say where our session's terminal is. It's the pane running a Codex
 * terminal in our folder: the one resumed with our session id if there's a choice, else the only one there. Two
 * fresh Codex terminals in one folder can't be told apart: then none (no screen beats typing into the wrong one).
 */
export async function codexPane(cwd, session, { procs: given, panes: givenPanes } = {}) {
  const procs =
    given ??
    (await sh("ps", ["-eo", "pid=,ppid=,args="]))
      .split("\n")
      .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
      .filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] }));
  let panes = givenPanes;
  if (!panes) {
    const r = await tmux(["list-panes", "-a", "-F", "#{pane_id} #{pane_pid}"]);
    if (r.err) return null;
    panes = new Map(r.out.trim().split("\n").map((l) => l.split(" ")).filter(([id, pid]) => /^%\d+$/.test(id) && pid).map(([id, pid]) => [Number(pid), id]));
  }
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const want = real(cwd);
  const found = new Map(); // pane → { launch, ours }
  for (const p of procs) {
    const [bin, ...rest] = p.args.split(/\s+/);
    if (!/(^|\/)codex$/.test(bin) || /^(app-server|mcp|mcp-server|exec|queue)$/.test(rest.find((a) => !a.startsWith("-")) ?? "")) continue;
    let pane = null;
    for (let pid = p.pid, i = 0; !pane && pid > 1 && i < 25; i++, pid = byPid.get(pid)?.ppid ?? 0) pane = panes.get(pid) ?? null;
    if (!pane || real(await cwdOf(p.pid)) !== want) continue;
    const ours = !!session && rest.includes(session);
    if (!found.has(pane) || ours) found.set(pane, { pane, launch: p.args.slice(0, 500), ours });
  }
  const all = [...found.values()];
  return all.find((x) => x.ours) ?? (all.length === 1 ? all[0] : null);
}

/** What the agent this server belongs to was started with: its command line. */
export async function launchOf(pid = process.ppid) {
  return (await sh("ps", ["-o", "args=", "-p", String(pid)])).trim().slice(0, 500);
}

/** One line of a Codex session log → a turn starting, or a turn that failed on a usage limit (intercom-channel.mjs reports it). */
export function codexTurn(line) {
  if (!line.includes('"event_msg"') || !/"task_(started|complete)"/.test(line)) return null;
  let d;
  try {
    d = JSON.parse(line);
  } catch {
    return null;
  }
  const p = d.payload ?? {};
  const at = Date.parse(d.timestamp ?? "") || 0;
  if (p.type === "task_started") return { at, event: "TurnStart" };
  const info = String(p.error?.codex_error_info ?? "");
  if (p.type === "task_complete" && /usage_limit/.test(info)) return { at, event: "StopFailure", body: { error: "rate_limit", error_details: String(p.error?.message ?? "usage limit") } };
  return null;
}
