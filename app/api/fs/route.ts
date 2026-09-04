import { env } from "cloudflare:workers";

const FS_ID = "main";

type FsRecord = {
  state: string;
  updated_at: string;
};

async function ensureFsTable() {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS fs_state (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ).run();
}

function getDb() {
  if (!env.DB) {
    throw new Error("D1 binding DB is unavailable.");
  }
  return env.DB;
}

export async function GET() {
  try {
    const db = getDb();
    await ensureFsTable();
    const record = await db
      .prepare("SELECT state, updated_at FROM fs_state WHERE id = ?")
      .bind(FS_ID)
      .first<FsRecord>();

    if (!record) {
      return Response.json({ state: null, updatedAt: null });
    }
    return Response.json({
      state: JSON.parse(record.state),
      updatedAt: record.updated_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const db = getDb();
    const fsState = await request.json();
    const serialized = JSON.stringify(fsState);
    const updatedAt = new Date().toISOString();
    await ensureFsTable();
    await db
      .prepare(
        `INSERT INTO fs_state (id, state, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           state = excluded.state,
           updated_at = excluded.updated_at`
      )
      .bind(FS_ID, serialized, updatedAt)
      .run();
    return Response.json({ updatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
