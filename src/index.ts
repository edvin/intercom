import installSh from "../client/install.sh";
import setupSh from "../client/setup.sh";
import hookSh from "../plugins/intercom/hook.sh";
import commandMd from "../plugins/intercom/commands/intercom.md";
import channelMjs from "../plugins/intercom/intercom-channel.mjs" with { type: "text" };
import statuslineSh from "../plugins/intercom/statusline.sh";
import { TeamHub, type WorkerEnv } from "./hub";
import { docsPage } from "./web";

export { TeamHub };

const text = (body: string) => new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" } });

const CLIENT_FILES: Record<string, string> = {
  "/client/hook.sh": hookSh,
  "/client/statusline.sh": statuslineSh,
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
    if (url.pathname === "/docs") return docsPage(url.origin);
    return env.HUB.get(env.HUB.idFromName("team"), { locationHint: "weur" }).fetch(req);
  },
} satisfies ExportedHandler<WorkerEnv>;
