// An agent's steps (commands it ran, files it read or edited) as a person would say them: "Committed …", "Read
// Dialog.cs · lines 395–500", "Searched for …", "Ran tests". The folder a command was run in (its leading `cd …;`)
// becomes a small chip, and the exact command opens under the line. The agent's own description wins when it gave one.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

export interface Step {
  kind: "git" | "read" | "search" | "edit" | "test" | "run" | "build" | "web" | "cmd";
  title: string; // HTML
  cwd: string; // the folder's last part, or ""
  where: string; // the whole folder (a tooltip), or ""
}

const base = (p: string) => p.replace(/["']/g, "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;
const q = (s: string) => `<b>${esc(s)}</b>`;
const quote = (s: string, n = 70) => `“${esc(s.length > n ? `${s.slice(0, n - 1)}…` : s)}”`;
const unquote = (s: string) => s.replace(/^(['"])([\s\S]*)\1$/, "$2");

/** Words of a shell command, quotes kept together (good enough for reading, not for running). */
function words(cmd: string): string[] {
  return cmd.match(/"(?:[^"\\]|\\.)*"?|'[^']*'?|\S+/g) ?? [];
}

/** One command (no ; or &&) → what it does, or null to show it as it is. */
function one(cmd: string): { kind: Step["kind"]; title: string } | null {
  const w = words(cmd.trim()).filter((x, i) => !(i === 0 && /^[A-Z_]+=/.test(x)));
  while (w.length && /^(sudo|time|env|nice|timeout|command|exec)$/.test(w[0]!)) w.shift();
  const bin = (w[0] ?? "").replace(/^.*[\\/]/, "").replace(/\.exe$/i, "");
  const args = w.slice(1);
  const files = args.filter((a) => !a.startsWith("-") && /[\w-]\.\w{1,6}["']?$/.test(a)).map((a) => base(unquote(a)));
  if (bin === "git") {
    const sub = args.find((a) => !a.startsWith("-")) ?? "";
    const m = cmd.match(/\s-[a-zA-Z]*m\s+("(?:[^"\\]|\\.)*"|'[^']*'|\S+)/);
    if (sub === "commit") return { kind: "git", title: m ? `Committed ${quote(unquote(m[1]!).split("\\n")[0]!)}` : "Committed" };
    if (sub === "add") return { kind: "git", title: args.includes("-A") || args.includes(".") ? "Staged changes" : `Staged ${files.length > 1 ? `${files.length} files` : q(files[0] ?? "changes")}` };
    if (sub === "push") return { kind: "git", title: "Pushed" };
    if (sub === "pull" || sub === "fetch") return { kind: "git", title: sub === "pull" ? "Pulled" : "Fetched" };
    if (sub === "checkout" || sub === "switch") return { kind: "git", title: `Switched to ${q(args[args.length - 1] ?? "")}` };
    if (sub === "rebase" || sub === "merge" || sub === "cherry-pick" || sub === "stash" || sub === "reset" || sub === "restore") return { kind: "git", title: `git ${esc(sub)}` };
    if (sub) return { kind: "git", title: `Looked at git ${esc(sub)}` };
  }
  if (bin === "sed" && args.includes("-n")) {
    const r = args.find((a) => /^['"]?\d+(,\d+)?p['"]?$/.test(a));
    const lines = r ? unquote(r).replace(/p$/, "").split(",") : [];
    return { kind: "read", title: `Read ${q(files[0] ?? "a file")}${lines.length ? ` <span class="sx">· line${lines.length > 1 ? `s ${lines[0]}–${lines[1]}` : ` ${lines[0]}`}</span>` : ""}` };
  }
  if (/^(cat|head|tail|less|bat|type|Get-Content)$/i.test(bin) && files.length) return { kind: "read", title: `Read ${files.length > 1 ? `${files.length} files` : q(files[0]!)}` };
  if (/^(grep|rg|ag|egrep|findstr|Select-String)$/i.test(bin)) {
    const pat = args.find((a) => !a.startsWith("-") && !/[\w-]\.\w{1,6}$/.test(unquote(a)));
    return { kind: "search", title: `Searched${files.length === 1 ? ` ${q(files[0]!)}` : ""} for ${quote(unquote(pat ?? "…"), 50)}` };
  }
  if (/^(ls|dir|find|fd|tree|Get-ChildItem)$/i.test(bin)) return { kind: "search", title: `Listed ${q(base(unquote(args.find((a) => !a.startsWith("-")) ?? ".")))}` };
  if (/^(python3?|py|node|deno|bun|ruby|perl|bash|sh|zsh|pwsh|powershell)$/i.test(bin)) {
    const script = args.find((a) => /\.(py|m?js|ts|rb|pl|sh|ps1)["']?$/i.test(a));
    if (script) return { kind: "run", title: `Ran ${q(base(unquote(script)))}` };
    if (args[0] === "-" || /<</.test(cmd) || args.includes("-c") || args.includes("-e")) return { kind: "run", title: `Ran a ${/^py/.test(bin) ? "Python" : /^(node|deno|bun)$/.test(bin) ? "JavaScript" : bin} snippet` };
  }
  if (/^(npm|pnpm|yarn|bun|npx|cargo|go|dotnet|mvn|gradle|\.\/gradlew|make|just|pytest|jest|vitest|tsc|swift)$/.test(bin)) {
    const rest = args.filter((a) => !a.startsWith("-")).join(" ");
    if (/\btest\b|^pytest|jest|vitest/.test(`${bin} ${rest}`)) return { kind: "test", title: "Ran the tests" };
    if (/\b(build|compile|tsc)\b/.test(`${bin} ${rest}`)) return { kind: "build", title: `Built${bin === "tsc" ? " (typecheck)" : ""}` };
    if (/\b(install|ci|add)\b/.test(rest)) return { kind: "build", title: "Installed packages" };
    if (/\bdeploy\b/.test(rest)) return { kind: "run", title: `Deployed (${esc(`${bin} ${rest}`.slice(0, 40))})` };
    return { kind: "run", title: `${q(`${bin} ${rest}`.trim().slice(0, 60))}` };
  }
  if (/^(curl|wget|http|Invoke-WebRequest)$/i.test(bin)) {
    const url = args.find((a) => /^['"]?https?:\/\//.test(a));
    return { kind: "web", title: `Fetched ${q(url ? new URL(unquote(url)).host : "a URL")}` };
  }
  return null;
}

/** A command step (`text` as the local server sends it: "description\ncommand", or the command alone). */
export function commandStep(text: string): Step & { desc: string; command: string } {
  const [first, ...rest] = text.split("\n");
  const desc = rest.length ? first!.trim() : "";
  let command = (rest.length ? rest.join(" ") : first!).trim();
  // `cd <folder>; …` / `cd <folder> && …`: the folder is where it ran, not what it did.
  let where = "";
  const cd = command.match(/^cd\s+("[^"]+"|'[^']+'|\S+)\s*(?:;|&&)\s*/);
  if (cd) {
    where = unquote(cd[1]!);
    command = command.slice(cd[0].length);
  }
  const parts = command.split(/\s*(?:&&|;|\|\|)\s*/).filter(Boolean);
  const said = parts.map(one).filter((x): x is NonNullable<typeof x> => !!x);
  const shown = said.length && said.length >= Math.ceil(parts.filter((p) => !/^(echo|cd|set|export)\b/.test(p)).length / 2);
  const kind = said.find((s) => s.kind !== "git")?.kind ?? said[0]?.kind ?? "cmd";
  const title = desc
    ? esc(desc)
    : shown
      ? [...new Set(said.map((s) => s.title))].slice(0, 3).join(" <span class=\"sx\">·</span> ")
      : `<code>${esc(command.length > 110 ? `${command.slice(0, 109)}…` : command)}</code>`;
  return { kind: said.length ? kind : "cmd", title, cwd: where ? base(where) : "", where, desc, command: cd ? `cd ${cd[1]} && ${command}` : command };
}

/** A read or edit step ("read /path/file", "edit a, b", "grep pattern"). */
export function fileStep(kind: "read" | "edit", text: string): Step {
  const m = text.match(/^(read|grep|glob|ls|edit|write)\s+([\s\S]*)$/i);
  const verb = m?.[1]?.toLowerCase() ?? kind;
  const what = (m?.[2] ?? text).trim();
  if (verb === "grep" || verb === "glob") return { kind: "search", title: `Searched for ${quote(what, 60)}`, cwd: "", where: "" };
  if (verb === "ls") return { kind: "search", title: `Listed ${q(base(what))}`, cwd: "", where: what };
  const files = what.split(/,\s*/).filter(Boolean);
  const dir = files.length === 1 ? files[0]!.replace(/[\\/][^\\/]*$/, "") : "";
  const name = files.length > 1 ? `${files.length} files` : base(files[0] ?? "");
  return { kind: verb === "read" ? "read" : "edit", title: `${verb === "read" ? "Read" : verb === "write" ? "Wrote" : "Edited"} ${q(name)}`, cwd: dir ? base(dir) : "", where: what };
}
