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
 * In order of preference:
 *   * SUPABASE_DB_URL  - paste the "Session pooler" connection string from
 *                        Supabase (Connect -> Session pooler). TCP on IPv4, and
 *                        the recommended setting when you have it.
 *   * SUPABASE_DB_HOST - just the pooler host, e.g.
 *                        aws-0-eu-west-1.pooler.supabase.com, with the pooler
 *                        user postgres.<project-ref> as below.
 *   * the Data API over HTTPS (https://<ref>.supabase.co/rest/v1) - used
 *                        automatically when neither of the above is set and the
 *                        direct host cannot be reached, and by
 *                        SUPABASE_TRANSPORT=rest. Port 443 answers over IPv4
 *                        and IPv6 with no add-on, so this works on every
 *                        network that can load the dashboard. It speaks
 *                        PostgREST instead of the Postgres wire protocol, hence
 *                        the separately configured storage below.
 *
 * The transport is chosen once, at boot, and logged, so a deployment never
 * quietly runs on a different path than the one that was set up.
 *
 * The board is one row in a small table, because the dashboard saves it as a
 * single unit. Postgres here is not a per-row schema: the whole board changes on
 * every drag or tick, and one transactional row update is what makes a
 * half-applied save impossible. It also means two devices can never see a
 * partially written board.
 */
import pg from "pg";

const URL_ = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
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
// and a person who pasted it means exactly that. One exception, worth the
// surprise it avoids: the Session pooler (port 5432) keeps a server connection
// for the life of a client connection, and a serverless function closes its
// connection after every request, so a busy deployment would exhaust the
// pooler's client limit. Port 6543 is the transaction pooler, which hands a
// server connection back after each statement - the mode a function needs - so
// a pasted string is moved there when this process is serverless. A long-running
// server keeps 5432 as pasted.
const SERVERLESS = !!process.env.VERCEL && !process.env.SUPABASE_DB_PORT;

function pooled(connectionString) {
  if (!SERVERLESS || !connectionString) return connectionString;
  try {
    const url = new URL(connectionString);
    if (url.port !== "5432") return connectionString;
    url.port = "6543";
    return url.toString();
  } catch {
    // Not a URL we understand (a keyword/value string, say): leave it alone.
    return connectionString;
  }
}

const CONNECTION_STRING = pooled(process.env.SUPABASE_DB_URL || "");

export const pool = new pg.Pool({
  connectionString: CONNECTION_STRING || undefined,
  host: CONNECTION_STRING ? undefined : DB_HOST,
  port: CONNECTION_STRING ? undefined : DB_PORT,
  user: CONNECTION_STRING ? undefined : DB_USER,
  database: CONNECTION_STRING ? undefined : DB_NAME,
  password: KEY,
  ssl: { rejectUnauthorized: false },
  // A function handles one request at a time, so more than one connection buys
  // nothing there; a server keeps a small pool.
  max: SERVERLESS ? 1 : 4,
  idleTimeoutMillis: SERVERLESS ? 1_000 : 10_000,
  connectionTimeoutMillis: 15_000,
});

// A bare "connect ETIMEDOUT" is unhelpful, and the usual cause is known, so say
// it plainly rather than shipping a blank board behind it.
function looksLikeNetworkFailure(message) {
  return /ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|timeout|terminated|UnableToConnect/i.test(message);
}

function explain(error) {
  const message = String((error && error.message) || error);
  if (looksLikeNetworkFailure(message) && DB_HOST === DIRECT_HOST && !CONNECTION_STRING) {
    return new Error(
      message +
      " - could not reach " + DIRECT_HOST + ". That host is IPv6-only unless the project" +
      " has the IPv4 add-on. Copy the \"Session pooler\" connection string from Supabase" +
      " (Connect -> Session pooler) into SUPABASE_DB_URL, or set SUPABASE_DB_HOST to the" +
      " pooler host. The app falls back to the HTTPS Data API automatically; force it with" +
      " SUPABASE_TRANSPORT=rest if you see this every time."
    );
  }
  return error;
}

export function connectionTarget() {
  if (TRANSPORT === "rest") return URL_ + "/rest/v1 (HTTPS Data API)";
  return CONNECTION_STRING
    ? "SUPABASE_DB_URL (" + CONNECTION_STRING.replace(/:[^:@/]+@/, ":***@") + ")"
    : DB_USER + "@" + DB_HOST + ":" + DB_PORT + "/" + DB_NAME;
}

/* ------------------------------ transport ------------------------------- */

// Which of the two Supabase paths below actually carries the queries. Chosen
// once per process, then fixed: a half-switched transport is worse than a clear
// error, because a write could land on one path while the read comes from the
// other.
//
//   tcp  - the Postgres wire protocol through pg. Works with a pooler string,
//          and with the direct host on a network that has IPv6 or the IPv4
//          add-on. Creates the table itself.
//   rest - PostgREST over HTTPS (port 443, IPv4 and IPv6). No npm driver, and
//          it is the only path available on a network with no IPv6.
let TRANSPORT = null;

// Postgres/Supabase keeps a cached connection per process. A serverless host that
// freezes the process can leave a dead socket behind, and the first query after a
// wake-up then fails and shows "Offline - will retry" for no reason. So a network
// failure drops the pool and is retried once: the health check pings first, which
// is where a stale socket is normally noticed and replaced.
async function query(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    if (!looksLikeNetworkFailure(String(error && error.message))) throw explain(error);
    // A dead cached socket is recreated by pg on the next query, once the old
    // one is out of the way.
    try {
      await pool.end();
    } catch { /* already gone */ }
    try {
      return await pool.query(sql, params);
    } catch (retryError) {
      // The first error is the honest one (a real DNS/RST failure); the retry
      // adds "pool after calling end", which explains nothing.
      throw explain(error.message ? error : retryError);
    }
  }
}

/**
 * Pick the transport, proving it answers before committing to it.
 *
 * SUPABASE_TRANSPORT pins the choice ("rest" or "tcp") and skips the probe, for
 * a host where the network is known and the extra boot delay is unwanted.
 */
async function chooseTransport() {
  if (TRANSPORT) return TRANSPORT;
  const pinned = String(process.env.SUPABASE_TRANSPORT || "").toLowerCase();
  const allowRest = !!URL_ && !!KEY && (!pinned || pinned === "rest");
  if (pinned === "rest") {
    if (!allowRest) throw new Error("SUPABASE_TRANSPORT=rest needs SUPABASE_URL and a Supabase key.");
    TRANSPORT = "rest";
    return TRANSPORT;
  }
  if (pinned !== "tcp") {
    try {
      await query("SELECT 1");
      TRANSPORT = "tcp";
      return TRANSPORT;
    } catch (error) {
      if (!allowRest) throw error;
      console.log("Supabase: Postgres could not be reached over TCP (" + error.message.split(" -")[0] + ").");
      console.log("Supabase: switching to the HTTPS Data API at " + URL_ + "/rest/v1.");
    }
  }
  TRANSPORT = "rest";
  return TRANSPORT;
}

/* ------------------------- transport: Data API -------------------------- */

const REST_URL = URL_ + "/rest/v1/sharondale_board";

// The Data API speaks PostgREST, not SQL: "could not find the table" means the
// same thing as a failed CREATE TABLE, and is reported the same way so the fix
// (run supabase-schema.sql) is obvious whichever transport is in use.
function restError(error, action) {
  const message = String((error && error.message) || error);
  if (/PGRST205|does not exist|404/i.test(message)) {
    return new Error(
      "The sharondale_board table does not exist in " + URL_ + ". Run" +
      " server/supabase-schema.sql in the Supabase SQL Editor (Database -> SQL" +
      " Editor), then restart."
    );
  }
  return new Error(action + " via the Supabase Data API failed: " + message);
}

async function rest(path, { method = "GET", body, prefer } = {}) {
  const headers = {
    apikey: KEY,
    Authorization: "Bearer " + KEY,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  let res;
  try {
    res = await fetch(REST_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw restError(error, method + " " + path);
  }
  const text = await res.text();
  if (!res.ok) throw restError(text || "HTTP " + res.status, method + " " + path);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

// PostgREST has no arbitrary-SQL endpoint, but Supabase exposes every public
// function over /rest/v1/rpc. server/supabase-schema.sql declares
// sharondale_save_board, which replaces the row's document in one statement.
// Returns false when the function is not installed, so the caller can fall back
// instead of failing every save.
async function saveViaSql(board) {
  let res;
  try {
    res = await fetch(URL_ + "/rest/v1/rpc/sharondale_save_board", {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: "Bearer " + KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ board_id: BOARD_ID, payload: board }),
    });
  } catch {
    return false;
  }
  if (res.ok) return true;
  const text = await res.text();
  // PGRST202 / 42883 / "Could not find the function" is the one benign case: an
  // older project. Anything else is a real failure and must not be hidden.
  if (/PGRST202|42883|Could not find the function/i.test(text)) return false;
  throw restError(text || "HTTP " + res.status, "POST rpc/sharondale_save_board");
}

const EMPTY = { tasks: [], complaints: [], shopping: [], recurring: [], people: [], phonebook: [], requests: [] };

const shape = (board) => ({
  tasks: board.tasks || [],
  complaints: board.complaints || [],
  shopping: board.shopping || [],
  recurring: board.recurring || [],
  people: board.people || [],
  phonebook: board.phonebook || [],
  requests: board.requests || [],
});

export async function initStorage() {
  const transport = await chooseTransport();
  if (transport === "rest") {
    // The HTTPS path cannot create tables, so this is the check that stands in
    // for CREATE TABLE IF NOT EXISTS: ask for the row and say what to run if the
    // table is missing. Doing it at boot means a misconfigured project fails
    // loudly here rather than on a caretaker's first save.
    await rest("?id=eq." + BOARD_ID + "&select=id");
    return;
  }
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

// The read path is a plain fetch of one JSON document.
export async function readAll() {
  if (TRANSPORT === "rest") {
    const rows = await rest("?id=eq." + BOARD_ID + "&select=board");
    return rows.length ? shape(rows[0].board || {}) : { ...EMPTY };
  }
  const { rows } = await query(`SELECT board FROM sharondale_board WHERE id = $1`, [BOARD_ID]);
  if (!rows.length) return { ...EMPTY };
  return shape(rows[0].board || {});
}

export async function isSeeded() {
  const board = await readAll();
  return board.tasks.length > 0;
}

// A partial write (people/phonebook/requests omitted) must leave those lists
// alone, exactly like db.mjs. One UPDATE of the whole document keeps it atomic:
// readers only ever see the old board or the new one.
//
// On the HTTPS path that has to be ONE statement, because two PATCHes would let
// a crash land a half-applied board. PostgREST also merges a jsonb object key by
// key rather than replacing it: sending {board: {tasks: [...]}} over PATCH left
// every other list (complaints, shopping, ...) as it was, so a save from one
// screen wiped what another screen had just written.
//
// So the whole new document is built here - including the lists the caller left
// out, read from the current row - and written through the sharondale_save_board
// function from supabase-schema.sql: one statement, the document replaced as a
// unit, exactly like the SQLite and TCP paths. A project that has not run the
// schema yet gets a one-statement PATCH fallback, which the Data API does treat
// as a document replace (a jsonb key the object does not carry is removed).
// The follow-up GET proves the row was really written before the caller is told
// "saved", so a silent PostgREST no-op cannot show up as data loss later.
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
  if (TRANSPORT === "rest") {
    const sent = await saveViaSql(next);
    if (!sent) {
      await rest("?id=eq." + BOARD_ID, {
        method: "PATCH",
        // `board` alone: no sibling key may sit next to the jsonb value, or the
        // Data API treats the whole object as a partial update and deletes the
        // rest of the board.
        body: { board: next },
      });
    }
    const check = await rest("?id=eq." + BOARD_ID + "&select=board");
    if (!check.length) throw new Error("Saving to Supabase reported success but the board row could not be read back.");
    return next;
  }
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

// Access codes live in their own row of the same table so they never travel with
// the board that every client can read.
const ACCESS_ID = "sharondale-access";

export async function readAccess() {
  if (TRANSPORT === "rest") {
    const rows = await rest("?id=eq." + ACCESS_ID + "&select=board");
    return rows.length && Array.isArray(rows[0].board && rows[0].board.codes) ? rows[0].board.codes : [];
  }
  const { rows } = await query(`SELECT board FROM sharondale_board WHERE id = $1`, [ACCESS_ID]);
  return rows.length && rows[0].board && Array.isArray(rows[0].board.codes) ? rows[0].board.codes : [];
}

export async function writeAccess(codes) {
  const doc = { codes };
  if (TRANSPORT === "rest") {
    await rest("", { method: "POST", body: { id: ACCESS_ID, board: doc }, prefer: "resolution=merge-duplicates,return=minimal" });
    return;
  }
  await query(
    `INSERT INTO sharondale_board (id, board) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET board = EXCLUDED.board, updated_at = now()`,
    [ACCESS_ID, doc]
  );
}

// Called by /api/health so a deployment check can prove the database answers.
export async function ping() {
  const started = Date.now();
  if (TRANSPORT === "rest") {
    await rest("?id=eq." + BOARD_ID + "&select=id,updated_at");
    return Date.now() - started;
  }
  await query("SELECT 1");
  return Date.now() - started;
}

export function storageDescription() {
  return "Supabase Postgres (sharondale_board, one row) via " + connectionTarget();
}

export async function closeDb() {
  // A REST-only process never opened a socket, so pg has nothing to close.
  if (TRANSPORT === "rest") return;
  await pool.end();
}
