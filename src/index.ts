import installSh from "../client/install.sh";
import setupSh from "../client/setup.sh";
import hookSh from "../plugins/intercom/hook.sh";
import commandMd from "../plugins/intercom/commands/intercom.md";
import channelMjs from "../plugins/intercom/intercom-channel.mjs" with { type: "text" };
import codeMjs from "../plugins/intercom/code.mjs" with { type: "text" };
import statuslineSh from "../plugins/intercom/statusline.sh";
import briefSh from "../plugins/intercom/brief.sh";
import codexSkill from "../client/codex/SKILL.md";
import { TeamHub, type WorkerEnv } from "./hub";
import { docsPage } from "./web";
import geist from "../assets/geist.woff2";
import geistMono from "../assets/geist-mono.woff2";
import jetbrainsMono from "../assets/jetbrains-mono.woff2";
import icon180 from "../assets/icon-180.png";
import icon192 from "../assets/icon-192.png";
import icon512 from "../assets/icon-512.png";

const FONTS: Record<string, ArrayBuffer> = { "/assets/geist.woff2": geist, "/assets/geist-mono.woff2": geistMono, "/assets/jetbrains-mono.woff2": jetbrainsMono };
const ICONS: Record<string, ArrayBuffer> = { "/assets/icon-180.png": icon180, "/assets/icon-192.png": icon192, "/assets/icon-512.png": icon512 };

// Added to a phone's home screen, the dashboard opens as an app of its own: full screen, on the agents.
const MANIFEST = JSON.stringify({
  name: "Intercom",
  short_name: "Intercom",
  start_url: "/dashboard?view=agents",
  scope: "/",
  display: "standalone",
  background_color: "#0b0b10",
  theme_color: "#0b0b10",
  icons: [
    { src: "/assets/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
});

// The service worker: only shows notifications (push.ts) and opens the dashboard on the one tapped. It handles no
// fetches, so pages load exactly as without it. The app icon's badge carries the count waiting for you.
const SERVICE_WORKER = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// Tells the hub what happened, for Account's "last notification" line (the hub can't see the device otherwise).
async function report(what) {
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) await fetch("/push/report", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint, ...what }) });
  } catch {}
}
async function show(d) {
  // The notification first: a push that shows none can cost the subscription (iPhone switches them off).
  const title = d.title || "Intercom", data = { url: d.url || "/dashboard" };
  try {
    await self.registration.showNotification(title, { body: d.body || "", tag: d.tag || undefined, data });
    await report({ shown: true });
  } catch (err) {
    try { await self.registration.showNotification(title, { body: d.body || "", data }); } catch {}
    await report({ error: String(err && err.message || err) });
  }
  try { if (self.navigator.setAppBadge && typeof d.count === "number") await (d.count ? self.navigator.setAppBadge(d.count) : self.navigator.clearAppBadge()); } catch {}
}
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(show(d));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/dashboard", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
    for (const c of list) {
      if (new URL(c.url).origin !== self.location.origin) continue;
      try { const n = await c.navigate(url); if (n) return n.focus(); } catch {}
      return c.focus();
    }
    return self.clients.openWindow(url);
  }));
});
`;

export { TeamHub };

const text = (body: string) => new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" } });

const CLIENT_FILES: Record<string, string> = {
  "/client/hook.sh": hookSh,
  "/client/statusline.sh": statuslineSh,
  "/client/brief.sh": briefSh,
  "/client/codex-skill.md": codexSkill,
  "/client/intercom.md": commandMd,
  "/client/intercom-channel.mjs": channelMjs,
  "/client/code.mjs": codeMjs,
};

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(req.url);
    // Stateless routes are answered at the edge; everything else is one hop to the team hub.
    if (url.pathname === "/health") return text("intercom ok\n");
    if (url.pathname === "/install.sh" || url.pathname === "/setup.sh") {
      const script = url.pathname === "/install.sh" ? installSh : setupSh;
      return text(script.replaceAll("__INTERCOM_URL_HOST__", url.host).replaceAll("__INTERCOM_URL__", url.origin));
    }
    if (CLIENT_FILES[url.pathname]) return text(CLIENT_FILES[url.pathname]);
    if (FONTS[url.pathname]) {
      return new Response(FONTS[url.pathname], { headers: { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*" } });
    }
    if (ICONS[url.pathname]) return new Response(ICONS[url.pathname], { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
    if (url.pathname === "/manifest.webmanifest") return new Response(MANIFEST, { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" } });
    if (url.pathname === "/sw.js") return new Response(SERVICE_WORKER, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" } });
    if (url.pathname === "/docs") return docsPage(url.origin);
    // Bodies are read whole inside the one hub object: a huge one could take it down for everyone. Messages with
    // attachments (4 × 10 MB) and files from agents may be large; nothing else needs more than a little.
    const big = /^\/(action\/post|api\/file-reply|api\/code-reply|mcp)$/.test(url.pathname);
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > (big ? 45 : 1) * 1024 * 1024) return new Response("Request too large", { status: 413 });
    return env.HUB.get(env.HUB.idFromName("team"), { locationHint: "weur" }).fetch(req);
  },
} satisfies ExportedHandler<WorkerEnv>;
