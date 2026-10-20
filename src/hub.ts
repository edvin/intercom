import { DurableObject } from "cloudflare:workers";
import { handle, json } from "./app";
import { SqlDb, splitStatements } from "./db";
import { type Env, type Message, address, authenticate, fmtMessage, prune, resolveProject, setPresence, touchSession, unread } from "./lib";
import m0001 from "../migrations/0001_init.sql";
import m0002 from "../migrations/0002_projects.sql";
import m0003 from "../migrations/0003_sessions.sql";
import m0004 from "../migrations/0004_broadcast.sql";
import m0005 from "../migrations/0005_membership.sql";

const MIGRATIONS: [string, string][] = [
  ["0001_init", m0001],
  ["0002_projects", m0002],
  ["0003_sessions", m0003],
  ["0004_broadcast", m0004],
  ["0005_membership", m0005],
];

const DAY = 86400_000;

export interface WorkerEnv {
  HUB: DurableObjectNamespace<TeamHub>;
  ADMIN_TOKEN?: string;
  /** Days to keep messages (default 90). Decisions are kept forever. */
  RETENTION_DAYS?: string;
}

/**
 * Stored on each WebSocket so it survives hibernation.
 * mode "push": a Claude Code channel; messages are delivered into the session and count as read.
 * mode "peek": channels unavailable (e.g. blocked by org policy); the local server is only told that
 * something arrived (to raise a desktop notification and let the hooks fetch it), nothing is marked read.
 * mode "web": an open dashboard; told to refresh when anything it shows may have changed.
 */
interface SocketInfo {
  member: string;
  session_id: string;
  label: string;
  project: string;
  mode: "push" | "peek" | "web";
}

/**
 * The whole team's state: one Durable Object with its own SQLite, so queries are in-process (microseconds)
 * and every request costs a single hop. It also holds the channel servers' WebSockets and pushes to them.
 */
export class TeamHub extends DurableObject<WorkerEnv> {
  private readonly db: SqlDb;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    this.db = new SqlDb(ctx.storage);
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.migrate();
      if ((await ctx.storage.getAlarm()) === null) await ctx.storage.setAlarm(Date.now() + 60_000);
    });
  }

  /** Daily housekeeping: message retention, expired locks, invites and stale sessions. */
  async alarm(): Promise<void> {
    const days = Number(this.env.RETENTION_DAYS) || undefined;
    const removed = await prune(this.appEnv(), days);
    console.log("prune", JSON.stringify(removed));
    await this.ctx.storage.setAlarm(Date.now() + DAY);
  }

  private migrate(): void {
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
    const done = new Set(sql.exec("SELECT name FROM _migrations").toArray().map((r) => r.name));
    for (const [name, ddl] of MIGRATIONS) {
      if (done.has(name)) continue;
      const statements = splitStatements(ddl);
      this.ctx.storage.transactionSync(() => {
        for (const st of statements) sql.exec(st);
        sql.exec("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)", name, Date.now());
      });
    }
  }

  private appEnv(): Env {
    return { DB: this.db, onMessage: (m) => this.fanout(m) };
  }

  async fetch(req: Request): Promise<Response> {
    if (new URL(req.url).pathname === "/ws") return this.acceptChannel(req);
    return handle(req, this.appEnv(), this.env.ADMIN_TOKEN);
  }

  private async acceptChannel(req: Request): Promise<Response> {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "expected websocket" }, 426);
    const env = this.appEnv();
    const me = await authenticate(req, env);
    if (!me) return json({ error: "unauthorized" }, 401);
    if (new URL(req.url).searchParams.get("web") === "1") return this.acceptDashboard(req, me);
    const sessionId = req.headers.get("x-intercom-session");
    if (!sessionId) return json({ error: "missing x-intercom-session" }, 400);
    const raw = req.headers.get("x-intercom-project");
    const project = raw ? ((await resolveProject(env, raw, me))?.name ?? "") : "";
    await setPresence(env, me, project || null, null);
    const session = await touchSession(env, me, sessionId, project);
    const mode = req.headers.get("x-intercom-mode") === "peek" ? "peek" : "push";

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [me]);
    server.serializeAttachment({ member: me, session_id: sessionId, label: session.label, project, mode } satisfies SocketInfo);
    if (mode === "push") {
      server.send(JSON.stringify({ type: "hello", address: address(me, session.label), project, pending: 0 }));
      // Catch up on whatever this session missed while disconnected.
      const { messages } = await unread(env, me, 50, true, session);
      for (const m of messages) server.send(JSON.stringify({ type: "message", message: m, text: fmtMessage(m) }));
    } else {
      const { messages } = await unread(env, me, 1, false, session);
      server.send(JSON.stringify({ type: "hello", address: address(me, session.label), project, pending: messages.length }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  /** A dashboard tab. Cookie-authenticated, so only same-origin pages may connect (no cross-site WebSocket hijacking). */
  private acceptDashboard(req: Request, me: string): Response {
    if (req.headers.get("origin") !== new URL(req.url).origin) return json({ error: "cross-origin" }, 403);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [me]);
    server.serializeAttachment({ member: me, session_id: "", label: "web", project: "", mode: "web" } satisfies SocketInfo);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Push a freshly stored message to every connected session that should receive it (same rules as RECEIVES). */
  private fanout(m: Message): void {
    const sockets = this.ctx.getWebSockets();
    if (!sockets.length) return;
    const sql = this.ctx.storage.sql;
    const names = (q: string, ...p: SqlStorageValue[]) => new Set(sql.exec(q, ...p).toArray().map((r) => Object.values(r)[0] as string));
    const mutedSender = names("SELECT member FROM mutes WHERE muted = ?", m.sender);
    const members = m.recipient ? undefined : names("SELECT member FROM project_members WHERE project = ?", m.channel);
    const mutedChannel = m.recipient ? undefined : names("SELECT member FROM follows WHERE channel = ? AND mode = 'mute'", m.channel);
    const text = fmtMessage(m);
    for (const ws of sockets) {
      const s = ws.deserializeAttachment() as SocketInfo | null;
      if (!s) continue;
      if (s.mode === "web") {
        // Dashboards also show your own activity, and muted things still appear in the feed.
        const sees = m.recipient ? m.recipient === s.member || m.sender === s.member : members!.has(s.member);
        if (sees) this.safeSend(ws, '{"type":"refresh"}');
        continue;
      }
      if (s.member === m.sender) continue;
      const receives = m.recipient
        ? m.recipient === s.member && !mutedSender.has(s.member) && (!m.recipient_agent || m.recipient_agent === s.label || m.recipient_agent === s.project)
        : members!.has(s.member) && (m.broadcast === 1 || (!mutedSender.has(s.member) && !mutedChannel!.has(s.member)));
      if (!receives) continue;
      try {
        if (s.mode === "peek") {
          ws.send(JSON.stringify({ type: "peek", message: m, text }));
          continue;
        }
        ws.send(JSON.stringify({ type: "message", message: m, text }));
        sql.exec("UPDATE sessions SET cursor = MAX(cursor, ?), last_seen = ? WHERE member = ? AND session_id = ?", m.id, Date.now(), s.member, s.session_id);
        sql.exec("UPDATE cursors SET last_read_id = MAX(last_read_id, ?) WHERE member = ?", m.id, s.member);
      } catch {
        // Socket is closing; the session catches up from its cursor on reconnect.
      }
    }
  }

  private safeSend(ws: WebSocket, data: string): void {
    try {
      ws.send(data);
    } catch {
      // closing
    }
  }

  async webSocketMessage(): Promise<void> {
    // Channel servers only listen; tool calls go over HTTP. Keep-alive "ping" is auto-answered.
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    const s = ws.deserializeAttachment() as SocketInfo | null;
    if (s) this.ctx.storage.sql.exec("UPDATE sessions SET last_seen = ? WHERE member = ? AND session_id = ?", Date.now(), s.member, s.session_id);
    try {
      ws.close(code === 1005 ? 1000 : code, "closed");
    } catch {
      // already closed
    }
  }
}
