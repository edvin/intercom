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

const FONTS: Record<string, ArrayBuffer> = { "/assets/geist.woff2": geist, "/assets/geist-mono.woff2": geistMono };

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
    if (url.pathname === "/docs") return docsPage(url.origin);
    return env.HUB.get(env.HUB.idFromName("team"), { locationHint: "weur" }).fetch(req);
  },
} satisfies ExportedHandler<WorkerEnv>;
