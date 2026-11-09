// Notifications on your phone (or any browser) when something is waiting for you: a review to decide, a permission
// prompt or question an agent is stuck on, an agent's answer to what you asked on a review. Standard web push: the
// browser subscribes with the hub's VAPID key, the hub encrypts each notification for that browser (RFC 8291) and
// signs the request (RFC 8292). Nothing but WebCrypto; the key pair is made on first use and kept in the hub.
//
// A review or an answer goes out at once. An approval waits a minute first: at your desk you answer in the terminal,
// and it never reaches your phone. When a notification is due it's built from the item as it is then, so anything
// answered, decided or withdrawn meanwhile is skipped.

import { daySummary, scheduleSummary } from "./work";
import { NUDGE_WAIT_MS, nudgeStuck, stuckNote, stuckSessions } from "./stuck";
import { compactDue } from "./upkeep";
import { resetDue } from "./resets";
import { type Env } from "./lib";

/** How long an approval waits for you at your desk before it reaches your phone. */
export const APPROVAL_DELAY = 60_000;
const MAX_SUBS = 10; // per member: browsers that come and go are dropped when their service says they're gone

export interface PushSub {
  endpoint: string;
  member: string;
  p256dh: string;
  auth: string;
  device: string;
  created_at: number;
  last_ok: number | null;
  last_at: number | null;
  last_status: string;
}

const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array): string => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const unb64u = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) out.set(p, (i += p.length) - p.length);
  return out;
};

/** The hub's VAPID key pair, made the first time anyone turns notifications on. */
async function keys(env: Env): Promise<{ publicKey: string; privateKey: CryptoKey; subject: string }> {
  let row = await env.DB.prepare("SELECT public_key, private_jwk, subject FROM push_keys WHERE id = 1").first<{ public_key: string; private_jwk: string; subject: string }>();
  if (!row) {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pub = b64u((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
    const jwk = JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey));
    // The push services' contact for whoever runs this hub: its own address.
    await env.DB.prepare("INSERT OR IGNORE INTO push_keys (id, public_key, private_jwk, subject, created_at) VALUES (1, ?, ?, ?, ?)").bind(pub, jwk, env.origin || "https://localhost", Date.now()).run();
    row = (await env.DB.prepare("SELECT public_key, private_jwk, subject FROM push_keys WHERE id = 1").first())!;
  }
  const privateKey = await crypto.subtle.importKey("jwk", JSON.parse(row.private_jwk) as JsonWebKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { publicKey: row.public_key, privateKey, subject: row.subject };
}

export async function publicKey(env: Env): Promise<string> {
  return (await keys(env)).publicKey;
}

/** The Authorization header for one push service (RFC 8292): a JWT for its origin, signed with ES256. */
async function vapid(endpoint: string, k: { publicKey: string; privateKey: CryptoKey; subject: string }): Promise<string> {
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: k.subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k.privateKey, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${k.publicKey}`;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** The payload encrypted for one browser (RFC 8291, aes128gcm, one record). */
export async function encrypt(sub: { p256dh: string; auth: string }, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = unb64u(sub.p256dh);
  const authSecret = unb64u(sub.auth);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

/** A short name for the browser, from its user agent (shown under Account). */
export function deviceName(ua: string): string {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const app = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [app, os].filter(Boolean).join(" on ") || "Browser";
}

export async function subscribe(env: Env, me: string, body: unknown, ua: string): Promise<void> {
  const b = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof b?.endpoint === "string" ? b.endpoint : "";
  const p256dh = typeof b?.keys?.p256dh === "string" ? b.keys.p256dh : "";
  const auth = typeof b?.keys?.auth === "string" ? b.keys.auth : "";
  // Only https push services, and keys of the right shape: the hub POSTs to this URL later.
  let ok = false;
  try {
    ok = new URL(endpoint).protocol === "https:" && endpoint.length < 1000 && unb64u(p256dh).length === 65 && unb64u(auth).length === 16;
  } catch {}
  if (!ok) throw new Error("Not a push subscription");
  await env.DB.prepare(
    "INSERT INTO push_subs (endpoint, member, p256dh, auth, device, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET member = excluded.member, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device",
  )
    .bind(endpoint, me, p256dh, auth, deviceName(ua), Date.now())
    .run();
  await env.DB.prepare("DELETE FROM push_subs WHERE member = ? AND endpoint NOT IN (SELECT endpoint FROM push_subs WHERE member = ? ORDER BY created_at DESC LIMIT ?)").bind(me, me, MAX_SUBS).run();
}

export async function unsubscribe(env: Env, me: string, endpoint: string): Promise<void> {
  await env.DB.prepare("DELETE FROM push_subs WHERE member = ? AND endpoint = ?").bind(me, endpoint).run();
}

export async function subscriptions(env: Env, me: string): Promise<PushSub[]> {
  const { results } = await env.DB.prepare("SELECT * FROM push_subs WHERE member = ? ORDER BY created_at DESC").bind(me).all<PushSub>();
  return results;
}

/**
 * Something new is waiting for `me`: "a<id>" an approval, "r<id>" a review, "q<id>" an answer on review <id>,
 * "t<id>" a ticket, "k<id>" an answer on ticket <id>.
 * Due at once, or after `delay`. Nothing is queued for someone with no browser to send to.
 */
export async function queuePush(env: Env, me: string, ref: string, delay = 0, extra = ""): Promise<void> {
  if (!(await env.DB.prepare("SELECT 1 FROM push_subs WHERE member = ?").bind(me).first())) return;
  const due = Date.now() + delay;
  await env.DB.prepare("DELETE FROM push_queue WHERE member = ? AND ref = ?").bind(me, ref).run();
  await env.DB.prepare("INSERT INTO push_queue (member, ref, due_at, extra) VALUES (?, ?, ?, ?)").bind(me, ref, due, extra).run();
  await env.wake?.(due);
}

interface Note {
  title: string;
  body: string;
  tag: string;
  url: string;
  count: number;
  ttl: number;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

async function waitingCount(env: Env, me: string): Promise<number> {
  const a = await env.DB.prepare("SELECT COUNT(*) AS n FROM approvals WHERE member = ? AND decision IS NULL AND expires_at > ?").bind(me, Date.now()).first<{ n: number }>();
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM reviews WHERE member = ? AND status = 'open'").bind(me).first<{ n: number }>();
  const t = await env.DB.prepare("SELECT COUNT(*) AS n FROM tickets WHERE member = ? AND status = 'open'").bind(me).first<{ n: number }>();
  return (a?.n ?? 0) + (r?.n ?? 0) + (t?.n ?? 0) + (await stuckSessions(env, me)).length;
}

/** The notification for a queued item as it is now; null when it's no longer waiting. */
async function noteFor(env: Env, me: string, ref: string, extra: string): Promise<Note | null> {
  const id = Number(ref.slice(1));
  const agentUrl = (label: string) => `/dashboard?view=agents&agent=${encodeURIComponent(`${me}/${label}`)}`;
  if (ref[0] === "a") {
    const a = await env.DB.prepare("SELECT label, tool, kind, summary, expires_at FROM approvals WHERE id = ? AND member = ? AND decision IS NULL AND expires_at > ?")
      .bind(id, me, Date.now())
      .first<{ label: string; tool: string; kind: string; summary: string; expires_at: number }>();
    if (!a) return null;
    const title = a.kind === "question" ? `${a.label} asks` : a.kind === "plan" ? `${a.label} has a plan for you` : `${a.label} needs approval`;
    const body = a.kind === "permission" ? a.summary : a.kind === "plan" ? a.summary.replace(/^Plan: /, "") : a.summary;
    return { title, body: clip(body, 180), tag: ref, url: agentUrl(a.label), count: 0, ttl: Math.max(60, Math.round((a.expires_at - Date.now()) / 1000)) };
  }
  if (ref === "s") {
    const sum = await daySummary(env, me, extra);
    return sum ? { title: sum.title, body: clip(sum.body, 240), tag: `s${extra}`, url: `/dashboard?view=work&date=${extra}`, count: 0, ttl: 43200 } : null;
  }
  if (ref[0] === "t" || ref[0] === "k") {
    const t = await env.DB.prepare("SELECT key, label, title, verdict FROM tickets WHERE id = ? AND member = ? AND status = 'open'").bind(id, me).first<{ key: string; label: string; title: string; verdict: string }>();
    if (!t) return null;
    const url = `/dashboard?view=ticket&id=${id}`;
    if (ref[0] === "k") return { title: `${t.label} answered you`, body: clip(`${t.key}: ${extra}`, 180), tag: `t${id}k`, url: `${url}#ask`, count: 0, ttl: 86400 };
    return { title: `Ticket ${t.key}: ${clip(t.title, 60)}`, body: clip(`${t.label}: ${t.verdict}`, 180), tag: ref, url, count: 0, ttl: 86400 };
  }
  const r = await env.DB.prepare("SELECT label, title, verdict FROM reviews WHERE id = ? AND member = ? AND status = 'open'").bind(id, me).first<{ label: string; title: string; verdict: string }>();
  if (!r) return null;
  if (ref[0] === "q") return { title: `${r.label} answered you`, body: clip(`${r.title}: ${extra}`, 180), tag: `r${id}q`, url: `/dashboard?view=review&id=${id}`, count: 0, ttl: 86400 };
  return { title: `Review: ${clip(r.title, 60)}`, body: clip(`${r.label}: ${r.verdict}`, 180), tag: ref, url: `/dashboard?view=review&id=${id}`, count: 0, ttl: 86400 };
}

/** Send one notification to every browser of `me`; a browser its push service says is gone is forgotten. Returns how many took it. */
export async function sendNote(env: Env, me: string, note: Note): Promise<number> {
  const subs = await subscriptions(env, me);
  if (!subs.length) return 0;
  const k = await keys(env);
  const payload = enc.encode(JSON.stringify({ title: note.title, body: note.body, tag: note.tag, url: note.url, count: note.count }));
  let sent = 0;
  for (const s of subs) {
    try {
      const res = await fetch(s.endpoint, {
        method: "POST",
        headers: { authorization: await vapid(s.endpoint, k), "content-encoding": "aes128gcm", "content-type": "application/octet-stream", ttl: String(note.ttl), urgency: "high" },
        body: await encrypt(s, payload),
      });
      if (res.status === 404 || res.status === 410) await unsubscribe(env, me, s.endpoint);
      else if (res.ok) {
        sent++;
        await status(env, s.endpoint, "", Date.now());
      } else await status(env, s.endpoint, `${host(s.endpoint)} refused it: ${res.status} ${(await res.text()).slice(0, 160)}`.trim());
    } catch (e) {
      await status(env, s.endpoint, `couldn't reach ${host(s.endpoint)}: ${String(e).slice(0, 160)}`);
    }
  }
  return sent;
}

const host = (endpoint: string) => {
  const h = new URL(endpoint).host;
  return /apple\.com$/.test(h) ? "Apple" : /googleapis\.com$/.test(h) ? "Google" : /mozilla/.test(h) ? "Mozilla" : h;
};

/** The last notification's outcome for one browser: "" delivered to its push service (`ok` then), else what went wrong. */
async function status(env: Env, endpoint: string, what: string, ok?: number): Promise<void> {
  await env.DB.prepare("UPDATE push_subs SET last_at = ?, last_status = ?, last_ok = COALESCE(?, last_ok) WHERE endpoint = ?").bind(Date.now(), what, ok ?? null, endpoint).run();
}

/** The device's own report (from the service worker): it showed the notification, or showing it failed. */
export async function phoneReport(env: Env, me: string, endpoint: string, error: string): Promise<void> {
  const what = error ? `the device couldn't show it: ${error.slice(0, 200)}` : "shown on the device";
  await env.DB.prepare("UPDATE push_subs SET last_at = ?, last_status = ? WHERE member = ? AND endpoint = ?").bind(Date.now(), what, me, endpoint).run();
}

/** A test notification, from Account. */
export async function sendTest(env: Env, me: string): Promise<number> {
  return sendNote(env, me, { title: "Intercom", body: "Notifications work. You'll get one when something is waiting for you.", tag: "test", url: "/dashboard?view=agents", count: await waitingCount(env, me), ttl: 300 });
}

/** Send what's due (from the hub's alarm). Returns when the next one is due, or null. */
export async function sendDuePushes(env: Env, now = Date.now()): Promise<number | null> {
  const { results } = await env.DB.prepare("SELECT * FROM push_queue WHERE due_at <= ? ORDER BY due_at LIMIT 50").bind(now).all<{ id: number; member: string; ref: string; extra: string }>();
  for (const q of results) {
    await env.DB.prepare("DELETE FROM push_queue WHERE id = ?").bind(q.id).run();
    if (q.ref[0] === "z") {
      // A compaction that warned first (upkeep.ts): its turn ended, or the wait is over.
      try {
        await compactDue(env, q.member, q.extra);
      } catch (e) {
        console.log("compact", q.ref, String(e));
      }
      continue;
    }
    if (q.ref[0] === "x") {
      // Codex agents ran out of usage (resets.ts): redeem a reset on their machine.
      await resetDue(env, q.member, q.extra);
      continue;
    }
    if (q.ref[0] === "u") {
      // A DM to one of their agents may not have been taken (stuck.ts): notify once, or look again later.
      try {
        // Wake it by itself first; the card and the notification only if that didn't work.
        if (await nudgeStuck(env, q.member, q.ref.slice(1))) {
          await env.DB.prepare("INSERT INTO push_queue (member, ref, due_at, extra) VALUES (?, ?, ?, '')").bind(q.member, q.ref, Date.now() + NUDGE_WAIT_MS + 30_000).run();
          continue;
        }
        const st = await stuckNote(env, q.member, q.ref.slice(1));
        if (st?.title) await sendNote(env, q.member, { title: st.title, body: clip(st.body, 240), tag: q.ref, url: "/dashboard?view=agents", count: await waitingCount(env, q.member), ttl: 86400 });
        else if (st?.again) {
          await env.DB.prepare("INSERT INTO push_queue (member, ref, due_at, extra) VALUES (?, ?, ?, '')").bind(q.member, q.ref, st.again).run();
        }
      } catch (e) {
        console.log("push", q.ref, String(e));
      }
      continue;
    }
    try {
      const note = await noteFor(env, q.member, q.ref, q.extra);
      if (note) await sendNote(env, q.member, { ...note, count: await waitingCount(env, q.member) });
    } catch (e) {
      console.log("push", q.ref, String(e));
    }
    if (q.ref === "s") await scheduleSummary(env, q.member, Date.now() + 3_600_000).catch(() => undefined); // tomorrow's
  }
  const next = await env.DB.prepare("SELECT MIN(due_at) AS at FROM push_queue").first<{ at: number | null }>();
  return next?.at ?? null;
}
