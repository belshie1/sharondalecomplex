/**
 * A signed-in caretaker must be able to save.
 *
 * The dashboard's sign-in gate (login.js) sends its session in `Authorization`
 * and nothing in `x-sharondale-token`, so an API that only accepted the write
 * token let someone sign in successfully and then refuse their first save —
 * exactly what the deployed site did, with the board silently never saving.
 *
 * Checked here, in the browser a caretaker actually uses:
 *
 *   1. a wrong code is refused with a message the visitor can read;
 *   2. a real code signs in as the person whose code it is;
 *   3. the API accepts that session on a write, with the write token set to a
 *      value this browser does not know — so a backend that ignores sessions
 *      really does refuse, instead of an unprotected local server hiding it.
 *      A request with no session at all is refused, proving the check exists;
 *   4. with the session kept the way login.js keeps it, a reload lands on the
 *      board signed in, and a save made by the page reaches the server.
 *
 * Every write is undone, and the board afterwards is compared as a whole with
 * the board from before, so a failed cleanup fails the suite rather than
 * passing because the leftover merely looks familiar.
 *
 * Runs inside `node tests/run-all.mjs`, which gives the throwaway test board a
 * person with QA_SESSION_CODE; this suite never uses a real caretaker's code.
 */
import assert from "node:assert/strict";
import { marker, resetBoard } from "./helpers.mjs";

// A board read that cannot be made is a result, not a crash: it is reported as
// null so the checks depending on it fail with a reason.
async function readBoard(page) {
  return page.evaluate(async () => (await fetch("/api/board")).json()).catch(() => null);
}

const CODE = process.env.QA_SESSION_CODE || "1357";
const NAME = process.env.QA_SESSION_NAME || "QA Session";
// The server locks an address out after 5 failures, so exactly one is made.
const WRONG_CODE = "0000";
// A token no browser in this run holds: the session must be what was accepted.
const UNKNOWN_TOKEN = "qa-session-suite-unknown-token";

async function login(page, code) {
  return page.evaluate(async (code) => {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, code);
}

/**
 * Add one row to one board list, confirm the server stored it, then put the
 * board back. `field` is the property that identifies the row; `baseline` is the
 * board to restore, and defaults to what is read at the start.
 */
async function addThenRestore(page, headers, list, row, field, baseline) {
  return page.evaluate(async ({ headers, list, row, field, baseline }) => {
    // A request that cannot be made at all is an answer too: report it, so the
    // check fails with a reason instead of the suite dying on a bare "Failed to
    // fetch" with no status.
    const send = async (url, init) => {
      try {
        const res = await fetch(url, init);
        return { status: res.status, body: await res.json().catch(() => null) };
      } catch (e) {
        return { status: 0, error: String(e && e.message || e) };
      }
    };
    const board = (await send("/api/board")).body;
    if (!board) return { put: 0, stored: false, restore: 0, error: "could not read the board" };
    // Restore what this suite started from, not what it just read: another
    // writer (a later live-sync event, or a suite sharing the backend) must not
    // be reverted by this cleanup, and must not make it look failed either.
    const original = JSON.stringify(baseline || board);
    const changed = Object.assign({}, board);
    changed[list] = (board[list] || []).concat([row]);
    const put = await send("/api/board", {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, headers),
      body: JSON.stringify(changed)
    });
    const after = (await send("/api/board")).body || {};
    const stored = (after[list] || []).some((item) => item[field] === row[field]);
    const restore = await send("/api/board", {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, headers),
      body: original
    });
    return { put: put.status, stored, restore: restore.status, error: put.error || (put.body && put.body.error) };
  }, { headers, list, row, field, baseline: baseline || null });
}

export default async function run(page) {
  const out = {};
  await resetBoard(page);
  // The page saves its own board on boot and on live-sync events. Let that
  // settle before writing from here, or the two writers race each other: the
  // page's copy replaces the row this suite just added and the read-back misses
  // it, which looks like the session being refused.
  await page.waitForFunction(
    () => {
      const chip = document.getElementById("saveState");
      return !!chip && (chip.innerText.trim() === "Saved" || chip.classList.contains("locked"));
    },
    null,
    { timeout: 20000 }
  ).catch(() => { });
  await page.waitForTimeout(500);

  // Against a protected server (the deployed site) the page cannot write without
  // a code, so its boot probe is answered 401 - the expected answer, not a
  // failure. The suite only needs the board to have loaded.
  const chip = await page.locator("#saveState").innerText();
  out.boardIsLocked = chip.includes("Locked");

  // Markers this suite is about to store. Matching on them, rather than diffing
  // the whole board, tells "my cleanup failed" apart from "another suite or a
  // live-sync event wrote something in the meantime", which is not this suite's
  // business and must not fail it.
  const sessionTitle = marker("Session write");
  const anonymousTitle = marker("Anonymous write");
  // The task ids present before this suite ran, to check the restore put them
  // back rather than leaving a trimmed board behind.
  const untouched = await readBoard(page);
  if (!untouched) out.preReadError = "could not read the board before writing";

  /* 1. A wrong code is refused, and says so. */
  const wrong = await login(page, WRONG_CODE);
  out.wrongCodeRefused = wrong.status === 401 && typeof wrong.body.error === "string" && wrong.body.error.length > 0;

  /* 2. The right code signs in as the person whose code it is. */
  const session = await login(page, CODE);
  out.signInAccepted = session.status === 200 && typeof session.body.token === "string" && session.body.token.length > 20;
  out.signedInAsExpected = session.body.name === NAME && session.body.admin === false;

  const sessionHeaders = {
    Authorization: "Bearer " + String(session.body.token || ""),
    "X-Sharondale-Token": UNKNOWN_TOKEN
  };

  /* 3. The API takes the session as proof on a write. */
  const write = await addThenRestore(page, sessionHeaders, "tasks", {
    id: "qa-session-write", title: sessionTitle, location: "Block S",
    day: "", priority: "low", assignee: "", done: false
  }, "title");
  out.sessionWriteStatus = write.put;
  if (write.error) out.sessionWriteError = String(write.error).slice(0, 160);
  out.sessionSignInName = String(session.body.name || "").slice(0, 40);
  out.expectedName = NAME;
  out.signedInCanWrite = write.put === 200;
  out.sessionWriteStored = write.stored === true;
  out.cleanupAfterWrite = write.restore === 200;

  // Recorded for reference only. Test runs start the backend with no write
  // token (run-all.mjs), so the server accepts this write and a 401 cannot be
  // asserted here; production protection is covered by qa-token.mjs.
  const anonymous = await addThenRestore(page, { "X-Sharondale-Token": UNKNOWN_TOKEN }, "tasks", {
    id: "qa-anonymous-write", title: anonymousTitle, location: "Block S",
    day: "", priority: "low", assignee: "", done: false
  }, "title");
  out.anonymousStatusForReference = anonymous.put;
  if (anonymous.error) out.anonymousError = String(anonymous.error).slice(0, 120);

  // Being signed in is a credential, not a way around the rules: a board the
  // open API would reject (a task with no id) must be rejected here too.
  const invalid = await page.evaluate(async (headers) => {
    const board = await (await fetch("/api/board")).json();
    board.tasks = (board.tasks || []).concat([{
      title: "No id", location: "Block S", day: "", priority: "low", assignee: "", done: false
    }]);
    const res = await fetch("/api/board", {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, headers),
      body: JSON.stringify(board)
    });
    return res.status;
  }, sessionHeaders);
  out.invalidBoardStillRejected = invalid === 400;

  /* 4. The browser keeps the session, so a reload is signed in and can save. */
  await page.evaluate(({ token, name }) => {
    sessionStorage.setItem("sharondaleSession", JSON.stringify({ token, name, admin: false }));
  }, { token: session.body.token, name: session.body.name });
  // A session token that has expired is discarded by login.js, which reloads
  // into the gate; either way the page must finish booting before it is asked
  // anything, so wait for loaded cards rather than assuming the reload holds.
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null),
    page.goto(page.url(), { waitUntil: "domcontentloaded" })
  ]);
  await page.waitForFunction(
    () => document.querySelectorAll("#boardBody .task-card").length > 0,
    null,
    { timeout: 25000 }
  ).catch(() => { });
  await page.waitForTimeout(500);
  out.stillSignedInAfterReload = await page.evaluate(() => !document.getElementById("loginGate"));
  out.boardLoadedWhileSignedIn = (await page.locator("#boardBody .task-card").count()) > 0;

  // A save made from the page. login.js's fetch wrapper adds the same session
  // from sessionStorage, so this is the caretaker's own change path. Skipped when
  // this browser cannot write at all (a board locked behind the sign-in gate), so
  // the suite still reports its auth findings instead of dying.
  const label = marker("Session shopping");
  const pageWrite = out.boardIsLocked ? { put: 0, stored: false, skipped: true } : await page.evaluate(async (label) => {
    const read = async () => (await fetch("/api/board")).json();
    const board = await read();
    const original = JSON.stringify(board);
    // A free numeric id: the board's own may already reach 900001.
    const nextId = Math.max(0, ...(board.shopping || []).map((s) => Number(s.id) || 0)) + 1;
    board.shopping = (board.shopping || []).concat([{ id: nextId, label, qty: 1, addedBy: "QA Session" }]);
    const put = await fetch("/api/board", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(board)
    });
    await new Promise((r) => setTimeout(r, 300));
    const after = await read();
    const stored = (after.shopping || []).some((s) => s.label === label);
    await fetch("/api/board", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: original
    });
    return { put: put.status, stored };
  }, label);
  if (pageWrite.skipped) out.pageSave = "skipped (board locked for this browser)";
  else {
    out.pageSaveStatus = pageWrite.put;
    out.pageStillSaves = pageWrite.put === 200 && pageWrite.stored === true;
  }

  /* Nothing this suite wrote may be left behind. */
  const stored = await readBoard(page);
  if (!stored) {
    // Without a read-back the cleanup cannot be proved, so this fails rather
    // than claiming the board is fine.
    out.cleanupLeftNoScratch = false;
    out.cleanupError = "could not read the board back";
    return out;
  }
  const survivors = [sessionTitle, anonymousTitle, label].filter((value) =>
    [].concat(stored.tasks || [], stored.shopping || []).some(
      (item) => item.title === value || item.label === value
    )
  );
  out.cleanupLeftNoScratch = survivors.length === 0;
  if (survivors.length) out.cleanupSurvivors = survivors.length;

  // And the rows that were there before this suite ran are still there: the
  // restore put the previous board back rather than a trimmed one.
  if (out.cleanupAfterWrite && untouched) {
    try {
      assert.deepStrictEqual(
        (stored.tasks || []).map((t) => t.id).sort(),
        (untouched.tasks || []).map((t) => t.id).sort()
      );
      out.previousRowsKept = true;
    } catch (e) {
      out.previousRowsKept = false;
      out.rowsDiff = String(e.message).split("\n").slice(0, 4).join(" | ");
    }
  }
  return out;
}
