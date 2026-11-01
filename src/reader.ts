// Reading a shared text file in the dashboard: a review an agent wrote as Markdown, a log, a JSON dump. Instead of
// downloading it (on a phone that hands it to some other app), /attachment/N/view shows it on a page of its own:
// Markdown rendered with the same safe renderer as messages, anything else as escaped text. Nothing in the file runs.
import { type Attachment, size } from "./attachments";
import { md } from "./markdown";
import { esc, html, icon, page } from "./ui";

const MD_EXT = /\.(md|markdown|mdx)$/i;

/** The reader page, or null when the bytes aren't text after all (the caller then offers the download). */
export function readerPage(a: Attachment, buf: ArrayBuffer, opts: { source: boolean; agent?: string | null }): Response | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buf);
  } catch {
    return null;
  }
  if (text.includes("\u0000")) return null;
  const isMd = MD_EXT.test(a.name) || a.mime === "text/markdown";
  const source = opts.source || !isMd;
  const base = `/attachment/${a.id}/view${opts.agent ? `?agent=${encodeURIComponent(opts.agent)}` : ""}`;
  const toggle = isMd
    ? `<span class="seg"><a href="${esc(base)}"${source ? "" : ' class="on"'}>Rendered</a><a href="${esc(base + (opts.agent ? "&" : "?") + "source=1")}"${source ? ' class="on"' : ""}>Source</a></span>`
    : "";
  const lines = text.split("\n").length;
  const body = source
    ? `<pre class="rdsrc"><code>${esc(text)}</code></pre>`
    : `<article class="md rdmd">${md(text, null, opts.agent ?? null, null)}</article>`;
  const top = `<header class="top rdtop"><div class="in">
    <a class="btn ghost sm icon" href="/dashboard" data-rdback title="Back">${icon("back", 16)}</a>
    <div class="rdname"><b title="${esc(a.name)}">${esc(a.name)}</b><span class="tiny muted">${size(a.bytes)} · ${lines} line${lines === 1 ? "" : "s"}</span></div>
    <span class="grow"></span>${toggle}
    <a class="btn ghost sm icon" href="/attachment/${a.id}" download="${esc(a.name)}" title="Download">${icon("download", 16)}</a>
  </div></header>`;
  const back = `<script>document.querySelector("[data-rdback]").addEventListener("click",e=>{if(history.length>1){e.preventDefault();history.back()}else if(window.opener){e.preventDefault();window.close()}})</script>`;
  return html(page(`${a.name} · Intercom`, `<main class="reader">${body}</main>${back}`, { top }), 200, { "cache-control": "private, no-store" });
}
