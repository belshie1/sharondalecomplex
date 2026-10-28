/**
 * Database layer for the Sharondale backend.
 *
 * Two storages share these four exported functions - readAll, replaceBoard,
 * isSeeded, closeDb - so the rest of the server never knows which is in use:
 *
 *   * Supabase Postgres, when SUPABASE_URL and a Supabase key are set. That is
 *     what a real deployment should use: it survives every restart, and it is
 *     reachable from a host with no disk. See supabase-db.mjs.
 *   * SQLite, via node:sqlite (built into Node 22+), otherwise. Zero npm
 *     dependencies, perfect locally and on a machine with a volume.
 *
 * The environment files are read first, so the choice below sees .env.local the
 * same way it sees a cloud host's variables.
 */
import { envFiles } from "./env.mjs";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(here, "..", "data", "sharondale.db");

export const usingSupabase = !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY));

export const dbFile = process.env.SHARONDALE_DB || DEFAULT_FILE;

// A path of ":memory:" gives each process a throwaway database, which the API
// tests use so they never touch real data. It also settles the storage choice:
// marking that intent must not be quietly overridden by a Supabase URL left in
// .env.local, or `npm test` (and any script that asks for a scratch board) would
// reset the live project instead.
const useSupabase = usingSupabase && dbFile !== ":memory:";

export function usingSupabaseStorage() {
  return useSupabase;
}

// SQLite is set up only when it is actually in use. The whole block (connection,
// schema, migrations) lives in the else branch because it runs top to bottom at
// import time: with Supabase selected there is no SQLite handle, and evaluating
// any of it would fail on a host that has neither a writable disk nor node:sqlite.
export let db = null;

if (!useSupabase) {
  if (dbFile !== ":memory:") {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  }

  db = new DatabaseSync(dbFile);

  // WAL keeps reads fast while a write is in flight; it is a no-op in memory.
  if (dbFile !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      location     TEXT NOT NULL,
      due_date     TEXT NOT NULL DEFAULT '',
      priority     TEXT NOT NULL CHECK (priority IN ('low','medium','high')),
      assignee     TEXT NOT NULL DEFAULT '',
      created_by   TEXT NOT NULL DEFAULT '',
      done         INTEGER NOT NULL DEFAULT 0,
      completed_on TEXT,
      photo        TEXT,
      moved        TEXT,
      recurring    INTEGER NOT NULL DEFAULT 0,
      recurring_id TEXT,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      updated_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id         INTEGER PRIMARY KEY,
      owner      TEXT NOT NULL,
      apt        TEXT NOT NULL,
      type       TEXT NOT NULL,
      age        TEXT NOT NULL,
      status     TEXT NOT NULL CHECK (status IN ('open','progress','closed')),
      note       TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shopping (
      id         INTEGER PRIMARY KEY,
      label      TEXT NOT NULL,
      qty        INTEGER NOT NULL DEFAULT 1,
      added_by   TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    -- People are a first-class list now rather than a constant in the client, so
    -- the caretaker can add and remove names without a code change.
    CREATE TABLE IF NOT EXISTS people (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      role       TEXT NOT NULL DEFAULT '',
      color      TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    -- Recurring templates are stored server-side so every device re-applies the
    -- same weekly tasks on load, instead of each browser inventing its own.
    CREATE TABLE IF NOT EXISTS recurring_tasks (
      id       TEXT PRIMARY KEY,
      title    TEXT NOT NULL,
      location TEXT NOT NULL,
      day      TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('low','medium','high')),
      assignee TEXT NOT NULL DEFAULT ''
    );

    -- The phonebook holds external contacts (contractors, suppliers, emergency
    -- numbers) that are not staff, so they live separately from the people
    -- roster rather than being assignable work targets.
    CREATE TABLE IF NOT EXISTS phonebook (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      company    TEXT NOT NULL DEFAULT '',
      phone      TEXT NOT NULL DEFAULT '',
      note       TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    -- Task requests are work that has been reported but not yet accepted onto the
    -- weekly board: a request is logged here first, and only becomes a task when
    -- the caretaker moves it across. They are kept apart from the tasks table on
    -- purpose, so the calendar and the weekly report never count something that
    -- nobody has agreed to do yet.
    CREATE TABLE IF NOT EXISTS task_requests (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      location     TEXT NOT NULL,
      priority     TEXT NOT NULL CHECK (priority IN ('low','medium','high')),
      requested_by TEXT NOT NULL DEFAULT '',
      assignee     TEXT NOT NULL DEFAULT '',
      due_date     TEXT NOT NULL DEFAULT '',
      note         TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','moved')),
      task_id      TEXT,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      updated_at   TEXT NOT NULL
    );
  `);

  // Lightweight migrations for databases created before a column existed.
  // ADD COLUMN is cheap and idempotent, so an existing deployment keeps its data
  // instead of needing a rebuild.
  function ensureColumn(table, column, definition) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.some((c) => c.name === column)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }

  ensureColumn("tasks", "created_by", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("tasks", "completed_on", "TEXT");
  ensureColumn("task_requests", "assignee", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("task_requests", "due_date", "TEXT NOT NULL DEFAULT ''");
}

const now = () => new Date().toISOString();

// The storage that index.mjs actually uses. Both modules export the same
// functions, so this is the whole switch.
//
// The chosen backend is also re-exported here under the names seed.mjs and
// index.mjs import, so there is exactly one code path: nothing above this line
// at module level touches SQLite, and a Supabase deployment never runs any of
// the SQLite code.
const backend = useSupabase ? await import("./supabase-db.mjs") : {
  readAll: () => sqlite().readAll(),
  replaceBoard: replaceBoardSqlite,
  isSeeded: () => sqlite().isSeeded(),
  closeDb: closeDbSqlite,
  initStorage: async () => {},
  ping: async () => 0,
  storageDescription: () => `SQLite file (${dbFile})`,
};

export const storage = backend;
export const readAll = (...args) => backend.readAll(...args);
export const replaceBoard = (...args) => backend.replaceBoard(...args);
export const isSeeded = (...args) => backend.isSeeded(...args);
export const closeDb = (...args) => backend.closeDb(...args);

export async function initStorage() {
  await backend.initStorage();
}

export async function pingStorage() {
  return backend.ping();
}

export function storageDescription() {
  return backend.storageDescription();
}

export async function closeStorage() {
  return backend.closeDb();
}

/* ------------------------------- shapes -------------------------------- */

function taskFromRow(r) {
  return {
    id: r.id,
    title: r.title,
    location: r.location,
    day: r.due_date,
    priority: r.priority,
    assignee: r.assignee,
    createdBy: r.created_by || "",
    done: !!r.done,
    completedOn: r.completed_on || null,
    photo: r.photo,
    moved: r.moved,
    recurring: !!r.recurring,
    recurringId: r.recurring_id,
  };
}

function complaintFromRow(r) {
  return {
    id: r.id,
    owner: r.owner,
    apt: r.apt,
    type: r.type,
    age: r.age,
    status: r.status,
    note: r.note,
  };
}

function shoppingFromRow(r) {
  return { id: r.id, label: r.label, qty: r.qty, addedBy: r.added_by };
}

function personFromRow(r) {
  return { id: r.id, name: r.name, role: r.role, color: r.color };
}

function phonebookFromRow(r) {
  return {
    id: r.id,
    name: r.name,
    company: r.company || "",
    phone: r.phone || "",
    note: r.note || "",
  };
}

function taskRequestFromRow(r) {
  return {
    id: r.id,
    title: r.title,
    location: r.location,
    priority: r.priority,
    requestedBy: r.requested_by || "",
    assignee: r.assignee || "",
    day: r.due_date || "",
    note: r.note || "",
    status: r.status,
    taskId: r.task_id,
  };
}

/* -------------------------------- reads -------------------------------- */

// The statements below are prepared lazily, on first use, and only exist on the
// SQLite path. With Supabase selected none of this code runs: it belongs to the
// fallback storage, and the module exports below are what index.mjs imports.
const sqlite = () => ({
  readAll: () => {
    const tasks = db
      .prepare("SELECT * FROM tasks ORDER BY sort_order ASC, updated_at ASC")
      .all()
      .map(taskFromRow);
    const complaints = db
      .prepare("SELECT * FROM complaints ORDER BY id ASC")
      .all()
      .map(complaintFromRow);
    const shopping = db
      .prepare("SELECT * FROM shopping ORDER BY id ASC")
      .all()
      .map(shoppingFromRow);
    const recurring = db
      .prepare("SELECT * FROM recurring_tasks ORDER BY id ASC")
      .all()
      .map((r) => ({
        id: r.id,
        title: r.title,
        location: r.location,
        day: r.day,
        priority: r.priority,
        assignee: r.assignee,
      }));
    const people = db
      .prepare("SELECT * FROM people ORDER BY sort_order ASC, name ASC")
      .all()
      .map(personFromRow);
    const phonebook = db
      .prepare("SELECT * FROM phonebook ORDER BY sort_order ASC, name ASC")
      .all()
      .map(phonebookFromRow);
    const requests = db
      .prepare("SELECT * FROM task_requests ORDER BY sort_order ASC, updated_at ASC")
      .all()
      .map(taskRequestFromRow);
    return { tasks, complaints, shopping, recurring, people, phonebook, requests };
  },
  isSeeded: () => {
    const row = db.prepare("SELECT COUNT(*) AS n FROM tasks").get();
    return row.n > 0;
  },
});

/* -------------------------------- writes ------------------------------- */

const upsertTask = () =>
  db.prepare(`
    INSERT INTO tasks (id,title,location,due_date,priority,assignee,created_by,done,completed_on,photo,moved,recurring,recurring_id,sort_order,updated_at)
    VALUES (:id,:title,:location,:day,:priority,:assignee,:createdBy,:done,:completedOn,:photo,:moved,:recurring,:recurringId,:sortOrder,:updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      title=:title, location=:location, due_date=:day, priority=:priority,
      assignee=:assignee, created_by=:createdBy, done=:done, completed_on=:completedOn, photo=:photo, moved=:moved,
      recurring=:recurring, recurring_id=:recurringId, sort_order=:sortOrder,
      updated_at=:updatedAt
  `);

/**
 * Replace the whole board in one transaction. The dashboard treats the task
 * list as a unit (drag a card, tick it, move it to another day), so a whole-
 * board write is both simpler and safer than diffing every field client-side:
 * a half-applied drag can never be stored.
 */
function replaceBoardSqlite({ tasks = [], complaints = [], shopping = [], recurring = [], people = null, phonebook = null, requests = null }) {
  const writeTasks = upsertTask();
  const writeComplaint = db.prepare(`
    INSERT INTO complaints (id,owner,apt,type,age,status,note,updated_at)
    VALUES (:id,:owner,:apt,:type,:age,:status,:note,:updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      owner=:owner, apt=:apt, type=:type, age=:age,
      status=:status, note=:note, updated_at=:updatedAt
  `);
  const writeShopping = db.prepare(`
    INSERT INTO shopping (id,label,qty,added_by,updated_at)
    VALUES (:id,:label,:qty,:addedBy,:updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      label=:label, qty=:qty, added_by=:addedBy, updated_at=:updatedAt
  `);
  const writeRecurring = db.prepare(`
    INSERT INTO recurring_tasks (id,title,location,day,priority,assignee)
    VALUES (:id,:title,:location,:day,:priority,:assignee)
    ON CONFLICT(id) DO UPDATE SET
      title=:title, location=:location, day=:day,
      priority=:priority, assignee=:assignee
  `);
  const writePerson = db.prepare(`
    INSERT INTO people (id,name,role,color,sort_order,updated_at)
    VALUES (:id,:name,:role,:color,:sortOrder,:updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      name=:name, role=:role, color=:color,
      sort_order=:sortOrder, updated_at=:updatedAt
  `);
  const writeContact = db.prepare(`
    INSERT INTO phonebook (id,name,company,phone,note,sort_order,updated_at)
    VALUES (:id,:name,:company,:phone,:note,:sortOrder,:updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      name=:name, company=:company, phone=:phone, note=:note,
      sort_order=:sortOrder, updated_at=:updatedAt
  `);
  const writeRequest = db.prepare(`
    INSERT INTO task_requests (id,title,location,priority,requested_by,assignee,due_date,note,status,task_id,sort_order,updated_at)
    VALUES (:id,:title,:location,:priority,:requestedBy,:assignee,:day,:note,:status,:taskId,:sortOrder,:updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      title=:title, location=:location, priority=:priority,
      requested_by=:requestedBy, assignee=:assignee, due_date=:day, note=:note, status=:status, task_id=:taskId,
      sort_order=:sortOrder, updated_at=:updatedAt
  `);

  const ts = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    tasks.forEach((t, i) => {
      writeTasks.run({
        id: String(t.id),
        title: t.title,
        location: t.location,
        day: t.day || "",
        priority: t.priority,
        assignee: t.assignee || "",
        createdBy: t.createdBy || "",
        done: t.done ? 1 : 0,
        completedOn: t.completedOn || null,
        photo: t.photo || null,
        moved: t.moved || null,
        recurring: t.recurring ? 1 : 0,
        recurringId: t.recurringId || null,
        sortOrder: i,
        updatedAt: ts,
      });
    });

    // Anything no longer in the payload was deleted on the client.
    const keep = (rows) => rows.map((r) => String(r.id));
    const taskIds = keep(tasks);
    if (taskIds.length) {
      db.prepare(
        `DELETE FROM tasks WHERE id NOT IN (${taskIds.map(() => "?").join(",")})`
      ).run(...taskIds);
    } else {
      db.prepare("DELETE FROM tasks").run();
    }

    complaints.forEach((c) => {
      writeComplaint.run({
        id: c.id,
        owner: c.owner,
        apt: c.apt,
        type: c.type,
        age: c.age,
        status: c.status,
        note: c.note || null,
        updatedAt: ts,
      });
    });
    const complaintIds = complaints.map((c) => c.id);
    if (complaintIds.length) {
      db.prepare(
        `DELETE FROM complaints WHERE id NOT IN (${complaintIds.map(() => "?").join(",")})`
      ).run(...complaintIds);
    }

    shopping.forEach((s) => {
      writeShopping.run({
        id: s.id,
        label: s.label,
        qty: s.qty || 1,
        addedBy: s.addedBy || "",
        updatedAt: ts,
      });
    });
    const shoppingIds = shopping.map((s) => s.id);
    if (shoppingIds.length) {
      db.prepare(
        `DELETE FROM shopping WHERE id NOT IN (${shoppingIds.map(() => "?").join(",")})`
      ).run(...shoppingIds);
    } else {
      db.prepare("DELETE FROM shopping").run();
    }

    recurring.forEach((r) => {
      writeRecurring.run({
        id: String(r.id),
        title: r.title,
        location: r.location,
        day: r.day,
        priority: r.priority,
        assignee: r.assignee || "",
      });
    });
    const recurringIds = recurring.map((r) => String(r.id));
    if (recurringIds.length) {
      db.prepare(
        `DELETE FROM recurring_tasks WHERE id NOT IN (${recurringIds.map(() => "?").join(",")})`
      ).run(...recurringIds);
    } else {
      db.prepare("DELETE FROM recurring_tasks").run();
    }

    // People are only touched when the caller supplies a list. `null` (or an
    // omitted key) means "leave the roster alone", which is what a partial
    // writer such as a test fixture expects; an empty array genuinely clears
    // it. Tasks keep their assignee text either way, so removing a person
    // never silently unassigns their existing work.
    if (people !== null) {
      // A person is identified by NAME, not id: name is the unique key the
      // roster is built on, and the client can legitimately send a new id for a
      // name that already exists (remove then re-add). Upserting on id alone
      // would hit the UNIQUE(name) constraint and fail the whole save.
      //
      // Two passes are needed because both directions can clash:
      //   1. drop anyone missing from the payload (a deletion),
      //   2. drop any row whose id differs but whose name matches the incoming
      //      row (a re-add under a new id), which would otherwise collide.
      const stale = db.prepare("SELECT id, name FROM people").all();
      const incomingNames = new Set(people.map((p) => String(p.name).trim().toLowerCase()));
      const dropByName = db.prepare("DELETE FROM people WHERE name = ?");
      for (const row of stale) {
        if (!incomingNames.has(String(row.name).trim().toLowerCase())) dropByName.run(row.name);
      }
      const dropStaleId = db.prepare("DELETE FROM people WHERE name = ? AND id <> ?");
      for (const p of people) dropStaleId.run(p.name, String(p.id));

      people.forEach((p, i) => {
        writePerson.run({
          id: String(p.id),
          name: p.name,
          role: p.role || "",
          color: p.color || "",
          sortOrder: i,
          updatedAt: ts,
        });
      });
    }

    // The phonebook follows the same partial-write rule as the roster: an
    // omitted key leaves it untouched, an empty array clears it.
    if (phonebook !== null) {
      phonebook.forEach((c, i) => {
        writeContact.run({
          id: String(c.id),
          name: c.name,
          company: c.company || "",
          phone: c.phone || "",
          note: c.note || "",
          sortOrder: i,
          updatedAt: ts,
        });
      });
      const contactIds = phonebook.map((c) => String(c.id));
      if (contactIds.length) {
        db.prepare(
          `DELETE FROM phonebook WHERE id NOT IN (${contactIds.map(() => "?").join(",")})`
        ).run(...contactIds);
      } else {
        db.prepare("DELETE FROM phonebook").run();
      }
    }

    // The request log follows the same partial-write rule as the roster and the
    // phonebook: an omitted key leaves it untouched, an empty array clears it.
    if (requests !== null) {
      requests.forEach((r, i) => {
        writeRequest.run({
          id: String(r.id),
          title: r.title,
          location: r.location,
          priority: r.priority,
          requestedBy: r.requestedBy || "",
          assignee: r.assignee || "",
          day: r.day || "",
          note: r.note || "",
          status: r.status === "moved" ? "moved" : "pending",
          taskId: r.taskId ? String(r.taskId) : null,
          sortOrder: i,
          updatedAt: ts,
        });
      });
      const requestIds = requests.map((r) => String(r.id));
      if (requestIds.length) {
        db.prepare(
          `DELETE FROM task_requests WHERE id NOT IN (${requestIds.map(() => "?").join(",")})`
        ).run(...requestIds);
      } else {
        db.prepare("DELETE FROM task_requests").run();
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return sqlite().readAll();
}

function closeDbSqlite() {
  db.close();
}
