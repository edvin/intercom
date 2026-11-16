// Minimal D1-shaped interface over Durable Object SQLite, so query code reads the same as before.
// Durable Object SQL is synchronous and in-process; the promises are only for interface compatibility.

export interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface Db {
  prepare(query: string): Stmt;
  batch(statements: Stmt[]): Promise<unknown[]>;
}

/** Split a migration file into single statements (DO SQL exec() wants exactly one each). */
export function splitStatements(ddl: string): string[] {
  const out: string[] = [];
  for (const part of ddl.replace(/--.*$/gm, "").split(";")) {
    const st = part.trim();
    // A trigger's body has statements of its own: its parts go together up to its END.
    const last = out[out.length - 1];
    if (last !== undefined && /^CREATE\s+TRIGGER\b/i.test(last) && !/\bEND$/i.test(last)) out[out.length - 1] = `${last}; ${st}`;
    else if (st) out.push(st);
  }
  return out;
}

/** D1 conventions: undefined binds as NULL, booleans as 0/1. */
export const bindable = (values: unknown[]) => values.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));

const HEAVY_ROWS = 5000;

/** Rows read per query (and per caller) since the hub started: what costs the hub its CPU (/api/sqlstats, admins). */
export const sqlStats = new Map<string, { n: number; rows: number }>();
export const sqlCtx = { at: "" };
export function sqlStatsText(top = 40): string {
  const all = [...sqlStats.entries()].sort((a, b) => b[1].rows - a[1].rows);
  const total = all.reduce((s, [, v]) => s + v.rows, 0);
  return `${total} rows read in all\n\n` + all.slice(0, top).map(([k, v]) => `${v.rows}\t${v.n}×\t${Math.round(v.rows / v.n)}/q\t${k}`).join("\n");
}

class SqlStmt implements Stmt {
  private readonly sql: SqlStorage;
  readonly query: string;
  private readonly params: unknown[];

  constructor(sql: SqlStorage, query: string, params: unknown[] = []) {
    this.sql = sql;
    this.query = query;
    this.params = params;
  }

  bind(...values: unknown[]): Stmt {
    return new SqlStmt(this.sql, this.query, bindable(values));
  }

  exec() {
    return this.sql.exec(this.query, ...(this.params as SqlStorageValue[]));
  }

  /** Rows read is what a query costs here (the clock doesn't move during synchronous work): the heavy ones are logged. */
  private rows<T>(cursor: SqlStorageCursor<Record<string, SqlStorageValue>>): T[] {
    const out = cursor.toArray() as T[];
    if (cursor.rowsRead >= HEAVY_ROWS) console.log("heavy-sql", cursor.rowsRead, this.query.replace(/\s+/g, " ").slice(0, 200));
    const key = `${sqlCtx.at} | ${this.query.replace(/\s+/g, " ").slice(0, 220)}`;
    const st = sqlStats.get(key);
    if (st) { st.n++; st.rows += cursor.rowsRead; } else if (sqlStats.size < 3000) sqlStats.set(key, { n: 1, rows: cursor.rowsRead });
    return out;
  }

  async first<T>(): Promise<T | null> {
    return (this.rows<T>(this.exec())[0] as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.rows<T>(this.exec()) };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    const cursor = this.exec();
    this.rows(cursor);
    return { meta: { changes: cursor.rowsWritten } };
  }
}

export class SqlDb implements Db {
  private readonly storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
  }

  prepare(query: string): Stmt {
    return new SqlStmt(this.storage.sql, query);
  }

  async batch(statements: Stmt[]): Promise<unknown[]> {
    return this.storage.transactionSync(() => statements.map((s) => (s as SqlStmt).exec().toArray()));
  }
}
