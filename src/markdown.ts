import { linkCode, linkRefs } from "./refs";

// Message text → HTML, safely: everything is escaped first, then the Markdown agents write (what Claude Code and
// Codex render in a terminal) is turned into a small set of elements, and ANSI colour codes from pasted terminal
// output become coloured spans. No raw HTML from a message ever reaches the page.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

// ---- ANSI SGR (colours, bold, dim, italic, underline) ----

const ANSI_COLORS = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

/** Turns ESC[...m sequences in already-escaped text into spans; drops other escape sequences. */
function ansi(text: string): string {
  if (!text.includes("\u001b")) return text;
  let open = 0;
  const out = text.replace(/\u001b\[([0-9;]*)m|\u001b\[[0-9;?]*[A-Za-z]/g, (seq, codes: string | undefined) => {
    if (codes === undefined) return "";
    const parts = (codes || "0").split(";").map(Number);
    if (parts.includes(0) && parts.length === 1) {
      const close = "</span>".repeat(open);
      open = 0;
      return close;
    }
    const cls: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!;
      if (p === 1) cls.push("a-b");
      else if (p === 2) cls.push("a-dim");
      else if (p === 3) cls.push("a-i");
      else if (p === 4) cls.push("a-u");
      else if (p >= 30 && p <= 37) cls.push(`a-${ANSI_COLORS[p - 30]}`);
      else if (p >= 90 && p <= 97) cls.push(`a-${ANSI_COLORS[p - 90]} a-bright`);
      else if (p >= 40 && p <= 47) cls.push(`a-bg-${ANSI_COLORS[p - 40]}`);
      else if ((p === 38 || p === 48) && parts[i + 1] === 5) i += 2; // 256 colours: ignored, text kept
      else if ((p === 38 || p === 48) && parts[i + 1] === 2) i += 4; // truecolour: ignored, text kept
    }
    if (!cls.length) return "";
    open++;
    return `<span class="${cls.join(" ")}">`;
  });
  return out + "</span>".repeat(open);
}

// ---- inline Markdown ----

// A file path on the agent's machine: absolute (/…, ~/…, C:\…) and ending in a file name with an extension.
const PATH = String.raw`(?:~\/|\/(?!\/)|[A-Za-z]:\\)[\w.\-\/\\@+~%,=]*\.[A-Za-z0-9]{1,8}`;
const PATH_ONLY = new RegExp(`^${PATH}$`);
const PATH_IN = new RegExp(`(^|[\\s(\\[>"'])(${PATH})(?=[\\s&).,:;!?\\]'"<]|$)`, "g");
/** A link that fetches the file from the agent's machine (localfiles.ts); `agent` is "member/label". */
const fileLink = (path: string, agent: string, inner = path) =>
  `<a class="lfile" href="/agent-file?agent=${encodeURIComponent(agent)}&amp;path=${encodeURIComponent(path)}" target="_blank" rel="noopener" title="Open from ${agent.split("/")[1]}'s machine">${inner}</a>`;

function inline(s: string, refs?: string | null, files?: string | null): string {
  const codes: string[] = [];
  const keep = (html: string) => `\u0001${codes.push(html) - 1}\u0001`;
  // Attachment markers stay as they are (md turns them into thumbnails and chips): their #12 is no issue reference.
  s = s.replace(/\[📎 (?:image|file) #\d+[^\]\n]*\]/g, keep);
  s = s.replace(/`([^`\n]+)`/g, (_, c: string) => keep(files && PATH_ONLY.test(c) ? fileLink(c, files, `<code>${c}</code>`) : (refs && linkCode(c, refs)) || `<code>${c}</code>`));
  if (files) s = s.replace(PATH_IN, (_, pre: string, p: string) => pre + keep(fileLink(p, files)));
  s = s
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, "<b><i>$1</i></b>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_\n]+)__/g, "<b>$1</b>")
    .replace(/(^|[\s(>])\*([^*\s][^*\n]*?)\*(?=[\s).,!?:;<]|$)/g, "$1<i>$2</i>")
    .replace(/(^|[\s(>])_([^_\s][^_\n]*?)_(?=[\s).,!?:;<]|$)/g, "$1<i>$2</i>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  // MR/issue/commit references, in plain text only (not inside links or tags).
  if (refs) s = s.split(/(<a\b[^>]*>[\s\S]*?<\/a>|<[^>]+>)/).map((part, i) => (i % 2 ? part : linkRefs(part, refs))).join("");
  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => codes[Number(i)]!);
}

// ---- blocks ----

const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** Markdown (plus ANSI colours) → HTML. Output is meant for an element with white-space: normal. */
/** Unusual spaces agents emit (thin, narrow no-break, …) as plain spaces, so fonts without those glyphs don't swallow them. */
export const plainSpaces = (t: string) => t.replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, " ").replace(/[\u200b\u2060\ufeff]/g, "");

export function md(text: string, refs?: string | null, files?: string | null): string {
  const lines = esc(plainSpaces(text).replace(/\r\n?/g, "\n")).split("\n");
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map((l) => ansi(inline(l, refs, files))).join("<br>")}</p>`);
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // fenced code
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)\s*$/);
    if (fence) {
      flush();
      const body: string[] = [];
      while (++i < lines.length && !lines[i]!.trim().startsWith(fence[1]!)) body.push(lines[i]!);
      out.push(`<pre class="mdpre"${fence[2] ? ` data-lang="${fence[2]}"` : ""}><code>${ansi(body.join("\n"))}</code></pre>`);
      continue;
    }
    // table
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]!)) {
      flush();
      const head = cells(line);
      const align = cells(lines[i + 1]!).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : ""));
      const rows: string[][] = [];
      i += 1;
      while (i + 1 < lines.length && lines[i + 1]!.includes("|") && lines[i + 1]!.trim()) rows.push(cells(lines[++i]!));
      const td = (c: string, j: number, tag: string) => `<${tag}${align[j] ? ` style="text-align:${align[j]}"` : ""}>${ansi(inline(c, refs, files))}</${tag}>`;
      out.push(
        `<div class="mdtable"><table><thead><tr>${head.map((c, j) => td(c, j, "th")).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c, j) => td(c, j, "td")).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }
    // heading
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      flush();
      out.push(`<div class="mdh mdh${Math.min(h[1]!.length, 4)}">${ansi(inline(h[2]!, refs, files))}</div>`);
      continue;
    }
    // rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push("<hr>");
      continue;
    }
    // quote
    if (/^&gt;\s?/.test(line)) {
      flush();
      const q: string[] = [];
      for (; i < lines.length && /^&gt;\s?/.test(lines[i]!); i++) q.push(lines[i]!.replace(/^&gt;\s?/, ""));
      i--;
      out.push(`<blockquote>${md(q.join("\n").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"), refs, files)}</blockquote>`);
      continue;
    }
    // lists (bullets, numbers, task boxes), with indentation
    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/);
    if (li) {
      flush();
      const items: string[] = [];
      const ordered = /\d/.test(li[2]!);
      for (; i < lines.length; i++) {
        const m = lines[i]!.match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/);
        // A top-level item of the other kind (bullets ↔ numbers) starts a new list.
        if (m && !m[1] && /\d/.test(m[2]!) !== ordered) break;
        if (!m) {
          // a continuation line of the previous item
          if (lines[i]!.trim() && /^\s{2,}/.test(lines[i]!) && items.length) {
            items[items.length - 1] += `<br>${ansi(inline(lines[i]!.trim(), refs, files))}`;
            continue;
          }
          break;
        }
        const depth = Math.min(4, Math.floor(m[1]!.length / 2));
        const box = m[3] ? `<span class="mdbox ${/x/i.test(m[3]) ? "on" : ""}">${/x/i.test(m[3]) ? "✓" : ""}</span>` : "";
        items.push(`<li style="margin-left:${depth * 1.4}em"${m[3] ? ' class="task"' : ""}>${box}${ansi(inline(m[4]!, refs, files))}</li>`);
      }
      i--;
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line);
  }
  flush();
  // Images attached to a message ([📎 image #12: shot.png]) show as thumbnails; a click opens the full image.
  // Other files an agent shared ([📎 file #13: report.pdf · 240 KB]) are a download chip.
  return out
    .join("")
    .replace(/\[📎 image #(\d+)(?::\s?([^\]<]*))?\]/g, (_, id: string, name = "") =>
      `<a class="att" href="/attachment/${id}" target="_blank" rel="noopener" title="${name || `image #${id}`}"><img src="/attachment/${id}" alt="${name || `image #${id}`}" loading="lazy"></a>`,
    )
    .replace(/\[📎 file #(\d+):\s?([^\]<·]*?)\s*(?:·\s*([^\]<]*))?\]/g, (_, id: string, name: string, size = "") =>
      `<a class="attf" href="/attachment/${id}" download="${name}" title="Download ${name}"><span class="attf-i">⤓</span><span class="attf-n">${name}</span>${size ? `<span class="attf-s">${size}</span>` : ""}</a>`,
    );
}
