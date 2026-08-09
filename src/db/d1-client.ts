export interface D1ResultLike<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: {
    changes?: number;
    [key: string]: unknown;
  };
}

export interface D1ExecResultLike {
  count: number;
  duration: number;
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
  all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
  raw<T extends unknown[] = unknown[]>(
    options?: { columnNames?: boolean },
  ): Promise<T[]>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatementLike[],
  ): Promise<Array<D1ResultLike<T>>>;
  exec(query: string): Promise<D1ExecResultLike>;
  dump(): Promise<ArrayBuffer>;
}

interface CloudflareEnv {
  COLLECTION_SNAPSHOTS?: D1DatabaseLike;
}

type ProxyOperation = "all" | "batch" | "exec" | "first" | "raw" | "run";

interface SerializedStatement {
  query: string;
  params: unknown[];
}

const LOCAL_DATABASE_ORIGIN = "http://127.0.0.1:8787";

async function proxyRequest<T>(
  operation: ProxyOperation,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${LOCAL_DATABASE_ORIGIN}/d1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, ...body }),
  });
  if (!response.ok) {
    throw new Error(`D1 development proxy failed (${response.status})`);
  }
  return (await response.json()) as T;
}

class ProxyPreparedStatement implements D1PreparedStatementLike {
  constructor(
    readonly query: string,
    readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new ProxyPreparedStatement(this.query, values);
  }

  serialize(): SerializedStatement {
    return { query: this.query, params: this.params };
  }

  first<T = Record<string, unknown>>(columnName?: string) {
    return proxyRequest<T | null>("first", {
      ...this.serialize(),
      columnName,
    });
  }

  run<T = Record<string, unknown>>() {
    return proxyRequest<D1ResultLike<T>>("run", this.serialize());
  }

  all<T = Record<string, unknown>>() {
    return proxyRequest<D1ResultLike<T>>("all", this.serialize());
  }

  raw<T extends unknown[] = unknown[]>(
    options?: { columnNames?: boolean },
  ) {
    return proxyRequest<T[]>("raw", {
      ...this.serialize(),
      options,
    });
  }
}

class ProxyD1Database implements D1DatabaseLike {
  prepare(query: string) {
    return new ProxyPreparedStatement(query);
  }

  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatementLike[],
  ) {
    return proxyRequest<Array<D1ResultLike<T>>>("batch", {
      statements: statements.map((statement) => {
        if (!(statement instanceof ProxyPreparedStatement)) {
          throw new Error("Cannot batch a non-proxy D1 statement");
        }
        return statement.serialize();
      }),
    });
  }

  exec(query: string) {
    return proxyRequest<D1ExecResultLike>("exec", { query });
  }

  dump(): Promise<ArrayBuffer> {
    throw new Error("D1 dump is unavailable through the development proxy");
  }
}

let proxyDatabase: ProxyD1Database | undefined;

export function getD1Database(): D1DatabaseLike {
  const binding = (
    globalThis as typeof globalThis & {
      __env__?: CloudflareEnv;
    }
  ).__env__?.COLLECTION_SNAPSHOTS;
  if (binding) return binding;

  if (import.meta.env.DEV) {
    proxyDatabase ??= new ProxyD1Database();
    return proxyDatabase;
  }

  throw new Error("COLLECTION_SNAPSHOTS D1 binding is unavailable");
}
