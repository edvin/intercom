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

class SqlStmt implements Stmt {
  constructor(
    private readonly sql: SqlStorage,
    readonly query: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): Stmt {
    return new SqlStmt(this.sql, this.query, values.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v)));
  }

  exec() {
    return this.sql.exec(this.query, ...(this.params as SqlStorageValue[]));
  }

  async first<T>(): Promise<T | null> {
    return (this.exec().toArray()[0] as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.exec().toArray() as T[] };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    const cursor = this.exec();
    cursor.toArray();
    return { meta: { changes: cursor.rowsWritten } };
  }
}

export class SqlDb implements Db {
  constructor(private readonly storage: DurableObjectStorage) {}

  prepare(query: string): Stmt {
    return new SqlStmt(this.storage.sql, query);
  }

  async batch(statements: Stmt[]): Promise<unknown[]> {
    return this.storage.transactionSync(() => statements.map((s) => (s as SqlStmt).exec().toArray()));
  }
}
