// Code in messages, coloured: a small tokenizer per family of languages (comments, strings, numbers, keywords, keys),
// run on the raw text with every piece escaped on the way out, so nothing from a message becomes markup. Good enough
// to read a snippet at a glance; not a parser. Unknown languages stay plain, unless the text is clearly a diff.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

type Rule = [cls: string, re: string];

const STR_C = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\`(?:[^\`\\]|\\.)*\``;
const NUM = String.raw`\b(?:0x[\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)\b`;
const words = (w: string) => String.raw`\b(?:${w.trim().split(/\s+/).join("|")})\b`;

const C_KW = words(`
  abstract as async await break case catch class const continue debugger default defer delete do else enum export extends
  false final finally fn for from func function go if impl implements import in instanceof interface let loop match mod
  module mut new nil null override package private protected pub public readonly return select self static struct super
  switch this throw throws trait true try type typeof undefined unsafe use var void where while yield`);
const PY_KW = words(`
  and as assert async await break class continue def del elif else except False finally for from global if import in is
  lambda None nonlocal not or pass raise return self True try while with yield`);
const SH_KW = words(`if then else elif fi for while until do done case esac in function return export local readonly set unset source exit`);
const SQL_KW = String.raw`\b(?:select|from|where|and|or|not|insert|into|values|update|set|delete|create|table|index|drop|alter|add|column|join|left|right|inner|outer|on|group|by|order|having|limit|offset|as|distinct|union|all|exists|in|is|null|primary|key|foreign|references|default|unique|begin|commit|rollback|with|case|when|then|else|end|count|sum|avg|min|max|asc|desc|integer|text|real|blob|varchar|boolean|timestamp)\b`;

const FAMILIES: Record<string, { rules: Rule[]; flags?: string }> = {
  c: { rules: [["c", String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`], ["s", STR_C], ["n", NUM], ["k", C_KW], ["f", String.raw`\b[A-Za-z_$][\w$]*(?=\()`], ["t", String.raw`\b[A-Z][A-Za-z0-9_]*\b`]] },
  py: { rules: [["c", String.raw`#[^\n]*`], ["s", String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''|[rbfuRBFU]{0,2}(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')`], ["n", NUM], ["k", PY_KW], ["d", String.raw`@[\w.]+`], ["f", String.raw`\b[A-Za-z_]\w*(?=\()`]] },
  sh: { rules: [["c", String.raw`(?:^|(?<=\s))#[^\n]*`], ["s", String.raw`"(?:[^"\\]|\\.)*"|'[^']*'`], ["v", String.raw`\$\{[^}\n]*\}|\$[A-Za-z_]\w*|\$[0-9@#?*!$-]`], ["k", SH_KW], ["o", String.raw`(?:^|(?<=\s))--?[A-Za-z][\w-]*`], ["p", String.raw`^\s*\$(?=\s)`]] },
  sql: { rules: [["c", String.raw`--[^\n]*|\/\*[\s\S]*?\*\/`], ["s", String.raw`'(?:[^']|'')*'`], ["n", NUM], ["k", SQL_KW]], flags: "i" },
  yaml: { rules: [["c", String.raw`(?:^|(?<=\s))#[^\n]*`], ["a", String.raw`^\s*-?\s*[\w.\-"']+(?=\s*:(?:\s|$))`], ["s", String.raw`"(?:[^"\\\n]|\\.)*"|'[^'\n]*'`], ["n", NUM], ["k", String.raw`\b(?:true|false|null|yes|no|on|off)\b`]] },
  json: { rules: [["a", String.raw`"(?:[^"\\\n]|\\.)*"(?=\s*:)`], ["s", String.raw`"(?:[^"\\\n]|\\.)*"`], ["n", String.raw`-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b`], ["k", String.raw`\b(?:true|false|null)\b`]] },
};

const LANGS: Record<string, string> = {
  js: "c", jsx: "c", mjs: "c", cjs: "c", javascript: "c", ts: "c", tsx: "c", typescript: "c", java: "c", kotlin: "c", kt: "c",
  go: "c", golang: "c", rust: "c", rs: "c", c: "c", h: "c", cpp: "c", "c++": "c", cc: "c", cs: "c", csharp: "c", swift: "c",
  php: "c", scala: "c", dart: "c", groovy: "c", gradle: "c", zig: "c", css: "c", scss: "c",
  py: "py", python: "py", python3: "py", rb: "py", ruby: "py",
  sh: "sh", bash: "sh", zsh: "sh", shell: "sh", console: "sh", shellsession: "sh", fish: "sh", dockerfile: "sh", docker: "sh", make: "sh", makefile: "sh", justfile: "sh",
  sql: "sql", sqlite: "sql", postgres: "sql", postgresql: "sql", mysql: "sql", psql: "sql",
  yaml: "yaml", yml: "yaml", toml: "yaml", ini: "yaml", env: "yaml", properties: "yaml",
  json: "json", jsonc: "json", json5: "json", jsonl: "json",
};

const compiled = new Map<string, RegExp>();
function scanner(family: string): RegExp {
  let re = compiled.get(family);
  if (!re) {
    const f = FAMILIES[family]!;
    re = new RegExp(f.rules.map(([cls, r]) => `(?<${cls}>${r})`).join("|"), `gm${f.flags ?? ""}`);
    compiled.set(family, re);
  }
  return re;
}

/** Lines that read as a unified diff (added, removed, hunk headers), when no language says otherwise. */
export const looksLikeDiff = (code: string) => {
  const lines = code.split("\n").filter((l) => l.trim());
  return lines.length >= 2 && lines.some((l) => /^@@ /.test(l) || /^(\+\+\+|---) /.test(l)) && lines.filter((l) => /^[+\- @]/.test(l)).length / lines.length > 0.8;
};

function diff(code: string): string {
  return code
    .split("\n")
    .map((l) => {
      const cls = /^(\+\+\+|---) /.test(l) ? "dh" : l.startsWith("@@") ? "dh" : l.startsWith("+") ? "da" : l.startsWith("-") ? "dd" : "";
      return cls ? `<span class="hl-${cls}">${esc(l)}</span>` : esc(l);
    })
    .join("\n");
}

/** The family a fence's language belongs to, or null when it isn't one we colour. */
export const familyOf = (lang: string) => (lang === "diff" || lang === "patch" ? "diff" : LANGS[lang.toLowerCase()] ?? null);

/** Raw code → coloured, escaped HTML. */
export function highlight(code: string, lang: string): string {
  const fam = lang ? familyOf(lang) : looksLikeDiff(code) ? "diff" : null;
  if (!fam) return esc(code);
  if (fam === "diff") return diff(code);
  const re = scanner(fam);
  re.lastIndex = 0;
  let out = "";
  let at = 0;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }
    const cls = Object.entries(m.groups ?? {}).find(([, v]) => v !== undefined)?.[0];
    out += esc(code.slice(at, m.index)) + (cls ? `<span class="hl-${cls}">${esc(m[0])}</span>` : esc(m[0]));
    at = m.index + m[0].length;
  }
  return out + esc(code.slice(at));
}
