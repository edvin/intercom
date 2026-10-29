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

/** "[📎 file #13: report.pdf · 240 KB]": any other file an agent shared; the dashboard offers it as a download. */
export const fileMarker = (a: Pick<Attachment, "id" | "name" | "bytes">) => `[📎 file #${a.id}: ${a.name.replace(/[\]\n·]/g, "")} · ${size(a.bytes)}]`;
export const isImage = (mime: string) => TYPES.has(mime);
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function size(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A file an agent shares from its machine (the local intercom server reads it and sends it base64). */
export async function storeFile(env: Env, me: string, f: { name: string; mime: string; data: string }): Promise<Attachment> {
  if (!env.files) throw new UserError("File sharing isn't enabled on this intercom.");
  await limit(env, `upload:${me}`, 100, 3600_000, "uploads");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
  } catch {
    throw new UserError("The file data didn't arrive intact; try again.");
  }
  if (!bytes.length) throw new UserError("That file is empty.");
  if (bytes.length > MAX_FILE_BYTES) throw new UserError(`That file is over ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(f.mime) ? f.mime.toLowerCase() : "application/octet-stream";
  const key = `att/${crypto.randomUUID()}`;
  await env.files.put(key, bytes, { httpMetadata: { contentType: mime } });
  const name = (f.name || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
  const row = await env.DB.prepare("INSERT INTO attachments (member, r2_key, mime, bytes, name, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *")
    .bind(me, key, mime, bytes.length, name, Date.now())
    .first<Attachment>();
  return row!;
}

/** Text an agent can read straight from a shared file, when it is text and small. */
export const isText = (a: Attachment) => /^text\/|\/(json|xml|yaml|x-yaml|csv|x-sh|javascript|typescript)$/.test(a.mime) && a.bytes <= 200_000;

/** Store files sent with a message from the dashboard: images (shown inline) and any other file (downloaded). */
export async function storeImages(env: Env, me: string, files: File[]): Promise<Attachment[]> {
  if (!files.length) return [];
  if (!env.files) throw new UserError("Attachments aren't enabled on this intercom.");
  if (files.length > MAX_IMAGES) throw new UserError(`At most ${MAX_IMAGES} files per message.`);
  await limit(env, `upload:${me}`, 100, 3600_000, "uploads");
  const out: Attachment[] = [];
  for (const f of files) {
    const image = TYPES.has(f.type);
    const max = image ? MAX_BYTES : MAX_FILE_BYTES;
    if (f.size > max) throw new UserError(`${f.name || "That file"} is over ${max / 1024 / 1024} MB.`);
    // Anything else is stored as it came, under a plain type: it's only ever downloaded, never shown on this origin.
    const mime = image ? f.type : /^[\w.+-]+\/[\w.+-]+$/.test(f.type) && !/html|xml|svg|javascript/i.test(f.type) ? f.type.toLowerCase() : "application/octet-stream";
    const key = `att/${crypto.randomUUID()}`;
    await env.files.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: mime } });
    const name = (f.name || (image ? "image" : "file")).replace(/[^\w.\- ]+/g, "_").slice(0, 80);
    const row = await env.DB.prepare("INSERT INTO attachments (member, r2_key, mime, bytes, name, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *")
      .bind(me, key, mime, f.size, name, Date.now())
      .first<Attachment>();
    out.push(row!);
  }
  return out;
}

/** The marker a stored attachment gets in its message: an image to look at, or a file to save. */
export const markerFor = (a: Attachment) => (isImage(a.mime) ? marker(a) : fileMarker(a));

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

/** The bytes, or null when gone (expired). */
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
