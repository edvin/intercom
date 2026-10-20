// Runs the hub's app code against Node's built-in SQLite, with the same migrations as production.
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { handle } from "../src/app.ts";
import { bindable, splitStatements, type Db, type Stmt } from "../src/db.ts";
import { type Env, type Message, sha256 } from "../src/lib.ts";

class NodeStmt implements Stmt {
  db: DatabaseSync;
  query: string;
  params: unknown[];
  constructor(db: DatabaseSync, query: string, params: unknown[] = []) {
    this.db = db;
    this.query = query;
    this.params = params;
  }
  bind(...values: unknown[]): Stmt {
    return new NodeStmt(this.db, this.query, bindable(values));
  }
  prepared(): StatementSync {
    return this.db.prepare(this.query);
  }
  async first<T>(): Promise<T | null> {
    return (this.prepared().get(...(this.params as never[])) as T | undefined) ?? null;
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.prepared().all(...(this.params as never[])) as T[] };
  }
  async run(): Promise<{ meta: { changes: number } }> {
    return { meta: { changes: Number(this.prepared().run(...(this.params as never[])).changes) } };
  }
}

export class TestDb implements Db {
  db = new DatabaseSync(":memory:");
  constructor() {
    const dir = new URL("../migrations/", import.meta.url);
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      for (const st of splitStatements(readFileSync(new URL(f, dir), "utf8"))) this.db.exec(st);
    }
  }
  prepare(query: string): Stmt {
    return new NodeStmt(this.db, query);
  }
  async batch(statements: Stmt[]): Promise<unknown[]> {
    this.db.exec("BEGIN");
    try {
      const out = [];
      for (const s of statements) out.push(await s.all());
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}

export const ORIGIN = "https://intercom.test";
export const ADMIN = "admin-secret";

export class World {
  db = new TestDb();
  pushed: Message[] = [];
  tokens: Record<string, string> = {};

  github?: { client_id: string; client_secret: string };

  env(): Env {
    return { DB: this.db, onMessage: (m) => this.pushed.push(m), github: this.github };
  }

  async request(path: string, init: RequestInit & { as?: string; cookie?: boolean } = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.as) headers.set(init.cookie ? "cookie" : "authorization", init.cookie ? `intercom_token=${this.tokens[init.as]}` : `Bearer ${this.tokens[init.as]}`);
    return handle(new Request(ORIGIN + path, { ...init, headers }), this.env(), ADMIN);
  }

  /** Create an account directly through the admin API. */
  async member(name: string, opts: { admin?: boolean; org?: string } = {}): Promise<void> {
    const token = `tok-${name}-${Math.random().toString(36).slice(2)}`;
    this.tokens[name] = token;
    const res = await this.request("/admin/members", {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" },
      body: JSON.stringify({ name, token_hash: await sha256(token), admin: opts.admin, org: opts.org }),
    });
    if (!res.ok) throw new Error(`member ${name}: ${res.status}`);
  }

  /** Call an MCP tool as a member. Returns the text and whether it was an error. */
  async tool(as: string, name: string, args: Record<string, unknown> = {}, session?: { id: string; project: string }): Promise<{ text: string; error: boolean }> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (session) Object.assign(headers, { "x-intercom-session": session.id, "x-intercom-project": session.project });
    const res = await this.request("/mcp", { method: "POST", as, headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
    const body = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
    return { text: body.result.content[0].text, error: !!body.result.isError };
  }

  async ok(as: string, name: string, args: Record<string, unknown> = {}, session?: { id: string; project: string }): Promise<string> {
    const r = await this.tool(as, name, args, session);
    if (r.error) throw new Error(`${as} ${name} failed: ${r.text}`);
    return r.text;
  }

  /** A form POST from the dashboard (cookie auth, same origin). */
  form(path: string, as: string, fields: Record<string, string>, origin = ORIGIN): Promise<Response> {
    return this.request(path, { method: "POST", as, cookie: true, headers: { origin }, body: new URLSearchParams(fields), redirect: "manual" });
  }
}

/** alice (admin, acme) owns #billing with bob as member; carol (globex) is in no shared project. */
export async function standardWorld(): Promise<World> {
  const w = new World();
  await w.member("alice", { admin: true, org: "acme" });
  await w.member("bob", { org: "acme" });
  await w.member("carol", { org: "globex" });
  await w.ok("alice", "configure_project", { name: "billing", repos: ["billing-api"], rules: "Prod deploys only Tue/Thu" });
  await w.ok("alice", "invite", { project: "billing", name: "bob" });
  await w.ok("carol", "configure_project", { name: "shop" });
  // Read positions start when a member first connects; connect everyone so later messages count as unread.
  for (const m of ["alice", "bob", "carol"]) await w.ok(m, "inbox");
  return w;
}
