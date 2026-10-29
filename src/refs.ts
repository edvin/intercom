// Links for references agents write, like Claude Code shows them: !3742 (merge request), #123 (issue, or PR on
// GitHub), a91c2e0 (commit) and group/repo!12. They point at the session's own git origin, nowhere else; a commit
// your own agent mentions opens in its code view instead (code.ts), read from its machine, so no VPN or forge login
// is needed to see it.

/** A git origin as its web address: git@host:group/repo.git and ssh://… become https://host/group/repo. */
export function webBase(raw: string | null | undefined): string | null {
  let r = String(raw ?? "").trim().replace(/\.git$/, "").replace(/\/+$/, "");
  if (!r) return null;
  const scp = r.match(/^[\w.-]+@([\w.-]+):(?!\/)(.+)$/); // git@host:group/repo
  if (scp) r = `https://${scp[1]}/${scp[2]}`;
  const m = r.match(/^(?:ssh|git|https?):\/\/(?:[^@/]*@)?([\w.-]+)(?::(\d+))?\/(.+)$/);
  if (!m) return null;
  const [, host, port, path] = m as unknown as [string, string, string | undefined, string];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) || !/^[\w.\-/]+$/.test(path)) return null;
  // An https origin's port is the web port; an ssh one's isn't.
  const webPort = port && /^https?:/.test(r) ? `:${port}` : "";
  return `https://${host.toLowerCase()}${webPort}/${path}`;
}

const isGitHub = (base: string) => /^https:\/\/github\.com\//.test(base);

const isCommit = (ref: string) => /^[0-9a-f]{7,40}$/.test(ref) && /\d/.test(ref) && /[a-f]/.test(ref);

/** The URL for one reference, or null when it isn't one; `code` is the agent ("member/label") whose code view shows commits. */
function refUrl(base: string | null, ref: string, code?: string | null): string | null {
  // A commit: 7-40 hex characters with at least one digit and one letter (so plain words and numbers don't match).
  if (code && isCommit(ref)) return `/dashboard?view=agents&amp;agent=${encodeURIComponent(code)}&amp;code=commit&amp;sha=${ref}`;
  if (!base) return null;
  const gh = isGitHub(base);
  const host = base.replace(/^(https:\/\/[^/]+).*$/, "$1");
  let m: RegExpMatchArray | null;
  if ((m = ref.match(/^!(\d+)$/))) return gh ? null : `${base}/-/merge_requests/${m[1]}`;
  if ((m = ref.match(/^#(\d+)$/))) return gh ? `${base}/issues/${m[1]}` : `${base}/-/issues/${m[1]}`;
  if ((m = ref.match(/^([\w.-]+(?:\/[\w.-]+)+)!(\d+)$/))) return gh ? null : `${host}/${m[1]}/-/merge_requests/${m[2]}`;
  if ((m = ref.match(/^([\w.-]+(?:\/[\w.-]+)+)#(\d+)$/))) return gh ? `${host}/${m[1]}/issues/${m[2]}` : `${host}/${m[1]}/-/issues/${m[2]}`;
  if (isCommit(ref)) return gh ? `${base}/commit/${ref}` : `${base}/-/commit/${ref}`;
  return null;
}

const anchor = (url: string, text: string) =>
  url.startsWith("/") ? `<a class="ref" href="${url}" title="Open in its code view">${text}</a>` : `<a class="ref" href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;

/** Link references in already-escaped HTML text (no tags inside `text`). */
export function linkRefs(text: string, base: string | null, code?: string | null): string {
  return text.replace(/(^|[\s(\[,;:])((?:[\w.-]+(?:\/[\w.-]+)+)?[!#]\d+|[0-9a-f]{7,40})(?=$|[\s).,;:!?\]])/g, (all, pre: string, ref: string) => {
    const url = refUrl(base, ref, code);
    return url ? `${pre}${anchor(url, ref)}` : all;
  });
}

/** A `code` span that is exactly a reference (`a91c2e0`, `!3742`) becomes a link too. */
export function linkCode(code: string, base: string | null, agent?: string | null): string | null {
  const url = refUrl(base, code.trim(), agent);
  return url ? anchor(url, `<code>${code}</code>`) : null;
}
