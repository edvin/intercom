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
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
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
  square: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
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
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
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
  --an-l:40%;--bg:#f6f6f8;--bg-glow:rgba(124,92,255,.10);--surface:#ffffff;--surface-2:#f2f2f6;--surface-3:#e9e9ef;
  --line:rgba(16,18,30,.08);--line-strong:rgba(16,18,30,.14);--ink:#0d0f17;--ink-2:#3b3f4f;--mute:#6b7081;
  --accent:#6a4dff;--accent-2:#1f9dff;--accent-ink:#ffffff;--accent-soft:rgba(106,77,255,.10);
  --green:#0d9f66;--green-soft:rgba(13,159,102,.12);--amber:#c27400;--amber-soft:rgba(232,150,20,.14);
  --red:#e0434d;--red-soft:rgba(224,67,77,.10);
  --shadow:0 1px 2px rgba(16,18,30,.04),0 8px 24px -12px rgba(16,18,30,.12);
  --shadow-lg:0 24px 64px -16px rgba(16,18,30,.28);
  --grad:linear-gradient(135deg,var(--accent),var(--accent-2));
  --scroll:rgba(16,18,30,.16);--scroll-hover:rgba(16,18,30,.30);
  --r:14px;--r-s:10px;color-scheme:light;
}
@media (prefers-color-scheme:dark){:root{
  --an-l:68%;--bg:#09090d;--bg-glow:rgba(124,92,255,.16);--surface:#111117;--surface-2:#17171f;--surface-3:#1f1f29;
  --line:rgba(255,255,255,.07);--line-strong:rgba(255,255,255,.13);--ink:#ececf3;--ink-2:#c3c4d0;--mute:#8a8c9d;
  --scroll:rgba(255,255,255,.13);--scroll-hover:rgba(255,255,255,.26);
  --accent:#8b72ff;--accent-2:#35b0ff;--accent-soft:rgba(139,114,255,.14);
  --green:#3ddc97;--green-soft:rgba(61,220,151,.12);--amber:#ffb547;--amber-soft:rgba(255,181,71,.12);
  --red:#ff6b76;--red-soft:rgba(255,107,118,.12);
  --shadow:0 1px 0 rgba(255,255,255,.03) inset,0 8px 24px -12px rgba(0,0,0,.6);
  --shadow-lg:0 24px 64px -12px rgba(0,0,0,.7);color-scheme:dark;
}}
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
body{margin:0;min-height:100vh;background:radial-gradient(1200px 500px at 15% -10%,var(--bg-glow),transparent 60%),radial-gradient(900px 400px at 100% 0,rgba(47,180,255,.07),transparent 60%),var(--bg);background-attachment:fixed;color:var(--ink);font:14.5px/1.55 Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;font-feature-settings:"ss01","cv11"}
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
@media (prefers-color-scheme:dark){.client.cl{color:#e08a6a}}
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
.thread{flex:1;min-height:0;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}
.thread>.empty{margin:auto}
.bubble{max-width:min(86%,1100px);padding:10px 14px;border-radius:16px;background:var(--surface-2);border:1px solid var(--line);overflow-wrap:anywhere;line-height:1.5;align-self:flex-start;border-bottom-left-radius:6px}
.bubble.mine{align-self:flex-end;background:var(--grad);color:#fff;border:0;border-bottom-left-radius:16px;border-bottom-right-radius:6px}
.bubble.mine a{color:#fff;text-decoration:underline}.bubble.mine code{background:rgba(255,255,255,.18);border-color:transparent;color:#fff}
.bubble .when{display:block;font-size:11px;color:var(--mute);margin-top:4px}
.activity{align-self:center;font-size:12.5px;color:var(--mute);text-align:center;max-width:80%;display:flex;gap:6px;align-items:baseline}
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
.imgthumb button{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:0;background:var(--ink);color:var(--bg);font-size:13px;line-height:20px;padding:0;cursor:pointer}
form.dropping{outline:2px dashed var(--accent);outline-offset:4px;border-radius:12px}
.lfile{overflow-wrap:anywhere;text-decoration:underline dotted;text-underline-offset:3px}.lfile code{color:inherit}
.attf{display:inline-flex;align-items:center;gap:8px;margin:6px 8px 2px 0;padding:6px 11px 6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);color:var(--ink);text-decoration:none;font-family:"JetBrains Mono","Geist Mono",ui-monospace,monospace;font-size:12.5px;max-width:100%}
.attf:hover{border-color:var(--accent);color:var(--ink)}.attf-i{display:grid;place-items:center;width:22px;height:22px;border-radius:6px;background:var(--accent-soft);color:var(--accent);font-size:13px}
.attf-n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.attf-s{color:var(--mute);font-size:11px;white-space:nowrap}
.att{display:inline-block;margin:6px 8px 2px 0;vertical-align:top}.att img{display:block;max-width:min(360px,100%);max-height:240px;border-radius:8px;border:1px solid var(--line);background:var(--surface-2)}
.att:hover img{border-color:var(--accent)}
.attl{display:inline-flex;align-items:center;gap:4px;vertical-align:-2px}.attl svg{flex:none}
.act-loop .aic,.act-loop .atx{color:var(--accent)}
.looprow{color:var(--accent);margin-top:2px}
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
.bubble:hover .unsend,.bubble.held .unsend,.unsend:focus-within{opacity:1}
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
.approval{padding:12px 14px;border-radius:12px;border:1px solid color-mix(in srgb,var(--amber) 45%,transparent);background:var(--amber-soft)}
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
.an{color:hsl(var(--h) 62% var(--an-l));font-weight:700}
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
/* ⌘K: find an agent, project or page */
.kpal{width:min(620px,calc(100vw - 24px));margin-top:12vh;border-radius:16px;overflow:hidden}
.kpal[open]{display:flex;flex-direction:column;max-height:min(560px,76vh)}
.kin{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line);color:var(--mute)}
.kin input,.kin input:focus{flex:1;min-width:0;height:auto;border:0;outline:0;box-shadow:none;background:none;color:var(--ink);font:inherit;font-size:16px;padding:2px 8px}
.klist{overflow:auto;padding:6px;flex:1;min-height:0}
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
.solo{min-height:calc(100vh - 60px);display:grid;place-items:center;padding:32px 16px}
.solo .card{width:min(460px,100%)}
.solo .card.wide{width:min(680px,100%)}
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
.ide{--tw:272px;--dw:372px;display:grid;grid-template-columns:var(--tw) minmax(0,1fr) var(--dw);height:calc(var(--vvh,100dvh) - var(--toph,53px));overflow:hidden}
.ide:not(.feedmode),.ide.nodrawer{--dw:0px}.ide.notree{--tw:0px}
.ide.notree>.tree,.ide.nodrawer>.drawer{display:none}
.tree{grid-column:1;min-height:0;display:flex;flex-direction:column;border-right:1px solid var(--line);background:color-mix(in srgb,var(--surface) 55%,transparent);font-size:13px}
.ttop{padding:10px 8px 2px;display:flex;flex-direction:column;gap:1px}
.tl{display:flex;align-items:center;gap:9px;width:100%;padding:6px 10px;border:0;border-radius:8px;background:none;color:var(--ink-2);font:inherit;font-weight:560;text-align:left;text-decoration:none;cursor:pointer}
.tl:hover{background:var(--surface-2);color:var(--ink)}.tl.on{background:var(--accent-soft);color:var(--accent)}.tl .badge{margin-left:auto}
.tl.warn{color:var(--red)}.tl.away{font-size:12.5px;color:var(--mute)}.tl.away.on{color:var(--amber)}
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
.tdot{position:absolute;left:11px;width:6px;height:6px;border-radius:50%;background:var(--mute)}
.tdot.idle{background:var(--green)}.tdot.work{background:var(--accent);animation:pulse 1.8s infinite}.tdot.wait{background:var(--red)}.tdot.off{background:transparent;box-shadow:inset 0 0 0 1px var(--mute)}
.toff>summary{list-style:none;padding:3px 8px 3px 24px;font-size:11.5px;color:var(--mute);cursor:pointer}.toff>summary:hover{color:var(--ink-2)}
.tempty{padding:3px 8px 6px 26px;margin:0;color:var(--mute);font-size:12px}
.tfoot{border-top:1px solid var(--line);padding:6px 8px 8px;display:flex;flex-direction:column;gap:4px}
.tlinks{gap:2px}.tlinks a{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:7px;color:var(--mute)}.tlinks a:hover,.tlinks a.on{background:var(--surface-2);color:var(--ink)}
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
  .chatmode .chatpane>.updatebar{margin:6px 8px 0}.chatmode .chatpane>.approvals{margin:6px 8px 0;border-radius:12px}
  .chatmode .chat{border:0;border-radius:0;box-shadow:none;background:var(--bg)}
  .chatmode .chat>.hd{flex-wrap:nowrap;align-items:center;gap:8px;padding:8px 10px 8px 4px;padding-top:max(8px,env(safe-area-inset-top));background:var(--surface)}
  .chatmode .mtree{display:inline-flex;flex:none}.chatmode>.tree{padding-top:env(safe-area-inset-top)}
  .chatmode .chat>.hd .av-m{width:32px;height:32px;font-size:12px}
  .chatmode .chat>.hd h2{font-size:15px}
  .chatmode .chat>.hd .fsz,.chatmode .chat>.hd .renamebtn,.chatmode .chat>.hd .client,.chatmode .chat>.hd .meta-row>.badge{display:none}
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
.approvals .hd{display:flex;align-items:baseline;gap:10px;padding:12px 14px}
@media (max-width:1180px){.ide.feedmode:not(.nodrawer){--dw:320px}}
.chatbox .chips{flex:none;align-items:center}.chatbox .chip{flex:none;height:auto}
@media (max-width:640px){.chatpane{padding:8px;gap:8px}.chat>.hd{padding:10px 12px;gap:10px}.chat>.hd .cname,.chatbox .lbl,.updatebar .uphint{display:none}.chat>.hd .client{padding:0 6px}.chat>.hd .cwd{display:none}.thread.term{padding:12px 14px}.chatbox{padding:10px}.chatbox .chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.chatbox .chips::-webkit-scrollbar{display:none}.chatbox .chip{flex:none;white-space:nowrap}.chatbox textarea{min-width:0}}
@media (max-width:900px){
  .ide{grid-template-columns:minmax(0,1fr)}.pane{grid-column:1}.drawer{display:none}
  .tree{position:fixed;z-index:30;top:var(--toph,53px);bottom:0;left:0;width:284px;transform:translateX(-104%);transition:transform .2s;background:var(--surface);box-shadow:var(--shadow-lg,0 10px 40px rgba(0,0,0,.35))}
  .ide.treeopen>.tree,.ide.notree.treeopen>.tree{display:flex;transform:none}.ide.notree>.tree{display:flex}
  .ide::after{content:"";position:fixed;inset:0;z-index:29;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s}
  .ide.treeopen::after{opacity:1;pointer-events:auto}
}
`;

// Client behaviour: relative times, day separators, copy buttons, dialogs, toasts, progressive form submits
// (no full reload) and live updates over a WebSocket.
export const SCRIPT = `
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
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
  // Images in a composer: pasted, dropped or picked; scaled down in the browser, sent with the message.
  const MAX_SIDE = 1600, MAX_IMGS = 4;
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
      const d = document.createElement("span"); d.className = "imgthumb";
      const img = document.createElement("img"); img.src = it.url; img.alt = it.file.name; d.appendChild(img);
      const x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.title = "Remove";
      x.onclick = () => { URL.revokeObjectURL(it.url); f._imgs.splice(i, 1); drawTray(f); };
      d.appendChild(x); tray.appendChild(d);
    });
    const t = f.querySelector("textarea"); if (t) t.required = !f._imgs.length;
  }
  async function addImages(f, files) {
    const imgs = [...files].filter((x) => /^image[/](png|jpeg|webp|gif)$/.test(x.type));
    if (!imgs.length) { if (files.length) toast("Only PNG, JPEG, WebP or GIF images", true); return false; }
    // Shrinking a big phone screenshot takes a moment; live redraws leave the composer alone meanwhile.
    f._adding = (f._adding || 0) + 1;
    try {
      for (const x of imgs) {
        if (f._imgs.length >= MAX_IMGS) { toast("At most " + MAX_IMGS + " images per message", true); break; }
        const file = await shrink(x); f._imgs.push({ file, url: URL.createObjectURL(file) });
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
    if (t) f.addEventListener("paste", async (e) => { const files = [...(e.clipboardData ? e.clipboardData.files : [])]; if (files.length && files.some((x) => x.type.startsWith("image/"))) { e.preventDefault(); await addImages(f, files); } });
    f.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.items].some((i) => i.type.startsWith("image/"))) { e.preventDefault(); f.classList.add("dropping"); } });
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
      const t = field(); if (t) t.placeholder = on ? "Side question for " + f.dataset.label + " (btw)" : "Message " + f.dataset.label;
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
    const t = field(); if (t && !f.classList.contains("btwmode")) t.placeholder = on ? "Edit your message" : "Message " + f.dataset.label;
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
  document.addEventListener("click", (e) => { const ide = document.getElementById("ide"); if (ide?.classList.contains("treeopen") && !e.target.closest(".tree, [data-treetoggle]")) { e.preventDefault(); e.stopPropagation(); closeTree(); } }, true);
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
  function bind(root = document) {
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
    [...(root.matches && root.matches("form") ? [root] : []), ...$$("form", root)].forEach((f) => { if (!f.hasAttribute("data-native") || f.dataset.confirm) f.onsubmit = submit; });
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
      th.addEventListener("scroll", () => { atEnd = th.scrollHeight - th.scrollTop - th.clientHeight < 80; }, { passive: true });
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
  async function submit(e) {
    const f = e.target; if (f.dataset.confirm && !f.dataset.ok) { e.preventDefault(); const d = $("#confirm"); if (d) { $("#confirm-text").textContent = f.dataset.confirm; d.showModal(); $("#confirm-yes").onclick = () => { d.close(); f.dataset.ok = "1"; f.requestSubmit(); delete f.dataset.ok; }; } return; }
    if (f.hasAttribute("data-native")) return;
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
  async function swap(text) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    $$("[data-region]").forEach((el) => {
      const next = doc.getElementById(el.id); if (!next || el.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
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
      el.replaceWith(next);
      if (tb) { const nb = next.querySelector(".tbody"); if (nb) nb.scrollTop = tbTop; }
      $$("details", next).forEach((d) => d.id && open.has(d.id) && (d.open = true));
      if (known.size) $$("[data-mid]", next).forEach((m) => !known.has(m.dataset.mid) && m.classList.add("fresh"));
      if (th && !stick) next.dataset.stuck = "no";
      bind(next); days(next);
      if (th && !stick) next.scrollTop = keep;
    });
    tick();
  }
  let refreshTimer, live = $("#live");
  async function refresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(async () => { try { const r = await fetch(location.href, { credentials: "same-origin" }); if (r.ok && r.url === location.href) swap(await r.text()); } catch {} }, 250); }
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
    [["Everything", "/dashboard", "every project and message", "layers"], ["Agents", "/dashboard?view=agents", "your agents' chats", "message"], ["Account", "/account", "tokens, browsers, GitHub", "user"], ["Docs", "/docs", "how intercom works", "book"]].forEach(([name, href, sub, ic]) => out.push({ group: "Pages", name, sub, href, icon: ICONS_K[ic] || "" }));
    return out;
  };
  const ICONS_K = { folder: ${JSON.stringify(icon("folder", 16))}, layers: ${JSON.stringify(icon("layers", 16))}, message: ${JSON.stringify(icon("message", 16))}, user: ${JSON.stringify(icon("user", 16))}, book: ${JSON.stringify(icon("book", 16))} };
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
  bind(); days(); tick(); setInterval(tick, 20000); connect();
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
<title>${esc(title)}</title><meta name="theme-color" content="#09090d" media="(prefers-color-scheme: dark)"><meta name="theme-color" content="#f6f6f8" media="(prefers-color-scheme: light)">
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
