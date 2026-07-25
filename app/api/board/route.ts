import { env } from "cloudflare:workers";

const BOARD_ID = "main";

type BoardRecord = {
  state: string;
  updated_at: string;
};

async function ensureBoardTable() {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS board_state (
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
    await ensureBoardTable();

    const record = await db
      .prepare("SELECT state, updated_at FROM board_state WHERE id = ?")
      .bind(BOARD_ID)
      .first<BoardRecord>();

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
    const boardState = await request.json();
    const serialized = JSON.stringify(boardState);
    const updatedAt = new Date().toISOString();

    await ensureBoardTable();
    await db
      .prepare(
        `INSERT INTO board_state (id, state, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           state = excluded.state,
           updated_at = excluded.updated_at`
      )
      .bind(BOARD_ID, serialized, updatedAt)
      .run();

    return Response.json({ updatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
