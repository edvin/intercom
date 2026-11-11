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

/** Videos, known by their name (agents' shares often come as application/octet-stream) or their type. */
const VIDEO_EXT: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg", mkv: "video/x-matroska", avi: "video/x-msvideo" };
export const VIDEO_EXTS = Object.keys(VIDEO_EXT);
export function videoType(name: string, mime = ""): string | null {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  return VIDEO_EXT[ext] ?? (/^video\/[\w.+-]+$/.test(mime) ? mime : null);
}
export const isVideoName = (name: string) => !!videoType(name);
/** Ones a browser plays (the rest download). */
export const playable = (type: string | null) => !!type && /^video\/(mp4|webm|ogg|quicktime)$/.test(type);
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

// ---- reading in the dashboard (reader.ts) ----

/** Files read best as text, by extension (a browser upload of a .md often comes without a useful type). */
const TEXT_EXT = /\.(md|markdown|mdx|txt|text|log|out|csv|tsv|json|jsonl|ndjson|ya?ml|toml|ini|cfg|conf|xml|html?|svg|diff|patch|sh|bash|zsh|sql|tsx?|jsx?|mjs|cjs|py|rb|go|rs|java|kt|swift|php|cs|c|h|cpp|css|scss|graphql|proto|tf|dockerfile|gitignore)$/i;
export const MAX_READ = 2 * 1024 * 1024;

/** Whether a file by this name reads in the dashboard rather than downloads (the chip in a message decides on this). */
export const readableName = (name: string) => TEXT_EXT.test(name.trim());

/** Whether this stored file can be shown as text. */
export const readable = (a: Attachment) =>
  a.bytes <= MAX_READ && (readableName(a.name) || /^text\/|\/(json|xml|yaml|x-yaml|csv|x-sh|javascript|typescript|x-diff)$/.test(a.mime));

/**
 * Thumbnails, so the files grid and chats don't download whole files to show a tile (a phone on mobile data):
 * an image's is a small WebP made once by Cloudflare Images and kept beside it in R2; a video's is its first frame,
 * which the first dashboard to show it captures and sends (posters in ui.ts), as the hub can't decode video.
 * "original": no smaller one (a small image, a GIF that should keep moving, Images not bound); null: none yet.
 */
export const THUMB_W = 640;
const SMALL = 120_000;
const thumbKey = (a: Attachment) => `thumb/${a.r2_key}`;

export async function thumbnail(env: Env, a: Attachment): Promise<{ body: ReadableStream | ArrayBuffer; type: string } | "original" | null> {
  const t = await env.files?.get(thumbKey(a));
  if (t) return { body: t.body, type: t.httpMetadata?.contentType ?? "image/webp" };
  if (!isImage(a.mime)) return null;
  if (a.bytes < SMALL || a.mime === "image/gif" || !env.images || !env.files) return "original";
  const obj = await env.files.get(a.r2_key);
  if (!obj) return "original";
  try {
    const out = await env.images.input(obj.body).transform({ width: THUMB_W, fit: "scale-down" }).output({ format: "image/webp", quality: 72 });
    const buf = await out.response().arrayBuffer();
    if (buf.byteLength >= a.bytes) return "original";
    await env.files.put(thumbKey(a), buf, { httpMetadata: { contentType: "image/webp" } });
    return { body: buf, type: "image/webp" };
  } catch (e) {
    console.warn(`thumbnail of attachment ${a.id} failed: ${(e as Error).message}`);
    return "original";
  }
}

/** A video's poster frame from the dashboard: a JPEG, small, and only the first one sent counts. */
export const POSTER_MAX = 400_000;
export async function savePoster(env: Env, a: Attachment, buf: ArrayBuffer): Promise<boolean> {
  const b = new Uint8Array(buf);
  if (!env.files || !playable(videoType(a.name, a.mime)) || b.length < 100 || b.length > POSTER_MAX || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return false;
  if (await env.files.head(thumbKey(a))) return true;
  await env.files.put(thumbKey(a), buf, { httpMetadata: { contentType: "image/jpeg" } });
  return true;
}
