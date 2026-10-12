/**
 * Database layer for the Sharondale backend.
 *
 * Uses node:sqlite (built into Node 22+) so the server has zero npm
 * dependencies and runs anywhere Node runs. If you outgrow it, the four
 * exported functions below are the only things that touch storage, so
 * swapping in Postgres/Supabase means rewriting this file alone.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(here, "..", "data", "sharondale.db");

// A path of ":memory:" gives each process a throwaway database, which the API
// tests use so they never touch real data.
const dbFile = process.env.SHARONDALE_DB || DEFAULT_FILE;

if (dbFile !== ":memory:") {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
}

export const db = new DatabaseSync(dbFile);

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
    done         INTEGER NOT NULL DEFAULT 0,
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
`);

const now = () => new Date().toISOString();

/* ------------------------------- shapes -------------------------------- */

function taskFromRow(r) {
  return {
    id: r.id,
    title: r.title,
    location: r.location,
    day: r.due_date,
    priority: r.priority,
    assignee: r.assignee,
    done: !!r.done,
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

/* -------------------------------- reads -------------------------------- */

export function readAll() {
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
  return { tasks, complaints, shopping, recurring };
}

export function isSeeded() {
  const row = db.prepare("SELECT COUNT(*) AS n FROM tasks").get();
  return row.n > 0;
}

/* -------------------------------- writes ------------------------------- */

const upsertTask = () =>
  db.prepare(`
    INSERT INTO tasks (id,title,location,due_date,priority,assignee,done,photo,moved,recurring,recurring_id,sort_order,updated_at)
    VALUES (:id,:title,:location,:day,:priority,:assignee,:done,:photo,:moved,:recurring,:recurringId,:sortOrder,:updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      title=:title, location=:location, due_date=:day, priority=:priority,
      assignee=:assignee, done=:done, photo=:photo, moved=:moved,
      recurring=:recurring, recurring_id=:recurringId, sort_order=:sortOrder,
      updated_at=:updatedAt
  `);

/**
 * Replace the whole board in one transaction. The dashboard treats the task
 * list as a unit (drag a card, tick it, move it to another day), so a whole-
 * board write is both simpler and safer than diffing every field client-side:
 * a half-applied drag can never be stored.
 */
export function replaceBoard({ tasks = [], complaints = [], shopping = [], recurring = [] }) {
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
        done: t.done ? 1 : 0,
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

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return readAll();
}

export function closeDb() {
  db.close();
}
