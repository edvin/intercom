import installSh from "../client/install.sh";
import setupSh from "../client/setup.sh";
import hookSh from "../plugins/intercom/hook.sh";
import commandMd from "../plugins/intercom/commands/intercom.md";
import channelMjs from "../plugins/intercom/intercom-channel.mjs" with { type: "text" };
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

export { TeamHub };

const text = (body: string) => new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" } });

const CLIENT_FILES: Record<string, string> = {
  "/client/hook.sh": hookSh,
  "/client/statusline.sh": statuslineSh,
  "/client/brief.sh": briefSh,
  "/client/codex-skill.md": codexSkill,
  "/client/intercom.md": commandMd,
  "/client/intercom-channel.mjs": channelMjs,
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
    if (url.pathname === "/docs") return docsPage(url.origin);
    return env.HUB.get(env.HUB.idFromName("team"), { locationHint: "weur" }).fetch(req);
  },
} satisfies ExportedHandler<WorkerEnv>;
