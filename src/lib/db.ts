import "server-only";

/**
 * Tiny SQL adapter.
 * - DATABASE_URL set  -> Neon serverless Postgres (production / Vercel).
 * - DATABASE_URL empty -> embedded PGlite in ./.data (zero-setup local runs for judges).
 */

type Row = Record<string, unknown>;
type QueryFn = (text: string, params?: unknown[]) => Promise<Row[]>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  total NUMERIC(12,2) NOT NULL,
  client_name TEXT NOT NULL,
  freelancer_name TEXT NOT NULL,
  freelancer_email TEXT NOT NULL,
  client_token TEXT NOT NULL,
  freelancer_token TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  position INT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL,
  criteria JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_funds',
  paypal_order_id TEXT,
  authorization_id TEXT,
  auth_expires_at TIMESTAMPTZ,
  capture_id TEXT,
  captured_amount NUMERIC(12,2),
  fee_amount NUMERIC(12,2),
  payout_amount NUMERIC(12,2),
  payout_batch_id TEXT,
  payout_status TEXT,
  submission JSONB,
  verdict JSONB,
  dispute JSONB,
  ruling JSONB,
  attempts INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS milestones_deal_idx ON milestones(deal_id);
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  milestone_id TEXT,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_deal_idx ON events(deal_id, id);
`;

declare global {
   
  var __fairholdDb: Promise<QueryFn> | undefined;
}

async function connect(): Promise<QueryFn> {
  const url = process.env.DATABASE_URL;
  let query: QueryFn;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    query = async (text, params = []) => (await sql.query(text, params)) as Row[];
    // Neon's HTTP driver runs one statement per call.
    for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
      await query(stmt);
    }
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    // Keep the data dir OUTSIDE the project: writes inside it trigger the dev server's
    // file watcher and cause endless page reloads.
    const dir = process.env.PGLITE_DIR || join(tmpdir(), "fairhold-pglite");
    mkdirSync(dir, { recursive: true });
    const db = new PGlite(dir);
    await db.waitReady;
    await db.exec(SCHEMA);
    query = async (text, params = []) => (await db.query<Row>(text, params)).rows;
  }
  return query;
}

function getDb(): Promise<QueryFn> {
  if (!globalThis.__fairholdDb) {
    globalThis.__fairholdDb = connect().catch((err) => {
      globalThis.__fairholdDb = undefined;
      throw err;
    });
  }
  return globalThis.__fairholdDb;
}

export async function sql<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const q = await getDb();
  return (await q(text, params)) as T[];
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await sql<T>(text, params);
  return rows[0] ?? null;
}
