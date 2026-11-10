import type { Delivery } from "./lib";
// Design system for the web pages: tokens, components and the page shell. No framework, no build step:
// one stylesheet and a small script, served inline with every page (fonts are served from the edge).

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'self'; worker-src 'self'; manifest-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      ...headers,
    },
  });

export const redirect = (to: string, headers: Record<string, string> = {}) => new Response(null, { status: 303, headers: { location: to, ...headers } });

// Icons: 24×24 stroke paths (Lucide-style, ISC licensed shapes).
const ICONS: Record<string, string> = {
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  volume: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-2.93 1.41-1.41m11.32-11.32 1.41-1.41M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18Z" fill="currentColor"/>',
  square: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  fit: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  sidebar: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  branch: '<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  unlock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  hash: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  vote: '<path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/><path d="M22 19H2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  bellOff: '<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  sliders: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  messages: '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
  paperclip: '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  dots: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  door: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.56v16.88a.5.5 0 0 1-.6.49l-6.8-1.36A2 2 0 0 1 4 18.6V5.4a2 2 0 0 1 1.6-1.96l6.8-1.36a.5.5 0 0 1 .6.49Z"/>',
};

export const icon = (name: keyof typeof ICONS | string, size = 16) =>
  `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;

export const GITHUB_ICON = `<svg class="i" width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>`;

export const LOGO = `<svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cff"/><stop offset="1" stop-color="#2fb4ff"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lg)"/><g fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M11.2 11.2a6.8 6.8 0 0 0 0 9.6" opacity=".95"/><path d="M20.8 11.2a6.8 6.8 0 0 1 0 9.6" opacity=".95"/><path d="M7.8 7.8a11.6 11.6 0 0 0 0 16.4" opacity=".55"/><path d="M24.2 7.8a11.6 11.6 0 0 1 0 16.4" opacity=".55"/></g><circle cx="16" cy="16" r="2.6" fill="#fff"/></svg>`;

/** Stable colour per handle. */
export function hue(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** An agent's own hue, stable by its full address (edvin/alder and anna/alder differ). */
export function agentHue(member: string, label: string): number {
  let h = 0x811c9dc5;
  for (const c of `${member}/${label}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return 30 + (h % 300); // never red: that's for warnings and errors
}

/** Two letters for an agent: loxodon-core → LC, alder → AL; generated id parts (b5d3, 336f) don't count. */
export function initials(label: string): string {
  const words = label.split(/[-_\s.]+/).filter((w) => w && !/\d/.test(w));
  const pick = words.length >= 2 ? words[0]![0]! + words[1]![0]! : (words[0] ?? label).slice(0, 2);
  return pick.toUpperCase();
}

/** An agent's avatar: its hue and initials, square-ish so agents read differently from people's round ones. */
export const agentAvatar = (member: string, label: string, size: "s" | "m" | "l" = "m") =>
  `<span class="av av-${size} av-agent" style="--h:${agentHue(member, label)}" title="${esc(`${member}/${label}`)}">${esc(initials(label))}</span>`;

/** An agent's name in its own colour (the same everywhere: feed, chats, lists). */
export const agentName = (member: string, label: string, text = `${member}/${label}`) =>
  `<span class="an" style="--h:${agentHue(member, label)}">${esc(text)}</span>`;

/** An agent's name that opens its chat. */
export const agentLink = (member: string, label: string, text = `${member}/${label}`) =>
  `<a class="an" href="/dashboard?view=agents&amp;agent=${encodeURIComponent(`${member}/${label}`)}" style="--h:${agentHue(member, label)}" title="Open ${esc(`${member}/${label}`)}'s chat">${esc(text)}</a>`;

export const avatar = (name: string, size: "s" | "m" | "l" = "m") =>
  `<span class="av av-${size}" style="--h:${hue(name)}" title="${esc(name)}">${esc(name.slice(0, 1).toUpperCase())}</span>`;

/** A direct message's delivery mark: ✓ taken into an agent's context, ⏳ not picked up yet, ⚠ nobody connected to take it. */
export function deliveryMark(d: Delivery | undefined): string {
  if (!d) return "";
  if (d.state === "delivered") {
    const title = d.detail && d.at ? `Delivered to ${d.label || "an agent"} ${relative(d.at)}` : "Delivered to an agent";
    return `<span class="dlv ok" title="${esc(title)}">✓${d.detail && d.label ? ` ${esc(d.label)}` : ""}</span>`;
  }
  if (d.state === "waiting")
    return `<span class="dlv wait" title="${d.detail ? "A session that takes it is connected; it lands at its next turn or check-in" : "Not delivered yet"}">⏳</span>`;
  if (d.state === "held") return `<span class="dlv held" title="On hold while you edit it: no agent gets it until you send it">on hold</span>`;
  if (d.state === "cancelled") return `<span class="dlv cancel" title="You took it back before an agent got it; only you see it">cancelled</span>`;
  return `<span class="dlv off" title="No session with that name is connected; it's delivered when one starts">⚠ not connected</span>`;
}

export const time = (ts: number) => `<time data-ts="${ts}" title="${new Date(ts).toISOString()}">${relative(ts)}</time>`;

function relative(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const hidden = (fields: Record<string, string>) => Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join("");

export { md, plainSpaces } from "./markdown";

/** A code block with a copy button. */
export const codeBlock = (s: string) =>
  `<div class="code"><pre>${esc(s)}</pre><button type="button" class="btn ghost xs copy" data-copy="${esc(s)}" title="Copy">${icon("copy", 14)}<span>Copy</span></button></div>`;

const STYLE = `
@font-face{font-family:Geist;src:url(/assets/geist.woff2) format("woff2");font-weight:100 900;font-display:swap}
@font-face{font-family:"Geist Mono";src:url(/assets/geist-mono.woff2) format("woff2");font-weight:100 900;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url(/assets/jetbrains-mono.woff2) format("woff2");font-weight:100 800;font-display:swap}
:root{
  --an-l:40%;--bg:#ffffff;--bg-glow:transparent;--side:#f4f4f6;--surface:#ffffff;--surface-2:#f2f2f4;--surface-3:#e8e8eb;
  --line:rgba(15,17,25,.08);--line-strong:rgba(15,17,25,.14);--ink:#121318;--ink-2:#383a45;--mute:#5d606b;
  --accent:#5b47e0;--accent-2:#5b47e0;--accent-ink:#ffffff;--accent-soft:rgba(91,71,224,.09);
  --green:#15a050;--green-soft:rgba(21,160,80,.11);--amber:#c27407;--amber-soft:rgba(201,122,6,.11);
  --red:#d93a45;--red-soft:rgba(217,58,69,.09);
  --hover:rgba(15,17,25,.045);--sel:rgba(15,17,25,.065);--cshadow:0 1px 2px rgba(15,17,25,.04),0 6px 24px -10px rgba(15,17,25,.14);
  --hl-c:#8a8f98;--hl-s:#0b7a3b;--hl-n:#b35a00;--hl-k:#7a3fd1;--hl-f:#1f5fbf;--hl-t:#0d7480;--hl-a:#1f5fbf;--hl-v:#0d7480;--hl-add:#e3f6ea;--hl-del:#fdebed;--hl-addc:#0a5a2b;--hl-delc:#9e1f2a;--diff-add-ln:#c5ebd3;--green-ink:#0b6e35;--diff-del-ln:#f8cdd2;--diff-hunk:#efedfd;
  --shadow:0 1px 2px rgba(15,17,25,.04);
  --shadow-lg:0 1px 2px rgba(15,17,25,.05),0 16px 40px -12px rgba(15,17,25,.22);
  --grad:linear-gradient(var(--accent),var(--accent));
  --scroll:rgba(15,17,25,.14);--scroll-hover:rgba(15,17,25,.28);
  --r:12px;--r-s:8px;color-scheme:light;
}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){
  --an-l:70%;--bg:#1a1a1d;--bg-glow:transparent;--side:#141416;--surface:#1f1f22;--surface-2:#252529;--surface-3:#2e2e33;
  --line:rgba(255,255,255,.07);--line-strong:rgba(255,255,255,.12);--ink:#ededf0;--ink-2:#c9cad1;--mute:#9a9ca6;
  --scroll:rgba(255,255,255,.12);--scroll-hover:rgba(255,255,255,.24);
  --accent:#9284ff;--accent-2:#9284ff;--accent-ink:#ffffff;--accent-soft:rgba(146,132,255,.14);
  --green:#3ecf80;--green-soft:rgba(62,207,128,.12);--amber:#f0aa3c;--amber-soft:rgba(240,170,60,.12);
  --red:#f2636d;--red-soft:rgba(242,99,109,.12);
  --hover:rgba(255,255,255,.045);--sel:rgba(255,255,255,.075);--cshadow:0 0 0 1px rgba(255,255,255,.06),0 18px 50px -12px rgba(0,0,0,.75);
  --hl-c:#7d818c;--hl-s:#8fd3a0;--hl-n:#f0a868;--hl-k:#c3a6ff;--hl-f:#82b8ff;--hl-t:#6fd0d6;--hl-a:#82b8ff;--hl-v:#6fd0d6;--hl-add:rgba(62,207,128,.13);--hl-del:rgba(242,99,109,.13);--hl-addc:#a6eebd;--hl-delc:#ffb0b5;--diff-add-ln:rgba(62,207,128,.22);--green-ink:#5fe39a;--diff-del-ln:rgba(242,99,109,.22);--diff-hunk:rgba(146,132,255,.12);
  --shadow:0 0 0 1px rgba(255,255,255,.02);
  --shadow-lg:0 0 0 1px rgba(255,255,255,.06),0 18px 50px -12px rgba(0,0,0,.75);color-scheme:dark;
}}
:root[data-theme=dark]{
  --an-l:70%;--bg:#1a1a1d;--bg-glow:transparent;--side:#141416;--surface:#1f1f22;--surface-2:#252529;--surface-3:#2e2e33;
  --line:rgba(255,255,255,.07);--line-strong:rgba(255,255,255,.12);--ink:#ededf0;--ink-2:#c9cad1;--mute:#9a9ca6;
  --scroll:rgba(255,255,255,.12);--scroll-hover:rgba(255,255,255,.24);
  --accent:#9284ff;--accent-2:#9284ff;--accent-ink:#ffffff;--accent-soft:rgba(146,132,255,.14);
  --green:#3ecf80;--green-soft:rgba(62,207,128,.12);--amber:#f0aa3c;--amber-soft:rgba(240,170,60,.12);
  --red:#f2636d;--red-soft:rgba(242,99,109,.12);
  --hover:rgba(255,255,255,.045);--sel:rgba(255,255,255,.075);--cshadow:0 0 0 1px rgba(255,255,255,.06),0 18px 50px -12px rgba(0,0,0,.75);
  --hl-c:#7d818c;--hl-s:#8fd3a0;--hl-n:#f0a868;--hl-k:#c3a6ff;--hl-f:#82b8ff;--hl-t:#6fd0d6;--hl-a:#82b8ff;--hl-v:#6fd0d6;--hl-add:rgba(62,207,128,.13);--hl-del:rgba(242,99,109,.13);--hl-addc:#a6eebd;--hl-delc:#ffb0b5;--diff-add-ln:rgba(62,207,128,.22);--green-ink:#5fe39a;--diff-del-ln:rgba(242,99,109,.22);--diff-hunk:rgba(146,132,255,.12);
  --shadow:0 0 0 1px rgba(255,255,255,.02);
  --shadow-lg:0 0 0 1px rgba(255,255,255,.06),0 18px 50px -12px rgba(0,0,0,.75);color-scheme:dark;
}
:root[data-theme=light]{color-scheme:light}
*{box-sizing:border-box}
/* Scrollbars in the theme's colors: a thin thumb on a clear track, darker while you point at it (macOS draws wide
   light-gray ones when a mouse is attached). Browsers without scrollbar-color (Safari) get the same via ::-webkit-scrollbar. */
*{scrollbar-width:thin;scrollbar-color:var(--scroll) transparent}*:hover{scrollbar-color:var(--scroll-hover) transparent}
@supports not (scrollbar-color:auto){
  ::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
  ::-webkit-scrollbar-thumb{background:var(--scroll);border:3px solid transparent;border-radius:10px;background-clip:padding-box}
  ::-webkit-scrollbar-thumb:hover{background-color:var(--scroll-hover)}
}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font:14px/1.55 Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;font-feature-settings:"ss01","cv11"}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline;text-underline-offset:3px}
code,pre,.mono{font-family:"Geist Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em}
code{background:var(--surface-2);border:1px solid var(--line);padding:.1em .4em;border-radius:6px}
h1,h2,h3{letter-spacing:-.02em;margin:0;line-height:1.2}
h1{font-size:28px;font-weight:650}h2{font-size:15px;font-weight:600}h3{font-size:14px;font-weight:600}
p{margin:.5em 0}
.i{flex:none;vertical-align:-3px}
.muted{color:var(--mute)}.small{font-size:12.5px}.tiny{font-size:11.5px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.spread{justify-content:space-between}.grow{flex:1;min-width:0}
.stack>*+*{margin-top:12px}

/* top bar */
.top{padding-top:env(safe-area-inset-top);position:sticky;top:0;z-index:20;backdrop-filter:saturate(1.6) blur(14px);-webkit-backdrop-filter:saturate(1.6) blur(14px);background:color-mix(in srgb,var(--bg) 72%,transparent);border-bottom:1px solid var(--line)}
.top .in{max-width:1440px;margin:0 auto;padding:10px 20px;display:flex;align-items:center;gap:14px}
.brand{display:flex;align-items:center;gap:10px;font-weight:650;font-size:16px;letter-spacing:-.02em;color:var(--ink)}
.brand:hover{text-decoration:none}
.live{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--mute);padding:3px 10px 3px 8px;border:1px solid var(--line);border-radius:99px;background:var(--surface)}
.live .dot{width:7px;height:7px;border-radius:50%;background:var(--mute)}
.live.on .dot{background:var(--green);box-shadow:0 0 0 0 var(--green);animation:pulse 2.4s infinite}
.live.on{color:var(--ink-2)}
@keyframes pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--green) 60%,transparent)}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}
.me{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2);padding:4px 8px;border-radius:9px}.me:hover{background:var(--surface-2);text-decoration:none}

/* layout */
.shell{max-width:1440px;margin:0 auto;padding:24px 20px 80px;display:grid;grid-template-columns:232px minmax(0,1fr) 360px;gap:24px;align-items:start}
.side{position:sticky;top:76px;max-height:calc(100vh - 96px);overflow:auto;padding-right:4px}
.aside{display:flex;flex-direction:column;gap:20px}
.main{display:flex;flex-direction:column;gap:20px;min-width:0}
@media (max-width:1180px){.shell{grid-template-columns:210px minmax(0,1fr)}.aside{grid-column:2}}
@media (max-width:820px){.shell{grid-template-columns:1fr;padding:16px 14px 64px}.aside{grid-column:1}.side{position:static;max-height:none}
  .nav{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}.nav .label,.side .people{display:none}.nav a{white-space:nowrap}}

/* sidebar nav */
.nav .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--mute);margin:18px 10px 6px;font-weight:600}
.nav a{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:9px;color:var(--ink-2);font-weight:500}
.nav a:hover{background:var(--surface-2);text-decoration:none}
.nav a.on{background:var(--surface);color:var(--ink);box-shadow:var(--shadow);border:1px solid var(--line)}
.nav a .n{margin-left:auto;display:flex;gap:4px}
.badge{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;padding:1px 7px;border-radius:99px;background:var(--surface-3);color:var(--ink-2)}
.client{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:var(--ink-2);flex:none}
.client svg{flex:none}.client.cl{color:#c9643f}.client.cx{color:var(--ink)}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .client.cl{color:#e08a6a}}:root[data-theme=dark] .client.cl{color:#e08a6a}
.hd .client,.hd .badge{height:22px;padding:0 9px 0 7px;border-radius:99px;font-size:11.5px;font-weight:600;display:inline-flex;align-items:center;gap:5px;line-height:1}
.hd .client{background:var(--surface-2);border:1px solid var(--line)}
.hd .client svg{width:13px;height:13px}
.hd .client.cx{color:var(--ink-2)}
.renamebtn{opacity:.45;transition:opacity .15s}.chat>.hd:hover .renamebtn,.renamebtn:focus{opacity:1}
.meta-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:var(--mute);margin-top:3px}
.meta-row .i{vertical-align:-2px}
.badge.accent{background:var(--accent-soft);color:var(--accent)}.badge.amber{background:var(--amber-soft);color:var(--amber)}.badge.green{background:var(--green-soft);color:var(--green)}.badge.red{background:var(--red-soft);color:var(--red)}
.person{display:flex;align-items:center;gap:9px;padding:6px 10px;border-radius:9px}
.person .where{font-size:12px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.person .note{font-size:12px;color:var(--ink-2);margin-top:2px;line-height:1.35;overflow-wrap:anywhere}
.presence{position:relative}.presence::after{content:"";position:absolute;right:-3px;bottom:-3px;width:9px;height:9px;border-radius:50%;border:2px solid var(--bg);background:var(--mute)}
.presence.on::after{background:var(--green)}.presence.idle::after{background:var(--amber)}

/* cards */
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow)}
.card>.hd{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--line)}
.card>.hd h2{display:flex;align-items:center;gap:8px}
.card>.hd .act{margin-left:auto;display:flex;gap:6px}
.card>.bd{padding:16px 18px}
.card.glow{position:relative;border-color:transparent;background:linear-gradient(var(--surface),var(--surface)) padding-box,var(--grad) border-box;border:1px solid transparent;box-shadow:0 12px 40px -18px color-mix(in srgb,var(--accent) 70%,transparent)}
.empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:22px 10px;color:var(--mute)}
.empty .i{opacity:.5}

/* buttons & fields */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;font:inherit;font-size:13px;font-weight:550;height:34px;padding:0 14px;border-radius:9px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);cursor:pointer;transition:transform .08s,background .15s,border-color .15s,box-shadow .15s;white-space:nowrap;text-decoration:none!important}
.btn:hover{background:var(--surface-2)}.btn:active{transform:translateY(1px)}
.btn.primary{background:var(--grad);border-color:transparent;color:#fff;box-shadow:0 6px 18px -8px color-mix(in srgb,var(--accent) 80%,transparent),inset 0 1px 0 rgba(255,255,255,.18)}
.btn.primary:hover{filter:brightness(1.06)}
.btn.ghost{background:transparent;border-color:transparent;color:var(--ink-2)}.btn.ghost:hover{background:var(--surface-2)}
.btn.danger{color:var(--red);border-color:color-mix(in srgb,var(--red) 35%,transparent)}.btn.danger:hover{background:var(--red-soft)}
.btn.sm{height:28px;padding:0 10px;font-size:12.5px;border-radius:8px}.btn.xs{height:24px;padding:0 8px;font-size:12px;border-radius:7px;gap:5px}
.btn.icon{width:30px;padding:0}.btn.sel{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 45%,transparent);color:var(--accent)}
.btn[disabled]{opacity:.55;pointer-events:none}
input,select,textarea{font:inherit;font-size:14px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line);border-radius:9px;padding:8px 11px;outline:none;transition:border-color .15s,box-shadow .15s,background .15s;max-width:100%}
input,select{height:36px}select{padding-top:0;padding-bottom:0;line-height:1.2;padding-right:28px;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8c9d' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center}
input:focus,select:focus,textarea:focus{border-color:color-mix(in srgb,var(--accent) 60%,transparent);box-shadow:0 0 0 4px var(--accent-soft);background:var(--surface)}
textarea{width:100%;min-height:76px;resize:vertical;line-height:1.5}
input[type=checkbox]{height:auto;accent-color:var(--accent);width:15px;height:15px;vertical-align:-2px}
label.field{display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--mute);font-weight:500}
label.field>input,label.field>textarea,label.field>select{width:100%}
.check{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--ink-2)}

/* composer */
.composer{padding:14px}
.composer textarea{border:0;background:transparent;box-shadow:none;padding:6px 6px 10px;min-height:64px;font-size:15px}
.composer textarea:focus{box-shadow:none;background:transparent}
.composer .bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--line)}
.composer select{height:32px;font-size:13px;background-color:var(--surface-2);min-width:0;text-overflow:ellipsis}
.composer #compose-project{max-width:200px}.composer #compose-to{flex:0 1 300px}
@media (min-width:640px){.composer .bar{flex-wrap:nowrap}}
.kbd{font-family:"Geist Mono",monospace;font-size:11px;color:var(--mute);border:1px solid var(--line-strong);border-bottom-width:2px;border-radius:5px;padding:0 5px}

/* feed */
.feed{padding:6px 0}
.day{display:flex;align-items:center;gap:12px;margin:14px 18px 6px;font-size:11.5px;font-weight:600;color:var(--mute);text-transform:uppercase;letter-spacing:.08em}
.day::after{content:"";flex:1;height:1px;background:var(--line)}
.msg{display:flow-root;padding:7px 18px 7px 22px;font-family:"JetBrains Mono","Geist Mono",ui-monospace,monospace;font-size:12.5px;transition:background .2s}
.msg:hover{background:color-mix(in srgb,var(--surface-2) 60%,transparent)}
.msg .head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;font-size:12px}
.msg .who .person{font-weight:700;color:var(--ink)}.msg.mine .who .person{color:var(--green)}
.msg .to{color:var(--mute)}.msg .to .an{font-weight:600}.msg .chan{color:var(--mute);text-decoration:none}.msg .chan:hover{color:var(--ink-2)}
.msg .meta{font-size:11px;color:var(--mute);margin-left:auto;white-space:nowrap}
.msg .body{overflow-wrap:anywhere;color:var(--ink);margin-top:3px;line-height:1.55}
.msg .body p{margin:0 0 4px}.msg .body p:last-child{margin-bottom:0}
.msg.dm{box-shadow:inset 2px 0 0 color-mix(in srgb,var(--accent) 55%,transparent)}
.msg.cont{padding-top:0}.msg.cont .who,.msg.cont .to,.msg.cont .chan{display:none}
#compose{font-family:"JetBrains Mono","Geist Mono",ui-monospace,monospace;font-size:13px}
.msg.cont .head{float:right;margin-left:14px}.msg.cont .body{margin-top:0}
.msg.fresh{animation:fresh 2.4s ease-out}
@keyframes fresh{from{background:var(--accent-soft)}}
.event{display:flex;align-items:center;gap:10px;padding:4px 18px 4px 22px;font-size:12px;color:var(--mute);font-family:"JetBrains Mono","Geist Mono",ui-monospace,monospace}
.event .ico{width:18px;height:18px;border-radius:5px;display:grid;place-items:center;background:var(--surface-2);color:var(--ink-2);flex:none}
.event.lock .ico{background:var(--amber-soft);color:var(--amber)}.event.unlock .ico{background:var(--green-soft);color:var(--green)}
.event.vote .ico,.event.decision .ico{background:var(--accent-soft);color:var(--accent)}
.event b{color:var(--ink-2);font-weight:600}.event .to{color:var(--accent)}.event .chan{color:var(--mute);text-decoration:none}.event .txt{flex:1;min-width:0;overflow-wrap:anywhere}.event time{font-size:12px;white-space:nowrap}
.tag{font-size:11.5px;font-weight:600;color:var(--mute);background:var(--surface-2);border:1px solid var(--line);padding:0 7px;border-radius:6px}
.tag.dm{color:var(--accent);background:var(--accent-soft);border-color:transparent}

/* markdown in messages (rendered by markdown.ts) */
.md{white-space:normal;overflow-wrap:anywhere}
.md p{margin:0 0 .55em}.md p:last-child{margin-bottom:0}
.md ul,.md ol{margin:.2em 0 .55em;padding-left:1.4em}.md li{margin:.12em 0}.md li.task{list-style:none;margin-left:-1.2em}
.md .mdbox{display:inline-grid;place-items:center;width:1em;height:1em;border:1.5px solid var(--line-strong);border-radius:4px;font-size:.75em;margin-right:.45em;vertical-align:-1px}.md .mdbox.on{background:var(--green);border-color:var(--green);color:#fff}
.md .mdh{font-weight:700;margin:.6em 0 .3em;letter-spacing:-.01em}.md .mdh1{font-size:1.25em}.md .mdh2{font-size:1.12em}.md .mdh3,.md .mdh4{font-size:1em}
.md blockquote{margin:.4em 0;padding:.1em 0 .1em .9em;border-left:3px solid var(--line-strong);color:var(--ink-2)}
.md hr{border:0;border-top:1px solid var(--line);margin:.8em 0}
.md code{font-size:.86em}
.mdpre{margin:.5em 0;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px 12px;overflow-x:auto;white-space:pre;font-size:12.5px;line-height:1.55}
.mdpre code{background:none;border:0;padding:0;font-size:inherit}
.mdtable{overflow-x:auto;margin:.5em 0}.md table{border-collapse:collapse;font-size:.93em}.md th,.md td{border:1px solid var(--line-strong);padding:5px 10px;text-align:left;vertical-align:top;overflow-wrap:normal;word-break:normal}.md th{background:var(--surface-2);font-weight:600}
/* ANSI colours (terminal output pasted into a message) */
.a-b{font-weight:700}.a-dim{opacity:.6}.a-i{font-style:italic}.a-u{text-decoration:underline}
.a-red{color:#e5534b}.a-green{color:#3fb950}.a-yellow{color:#d4a72c}.a-blue{color:#539bf5}.a-magenta{color:#c678dd}.a-cyan{color:#39c5cf}.a-white{color:var(--ink)}.a-black{color:var(--mute)}
.a-bright.a-red{color:#ff7b72}.a-bright.a-green{color:#56d364}.a-bright.a-yellow{color:#e3b341}.a-bright.a-blue{color:#79c0ff}.a-bright.a-magenta{color:#d2a8ff}.a-bright.a-cyan{color:#56d4dd}
.a-bg-red{background:rgba(229,83,75,.25)}.a-bg-green{background:rgba(63,185,80,.25)}.a-bg-yellow{background:rgba(212,167,44,.25)}.a-bg-blue{background:rgba(83,155,245,.25)}

/* agents: the management station. An app-like screen: the page doesn't scroll; the list and the thread do. */
.shell.wide{grid-template-columns:232px minmax(0,1fr);height:calc(100dvh - 58px);padding-top:16px;padding-bottom:16px;align-items:stretch;overflow:hidden}
.shell.wide>.side{position:static;max-height:none;overflow:auto}
.shell.wide>.main{min-height:0;height:100%;gap:12px}
.agents{display:grid;grid-template-columns:320px minmax(0,1fr);gap:16px;flex:1;min-height:0}
.alist{display:flex;flex-direction:column;gap:2px;overflow-y:auto;min-height:0;padding-right:4px}
.alist .label{margin:6px 10px 6px!important}
.acard{display:flex;gap:10px;align-items:flex-start;padding:9px 11px;border-radius:12px;border:1px solid transparent;color:var(--ink);text-decoration:none!important}
.acard:hover{background:var(--surface-2)}
.acard.on{background:var(--surface);border-color:var(--line);box-shadow:var(--shadow)}
.acard .nm{font-weight:600;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.acard .sub{display:block;font-size:12px;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acard .st{font-size:12.5px;color:var(--ink-2);margin-top:2px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.acard.on .st{-webkit-line-clamp:3}
.alist details>summary{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--mute);font-weight:600;padding:10px}
.alist details[open]>summary{padding-bottom:4px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--mute);flex:none}.dot.on{background:var(--green);box-shadow:0 0 0 3px var(--green-soft)}
.chat{display:flex;flex-direction:column;min-height:0;height:100%;overflow:hidden}
.chat>.hd{flex-wrap:wrap;flex:none}.chat>.hd .aname{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chat>.hd .client{flex:none}
.thread{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:18px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}
.thread>.empty{margin:auto}
.bubble{max-width:min(86%,1100px);padding:10px 14px;border-radius:16px;background:var(--surface-2);border:1px solid var(--line);overflow-wrap:anywhere;line-height:1.5;align-self:flex-start;border-bottom-left-radius:6px}
.bubble.mine{align-self:flex-end;background:var(--grad);color:#fff;border:0;border-bottom-left-radius:16px;border-bottom-right-radius:6px}
.bubble.mine a{color:#fff;text-decoration:underline}.bubble.mine code{background:rgba(255,255,255,.18);border-color:transparent;color:#fff}
.bubble .when{display:block;font-size:11px;color:var(--mute);margin-top:4px}.bubble .via{margin-right:.5em;padding:0 6px;border-radius:6px;background:var(--surface-2);color:var(--ink-2)}
.activity{align-self:center;font-size:12.5px;color:var(--mute);text-align:center;max-width:80%;display:flex;gap:6px;align-items:baseline;min-width:0}.activity>span{min-width:0;overflow-wrap:anywhere}
.activity .i{align-self:flex-start;margin-top:2px}
/* Terminal style (default): a full-width CLI transcript in JetBrains Mono */
.thread.term{gap:0;padding:14px 22px;font-family:"JetBrains Mono","Geist Mono",ui-monospace,Menlo,monospace;font-size:13.2px;line-height:1.6}
.thread.term .bubble{max-width:none;align-self:stretch;background:none;border:0;border-radius:0;padding:8px 0 10px;color:var(--ink)}
.thread.term .bubble::before{content:"● " attr(data-who);display:block;font-weight:700;color:hsl(var(--h,250) 62% var(--an-l));margin-bottom:2px}
.thread.term .bubble.mine{color:var(--ink);background:none}
.thread.term .bubble.mine::before{content:"› you";color:var(--green)}
.thread.term .bubble.mine{border-left:2px solid var(--green);padding-left:12px;margin:6px 0;background:color-mix(in srgb,var(--green) 6%,transparent)}
.thread.term .bubble.mine a{color:inherit;text-decoration:underline}
.thread.term .bubble.mine code{background:var(--surface-2);border:1px solid var(--line);text-decoration:none}
.thread.term .bubble .when{display:inline;margin:0 0 0 .6em;font-size:11px;color:var(--mute)}
.speak{display:inline-grid;place-items:center;width:22px;height:22px;margin:-6px 0 -6px 4px;vertical-align:middle;border:0;border-radius:6px;background:none;color:var(--mute);cursor:pointer;opacity:.7}
.speak:hover{opacity:1;color:var(--ink);background:var(--surface-2)}.speak.on{opacity:1;color:var(--accent)}
.thread.term .activity{align-self:stretch;display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:8px;text-align:left;max-width:none;padding:2px 0;font-size:12.5px}
.thread.term .activity .i{justify-self:center}
.thread.term .md code{font-size:1em}.thread.term .mdpre{font-size:12.6px}
.thread.term .md .mdh{font-size:1em;color:var(--accent)}
/* mirrored activity: what your own agent is doing */
.act{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:8px;align-items:start;font-size:12.5px;color:var(--mute);padding:2px 0;font-family:"JetBrains Mono","Geist Mono",ui-monospace,monospace}
.act .aic{text-align:center;color:var(--ink-2)}.act .atx{overflow-wrap:anywhere;white-space:pre-wrap}.act .when{font-size:11px;color:var(--mute)}
.act-cmd .atx{color:var(--ink-2)}.act-cmd .aic{color:var(--green)}
.act-edit .aic{color:var(--amber)}.act-edit .atx{color:var(--ink-2)}
.act-text{color:var(--ink-2)}.act-text .atx{white-space:normal}.act .atx>:first-child{margin-top:0}.act .atx>:last-child{margin-bottom:0}.act-text .aic{color:var(--accent)}
.act-prompt .aic{color:var(--green)}
.act-read .atx{color:var(--mute)}
a.ref{color:var(--accent);text-decoration:none;border-bottom:1px dotted color-mix(in srgb,var(--accent) 45%,transparent)}a.ref:hover{border-bottom-style:solid}a.ref code{color:inherit}
.btw{border:1px dashed color-mix(in srgb,var(--amber) 55%,transparent);border-radius:10px;padding:8px 12px;margin:6px 0;background:color-mix(in srgb,var(--amber) 5%,transparent)}
.btwq{font-weight:600;color:var(--ink)}.btwtag{font-size:10.5px;font-weight:700;color:var(--amber);border:1px solid currentColor;border-radius:5px;padding:0 5px;margin-right:8px;vertical-align:1px}
.btwa{margin-top:4px;color:var(--ink-2)}.btwa p{margin:0 0 4px}
.btwbtn.on{background:color-mix(in srgb,var(--amber) 18%,transparent);color:var(--amber);border-color:var(--amber)}
form.btwmode textarea{border-color:color-mix(in srgb,var(--amber) 60%,transparent)}.btwbar{padding:2px 4px 0}
.act .adesc{display:block;color:var(--ink)}.act .acmd{display:block;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.imgtray{display:flex;gap:8px;flex-wrap:wrap;padding:6px 6px 8px}.imgtray[hidden]{display:none}.imgthumb{position:relative}.imgthumb img{height:64px;max-width:120px;object-fit:cover;border-radius:8px;border:1px solid var(--line);display:block}
.filechip{display:inline-flex;align-items:center;gap:6px;height:40px;max-width:240px;padding:0 12px 0 10px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface-2);font-size:12.5px;color:var(--ink)}.filechip>.i{flex:none;color:var(--accent)}.filechip .fname{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.filechip .fsize{flex:none;color:var(--mute)}
.imgthumb button{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:0;background:var(--ink);color:var(--bg);font-size:13px;line-height:20px;padding:0;cursor:pointer}
form.dropping{outline:2px dashed var(--accent);outline-offset:4px;border-radius:12px}
.lfile{overflow-wrap:anywhere;text-decoration:underline dotted;text-underline-offset:3px}.lfile code{color:inherit}
.attf{display:inline-flex;align-items:center;gap:8px;margin:6px 8px 2px 0;padding:6px 11px 6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);color:var(--ink);text-decoration:none;font-family:"JetBrains Mono","Geist Mono",ui-monospace,monospace;font-size:12.5px;max-width:100%}
.attf:hover{border-color:var(--accent);color:var(--ink)}.attf-i{display:grid;place-items:center;width:22px;height:22px;border-radius:6px;background:var(--accent-soft);color:var(--accent);font-size:13px}
.reader{max-width:780px;margin:0 auto;padding:28px 20px calc(48px + env(safe-area-inset-bottom))}
.rdtop .in{max-width:780px;padding:8px 14px}.rdname{min-width:0;display:flex;flex-direction:column;line-height:1.25}.rdname b{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rdmd{font-size:15.5px;line-height:1.7}.rdmd .mdh{margin:1.4em 0 .5em}.rdmd .mdh:first-child{margin-top:0}.rdmd .mdh1{font-size:1.6em}.rdmd .mdh2{font-size:1.3em;padding-bottom:.25em;border-bottom:1px solid var(--line)}.rdmd .mdh3{font-size:1.1em}
.rdmd p{margin:0 0 .9em}.rdmd ul,.rdmd ol{margin:.3em 0 .9em}.rdmd .mdpre{font-size:13px}.rdmd .mdtable{margin:.6em 0 1em}
.rdmd .mdbox{line-height:1;vertical-align:-2px}
.rdsrc code{background:none;border:0;padding:0;border-radius:0;font:inherit;color:inherit}
.rdsrc{font-variant-ligatures:none;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:12.5px/1.6 "JetBrains Mono","Geist Mono",ui-monospace,monospace;color:var(--ink)}
@media (max-width:640px){.reader{padding:18px 16px calc(40px + env(safe-area-inset-bottom))}.rdmd{font-size:15px}}
.attf-n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.attf-s{color:var(--mute);font-size:11px;white-space:nowrap}
.att{display:inline-block;margin:6px 8px 2px 0;vertical-align:top}.att img{display:block;max-width:min(360px,100%);max-height:240px;border-radius:8px;border:1px solid var(--line);background:var(--surface-2)}
.att:hover img{border-color:var(--accent)}
.attl{display:inline-flex;align-items:center;gap:4px;vertical-align:-2px}.attl svg{flex:none}
/* The image viewer: the image over a dark backdrop, a bar with its name, download and close (clear of a phone's status bar and notch). */
.imgview{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;border-radius:0;background:rgba(6,8,14,.94);color:#e8e9ef;display:none;flex-direction:column}.imgview[open]{display:flex}.imgview:focus{outline:none}.imgview::backdrop{background:transparent}
.ivbar{flex:none;display:flex;align-items:center;gap:6px;padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) 8px max(16px,env(safe-area-inset-left))}
.ivname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:560;color:#c6c8d6}
.ivbar .btn{color:#e8e9ef;width:44px;height:44px;justify-content:center}.ivbar .btn:hover{background:rgba(255,255,255,.1);color:#fff}
.ivbody{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:8px 8px max(16px,env(safe-area-inset-bottom));overflow:auto;touch-action:pinch-zoom pan-x pan-y}
.ivbody img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.act-loop .aic,.act-loop .atx{color:var(--accent)}
.looprow{color:var(--accent);margin-top:2px}.looprow svg{vertical-align:-2px;margin-right:5px}.tloop{display:inline-grid;place-items:center;color:var(--accent)}
.jobrow{color:var(--ink-2);margin-top:2px}.act-job .aic{color:var(--amber)}.act-job .atx{color:var(--ink-2)}
.thread.noact .act,.thread.noact .actgroup{display:none}
.actgroup>summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:8px;align-items:start;font-size:12.5px;color:var(--mute);padding:2px 0;font-family:"JetBrains Mono","Geist Mono",ui-monospace,monospace;border-radius:6px}
.actgroup>summary::-webkit-details-marker{display:none}
.actgroup>summary:hover{color:var(--ink-2)}.actgroup>summary .aic{text-align:center;transition:transform .15s}.actgroup[open]>summary .aic{transform:rotate(90deg)}
.actgroup>summary .atx{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.actgroup>summary .alast{color:var(--mute)}.actgroup[open]>summary .alast{display:none}.actgroup>summary .when{font-size:11px;color:var(--mute)}
.actgroup>.act{padding-left:14px;border-left:1px solid var(--line);margin-left:8px}
.thread.norelay .relay{display:none}
.dlv{font-size:11px;margin-left:6px;white-space:nowrap}.dlv.ok{color:var(--green)}.dlv.wait{opacity:.7}.dlv.off{color:var(--amber)}
.bubble.mine .dlv.ok{color:#fff;opacity:.9}.thread.term .bubble.mine .dlv.ok{color:var(--green)}
.dlv.held{color:var(--amber)}.dlv.cancel{color:var(--mute)}.bubble.mine .dlv.held{color:#fff}.thread.term .bubble.mine .dlv.held{color:var(--amber)}
/* Edit / Cancel on a message no agent has yet: shown on hover (always on touch screens, and while it's on hold) */
.unsend{display:inline-flex;gap:2px;margin:-4px 0 -4px 6px;vertical-align:middle;opacity:0;transition:opacity .12s}
.bubble:hover .unsend,.bubble.held .unsend,.unsend:focus-within,.bubble.picked .unsend{opacity:1}
/* ↑ in an empty message field picks your latest message no agent has yet; its keys show on the buttons */
.bubble.picked{outline:2px solid color-mix(in srgb,var(--accent) 70%,transparent);outline-offset:3px;border-radius:10px}
.thread.term .bubble.mine.picked{outline:0;border-left-color:var(--accent);background:var(--accent-soft)}
.bubble.picked [data-unsend=edit]::after{content:" E";opacity:.7}.bubble.picked [data-unsend=cancel]::after{content:" ⌫";opacity:.7}
@media (hover:none){.unsend{opacity:1}}
.unsend button{border:0;background:none;color:var(--mute);font:inherit;font-size:11px;font-weight:560;padding:3px 7px;border-radius:6px;cursor:pointer}
.unsend button:hover{color:var(--ink);background:var(--surface-2)}
.bubble.mine .unsend button{color:rgba(255,255,255,.85)}.bubble.mine .unsend button:hover{color:#fff;background:rgba(255,255,255,.16)}
.thread.term .bubble.mine .unsend button{color:var(--mute)}.thread.term .bubble.mine .unsend button:hover{color:var(--ink);background:var(--surface-2)}
.thread.term .bubble.mine.held{border-left:2px dashed var(--amber);background:color-mix(in srgb,var(--amber) 7%,transparent)}
.thread.term .bubble.mine.held::before{color:var(--amber)}
.bubble.cancelled{opacity:.6}.bubble.cancelled>:not(.when){text-decoration:line-through}
.thread.term .bubble.mine.cancelled{border-left-color:var(--line-strong);background:none}.thread.term .bubble.mine.cancelled::before{color:var(--mute)}
form.editmode textarea{border-color:color-mix(in srgb,var(--amber) 60%,transparent)}
/* decision log: verdict line, then the subject at full width; long hashes and paths wrap instead of overflowing */
.recc .dsub{display:block;font-size:13.5px;line-height:1.4;margin-top:5px;overflow-wrap:anywhere}.recc .dtxt{margin-top:3px;overflow-wrap:anywhere}
.editbar[hidden]{display:none}.editbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:2px 4px 0;color:var(--amber)}.editbar span{color:var(--ink-2)}.editbar a{font-weight:560}
.bubble.relay{align-self:stretch;max-width:none;background:color-mix(in srgb,var(--accent) 5%,transparent);border-style:dashed}
.bubble.relay .rhd{display:block;font-size:12px;font-weight:600;color:var(--ink-2);margin-bottom:4px}
.thread.term .bubble.relay{border-left:2px dashed var(--line);padding-left:12px;background:none}
.thread.term .bubble.relay::before{content:none}
.fsz{display:inline-flex;gap:0;border-right:1px solid var(--line);padding-right:4px;margin-right:2px}.fsz .btn{font:600 11px/1 "Geist",system-ui,sans-serif;color:var(--ink-3);width:24px}.fsz .btn:last-child{font-size:15px}.fsz .btn:disabled{opacity:.35}.fsz .btn.ghost{color:var(--ink-3)}.fsz .btn.ghost:hover:not(:disabled){color:var(--ink)}
/* the code view (code.ts): an agent's changes, commits and files */
.seg{display:inline-flex;flex:none;gap:2px;padding:2px;border-radius:9px;background:var(--surface-2);border:1px solid var(--line)}
.seg a{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:7px;font-size:12px;font-weight:600;color:var(--mute);text-decoration:none}
.seg a:hover{color:var(--ink)}.seg a.on{background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}
.codemode .fsz,.codemode .ttog{display:none}
.takeswork{display:inline-flex}.takeswork .badge{border:0;cursor:pointer;font:inherit;font-size:11px;font-weight:600}.takeswork .badge:not(.accent){opacity:.75}.takeswork .badge:hover{opacity:1}
.codepane{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;border-top:1px solid var(--line);transition:opacity .15s}
.codepane.loading>.codebody,.codepane.loading>.empty{opacity:.55}
.codepane>.empty{margin:auto}
.codebar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:8px 14px;background:var(--surface);border-bottom:1px solid var(--line);flex-wrap:wrap}
.ctabs{display:flex;gap:2px}
.ctab{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;font-size:13px;font-weight:600;color:var(--mute);text-decoration:none}
.ctab:hover{background:var(--surface-2);color:var(--ink)}.ctab.on{background:var(--accent-soft);color:var(--accent)}
.cwt{max-width:min(360px,60vw);height:28px;padding:0 26px 0 8px;font-size:12.5px;font-weight:600;border-radius:8px}
.crepo{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0;font-size:12.5px;color:var(--ink-2)}.crepo .i{color:var(--mute)}
.codebody{display:flex;flex-direction:column;gap:12px;min-width:0;padding:14px 14px 28px}
.codebody>.empty{padding:40px 10px}
.chead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;font-size:13px}
.crumbs{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;min-width:0}
.crumbs a{display:inline-flex;align-items:center;gap:4px;color:var(--ink-2);text-decoration:none;font-family:"Geist Mono",ui-monospace,monospace;font-size:12.5px}.crumbs a:hover{color:var(--accent)}.crumbs .i{color:var(--mute)}
.cfiles,.flist,.clog{border:1px solid var(--line);border-radius:var(--r-s);background:var(--surface);overflow:hidden}
.cfile,.frow,.crow{display:flex;align-items:center;gap:10px;min-width:0;padding:7px 12px;border-top:1px solid var(--line);font-size:13px;color:var(--ink);text-decoration:none}
.cfile:first-child,.frow:first-child,.crow:first-child{border-top:0}
.cfile:hover,.frow:hover,.crow:hover{background:var(--surface-2)}
.cpath,.frow span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:"Geist Mono",ui-monospace,monospace;font-size:12.5px}
.frow .i{flex:none;color:var(--mute)}.frow:hover .i{color:var(--accent)}
.ck{flex:none;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:5px;font:700 10.5px/1 "Geist Mono",ui-monospace,monospace;background:var(--surface-3);color:var(--ink-2)}
.ck-new,.ck-added{background:var(--green-soft);color:var(--green)}.ck-deleted{background:var(--red-soft);color:var(--red)}.ck-modified{background:var(--amber-soft);color:var(--amber)}.ck-renamed{background:var(--accent-soft);color:var(--accent)}
.cnum{flex:none;display:inline-flex;gap:6px;font:500 12px "Geist Mono",ui-monospace,monospace}.cadd{color:var(--green)}.cdel{color:var(--red)}
.csha{flex:none;font-size:12px;color:var(--accent)}.csub{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cwho{flex:none}
.cmeta h3{margin:0 0 6px;font-size:15px;line-height:1.4;overflow-wrap:anywhere}.cmsg{margin:0 0 8px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12.5px;color:var(--ink-2)}
.dfile{min-width:0;border:1px solid var(--line);border-radius:var(--r-s);background:var(--surface);overflow:hidden;scroll-margin-top:60px}
.dfile.hit{border-color:var(--accent)}
.dfile>summary{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:7px 12px;background:var(--surface-2);cursor:pointer;list-style:none;font-size:12.5px}
.dfile>summary::-webkit-details-marker{display:none}
.dfile .aic{font-size:10px;color:var(--mute);transition:transform .15s}.dfile[open]>summary .aic{transform:rotate(90deg)}
.dpath{min-width:0;overflow-wrap:anywhere;font-family:"Geist Mono",ui-monospace,monospace;font-weight:600;color:var(--ink);text-decoration:none}.dpath:hover{color:var(--accent);text-decoration:underline}
.dscroll{overflow-x:auto;border-top:1px solid var(--line)}
.fview{border:1px solid var(--line);border-radius:var(--r-s);background:var(--surface)}
.dnone,.ctrunc{padding:8px 12px}
table.diff{width:100%;border-collapse:collapse;font:12.5px/1.6 "JetBrains Mono","Geist Mono",ui-monospace,Menlo,monospace;tab-size:4}
table.diff td{padding:0;vertical-align:top}
table.diff .ln{width:1%;min-width:3em;padding:0 8px;text-align:right;white-space:nowrap;font-size:11.5px;color:var(--mute);opacity:.75;user-select:none}
table.diff .ln a{color:inherit;text-decoration:none}table.diff .ln a:hover{color:var(--accent)}
table.diff .dc{white-space:pre;padding-right:18px}table.code .dc{padding-left:10px}
table.diff tr{scroll-margin-top:60px}
.dmk{display:inline-block;width:1.5em;text-align:center;color:var(--mute);user-select:none}
tr.da{background:var(--green-soft)}tr.da .dmk{color:var(--green)}tr.dd{background:var(--red-soft)}tr.dd .dmk{color:var(--red)}
tr.dh td{padding-top:4px;padding-bottom:4px;background:var(--accent-soft);color:var(--accent)}tr.dh .dc{padding-left:10px}
tr.hit,tr.hit td{background:var(--amber-soft)}
.hk{color:var(--accent)}.hs{color:var(--green)}.hn{color:var(--amber)}.hc{color:var(--mute);font-style:italic}
.csearch{display:flex;align-items:center;gap:8px;padding:0 4px 0 12px;border:1px solid var(--line-strong);border-radius:var(--r-s);background:var(--surface)}
.csearch:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}.csearch>.i{flex:none;color:var(--mute)}
.csearch input[type=search]{flex:1;min-width:0;height:38px;border:0;background:none;box-shadow:none;outline:0;padding:0;font-size:14px}
.csearch .seg{margin:4px 0}
.flist mark,.sline mark{background:var(--amber-soft);color:inherit;border-radius:3px;box-shadow:0 0 0 1px var(--amber-soft)}
#sresults{display:flex;flex-direction:column;gap:10px;min-width:0}
.sfile{display:flex;align-items:center;gap:8px;padding:7px 12px;background:var(--surface-2);font:600 12.5px "Geist Mono",ui-monospace,monospace;color:var(--ink);text-decoration:none;min-width:0}
.sfile span:not(.badge){flex:1;min-width:0;overflow-wrap:anywhere}.sfile .i{flex:none;color:var(--mute)}.sfile:hover{color:var(--accent)}
.sline{display:flex;gap:10px;padding:3px 12px;border-top:1px solid var(--line);font:12.5px/1.6 "JetBrains Mono","Geist Mono",ui-monospace,monospace;color:var(--ink-2);text-decoration:none;min-width:0}
.sline:hover{background:var(--surface-2);color:var(--ink)}
.sline .ln{flex:none;min-width:3em;text-align:right;color:var(--mute);font-size:11.5px}
.stext{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:pre}
@media (max-width:640px){.seg span{display:none}.codebar{padding:8px 10px}.codebar .crepo{order:3;flex-basis:100%}.codebody{padding:10px 10px 24px}.cwho{display:none}table.diff{font-size:11.5px}}
.ttog{color:var(--ink-3)}.ttog .i{display:block}.ttog .when-off{display:none}.ttog:not(.on) .when-on{display:none}.ttog:not(.on) .when-off{display:block}.ttog:not(.on){opacity:.7}
[data-acttoggle].on,[data-relaytoggle].on{background:var(--accent-soft);color:var(--accent)}
.viewtoggle{display:inline-flex;border:1px solid var(--line-strong);border-radius:8px;overflow:hidden}
.viewtoggle button{font:inherit;font-size:12px;padding:3px 10px;border:0;background:transparent;color:var(--mute);cursor:pointer}
.viewtoggle button.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
.chatbox{flex:none;border-top:1px solid var(--line);padding:12px 14px;display:flex;flex-direction:column;gap:8px;background:var(--surface)}
.chatbox textarea{min-height:48px;max-height:30vh;font:13.5px/1.55 "JetBrains Mono","Geist Mono",ui-monospace,Menlo,monospace;resize:none}
.updatebar{flex:none;display:flex;align-items:center;gap:8px;padding:4px 4px 4px 12px;border:1px solid color-mix(in srgb,var(--amber) 40%,transparent);border-radius:10px;background:var(--amber-soft);font-size:12.5px;color:var(--ink-2)}
.updatebar>.grow{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.updatebar b{color:var(--ink);font-weight:600}.updatebar code{font-size:11.5px}.updatebar svg{flex:none;color:var(--amber)}
.chatbox .chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.chatbox .chip{white-space:nowrap}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{font-size:12px;padding:3px 10px;border-radius:99px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink-2);cursor:pointer}
.chip:hover{border-color:color-mix(in srgb,var(--accent) 50%,transparent);color:var(--accent)}
/* the global menu as an icon rail in the Agents view (expandable, remembered per browser) */
.shell.wide{grid-template-columns:auto minmax(0,1fr)}
.shell.wide>.side{width:232px}
.railtoggle{display:flex;align-items:center;justify-content:center;width:36px;height:28px;margin:0 0 6px 6px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--mute);cursor:pointer}
.railtoggle:hover{color:var(--ink)}
.side.rail{width:56px!important;overflow-x:hidden}
.side.rail .nav a{justify-content:center;padding:8px 0;gap:0}
.side.rail .nav a>span,.side.rail .nav a>.n,.side.rail .nav .label,.side.rail .people,.side.rail .nav a>.i+.i{display:none}
.side.rail .nav a{position:relative}
.side.rail .nav a .n{display:flex!important;position:absolute;top:6px;left:calc(50% + 5px);gap:2px;margin:0}.side.rail .nav a .n .badge{width:8px;height:8px;min-width:0;padding:0;border-radius:50%;font-size:0;background:currentColor;box-shadow:0 0 0 2px var(--bg)}.side.rail .nav a .n .badge .i{display:none}
.side.rail .nav{display:flex;flex-direction:column;gap:2px}
.side.rail .nav .label+a{margin-top:10px}
.awaybar{padding:10px 16px;flex:none}
.awaybar.on{border-color:transparent;background:linear-gradient(var(--surface),var(--surface)) padding-box,linear-gradient(135deg,#6a4dff,#ff6fb0) border-box;border:1px solid transparent}
.awaybar .stack{max-height:40vh;overflow-y:auto}
@media (max-width:1100px){.agents{grid-template-columns:260px minmax(0,1fr)}}
@media (max-width:820px){
  .shell.wide{height:auto;overflow:visible}
  .agents{grid-template-columns:1fr}
  .alist{max-height:40vh}
  .chat{height:75dvh}
}

/* avatars */
.av{display:inline-grid;place-items:center;flex:none;border-radius:50%;font-weight:650;color:#fff;background:linear-gradient(135deg,hsl(var(--h) 75% 62%),hsl(calc(var(--h) + 40) 70% 48%));box-shadow:inset 0 0 0 1px rgba(255,255,255,.15)}
.av-agent{border-radius:30%;letter-spacing:-.02em}.av-s.av-agent{font-size:9.5px}.av-m.av-agent{font-size:13px}
.an{color:hsl(var(--h) 62% var(--an-l));font-weight:700}a.an{text-decoration:none}a.an:hover{text-decoration:underline;text-underline-offset:2px}
.av-s{width:22px;height:22px;font-size:11px}.av-m{width:36px;height:36px;font-size:15px}.av-l{width:44px;height:44px;font-size:18px}
.avs{display:flex}.avs .av{box-shadow:0 0 0 2px var(--surface)}.avs .av+.av{margin-left:-6px}

/* proposals */
.prop{padding:16px 18px;border-top:1px solid var(--line)}.prop:first-child{border-top:0}
.prop .q{font-size:15.5px;font-weight:600;letter-spacing:-.01em;margin:4px 0 10px}
.opts{display:flex;flex-direction:column;gap:6px;margin:10px 0}
.opt{position:relative;display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);overflow:hidden;font-size:13.5px}
.opt .fill{position:absolute;inset:0 auto 0 0;background:var(--accent-soft);transition:width .6s cubic-bezier(.2,.8,.2,1)}
.opt.win{border-color:color-mix(in srgb,var(--green) 50%,transparent)}.opt.win .fill{background:var(--green-soft)}
.opt>*:not(.fill){position:relative}.opt .cnt{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--mute);font-size:12.5px}
.opt.mine{border-color:color-mix(in srgb,var(--accent) 55%,transparent)}
button.opt{width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;transition:border-color .15s,transform .08s}
button.opt:hover{border-color:color-mix(in srgb,var(--accent) 55%,transparent)}button.opt:active{transform:translateY(1px)}
button.opt .pick{width:16px;height:16px;border-radius:50%;border:1.5px solid var(--line-strong);display:grid;place-items:center;flex:none}
button.opt.mine .pick{background:var(--grad);border-color:transparent;color:#fff}
.choices{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.outcome{display:inline-flex;align-items:center;gap:6px;background:var(--green-soft);color:var(--green);font-weight:600;padding:3px 10px;border-radius:99px;font-size:12.5px}
.comment{font-size:13px;color:var(--ink-2);display:flex;gap:8px;align-items:center;margin-top:6px}

/* locks */
.recc{padding:12px 18px;border-top:1px solid var(--line)}.recc .res{font-family:"Geist Mono",monospace;font-size:13px;font-weight:600;color:var(--ink);overflow-wrap:anywhere}.recc.old{opacity:.55}.recc .md p{margin:0}
.logsearch{padding:0 18px 10px}.logsearch input{height:30px;font-size:12.5px}
.lockc{padding:14px 18px;border-top:1px solid var(--line)}.lockc:first-child{border-top:0}
.lockc .res{font-family:"Geist Mono",monospace;font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:8px;color:var(--amber)}
.lockc.mine .res{color:var(--accent)}
.prog{height:5px;border-radius:99px;background:var(--surface-3);overflow:hidden;margin:10px 0 6px}
.prog>span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--amber),color-mix(in srgb,var(--amber) 60%,var(--red)))}
.lockc.mine .prog>span{background:var(--grad)}

/* project panel */
.rules{margin:0;padding:0;list-style:none;counter-reset:r}
.rules li{counter-increment:r;display:flex;gap:10px;padding:7px 0;border-top:1px dashed var(--line);font-size:13.5px}.rules li:first-child{border-top:0}
.rules li::before{content:counter(r);flex:none;width:20px;height:20px;border-radius:6px;display:grid;place-items:center;font-size:11px;font-weight:650;background:var(--accent-soft);color:var(--accent)}
.member{display:flex;align-items:center;gap:10px;padding:6px 0}
.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13px}.kv dt{color:var(--mute)}.kv dd{margin:0}

/* hero for "needs you" */
.hero{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:650;text-transform:uppercase;letter-spacing:.09em;color:var(--accent);padding:14px 18px 0}

/* dialogs & toast */
dialog{border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);border-radius:18px;padding:0;width:min(560px,calc(100vw - 32px));box-shadow:var(--shadow-lg)}
dialog::backdrop{background:rgba(8,8,14,.45);backdrop-filter:blur(3px)}
/* ↓ back to the latest in a scrolled-up chat */
.tojump{position:fixed;z-index:30;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--line-strong);background:color-mix(in srgb,var(--surface) 92%,transparent);color:var(--ink-2);box-shadow:var(--shadow-lg);cursor:pointer;opacity:0;transform:translateY(8px) scale(.9);pointer-events:none;transition:opacity .16s,transform .16s,color .16s;backdrop-filter:blur(8px)}
.tojump svg{transform:rotate(90deg)}.tojump.on{opacity:1;transform:none;pointer-events:auto}.tojump:hover{color:var(--accent)}
.tojump .jdot{position:absolute;top:2px;right:2px;width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 2px var(--surface);transform:scale(0);transition:transform .16s}.tojump.new .jdot{transform:scale(1)}
/* ⌘K: find an agent, project or page */
.kpal{width:min(620px,calc(100vw - 24px));margin-top:12vh;border-radius:16px;overflow:hidden}
.kpal[open]{display:flex;flex-direction:column;max-height:min(560px,76vh)}
.kin{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line);color:var(--mute)}
.kin input,.kin input:focus{flex:1;min-width:0;height:auto;border:0;outline:0;box-shadow:none;background:none;color:var(--ink);font:inherit;font-size:16px;padding:2px 8px}
.klist{overflow:auto;padding:6px;flex:1 1 auto;min-height:0}
.kgrp{padding:10px 10px 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.kit{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;color:var(--ink);text-decoration:none;cursor:pointer}
.kit:hover{text-decoration:none}.kit.on{background:var(--accent-soft)}.kit.on .kn{color:var(--accent)}
.kit .kic{display:flex;align-items:center;gap:6px;flex:none;color:var(--ink-2)}.kit .kic .th{width:22px;text-align:center;font-weight:600;color:var(--mute)}
.kit .kn{font-weight:560;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kit .ks{margin-left:auto;padding-left:12px;font-size:12px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.kit.gone .kn{color:var(--ink-2)}.kit .kw{flex:none;min-width:30px;text-align:right;font-size:11.5px;color:var(--mute);font-variant-numeric:tabular-nums}.kit .kic .tdot{position:static;flex:none}
.kit mark{background:none;color:var(--accent);font-weight:700}
.kempty{padding:28px 12px;text-align:center;color:var(--mute)}
.kft{display:flex;gap:16px;padding:9px 16px;border-top:1px solid var(--line);font-size:12px;color:var(--mute)}.kft .kbd{margin-right:3px}
@media (max-width:640px){.kpal{margin-top:8px;max-height:calc(100dvh - 16px)}.kft,.kin .kbd{display:none}}

dialog[open]{animation:pop .18s cubic-bezier(.2,.9,.3,1.2)}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.98)}}
dialog .hd{display:flex;align-items:center;gap:10px;padding:18px 20px 0}dialog .hd h2{font-size:17px}
dialog .bd{padding:16px 20px 20px}dialog .ft{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:0 20px 20px}
/* A dialog that is mostly one text to read and edit (project rules): large, the text gets the room. */
dialog.editor{width:min(1040px,calc(100vw - 32px));height:min(860px,calc(100vh - 48px))}
dialog.editor[open]{display:flex;flex-direction:column}dialog.editor form{flex:1;min-height:0;display:flex;flex-direction:column}
dialog.editor .bd{flex:1;min-height:0;display:flex;flex-direction:column;gap:14px;overflow:auto}
dialog.editor .ed-meta{gap:12px;align-items:flex-end;flex-wrap:wrap}dialog.editor .ed-meta .field{min-width:240px}
dialog.editor .ed-rules{flex:1;min-height:220px}dialog.editor .ed-rules>.row{gap:8px;align-items:baseline;color:var(--ink-2)}
dialog.editor .ed-rules textarea{flex:1;min-height:0;resize:none;padding:14px 16px;font:13.5px/1.75 "JetBrains Mono","Geist Mono",ui-monospace,Menlo,monospace;tab-size:2;white-space:pre-wrap}
.ed-access>summary{list-style:none;display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--ink-2);padding:2px 0}.ed-access>summary::-webkit-details-marker{display:none}.ed-access[open]>summary{margin-bottom:10px}.ed-access[open]>summary .tcaret{transform:rotate(90deg)}
dialog.editor .ft{padding-top:14px;border-top:1px solid var(--line)}
.toasts{position:fixed;right:20px;bottom:20px;z-index:50;display:flex;flex-direction:column;gap:8px;max-width:min(420px,calc(100vw - 40px))}
.toast{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:var(--surface);border:1px solid var(--line-strong);box-shadow:var(--shadow-lg);font-size:13.5px;animation:pop .2s}
.toast .i{margin-top:2px;color:var(--green)}.toast.err .i{color:var(--red)}
.toast.out{opacity:0;transform:translateY(6px);transition:all .25s}

/* code */
.code{position:relative;margin:8px 0}
.code pre{margin:0;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:12px 90px 12px 14px;overflow-x:auto;font-size:12.5px;line-height:1.6}
.code .copy{position:absolute;top:8px;right:8px;background:var(--surface)}

/* standalone pages (login, join, docs) */
.solo{min-height:calc(100vh - 60px);display:grid;grid-template-columns:minmax(0,1fr);place-items:center;padding:32px 16px}.solo .card,.solo .bd>*{min-width:0}
.solo .card{width:min(460px,100%)}
.solo .card.wide{width:min(680px,100%)}
.isleaving>:not(.leaving){display:none}
.leaving[hidden]{display:none}.leaving{display:grid;justify-items:center;gap:10px;text-align:center;padding:28px 0 8px;animation:pop .25s ease-out}
.leaving p{margin:0;max-width:300px}
.spinner{width:26px;height:26px;border-radius:50%;border:2.5px solid var(--line-strong);border-top-color:var(--accent);animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.headline{font-size:34px;font-weight:700;letter-spacing:-.035em;line-height:1.1;background:linear-gradient(180deg,var(--ink),color-mix(in srgb,var(--ink) 60%,var(--accent)));-webkit-background-clip:text;background-clip:text;color:transparent}
.docs{max-width:820px;margin:0 auto;padding:40px 20px 96px}
.docs section{margin-top:28px}.docs h2{font-size:20px;margin-bottom:10px}.docs li{margin:4px 0}.docs ul,.docs ol{padding-left:20px}
.steps{counter-reset:s;list-style:none;padding:0!important}
.steps li{counter-increment:s;position:relative;padding-left:44px;margin:16px 0!important}
.steps li::before{content:counter(s);position:absolute;left:0;top:0;width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:var(--grad);color:#fff;font-weight:650;font-size:13px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.feature{padding:16px}.feature .ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);margin-bottom:10px}
.feature p{color:var(--mute);font-size:13.5px;margin:4px 0 0}
details>summary{cursor:pointer;list-style:none}details>summary::-webkit-details-marker{display:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (max-width:640px){.top .in{padding:10px 14px;gap:8px}.me b,.me .muted,.me .badge,.top .btn.ghost.sm:not(.icon) .lbl{display:none}.brand span{display:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

/* ---- IDE layout: tree | pane | drawer ---- */
body:has(.ide) .top .in{max-width:none;padding:8px 14px}
.ide{--tw:272px;--dw:372px;display:grid;grid-template-columns:var(--tw) minmax(0,1fr) var(--dw);height:calc(var(--vvh,100dvh) - var(--toph,0px));overflow:hidden}
.ide:not(.feedmode),.ide.nodrawer{--dw:0px}.ide.notree{--tw:0px}
.ide.notree>.tree,.ide.nodrawer>.drawer{display:none}
.tree{grid-column:1;min-height:0;display:flex;flex-direction:column;border-right:1px solid var(--line);background:color-mix(in srgb,var(--surface) 55%,transparent);font-size:13px}
.ttop{padding:10px 8px 2px;display:flex;flex-direction:column;gap:1px}
.tl{display:flex;align-items:center;gap:9px;width:100%;padding:6px 10px;border:0;border-radius:8px;background:none;color:var(--ink-2);font:inherit;font-weight:560;text-align:left;text-decoration:none;cursor:pointer}
.tl:hover{background:var(--surface-2);color:var(--ink)}.tl.on{background:var(--accent-soft);color:var(--accent)}.tl .badge{margin-left:auto}
.tl.warn{color:var(--amber)}.tl.away{font-size:12.5px;color:var(--mute)}.tl.away.on{color:var(--amber)}
.tsec{display:flex;align-items:center;justify-content:space-between;padding:12px 8px 4px 18px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.tbody{flex:1;min-height:0;overflow:auto;padding:0 8px 10px}
.tp{margin:1px 0}.tp>summary{list-style:none;display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:8px;cursor:pointer;user-select:none}
.tp>summary::-webkit-details-marker,.toff>summary::-webkit-details-marker{display:none}
.tp>summary:hover{background:var(--surface-2)}
.tcaret{display:inline-grid;place-items:center;width:12px;color:var(--mute);transition:transform .15s}.tp[open]>summary .tcaret{transform:rotate(90deg)}
.tpn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650;color:var(--ink);text-decoration:none}.tpn:hover{color:var(--accent)}.tpn.on{color:var(--accent)}
.th{color:var(--mute);font-weight:500;margin-right:3px}.tbadges{display:flex;gap:4px}.tbadges .badge{font-size:10px;padding:0 5px}
.ta{position:relative;display:flex;align-items:center;gap:7px;padding:4px 8px 4px 24px;border-radius:7px;color:var(--ink-2);text-decoration:none}
.ta:hover{background:var(--surface-2)}.ta.on{background:var(--surface-2);box-shadow:inset 2px 0 0 var(--accent)}.ta.gone{opacity:.5}
.ta .av{width:19px;height:19px;font-size:8.5px}
.tn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:"JetBrains Mono","Geist Mono",ui-monospace,monospace;font-size:12.5px}.tn .an{font-weight:600}
.tb{display:flex;align-items:center;gap:3px;font-size:11px}
.tw{display:grid;place-items:center;width:15px;height:15px;border-radius:50%;background:var(--red);color:#fff;font-size:10px;font-weight:800}
.tt{min-width:22px;text-align:right;font-size:10.5px;color:var(--mute);font-variant-numeric:tabular-nums}.ta.on .tt,.ta:hover .tt{color:var(--ink-2)}
.tcx{font-size:9px;font-weight:700;color:var(--mute);border:1px solid var(--line);border-radius:4px;padding:0 3px}
.tctx{font-size:10px;font-weight:650;font-variant-numeric:tabular-nums;color:var(--amber)}.tctx.red{color:var(--red)}
.ctxb{font-variant-numeric:tabular-nums}.ctxb:not(.amber):not(.red){background:var(--surface-2);color:var(--ink-2)}
.compacting{display:inline-flex;gap:4px;align-items:center;margin:0}.jobrow form{display:inline;margin:0}.jobrow .jobx{opacity:0;transition:opacity .12s}.jobrow:hover .jobx,.jobrow .jobx:focus{opacity:1}@media (hover:none){.jobrow .jobx{opacity:.7}}
.meta-row .btn.compactbtn,.meta-row .btn.scrbtn,.meta-row .compacting .btn{padding:1px 8px;font-size:11.5px;font-weight:500;color:var(--mute)}.meta-row .btn.compactbtn:hover,.meta-row .btn.scrbtn:hover,.meta-row .compacting .btn:hover{color:var(--ink)}
.tdot{position:absolute;left:11px;width:6px;height:6px;border-radius:50%;background:var(--mute)}
.tdot.idle{background:var(--green)}.tdot.work{background:var(--accent);animation:pulse 1.8s infinite}.tdot.wait{background:var(--red)}.tdot.off{background:transparent;box-shadow:inset 0 0 0 1px var(--mute)}
.toff>summary{list-style:none;padding:3px 8px 3px 24px;font-size:11.5px;color:var(--mute);cursor:pointer}.toff>summary:hover{color:var(--ink-2)}
.tempty{padding:3px 8px 6px 26px;margin:0;color:var(--mute);font-size:12px}
.tfoot{border-top:1px solid var(--line);padding:6px 8px 8px;display:flex;flex-direction:column;gap:4px}
.tlinks{gap:2px}.tlinks a{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 8px;border-radius:8px;color:var(--mute);font-size:12.5px;font-weight:540;text-decoration:none}@media (pointer:coarse){.tlinks a,.tlinks .btn{height:40px}.tlinks .btn{width:40px}}.tlinks a:hover,.tlinks a.on{background:var(--surface-2);color:var(--ink)}
.pane{grid-column:2;min-width:0;min-height:0;overflow:auto}
.pane-in{max-width:1180px;margin:0 auto;padding:18px 24px 40px;display:flex;flex-direction:column;gap:16px}
.chatpane{display:flex;flex-direction:column;gap:10px;padding:12px 16px 14px;overflow:hidden}
.chatpane .agents{display:flex;flex:1;min-height:0}.chatpane .chat{flex:1;min-width:0;height:auto}
.chatpane>.card{flex:none}.mtree{display:none}.trailback{flex:none}.trailback[hidden]{display:none}
/* Phones: the agent chat works like a messaging app. One slim header (the list button opens the agents), the thread
   edge to edge with messages settling at the bottom, and a composer that grows from one line. */
@media (max-width:640px){
  body:has(.ide.chatmode) .top{display:none}
  /* Pinned to what's visible (above the keyboard), with nothing behind it to scroll: iOS otherwise also scrolls the
     page to reveal the field, pushing the composer up out of sight. */
  html:has(.ide.chatmode),body:has(.ide.chatmode){height:100%;min-height:0;overflow:hidden;overscroll-behavior:none}
  .ide.chatmode{position:fixed;left:0;right:0;top:var(--vvt,0px);height:var(--vvh,100dvh)}
  .chatmode .chatpane{padding:0;gap:0}
  .chatmode .chatpane>.updatebar{margin:6px 8px 0}
  .chatmode .chat{border:0;border-radius:0;box-shadow:none;background:var(--bg)}
  .chatmode .chat>.hd{flex-wrap:nowrap;align-items:center;gap:8px;padding:8px 10px 8px 4px;padding-top:max(8px,env(safe-area-inset-top));background:var(--surface)}
  .chatmode .mtree{display:inline-flex;flex:none}.chatmode>.tree{padding-top:env(safe-area-inset-top)}
  .chatmode .chat>.hd .av-m{width:32px;height:32px;font-size:12px}
  .chatmode .chat>.hd h2{font-size:15px}
  .chatmode .chat>.hd .fsz,.chatmode .chat>.hd .renamebtn,.chatmode .chat>.hd .client,.chatmode .chat>.hd .meta-row>.badge{display:none}
  .chatmode .chat>.hd .compactbtn{display:none}
  .chatmode .chat>.hd .meta-row>.ctxb.amber,.chatmode .chat>.hd .meta-row>.ctxb.red,.chatmode .chat>.hd .ctxb.amber~.compactbtn,.chatmode .chat>.hd .ctxb.red~.compactbtn{display:inline-flex;flex:none}
  .chatmode .chat>.hd .meta-row{margin-top:0;font-size:12px;flex-wrap:nowrap;white-space:nowrap;overflow:hidden}.chatmode .chat>.hd .meta-row>span{overflow:hidden;text-overflow:ellipsis}
  .chatmode .thread.term{padding:12px 14px 6px;font-size:13px}.chatmode .thread::before{content:"";margin-top:auto}
  .chatmode .chatbox{border-top:1px solid var(--line);padding:8px 8px max(8px,calc(env(safe-area-inset-bottom) - 18px));gap:6px;background:var(--surface)}
  .chatmode .chatbox .chips{display:none}
  .chatmode .chatbox .row{gap:6px;align-items:flex-end}
  .chatmode .chatbox textarea{min-height:40px;height:40px;padding:8px 14px;border-radius:20px;line-height:1.4}
  .chatmode .chatbox .btn{height:40px!important}.chatmode .chatbox [data-imgbtn]{width:36px;padding:0}
  .chatmode .chatbox .btn.primary{width:40px;padding:0;border-radius:50%;justify-content:center}
  .chatmode .chatbox .btwbtn{padding:0 8px}
}
.drawer{grid-column:3;min-height:0;overflow:auto;border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:14px;background:color-mix(in srgb,var(--surface) 35%,transparent)}
.treebtn{margin-left:-4px}
@media (max-width:1180px){.ide.feedmode:not(.nodrawer){--dw:320px}}
/* A ticket (ticketview.ts): its card in the dock, and its own view. */
.k-ticket .askk{background:var(--green-soft);color:var(--green);font-family:"Geist Mono",ui-monospace,monospace}
.tkfacts{display:flex;flex-wrap:wrap;gap:4px 6px;margin:-4px 0 4px}.tkfacts span{font-size:11.5px;color:var(--ink-2);padding:2px 8px;border-radius:999px;background:var(--surface)}
.tknew{display:flex;width:fit-content;text-decoration:none;align-items:center;gap:6px;margin:8px 0 0;font-size:12.5px;color:var(--accent);font-weight:600}
.tkrec{font-size:12px;color:var(--mute)}.tkrec b{color:var(--ink);font-weight:650}
.k-ticket .askact{align-items:center}
.rvopen{margin:-4px -6px -4px 0}.rvfull .ask{padding:18px 20px;background:var(--surface);font-size:14px}.rvfull .rvsum{font-size:14.5px}.rvfull .rvc textarea{min-height:160px}
.tkpane{max-width:1160px;gap:0;padding-bottom:96px;container:tk/inline-size}
.tkcrumb{display:flex;align-items:center;gap:8px;min-height:34px;font-size:13px;color:var(--mute)}
.tkback{margin-left:-8px}.tksep{color:var(--line-strong);font-size:15px}
.tkti,.tkpi{flex:none;display:block}
.tkkeyl{display:inline-flex;align-items:center;gap:5px;font:600 13.5px Geist,ui-sans-serif,system-ui,sans-serif;color:var(--ink-2);text-decoration:none;letter-spacing:.01em}.tkkeyl .i{color:var(--mute);opacity:.7}.tkkeyl:hover{color:var(--accent);text-decoration:none}
.tkfrom{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--mute)}.tkfrom a{color:var(--ink);font-weight:600}
.tkhead h1{margin:10px 0 22px;font-size:27px;font-weight:650;line-height:1.25;letter-spacing:-.022em;text-wrap:balance;overflow-wrap:anywhere;color:var(--ink)}
.tkgrid{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}
.tkmain{display:flex;flex-direction:column;gap:18px;min-width:0}
.tkside{display:flex;flex-direction:column;gap:12px;min-width:0}
@container tk (min-width:880px){.tkgrid{grid-template-columns:minmax(0,1fr) 300px;gap:28px;align-items:start}.tkside{grid-column:2;grid-row:1;position:sticky;top:12px}.tkmain{grid-column:1;grid-row:1}}
.tkbox{border:1px solid var(--line);border-radius:var(--r);background:var(--surface);padding:14px 16px}
.tkboxh{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.tkboxt{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:13px;font-weight:650;color:var(--ink)}
.tkdl{margin:0;display:flex;flex-direction:column;gap:2px}
.tkrow{display:grid;grid-template-columns:96px minmax(0,1fr);align-items:center;gap:10px;min-height:32px}
.tkrow dt{font-size:12.5px;font-weight:550;color:var(--mute)}
.tkrow dd{margin:0;min-width:0;font-size:13.5px;color:var(--ink)}
@container tk (max-width:879px){.tkdl{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}.tkrow{grid-template-columns:minmax(0,1fr);gap:3px;min-height:0}.tkrow dt{font-size:11.5px}}
.tkval,.tkwho{display:inline-flex;align-items:center;gap:8px;min-width:0}.tkwho>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tkwho.none{color:var(--mute)}
.tkrepos{display:flex;flex-wrap:wrap;gap:4px}.tkrepos code{font-size:12px;padding:2px 7px;border-radius:6px;background:var(--surface-2);border:1px solid var(--line)}
.tkmrl{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:550;color:var(--ink-2);padding:2px 8px;border-radius:6px;background:var(--surface-2);text-decoration:none}.tkmrl:hover{color:var(--accent);text-decoration:none}
.tklz{display:inline-flex;align-items:center;flex:none;height:20px;padding:0 7px;border-radius:4px;font-size:11px;font-weight:700;line-height:1;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;background:var(--surface-3);color:var(--ink-2)}
.tklz.ok{background:var(--green-soft);color:var(--green)}.tklz.bad{background:var(--red-soft);color:var(--red)}.tklz.mid{background:color-mix(in srgb,var(--accent-2) 14%,transparent);color:color-mix(in srgb,var(--accent-2) 75%,var(--ink))}
.tklz.big{height:28px;padding:0 11px;font-size:12px;border-radius:6px}
.tknav{position:sticky;top:0;z-index:5;display:flex;align-items:flex-end;gap:2px;overflow-x:auto;scrollbar-width:none;margin:2px 0 -6px;padding:4px 0 0;background:var(--bg);border-bottom:1px solid var(--line)}
.tknav::-webkit-scrollbar{display:none}
.tknav a[data-tab]{position:relative;flex:none;display:inline-flex;align-items:center;gap:7px;padding:9px 14px 11px;margin-bottom:-1px;border-bottom:2px solid transparent;font-size:14px;font-weight:600;color:var(--mute);text-decoration:none;transition:color .15s,border-color .15s}.tknav a[data-tab]:hover{color:var(--ink);border-bottom-color:var(--line-strong);text-decoration:none}
.tknav a[data-tab].on{color:var(--ink);border-bottom-color:var(--accent)}
.tknav a[data-tab]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;border-radius:6px}
.tkdot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}.tkdot[hidden]{display:none}
.tkgo{flex:none;display:inline-flex;align-items:center;gap:6px;margin:0 0 7px;padding:5px 12px;border-radius:8px;font-size:13px;font-weight:600;color:var(--accent);background:var(--accent-soft);text-decoration:none}.tkgo:hover{text-decoration:none;filter:brightness(1.08)}
.tkpane .tkpanel{display:none}.tkpane .tkpanel.on{display:block;animation:tkin .18s ease-out}.tkpane .tksheet.tkpanel.on{display:flex}
@keyframes tkin{from{opacity:.4;transform:translateY(3px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.tkpanel{animation:none!important}}
.tkpane section,.tkpane .tkpanel,.tkpane #tkdecision,.tkpane #rvdecision,.rvfind{scroll-margin-top:60px}
.tklz.warn{background:var(--amber-soft);color:var(--amber)}
.meta-row .btn.scrbtn{flex:none;gap:4px}
.scrdlg{width:min(96vw,max(720px,calc(var(--cols,110) * var(--cw,7.55px) + 50px)));max-width:none;height:fit-content;max-height:94vh;padding:0;display:none;flex-direction:column;overflow:hidden}.scrdlg[open]{display:flex}.scrdlg:focus{outline:none}
.scrdlg .hd{display:flex;align-items:center;gap:10px;padding:12px 14px 12px 18px;border-bottom:1px solid var(--line)}.scrdlg .hd h2{margin:0;font-size:15px}
.subs{flex:none;margin:10px 14px 0;border:1px solid var(--line);border-radius:12px;background:var(--surface);max-height:42vh;overflow:auto}.subs[hidden]{display:none}
.subhd{display:flex;align-items:center;gap:7px;padding:8px 12px;font-size:12.5px;position:sticky;top:0;background:var(--surface);z-index:1;cursor:pointer;list-style:none;min-width:0;border-radius:12px}.subhd::-webkit-details-marker{display:none}.subhd:hover{background:var(--surface-2)}.subhd .muted{margin-left:2px;flex:none}.subbox[open]>.subhd{border-bottom:1px solid var(--line);border-radius:12px 12px 0 0}
.subnow{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink-2)}.subbox[open] .subhd .subspin,.subbox[open] .subnow{display:none}.subcaret{margin-left:auto;flex:none;display:grid;color:var(--mute);transition:transform .15s}.subbox[open] .subcaret{transform:rotate(90deg)}
.subag{border-bottom:1px solid var(--line)}.subag:last-child{border-bottom:0}
.subag>summary,.submore>summary{display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;list-style:none;font-size:13px;min-width:0}.subag>summary::-webkit-details-marker,.submore>summary::-webkit-details-marker{display:none}
.subag>summary:hover,.submore>summary:hover{background:var(--surface-2)}
.subspin{flex:none;width:11px;height:11px;border-radius:50%;border:2px solid var(--accent-soft);border-top-color:var(--accent);animation:spin .9s linear infinite}
.subend{flex:none;display:grid;place-items:center;width:15px;height:15px;border-radius:50%;background:var(--green-soft,color-mix(in srgb,var(--green) 16%,transparent));color:var(--green);font-size:8px}.subend.stop{background:var(--surface-2);color:var(--mute)}
.subtype{flex:none;font:600 11px "Geist Mono",ui-monospace,monospace;padding:1px 6px;border-radius:6px;background:var(--surface-2);color:var(--ink-2)}
.subdesc{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:560;color:var(--ink)}
.subbg{flex:none;font-size:10.5px;font-weight:600;padding:0 5px;border-radius:5px;border:1px solid var(--line-strong);color:var(--mute)}
.submeta{margin-left:auto;flex:none;font-size:11.5px;color:var(--mute);white-space:nowrap}
.subbody{padding:4px 12px 12px 35px;display:flex;flex-direction:column;gap:10px}
.subsec{display:flex;flex-direction:column;gap:4px}.subprompt{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12.5px;color:var(--ink-2);max-height:160px;overflow:auto;padding:8px 10px;border-radius:8px;background:var(--surface-2)}
.substeps{display:flex;flex-direction:column;max-height:260px;overflow:auto}.subresult{font-size:13px}
.submore>summary{color:var(--mute);font-size:12px}
.tsub{display:inline-flex;align-items:center;gap:2px;font-size:10.5px;font-weight:650;color:var(--accent)}
@media (max-width:640px){.subs{margin:8px 8px 0;max-height:36vh}.subhd{padding:7px 10px}.submeta{display:none}.subag[open] .submeta{display:inline}.subbody{padding-left:12px}}
.scrfit{gap:5px}.scrfit[aria-pressed=true]{background:var(--accent-soft);color:var(--accent);border-color:color-mix(in srgb,var(--accent) 40%,transparent)}
.scrlive{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--green)}.scrlive .dot{width:7px;height:7px;border-radius:50%;background:var(--green);animation:pulse 1.8s infinite}
.scrbody{flex:0 1 auto;min-height:0;display:flex;flex-direction:column;background:#0b0d14}
.scrwrap{flex:0 1 auto;height:calc(var(--rows,30) * 17.25px + 30px);min-height:120px;display:flex}
pre.term{flex:1;margin:0;padding:14px 16px;overflow:auto;background:#0b0d14;color:#d6d8e4;font:12.5px/1.38 "JetBrains Mono","Geist Mono",ui-monospace,Menlo,monospace;white-space:pre;tab-size:8;font-variant-ligatures:none}
pre.term .sb{font-weight:700}pre.term .sd{opacity:.6}pre.term .si{font-style:italic}pre.term .su{text-decoration:underline}pre.term .finv{color:#0b0d14}pre.term .binv{background:#d6d8e4}
pre.term .f0{color:#3b3f51}pre.term .f1{color:#ff6b76}pre.term .f2{color:#3ddc97}pre.term .f3{color:#ffcb6b}pre.term .f4{color:#6ea8ff}pre.term .f5{color:#c792ea}pre.term .f6{color:#5ce1e6}pre.term .f7{color:#d6d8e4}
pre.term .f8{color:#6b7081}pre.term .f9{color:#ff8a93}pre.term .f10{color:#6ff0b4}pre.term .f11{color:#ffe08a}pre.term .f12{color:#9cc4ff}pre.term .f13{color:#ddb3ff}pre.term .f14{color:#8ff1f4}pre.term .f15{color:#ffffff}
pre.term .b0{background:#3b3f51}pre.term .b1{background:#b3343d}pre.term .b2{background:#1f8a5b}pre.term .b3{background:#a97a1d}pre.term .b4{background:#2f5fb3}pre.term .b5{background:#7b4ea8}pre.term .b6{background:#258a8e}pre.term .b7{background:#a9acb9}
pre.term .b8{background:#555a6e}pre.term .b9{background:#d4505a}pre.term .b10{background:#2fae74}pre.term .b11{background:#c99a2e}pre.term .b12{background:#4a7fd6}pre.term .b13{background:#9b6cc9}pre.term .b14{background:#36aeb2}pre.term .b15{background:#e8e9ef}
.scrmeta{flex:none;padding:5px 16px;font-size:11.5px;color:#8a8c9d;background:#0b0d14;border-top:1px solid rgba(255,255,255,.06)}
.screrr{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:30px;color:#a7a9b8;text-align:center}.screrr p{margin:0;max-width:56ch;font-size:13.5px;line-height:1.5}
.scrkeys{flex:none;display:flex;flex-direction:column;gap:8px;padding:10px 14px 12px;border-top:1px solid var(--line);background:var(--surface)}
.scrrow{display:flex;flex-wrap:wrap;gap:5px;align-items:center}.scrsep{width:1px;height:20px;background:var(--line-strong);margin:0 3px}.scrstop{gap:5px}.scrnote{color:#c6c8d6}.scrk{min-width:40px;font-family:"Geist Mono",ui-monospace,monospace;font-size:12.5px}.scrk[data-key=backspace]{font:17px/1 system-ui,sans-serif}
.scrtype{display:flex;gap:8px;align-items:center}.scrtype input[name=text]{flex:1;min-width:0;height:34px;font:13px "Geist Mono",ui-monospace,monospace}
.screnter{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--ink-2);white-space:nowrap}.screnter input{margin:0}
.scrnokeys{margin:0;padding:10px 16px;font-size:12.5px;color:var(--mute);border-top:1px solid var(--line)}
.scrdlg .hd h2{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.scrdlg .hd>.btn,.scrdlg .hd>.scrlive{flex:none}
/* On a phone it fills what's visible (above the keyboard), with its header clear of the status bar and notch (the page is viewport-fit=cover) and a big close button. */
@media (max-width:640px){.scrdlg{position:fixed;inset:var(--vvt,0px) 0 auto 0;margin:0;width:100vw;max-width:none;height:var(--vvh,100dvh);max-height:none;border-radius:0;border:0}.scrdlg .hd{gap:8px;padding:max(8px,env(safe-area-inset-top)) max(6px,env(safe-area-inset-right)) 8px max(14px,env(safe-area-inset-left))}.scrfit>span{display:none}.scrfit{width:36px;height:36px;padding:0;justify-content:center}.scrdlg .hd [data-close]{width:44px;height:44px}.scrdlg .hd [data-close] svg{width:22px;height:22px}.scrkeys{padding-bottom:max(12px,env(safe-area-inset-bottom))}.scrbody{flex:1 1 0}.scrwrap{flex:1 1 0;height:auto;min-height:0}pre.term{font-size:11px;padding:10px}.scrk{min-width:36px;padding:0 10px}}
.k-stuck .askk,.k-wait .askk{background:var(--amber-soft);color:var(--amber)}.asklook{flex:none}.upic{display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:var(--accent-soft);color:var(--accent)}.k-upkeep .askk{background:var(--accent-soft);color:var(--accent)}.uprimary{border-color:color-mix(in srgb,var(--accent) 45%,transparent)}.k-wait .asklook{height:30px;padding:0 12px;font-size:12.5px;border-color:var(--line-strong)}
.stklist{list-style:none;margin:8px 0 10px;padding:0;display:flex;flex-direction:column;gap:6px;font-size:12.5px}.stklist li{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;padding:6px 10px;border-radius:0 9px 9px 0;border-left:2px solid var(--line-strong);background:var(--surface)}.stklist time{font-size:11.5px}.stkb{flex-basis:100%;color:var(--ink-2);line-height:1.45;overflow-wrap:anywhere}
.stkhead{margin:2px 0 4px;font-size:14px;font-weight:600;line-height:1.45;color:var(--ink)}.stkwhy{margin:0 0 8px;font-size:13px;line-height:1.5;color:var(--ink-2)}
.stkmv{cursor:default;flex-wrap:wrap}.stkfwd{flex-basis:100%;display:flex;align-items:flex-start;gap:8px;font-size:12.5px;line-height:1.4;color:var(--mute);cursor:pointer}.stkfwd input{margin:2px 0 0;flex:none;accent-color:var(--accent)}.stkmv select{flex:1 1 140px;min-width:0;height:32px;font-size:13px}.stkmv .askoptx{flex-basis:100%}.k-stuck .askqt{margin:6px 0 8px}
.wkpane{max-width:1160px;gap:18px;padding-bottom:96px}
.flpane{max-width:1160px;gap:18px;padding-bottom:96px}
/* The chat's header on a phone: the name, chat/code and ⋯; everything else (text size, files, toggles, state, compact,
   screen, machine, project) drops down under it from ⋯. On wider screens the tools sit inline as before. */
.hdtools{display:contents}.hdmore{display:none}.ml{display:none}.mdet .sep{font-style:normal}
@media (max-width:640px){.hdmore{display:inline-flex}.hdmore[aria-expanded=true]{background:var(--surface-2);color:var(--ink)}
  .chat>.hd .hdtools,.chat>.hd .meta-row{display:none}.chat>.hd h2{flex-wrap:wrap}
  /* Open: the tools as labelled buttons in a grid, then its state, then one line each for machine, project, branch, folder. */
  .chat>.hd.menu,.chatmode .chat>.hd.menu{flex-wrap:wrap;row-gap:0;align-items:center}
  /* Open, the header's inner boxes step aside so the menu spans the full width, not just the column under the name. */
  .chat>.hd.menu>.grow,.chat>.hd.menu h2{display:contents!important}
  .chat>.hd.menu h2>.grow{flex:1;min-width:0;font:600 15px/1.2 Geist,system-ui,sans-serif;letter-spacing:-.02em}
  .chat>.hd.menu .meta-row{flex-basis:100%;order:10}
  .chatmode .chat>.hd.menu .hdtools,.chatmode .chat>.hd.menu .meta-row{flex-basis:calc(100% - 6px);margin-left:6px}
  .chat>.hd.menu .hdtools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;flex-basis:100%;order:9;margin-top:10px;padding-top:12px;border-top:1px solid var(--line)}
  .chat>.hd.menu .hdtools>.btn{width:auto;height:36px;justify-content:center;gap:6px;padding:0 6px;border:1px solid var(--line);border-radius:10px;font:500 12px/1.1 "Geist",system-ui,sans-serif;color:var(--ink-2);opacity:1}
  .chat>.hd.menu .hdtools>.ttog.on{border-color:color-mix(in srgb,var(--accent) 35%,transparent);color:var(--accent)}
  .chat>.hd.menu .hdtools>.ttog:not(.on){color:var(--mute)}
  .chat>.hd.menu .ml{display:inline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .chat>.hd.menu .fsz{grid-column:1/-1;display:flex;align-items:center;gap:4px;height:36px;margin:0;padding:0 4px 0 12px;border:1px solid var(--line);border-radius:10px}
  .chat>.hd.menu .fsz .ml{flex:1;font-size:12px;font-weight:500;color:var(--ink-2)}
  .chat>.hd.menu .fsz .btn{width:34px;height:28px}
  .chat>.hd.menu .meta-row{display:flex;flex-wrap:wrap;white-space:normal;overflow:visible;gap:6px;margin-top:12px}
  .chat>.hd.menu .meta-row>.badge,.chat>.hd.menu .meta-row .compactbtn{display:inline-flex}
  .chat>.hd.menu .renamebtn{display:inline-flex}
  .chat>.hd.menu .meta-row>.mdet{flex-basis:100%;display:flex;flex-direction:column;gap:5px;margin-top:4px;overflow:visible;white-space:normal;font-size:12.5px;color:var(--ink-2)}
  .chat>.hd.menu .mdet .mi{display:flex;align-items:center;gap:6px;min-width:0;overflow-wrap:anywhere}.chat>.hd.menu .mdet .i{flex:none;color:var(--mute)}
  .chat>.hd.menu .sep{display:none}.chat>.hd.menu .mdet .cwd{display:flex}}
/* Files from agents (gallery.ts): thumbnails only, square, filling the width. */
.galpane{max-width:1400px;gap:16px;padding-bottom:96px}
.galbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.galbar select{width:auto;min-width:150px;max-width:260px;height:32px;font-size:13px}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:8px}
.gtile{position:relative;display:block;aspect-ratio:1;margin:0;border-radius:10px;overflow:hidden;border:1px solid var(--line);background:var(--surface-2)}
.gal .att.gtile img{width:100%;height:100%;max-width:none;max-height:none;object-fit:cover;border:0;border-radius:0;transition:transform .25s ease}
.gtile:hover{border-color:var(--line-strong)}.gtile:hover img{transform:scale(1.035)}.gtile:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.gfile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--mute);text-decoration:none}.gfile:hover{color:var(--accent)}
.gext{font:600 11px/1 "JetBrains Mono","Geist Mono",ui-monospace,monospace;letter-spacing:.06em;color:var(--ink-2)}.gfile{gap:6px;padding:12px}.gname{max-width:100%;font-size:12px;line-height:1.35;color:var(--ink);text-align:center;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.gsize{font-size:11px;color:var(--mute)}.gfile:hover .gname{color:var(--accent)}
@media (max-width:640px){.gfile{padding:6px;gap:3px}.gfile .i{width:18px;height:18px}.gname{font-size:10.5px;-webkit-line-clamp:3}.gsize{font-size:10px}}
.galempty{padding:64px 16px;text-align:center}.galmore{display:flex;gap:8px;justify-content:center}
@media (max-width:640px){.galpane{padding:12px 12px 88px}.gal{grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:4px}.gtile{border-radius:6px}.galbar select{min-width:0;flex:1}}
/* Tickets & MRs (tracked.ts): grouped by who they wait on, an MR under its ticket, each row opening to its history. */
.trkpane{max-width:1180px;gap:18px;padding-bottom:96px}
.trkfreshes{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:-8px;font-size:12.5px;color:var(--ink-2)}
.trkfresh{display:inline-flex;align-items:center;gap:5px}.trkfresh>span:last-child{margin-left:-5px}.trkfresh.stale{color:var(--amber);font-weight:600}
.seg a .muted{font-weight:500;margin-left:2px}
.trksec{display:flex;flex-direction:column;gap:8px}
.trkh{display:flex;align-items:center;gap:8px;margin:6px 0 0;font-size:13px;font-weight:650;color:var(--ink-2);text-transform:none;letter-spacing:0}.trkh .i{color:var(--mute)}
.trksec.s-you>.trkh .i{color:var(--amber)}.trksec.s-working>.trkh .i{color:var(--accent)}
details.trksec>summary{list-style:none;cursor:pointer;user-select:none}details.trksec>summary::-webkit-details-marker{display:none}details.trksec[open]>summary{margin-bottom:8px}
.trkgroup{border:1px solid var(--line);border-radius:var(--r);background:var(--surface);box-shadow:var(--shadow);overflow:hidden}
.trkrow+.trkrow{border-top:1px solid var(--line)}
.trkrow>summary{list-style:none;display:flex;align-items:center;gap:12px;padding:11px 16px;cursor:pointer;min-width:0}.trkrow>summary::-webkit-details-marker{display:none}
.trkrow>summary:hover{background:var(--surface-2)}
.trkrow.nested>summary{padding-left:40px;background:linear-gradient(var(--surface-2),var(--surface-2)) 27px 0/1px 100% no-repeat}
.trkrow.nested>summary:hover{background-color:var(--surface-2)}
.trkk{flex:none;display:flex;color:var(--mute)}.trkrow.s-you .trkk{color:var(--amber)}.trkrow.s-working .trkk{color:var(--accent)}.trkrow.s-done .trkk{color:var(--green)}
.trkmain{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.trkline{display:flex;align-items:baseline;gap:9px;min-width:0}
.trkkey{flex:none;font:600 12.5px/1.3 "JetBrains Mono","Geist Mono",ui-monospace,monospace;color:var(--ink);text-decoration:none}a.trkkey:hover{color:var(--accent);text-decoration:underline}
.trkrepo{color:var(--mute);font-weight:500}
.trktitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;color:var(--ink)}
.trkrow.s-done .trktitle{color:var(--ink-2)}
.trksub{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12.5px;color:var(--ink-2);line-height:1.45}
.trkon{color:var(--mute)}.trkrow.s-you .trkon{color:var(--amber);font-weight:600}
.trkchips{flex:none;display:flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:flex-end;max-width:46%}
.trkchips a.badge{text-decoration:none}.trkchips a.badge:hover{filter:brightness(.95)}
.trkfact{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:600;color:var(--ink-2)}.trkfact .i{color:var(--green)}
.trkpipe{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:var(--ink-2)}.trkpipe .dot{width:7px;height:7px;border-radius:50%;background:var(--mute)}
.trkpipe.green .dot{background:var(--green)}.trkpipe.red{color:var(--red)}.trkpipe.red .dot{background:var(--red)}.trkpipe.accent .dot{background:var(--accent);animation:trkblink 1.6s ease-in-out infinite}@keyframes trkblink{50%{opacity:.35}}@media (prefers-reduced-motion:reduce){.trkpipe.accent .dot{animation:none}}
.trkowner{flex:none;display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--ink-2);max-width:150px}.trkowner span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.trkage{flex:none;width:56px;text-align:right;font-size:12px;color:var(--mute);font-variant-numeric:tabular-nums}
.trkmore{padding:2px 16px 14px 42px;display:flex;flex-direction:column;gap:10px;font-size:12.5px;color:var(--ink-2)}.trkrow.nested .trkmore{padding-left:66px}
.trkmeta{display:flex;flex-wrap:wrap;gap:4px 16px}.trkmeta b{font-weight:600;color:var(--mute);margin-right:3px}
.trkhist{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;border-left:2px solid var(--line);padding-left:12px}
.trkhist li{display:flex;gap:10px}.trkhist .muted{flex:none;width:56px;font-variant-numeric:tabular-nums}
.trkbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.trkbar .seg a .badge{margin-left:4px;font-size:10.5px;padding:0 6px}.trkbar .seg a .muted{margin-left:4px}
.trkq{display:flex;align-items:center;gap:4px;flex:1;min-width:180px;max-width:320px;margin-left:auto}.trkq input{height:30px;font-size:13px;width:100%}
.trkdecide{color:var(--amber);font-weight:650}
.trkask{display:flex;flex-direction:column;gap:8px}.trkask .trkrow.s-you .trkon{display:none}.trkask+.trkask{margin-top:6px}
.trkask h3{display:flex;align-items:baseline;gap:8px;margin:4px 0 0;font-size:12px;font-weight:650;letter-spacing:.02em;text-transform:uppercase;color:var(--mute)}.trkask h3::first-letter{text-transform:uppercase}
.trkact{flex:none;height:28px;gap:6px}.trkact .muted{color:inherit;opacity:.7;font-weight:500;font-size:11.5px}
.trkdecided{flex:none;display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:var(--green);text-decoration:none}.trkdecided:hover{text-decoration:underline}
.trknocard{flex:none;font-size:12px;color:var(--mute);font-style:italic}
.trkrel{flex:none;display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:600;color:var(--mute);white-space:nowrap}
.trkgroup.fam{border-left:3px solid var(--accent-soft)}.trkgroup.fam>.trkrow:first-child>summary{background:color-mix(in srgb,var(--surface-2) 45%,transparent)}
details.trksec.s-parked>summary{list-style:none;cursor:pointer}
.trkempty{padding:64px 16px;text-align:center}.trkempty .small{max-width:56ch;margin:0 auto}
@media (max-width:760px){.trkrow>summary{flex-wrap:wrap;gap:6px 10px;padding:10px 12px}.trkrow.nested>summary{padding-left:30px;background-position:19px 0}
  .trkmain{flex-basis:calc(100% - 90px)}.trktitle{white-space:normal}.trkline{flex-wrap:wrap;row-gap:2px}
  .trkchips{order:5;max-width:none;justify-content:flex-start;flex-basis:100%;padding-left:26px}.trkowner{order:6;padding-left:26px}.trkage{width:auto}
  .trkmore{padding:2px 12px 12px 38px}.trkrow.nested .trkmore{padding-left:56px}}
@media (max-width:640px){.trkpane{padding:12px 12px 88px}.trkbar .seg{overflow-x:auto;max-width:100%}.trkbar .seg span{display:inline}.trkshow{flex-basis:100%}.trkshow a{padding:3px 7px;white-space:nowrap}.trkq{max-width:none;margin-left:0}.trkact,.trkdecided,.trknocard{order:5;margin-left:26px}}
.flhead{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap}.flhead>div:first-child{flex:1;min-width:240px}.flhead h1{margin:0 0 4px;font-size:27px;font-weight:650;letter-spacing:-.022em}.flhead p{margin:0;font-size:14px}
.flctl{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.flauto{display:inline-flex;align-items:center;padding:6px 12px;border-radius:9px;border:1px solid var(--line);background:var(--surface);font-size:13px}
.flhow{margin:-6px 0 0;font-size:13px;line-height:1.55;color:var(--ink-2);max-width:90ch}
.flhost{border:1px solid var(--line);border-radius:var(--r);background:var(--surface);box-shadow:var(--shadow);overflow:hidden}
.flh{display:flex;align-items:center;gap:8px;margin:0;padding:14px 18px 10px;font-size:15px;font-weight:650}.flh .i{color:var(--mute)}
.flnote{margin:0 18px 10px;padding:8px 12px 8px 32px;border-radius:9px;background:var(--green-soft);color:var(--ink);font-size:13px;line-height:1.55;position:relative}.flnote>.i{position:absolute;left:12px;top:11px;color:var(--green)}.flnote.warn{background:var(--amber-soft)}.flnote.warn>.i{color:var(--amber)}
.flscroll{overflow-x:auto}
.fltable{width:100%;border-collapse:collapse;font-size:13.5px}.fltable th{padding:6px 12px;font-size:11.5px;font-weight:600;color:var(--mute);text-align:left;white-space:nowrap;border-top:1px solid var(--line)}.fltable td{padding:9px 12px;border-top:1px solid var(--line);white-space:nowrap;vertical-align:middle}.fltable th:first-child,.fltable td:first-child{padding-left:18px}
.flag{display:inline-flex;align-items:center;gap:8px}
.flver{display:inline-flex;padding:1px 7px;border-radius:6px;font:600 12px "Geist Mono",ui-monospace,monospace;background:var(--amber-soft);color:var(--amber)}.flver.ok{background:var(--green-soft);color:var(--green)}
.flstate{font-size:12.5px;color:var(--ink-2)}.flstate.s-working{color:var(--accent)}.flstate.s-waiting{color:var(--amber)}
.flok{display:inline-flex;align-items:center;gap:4px;color:var(--green);font-size:12.5px;font-weight:600}.flwarn{color:var(--amber);font-size:12.5px;font-weight:600}
.flact{text-align:right}.flact form{display:inline}.flact .btn{margin-left:4px}
.flgone{font-size:13px;color:var(--ink-2)}.flgone summary{cursor:pointer;font-weight:600}.flgone ul{margin:8px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px}
@media (max-width:640px){.flpane{padding:12px 14px 88px}.flhead h1{font-size:22px}.fltable th:nth-child(2),.fltable td:nth-child(2),.fltable th:nth-child(4),.fltable td:nth-child(4),.fltable th:nth-child(5),.fltable td:nth-child(5),.fltable th:nth-child(6),.fltable td:nth-child(6),.flag .muted{display:none}.fltable td,.fltable th{padding:8px 8px}.fltable th:first-child,.fltable td:first-child{padding-left:14px}}
.wkhead{display:flex;flex-direction:column;gap:12px}
.wktitle{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.wktitle h1{margin:0;font-size:27px;font-weight:650;letter-spacing:-.022em}.wkzone{font-size:12.5px;color:var(--mute)}
.wkctl{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wksearch{display:flex;align-items:center;gap:6px;flex:1 1 260px;max-width:420px;min-width:0;height:34px;padding:0 6px 0 11px;border-radius:9px;border:1px solid var(--line);background:var(--surface);color:var(--mute)}.wksearch:focus-within{border-color:color-mix(in srgb,var(--accent) 55%,transparent);box-shadow:0 0 0 3px var(--accent-soft)}.wksearch input[type=search]{flex:1;min-width:0;height:30px;padding:0;border:0;background:none;box-shadow:none;font-size:13.5px}.wksearch input[type=search]:focus{outline:none;box-shadow:none}
.wkev mark{background:color-mix(in srgb,var(--amber) 30%,transparent);color:inherit;border-radius:3px;padding:0 1px}
.wkrange{display:inline-flex}.wkrange a{display:inline-flex;align-items:center;padding:4px 12px;border-radius:6px;font-size:13px;font-weight:600;color:var(--mute);text-decoration:none}.wkrange a:hover{color:var(--ink);text-decoration:none}.wkrange a.on{background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}
.wknav{display:inline-flex;align-items:center;gap:2px}.wknav .wkprev svg{transform:rotate(180deg)}
.wksum{display:inline-flex;align-items:center;gap:8px;padding:3px 6px 3px 10px;border-radius:9px;border:1px solid var(--line);background:var(--surface);font-size:13px;color:var(--ink-2)}.wksum>.i{color:var(--mute)}
.wksum select{height:28px;padding:0 6px;font-size:12.5px}
.wkswitch{display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-weight:550}.wkswitch input{width:15px;height:15px;margin:0;accent-color:var(--accent)}
.wktiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.wktile{display:flex;flex-direction:column;gap:2px;padding:14px 16px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow);min-width:0}
.wkl{font-size:12px;font-weight:600;color:var(--mute)}.wkv{font-size:26px;font-weight:650;letter-spacing:-.02em;line-height:1.2;color:var(--ink);font-variant-numeric:tabular-nums}.wks{font-size:12px;line-height:1.4;color:var(--ink-2)}
.wkbox{padding:16px 18px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow);min-width:0}
.wkh{display:flex;align-items:center;gap:7px;margin:0 0 12px;font-size:13.5px;font-weight:650;color:var(--ink)}.wkh .i{color:var(--mute)}
.wknote{margin:10px 0 0;font-size:12px;color:var(--mute);line-height:1.45}
.wkbars{display:flex;align-items:stretch;gap:6px;height:150px}.wkbars.dense{gap:3px}
.wkbar{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;gap:6px;text-decoration:none;border-radius:6px}
.wkbar::before{content:"";position:absolute;inset:0 0 20px;border-bottom:1px solid var(--line)}
.wkbarv{position:relative;display:block;height:calc((100% - 20px) * var(--h) / 100);min-height:2px;margin:0 auto;width:min(100%,34px);border-radius:4px 4px 0 0;background:var(--accent);transition:filter .15s}
.wkbarl{height:14px;font-size:11px;line-height:14px;text-align:center;color:var(--mute);white-space:nowrap;overflow:hidden}
.wkbar:hover .wkbarv,.wkbar:focus-visible .wkbarv{filter:brightness(1.15)}
.wkbar:hover::after,.wkbar:focus-visible::after{content:attr(data-tip);position:absolute;bottom:calc(100% - 14px);left:50%;transform:translateX(-50%);z-index:3;width:max-content;max-width:240px;padding:6px 9px;border-radius:8px;background:var(--ink);color:var(--bg);font-size:12px;line-height:1.35;white-space:normal;pointer-events:none;box-shadow:var(--shadow-lg)}
.wkgrid{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;align-items:start}
@media (min-width:1100px){.wkgrid{grid-template-columns:minmax(0,1fr) 410px}.wkside{position:sticky;top:12px}}
.wkmain{display:flex;flex-direction:column;gap:16px;min-width:0}.wkside{display:flex;flex-direction:column;gap:12px;min-width:0}
.wkday{display:flex;flex-direction:column;gap:6px}.wkdayh{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:650;color:var(--ink-2);text-decoration:none;padding:0 4px}.wkdayh:hover{color:var(--accent);text-decoration:none}
.wklist{display:flex;flex-direction:column;border-radius:var(--r);border:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow);overflow:hidden}
.wkev{display:flex;align-items:center;gap:12px;padding:10px 14px;border-top:1px solid var(--line);color:var(--ink);text-decoration:none;min-width:0}.wkev:first-child{border-top:0}.wkev:hover{background:var(--surface-2);text-decoration:none}
.wkt{flex:none;width:40px;font-size:12.5px;color:var(--mute);font-variant-numeric:tabular-nums}
.wkic{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:var(--surface-2);color:var(--ink-2)}
.wkev.t-ok .wkic{background:var(--green-soft);color:var(--green)}.wkev.t-bad .wkic{background:var(--red-soft);color:var(--red)}.wkev.t-warn .wkic{background:var(--amber-soft);color:var(--amber)}
.wkev.k-ticket-done .wkic{background:var(--green);color:#fff}
.wkx{flex:1;min-width:0;display:flex;flex-direction:column}.wkw{font-size:14px;font-weight:550;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wktt{font-size:12.5px;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wkempty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:40px 20px;border-radius:var(--r);border:1px dashed var(--line-strong);color:var(--mute);text-align:center}.wkempty p{margin:0;max-width:44ch;font-size:13.5px}
.wkgo{display:flex;flex-direction:column;gap:2px;margin:0 -8px}.wkgoi{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;color:var(--ink);text-decoration:none;min-width:0}.wkgoi:hover{background:var(--surface-2);text-decoration:none}
.wkage{flex:none;font-size:12px;font-weight:600;color:var(--amber);font-variant-numeric:tabular-nums}
.wkscroll{overflow-x:auto;margin:0 -4px}
.wktable{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.wktable th{font-size:11.5px;font-weight:600;color:var(--mute);text-align:right;padding:4px 5px;white-space:nowrap}.wktable td{text-align:right;padding:7px 5px;border-top:1px solid var(--line);white-space:nowrap}.wktable th:first-child,.wktable td:first-child{text-align:left}
.wkag{display:inline-flex;align-items:center;gap:7px;font-weight:550}
.wkdl{margin:0;display:flex;flex-direction:column;gap:6px}.wkdl div{display:flex;justify-content:space-between;gap:10px;font-size:13.5px}.wkdl dt{color:var(--ink-2)}.wkdl dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums}
@media (max-width:640px){.wkpane{padding:12px 14px 88px}.wktitle h1{font-size:22px}.wktiles{grid-template-columns:repeat(2,minmax(0,1fr))}.wkv{font-size:22px}.wkbars{height:120px}.wkt{width:36px}.wkev{gap:10px;padding:10px 12px}}
.tkboxp{margin:0;font-size:13px;line-height:1.5;color:var(--ink-2)}
.tkboxm{font-size:12.5px;color:var(--mute)}
.rvtkey{font-size:13px;font-weight:650;color:var(--accent);text-decoration:none}a.rvtkey:hover{text-decoration:underline}
.rvttitle{margin:0 0 10px;font-size:14px;font-weight:550;line-height:1.45;color:var(--ink)}
.rvtstate{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-bottom:8px}
.rvtplan{margin-top:6px;border-top:1px solid var(--line);padding-top:8px}.rvtplan summary{cursor:pointer;font-size:12.5px;font-weight:600;color:var(--ink-2)}.rvtplan .tkprose{margin-top:8px;font-size:13.5px}
.rvfindings{display:none}.tkpane .rvfindings.on #rvfindings{display:flex;flex-direction:column;gap:14px}
.rvfind{padding:18px 22px;border-radius:var(--r);border:1px solid var(--line);border-left:3px solid var(--line-strong);background:var(--surface);box-shadow:var(--shadow)}
.rvfind.s-blocker{border-left-color:var(--red)}.rvfind.s-important{border-left-color:var(--amber)}.rvfind.s-question{border-left-color:var(--accent-2)}
.rvfind:target{box-shadow:0 0 0 3px var(--accent-soft),var(--shadow)}
.rvfindh{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rvfindn{font-size:12.5px;font-weight:600;color:var(--mute)}
.rvloc{display:inline-flex;align-items:center;gap:5px;max-width:100%;font:500 12.5px "Geist Mono",ui-monospace,monospace;color:var(--ink-2);padding:3px 8px;border-radius:7px;background:var(--surface-2);border:1px solid var(--line);text-decoration:none;overflow-wrap:anywhere}a.rvloc:hover{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 35%,transparent);text-decoration:none}
.rvfinds{margin:10px 0 0;font-size:15.5px;font-weight:550;line-height:1.55;color:var(--ink);text-wrap:pretty}
.rvcomment{margin-top:12px;padding:10px 14px;border-radius:10px;background:var(--surface-2);border:1px solid var(--line)}.rvcomment .tkprose{font-size:14px}
.rvfind .tkthread:not(:empty){margin-top:12px}
.rvnote{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 10px;margin:6px 10px 8px 98px;padding:9px 12px;border-radius:10px;border:1px solid var(--line-strong);border-left:3px solid var(--line-strong);background:var(--surface);font:13.5px/1.5 Geist,ui-sans-serif,system-ui,sans-serif;white-space:normal;color:var(--ink)}
.rvnote.s-blocker{border-left-color:var(--red)}.rvnote.s-important{border-left-color:var(--amber)}.rvnote.s-question{border-left-color:var(--accent-2)}
.rvnote:target{box-shadow:0 0 0 3px var(--accent-soft)}
.rvnoten{font-size:12px;font-weight:650;color:var(--mute)}.rvnotes{flex:1 1 260px;min-width:0}.rvnotel{font-size:12.5px;font-weight:600}
tr.dnote td{padding:0;background:var(--surface-2)}
.rvposts{display:flex;flex-direction:column;gap:8px;margin-bottom:18px}
.rvpost{padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface)}
.rvposth{display:flex;align-items:center;gap:10px}.rvpostsum{flex:1;min-width:0;font-size:14px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.rvpost:has(input[value=drop]:checked) .rvpostsum{color:var(--mute);text-decoration:line-through;text-decoration-color:var(--line-strong)}
.rvpostc{margin-top:8px}.rvpostc summary{cursor:pointer;font-size:12.5px;font-weight:600;color:var(--ink-2)}.rvpostc textarea{margin-top:8px}
.rvdecide .rvgone{margin-bottom:14px}
.tkprose{font-size:15px;line-height:1.7;color:var(--ink);overflow-wrap:anywhere;max-width:74ch}
.tkprose p{margin:0 0 .85em}
.tkprose .mdh{margin:1.4em 0 .5em;font-weight:650;letter-spacing:-.012em;line-height:1.3;color:var(--ink)}.tkprose .mdh:first-child{margin-top:0}
.tkprose .mdh1{font-size:1.36em}.tkprose .mdh2{font-size:1.2em}.tkprose .mdh3{font-size:1.06em}.tkprose .mdh4{font-size:.95em;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-2)}
.tkprose ul,.tkprose ol{margin:.3em 0 .9em;padding-left:1.5em}.tkprose li{margin:.3em 0;padding-left:.2em}.tkprose li::marker{color:var(--mute)}
.tkprose blockquote{margin:.8em 0;padding:10px 14px;border:0;border-left:3px solid var(--accent-2);border-radius:0 8px 8px 0;background:color-mix(in srgb,var(--accent-2) 8%,transparent);color:var(--ink)}
.tkprose code{font-size:.87em;padding:.12em .4em;border-radius:5px;background:var(--surface-2);border:1px solid var(--line)}
.tkprose .mdpre{margin:.9em 0;font-size:13px;line-height:1.6;border-radius:10px}.tkprose .mdpre code{padding:0;border:0;background:none}
.tkprose .mdtable{margin:.9em 0}.tkprose table{font-size:.92em}.tkprose th,.tkprose td{padding:7px 12px;border-color:var(--line-strong)}
.tkprose img{display:block;max-width:100%;height:auto;margin:.8em 0;border-radius:10px;border:1px solid var(--line)}
.tkprose a{text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--accent) 35%,transparent);text-underline-offset:2px}
.tkprose b,.tkprose strong{font-weight:650}
.tkverdict{padding:18px 20px;border-radius:var(--r);border:1px solid transparent;background:linear-gradient(var(--surface),var(--surface)) padding-box,linear-gradient(140deg,color-mix(in srgb,var(--green) 55%,transparent),color-mix(in srgb,var(--accent) 45%,transparent) 60%,var(--line-strong)) border-box;box-shadow:var(--shadow)}
.tkvh{display:flex;align-items:center;gap:8px}.tkvwho{font-size:12.5px;font-weight:650;color:var(--ink-2)}
.tkvline{margin:10px 0 12px;font-size:17px;font-weight:600;line-height:1.45;letter-spacing:-.01em;text-wrap:pretty;color:var(--ink)}
.tkverdict .tkprose{font-size:14.5px}
.tkrec{font-size:12.5px;color:var(--mute)}.tkrec b{color:var(--ink);font-weight:650}
.tksheet{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:var(--r);background:var(--surface);box-shadow:var(--shadow)}
.tksec{padding:22px 24px}.tksec+.tksec{border-top:1px solid var(--line)}
.tkh2{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:16px;font-weight:650;letter-spacing:-.01em;color:var(--ink)}.tkh2 .i{color:var(--mute)}
.tkcount{font-size:12.5px;font-weight:500;color:var(--mute);letter-spacing:0}
.tkempty{margin:0;color:var(--mute);font-style:italic}
.tklinks{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:var(--r-s);overflow:hidden}
.tklink{display:flex;align-items:center;gap:10px;padding:10px 14px;font-size:14px;color:var(--ink);text-decoration:none;border-top:1px solid var(--line)}.tklink:first-child{border-top:0}a.tklink:hover{background:var(--surface-2);text-decoration:none}
.tkrel{flex:none;width:92px;font-size:12.5px;color:var(--mute)}.tklink b{flex:none;font-weight:600;color:var(--accent)}.tkltitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tkcomments{display:flex;flex-direction:column;gap:22px}
.tkc{display:flex;gap:12px;align-items:flex-start}.tkc>.av{width:32px;height:32px;font-size:13px}
.tkcb{flex:1;min-width:0}.tkch{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;margin:4px 0 6px;font-size:14px}.tkch b{font-weight:650}.tkch span{font-size:12.5px;color:var(--mute)}
.tkc .tkprose{font-size:14.5px}
.tkcard{padding:20px 24px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow)}
.tkmr+.tkmr{margin-top:20px;padding-top:20px;border-top:1px solid var(--line)}
.tkmrh{margin-bottom:8px}.tkmrt{display:inline-flex;align-items:center;gap:7px;font-weight:650;font-size:15px;color:var(--ink);text-decoration:none;overflow-wrap:anywhere}.tkmrt:hover{color:var(--accent);text-decoration:none}.tkmrt .i{flex:none;color:var(--mute)}
.tkmeta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:0 0 12px;font-size:13px}.tkmeta code{font-size:12px;padding:2px 7px;border-radius:6px;background:var(--surface-2);border:1px solid var(--line)}
.tks{display:inline-flex;align-items:center;font-size:11.5px;font-weight:650;padding:2px 9px;border-radius:999px;background:var(--surface-2);color:var(--ink-2)}
.tks.ok{background:var(--green-soft);color:var(--green)}.tks.bad{background:var(--red-soft);color:var(--red)}.tks.mid{background:var(--amber-soft);color:var(--amber)}
.tkfiles{margin-bottom:10px;max-height:260px;overflow:auto}
.tkcommits{margin:0 0 12px;font-size:13.5px}.tkcommits summary{cursor:pointer;color:var(--mute);font-size:13px}.tkcommits ul{margin:8px 0 0;padding-left:18px}.tkcommits li{margin:4px 0;overflow-wrap:anywhere}.tkcommits code{color:var(--accent);font-size:12px}
.tkdiff{display:flex;flex-direction:column;gap:8px}
.tkthread{display:flex;flex-direction:column;gap:10px}
.tkturn{padding:11px 15px;border-radius:14px 14px 14px 4px;background:var(--accent-soft);max-width:88%}.tkturn.mine{align-self:flex-end;border-radius:14px 14px 4px 14px;background:var(--surface-2)}
.tkturnh{display:flex;align-items:center;gap:7px;font-size:12.5px;margin-bottom:5px}.tkturnh time{color:var(--mute)}.tkturn .md{font-size:14.5px;line-height:1.6;overflow-wrap:anywhere}
.tkthread>.small{font-size:13.5px}
.tkask{display:flex;gap:8px;align-items:flex-end;margin-top:14px}.tkask textarea{flex:1;min-width:0}
.tkta{width:100%;resize:vertical;padding:10px 13px;border-radius:10px;font:inherit;font-size:14.5px;line-height:1.55;background:var(--surface-2)}.tkta.mono{font:13px/1.65 "Geist Mono",ui-monospace,monospace}
.tkqs{display:flex;flex-direction:column;gap:18px;margin-bottom:20px}
.tkq{border:0;padding:0;margin:0;min-width:0}.tkq legend{padding:0;margin-bottom:10px}.tkq .askqt{font-size:15px}.tkq .askopts{margin-bottom:8px}.tkq .askopt{font-size:14px}
.tkdecide .rvout{margin-top:0}
.tkplanedit,.tknote{display:flex;flex-direction:column;gap:6px;margin-top:16px}
.tkplanedit{display:none}.tkdecide:has(input[value=go_changes]:checked) .tkplanedit{display:flex}
.tknote .tknote-r{display:none}.tkdecide:has(input[value=decline]:checked) .tknote .tknote-r{display:inline-block}.tkdecide:has(input[value=decline]:checked) .tknote .tknote-n{display:none}
.tkdecide .askact{margin-top:16px;justify-content:flex-end}
.tkout label{font-size:13px}.tkout label:has(input[value=decline]:checked){color:var(--red)}.tkout label:has(input[value=go]:checked),.tkout label:has(input[value=go_changes]:checked){color:var(--green)}
.tkdone{display:flex;align-items:center;gap:10px;padding:14px 18px;border-radius:var(--r);background:var(--surface);border:1px solid var(--line);font-size:14.5px}.tkdone>.i{flex:none;color:var(--green)}
@media (max-width:640px){.rvnote{margin:6px 8px 8px}.rvfind{padding:14px 16px}.rvposth{flex-wrap:wrap}.rvpostsum{flex-basis:100%;order:3}.tknav a[data-tab]{padding:9px 11px 11px}.tkgo{padding:5px 9px}.tkgo span{display:none}.tkpane{padding:10px 14px 88px}.tkhead h1{font-size:22px;margin:6px 0 16px}.tksec,.tkcard,.tkverdict{padding:16px}.tkfrom>span:last-child{display:none}.tkask{flex-direction:column;align-items:stretch}.tkturn{max-width:100%}.tkprose{font-size:15.5px}.tkc .tkprose,.tkverdict .tkprose{font-size:15px}.tkrel{width:auto}.tklink{flex-wrap:wrap;gap:4px 10px}.tkltitle{flex-basis:100%;white-space:normal;order:5}}
/* What your agents wait on: a dock in the corner of every dashboard page. */
.asks{position:fixed;right:20px;bottom:20px;z-index:45;width:min(420px,calc(100vw - 32px));display:flex;flex-direction:column;align-items:flex-end;pointer-events:none}
.asks>*{pointer-events:auto}
.ide.chatmode~.asks{bottom:150px}.ide.chatmode~.asks .askpanel{max-height:min(74vh,calc(100dvh - 240px))}
.askpanel{width:100%;max-height:min(74vh,760px);display:flex;flex-direction:column;border-radius:18px;border:1px solid transparent;background:linear-gradient(var(--surface),var(--surface)) padding-box,linear-gradient(140deg,color-mix(in srgb,var(--amber) 75%,transparent),color-mix(in srgb,var(--accent) 55%,transparent) 60%,var(--line-strong)) border-box;box-shadow:var(--shadow-lg),0 18px 48px -20px color-mix(in srgb,var(--amber) 45%,transparent);overflow:hidden;animation:askup .35s cubic-bezier(.2,.9,.3,1.1)}
.askhd{display:flex;align-items:center;gap:8px;padding:11px 10px 10px 16px;border-bottom:1px solid var(--line);font-size:13.5px}
.askhd [data-askstoggle] .i{transform:rotate(90deg)}.askhd b{white-space:nowrap}.askhd:has(.askpush:not([hidden])) .askor{display:none}.askpill .i{transform:rotate(-90deg);color:var(--mute)}
.askdot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--amber);animation:askping 2s infinite}
@keyframes askping{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--amber) 55%,transparent)}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}
@keyframes askup{from{opacity:0;transform:translateY(14px)}}
@keyframes askin{from{opacity:0;transform:translateY(10px) scale(.98)}}
.asklist{overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}
.ask{padding:12px 14px 14px;border-radius:14px;background:var(--surface-2);border:1px solid var(--line)}
.ask.fresh{animation:askin .45s cubic-bezier(.2,.9,.3,1.2)}
.askwho{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--mute);margin-bottom:10px}
.askname{font-weight:650;font-size:13px;color:var(--ink);text-decoration:none}.askname:hover{color:var(--accent);text-decoration:none}
.askk{font-size:11px;font-weight:650;padding:2px 8px;border-radius:999px;background:var(--amber-soft);color:var(--amber)}
.k-question .askk{background:var(--accent-soft);color:var(--accent)}.k-plan .askk{background:var(--green-soft);color:var(--green)}
.askdue{color:var(--amber);font-weight:600}
.askq{border:0;padding:0;margin:0;min-width:0}.askq+.askq{margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
.askh{display:inline-block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--mute);margin-bottom:3px}
.askqt{margin:0 0 10px;font-size:14.5px;font-weight:600;color:var(--ink);line-height:1.4;text-wrap:pretty}
.askhint{margin:-6px 0 8px;font-size:12px;color:var(--mute)}
.askopts{display:flex;flex-direction:column;gap:6px}
.askopt{display:flex;align-items:center;gap:10px;width:100%;margin:0;text-align:left;padding:9px 12px;border-radius:11px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;cursor:pointer;transition:border-color .15s,background .15s,transform .08s}
.askopt:hover{border-color:color-mix(in srgb,var(--accent) 55%,transparent);background:color-mix(in srgb,var(--accent) 6%,var(--surface))}
.askopt:active{transform:scale(.985)}
.askopt:has(input:checked){border-color:color-mix(in srgb,var(--accent) 70%,transparent);background:var(--accent-soft)}
.askopt input{flex:none;margin:0}
.askoptx{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}.askoptx b{font-weight:600}.askoptx>span{font-size:12px;color:var(--mute);line-height:1.4}
.askopt>.i{flex:none;color:var(--accent);opacity:0;transform:translateX(-4px);transition:opacity .15s,transform .15s}.askopt:hover>.i{opacity:1;transform:none}
.asktype{width:100%;height:34px;margin-top:8px;font-size:13px;border-radius:10px;background:var(--surface)}
.askact{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
.askcode{margin:0 0 2px;padding:10px 12px;border-radius:10px;background:var(--surface);border:1px solid var(--line);font-family:"Geist Mono",ui-monospace,monospace;font-size:12.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;max-height:150px;overflow:auto;color:var(--ink)}
.stknudged{display:flex;gap:6px;align-items:baseline;color:var(--ink-2)}.stknudged svg{flex:none;transform:translateY(1px)}
.stknudge{display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid var(--line);font-size:12px;color:var(--mute)}.stknudge span{flex:1;min-width:0}.stknudge .btn{flex:none}
.askctx{margin:0 0 10px;display:flex;flex-direction:column;gap:4px}
.askwhy{max-height:200px;overflow:auto;padding:8px 12px;border-radius:10px;background:var(--surface-2);font-size:13px;line-height:1.5;color:var(--ink-2);overflow-wrap:anywhere}.askwhy>:first-child{margin-top:0}.askwhy>:last-child{margin-bottom:0}
.asklead>summary{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--mute);cursor:pointer;list-style:none;user-select:none;padding:2px 0}.asklead>summary::-webkit-details-marker{display:none}.asklead>summary:hover{color:var(--ink)}.asklead>summary svg{transition:transform .15s}.asklead[open]>summary svg{transform:rotate(90deg)}
.askleadlist{max-height:240px;overflow:auto;margin-top:4px;padding:4px 8px;border-radius:10px;border:1px solid var(--line);font-size:12.5px}
.askabout .askhint{margin:4px 0 0}
.askplan{max-height:260px;overflow:auto;padding:4px 14px;border-radius:10px;background:var(--surface);border:1px solid var(--line);font-size:13px}
.rvbadge{border:0;font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;height:22px;padding:0 9px 0 7px;gap:5px}.rvbadge:hover{background:color-mix(in srgb,var(--amber) 22%,transparent)}
.k-review .askk{background:var(--accent-soft);color:var(--accent)}
.rvtitle{display:inline-flex;align-items:center;gap:6px;font-weight:650;font-size:14.5px;line-height:1.35;color:var(--ink);text-decoration:none;text-wrap:pretty}.rvtitle:hover{color:var(--accent);text-decoration:none}.rvtitle .i{flex:none;color:var(--mute)}
.rvverdict{margin:3px 0 10px;font-size:13px;color:var(--ink-2);line-height:1.45;text-wrap:pretty}
.rvf{padding:10px 12px;border-radius:11px;background:var(--surface);border:1px solid var(--line);margin-bottom:8px}
.rvfh{display:flex;align-items:center;gap:8px}
.rvsev{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--amber)}.rvsev.s-blocker{color:var(--red)}.rvsev.s-question{color:var(--accent)}
.rvsum{margin:5px 0 0;font-size:13.5px;line-height:1.45;color:var(--ink);text-wrap:pretty}
.rvseg{display:inline-flex;flex:none;gap:2px;padding:2px;border-radius:8px;background:var(--surface-2);border:1px solid var(--line)}
.rvseg label{display:inline-flex;align-items:center;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:600;color:var(--mute);cursor:pointer;white-space:nowrap}
.rvseg label{position:relative}.rvseg input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;pointer-events:none}.rvseg label:hover{color:var(--ink)}
.rvseg label:has(input:checked){background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}.rvseg label:has(input[value=drop]:checked){color:var(--mute)}
.rvseg label:has(input:focus-visible){outline:2px solid var(--accent);outline-offset:1px}
.rvseg.wide{display:flex;flex-wrap:wrap}.rvseg.wide label{flex:1 1 auto;justify-content:center;padding:6px 8px}
.rvf:has(input[value=drop]:checked) .rvsum{color:var(--mute);}
.rvc,.rvask{margin-top:6px}.rvc>summary,.rvask>summary{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--mute);cursor:pointer;list-style:none;user-select:none}.rvc>summary::-webkit-details-marker,.rvask>summary::-webkit-details-marker{display:none}
.rvc>summary:hover,.rvask>summary:hover{color:var(--ink)}.rvc>summary::before{content:"▸";font-size:10px;transition:transform .15s}.rvc[open]>summary::before{transform:rotate(90deg)}
.rvc textarea{display:block;width:100%;margin-top:6px;min-height:90px;resize:vertical;padding:8px 10px;border-radius:9px;font:12.5px/1.5 "Geist Mono",ui-monospace,monospace;background:var(--surface-2)}
.rvaskrow{display:flex;gap:6px;align-items:center}.rvaskrow .asktype{margin-top:6px;flex:1;min-width:0}.rvaskrow .btn{margin-top:6px;flex:none;height:34px}
.rvturn{margin-top:6px;padding:6px 10px;border-radius:9px;background:var(--accent-soft);font-size:12.5px;line-height:1.45;color:var(--ink);overflow-wrap:anywhere}.rvturn.mine{background:var(--surface-2)}.rvturn b{font-weight:650;margin-right:4px}
form>.rvturn,form>.rvask{margin-left:2px}
.rvout{margin-top:12px}.rvout .askh{margin-bottom:5px}
.rvgone{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-bottom:8px;padding:8px 10px;border-radius:10px;background:var(--amber-soft);color:var(--ink);font-size:12.5px;line-height:1.4}.rvgone>.i{color:var(--amber);flex:none}.rvgone>span:not(.rvmove){flex:1;min-width:180px}
.rvmove{display:inline-flex;gap:6px;align-items:center}.rvmove .btn{height:28px}.rvmove select{height:28px;font-size:12.5px;border-radius:8px;padding:0 8px;background:var(--surface)}
.askpill{display:none;align-items:center;gap:8px;height:40px;padding:0 12px 0 14px;border-radius:999px;border:1px solid color-mix(in srgb,var(--amber) 50%,transparent);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;box-shadow:var(--shadow-lg);cursor:pointer;animation:askup .3s ease-out}
.askpill:hover{border-color:var(--amber)}
.asks.min .askpanel{display:none}.asks.min .askpill{display:inline-flex}
body:has(#asks:not([hidden]):not(.min)) .toasts{right:auto;left:20px}
.btn[hidden],.row[hidden]{display:none}@media (max-width:640px){.top .live,.top .topabout{display:none}.top .in{gap:4px}}.acctpane{max-width:760px}.acct .bd>div>h3{font-size:13px;font-weight:620;margin:0 0 6px}.acct .bd>div>h3+p{margin-top:0}.acctrow{flex-wrap:wrap;align-items:flex-end}.acct .headline{font-size:28px;line-height:1.1}.acctlist{display:flex;flex-direction:column;gap:2px}.pushdevs{margin:0;padding-left:18px;color:var(--ink-2)}.pushdevs li{margin:2px 0}.pusherr{color:var(--red)}.askpush{color:var(--accent);gap:4px}
@media (max-width:640px){.asks,.ide.chatmode~.asks{right:8px;left:8px;bottom:calc(8px + env(safe-area-inset-bottom));width:auto}.ide.chatmode~.asks.min{bottom:calc(var(--cbb,0px) + 8px)}body:has(#asks.min:not([hidden])) .chatmode .thread{padding-bottom:60px}.ide.chatmode~.asks .askpanel{max-height:80dvh}.askpanel{max-height:80dvh;border-radius:16px}.askor{display:none}.askopt{padding:11px 12px}body:has(.ide.treeopen) .asks{display:none}body:has(#asks:not([hidden]):not(.min)) .toasts{left:12px;right:12px;bottom:auto;top:12px}}
.chatbox .chips{flex:none;align-items:center}.chatbox .chip{flex:none;height:auto}
@media (max-width:640px){.chatpane{padding:8px;gap:8px}.chat>.hd{padding:10px 12px;gap:10px}.chat>.hd .cname,.chatbox .lbl,.updatebar .uphint{display:none}.chat>.hd .client{padding:0 6px}.chat>.hd .cwd{display:none}.thread.term{padding:12px 14px}.chatbox{padding:10px}.chatbox .chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.chatbox .chips::-webkit-scrollbar{display:none}.chatbox .chip{flex:none;white-space:nowrap}.chatbox textarea{min-width:0}}
@media (max-width:900px){
  .ide{grid-template-columns:minmax(0,1fr)}.pane{grid-column:1}.drawer{display:none}
  .tree{position:fixed;z-index:30;top:var(--toph,0px);bottom:0;left:0;width:284px;transform:translateX(-104%);transition:transform .2s;background:var(--surface);box-shadow:var(--shadow-lg,0 10px 40px rgba(0,0,0,.35))}
  .ide.treeopen>.tree,.ide.notree.treeopen>.tree{display:flex;transform:none}.ide.notree>.tree{display:flex}
  .ide::after{content:"";position:fixed;inset:0;z-index:29;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s}
  .ide.treeopen::after{opacity:1;pointer-events:auto}
}
/* ==== Workbench (2026-11): one rail of pages, a list of agents wide enough for their names, quiet chrome. ==== */
.btn{height:32px;padding:0 12px;border-radius:8px;font-weight:500;font-size:13px;transition:background .12s,border-color .12s,color .12s}
.btn:active{transform:none}
.btn.primary{background:var(--accent);box-shadow:none;color:var(--accent-ink)}.btn.primary:hover{filter:brightness(1.08)}
.btn.ghost:hover{background:var(--hover);color:var(--ink)}
.btn.sm{height:28px;border-radius:7px}.btn.xs{height:24px;border-radius:6px}
.card{border-radius:var(--r);box-shadow:var(--shadow)}
.card.glow{background:var(--surface);border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line));box-shadow:var(--shadow)}
.badge{font-weight:550}
input,select,textarea{border-radius:8px;background:var(--surface)}
input:focus,select:focus,textarea:focus{box-shadow:0 0 0 3px var(--accent-soft)}
.kbd{border-bottom-width:1px;border-radius:4px;font-size:10.5px}
h1{font-size:22px;font-weight:620;letter-spacing:-.02em}
.top.mtop{display:none}
.ide{--rw:52px;--tw:280px;grid-template-columns:var(--rw) var(--tw) minmax(0,1fr) var(--dw)}
.ide>.tree{grid-column:2}.ide>.pane{grid-column:3}.ide>.drawer{grid-column:4}
.irail{grid-column:1;grid-row:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 0 12px;background:var(--side);border-right:1px solid var(--line);min-height:0;overflow-y:auto;scrollbar-width:none}
.rlogo{display:grid;place-items:center;width:36px;height:36px;margin-bottom:10px;border-radius:9px}.rlogo svg{width:26px;height:26px}
.rl{position:relative;display:grid;place-items:center;width:36px;height:36px;flex:none;border:0;border-radius:9px;background:none;color:var(--mute);cursor:pointer;text-decoration:none!important;transition:background .12s,color .12s}
.rl:hover{background:var(--hover);color:var(--ink)}.rl.on{background:var(--sel);color:var(--ink)}.rl.away{color:var(--amber)}
.rpill{position:absolute;top:1px;right:-1px;min-width:16px;height:16px;padding:0 4px;border-radius:99px;background:var(--accent);color:#fff;font:650 10px/16px Geist,system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px var(--side);font-variant-numeric:tabular-nums}
.rpill.amber{background:var(--amber);color:#1c1204}
.rsp{flex:1;min-height:12px}
.rme{margin-top:6px}.rme .av{width:26px;height:26px;font-size:11px}
.tree{background:var(--side);font-size:13.5px}
.thead{display:flex;align-items:center;gap:8px;padding:12px 10px 8px 16px;flex:none}.thead b{font-size:13px;font-weight:620;color:var(--ink)}
.thead .live{border:0;background:none;padding:0;font-size:11.5px;gap:5px;color:var(--mute)}.thead .live .dot{width:6px;height:6px}.thead .live.on{color:var(--mute)}
.thead .btn{color:var(--mute)}
.tsearch{display:flex;align-items:center;gap:8px;height:32px;margin:0 10px 6px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--mute);font:inherit;font-size:12.5px;cursor:pointer;flex:none;text-align:left}
.tsearch:hover{border-color:var(--line-strong);color:var(--ink-2)}.tsearch span:first-of-type{flex:1}
.tbody{padding:0 8px 14px}
.tp{margin:0}.tp>summary{gap:4px;padding:14px 8px 4px 8px;border-radius:0;font-size:11px}.tp>summary:hover{background:none}
.tp>summary .tcaret{width:10px;opacity:0;transition:opacity .12s,transform .15s}.tp>summary:hover .tcaret,.tp:not([open])>summary .tcaret{opacity:1}
.tpn{font-weight:620;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--mute)}.tpn:hover,.tpn.on{color:var(--ink)}
.tbadges .badge{font-size:10px;height:16px;padding:0 5px}
.ta{gap:10px;padding:6px 8px 6px 10px;border-radius:7px;color:var(--ink-2);font-size:13.5px}
.ta:hover{background:var(--hover);color:var(--ink)}.ta.on{background:var(--sel);color:var(--ink);box-shadow:none}.ta.gone{opacity:.55}
.tdot{position:static;flex:none;width:7px;height:7px;background:var(--mute);opacity:.55}
.tdot.idle{background:var(--ink-2);opacity:.5}.tdot.work{background:var(--green);opacity:1;animation:none;box-shadow:0 0 0 3px var(--green-soft)}.tdot.wait{background:var(--amber);opacity:1;box-shadow:0 0 0 3px var(--amber-soft)}.tdot.off{background:transparent;box-shadow:inset 0 0 0 1.5px var(--mute);opacity:.6}
.tn{font-family:inherit;font-size:13.5px;font-weight:500}.tn .an{color:inherit!important;font-weight:inherit}
.tb{gap:6px;color:var(--mute);font-size:11.5px}.tb .tloop,.tb>span{display:inline-flex;align-items:center}
.tw{width:auto;height:18px;padding:0 6px;border-radius:99px;background:var(--amber);color:#1c1204;font-size:10.5px;font-weight:650}
.tt{font-size:11px}
.tcx{border:0;padding:0;font-size:10px;font-weight:600;color:var(--mute)}
.toff>summary{padding:4px 8px 4px 27px;font-size:12px}
.tempty{padding:4px 10px 6px 27px}
.pagehead{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.pagehead h1{display:flex;align-items:center;gap:12px}
@media (max-width:900px){
  .top.mtop{display:block}.top.mtop .in{padding:6px 10px;gap:6px}.top.mtop .brand{font-size:15px}.top.mtop .brand svg{width:24px;height:24px}
  .ide{grid-template-columns:minmax(0,1fr)}.ide>.pane{grid-column:1}
  .irail{position:fixed;z-index:31;top:var(--toph,0px);bottom:0;left:0;width:56px;transform:translateX(-110%);transition:transform .2s;padding-top:max(10px,env(safe-area-inset-top))}
  .ide.treeopen>.irail{transform:none}
  .tree{left:56px;width:min(300px,calc(100vw - 72px))}
}

/* The agent: a one-line header, the chat, and the inspector on the right. Edge to edge, no card around it. */
.chatpane{padding:0;gap:0;background:var(--bg)}
.chatpane>.updatebar{margin:8px 12px 0}
.chat{display:flex;flex-direction:column;min-height:0;height:100%;flex:1;background:var(--bg);border:0;border-radius:0;box-shadow:none}
.chd{position:relative;display:flex;align-items:center;gap:10px;flex:none;height:52px;padding:0 10px 0 18px;border-bottom:1px solid var(--line);background:var(--bg)}
.chd .presence::after{display:none}.chd .av{width:26px;height:26px;font-size:10.5px}
.ctitle{flex:1;min-width:0;display:flex;align-items:baseline;gap:10px;white-space:nowrap;overflow:hidden}
.ctitle h2{font-size:14.5px;font-weight:620;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;flex:none;max-width:60%}
.csub{min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--mute);font-size:12.5px}
.cstate{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;flex:none}.cstate i{width:7px;height:7px;border-radius:50%;background:currentColor}
.cstate.work{color:var(--green)}.cstate.wait{color:var(--amber)}.cstate.idle{color:var(--mute)}.cstate.idle i{opacity:.7}.cstate.off{color:var(--mute)}
.chd .rvbadge{flex:none}
.ctools{position:relative;display:flex;align-items:center;gap:2px;flex:none}
.ctools .seg{margin-right:6px}
.cbtn{color:var(--ink-2);gap:5px}.cbtn .cnt{min-width:17px;height:17px;padding:0 5px;border-radius:99px;background:var(--accent);color:#fff;font:650 10.5px/17px Geist,system-ui,sans-serif;text-align:center;font-variant-numeric:tabular-nums}
.subsbtn{padding:0 8px}.chat.inspon .inspbtn,.chat.inspon .subsbtn,.chd [data-hdmore][aria-expanded=true]{background:var(--sel);color:var(--ink)}
.cmenu{display:none;position:absolute;top:calc(100% + 6px);right:0;z-index:40;width:250px;padding:6px;border:1px solid var(--line-strong);border-radius:12px;background:var(--surface);box-shadow:var(--shadow-lg)}
.chd.menu .cmenu{display:block}
.cmenu .mi{display:flex;align-items:center;gap:10px;width:100%;height:34px;padding:0 10px;border:0;border-radius:7px;background:none;color:var(--ink-2);font:inherit;font-size:13px;text-align:left;cursor:pointer;text-decoration:none!important}
.cmenu .mi:hover{background:var(--hover);color:var(--ink)}.cmenu .mi>span:not(.mchk){flex:1}
.cmenu .mchk{display:none;color:var(--accent)}.cmenu .ttog.on .mchk{display:inline-flex}.cmenu .ttog{opacity:1}.cmenu .ttog .i{display:inline}
.cmenu .mrow{display:flex;align-items:center;justify-content:space-between;height:36px;padding:0 4px 0 10px;font-size:13px;color:var(--ink-2)}
.cmenu .fsz{border:0;margin:0;padding:0}.cmenu .fsz .btn{width:30px;height:28px}
.cmenu hr{border:0;border-top:1px solid var(--line);margin:5px 4px}
.cbanner{display:flex;align-items:center;gap:10px;flex:none;margin:12px 18px 0;padding:10px 12px;border-radius:10px;background:var(--amber-soft);font-size:13px;color:var(--ink)}
.cbanner>i{width:7px;height:7px;flex:none;border-radius:50%;background:var(--amber)}.cbanner>span{flex:1;min-width:0}
.cbody{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 0}
.chat.inspon .cbody{grid-template-columns:minmax(0,1fr) 320px}
.cmain{display:flex;flex-direction:column;min-width:0;min-height:0}
.insp{display:none;min-height:0;overflow-y:auto;border-left:1px solid var(--line);background:var(--side);padding:0 14px 24px}
.chat.inspon .insp{display:block}
.ihead{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;height:46px;margin:0 -14px 0;padding:0 8px 0 16px;background:var(--side);font-size:13px}
.ihead .btn{color:var(--mute)}
.ipart{margin-top:6px}.ipart+.ipart{margin-top:22px}
.ipart h3{display:flex;align-items:baseline;gap:8px;margin:0 2px 8px;font-size:11px;font-weight:620;letter-spacing:.05em;text-transform:uppercase;color:var(--mute)}.ipart h3 .muted{text-transform:none;letter-spacing:0;font-weight:500}
.ipart h3:not(:first-child){margin-top:18px}
.kv{display:grid;grid-template-columns:86px minmax(0,1fr);gap:9px 10px;margin:0 2px;font-size:12.5px}
.kv dt{color:var(--mute)}.kv dd{margin:0;color:var(--ink-2);min-width:0;overflow-wrap:anywhere;display:block}.kv dd .btn.icon{width:22px;height:20px;vertical-align:-5px;margin-left:2px;opacity:.6}.kv dd .btn.icon:hover{opacity:1}
.kv .mono{font-size:12px}.kv .client{font-weight:500}.kv .badge{font-size:10.5px}
.ctxv{font-weight:600;color:var(--ink)}.ctxv.amber{color:var(--amber)}.ctxv.red{color:var(--red)}
.kv .compactbtn,.kv .compacting{margin-left:6px;vertical-align:middle}.kv .compactbtn{height:22px;padding:0 8px;border:1px solid var(--line-strong);font-size:11.5px}
.meter{height:4px;margin-top:7px;border-radius:9px;background:var(--line-strong);overflow:hidden}.meter i{display:block;height:100%;border-radius:9px;background:var(--ink-2)}.meter.amber i{background:var(--amber)}.meter.red i{background:var(--red)}
.kv .takeswork{display:inline}.kv .takeswork .badge{cursor:pointer;border:0;font:inherit;font-size:11.5px;height:22px;padding:0 9px}
.irow{display:flex;align-items:center;gap:8px;margin:0 2px 6px;font-size:12.5px;color:var(--ink-2)}.irow form{margin:0}
.insp .subs{margin:6px 0 0;border:0;border-radius:0;background:none;max-height:none;overflow:visible}
.insp .sublist{display:flex;flex-direction:column;gap:6px}
.insp .subag{border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden}
.insp .subag>summary{flex-wrap:wrap;align-items:center;gap:3px 8px;padding:9px 10px;font-size:13px}
.insp .subdesc{flex:1 1 0;white-space:normal;font-weight:550}
.insp .submeta{flex-basis:100%;margin:0 0 0 19px;white-space:normal}
.insp .subag:not(.on){opacity:.75}.insp .subag[open]{opacity:1}
.insp .subbody{padding:2px 10px 12px}
@media (max-width:900px){
  .chd{padding:0 6px 0 4px;gap:6px}.chd .presence{display:none}.ctitle{gap:8px}.csub{display:none}.ctitle h2{max-width:none;flex:0 1 auto}
  .ctools .seg span{display:none}.ctools .seg{margin-right:2px}.inspbtn{display:none}
  .chat.inspon .cbody{grid-template-columns:minmax(0,1fr)}
  .chat.inspon .insp{position:fixed;z-index:35;inset:0 0 0 auto;width:min(360px,100vw);box-shadow:var(--shadow-lg);padding-top:env(safe-area-inset-top)}
}

/* The chat: messages in the UI type, read in a centred column; what an agent does in small mono beneath. */
.thread.term{font-family:Geist,ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.62;padding:22px 28px 16px;gap:2px;background:var(--bg)}
.thread.term>*,.thread.term>.bubble{box-sizing:border-box;width:100%;max-width:860px;margin-left:auto;margin-right:auto;align-self:center}
.thread.term .bubble{padding:10px 0 12px}
.thread.term .bubble::before{content:attr(data-who);display:block;margin-bottom:3px;font:620 13px/1.4 Geist,system-ui,sans-serif;color:var(--ink);letter-spacing:-.005em}
.thread.term .bubble.mine{margin:10px auto 6px;padding:10px 14px 11px;border:0;border-radius:12px;background:var(--surface-2)}
.thread.term .bubble.mine::before{content:"You";color:var(--ink)}
.thread.term .bubble .when{display:block;margin:4px 0 0;font-size:11px;color:var(--mute);opacity:.8}
.thread.term .bubble:not(:hover) .when .speak{opacity:0}
.thread.term .md code{font-size:.88em;padding:.08em .38em;border-radius:5px;background:var(--surface-2)}.thread.term .bubble.mine .md code,.thread.term .bubble.mine code{background:var(--surface-3)}
.thread.term .mdpre{font-size:12.5px;border-radius:9px}
.thread.term .md .mdh{color:var(--ink)}
.thread.term .md a,.thread.term .bubble a.ref{text-decoration:none;color:var(--accent)}
.thread.term .bubble.relay{padding:8px 0 8px 12px;border-left:2px solid var(--line-strong);margin:6px auto;font-size:13px;color:var(--ink-2)}
.thread.term .bubble.relay::before{display:none}
.thread.term .rhd{display:flex;align-items:center;gap:6px;margin-bottom:2px;font-size:12px;color:var(--mute)}.thread.term .rhd .an{font-weight:600;color:var(--ink-2)!important}
.thread.term .act{font:12px/1.55 "Geist Mono",ui-monospace,monospace;color:var(--mute);padding:1px 0}
.thread.term .act .aic{color:var(--mute)}.thread.term .act-text .aic{font-size:8px;line-height:20px}.thread.term .act-text{font-family:Geist,system-ui,sans-serif;font-size:13px;color:var(--ink-2)}
.thread.term .actgroup>summary{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:8px;padding:3px 0;font:12.5px/1.5 Geist,system-ui,sans-serif;color:var(--mute);cursor:pointer;list-style:none}
.thread.term .actgroup>summary::-webkit-details-marker{display:none}.thread.term .actgroup>summary:hover{color:var(--ink-2)}
.thread.term .actgroup>summary .aic{transition:transform .15s;text-align:center}.thread.term .actgroup[open]>summary .aic{transform:rotate(90deg)}
.thread.term .actgroup .alast{font-family:"Geist Mono",ui-monospace,monospace;font-size:11.5px}
.thread.term .actgroup>.act{padding-left:0;margin-left:8px;padding-left:12px;border-left:1px solid var(--line-strong)}
.thread.term .act .when,.thread.term .actgroup .when{font-size:11px;opacity:.75}
/* The composer: one box, the field and its buttons inside; the quick replies show while you're in it. */
.chatbox{flex:none;padding:8px 28px 16px;border:0;background:var(--bg)}
.chatbox>*{width:100%;max-width:860px;margin-left:auto;margin-right:auto}
.chatbox>.row{display:flex;align-items:flex-end;gap:2px;padding:6px 6px 6px 4px;border:1px solid var(--line-strong);border-radius:14px;background:var(--surface);box-shadow:var(--shadow-lg);transition:border-color .15s}
.chatbox>.row{box-shadow:var(--cshadow)}
.chatbox>.row:focus-within{border-color:color-mix(in srgb,var(--accent) 45%,var(--line-strong))}
.chatbox textarea{border:0!important;background:transparent!important;box-shadow:none!important;min-height:40px;padding:9px 8px;font:14px/1.5 Geist,system-ui,sans-serif;resize:none}
.chatbox>.row>.btn{height:34px!important;align-self:flex-end}.chatbox>.row>.btn.icon{width:34px}
.chatbox>.row>.btn.primary{width:34px;padding:0;border-radius:9px}.chatbox>.row>.btn.primary .lbl{display:none}
.chatbox .btwbtn{font-size:12.5px;color:var(--mute);padding:0 8px}
.chatbox .chips{display:none;gap:6px;margin-top:8px;flex-wrap:wrap}.chatbox:focus-within .chips{display:flex}
.chatbox .chip{height:26px;padding:0 10px;border:1px solid var(--line);border-radius:99px;background:none;color:var(--mute);font-size:12px;cursor:pointer}.chatbox .chip:hover{color:var(--ink);border-color:var(--line-strong)}
@media (max-width:900px){.thread.term{padding:14px 16px 10px}.chatbox{padding:6px 8px max(8px,env(safe-area-inset-bottom))}.chatbox .chips{display:none!important}}

/* Waiting for you: a count on the rail's bell and a toast when something new comes; the list opens when you ask. */
@media (min-width:901px){.asks.min{display:none}}
.asks{right:20px;bottom:20px;width:min(440px,calc(100vw - 40px))}
.askpanel{border-radius:14px;border:1px solid var(--line-strong);box-shadow:var(--shadow-lg);background:var(--surface)}
.askhd{background:var(--surface)}
.toast{border-radius:12px;padding:10px 12px;font-size:13px;align-items:center}
.asktoast{gap:10px;min-width:300px}.asktoast .grow{min-width:0;line-height:1.4}.asktoast b{font-weight:600}
.asktoast .askdot{flex:none}

.asktoast .i{color:inherit;margin:0}
.toasts{top:62px;bottom:auto;right:16px}
body:has(#asks:not([hidden]):not(.min)) .toasts{right:16px;left:auto}
@media (max-width:900px){
  .ide>.tree{transform:translateX(calc(-100% - 70px))}.ide.treeopen>.tree{transform:none}
  .toasts,body:has(#asks:not([hidden]):not(.min)) .toasts{top:calc(env(safe-area-inset-top) + 58px);left:10px;right:10px;bottom:auto;max-width:none}
  .asktoast{min-width:0}
}

/* The feed reads like the chat: the UI type, mono only for code. */
.msg,.event,#compose{font-family:Geist,ui-sans-serif,system-ui,sans-serif}
.msg{font-size:13.5px;padding:9px 18px 9px 20px}.msg .head{font-size:12.5px}.msg .who .person{font-weight:620}
.msg .body{line-height:1.6}.event{font-size:12.5px}.msg .meta{font-size:11px}
.msg.dm{box-shadow:inset 2px 0 0 var(--line-strong)}
.msg .an{font-weight:620}
#compose{font-size:14px}
.drawer{background:var(--side);border-left:1px solid var(--line)}
.pane{background:var(--bg)}
@media (max-width:900px){.card>.hd [data-drawertoggle]{display:none}}

/* The appearance switch shows the icon of what's chosen. */
[data-theme-btn] .th-i{display:none}[data-theme-btn="system"] .th-system,[data-theme-btn="light"] .th-light,[data-theme-btn="dark"] .th-dark{display:inline}

/* Rich messages: code with colour and a copy bar, diagrams, callouts, tables that read as tables, headings with air. */
.mdcode{margin:.7em 0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface-2)}
.mdcodehd{display:flex;align-items:center;justify-content:space-between;height:30px;padding:0 6px 0 12px;border-bottom:1px solid var(--line);font:500 11px/1 "Geist Mono",ui-monospace,monospace;color:var(--mute);text-transform:lowercase}
.mdcopy{height:22px;padding:0 8px;border:0;border-radius:6px;background:none;color:var(--mute);font:500 11.5px Geist,system-ui,sans-serif;cursor:pointer}.mdcopy:hover{background:var(--hover);color:var(--ink)}
.mdcode .mdpre,.thread.term .mdcode .mdpre{margin:0;border:0;border-radius:0;background:none;padding:10px 14px 12px;max-height:440px;overflow:auto;font-size:12.5px;line-height:1.6}
.hl-c{color:var(--hl-c);font-style:italic}.hl-s{color:var(--hl-s)}.hl-n{color:var(--hl-n)}.hl-k{color:var(--hl-k)}.hl-f{color:var(--hl-f)}.hl-t{color:var(--hl-t)}.hl-a{color:var(--hl-a)}.hl-v{color:var(--hl-v)}.hl-o{color:var(--ink-2)}.hl-p{color:var(--mute);user-select:none}.hl-d{color:var(--hl-n)}
.hl-da,.hl-dd,.hl-dh{display:inline-block;min-width:calc(100% + 28px);margin:0 -14px;padding:0 14px}
.hl-da{background:var(--hl-add);color:var(--hl-addc)}.hl-dd{background:var(--hl-del);color:var(--hl-delc)}.hl-dh{color:var(--hl-k)}
.mdmermaid{margin:.8em 0;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow-x:auto;text-align:center}
.mdmermaid svg{max-width:100%;height:auto;max-height:380px}.mdmermaid .mdpre{text-align:left;margin:0}.mdmermaid.err::after{content:"This diagram couldn't be drawn; its source is above.";display:block;margin-top:6px;font-size:11.5px;color:var(--mute)}
.mdcall{margin:.7em 0;padding:9px 13px 10px;border-radius:9px;border-left:3px solid var(--c,var(--accent));background:color-mix(in srgb,var(--c,var(--accent)) 8%,transparent)}
.mdcall>p:last-child{margin-bottom:0}.mdcallt{margin-bottom:3px;font-size:12.5px;font-weight:620;color:var(--c,var(--accent))}
.mdcall-note{--c:var(--hl-f)}.mdcall-tip{--c:var(--green)}.mdcall-important{--c:var(--accent)}.mdcall-warning{--c:var(--amber)}.mdcall-caution{--c:var(--red)}
.md .mdtable{margin:.7em 0;border:1px solid var(--line);border-radius:10px;overflow-x:auto}
.md table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.45}
.md th,.md td{border:0;border-bottom:1px solid var(--line);padding:7px 12px}.md tbody tr:last-child td{border-bottom:0}
.md th{background:var(--surface-2);font-size:12px;font-weight:600;color:var(--ink-2);white-space:nowrap}
.md tbody tr:nth-child(even){background:color-mix(in srgb,var(--surface-2) 45%,transparent)}
.md td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.thread.term .md .mdh{margin:1em 0 .35em;line-height:1.3;letter-spacing:-.01em}.thread.term .md>.mdh:first-child{margin-top:.2em}
.thread.term .md .mdh1{font-size:1.18em;font-weight:650}.thread.term .md .mdh2{font-size:1.07em;font-weight:640}.thread.term .md .mdh3,.thread.term .md .mdh4{font-size:.98em;font-weight:620;color:var(--ink-2)}
.md ul,.md ol{padding-left:1.3em}.md li{margin:.22em 0}.md li::marker{color:var(--mute)}
.md p{margin:0 0 .7em}
.md hr{margin:1.1em 0}
.md blockquote{border-left-width:2px;color:var(--ink-2)}
/* A long message folds to its start; Show all opens it (and it stays open). */
.thread .bubble.fold{max-height:440px;overflow:hidden;position:relative}
.thread .bubble.fold::after{content:"";position:absolute;left:0;right:0;bottom:0;height:90px;background:linear-gradient(transparent,var(--bg));pointer-events:none}
.thread .bubble.mine.fold::after{background:linear-gradient(transparent,var(--surface-2))}
.foldbtn{position:absolute;left:50%;bottom:10px;z-index:1;transform:translateX(-50%);height:28px;padding:0 12px;border:1px solid var(--line-strong);border-radius:99px;background:var(--surface);color:var(--ink-2);font:500 12px Geist,system-ui,sans-serif;cursor:pointer;box-shadow:var(--shadow-lg)}
.foldbtn:hover{color:var(--ink)}
.thread .bubble:not(.fold)>.foldbtn{display:none}

.themeseg button{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:0;border-radius:6px;background:none;color:var(--mute);font:inherit;font-size:12.5px;cursor:pointer}.themeseg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.12)}

/* An agent's steps: what it did in words, an icon for the kind, the folder as a chip; a command opens to its line. */
.thread.term .step{display:block;padding:1px 0;font:13px/1.5 Geist,ui-sans-serif,system-ui,sans-serif;color:var(--ink-2)}
.thread.term .step>summary,.thread.term div.step{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;align-items:center;padding:3px 6px 3px 2px;border-radius:7px;list-style:none}
.thread.term .step>summary{cursor:pointer}.thread.term .step>summary::-webkit-details-marker{display:none}
.thread.term .step>summary:hover,.thread.term div.step:hover{background:var(--hover)}
.thread.term .step .aic{display:grid;place-items:center;width:20px;height:20px;border-radius:6px;background:var(--surface-2);color:var(--ink-2)}
.thread.term .step .atx{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink-2)}
.thread.term .step .atx b{font-weight:560;color:var(--ink)}.thread.term .step .atx code{font-size:12px;background:none;border:0;padding:0;color:var(--ink-2)}
.thread.term .step .sx{color:var(--mute)}
.scwd{display:inline-block;margin-left:8px;padding:0 6px;border-radius:5px;background:var(--surface-2);font:500 10.5px/18px "Geist Mono",ui-monospace,monospace;color:var(--mute);vertical-align:1px}
.thread.term .step .when{opacity:0;transition:opacity .12s}.thread.term .step:hover .when,.thread.term .step[open] .when{opacity:.8}
.s-git .aic{color:var(--accent)!important;background:var(--accent-soft)!important}
.s-test .aic{color:var(--green)!important;background:var(--green-soft)!important}
.s-edit .aic{color:var(--amber)!important;background:var(--amber-soft)!important}
.s-search .aic,.s-web .aic{color:var(--hl-f)!important}
.stepcmd{position:relative;margin:4px 0 8px 30px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2)}
.stepcmd pre{margin:0;padding:9px 64px 10px 12px;font:12px/1.55 "Geist Mono",ui-monospace,monospace;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto}
.stepcmd .mdcopy{position:absolute;top:6px;right:6px}
.thread.term .actgroup>.act.step{border-left:0;margin-left:0;padding-left:0}
.thread.term .actgroup>summary{color:var(--ink-2)}
/* Icons and quiet text a touch darker; counts in the accent, not orange. */
.rl{color:var(--ink-2)}.rl:hover,.rl.on{color:var(--ink)}
.thead .btn,.ihead .btn,.cbtn{color:var(--ink-2)}
.rpill,.rpill.amber{background:var(--accent);color:#fff}
.tw{background:var(--accent-soft);color:var(--accent)}

/* Tree: one tag per row; a violet dot for news you haven't opened. */
.tb .tsub{color:var(--accent)}
.ta.unread .tn{color:var(--ink);font-weight:600}
.ta.unread .tb::after{content:"";width:7px;height:7px;border-radius:50%;background:var(--accent)}
.ta.unread .tt{display:none}
/* The chat: days, where you left off, what it's doing right now. */
.tday,.newmark{display:flex;align-items:center;gap:12px;margin:14px auto 6px!important;font-size:11.5px;font-weight:600;color:var(--mute)}
.tday::before,.tday::after,.newmark::before,.newmark::after{content:"";flex:1;height:1px;background:var(--line)}
.newmark{color:var(--accent)}.newmark::before,.newmark::after{background:color-mix(in srgb,var(--accent) 45%,transparent)}
.nowline{display:flex;align-items:center;gap:10px;flex:none;width:calc(100% - 56px);max-width:860px;margin:0 auto 2px;padding:7px 12px;border-radius:10px;background:var(--surface-2);font-size:12.5px;color:var(--ink-2)}
.nowline[hidden]{display:none}
.nowdot{width:8px;height:8px;flex:none;border-radius:50%;background:var(--green);animation:pulse 1.6s infinite}
.nowtx{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nowtx b{font-weight:560;color:var(--ink)}.nowtx code{font-size:11.5px;background:none;border:0;padding:0}
.nowt{flex:none;font-variant-numeric:tabular-nums;font-weight:600;color:var(--ink)}.nowall{flex:none;color:var(--mute);font-variant-numeric:tabular-nums}
@media (max-width:900px){.nowline{width:calc(100% - 16px)}.nowall{display:none}}
/* Message actions, on hover. */
.thread .bubble{position:relative}
.bact{position:absolute;top:-14px;right:0;z-index:2;display:none;gap:2px;padding:2px;border:1px solid var(--line);border-radius:8px;background:var(--surface);box-shadow:var(--shadow-lg)}
.thread .bubble:hover>.bact{display:flex}.thread .bubble.mine>.bact{top:-14px;right:8px}
.bact button{display:grid;place-items:center;width:26px;height:24px;border:0;border-radius:6px;background:none;color:var(--ink-2);cursor:pointer}.bact button:hover{background:var(--hover);color:var(--ink)}
@media (hover:none){.bact{display:none!important}}
/* An image the agent looked at: Show, then a thumbnail. */
.stepimg{display:inline-flex;align-items:center;gap:4px;margin-right:8px;padding:0 7px;height:20px;border-radius:6px;background:var(--accent-soft);color:var(--accent)!important;font-size:11.5px;font-weight:550;text-decoration:none!important;vertical-align:middle}
.thread.term .step .when:has(.stepimg){opacity:1}
.stepimg.thumb{height:auto;padding:0;background:none;border-radius:6px;overflow:hidden;border:1px solid var(--line)}
.stepimg.thumb img{display:block;height:44px;max-width:120px;object-fit:cover}
.mdmermaid.done:not(.err){cursor:zoom-in}

/* A loop starting or stopping: its kind as the line, its prompt beside it (opens in full). */
.s-loop .aic{color:var(--accent)!important;background:var(--accent-soft)!important}
.s-loop .atx b{font-weight:600;color:var(--ink)}.s-loop.off .atx b{font-weight:500;color:var(--ink-2)}
.lpq{margin-left:8px;color:var(--mute)}.lpq::before{content:"“"}.lpq::after{content:"”"}

/* Diffs: added and removed lines in clear green and red, a bar in the margin, line numbers tinted; hunks as a band. */
.hl-da{box-shadow:inset 3px 0 0 var(--green)}.hl-dd{box-shadow:inset 3px 0 0 var(--red)}
.hl-dh{background:var(--diff-hunk);color:var(--accent)}
tr.da{background:var(--hl-add)}tr.dd{background:var(--hl-del)}
tr.da .ln{background:var(--diff-add-ln);opacity:1;color:var(--hl-addc)}tr.dd .ln{background:var(--diff-del-ln);opacity:1;color:var(--hl-delc)}
tr.da .dc{color:var(--hl-addc)}tr.dd .dc{color:var(--hl-delc)}
tr.da .dmk,tr.dd .dmk{font-weight:700}
tr.da td:first-child{box-shadow:inset 3px 0 0 var(--green)}tr.dd td:first-child{box-shadow:inset 3px 0 0 var(--red)}
tr.dh td{background:var(--diff-hunk)}
.dfile{border-radius:10px;overflow:hidden}

.mdcode:has(.hl-da,.hl-dd){background:var(--surface)}

.thread.term .md pre code,.md pre code{background:none!important;padding:0;border:0;border-radius:0;font-size:inherit}

/* Notes in the inspector: read as Markdown, Edit opens the field. */
.inotes>summary{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin:0 2px;cursor:pointer;list-style:none}.inotes>summary::-webkit-details-marker{display:none}
.inote{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;background:var(--surface);font-size:12.5px;line-height:1.55;color:var(--ink-2);max-height:220px;overflow:auto}
.inotes[open]>summary{display:none}.inotes form{margin:0 2px}.inotes textarea{width:100%;min-height:150px;font-size:12.5px}

/* Terminals on a machine (Versions page). */
.terms{margin-top:10px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.terms>summary{display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;list-style:none;font-size:13px}.terms>summary::-webkit-details-marker{display:none}
.terms>summary .muted{margin-left:4px}.terms[open]>summary{border-bottom:1px solid var(--line)}
.termsbody{padding:10px 12px 12px}
.termlist{display:flex;flex-direction:column;gap:2px}
.termrow{display:flex;align-items:center;gap:10px;padding:7px 6px;border-radius:9px}.termrow:hover{background:var(--hover)}
.termrow form{margin:0}.termrow .small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.termic{display:grid;place-items:center;width:28px;height:28px;flex:none;border-radius:8px;background:var(--surface-2);color:var(--ink-2)}.termic.ag{background:var(--accent-soft);color:var(--accent)}
.termnew{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
.termnew input,.termnew select{height:30px;font-size:12.5px}.termnew input[name=name]{width:120px}.termnew input[name=cwd]{min-width:160px;font-family:"Geist Mono",ui-monospace,monospace}.termnew select{width:auto}
.termsoff{display:flex;gap:10px;align-items:flex-start;color:var(--ink-2);font-size:13px}.termsoff p{margin:0}.termsoff .i{margin-top:2px;color:var(--mute)}

/* Phones: the rail's buttons big enough to hit, its counts tucked in; no floating "waiting" pill (a dot on the menu
   button says something waits, the bell in the menu opens it, and a toast tells what's new). */
.hasasks{position:relative}.hasasks::after{content:"";position:absolute;top:5px;right:5px;width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 2px var(--surface)}
.chd .mtree.hasasks::after,.top .treebtn.hasasks::after{box-shadow:0 0 0 2px var(--bg)}
@media (max-width:900px){
  .irail{width:64px;gap:6px;padding-left:0;padding-right:0}
  .rl{width:48px;height:44px;border-radius:11px}.rl .i{width:20px;height:20px}
  .rpill{top:2px;right:2px;min-width:15px;height:15px;font-size:9.5px;line-height:15px;padding:0 3px}
  .tree{left:64px;width:min(300px,calc(100vw - 80px))}
  .asks.min{display:none!important}
  body:has(#asks.min:not([hidden])) .chatmode .thread{padding-bottom:12px}
}

/* Slash commands above the composer; the bell; Stop on the live line; a new agent button; asks in the chat. */
.slashmenu{display:flex;flex-direction:column;margin:0 auto 6px;padding:4px;border:1px solid var(--line-strong);border-radius:12px;background:var(--surface);box-shadow:var(--shadow-lg);max-height:280px;overflow:auto}
.slashmenu button{display:flex;align-items:baseline;gap:10px;width:100%;padding:6px 10px;border:0;border-radius:7px;background:none;color:var(--ink-2);font:inherit;font-size:13px;text-align:left;cursor:pointer}
.slashmenu button b{font:600 12.5px "Geist Mono",ui-monospace,monospace;color:var(--ink);min-width:120px}.slashmenu button.on,.slashmenu button:hover{background:var(--sel)}
.slashft{padding:4px 10px 2px;font-size:11px;color:var(--mute)}
.watchbtn.on{color:var(--accent)!important;background:var(--accent-soft)}
.nowstop{flex:none;height:24px;gap:4px;color:var(--ink-2)}.nowstop:hover{color:var(--red);background:var(--red-soft)}
.newag{gap:4px;padding:0 7px;color:var(--ink-2)!important;font-size:12px}
.chatasks{flex:none;width:calc(100% - 56px);max-width:860px;margin:6px auto;display:flex;flex-direction:column;gap:8px}.chatasks[hidden]{display:none}
.chatasks .ask{border:1px solid color-mix(in srgb,var(--amber) 40%,var(--line));border-radius:12px;background:var(--surface);box-shadow:var(--shadow-lg)}
@media (max-width:900px){.chatasks{width:calc(100% - 16px)}}

.chatoff{max-width:860px;margin:6px auto 0;padding:0 4px}

/* Your message: a defined box; its time and delivery mark readable on it. */
.thread.term .bubble.mine{border:1px solid var(--line-strong);background:var(--surface-2)}
.thread.term .bubble .when{color:var(--mute);opacity:1}
.thread.term .bubble.mine .when{color:var(--ink-2)}
.dlv.ok,.thread.term .bubble.mine .dlv.ok{color:var(--green-ink);font-weight:600;opacity:1}
.dlv.wait{opacity:1}

`;

// Client behaviour: relative times, day separators, copy buttons, dialogs, toasts, progressive form submits
// (no full reload) and live updates over a WebSocket.
export const SCRIPT = `
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  // Each live region remembers the HTML the hub drew it from, so a redraw that changes nothing leaves it alone.
  // What counts is the content: relative times ("5m ago", kept current here anyway) and the page to come back to
  // (it changes when the address is pinned) don't make a card or region different.
  const sig = (h) => h.replace(/(<time\\b[^>]*>)[^<]*(<\\/time>)/g, "$1$2").replace(/(name="back" value=")[^"]*/g, "$1").replace(/([?&](?:amp;)?back=)[^"&]*/g, "$1");
  $$("[data-region]").forEach((el) => (el._src = sig(el.outerHTML)));
  $$("#asks .ask").forEach((c) => (c._src = sig(c.outerHTML)));
  const ICON_SPEAK = ${JSON.stringify(icon("volume", 13))}, ICON_STOP = ${JSON.stringify(icon("square", 13))};
  const rel = (ts) => { const s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return "just now"; if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; };
  const short = (ts) => { const s = Math.round((Date.now() - ts) / 1000);
    return s < 60 ? "now" : s < 3600 ? Math.floor(s / 60) + "m" : s < 86400 ? Math.floor(s / 3600) + "h" : Math.floor(s / 86400) + "d"; };
  const left = (ts) => { const m = Math.max(0, Math.round((ts - Date.now()) / 60000)); return m < 60 ? m + "m left" : Math.floor(m / 60) + "h " + (m % 60) + "m left"; };
  function tick() {
    $$("time[data-ts]").forEach((t) => (t.textContent = "short" in t.dataset ? short(+t.dataset.ts) : rel(+t.dataset.ts)));
    $$("[data-until]").forEach((t) => (t.textContent = left(+t.dataset.until)));
    $$("[data-from][data-to]").forEach((b) => { const a = +b.dataset.from, z = +b.dataset.to; b.style.width = Math.max(0, Math.min(100, (100 * (z - Date.now())) / (z - a))) + "%"; });
  }
  function days(root = document) {
    $$(".feed", root).forEach((feed) => {
      $$(".day", feed).forEach((d) => d.remove());
      let last = "";
      const today = new Date().toDateString(), yest = new Date(Date.now() - 864e5).toDateString();
      $$("[data-day]", feed).forEach((el) => {
        const d = new Date(+el.dataset.day), k = d.toDateString();
        if (k === last) return; last = k;
        const sep = document.createElement("div"); sep.className = "day";
        sep.textContent = k === today ? "Today" : k === yest ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
        el.before(sep);
      });
    });
  }
  function toast(text, err) {
    if (!text) return;
    let box = $(".toasts"); if (!box) { box = document.createElement("div"); box.className = "toasts"; document.body.append(box); }
    const t = document.createElement("div"); t.className = "toast" + (err ? " err" : "");
    t.innerHTML = err ? '${icon("x")}' : '${icon("check")}';
    const span = document.createElement("span"); span.textContent = text; t.append(span); box.append(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, err ? 6000 : 3500);
  }
  window.icToast = toast;
  // Images and files in a composer: pasted, dropped or picked, sent with the message. Images are scaled down in the
  // browser; any other file goes as it is (up to 10 MB), for the agent to save with save_attachment.
  const MAX_SIDE = 1600, MAX_IMGS = 4, MAX_FILE = 10 * 1024 * 1024;
  const IMAGE_RE = /^image[/](png|jpeg|webp|gif)$/;
  const kb = (n) => n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1024 / 1024).toFixed(1) + " MB";
  async function shrink(file) {
    if (file.type === "image/gif" || (file.type === "image/png" && file.size < 600000)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      if (k === 1 && file.size < 600000) return file;
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.86));
      return blob ? new File([blob], (file.name || "image").replace(/[.][^.]*$/, "") + ".jpg", { type: "image/jpeg" }) : file;
    } catch { return file; }
  }
  function drawTray(f) {
    const tray = f.querySelector(".imgtray"); if (!tray) return;
    tray.hidden = !f._imgs.length; tray.textContent = "";
    f._imgs.forEach((it, i) => {
      const d = document.createElement("span"); d.className = it.url ? "imgthumb" : "imgthumb filechip";
      if (it.url) { const img = document.createElement("img"); img.src = it.url; img.alt = it.file.name; d.appendChild(img); }
      else { d.innerHTML = ${JSON.stringify(icon("file", 15))}; const n = document.createElement("span"); n.className = "fname"; n.textContent = it.file.name || "file"; const s = document.createElement("span"); s.className = "fsize"; s.textContent = kb(it.file.size); d.append(n, s); d.title = it.file.name; }
      const x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.title = "Remove";
      x.onclick = () => { if (it.url) URL.revokeObjectURL(it.url); f._imgs.splice(i, 1); drawTray(f); };
      d.appendChild(x); tray.appendChild(d);
    });
    const t = f.querySelector("textarea"); if (t) t.required = !f._imgs.length;
  }
  async function addImages(f, files) {
    const all = [...files];
    if (!all.length) return false;
    // Shrinking a big phone screenshot takes a moment; live redraws leave the composer alone meanwhile.
    f._adding = (f._adding || 0) + 1;
    try {
      for (const x of all) {
        if (f._imgs.length >= MAX_IMGS) { toast("At most " + MAX_IMGS + " files per message", true); break; }
        if (IMAGE_RE.test(x.type)) { const file = await shrink(x); f._imgs.push({ file, url: URL.createObjectURL(file) }); }
        else if (x.size > MAX_FILE) toast((x.name || "That file") + " is over 10 MB", true);
        else if (!x.size) toast((x.name || "That file") + " is empty (or a folder: zip it first)", true);
        else f._imgs.push({ file: x, url: "" });
      }
    } finally { f._adding--; }
    drawTray(f); return true;
  }
  function bindImages(f) {
    if (f._imgsBound) return; f._imgsBound = true; f._imgs = f._imgs || [];
    const t = f.querySelector("textarea"), pick = f.querySelector("[data-imgpick]"), btn = f.querySelector("[data-imgbtn]");
    // While the photo picker is open, live redraws leave this composer alone (on a phone the page is hidden meanwhile,
    // and reconnecting redraws it); if it was replaced anyway, the images go to the composer on the page now.
    if (btn && pick) {
      btn.onclick = () => { f._picking = Date.now(); pick.click(); };
      pick.oncancel = () => { f._picking = 0; };
      pick.onchange = async () => { const live = (f.id && document.getElementById(f.id)) || f; f._picking = 0; await addImages(live, pick.files); pick.value = ""; };
    }
    if (t) f.addEventListener("paste", async (e) => { const files = [...(e.clipboardData ? e.clipboardData.files : [])]; if (files.length) { e.preventDefault(); await addImages(f, files); } });
    f.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.items].some((i) => i.kind === "file")) { e.preventDefault(); f.classList.add("dropping"); } });
    f.addEventListener("dragleave", () => f.classList.remove("dropping"));
    f.addEventListener("drop", async (e) => { f.classList.remove("dropping"); if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); await addImages(f, e.dataTransfer.files); } });
    drawTray(f);
  }

  // btw mode in an agent's chat: side questions, answered from its context without adding to it. Remembered per
  // agent while the page is open, so live redraws keep it.
  const btwOn = {}, btwFresh = {};
  function bindBtw(f) {
    const key = f.dataset.agent, btn = f.querySelector("[data-btwtoggle]"), bar = f.querySelector(".btwbar"), field = () => f.querySelector("textarea"); // looked up each time: a send replaces it
    const mode = f.querySelector("input[name=mode]"), thread = f.querySelector("input[name=thread]");
    if (!btn || !mode) return;
    const apply = () => {
      const on = !!btwOn[key];
      mode.value = on ? "btw" : ""; thread.value = on && btwFresh[key] ? "new" : "";
      btn.classList.toggle("on", on); f.classList.toggle("btwmode", on); if (bar) bar.hidden = !on;
      const t = field(); if (t) t.placeholder = on ? "Side question (btw)" : "";
    };
    btn.onclick = () => { btwOn[key] = !btwOn[key]; apply(); field()?.focus(); };
    const nw = f.querySelector("[data-btwnew]");
    if (nw) nw.onclick = (e) => { e.preventDefault(); btwFresh[key] = true; apply(); toast("Your next side question starts a new thread"); field()?.focus(); };
    f.addEventListener("submit", () => { btwFresh[key] = false; });
    apply();
  }

  // Editing a message no agent has taken yet (Edit on your message): it's held on the hub meanwhile, so nothing
  // delivers it; sending replaces it, Esc or "Send it unchanged" lets it go as it was. Per agent, kept across redraws.
  const editing = {};
  async function unsendOp(id, op) {
    const data = new FormData(); data.set("id", id); data.set("op", op); data.set("back", location.pathname + location.search);
    try {
      const res = await fetch("/action/unsend", { method: "POST", body: data, credentials: "same-origin" });
      const u = new URL(res.url), err = u.searchParams.get("err") || (res.ok ? null : "Couldn't change it (HTTP " + res.status + ")");
      if (res.ok) await swap(await res.text());
      if (err) toast(err, true);
      return !err;
    } catch { toast("Network error — try again", true); return false; }
  }
  function bindEdit(f) {
    const key = f.dataset.agent, input = f.querySelector("input[name=edit]"), bar = f.querySelector(".editbar"), field = () => f.querySelector("textarea");
    if (!input) return;
    const ed = editing[key];
    // Sent, cancelled or delivered meanwhile (here or in another tab): the edit is over, and what you had typed before comes back.
    if (ed && !document.querySelector('.bubble.held[data-mid="' + ed.id + '"]')) {
      delete editing[key];
      const back = () => { const t = field(); if (t && (!t.value || t.value === ed.raw)) { t.value = ed.stash; drafts.set(t); t.oninput?.(); } };
      if (f._busy) f._afterSend = back; else back(); // sending the edit: after the send has cleared the form
    }
    const on = editing[key];
    input.value = on ? on.id : ""; f.classList.toggle("editmode", !!on); if (bar) bar.hidden = !on;
    const t = field(); if (t && !f.classList.contains("btwmode")) t.placeholder = on ? "Edit your message" : "";
    const send = f.querySelector("[data-editsend]"), cancel = f.querySelector("[data-editcancel]");
    if (send) send.onclick = (e) => { e.preventDefault(); on && unsendOp(on.id, "send"); };
    if (cancel) cancel.onclick = (e) => { e.preventDefault(); on && unsendOp(on.id, "cancel"); };
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-unsend]"); if (!b) return;
    const bubble = b.closest("[data-mid]"), id = bubble.dataset.mid, op = b.dataset.unsend;
    if (op !== "edit") return unsendOp(id, op);
    const raw = bubble.dataset.raw || "";
    if (!$("#chatform") || !(await unsendOp(id, "hold"))) return;
    const f = $("#chatform"), t = f.querySelector("textarea"), key = f.dataset.agent; // the redraw may have replaced the form
    editing[key] = { id, raw, stash: editing[key] ? editing[key].stash : t.value };
    t.value = raw; drafts.set(t); t.oninput?.(); bindEdit(f); t.focus(); t.setSelectionRange(t.value.length, t.value.length);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !e.target.matches?.("#chat-input")) return;
    const ed = editing[e.target.form?.dataset.agent]; if (ed) { e.preventDefault(); unsendOp(ed.id, "send"); }
  });

  // Appearance: as the system has it, light or dark (a cookie, read before the page paints; see page()).
  const THEMES = ["system", "light", "dark"];
  function themeShow() {
    const t = document.documentElement.dataset.theme || "system";
    $$("[data-theme-btn]").forEach((b) => { b.dataset.themeBtn = t; b.title = "Appearance: " + (t === "system" ? "as your system" : t) + " (click to change)"; });
    $$("[data-theme-set]").forEach((b) => b.classList.toggle("on", b.dataset.themeSet === t));
  }
  document.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-theme-set]");
    if (!e.target.closest("[data-theme-btn]") && !pick) return;
    const cur = document.documentElement.dataset.theme || "system", next = pick ? pick.dataset.themeSet : THEMES[(THEMES.indexOf(cur) + 1) % 3];
    if (next === "system") { delete document.documentElement.dataset.theme; document.cookie = "ic_theme=; path=/; max-age=0; samesite=lax"; }
    else { document.documentElement.dataset.theme = next; document.cookie = "ic_theme=" + next + "; path=/; max-age=31536000; samesite=lax"; }
    $$("meta[name=theme-color]").forEach((m) => { if (next === "system") { m.setAttribute("media", m.content === "#141416" ? "(prefers-color-scheme: dark)" : "(prefers-color-scheme: light)"); } else { m.content = next === "dark" ? "#141416" : "#f4f4f6"; m.removeAttribute("media"); } });
    themeShow();
    icToast(next === "system" ? "Appearance follows your system" : next === "light" ? "Light mode" : "Dark mode");
  });
  // Code blocks: Copy puts the code (not the colours) on the clipboard.
  document.addEventListener("click", async (e) => {
    const b = e.target.closest && e.target.closest("[data-copycode], [data-copystep]"); if (!b) return;
    e.preventDefault();
    const pre = b.closest(".mdcode, .stepcmd")?.querySelector("pre"); if (!pre) return;
    try { await navigator.clipboard.writeText(pre.textContent); b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1400); } catch { b.textContent = "Select and copy"; }
  });
  // Diagrams (mermaid): the library loads only when a message has one; each is drawn once and kept, so live updates
  // don't redraw it. In the page's theme; if it can't be drawn, its source stays with a note.
  let mmLib = null, mmN = 0;
  const mmDone = new Map();
  function mermaids() {
    const els = $$("[data-mermaid]:not(.done)"); if (!els.length) return;
    const dark = (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
    mmLib = mmLib || new Promise((ok, no) => { const s = document.createElement("script"); s.src = "/vendor/mermaid-11.17.2.min.js"; s.onload = () => ok(window.mermaid); s.onerror = no; document.head.append(s); });
    mmLib.then(async (m) => {
      const pal = dark
        ? { background: "#1f1f22", primaryColor: "#2a2a31", secondaryColor: "#25252b", tertiaryColor: "#222226", primaryBorderColor: "#4b4b57", primaryTextColor: "#e9e9ec", textColor: "#c9cad1", lineColor: "#80818b", edgeLabelBackground: "#1f1f22", noteBkgColor: "#2e2a1f", noteTextColor: "#e9e9ec", pie: ["#8f80ff", "#3ecf80", "#f0aa3c", "#5fb3f9", "#f2636d", "#6fd0d6", "#c3a6ff", "#a3a3ad"] }
        : { background: "#ffffff", primaryColor: "#f3f3f7", secondaryColor: "#f7f7fa", tertiaryColor: "#fafafc", primaryBorderColor: "#c8c8d2", primaryTextColor: "#16171c", textColor: "#3b3d48", lineColor: "#7d7f89", edgeLabelBackground: "#ffffff", noteBkgColor: "#fff7e6", noteTextColor: "#16171c", pie: ["#5b47e0", "#15a050", "#c27407", "#1f78d1", "#d93a45", "#0d7480", "#9a6bf0", "#8a8f98"] };
      const tv = { fontFamily: "Geist, system-ui, sans-serif", fontSize: "13px", ...pal, mainBkg: pal.primaryColor, nodeBorder: pal.primaryBorderColor, clusterBkg: pal.secondaryColor, clusterBorder: pal.primaryBorderColor, titleColor: pal.primaryTextColor, actorBkg: pal.primaryColor, actorBorder: pal.primaryBorderColor, actorTextColor: pal.primaryTextColor, signalColor: pal.lineColor, signalTextColor: pal.textColor, pieStrokeColor: pal.background, pieStrokeWidth: "2px", pieOuterStrokeWidth: "0px", pieTitleTextSize: "15px", pieSectionTextColor: "#ffffff", pieSectionTextSize: "13px", pieLegendTextColor: pal.textColor, pieLegendTextSize: "13px", pieOpacity: "1" };
      pal.pie.forEach((c, i) => (tv["pie" + (i + 1)] = c));
      delete tv.pie;
      m.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: tv, flowchart: { curve: "basis" } });
      for (const el of els) {
        if (el.classList.contains("done")) continue;
        const src = el.textContent, key = (dark ? "d:" : "l:") + src;
        el.classList.add("done");
        let svg = mmDone.get(key);
        if (!svg) { try { svg = (await m.render("mm" + ++mmN, src)).svg; mmDone.set(key, svg); } catch { el.classList.add("err"); document.getElementById("dmm" + mmN)?.remove(); continue; } }
        el.innerHTML = svg;
      }
    }).catch(() => els.forEach((el) => el.classList.add("done", "err")));
  }
  // ---- Reading aids ----
  // What you've seen of each agent (the latest message it sent you that you had open): the tree dots the others,
  // and an agent's chat draws a "New" line where you left off. Kept in this browser.
  const seenGet = () => { try { return JSON.parse(localStorage.getItem("ic_seen") || "null"); } catch { return null; } };
  const seenSet = (v) => { try { localStorage.setItem("ic_seen", JSON.stringify(v)); } catch {} };
  const leftAt = {};
  function unread() {
    let seen = seenGet();
    const rows = $$(".ta[data-k]");
    if (!seen) { seen = {}; rows.forEach((r) => { if (r.dataset.last) seen[r.dataset.k] = Number(r.dataset.last); }); }
    const h = document.getElementById("chathd"), here = h ? h.dataset.agent : null;
    if (here) {
      if (!(here in leftAt)) leftAt[here] = seen[here] ?? null;
      const top = Math.max(0, ...$$("#thread .bubble[data-mid]").map((b) => Number(b.dataset.mid) || 0));
      const row = rows.find((r) => r.dataset.k === here);
      seen[here] = Math.max(seen[here] || 0, top, row && row.dataset.last ? Number(row.dataset.last) : 0);
    }
    seenSet(seen);
    rows.forEach((r) => r.classList.toggle("unread", !!r.dataset.last && Number(r.dataset.last) > (seen[r.dataset.k] || 0)));
    // The New line, before the first message from it you hadn't seen when you opened this chat.
    const th = document.getElementById("thread"); if (!th || !here) return;
    th.querySelector(".newmark")?.remove();
    const was = leftAt[here];
    if (was == null) return;
    const first = $$(".bubble[data-mid]:not(.mine)", th).find((b) => Number(b.dataset.mid) > was);
    if (first) { const m = document.createElement("div"); m.className = "newmark"; m.innerHTML = "<span>New</span>"; first.before(m); }
  }
  // Days in a chat: Today, Yesterday, then the date, between the messages where the day changes.
  function dayLines() {
    const th = document.getElementById("thread"); if (!th) return;
    $$(".tday", th).forEach((d) => d.remove());
    let last = "";
    const today = new Date(), yest = new Date(Date.now() - 86400000);
    const label = (d) => d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === yest.toDateString() ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    for (const el of [...th.children]) {
      const t = el.querySelector("time[data-ts]"); if (!t) continue;
      const d = new Date(Number(t.dataset.ts)), k = d.toDateString();
      if (k !== last) { if (last || k !== today.toDateString()) { const sep = document.createElement("div"); sep.className = "tday"; sep.innerHTML = "<span></span>"; sep.firstChild.textContent = label(d); el.before(sep); } last = k; }
    }
  }
  // How long it has been at it (the live line above the composer), every second.
  const span = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return s < 60 ? s + "s" : s < 3600 ? Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s" : Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m"; };
  setInterval(() => $$("[data-elapsed]").forEach((e) => (e.textContent = span(Date.now() - Number(e.dataset.elapsed)))), 1000);
  // On a message: Copy, Quote (into the composer) and Ask about it (a side question, like /btw).
  function msgActions() {
    const form = document.getElementById("chatform"), field = document.getElementById("chat-input");
    const canAsk = !!document.querySelector("[data-btwtoggle]");
    $$("#thread .bubble[data-mid]").forEach((b) => {
      if (b.querySelector(".bact")) return;
      const bar = document.createElement("span"); bar.className = "bact";
      bar.innerHTML = '<button type="button" data-a="copy" title="Copy">${icon("copy", 13)}</button>' + (field ? '<button type="button" data-a="quote" title="Quote in your reply">${icon("message", 13)}</button>' : "") + (canAsk && !b.classList.contains("mine") ? '<button type="button" data-a="ask" title="Ask about this on the side (btw)">${icon("sparkles", 13)}</button>' : "");
      b.append(bar);
    });
    if (form && !form._bact) {
      form._bact = true;
      document.addEventListener("click", async (e) => {
        const btn = e.target.closest && e.target.closest(".bact button"); if (!btn) return;
        const b = btn.closest(".bubble"), sel = String(getSelection() || "").trim();
        const text = sel && b.contains(getSelection().anchorNode) ? sel : [...b.childNodes].filter((n) => !(n.classList && (n.classList.contains("when") || n.classList.contains("bact") || n.classList.contains("rhd")))).map((n) => n.textContent).join("\\n").trim();
        if (btn.dataset.a === "copy") { try { await navigator.clipboard.writeText(text); icToast("Copied"); } catch {} return; }
        const f = document.getElementById("chat-input"); if (!f) return;
        const quoted = text.slice(0, 600).split("\\n").map((l) => "> " + l).join("\\n") + "\\n\\n";
        if (btn.dataset.a === "ask") { const t = document.querySelector("[data-btwtoggle]"); if (t && !t.classList.contains("on")) t.click(); }
        f.value = quoted + f.value; f.focus(); f.setSelectionRange(f.value.length, f.value.length); f.dispatchEvent(new Event("input"));
      });
    }
  }
  // An image an agent looked at: fetched from its machine the first time you open it, then shown as a thumbnail.
  const lpGet = () => { try { return JSON.parse(localStorage.getItem("ic_lp") || "{}"); } catch { return {}; } };
  function stepImages() {
    const lp = lpGet();
    $$("a.stepimg[data-lp]").forEach((a) => { const u = lp[a.dataset.lp]; if (u && !a.querySelector("img")) { a.href = u; a.classList.add("thumb"); a.innerHTML = '<img alt="" loading="lazy">'; a.firstChild.src = u; } });
  }
  document.addEventListener("click", async (e) => {
    const a = e.target.closest && e.target.closest("a.stepimg[data-lp]"); if (!a || a.classList.contains("thumb") || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (a.dataset.busy) return; a.dataset.busy = "1"; const was = a.innerHTML; a.innerHTML = '<span>Fetching…</span>';
    try {
      const r = await fetch(a.getAttribute("href"), { credentials: "same-origin" });
      if (!r.ok) { const why = new DOMParser().parseFromString(await r.text(), "text/html").querySelector("p.muted, p")?.textContent; throw new Error(why || ""); }
      if (!(r.headers.get("content-type") || "").startsWith("image/")) throw new Error("");
      const lp = lpGet(); lp[a.dataset.lp] = new URL(r.url).pathname; try { localStorage.setItem("ic_lp", JSON.stringify(lp)); } catch {}
      stepImages(); a.click();
    } catch (err) { a.innerHTML = was; icToast((err && err.message) || "Couldn't fetch it from the agent's machine", true); }
    delete a.dataset.busy;
  }, true);
  // A diagram opens full-screen in the image viewer (pinch or zoom to read a big one).
  document.addEventListener("click", (e) => {
    const m = e.target.closest && e.target.closest(".mdmermaid.done:not(.err)"); if (!m || e.target.closest("a")) return;
    const svg = m.querySelector("svg"); if (!svg) return;
    const c = svg.cloneNode(true); c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const bg = getComputedStyle(document.body).backgroundColor;
    c.style.background = bg; c.style.maxWidth = "none";
    const url = URL.createObjectURL(new Blob([c.outerHTML], { type: "image/svg+xml" }));
    const a = document.createElement("a"); a.className = "att"; a.href = url; a.dataset.name = "Diagram"; a.hidden = true; document.body.append(a); a.click(); a.remove();
  });
  // Keys: J/K or ⌘↑/⌘↓ move between agents, ⌘1–9 open the agent in that place, ⌘/ goes to the message field, Esc
  // closes the inspector or a menu.
  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest && e.target.closest("input, textarea, select, [contenteditable]");
    if (document.querySelector("dialog[open]")) return;
    const rows = $$(".tree .ta[href]").filter((r) => r.offsetParent);
    const cur = rows.findIndex((r) => r.classList.contains("on"));
    const go = (i) => { const r = rows[Math.max(0, Math.min(rows.length - 1, i))]; if (r) location.href = r.href; };
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "/") { e.preventDefault(); document.getElementById("chat-input")?.focus(); return; }
    if (mod && (e.key === "ArrowDown" || e.key === "ArrowUp") && !typing) { e.preventDefault(); go(cur + (e.key === "ArrowDown" ? 1 : -1)); return; }
    if (mod && /^[1-9]$/.test(e.key) && !e.shiftKey && !e.altKey) { e.preventDefault(); go(Number(e.key) - 1); return; }
    if (typing || mod || e.altKey) return;
    if (e.key === "j" || e.key === "k") { e.preventDefault(); go(cur + (e.key === "j" ? 1 : -1)); }
    else if (e.key === "Escape" && document.querySelector("section.chat.inspon")) { e.preventDefault(); inspSet(false); }
  });
  // A machine's terminals (Versions page): asked for when you open the panel, again after you start or close one.
  async function loadTerms(d) {
    const body = d.querySelector(".termsbody");
    try { const r = await fetch("/terminals?host=" + encodeURIComponent(d.dataset.terms), { credentials: "same-origin" }); body.innerHTML = await r.text(); } catch { body.innerHTML = '<p class="small muted">Couldn’t reach it.</p>'; }
    bindScreen();
  }
  document.addEventListener("toggle", (e) => { const d = e.target; if (d.matches && d.matches("details.terms") && d.open) loadTerms(d); }, true);
  function termsOpen() { const h = new URL(location.href).searchParams.get("terms"); if (!h) return; const d = $$("details.terms").find((x) => x.dataset.terms === h); if (d && !d.open) d.open = true; }
  // The bell in an agent's header: a notification when its turn ends (and a toast here, if this page is open).
  const stateWas = {};
  document.addEventListener("click", async (e) => {
    const b = e.target.closest && e.target.closest("[data-watch]"); if (!b) return;
    const on = !b.classList.contains("on");
    const f = new FormData(); f.set("label", b.dataset.watch); f.set("on", on ? "1" : "0");
    try { await fetch("/agent/watch", { method: "POST", body: f, credentials: "same-origin" }); } catch { return; }
    b.classList.toggle("on", on);
    icToast(on ? "You'll get a notification when " + b.dataset.watch + " is done" : "No notification for " + b.dataset.watch);
  });
  function watchDone() {
    const h = document.getElementById("chathd"); if (!h) return;
    const k = h.dataset.agent, st = h.dataset.state, was = stateWas[k];
    stateWas[k] = st;
    if (was === "working" && st !== "working" && h.querySelector(".watchbtn")) { h.querySelector(".watchbtn").classList.remove("on"); icToast(k.split("/")[1] + " is done"); }
  }
  // Stop on the line that says what it's doing: Esc into its terminal.
  document.addEventListener("click", async (e) => {
    const b = e.target.closest && e.target.closest("[data-stopnow]"); if (!b) return;
    const f = new FormData(); f.set("agent", b.dataset.stopnow); f.set("stop", "1");
    b.disabled = true;
    try { const r = await fetch("/agent-keys", { method: "POST", body: f, credentials: "same-origin" }); const t = await r.text(); icToast(/screrr/.test(t) ? (new DOMParser().parseFromString(t, "text/html").querySelector("p")?.textContent || "Couldn't stop it") : "Sent Esc: it stops what it's doing", /screrr/.test(t)); } catch {}
    b.disabled = false;
  });
  // Slash commands: "/" in an agent's message field lists its commands; one sent goes into its terminal as typed.
  const SLASH = {
    claude: [["/compact", "Summarize the conversation to free context"], ["/clear", "Start over with an empty context"], ["/context", "How full its context is"], ["/model", "Pick the model"], ["/cost", "What this session has cost"], ["/loop", "Run a prompt on a loop"], ["/reload-plugins", "Load new plugin versions"], ["/status", "Its version, model and account"], ["/agents", "Its subagents"], ["/mcp", "Its MCP servers"]],
    codex: [["/compact", "Summarize the conversation to free context"], ["/new", "Start a new conversation"], ["/model", "Pick the model and effort"], ["/status", "Its settings and token use"], ["/diff", "Its uncommitted changes"], ["/review", "Review its changes"], ["/mcp", "Its MCP servers"]],
  };
  let slashMenu = null, slashAt = 0;
  function slashShow(t) {
    const form = t.form; if (!form || !form.dataset.keys) return slashHide();
    const m = /^\\/([\\w:-]*)$/.exec(t.value); if (!m) return slashHide();
    const list = (SLASH[form.dataset.client] || SLASH.claude).filter(([c]) => c.slice(1).startsWith(m[1]));
    if (!list.length) return slashHide();
    if (!slashMenu) { slashMenu = document.createElement("div"); slashMenu.className = "slashmenu"; form.querySelector(".row").before(slashMenu); }
    slashAt = Math.min(slashAt, list.length - 1);
    slashMenu.innerHTML = list.map(([c, d], i) => '<button type="button" class="' + (i === slashAt ? "on" : "") + '" data-slash="' + c + '"><b>' + c + "</b><span>" + d + "</span></button>").join("") + '<div class="slashft">Typed into its terminal · ↑↓ Enter</div>';
  }
  function slashHide() { slashMenu?.remove(); slashMenu = null; slashAt = 0; }
  document.addEventListener("input", (e) => { if (e.target.id === "chat-input") { slashAt = 0; slashShow(e.target); } });
  document.addEventListener("keydown", (e) => {
    if (!slashMenu || e.target.id !== "chat-input") return;
    const items = $$("[data-slash]", slashMenu);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); slashAt = (slashAt + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; slashShow(e.target); }
    else if ((e.key === "Enter" || e.key === "Tab") && items[slashAt] && e.target.value !== items[slashAt].dataset.slash) { e.preventDefault(); e.stopImmediatePropagation(); e.target.value = items[slashAt].dataset.slash; slashHide(); }
    else if (e.key === "Escape") slashHide();
  }, true);
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-slash]"); if (!b) return; const t = document.getElementById("chat-input"); t.value = b.dataset.slash; slashHide(); t.focus(); });
  document.addEventListener("submit", async (e) => {
    const form = e.target; if (form.id !== "chatform" || !form.dataset.keys) return;
    const t = form.querySelector("#chat-input"), v = (t?.value || "").trim();
    if (!/^\\/[a-z][\\w:-]*(\\s|$)/i.test(v) || (form._imgs && form._imgs.length)) return;
    e.preventDefault(); e.stopImmediatePropagation(); slashHide();
    const f = new FormData(); f.set("agent", form.dataset.agent); f.set("text", v); f.set("enter", "1");
    try {
      const r = await fetch("/agent-keys", { method: "POST", body: f, credentials: "same-origin" }); const txt = await r.text();
      if (/screrr/.test(txt)) icToast(new DOMParser().parseFromString(txt, "text/html").querySelector("p")?.textContent || "Couldn't type it", true);
      else { t.value = ""; t.dispatchEvent(new Event("input")); icToast("Typed " + v.split(/\\s/)[0] + " into " + form.dataset.label + "'s terminal"); }
    } catch {}
  }, true);
  // A new agent you started: its page waits for it to connect (it takes a few seconds), then shows it.
  (() => {
    const u = new URL(location.href); if (!u.searchParams.has("starting")) return;
    if (document.getElementById("chathd")) { u.searchParams.delete("starting"); history.replaceState(history.state, "", u.pathname + u.search); return; }
    const n = Number(sessionStorage.getItem("ic_starting") || 0);
    if (n > 30) { sessionStorage.removeItem("ic_starting"); return; }
    sessionStorage.setItem("ic_starting", String(n + 1));
    const e = document.querySelector(".chat .empty div"); if (e) e.textContent = "Starting " + (u.searchParams.get("agent") || "").split("/")[1] + "… it shows up here as soon as it connects.";
    setTimeout(() => location.reload(), 3000);
  })();
  // A step you opened (its exact command) stays open when the chat redraws.
  const openSteps = new Set();
  document.addEventListener("toggle", (e) => { const d = e.target; if (d.matches && d.matches("details.step")) { if (d.open) openSteps.add(d.dataset.mid); else openSteps.delete(d.dataset.mid); } }, true);
  function reopenSteps() { openSteps.forEach((m) => { const d = document.querySelector('details.step[data-mid="' + m + '"]'); if (d) d.open = true; }); }
  // Long messages fold to their start (not the latest one, and not one you opened).
  const unfolded = new Set();
  function longFolds() {
    const all = $$("#thread .bubble"); const last = all[all.length - 1];
    for (const b of all) {
      if (b === last || unfolded.has(b.dataset.mid) || b.dataset.folded) continue;
      b.dataset.folded = "1";
      if (b.scrollHeight < 760) continue;
      b.classList.add("fold");
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "foldbtn"; btn.textContent = "Show all";
      btn.onclick = () => { b.classList.remove("fold"); unfolded.add(b.dataset.mid); };
      b.append(btn);
    }
  }
  function toggleTree() {
    const ide = document.getElementById("ide"); if (!ide) return;
    if (matchMedia("(max-width: 900px)").matches) { ide.classList.toggle("treeopen"); return; }
    const hide = !ide.classList.contains("notree"); ide.classList.toggle("notree", hide);
    document.cookie = "ic_tree=" + (hide ? "hidden" : "shown") + "; path=/; max-age=31536000; samesite=lax";
  }
  // The workspace fills what's visible: with a phone keyboard open, that's the part above it, so the composer stays in view.
  const fit = () => {
    const st = document.documentElement.style, top = $(".top"), vv = window.visualViewport;
    if (vv) { st.setProperty("--vvh", vv.height + "px"); st.setProperty("--vvt", vv.offsetTop + "px"); }
    if (top) st.setProperty("--toph", top.offsetHeight + "px");
    composerTop();
  };
  // On a phone the Waiting-for-you pill sits just above the chat's composer, never over its send button: --cbb is how
  // far the composer's top is from the bottom of the screen (it grows with the text, and moves with the keyboard).
  const composerTop = () => {
    const cb = document.getElementById("chatform");
    document.documentElement.style.setProperty("--cbb", cb ? Math.max(0, innerHeight - cb.getBoundingClientRect().top) + "px" : "0px");
  };
  const watchComposer = () => {
    const cb = document.getElementById("chatform");
    if (cb && !cb.dataset.watched && window.ResizeObserver) { cb.dataset.watched = "1"; new ResizeObserver(composerTop).observe(cb); }
    composerTop();
  };
  window.visualViewport?.addEventListener("resize", fit); window.visualViewport?.addEventListener("scroll", fit); addEventListener("resize", fit); addEventListener("DOMContentLoaded", fit); fit();
  // Read an agent's reply aloud with the device's own voice (prose only: code blocks, times and buttons are skipped).
  // Tapping again, or another reply, stops it.
  let speaking = null;
  // The reply's language, not the phone's: a Norwegian phone reading an English reply needs an English voice.
  // Common words decide; English unless the text is clearly Norwegian, Swedish or Danish.
  const WORDS = { en: "the and is to of that it you this with for not are be have",
    nb: "og ikke det jeg er på som med til av har en et vi du kan skal",
    sv: "och inte det jag är på som med till av har en ett vi du kan ska",
    da: "og ikke det jeg er på som med til af har en et vi du kan skal" };
  function textLang(text) {
    const words = text.toLowerCase().match(/[a-zæøåäö]+/g) || [], score = {};
    for (const [l, list] of Object.entries(WORDS)) { const set = new Set(list.split(" ")); score[l] = words.filter((w) => set.has(w)).length; }
    if (/[æø]/.test(text)) score.nb += 1; if (/[äö]/.test(text)) score.sv += 1; if (/\\baf\\b/i.test(text)) score.da += 2;
    const best = Object.keys(score).sort((a, b) => score[b] - score[a])[0];
    return best === "en" || score[best] <= score.en ? "en" : best;
  }
  // A voice for that language, in the phone's own region when it has one (en-GB on a British phone).
  function voiceFor(lang) {
    const vs = speechSynthesis.getVoices(), mine = (navigator.language || "").toLowerCase();
    const ok = vs.filter((v) => (lang === "nb" ? /^(nb|no|nn)/ : new RegExp("^" + lang)).test(v.lang.toLowerCase()));
    return ok.find((v) => v.lang.toLowerCase() === mine) || ok.find((v) => v.default) || ok[0] || null;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-speak]"); if (!b || !window.speechSynthesis) return;
    const was = speaking; speechSynthesis.cancel(); $$(".speak.on").forEach((x) => { x.classList.remove("on"); x.innerHTML = ICON_SPEAK; });
    if (was === b) { speaking = null; return; }
    const copy = b.closest(".bubble").cloneNode(true); copy.querySelectorAll("pre, .when, .speak, .rhd").forEach((x) => x.remove());
    copy.querySelectorAll("p, li, h1, h2, h3, h4, tr, br").forEach((x) => x.after(" ")); // paragraphs read as separate sentences
    const u = new SpeechSynthesisUtterance(copy.textContent.replace(/\\s+/g, " ").trim()); const lang = textLang(u.text); u.lang = lang; const v = voiceFor(lang); if (v) u.voice = v;
    const done = () => { if (speaking === b) { speaking = null; b.classList.remove("on"); b.innerHTML = ICON_SPEAK; } };
    u.onend = done; u.onerror = done;
    speaking = b; b.classList.add("on"); b.innerHTML = ICON_STOP; speechSynthesis.speak(u);
  });
  // On phones the tree slides over the page: a tap outside it (on the dimmed backdrop) or Escape closes it.
  const closeTree = () => document.getElementById("ide")?.classList.remove("treeopen");
  document.addEventListener("click", (e) => { const ide = document.getElementById("ide"); if (ide?.classList.contains("treeopen") && !e.target.closest(".tree, .irail, [data-treetoggle]")) { e.preventDefault(); e.stopPropagation(); closeTree(); } }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTree(); });
  document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") { e.preventDefault(); toggleTree(); } });

  // Folded tool steps you opened or closed stay that way when the thread redraws live.
  const folds = {};
  // Unsent text in the composers survives live redraws, navigation and reloads: kept per page (agent or channel)
  // in this browser, cleared when the message is sent.
  const draftKey = (t) => { const u = new URL(location.href); return "ic_draft:" + t.id + ":" + (u.searchParams.get("agent") || u.searchParams.get("channel") || ""); };
  const drafts = { get: (t) => { try { return localStorage.getItem(draftKey(t)) || ""; } catch { return ""; } },
    set: (t) => { if (!t.isConnected) return; try { t.value.trim() ? localStorage.setItem(draftKey(t), t.value) : localStorage.removeItem(draftKey(t)); } catch {} } };
  // The chat field: its draft, growing with its text, Enter to send.
  function chatField(t) {
    if (!t.value) t.value = drafts.get(t);
    t.addEventListener("input", () => drafts.set(t));
    const grow = () => { t.style.height = ""; const base = t.offsetHeight; t.style.height = "0"; const h = t.scrollHeight + 2; t.style.height = h > base ? h + "px" : ""; };
    t.oninput = grow; if (t.value) grow();
    t.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (t.value.trim() || (t.form._imgs && t.form._imgs.length)) t.form.requestSubmit(); } };
  }
  // Scrolled up in a chat: a round ↓ button over its foot jumps back to the latest, with a dot once something new
  // has arrived meanwhile. One button for the page, placed over whichever thread is showing.
  var jumpBtn = null, jumpNew = false;
  function jumpShow() {
    const th = document.getElementById("thread");
    if (!jumpBtn) {
      jumpBtn = document.createElement("button");
      jumpBtn.type = "button"; jumpBtn.className = "tojump"; jumpBtn.title = "Jump to the latest (End, or Ctrl/⌘+End while typing)"; jumpBtn.setAttribute("aria-label", "Jump to the latest");
      jumpBtn.innerHTML = ${JSON.stringify(icon("chevron", 18))} + '<span class="jdot"></span>';
      jumpBtn.onclick = () => { const t = document.getElementById("thread"); if (t) t.scrollTo({ top: t.scrollHeight, behavior: "smooth" }); };
      document.body.append(jumpBtn);
      addEventListener("resize", jumpShow, { passive: true });
      // The keys for it: End, unless you're in a field with text (there it moves the cursor), and Ctrl/⌘+End anywhere.
      // Not Ctrl+PageDown: browsers keep that for switching tabs.
      // Page Up / Page Down scroll the chat a page from the message box too, as in Slack (the page itself already does).
      document.addEventListener("keydown", (e) => {
        const t = document.getElementById("thread");
        if ((e.key !== "PageUp" && e.key !== "PageDown") || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || !t || e.target.id !== "chat-input") return;
        e.preventDefault(); t.scrollBy({ top: (e.key === "PageDown" ? 1 : -1) * (t.clientHeight - 60), behavior: "smooth" });
      });
      document.addEventListener("keydown", (e) => {
        if (e.key !== "End" || e.shiftKey || e.altKey || !document.getElementById("thread")) return;
        const f = e.target.closest?.("input, textarea, select, [contenteditable]");
        if (!(e.ctrlKey || e.metaKey) && f && !(f.id === "chat-input" && !f.value)) return;
        e.preventDefault(); jumpBtn.onclick();
      });
    }
    const far = !!th && th.scrollHeight - th.scrollTop - th.clientHeight > 240;
    if (!far) jumpNew = false;
    jumpBtn.classList.toggle("on", far); jumpBtn.classList.toggle("new", far && jumpNew);
    if (th) { const r = th.getBoundingClientRect(); jumpBtn.style.left = Math.round(r.left + r.width / 2 - 20) + "px"; jumpBtn.style.top = Math.round(r.bottom - 56) + "px"; }
  }

  // The trail: the agents you've had open, most recent first (kept in this browser). The chat's back button
  // returns to the one before, and ⌘K lists them under Recent, like Slack's recent conversations.
  function trail() { try { return JSON.parse(localStorage.getItem("ic_trail") || "[]"); } catch { return []; } }
  function shownAgent() { const f = document.getElementById("chatform"); return f ? f.dataset.agent : ""; }
  function trailBack() {
    const b = document.querySelector("[data-trailback]");
    if (!b) return;
    const known = new Set($$("#tree a.ta").map((a) => a.dataset.k));
    const prev = trail().find((k) => k !== shownAgent() && known.has(k));
    b.hidden = !prev;
    if (prev) { b.href = "/dashboard?view=agents&agent=" + encodeURIComponent(prev); b.title = "Back to " + prev; }
  }
  if (shownAgent()) { try { localStorage.setItem("ic_trail", JSON.stringify([shownAgent(), ...trail().filter((k) => k !== shownAgent())].slice(0, 15))); } catch {} }
  // ↑ in an empty message field picks your latest message no agent has taken yet (↑ again: the one before); then
  // Enter or E edits it (E as in Slack), Backspace or Delete cancels it, and Esc, ↓ past the newest or typing lets go. Like Slack's edit-last.
  var picked = null;
  function pickables() { return $$("#thread .bubble.mine").filter((b) => b.querySelector('[data-unsend="edit"]')); }
  function pick(b) {
    $$(".bubble.picked").forEach((x) => x.classList.remove("picked"));
    picked = b ? b.dataset.mid : null;
    if (b) { b.classList.add("picked"); b.scrollIntoView({ block: "nearest" }); }
  }
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (!t.matches || !t.matches("#chat-input") || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    const list = pickables();
    if (!picked) {
      if (e.key !== "ArrowUp" || t.value || !list.length || (t.form && t.form.classList.contains("editmode"))) return;
      e.preventDefault(); pick(list[list.length - 1]); return;
    }
    const cur = list.find((b) => b.dataset.mid === picked), i = list.indexOf(cur);
    if (!cur) return pick(null);
    const key = (op) => { e.preventDefault(); e.stopPropagation(); pick(null); const b = cur.querySelector('[data-unsend="' + op + '"]'); if (b) b.click(); };
    if (e.key === "ArrowUp") { e.preventDefault(); if (i > 0) pick(list[i - 1]); }
    else if (e.key === "ArrowDown") { e.preventDefault(); pick(list[i + 1] || null); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); pick(null); }
    else if (e.key === "Enter" || e.key === "e") key("edit");
    else if (e.key === "Backspace" || e.key === "Delete") key("cancel");
    else pick(null);
  }, true);

  // The dock of what your agents wait on: minimized stays minimized until something new arrives; the tab's title
  // carries the count, so a background tab shows it too.
  const baseTitle = document.title.replace(/^\\(\\d+\\) /, "");
  let asksOpened = false;
  function bindAsks() {
    const box = document.getElementById("asks");
    const ids = box && !box.hidden ? $$(".ask", box).map((a) => a.dataset.mid) : [];
    const store = (v) => { try { sessionStorage.setItem("ic_asks_min", JSON.stringify(v)); } catch {} };
    document.title = ids.length ? "(" + ids.length + ") " + baseTitle : baseTitle;
    if (box) pushBadge(ids.length);
    pushShow();
    $$("[data-asksopen]").forEach((b) => b.onclick = () => { if (!box) return; if (document.getElementById("ide")?.classList.contains("treeopen")) closeTree(); box.classList.remove("min"); asksOpened = true; store(null); const f = box.querySelector(".askopt, input, button.primary"); f && !matchMedia("(pointer: coarse)").matches && f.focus(); });
    // The rail's bell carries the count; the dock itself stays out of the way until you open it.
    const bell = document.getElementById("railasks");
    if (bell) { bell.hidden = !ids.length; const p = bell.querySelector(".rpill"); if (p) p.textContent = ids.length > 99 ? "99+" : String(ids.length); }
    $$("[data-treetoggle]").forEach((b) => b.classList.toggle("hasasks", ids.length > 0));
    if (!ids.length) { asksOpened = false; return; }
    // Something new: a small toast says who asks what, with a button to open it. It never covers what you're doing.
    let seen = []; try { seen = JSON.parse(sessionStorage.getItem("ic_asks_seen") || "[]"); } catch {}
    const fresh = $$(".ask", box).filter((a) => !seen.includes(a.dataset.mid));
    try { sessionStorage.setItem("ic_asks_seen", JSON.stringify(ids)); } catch {}
    if (fresh.length && !asksOpened) askToast(fresh, box);
    box.classList.toggle("min", !asksOpened);
    $$("[data-askstoggle]", box).forEach((b) => b.onclick = () => { const m = !box.classList.contains("min"); box.classList.toggle("min", m); asksOpened = !m; store(m ? ids : null); });
  }
  function askToast(fresh, box) {
    let tray = $(".toasts"); if (!tray) { tray = document.createElement("div"); tray.className = "toasts"; document.body.append(tray); }
    $$(".asktoast", tray).forEach((t) => t.remove());
    const a = fresh[0], who = a.querySelector(".askname")?.textContent || "An agent", what = a.querySelector(".askk")?.textContent || a.querySelector(".askq, .askhead, h3, b")?.textContent || "is waiting for you";
    const t = document.createElement("div"); t.className = "toast asktoast";
    t.innerHTML = '<span class="askdot"></span><span class="grow"><b></b> <span class="muted"></span></span><button type="button" class="btn xs">Open</button><button type="button" class="btn ghost xs icon" title="Later">${icon("x", 13)}</button>';
    t.querySelector("b").textContent = who + (fresh.length > 1 ? " and " + (fresh.length - 1) + " more" : "");
    t.querySelector(".muted").textContent = what.trim().slice(0, 90);
    const bye = () => { t.classList.add("out"); setTimeout(() => t.remove(), 300); };
    t.querySelector(".btn.xs:not(.icon)").onclick = () => { bye(); box.classList.remove("min"); asksOpened = true; };
    t.querySelector(".btn.icon").onclick = bye;
    tray.append(t);
    let timer = setTimeout(bye, 12000);
    t.onmouseenter = () => clearTimeout(timer); t.onmouseleave = () => { timer = setTimeout(bye, 5000); };
  }
  // A ticket's tabs (ticketview.ts): the open one is the page's hash (#mr, #ask), so it survives a reload and Back; a
  // link to something inside a tab (an MR, a file in its diff) opens that tab first. Ask's dot is an answer you haven't
  // seen there yet.
  function tkPane() { return document.querySelector(".tkpane[data-tabs]"); }
  function tkShow(tab, write) {
    const pane = tkPane(); if (!pane) return;
    const panels = $$(".tkpanel[data-tab]", pane);
    if (!panels.length) return;
    if (!panels.some((p) => p.dataset.tab === tab)) tab = panels[0].dataset.tab;
    const was = pane.dataset.tab; pane.dataset.tab = tab;
    panels.forEach((p) => p.classList.toggle("on", p.dataset.tab === tab));
    $$(".tknav a[data-tab]", pane).forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
    if (write) history.replaceState(history.state, "", location.pathname + location.search + (tab === panels[0].dataset.tab ? "" : "#" + tab));
    if (write && was !== tab) { const nav = document.getElementById("tknav"); if (nav && nav.getBoundingClientRect().top <= 1) pane.querySelector('.tkpanel[data-tab="' + tab + '"]').scrollIntoView({ block: "start" }); }
    tkDots();
  }
  function tkDots() {
    const pane = tkPane(); if (!pane) return;
    $$(".tknav a[data-tab] .tkdot", pane).forEach((d) => {
      const tab = d.closest("a").dataset.tab, key = "ic_tkseen_" + pane.dataset.tabs + "_" + tab;
      let seen = 0; try { seen = Number(localStorage.getItem(key) || 0); } catch {}
      const at = Number(d.dataset.at);
      if (pane.dataset.tab === tab && at > seen) { try { localStorage.setItem(key, String(at)); } catch {} seen = at; }
      d.hidden = at <= seen;
    });
  }
  function tkHash() {
    const pane = tkPane(); if (!pane) return;
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return tkShow(pane.dataset.tab);
    if (pane.querySelector('.tkpanel[data-tab="' + CSS.escape(h) + '"]')) return tkShow(h);
    const el = document.getElementById(h), panel = el && el.closest(".tkpanel");
    if (!panel) return;
    tkShow(panel.dataset.tab);
    const fold = el.closest("details"); if (fold) fold.open = true;
    requestAnimationFrame(() => el.scrollIntoView({ block: "center" }));
  }
  window.addEventListener("hashchange", tkHash);
  function bindTabs() {
    $$(".tknav a[data-tab]").forEach((a) => a.onclick = (e) => { e.preventDefault(); tkShow(a.dataset.tab, true); });
    const pane = tkPane(); if (pane) tkShow(pane.dataset.tab);
  }
  // An agent's screen (screen.ts): its terminal, redrawn every 2 seconds while the window is open, and keys sent to it.
  let scrTimer = null, scrAgent = "", scrBusy = false, scrCw = 0, scrFit = false;
  try { scrFit = localStorage.getItem("ic_scrfit") === "1"; } catch {}
  // "Fit to this screen": the columns and rows that fit this window (the whole screen on a phone), for the agent's tmux.
  function scrFitSize() {
    const d = document.getElementById("dlg-screen"), pre = d && d.querySelector("pre.term"), wrap = d && d.querySelector(".scrwrap");
    if (!pre || !wrap || !scrCw) return "";
    const cs = getComputedStyle(pre), lh = parseFloat(cs.lineHeight) || 17;
    const phone = matchMedia("(max-width:640px)").matches;
    const w = (phone ? d.clientWidth : innerWidth * 0.96 - 4) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;
    const h = (phone ? innerHeight : innerHeight * 0.94) - (d.offsetHeight - wrap.offsetHeight) - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return Math.max(40, Math.min(300, Math.floor(w / scrCw))) + "x" + Math.max(10, Math.min(120, Math.floor(h / lh)));
  }
  const scrUnfit = () => { if (scrAgent) fetch("/agent-screen?agent=" + encodeURIComponent(scrAgent) + "&fit=off", { credentials: "same-origin", cache: "no-store", keepalive: true }).catch(() => {}); };
  async function scrLoad(form) {
    const body = document.getElementById("scrbody");
    if (!body || (scrBusy && !form)) return;
    scrBusy = true;
    try {
      const pre = body.querySelector("pre.term");
      const atEnd = !pre || pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
      const keep = pre ? pre.scrollTop : 0;
      const r = form
        ? await fetch("/agent-keys", { method: "POST", body: form, credentials: "same-origin" })
        : await fetch("/agent-screen?agent=" + encodeURIComponent(scrAgent) + (scrFit && scrFitSize() ? "&fit=" + scrFitSize() : ""), { credentials: "same-origin", cache: "no-store" });
      body.innerHTML = await r.text();
      const np = body.querySelector("pre.term");
      // The window grows to fit the terminal (columns and rows), as far as the screen allows; CSS caps it.
      const dlg = document.getElementById("dlg-screen");
      if (np && dlg) {
        if (!scrCw && scrFit) setTimeout(() => scrLoad(), 50); // fitted as soon as a character's width is known
        if (!scrCw) { const m = document.createElement("span"); m.textContent = "0".repeat(50); np.appendChild(m); scrCw = m.getBoundingClientRect().width / 50; m.remove(); if (scrCw) dlg.style.setProperty("--cw", scrCw + "px"); }
        dlg.style.setProperty("--cols", np.style.getPropertyValue("--cols") || "110");
        dlg.style.setProperty("--rows", np.style.getPropertyValue("--rows") || "30");
      }
      if (np) np.scrollTop = atEnd ? np.scrollHeight : keep;
    } catch {} finally { scrBusy = false; }
  }
  function bindScreen() {
    const d = document.getElementById("dlg-screen");
    $$("[data-screen]").forEach((b) => b.onclick = () => {
      if (!d) return;
      scrAgent = b.dataset.screen;
      d.querySelector("[data-scrname]").textContent = b.dataset.screenname || scrAgent;
      const keys = b.dataset.screenkeys === "1";
      d.querySelector("[data-scrkeys]").hidden = !keys;
      d.querySelector("[data-scrnokeys]").hidden = keys;
      const fb = d.querySelector("[data-scrfit]"); if (fb) fb.hidden = !keys;
      // Codex takes a line into the running turn with Enter: one Send is enough there.
      d.querySelector("[data-scrnow]").hidden = b.dataset.screenclient === "codex";
      d.querySelector("#scrbody").innerHTML = '<div class="screrr"><p>Loading its screen…</p></div>';
      d.showModal(); d.tabIndex = -1; d.focus();
      // Back (the phone's back gesture or button) closes the window instead of leaving the page.
      if (!(history.state && history.state.scr)) history.pushState({ scr: 1 }, "", location.href);
      scrLoad();
      clearInterval(scrTimer);
      scrTimer = setInterval(() => { if (!d.open) return clearInterval(scrTimer); if (!document.hidden) scrLoad(); }, 2000);
    });
    if (!d || d._bound) return;
    d._bound = true;
    d.addEventListener("close", () => {
      clearInterval(scrTimer); if (scrFit) scrUnfit();
      if (history.state && history.state.scr) { d._popping = true; history.back(); }
    });
    window.addEventListener("popstate", () => { if (d._popping) { setTimeout(() => (d._popping = false), 0); return; } if (d.open) { d._popping = true; d.close(); setTimeout(() => (d._popping = false), 0); } });
    const fitBtn = d.querySelector("[data-scrfit]");
    if (fitBtn) {
      fitBtn.setAttribute("aria-pressed", scrFit ? "true" : "false");
      fitBtn.onclick = () => {
        scrFit = !scrFit;
        try { localStorage.setItem("ic_scrfit", scrFit ? "1" : "0"); } catch {}
        fitBtn.setAttribute("aria-pressed", scrFit ? "true" : "false");
        if (!scrFit) scrUnfit();
        setTimeout(() => scrLoad(), scrFit ? 0 : 500);
      };
    }
    const post = (fields) => { const f = new FormData(); f.set("agent", scrAgent); for (const [k, v] of fields) f.append(k, v); return scrLoad(f); };
    $$(".scrk", d).forEach((k) => k.onclick = () => {
      if (k.dataset.key === "ctrl-c" && !confirm("Send Ctrl+C? It interrupts what the agent is doing (twice exits it).")) return;
      post([["key", k.dataset.key]]);
    });
    d.querySelector("[data-scrstop]").onclick = () => { if (confirm("Stop what it's doing now? (Esc: the session stays.)")) post([["stop", "1"]]); };
    const input = d.querySelector("[data-scrtype] input[name=text]"), enter = d.querySelector("[data-scrtype] input[name=enter]");
    const send = (now) => {
      if (!input.value.trim()) return input.focus();
      const fields = [["text", input.value]];
      if (now) fields.push(["now", "1"]); else if (enter.checked) fields.push(["enter", "1"]);
      input.value = "";
      post(fields);
    };
    d.querySelector("[data-scrsend]").onclick = () => send(false);
    d.querySelector("[data-scrnow]").onclick = () => send(true);
    input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); send(e.metaKey || e.ctrlKey); } };
  }
  // ⋯ in a chat's header on a phone: shows or hides the rest of the header; stays open across live updates.
  let hdOpen = false;
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-hdmore]");
    if (!b) return;
    hdOpen = !hdOpen; hdMenu();
  });
  function hdMenu() { $$("[data-hdmore]").forEach((b) => { b.setAttribute("aria-expanded", String(hdOpen)); const h = b.closest(".chd"); if (h) h.classList.toggle("menu", hdOpen); }); }
  // ⋯ closes on a click elsewhere (not on what's inside it, so the text size can be tried a few times) and on Esc.
  document.addEventListener("click", (e) => { if (hdOpen && !e.target.closest(".cmenu, [data-hdmore]")) { hdOpen = false; hdMenu(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && hdOpen) { hdOpen = false; hdMenu(); } });
  // The agent's inspector (subagents, session): open or closed as you left it; it opens by itself when a subagent
  // starts (more running than when you last looked at this agent).
  const inspSet = (open) => { const c = document.querySelector("section.chat"); if (!c) return; c.classList.toggle("inspon", open); document.cookie = "ic_insp=" + (open ? "1" : "0") + "; path=/; max-age=31536000; samesite=lax"; };
  document.addEventListener("click", (e) => { if (e.target.closest("[data-insp]")) { e.preventDefault(); inspSet(!document.querySelector("section.chat")?.classList.contains("inspon")); } });
  function inspAuto() {
    const h = document.getElementById("chathd"); if (!h) return;
    const k = "ic_subs:" + h.dataset.agent, n = Number(h.dataset.subs || 0);
    let seen = null; try { seen = sessionStorage.getItem(k); sessionStorage.setItem(k, String(n)); } catch {}
    if (seen !== null && n > Number(seen) && !matchMedia("(max-width: 900px)").matches) inspSet(true);
  }
  // An image in a message opens in a viewer over the page, not as its own page: the dashboard installed as an app on a
  // phone has no back button to come back from one. Close with ×, a tap beside it, Esc, or back (gesture or button).
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a.att, a.attl");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    let v = document.getElementById("imgview");
    if (!v) {
      v = document.createElement("dialog");
      v.id = "imgview"; v.className = "imgview"; v.setAttribute("autofocus", ""); v.tabIndex = -1;
      v.innerHTML = '<div class="ivbar"><span class="ivname"></span><a class="btn ghost sm icon ivdl" title="Download" download>${icon("download", 18)}</a><button type="button" class="btn ghost sm icon ivx" title="Close">${icon("x", 22)}</button></div><div class="ivbody"><img alt=""></div>';
      document.body.appendChild(v);
      v.querySelector(".ivx").onclick = () => v.close();
      v.querySelector(".ivbody").onclick = (ev) => { if (ev.target.tagName !== "IMG") v.close(); };
      v.addEventListener("close", () => { if (history.state && history.state.iv) { v._popping = true; history.back(); } });
      window.addEventListener("popstate", () => { if (v._popping) { setTimeout(() => (v._popping = false), 0); return; } if (v.open) { v._popping = true; v.close(); setTimeout(() => (v._popping = false), 0); } });
    }
    // From the files grid (gallery.ts), ← and → step through its images.
    const grid = a.closest("[data-gallery]");
    v._list = grid ? [...grid.querySelectorAll("a.att")] : [a];
    v._at = v._list.indexOf(a);
    const show = (el) => {
      const href = el.getAttribute("href"), name = el.dataset.name || el.getAttribute("title") || el.textContent.trim() || "image";
      v.querySelector("img").src = href; v.querySelector("img").alt = name;
      v.querySelector(".ivname").textContent = name + (v._list.length > 1 ? "  ·  " + (v._at + 1) + " / " + v._list.length : "");
      v.querySelector(".ivdl").href = href; v.querySelector(".ivdl").setAttribute("download", name);
    };
    v.onkeydown = (ev) => {
      const step = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
      if (!step || v._list.length < 2) return;
      ev.preventDefault();
      v._at = (v._at + step + v._list.length) % v._list.length;
      show(v._list[v._at]);
    };
    show(a);
    v.showModal(); v.focus();
    if (!(history.state && history.state.iv)) history.pushState({ iv: 1 }, "", location.href);
  });
  // Your time zone, for the work log's days and its evening summary: a cookie the server reads, and the summary's form.
  function bindTz() {
    let z = ""; try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}
    if (!z) return;
    $$("input[data-tz]").forEach((i) => (i.value = z));
    const want = "ic_tz=" + encodeURIComponent(z);
    if (document.cookie.split("; ").includes(want)) return;
    document.cookie = want + "; path=/; max-age=31536000; samesite=lax";
    if (new URL(location.href).searchParams.get("view") === "work") location.reload();
  }
  // The subagents strip in an agent's chat (subview.ts) stays folded or open as you last left it.
  document.addEventListener("toggle", (e) => {
    if (e.target.id === "subs-box") try { localStorage.setItem("ic_subs", e.target.open ? "1" : "0"); } catch {}
  }, true);
  function bind(root = document) {
    watchComposer();
    const sb = document.getElementById("subs-box");
    if (sb) try { sb.open = localStorage.getItem("ic_subs") === "1"; } catch {}
    bindAsks();
    bindTz();
    bindScreen();
    bindTabs();
    hdMenu();
    inspAuto();
    themeShow();
    mermaids();
    longFolds();
    reopenSteps();
    unread();
    watchDone();
    termsOpen();
    dayLines();
    msgActions();
    stepImages();
    if (picked) { const b = document.querySelector('.bubble[data-mid="' + picked + '"]'); if (b && b.querySelector('[data-unsend="edit"]')) b.classList.add("picked"); else picked = null; }
    trailBack();
    $$("#compose", root).forEach((t) => { if (!t.value) t.value = drafts.get(t); t.addEventListener("input", () => drafts.set(t)); });
    $$("textarea[data-chat]", root).forEach(chatField);
    // The tree: hide/show (⌘B; on phones it slides over), folded projects remembered, the drawer on feeds.
    const ide = document.getElementById("ide");
    $$("[data-treetoggle]", root).forEach((b) => b.onclick = () => toggleTree());
    $$("[data-drawertoggle]", root).forEach((b) => b.onclick = () => { if (!ide) return; const off = !ide.classList.contains("nodrawer"); ide.classList.toggle("nodrawer", off); document.cookie = "ic_drawer=" + (off ? "off" : "on") + "; path=/; max-age=31536000; samesite=lax"; });
    $$("details.tp", root).forEach((d) => d.ontoggle = () => {
      const closed = new Set((cookie("ic_tc") || "").split(",").map(decodeURIComponent).filter(Boolean));
      if (d.open) closed.delete(d.dataset.tp); else closed.add(d.dataset.tp);
      document.cookie = "ic_tc=" + [...closed].map(encodeURIComponent).join(",") + "; path=/; max-age=31536000; samesite=lax";
    });
    // The composer's recipients follow the chosen project: its people and agents only.
    const proj = $("#compose-project"), to = $("#compose-to");
    if (proj && to && !to.dataset.all) {
      to.dataset.all = to.innerHTML;
      const filter = () => {
        const keep = to.value, p = proj.value;
        to.innerHTML = to.dataset.all;
        to.options[0].textContent = "Everyone in #" + p;
        [...to.querySelectorAll("option[data-p]")].forEach((o) => { if (!o.dataset.p.split(" ").includes(p)) o.remove(); });
        [...to.querySelectorAll("optgroup")].forEach((g) => { if (!g.children.length) g.remove(); });
        to.value = [...to.options].some((o) => o.value === keep) ? keep : "";
      };
      proj.addEventListener("change", filter);
      filter();
    }
    $$("details.actgroup", root).forEach((d) => {
      const gid = d.dataset.gid;
      if (gid in folds) d.open = folds[gid];
      const sum = d.querySelector("summary");
      if (sum) sum.onclick = () => { folds[gid] = !d.open; };
    });
    $$("[data-copy]", root).forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); const s = b.querySelector("span"); if (s) { const o = s.textContent; s.textContent = "Copied"; setTimeout(() => (s.textContent = o), 1400); } else toast("Copied"); } catch { toast("Couldn't copy", true); } });
    $$("[data-open]", root).forEach((b) => b.onclick = (e) => { e.preventDefault(); const d = document.getElementById(b.dataset.open); d && d.showModal(); const f = d && d.querySelector("input:not([type=hidden]),textarea"); f && f.focus(); });
    $$("[data-railtoggle]", root).forEach((b) => b.onclick = () => {
      const side = b.closest(".side"); const nowRail = !side.classList.contains("rail");
      side.classList.toggle("rail", nowRail);
      document.cookie = "ic_rail=" + (nowRail ? "rail" : "open") + "; path=/; max-age=31536000; samesite=lax";
    });
    $$("[data-dm]", root).forEach((b) => b.onclick = () => { const s = $("#compose-to"), c = $("#compose"); if (s && c) { s.value = b.dataset.dm; c.focus(); c.scrollIntoView({ block: "center", behavior: "smooth" }); } });
    $$("[data-close]", root).forEach((b) => b.onclick = () => b.closest("dialog").close());
    // The redrawn piece can be a form itself (the chat composer is one): it needs its handler too, or it submits
    // the plain way (no images, a page reload, the text restored from its draft).
    [...(root.matches && root.matches("form") ? [root] : []), ...$$("form", root)].forEach((f) => { if (!f.hasAttribute("data-native") || f.dataset.confirm || f.dataset.leaving) f.onsubmit = submit; });
    [...(root.matches && root.matches("form[data-images]") ? [root] : []), ...$$("form[data-images]", root)].forEach(bindImages);
    [...(root.matches && root.matches("form[data-agent]") ? [root] : []), ...$$("form[data-agent]", root)].forEach(bindBtw);
    $$("form[data-agent]").forEach(bindEdit); // the whole page: a redrawn thread can end an edit the form shows
    $$("input[data-noenter]", root).forEach((i) => i.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); toast("Pick an option to vote"); } });
    $$("[data-chip]", root).forEach((b) => b.onclick = () => { const t = $("#chat-input"); if (t) { t.value = b.dataset.chip; t.form.requestSubmit(); } });
    // Display choices live in cookies, so the server renders them and live redraws keep them.
    const cookie = (k) => { const c = document.cookie.split(";").map((x) => x.trim()).find((x) => x.startsWith(k + "=")); return c ? c.slice(k.length + 1) : undefined; };
    const setCookie = (k, v) => { document.cookie = k + "=" + v + "; path=/; max-age=31536000; samesite=lax"; };
    const within = (sel) => [...(root.matches && root.matches(sel) ? [root] : []), ...$$(sel, root)];
    const acts = cookie("ic_activity") !== "off";
    const relay = cookie("ic_relay") !== "off";
    // Text size in the agent chat: steps around 100%, kept in a cookie like the other display choices.
    const FS = [0.85, 0.92, 1, 1.08, 1.16, 1.25, 1.35, 1.5];
    const fs = Math.min(FS.length - 1, Math.max(0, +(cookie("ic_fs") ?? 2) || 0));
    within(".thread").forEach((th) => (th.style.zoom = FS[fs]));
    // Phones zoom the whole page into a field under 16px, so on touch screens it never goes below that.
    $$("#chat-input").forEach((t) => (t.style.fontSize = Math.max(matchMedia("(pointer: coarse)").matches ? 16 : 0, 13.5 * FS[fs]).toFixed(1) + "px"));
    $$("[data-fs]").forEach((b) => { b.disabled = fs + +b.dataset.fs < 0 || fs + +b.dataset.fs >= FS.length; b.onclick = () => { setCookie("ic_fs", Math.min(FS.length - 1, Math.max(0, fs + +b.dataset.fs))); bind(document); }; });
    // A thread at the bottom stays there when it changes size (a phone keyboard opening, images or fonts loading).
    within(".thread").forEach((th) => {
      if (th._pinned) return; th._pinned = true;
      let atEnd = th.dataset.stuck !== "no";
      th.addEventListener("scroll", () => { atEnd = th.scrollHeight - th.scrollTop - th.clientHeight < 80; jumpShow(); }, { passive: true });
      const keep = () => { if (atEnd) th.scrollTop = th.scrollHeight; };
      new ResizeObserver(keep).observe(th); th.addEventListener("load", keep, true); document.fonts?.ready.then(keep);
    });
    within(".thread").forEach((th) => { th.classList.toggle("noact", !acts); th.classList.toggle("norelay", !relay); th.style.scrollBehavior = "auto"; if (th.dataset.stuck !== "no") th.scrollTop = th.scrollHeight; });
    $$("[data-dismiss]", root).forEach((b) => b.onclick = () => { const [k, v] = b.dataset.dismiss.split("="); setCookie(k, v); b.closest("[data-region]")?.remove(); });
    $$("[data-relaytoggle]").forEach((b) => { b.classList.toggle("on", relay); b.onclick = () => { setCookie("ic_relay", relay ? "off" : "on"); bind(document); }; });
    $$("[data-acttoggle]").forEach((b) => { b.classList.toggle("on", acts); b.onclick = () => { setCookie("ic_activity", acts ? "off" : "on"); bind(document); }; });
    $$("[data-rulecount]", root).forEach((c) => { const t = c.closest("label").querySelector("textarea"); const n = () => { const k = t.value.split("\\n").filter((l) => l.trim()).length; c.textContent = k === 1 ? "1 rule" : k + " rules"; }; n(); t.addEventListener("input", n); });
    $$("textarea[data-enter]", root).forEach((t) => t.onkeydown = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); t.form.requestSubmit(); } });
  }
  // A form that leaves the site (a sign-in going back to Claude) says so while the next site loads, which can take a while.
  function leaving(f) {
    const box = f.closest(".bd"), note = box && $(".leaving", box);
    if (!f.dataset.leaving || !note) return;
    $("b", note).textContent = f.dataset.leaving; note.hidden = false; box.classList.add("isleaving");
  }
  // Back from the next site: the page as it was.
  addEventListener("pageshow", (e) => { if (e.persisted) $$(".isleaving").forEach((b) => { b.classList.remove("isleaving"); $(".leaving", b).hidden = true; }); });
  async function submit(e) {
    const f = e.target; if (f.dataset.confirm && !f.dataset.ok) { e.preventDefault(); const d = $("#confirm"); if (d) { $("#confirm-text").textContent = f.dataset.confirm; d.showModal(); $("#confirm-yes").onclick = () => { d.close(); f.dataset.ok = "1"; f.requestSubmit(); delete f.dataset.ok; }; } return; }
    if (f.hasAttribute("data-native")) return leaving(f);
    e.preventDefault();
    // One send at a time: a phone can fire a second submit for the same tap a few milliseconds later.
    if (f._busy) return; f._busy = true;
    // A phone keyboard still composing a word puts it back after the field is cleared: finish it first.
    const typing = f.contains(document.activeElement) && document.activeElement.tagName === "TEXTAREA" ? document.activeElement : null;
    if (typing) typing.blur();
    const btns = $$("button", f); btns.forEach((b) => (b.disabled = true));
    const data = new FormData(f); if (e.submitter && e.submitter.name) data.set(e.submitter.name, e.submitter.value);
    // The chat clears at once, like a messaging app: a fresh, empty field takes the old one's place. A phone keyboard
    // puts the word it was composing back into whichever field has focus, so on phones the fresh one isn't focused
    // (the keyboard closes). The text comes back if sending fails.
    const touch = matchMedia("(pointer: coarse)").matches;
    const chat = f.querySelector("textarea[data-chat]"), unsent = chat ? chat.value : "";
    if (chat) { const fresh = chat.cloneNode(); fresh.value = ""; fresh.style.height = ""; chat.replaceWith(fresh); drafts.set(fresh); chatField(fresh); if (typing === chat && !touch) fresh.focus(); }
    const restore = () => { const t = chat && (document.getElementById(chat.id) || chat); if (t && !t.value) { t.value = unsent; drafts.set(t); } };
    (f._imgs || []).forEach((it) => data.append("image", it.file, it.file.name));
    try {
      const res = await fetch(f.action, { method: "POST", body: data, credentials: "same-origin" });
      // Answers redirect back with ?ok= or ?err=; anything else that isn't a page (403, 413, 500…) failed too.
      const u = new URL(res.url), ok = u.searchParams.get("ok"), link = u.searchParams.get("link");
      const err = u.searchParams.get("err") || (res.ok ? null : "Couldn't send (HTTP " + res.status + "). Try again.");
      // Sent: the text goes before the redraw, which otherwise carries unsent text over.
      if (!err) $$("textarea[id]", f).forEach((t) => { t.value = ""; t.style.height = ""; drafts.set(t); });
      if (res.ok) await swap(await res.text());
      if (err) restore();
      if (err) toast(err, true); else { if (!f.hasAttribute("data-quiet")) toast(ok); f.reset(); if (f._afterSend) { f._afterSend(); f._afterSend = null; } if (f._imgs) { f._imgs.forEach((it) => URL.revokeObjectURL(it.url)); f._imgs = []; drawTray(f); } const d = f.closest("dialog"); d && d.close(); const ci = f.querySelector("#chat-input"); ci && !touch && ci.focus(); }
      if (link) { $("#invite-link").textContent = link; $("#invite-copy").dataset.copy = link; $("#invite-dlg").showModal(); }
    } catch { restore(); toast("Network error — try again", true); }
    btns.forEach((b) => (b.disabled = false)); f._busy = false;
  }
  // Waiting for you, redrawn card by card: a card that hasn't changed stays as it is (what you picked or typed in it,
  // where you were reading), new ones join at the end, and the dock doesn't pop up again.
  function asksMerge(el, next, src) {
    const list = $(".asklist", el), cards = $$(".ask", list), old = new Map(cards.map((c) => [c.dataset.mid, c]));
    // The card you're reading stays where it is on screen: the first one in view that's still there after.
    const stays = new Set($$(".ask", $(".asklist", next)).map((c) => c.dataset.mid));
    const top = list.getBoundingClientRect().top, anchor = cards.find((c) => stays.has(c.dataset.mid) && c.getBoundingClientRect().bottom > top + 1);
    const at = anchor ? anchor.getBoundingClientRect().top - top : 0, fresh = [];
    const keep = $$(".ask", $(".asklist", next)).map((c) => {
      const csrc = sig(c.outerHTML), o = old.get(c.dataset.mid);
      if (o && (o._src === csrc || o.contains(document.activeElement))) return o;
      c._src = csrc;
      if (o) {
        // Changed (an answer arrived on a review): carry over what was picked or typed in it.
        $$("input, textarea, select", o).forEach((x) => {
          if (!x.name) return;
          const y = x.type === "radio" || x.type === "checkbox" ? c.querySelector('[name="' + CSS.escape(x.name) + '"][value="' + CSS.escape(x.value) + '"]') : c.querySelector('[name="' + CSS.escape(x.name) + '"]');
          if (!y) return;
          if (x.type === "radio" || x.type === "checkbox") y.checked = x.checked; else if (x.value) y.value = x.value;
        });
        const open = new Set($$("details", o).map((d, i) => d.open && i)); $$("details", c).forEach((d, i) => open.has(i) && (d.open = true));
      } else c.classList.add("fresh");
      fresh.push(c);
      return c;
    });
    list.replaceChildren(...keep);
    $(".askhd", el).replaceWith($(".askhd", next));
    $(".askpill", el).replaceWith($(".askpill", next));
    el.dataset.n = next.dataset.n; el._src = src;
    // The same card, even if it was redrawn (its content changed).
    const now = anchor && list.querySelector('[data-mid="' + anchor.dataset.mid + '"]');
    if (now) list.scrollTop += now.getBoundingClientRect().top - list.getBoundingClientRect().top - at;
    $$(".askhd, .askpill", el).forEach((h) => bind(h));
    fresh.forEach((c) => bind(c));
  }
  async function swap(text) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    // What you're reading stays where it is on screen: the first message or row in view, found again after the redraw.
    const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 80; // at the bottom: follow what's new
    const inView = atEnd ? null : $$("[data-mid], [data-key]").find((m) => { const r = m.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.height; });
    const anchorSel = inView ? (inView.dataset.mid ? '[data-mid="' + CSS.escape(inView.dataset.mid) + '"]' : '[data-key="' + CSS.escape(inView.dataset.key) + '"]') : "";
    const anchorTop = inView ? inView.getBoundingClientRect().top : 0;
    $$("[data-region]").forEach((el) => {
      // A region inside another one that was just redrawn came with it. A thread has a region of its own, apart from
      // its question box, so an answer shows while you're typing the next question.
      if (!el.isConnected) return;
      const next = doc.getElementById(el.id); if (!next) return;
      const src = sig(next.outerHTML); if (el._src === src) return;
      if (el.id === "asks" && !el.hidden && !next.hidden && $(".asklist", el) && $(".asklist", next)) return asksMerge(el, next, src);
      if (el.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (el.querySelector("dialog[open]")) return; // a dialog you have open isn't redrawn under you
      if ((el._imgs && el._imgs.length) || el._adding || Date.now() - (el._picking || 0) < 120000) return; // images waiting to be sent, being added or picked
      const open = new Set($$("details[open]", el).map((d) => d.id).filter(Boolean));
      // A thread you've scrolled up in stays where you are; one at the bottom follows new messages.
      const th = el.classList.contains("thread") ? el : null;
      const stick = th ? th.scrollHeight - th.scrollTop - th.clientHeight < 80 : true;
      const keep = th ? th.scrollTop : 0;
      const known = new Set($$("[data-mid]", el).map((m) => m.dataset.mid));
      // Whatever was typed but not sent stays, focused or not.
      const typed = $$("textarea[id], input[type=text][id]", el).filter((t) => t.value).map((t) => [t.id, t.value]);
      const tb = el.querySelector(".tbody"), tbTop = tb ? tb.scrollTop : 0; // the tree keeps its place
      // Agent rows keep the order they had, so nothing moves under the pointer; ones that need you and new ones go first.
      if (tb) { const was = $$(".ta[data-k]", el).map((a) => a.dataset.k);
        $$(".tp, .toff", next).forEach((g) => { const rows = [...g.children].filter((c) => c.matches(".ta[data-k]")); if (rows.length < 2) return;
          const pos = (r) => { const i = was.indexOf(r.dataset.k); return "w" in r.dataset ? -2 : i < 0 ? -1 : i; };
          const anchor = rows[rows.length - 1].nextSibling;
          rows.sort((a, b) => pos(a) - pos(b)).forEach((r) => g.insertBefore(r, anchor)); }); }
      typed.forEach(([id, v]) => { const t = next.querySelector("#" + CSS.escape(id)); if (t && !t.value) t.value = v; });
      next._src = src; $$(".ask", next).forEach((c) => (c._src = sig(c.outerHTML)));
      el.replaceWith(next);
      if (tb) { const nb = next.querySelector(".tbody"); if (nb) nb.scrollTop = tbTop; }
      $$("details", next).forEach((d) => d.id && open.has(d.id) && (d.open = true));
      if (known.size) $$("[data-mid]", next).forEach((m) => !known.has(m.dataset.mid) && m.classList.add("fresh"));
      if (th && !stick) next.dataset.stuck = "no";
      bind(next); days(next);
      if (th && !stick) { next.scrollTop = keep; if (known.size && $$("[data-mid]", next).some((m) => !known.has(m.dataset.mid))) jumpNew = true; }
    });
    if (anchorSel) { const again = document.querySelector(anchorSel); if (again) { const d = again.getBoundingClientRect().top - anchorTop; if (Math.abs(d) > 1) scrollBy(0, d); } }
    jumpShow();
    tick();
  }
  let refreshTimer, live = $("#live");
  // Nothing is redrawn while you scroll or touch the page (on a phone a redraw mid-swipe stops it and moves what you
  // were reading): the update waits until you've let go and it has settled.
  let touching = false, movedAt = 0;
  const moved = () => (movedAt = Date.now());
  ["scroll", "wheel", "touchmove"].forEach((ev) => addEventListener(ev, moved, { passive: true, capture: true }));
  addEventListener("touchstart", () => { touching = true; moved(); }, { passive: true, capture: true });
  ["touchend", "touchcancel"].forEach((ev) => addEventListener(ev, () => { touching = false; moved(); }, { passive: true, capture: true }));
  const settled = () => !touching && Date.now() - movedAt > 900;
  async function refresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async function go() {
      if (!settled()) { refreshTimer = setTimeout(go, 400); return; }
      try {
        const r = await fetch(location.href, { credentials: "same-origin" });
        if (!r.ok || r.url !== location.href) return;
        const text = await r.text();
        if (!settled()) { refreshTimer = setTimeout(go, 400); return; } // you started scrolling meanwhile: fetch again after
        swap(text);
      } catch {}
    }, 250);
  }
  function connect(delay = 1000) {
    if (!live) return;
    const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws?web=1");
    let ping;
    ws.onopen = () => { live.classList.add("on"); live.lastChild.textContent = "Live"; delay = 1000; ping = setInterval(() => ws.readyState === 1 && ws.send("ping"), 30000); };
    ws.onmessage = (e) => { if (e.data !== "pong") refresh(); };
    ws.onclose = () => { clearInterval(ping); live.classList.remove("on"); live.lastChild.textContent = "Reconnecting"; setTimeout(() => connect(Math.min(delay * 2, 30000)), delay); };
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && live) refresh(); });
  const q = new URL(location.href);
  if (q.searchParams.has("ok") || q.searchParams.has("err")) { toast(q.searchParams.get("ok") || q.searchParams.get("err"), q.searchParams.has("err")); q.searchParams.delete("ok"); q.searchParams.delete("err"); history.replaceState(null, "", q); }
  // Without ?agent= the server shows the first connected agent, which changes as agents come and go; pin the one
  // on screen in the URL so live redraws (they fetch this URL) keep showing it.
  const shown = document.getElementById("chatform");
  if (shown && shown.dataset.agent && q.searchParams.get("view") === "agents" && !q.searchParams.has("agent")) { q.searchParams.set("agent", shown.dataset.agent); history.replaceState(null, "", q); }
  // ⌘K / Ctrl+K: find an agent, project or page. What it searches is read from the tree when it opens (the tree is
  // on every dashboard page, also when hidden), so it always matches what the hub just drew.
  let kd = null, kSel = 0, kList = [];
  const kItems = () => {
    const out = [];
    $$("#tree a.ta").forEach((a) => {
      const proj = a.closest("details.tp") && a.closest("details.tp").querySelector(".tpn");
      const state = a.classList.contains("gone") ? "not connected" : a.hasAttribute("data-w") ? "needs you" : (a.querySelector(".tdot") || {}).className.indexOf("work") >= 0 ? "working" : "";
      out.push({ group: "Agents", name: a.dataset.k, sub: [proj ? proj.textContent.trim() : "", state].filter(Boolean).join(" · "), more: a.title || "", href: a.getAttribute("href"), icon: [...a.children].slice(0, 2).map((c) => c.outerHTML).join(""), gone: a.classList.contains("gone"), when: (a.querySelector("time.tt") || {}).textContent || "", whenTip: (a.querySelector("time.tt") || {}).title || "" });
    });
    $$("#tree a.tpn").forEach((a) => out.push({ group: "Projects", name: a.textContent.trim(), sub: "messages, locks, votes", href: a.getAttribute("href"), icon: ICONS_K.folder }));
    [["Everything", "/dashboard", "every project and message", "layers"], ["Agents", "/dashboard?view=agents", "your agents' chats", "message"], ["Tickets & MRs", "/dashboard?view=tracked", "what your agents track for you", "branch"], ["Files from agents", "/dashboard?view=files", "images and files they shared", "image"], ["Work", "/dashboard?view=work", "your work log", "check"], ["Agents · versions", "/dashboard?view=fleet", "machines and updates", "monitor"], ["Account", "/account", "tokens, browsers, GitHub", "user"], ["Docs", "/docs", "how intercom works", "book"]].forEach(([name, href, sub, ic]) => out.push({ group: "Pages", name, sub, href, icon: ICONS_K[ic] || "" }));
    return out;
  };
  const ICONS_K = { folder: ${JSON.stringify(icon("folder", 16))}, layers: ${JSON.stringify(icon("layers", 16))}, message: ${JSON.stringify(icon("message", 16))}, user: ${JSON.stringify(icon("user", 16))}, book: ${JSON.stringify(icon("book", 16))}, branch: ${JSON.stringify(icon("branch", 16))}, image: ${JSON.stringify(icon("image", 16))}, check: ${JSON.stringify(icon("check", 16))}, monitor: ${JSON.stringify(icon("monitor", 16))} };
  // Higher is better: a match at the start of the name or of a word in it, then anywhere, then the letters in order.
  const kScore = (q, text) => {
    const t = (text || "").toLowerCase();
    const i = t.indexOf(q);
    if (i >= 0) return 1000 - i + (i === 0 || " /#._-".includes(t[i - 1]) ? 500 : 0);
    let j = 0;
    for (let k = 0; k < t.length && j < q.length; k++) if (t[k] === q[j]) j++;
    return j === q.length ? 100 - t.length / 10 : 0;
  };
  const kDraw = () => {
    const q = kd.querySelector("input").value.trim().toLowerCase();
    const all = kItems();
    // No query: the agents you had open most recently come first, so ⌘K then Enter goes back to the last one.
    const recent = q ? [] : trail().filter((k) => k !== shownAgent()).map((k) => all.find((it) => it.group === "Agents" && it.name === k)).filter(Boolean).slice(0, 5).map((it) => Object.assign({}, it, { group: "Recent" }));
    kList = q ? all.map((it) => ({ it, s: Math.max(kScore(q, it.name) * 2, kScore(q, it.sub), kScore(q, it.more) / 2) - (it.gone ? 50 : 0) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).map((x) => x.it).slice(0, 40) : [...recent, ...all.filter((it) => !it.gone && !recent.some((r) => r.name === it.name))];
    kSel = Math.min(kSel, Math.max(0, kList.length - 1));
    const box = kd.querySelector(".klist");
    box.textContent = "";
    if (!kList.length) { const e = document.createElement("div"); e.className = "kempty"; e.textContent = "Nothing matches “" + q + "”"; box.append(e); return; }
    let group = "";
    kList.forEach((it, n) => {
      if (!q && it.group !== group) { group = it.group; const g = document.createElement("div"); g.className = "kgrp"; g.textContent = group; box.append(g); }
      const a = document.createElement("a");
      a.className = "kit" + (n === kSel ? " on" : "") + (it.gone ? " gone" : "");
      a.href = it.href; a.dataset.n = n; a.setAttribute("role", "option");
      const ic = document.createElement("span"); ic.className = "kic"; ic.innerHTML = it.icon;
      const nm = document.createElement("span"); nm.className = "kn";
      const at = q ? it.name.toLowerCase().indexOf(q) : -1;
      if (at >= 0) { const m = document.createElement("mark"); m.textContent = it.name.slice(at, at + q.length); nm.append(it.name.slice(0, at), m, it.name.slice(at + q.length)); } else nm.textContent = it.name;
      const sb = document.createElement("span"); sb.className = "ks"; sb.textContent = it.sub;
      a.append(ic, nm, sb);
      if (it.when) { const wh = document.createElement("span"); wh.className = "kw"; wh.textContent = it.when; wh.title = it.whenTip; a.append(wh); }
      a.onmousemove = () => { if (kSel !== n) { kSel = n; kMark(); } };
      box.append(a);
    });
  };
  const kMark = () => kd.querySelectorAll(".kit").forEach((a) => { const on = Number(a.dataset.n) === kSel; a.classList.toggle("on", on); if (on) a.scrollIntoView({ block: "nearest" }); });
  // The page opens ready to write: the cursor goes to the message field (an agent's, or the composer on Everything),
  // after any draft. Not on touch screens, where it would pop up the keyboard.
  if (!matchMedia("(pointer: coarse)").matches && !location.hash) {
    const t = document.getElementById("chat-input") || document.getElementById("compose");
    if (t) { t.focus({ preventScroll: true }); t.setSelectionRange(t.value.length, t.value.length); }
  }
  const kOpen = () => {
    if (!kd) {
      kd = document.createElement("dialog");
      kd.className = "kpal";
      kd.innerHTML = '<div class="kin">' + ${JSON.stringify(icon("search", 18))} + '<input type="search" placeholder="Find an agent, project or page" aria-label="Search" autocomplete="off" spellcheck="false"><span class="kbd">esc</span></div><div class="klist" role="listbox"></div><div class="kft"><span><span class="kbd">↑</span><span class="kbd">↓</span> move</span><span><span class="kbd">PgUp</span><span class="kbd">PgDn</span> page</span><span><span class="kbd">↵</span> open</span><span><span class="kbd">⌘</span><span class="kbd">↵</span> new tab</span></div>';
      document.body.append(kd);
      const input = kd.querySelector("input");
      input.oninput = () => { kSel = 0; kDraw(); };
      input.onkeydown = (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (kList.length) { kSel = (kSel + (e.key === "ArrowDown" ? 1 : kList.length - 1)) % kList.length; kMark(); } }
        else if ((e.key === "PageDown" || e.key === "PageUp") && kList.length) {
          // A page is as many results as the list shows at once.
          e.preventDefault();
          const box = kd.querySelector(".klist"), row = kd.querySelector(".kit");
          const page = Math.max(1, Math.floor(box.clientHeight / (row ? row.offsetHeight : 40)) - 1);
          kSel = Math.min(kList.length - 1, Math.max(0, kSel + (e.key === "PageDown" ? page : -page)));
          kMark();
        }
        else if (e.key === "Enter" && kList[kSel]) { e.preventDefault(); if (e.metaKey || e.ctrlKey) window.open(kList[kSel].href, "_blank"); else { kd.close(); location.href = kList[kSel].href; } }
      };
      kd.addEventListener("click", (e) => { if (e.target === kd) kd.close(); });
    }
    if (kd.open) return kd.close();
    kd.querySelector("input").value = ""; kSel = 0; kDraw();
    kd.showModal();
    kd.querySelector("input").focus();
  };
  // The code view (code.ts): read from the agent's machine when it opens and when asked again; its links stay in the
  // pane (the address changes, so back and forward work, and a live redraw keeps it).
  const CODE_KEYS = ["code", "sha", "dir", "path", "rev", "q", "in", "wt"];
  let codeNav = false, codeSeq = 0;
  // While you type in its search box, only the results are redrawn, so the box keeps focus and caret.
  async function codeLoad(results) {
    const cp = document.getElementById("codepane"); if (!cp) return;
    const u = new URL(location.href), p = new URLSearchParams([["agent", u.searchParams.get("agent") || ""]]);
    u.searchParams.forEach((v, k) => CODE_KEYS.includes(k) && p.append(k, v));
    const seq = ++codeSeq;
    cp.classList.add("loading");
    try {
      const r = await fetch("/agent-code?" + p, { credentials: "same-origin" });
      if (seq !== codeSeq) return; // a newer search is on its way
      if (!r.ok) toast("Couldn't read the code (HTTP " + r.status + ")", true);
      else {
        const t = await r.text(), old = results && cp.querySelector("#sresults");
        const next = old && new DOMParser().parseFromString(t, "text/html").getElementById("sresults");
        if (next) old.replaceWith(next); else { cp.innerHTML = t; cp.scrollTop = 0; }
      }
    } catch { if (seq === codeSeq) toast("Network error — try again", true); }
    if (seq !== codeSeq) return;
    cp.classList.remove("loading");
    const t = location.hash && document.getElementById(location.hash.slice(1));
    if (t) { if (t.tagName === "DETAILS") t.open = true; t.classList.add("hit"); t.scrollIntoView({ block: t.tagName === "TR" ? "center" : "start" }); }
  }
  document.addEventListener("click", (e) => {
    const cp = document.getElementById("codepane"), a = cp && e.target.closest && e.target.closest("a[data-code], a[data-jump], [data-coderefresh]");
    if (!a || !cp.contains(a) || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (a.hasAttribute("data-coderefresh")) return codeLoad();
    if (a.hasAttribute("data-jump")) {
      const id = a.getAttribute("href").slice(1), t = document.getElementById(id); if (!t) return;
      if (t.tagName === "DETAILS") t.open = true;
      $$(".hit", cp).forEach((x) => x.classList.remove("hit")); t.classList.add("hit");
      t.scrollIntoView({ block: t.tagName === "TR" ? "center" : "start", behavior: "smooth" });
      return history.replaceState(null, "", "#" + id);
    }
    codeNav = true; history.pushState(null, "", a.href); codeLoad();
  });
  let codeTimer;
  const codeSearch = (f, now) => {
    clearTimeout(codeTimer);
    codeTimer = setTimeout(() => {
      const q = f.q.value.trim(), u = new URL(location.href);
      ["code", "dir", "path", "rev", "sha", "q", "in"].forEach((k) => u.searchParams.delete(k));
      if (q) { u.searchParams.set("code", "search"); u.searchParams.set("in", f.in.value); u.searchParams.set("q", q); } else u.searchParams.set("code", "files");
      u.hash = ""; history.replaceState(null, "", u); codeLoad(true);
    }, now ? 0 : f.in.value === "text" ? 350 : 150);
  };
  document.addEventListener("input", (e) => { const f = e.target.closest && e.target.closest("form[data-codesearch]"); if (f) codeSearch(f); });
  // Another worktree: the same tab, read from that folder (a file or commit from the old one may not be there).
  document.addEventListener("change", (e) => {
    const s = e.target.closest && e.target.closest("select[data-codewt]"); if (!s) return;
    const u = new URL(location.href); ["dir", "path", "rev", "sha", "q", "in"].forEach((k) => u.searchParams.delete(k));
    if (!["changes", "commits", "files"].includes(u.searchParams.get("code"))) u.searchParams.set("code", "changes");
    u.searchParams.set("wt", s.value); u.hash = ""; codeNav = true; history.pushState(null, "", u); codeLoad();
  });
  document.addEventListener("submit", (e) => { const f = e.target.closest && e.target.closest("form[data-codesearch]"); if (f) { e.preventDefault(); e.stopPropagation(); codeSearch(f, true); } }, true);
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("form[data-codesearch] [data-in]"); if (!b) return;
    e.preventDefault();
    const f = b.closest("form"); f.in.value = b.dataset.in;
    $$("[data-in]", f).forEach((x) => x.classList.toggle("on", x === b));
    f.q.placeholder = b.dataset.in === "text" ? "Search text in the files" : "Find a file by name";
    f.q.focus(); codeSearch(f, true);
  });
  window.addEventListener("popstate", () => { const sd = document.getElementById("dlg-screen"); if (sd && (sd.open || sd._popping)) return; const iv = document.getElementById("imgview"); if (iv && (iv.open || iv._popping)) return; if (document.getElementById("codepane") && new URL(location.href).searchParams.has("code")) codeLoad(); else if (codeNav) location.reload(); });
  codeLoad();
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) $$(".kbd-k").forEach((k) => (k.textContent = "Ctrl K"));
  document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") { e.preventDefault(); kOpen(); } });
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("[data-kopen]")) { e.preventDefault(); kOpen(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { const c = $("#compose"); if (c) { e.preventDefault(); c.focus(); } } });
  // An open dashboard (an installed phone app above all, which has no reload button) picks up a new version by
  // itself: when it comes back into view, it reloads if the hub serves different styles or script, unless something
  // is typed or attached.
  const build = document.querySelector("meta[name=ic-build]")?.content;
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || !build) return;
    try {
      const now = (await (await fetch("/api/build", { cache: "no-store" })).json()).build;
      const busy = $$("textarea, input[type=text]").some((t) => t.value) || $$("form").some((f) => (f._imgs && f._imgs.length) || Date.now() - (f._picking || 0) < 120000);
      if (now && now !== build && !busy) location.reload();
    } catch {}
  });
  // Notifications on this device (push.ts): a service worker shows them, the subscription goes to the hub. Offered in
  // Waiting for you while this device has none, and under Account (on, off, a test). An iPhone shows them only in
  // the home-screen app, where its browser has PushManager at all.
  const pushOk = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const pushJson = (u, b) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) });
  const pushSub = async () => { if (!pushOk) return null; const r = await navigator.serviceWorker.getRegistration("/"); return r ? r.pushManager.getSubscription() : null; };
  // Each step says where it got stuck: a failure here would otherwise look like a button that does nothing.
  async function pushOn() {
    let step = "asking for permission";
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error(perm === "denied" ? "notifications are blocked for this site" : "permission wasn't given");
      step = "installing the notification worker";
      const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error("it didn't start within 10 s")), 10000))]);
      step = "subscribing";
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const key = (await (await fetch("/push/key")).json()).key, raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
      }
      step = "saving it on the hub";
      const res = await pushJson("/push/subscribe", sub.toJSON());
      if (!res.ok) throw new Error("the hub answered " + res.status);
      return true;
    } catch (err) {
      pushErr = "Couldn't turn them on (" + step + "): " + ((err && (err.message || err.name)) || err);
      return false;
    }
  }
  let pushErr = "";
  async function pushOff() { const sub = await pushSub(); if (sub) { await pushJson("/push/unsubscribe", { endpoint: sub.endpoint }); await sub.unsubscribe(); } }
  async function pushShow() {
    const sub = await pushSub().catch(() => null), perm = pushOk ? Notification.permission : "unsupported";
    $$("[data-pushon]").forEach((b) => (b.hidden = !pushOk || perm === "denied" || !!sub));
    if (pushErr) $$("[data-pushon]").forEach((b) => (b.title = pushErr));
    $$("[data-pushctl]").forEach((c) => {
      const iphone = /iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone;
      const say = (t) => { const s = $("[data-pushstate]", c); if (s) s.textContent = t; };
      $$("[data-pushtoggle], [data-pushtest]", c).forEach((b) => (b.hidden = !pushOk || perm === "denied"));
      const t = $("[data-pushtoggle]", c); if (t) t.textContent = sub ? "Turn off" : "Turn on";
      const x = $("[data-pushtest]", c); if (x) x.hidden = x.hidden || !sub;
      say(pushErr ? pushErr : !pushOk ? (iphone ? "On iPhone: add Intercom to your Home Screen (Share, then Add to Home Screen) and turn them on in the app." : "This browser can't show notifications.") : perm === "denied" ? "Blocked for this site in the browser's settings." : sub ? "On for this device." : "Off for this device.");
      c.hidden = false;
    });
    // Once a session, make sure the hub still has this device (it forgets ones whose push service said they're gone).
    if (sub && perm === "granted") { try { if (!sessionStorage.getItem("ic_push_sync")) { sessionStorage.setItem("ic_push_sync", "1"); pushJson("/push/subscribe", sub.toJSON()); navigator.serviceWorker.getRegistration("/").then((r) => r && r.update()).catch(() => {}); } } catch {} }
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest && e.target.closest("[data-pushon], [data-pushtoggle], [data-pushtest]");
    if (!b) return;
    e.preventDefault(); b.disabled = true;
    try {
      if ("pushtest" in b.dataset) { const n = (await (await pushJson("/push/test")).json()).sent; b.textContent = n ? "Sent" : "Not delivered"; setTimeout(() => (b.textContent = "Send a test"), 3000); }
      else if ("pushtoggle" in b.dataset && (await pushSub())) { await pushOff(); location.reload(); return; }
      else if (await pushOn()) { pushErr = ""; if ("pushtoggle" in b.dataset) { location.reload(); return; } }
      else if (!$("[data-pushstate]")) alert(pushErr);
    } catch (err) { pushErr = String((err && err.message) || err); }
    b.disabled = false; pushShow();
  });
  // The installed app's icon shows the count waiting for you; this keeps it right while the dashboard is open.
  function pushBadge(n) { try { if (navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); } catch {} }
  bind(); tkHash(); days(); tick(); setInterval(tick, 20000); connect(); pushShow();
})();
`;

/** Identifies the dashboard's styles and script, so open pages notice a new version (FNV-1a). */
export const BUILD = (() => {
  let h = 0x811c9dc5;
  for (const c of STYLE + SCRIPT) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return (h >>> 0).toString(36);
})();

/** Full HTML document. */
export function page(title: string, body: string, opts: { top?: string } = {}): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="theme-color" content="#141416" media="(prefers-color-scheme: dark)"><meta name="theme-color" content="#f4f4f6" media="(prefers-color-scheme: light)">
<script>(function(){var t=(document.cookie.match(/(?:^|; )ic_theme=(light|dark)/)||[])[1];if(t){document.documentElement.dataset.theme=t;document.querySelectorAll('meta[name=theme-color]').forEach(function(m){m.content=t==="dark"?"#141416":"#f4f4f6";m.removeAttribute("media")})}})()</script>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(LOGO.replace('width="28" height="28" ', ""))}">
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/assets/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Intercom"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="ic-build" content="${BUILD}"><link rel="preload" href="/assets/geist.woff2" as="font" type="font/woff2" crossorigin>
<style>${STYLE}</style></head><body>
${opts.top ?? `<header class="top"><div class="in"><a class="brand" href="/">${LOGO}<span>Intercom</span></a><span class="grow"></span><a class="btn ghost sm" href="/docs">${icon("book", 15)}Docs</a></div></header>`}
${body}
<dialog id="confirm"><div class="hd"><h2>Are you sure?</h2></div><div class="bd"><p id="confirm-text" class="muted"></p></div><div class="ft"><button class="btn ghost" data-close type="button">Cancel</button><button class="btn danger" id="confirm-yes" type="button">Yes, continue</button></div></dialog>
<script>${SCRIPT}</script></body></html>`;
}
