// Images sent with a message (pasted, dropped or picked in the dashboard). The bytes live in R2; the message
// carries a marker, "[📎 image #12: shot.png]", which reaches every client as text: agents fetch the image with
// the attachment tool, the dashboard shows it as a thumbnail. Whoever may read the message may see its images.
import { type Env, UserError, limit, roleIn } from "./lib";

export const MAX_IMAGES = 4;
export const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export const RETENTION_DAYS = 30; // matches the bucket's lifecycle rule

export interface Attachment {
  id: number;
  message_id: number | null;
  member: string;
  r2_key: string;
  mime: string;
  bytes: number;
  name: string;
  created_at: number;
}

/** "[📎 image #12: shot.png]": what a message says about an image; agents open it with the attachment tool. */
export const marker = (a: Pick<Attachment, "id" | "name">) => `[📎 image #${a.id}${a.name ? `: ${a.name.replace(/[\]\n]/g, "")}` : ""}]`;
export const MARKER_RE = /\[📎 image #(\d+)(?::[^\]\n]*)?\]/g;

/** Store uploaded images; returns their markers, to append to the message. */
export async function storeImages(env: Env, me: string, files: File[]): Promise<Attachment[]> {
  if (!files.length) return [];
  if (!env.files) throw new UserError("Images aren't enabled on this intercom.");
  if (files.length > MAX_IMAGES) throw new UserError(`At most ${MAX_IMAGES} images per message.`);
  await limit(env, `upload:${me}`, 100, 3600_000, "image uploads");
  const out: Attachment[] = [];
  for (const f of files) {
    if (!TYPES.has(f.type)) throw new UserError(`${f.name || "That file"} isn't an image (PNG, JPEG, WebP or GIF).`);
    if (f.size > MAX_BYTES) throw new UserError(`${f.name || "That image"} is over ${MAX_BYTES / 1024 / 1024} MB.`);
    const key = `att/${crypto.randomUUID()}`;
    await env.files.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: f.type } });
    const name = (f.name || "image").replace(/[^\w.\- ]+/g, "_").slice(0, 60);
    const row = await env.DB.prepare("INSERT INTO attachments (member, r2_key, mime, bytes, name, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *")
      .bind(me, key, f.type, f.size, name, Date.now())
      .first<Attachment>();
    out.push(row!);
  }
  return out;
}

export async function linkImages(env: Env, me: string, ids: number[], messageId: number): Promise<void> {
  if (!ids.length) return;
  await env.DB.prepare(`UPDATE attachments SET message_id = ? WHERE member = ? AND message_id IS NULL AND id IN (SELECT value FROM json_each(?))`)
    .bind(messageId, me, JSON.stringify(ids))
    .run();
}

/** The attachment, if `me` may see it: its uploader, or someone who can read its message. */
export async function getAttachment(env: Env, me: string, id: number): Promise<Attachment | null> {
  const a = await env.DB.prepare("SELECT * FROM attachments WHERE id = ?").bind(id).first<Attachment>();
  if (!a) return null;
  if (a.member === me) return a;
  if (a.message_id === null) return null;
  const m = await env.DB.prepare("SELECT channel, sender, recipient FROM messages WHERE id = ?")
    .bind(a.message_id)
    .first<{ channel: string; sender: string; recipient: string | null }>();
  if (!m) return null;
  if (m.recipient) return m.sender === me || m.recipient === me ? a : null;
  return (await roleIn(env, me, m.channel)) ? a : null;
}

/** The image bytes, or null when gone (expired). */
export async function readImage(env: Env, a: Attachment): Promise<ArrayBuffer | null> {
  const obj = await env.files?.get(a.r2_key);
  return obj ? await obj.arrayBuffer() : null;
}

/** Base64 for an MCP image result. */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Housekeeping: rows whose images the bucket has expired. */
export async function pruneAttachments(env: Env, now = Date.now()): Promise<number> {
  const res = await env.DB.prepare("DELETE FROM attachments WHERE created_at < ?").bind(now - RETENTION_DAYS * 86400_000).run();
  return res.meta.changes;
}
