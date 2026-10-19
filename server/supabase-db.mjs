/**
 * Postgres storage for the Sharondale board, hosted on Supabase.
 *
 * This is the same four functions db.mjs exports - readAll, replaceBoard,
 * isSeeded, closeDb - so index.mjs does not know or care which storage is in
 * use. db.mjs picks this file when SUPABASE_URL and a key are set:
 *
 *   SUPABASE_URL                  https://<project-ref>.supabase.co
 *   SUPABASE_SECRET_KEY           the secret key, sb_secret_... (server only!)
 *
 * The secret key is the new name for what used to be the service_role key: it
 * bypasses Row Level Security, which is what lets the board work behind the
 * app's own access code. It must NEVER be put in the dashboard or committed -
 * anyone holding it can read and write the whole project. The older variable
 * names (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_KEY) still work, and a legacy
 * service_role JWT works as the password too.
 *
 * The publishable key (sb_publishable_...) is intentionally not used here: it
 * is for browsers, and RLS refuses it, so it would only make the server fail.
 *
 * Network note: the direct host db.<ref>.supabase.co is IPv6-only unless the
 * project has the IPv4 add-on. Many home and office networks have no IPv6, and
 * a serverless host may not either, so connecting directly there just times out.
 * Two ways round it, both supported here:
 *   * SUPABASE_DB_URL  - paste the "Session pooler" connection string from
 *                        Supabase (Connect -> Session pooler). Works on IPv4
 *                        and is the recommended setting.
 *   * SUPABASE_DB_HOST - just the pooler host, e.g.
 *                        aws-0-eu-west-1.pooler.supabase.com, with the pooler
 *                        user postgres.<project-ref> as below.
 * Without either, the direct host is tried and the error says so explicitly.
 *
 * The board is one row in a small table, because the dashboard saves it as a
 * single unit. Postgres here is not a per-row schema: the whole board changes on
 * every drag or tick, and one transactional row update is what makes a
 * half-applied save impossible. It also means two devices can never see a
 * partially written board.
 */
import pg from "pg";

const URL_ = process.env.SUPABASE_URL;
const KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  "";

const BOARD_ID = "sharondale";

// Where the database actually answers, and with which user.
const PROJECT_REF = (() => {
  try { return new URL(URL_).hostname.split(".")[0]; } catch { return ""; }
})();
const DIRECT_HOST = PROJECT_REF ? `db.${PROJECT_REF}.supabase.co` : "";
const DB_HOST = process.env.SUPABASE_DB_HOST || DIRECT_HOST;
const DB_USER = process.env.SUPABASE_DB_USER || (process.env.SUPABASE_DB_HOST ? `postgres.${PROJECT_REF}` : "postgres");
const DB_PORT = Number(process.env.SUPABASE_DB_PORT) || 5432;
const DB_NAME = process.env.SUPABASE_DB_NAME || "postgres";

// A pasted connection string wins, because it already names host, user and port
// and a person who pasted it means exactly that.
const CONNECTION_STRING = process.env.SUPABASE_DB_URL || "";

export const pool = new pg.Pool({
  connectionString: CONNECTION_STRING || undefined,
  host: CONNECTION_STRING ? undefined : DB_HOST,
  port: CONNECTION_STRING ? undefined : DB_PORT,
  user: CONNECTION_STRING ? undefined : DB_USER,
  database: CONNECTION_STRING ? undefined : DB_NAME,
  password: KEY,
  ssl: { rejectUnauthorized: false },
  max: 4,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
});

// A bare "connect ETIMEDOUT" is unhelpful, and the usual cause is known, so say
// it plainly rather than shipping a blank board behind it.
function explain(error) {
  const message = String((error && error.message) || error);
  if (/ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ENOTFOUND|EAI_AGAIN|timeout/i.test(message) && DB_HOST === DIRECT_HOST && !CONNECTION_STRING) {
    return new Error(
      message +
      " - could not reach " + DIRECT_HOST + ". That host is IPv6-only unless the project" +
      " has the IPv4 add-on, and this network has no IPv6 route to it. Copy the" +
      " \"Session pooler\" connection string from Supabase (Connect -> Session pooler)" +
      " into SUPABASE_DB_URL, or set SUPABASE_DB_HOST to the pooler host."
    );
  }
  return error;
}

export function connectionTarget() {
  return CONNECTION_STRING
    ? "SUPABASE_DB_URL (" + CONNECTION_STRING.replace(/:[^:@/]+@/, ":***@") + ")"
    : DB_USER + "@" + DB_HOST + ":" + DB_PORT + "/" + DB_NAME;
}

// Postgres/Supabase keeps one cached connection per process. A serverless host
// that freezes the process can leave a dead socket behind, and the first query
// after a wake-up then fails and shows "Offline - will retry" for no reason. The
// health check pings the pool first, so a dead connection is replaced there
// instead of during a save.
async function query(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    throw explain(error);
  }
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
  return "Supabase Postgres (sharondale_board, one row) via " + connectionTarget();
}

export async function closeDb() {
  await pool.end();
}
