/**
 * Proves a save through the server keeps every list of the board.
 *
 * This is the regression test for the deployed failure: on the Supabase HTTPS
 * Data API path the board is stored as one JSON document, and a write that
 * replaced only part of that document left the other screens' data behind - so
 * adding a task could quietly drop the shopping list a moment later. Every
 * list is written together here and read back from a separate request, which is
 * what a second device sees.
 *
 *   node <browser-automation-skill-dir>/browser.mjs \
 *     http://localhost:3000/ --script ./tests/qa-board-integrity.mjs
 */
import { resetBoard, marker } from "./helpers.mjs";

export default async function run(page) {
  const out = {};
  await resetBoard(page);

  // 1. The board the suite starts from has all its lists.
  const before = await page.evaluate(async () => (await fetch("/api/board")).json());
  out.startsWithAllLists =
    before.tasks.length > 0 &&
    before.shopping.length > 0 &&
    before.complaints.length > 0 &&
    before.people.length > 0 &&
    before.phonebook.length > 0 &&
    before.requests.length > 0;

  // 2. A full save that touches one list must leave the others exactly as they
  //    were. Build it from the server's own copy so nothing is guessed.
  const m = marker("INTEGRITY");
  const token = await page.evaluate(() => {
    let baked = "";
    try { baked = window.SHARONDALE_TOKEN || ""; } catch (e) { /* not set */ }
    try { return baked || localStorage.getItem("sharondaleToken") || ""; } catch (e) { return baked; }
  });
  const writeHeaders = { "Content-Type": "application/json", "X-Sharondale-Token": token };
  const snapshot = await page.evaluate(async ({ t, writeHeaders }) => {
    const board = await (await fetch("/api/board")).json();
    board.tasks.push({
      id: "integrity-" + Date.now(),
      title: t,
      location: "Block Q",
      day: "",
      priority: "low",
      assignee: "",
      done: false,
    });
    const res = await fetch("/api/board", {
      method: "PUT",
      headers: writeHeaders,
      body: JSON.stringify(board),
    });
    return { status: res.status, sent: board };
  }, { t: m, writeHeaders });
  out.saveAccepted = snapshot.status === 200;

  const after = await page.evaluate(async () => (await fetch("/api/board")).json());
  const sent = snapshot.sent;
  out.tasksKept = after.tasks.length === sent.tasks.length && after.tasks.some((t) => t.title === m);
  out.shoppingKept = after.shopping.length === sent.shopping.length;
  out.complaintsKept = after.complaints.length === sent.complaints.length;
  out.peopleKept = after.people.length === sent.people.length;
  out.phonebookKept = after.phonebook.length === sent.phonebook.length;
  out.requestsKept = after.requests.length === sent.requests.length;

  // 3. A partial save keeps the lists it did not mention, and replaces the two
  //    it did - the documented rule for the People / Phonebook screens.
  const partial = await page.evaluate(async ({ t, writeHeaders }) => {
    const board = await (await fetch("/api/board")).json();
    const res = await fetch("/api/board", {
      method: "PUT",
      headers: writeHeaders,
      body: JSON.stringify({
        tasks: board.tasks.map((x) => ({ ...x, title: x.title })),
        complaints: board.complaints,
        shopping: [{ id: 9001, label: t + " item", qty: 1, addedBy: "Test" }],
      }),
    });
    return res.status;
  }, { t: m, writeHeaders });
  out.partialSaveAccepted = partial === 200;
  const reread = await page.evaluate(async () => (await fetch("/api/board")).json());
  out.partialShrunkShopping = reread.shopping.length === 1;
  out.partialLeftPeople = reread.people.length === sent.people.length;
  out.partialLeftPhonebook = reread.phonebook.length === sent.phonebook.length;
  out.partialLeftRequests = reread.requests.length === sent.requests.length;

  await resetBoard(page);
  return out;
}
