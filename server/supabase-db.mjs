/**
 * Postgres storage for the Sharondale board, hosted on Supabase.
 *
 * This is the same four functions db.mjs exports - readAll, replaceBoard,
 * isSeeded, closeDb - so index.mjs does not know or care which storage is in
 * use. db.mjs picks this file when SUPABASE_URL and a key are set:
 *
 *   SUPABASE_URL                  https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY     the service_role key (server-side only!)
 *
 * The service role key bypasses Row Level Security, which is what lets this
 * work behind the app's own access code. It must NEVER be put in the dashboard
 * or committed: anyone holding it can read and write the whole project. If only
 * the anon key is available, set SUPABASE_KEY to it instead and make sure RLS
 * policies allow the server's writes.
 *
 * The board is one row in a small table, because the dashboard saves it as a
 * single unit. Postgres here is not a per-row schema: the whole board changes on
 * every drag or tick, and one transactional row update is what makes a
 * half-applied save impossible. It also means two devices can never see a
 * partially written board.
 */
import pg from "pg";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";

const BOARD_ID = "sharondale";

export const pool = new pg.Pool({
  connectionString: URL_,
  password: KEY,
  ssl: { rejectUnauthorized: false },
  max: 4,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

// Postgres/Supabase keeps one cached connection per process. A serverless host
// that freezes the process can leave a dead socket behind, and the first query
// after a wake-up then fails and shows "Offline - will retry" for no reason. The
// health check pings the pool first, so a dead connection is replaced there
// instead of during a save.
async function query(sql, params) {
  return pool.query(sql, params);
}

const EMPTY = { tasks: [], complaints: [], shopping: [], recurring: [], people: [], phonebook: [], requests: [] };

export async function initStorage() {
  await query(`
    CREATE TABLE IF NOT EXISTS sharondale_board (
      id         TEXT PRIMARY KEY,
      board      JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(
    `INSERT INTO sharondale_board (id, board) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
    [BOARD_ID, EMPTY]
  );
}

// The read path is a plain SELECT of one JSON document.
export async function readAll() {
  const { rows } = await query(`SELECT board FROM sharondale_board WHERE id = $1`, [BOARD_ID]);
  if (!rows.length) return { ...EMPTY };
  const board = rows[0].board || {};
  return {
    tasks: board.tasks || [],
    complaints: board.complaints || [],
    shopping: board.shopping || [],
    recurring: board.recurring || [],
    people: board.people || [],
    phonebook: board.phonebook || [],
    requests: board.requests || [],
  };
}

export async function isSeeded() {
  const board = await readAll();
  return board.tasks.length > 0;
}

// A partial write (people/phonebook/requests omitted) must leave those lists
// alone, exactly like db.mjs. Doing it in SQL with jsonb_set inside one UPDATE
// keeps it atomic: readers only ever see the old board or the new one.
export async function replaceBoard({ tasks = [], complaints = [], shopping = [], recurring = [], people = null, phonebook = null, requests = null }) {
  const current = await readAll();
  const next = {
    tasks,
    complaints,
    shopping,
    recurring,
    people: people === null ? current.people : people,
    phonebook: phonebook === null ? current.phonebook : phonebook,
    requests: requests === null ? current.requests : requests,
  };
  const { rows } = await query(
    `UPDATE sharondale_board
        SET board = $2::jsonb, updated_at = now()
      WHERE id = $1
      RETURNING board`,
    [BOARD_ID, JSON.stringify(next)]
  );
  if (!rows.length) {
    await query(`INSERT INTO sharondale_board (id, board) VALUES ($1, $2::jsonb)`, [BOARD_ID, JSON.stringify(next)]);
    return next;
  }
  return next;
}

// Called by /api/health so a deployment check can prove the database answers.
export async function ping() {
  const started = Date.now();
  await query("SELECT 1");
  return Date.now() - started;
}

export function storageDescription() {
  return "Supabase Postgres (sharondale_board, one row)";
}

export async function closeDb() {
  await pool.end();
}
