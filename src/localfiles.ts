// Files your own agents mention (a screenshot in /tmp, a report under ~/): the dashboard links each path, and
// opening the link asks that agent's local intercom server, over its WebSocket, to send the file. The browser's
// request waits for it (the hub is one object, so the waiting request and the upload meet in memory) and is
// then redirected to the stored copy. Only paths the agent itself printed can be fetched, only by its owner.

import { type Attachment, storeFile } from "./attachments";
import { type Env, UserError } from "./lib";
import { outdated } from "./version";

/** The first plugin version whose local server answers file requests. */
export const LOCAL_FILES_SINCE = "0.12.16";
const WAIT_MS = 30_000;

type Reply = { ok: Attachment } | { error: string };
const waiting = new Map<string, { member: string; done: (r: Reply) => void }>();

/** The stored copy of `path` from `me`'s agent `label`, fetched from its machine; throws UserError with the reason. */
export async function fetchLocalFile(env: Env, me: string, label: string, path: string): Promise<Attachment> {
  if (!env.askFile) throw new UserError("Fetching files from agents isn't available here.");
  if (!path || path.length > 1024 || /[\0\n]/.test(path)) throw new UserError("That isn't a file path.");
  const s = await env.DB.prepare("SELECT session_id, version FROM sessions WHERE member = ? AND label = ? ORDER BY last_seen DESC LIMIT 1")
    .bind(me, label)
    .first<{ session_id: string; version: string }>();
  if (!s) throw new UserError(`You have no agent named ${label}.`);
  // Only what the agent wrote (its terminal text and steps, or its messages), so a link can't be made up for any file.
  // As a whole path, not part of a longer one (".env" inside ".env.example" doesn't count).
  const { results: texts } = await env.DB.prepare(
    `SELECT text AS t FROM activity WHERE member = ? AND session_id = ? AND instr(text, ?) > 0
     UNION ALL SELECT body AS t FROM messages WHERE sender = ? AND sender_agent = ? AND instr(body, ?) > 0 LIMIT 50`,
  )
    .bind(me, s.session_id, path, me, label, path)
    .all<{ t: string }>();
  const whole = new RegExp(`(^|[\\s(\\[>"'\`])${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s&).,:;!?\\]'"<\`])`);
  const said = texts.some((r) => whole.test(r.t));
  if (!said) throw new UserError(`${label} hasn't mentioned that file, so it can't be fetched.`);
  if (outdated(s.version, LOCAL_FILES_SINCE)) throw new UserError(`${label} runs intercom ${s.version || "(unknown)"}; fetching files needs ${LOCAL_FILES_SINCE}. Restart it after /intercom:update.`);
  const req = crypto.randomUUID();
  const reply = new Promise<Reply>((resolve) => {
    const timer = setTimeout(() => done({ error: `${label} didn't send the file within ${WAIT_MS / 1000} seconds.` }), WAIT_MS);
    const done = (r: Reply) => {
      clearTimeout(timer);
      waiting.delete(req);
      resolve(r);
    };
    waiting.set(req, { member: me, done });
  });
  if (!env.askFile(me, s.session_id, req, path)) {
    waiting.get(req)?.done({ error: `${label} isn't connected right now; its files can be fetched while it runs.` });
  }
  const r = await reply;
  if ("error" in r) throw new UserError(r.error);
  return r.ok;
}

/** A local server's answer to a file request: the file (base64) or why it couldn't send it. */
export async function fileReply(env: Env, me: string, body: { req?: unknown; name?: unknown; mime?: unknown; data?: unknown; error?: unknown }): Promise<boolean> {
  const w = waiting.get(String(body.req ?? ""));
  if (!w || w.member !== me) return false;
  if (typeof body.error === "string") w.done({ error: body.error.slice(0, 300) });
  else {
    try {
      w.done({ ok: await storeFile(env, me, { name: String(body.name ?? ""), mime: String(body.mime ?? ""), data: String(body.data ?? "") }) });
    } catch (e) {
      w.done({ error: (e as Error).message });
    }
  }
  return true;
}
