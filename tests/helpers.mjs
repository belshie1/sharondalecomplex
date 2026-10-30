/**
 * Shared helpers for the browser QA scripts.
 *
 * The dashboard is backed by a shared server now, so tests must not assume a
 * pristine board: task and item names from earlier runs persist. Each suite
 * calls resetBoard() first so it starts from the known seed data, and the
 * assertions are written to identify rows by unique markers rather than by
 * position.
 */

/**
 * Restore the board to a clean, known state through the public API, then reload
 * so the page under test is showing that state.
 */
export async function resetBoard(page, { reload = true } = {}) {
  await page.evaluate(async () => {
    const day = (offset) => {
      const d = new Date();
      const jsDay = d.getDay();
      d.setDate(d.getDate() + (jsDay === 0 ? -6 : 1 - jsDay) + offset);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
        "-" + String(d.getDate()).padStart(2, "0");
    };
    const today = new Date();
    const todayIso = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") +
      "-" + String(today.getDate()).padStart(2, "0");

    const board = {
      tasks: [
        { id: "qa-1", title: "QA pool filter back-flush", location: "Clubhouse - Pool deck", day: day(0), priority: "medium", assignee: "Elena Ruiz", done: true },
        { id: "qa-2", title: "QA hallway bulb", location: "Block A - Floor 3", day: day(0), priority: "low", assignee: "Marco Conti", done: true },
        { id: "qa-3", title: "QA elevator safety check", location: "Block B - Lobby", day: day(1), priority: "high", assignee: "Tomas Brandt", done: false },
        { id: "qa-4", title: "QA irrigation timer", location: "Garden - Zone 2", day: day(1), priority: "low", assignee: "", done: false },
        { id: "qa-5", title: "QA leaking tap unit 14", location: "Block C - Unit 14", day: todayIso, priority: "high", assignee: "Tomas Brandt", done: false },
        { id: "qa-6", title: "QA gate motor lubrication", location: "Main entrance", day: todayIso, priority: "medium", assignee: "Priya Nair", done: false },
        { id: "qa-7", title: "QA litter sweep car park", location: "Basement P1", day: todayIso, priority: "low", assignee: "Elena Ruiz", done: true },
        { id: "qa-8", title: "QA fire extinguisher tag", location: "Block A - Stairwell", day: day(3), priority: "medium", assignee: "Marco Conti", done: false },
        { id: "qa-9", title: "QA clean gutters east wing", location: "Block B - Roof", day: day(4), priority: "medium", assignee: "Priya Nair", done: false },
        { id: "qa-10", title: "QA repaint parking bay lines", location: "Visitor car park", day: "", priority: "low", assignee: "", done: false },
        { id: "qa-11", title: "QA order replacement bin lids", location: "Block C - Bin store", day: "", priority: "medium", assignee: "", done: false },
        { id: "qa-12", title: "QA trim hedge boundary wall", location: "Garden - North edge", day: "", priority: "low", assignee: "Elena Ruiz", done: false },
      ],
      complaints: [
        { id: 1, owner: "L. Marchetti", apt: "Block A - 12", type: "Noise complaint", age: "2 days", status: "open", note: null },
        { id: 2, owner: "R. Novak", apt: "Block C - 04", type: "Plumbing leak", age: "5 hours", status: "open", note: null },
        { id: 3, owner: "S. Haddad", apt: "Block B - 21", type: "Elevator fault", age: "1 day", status: "progress", note: null },
        { id: 4, owner: "P. Dumont", apt: "Block A - 07", type: "Parking dispute", age: "3 days", status: "open", note: null },
      ],
      shopping: [
        { id: 1, label: "QA bin liners", qty: 2, addedBy: "Marco Conti" },
        { id: 2, label: "QA hallway bulbs", qty: 6, addedBy: "Marco Conti" },
        { id: 3, label: "QA WD-40 spray", qty: 1, addedBy: "Elena Ruiz" },
      ],
      recurring: [],
      people: [
        { id: "qa-p1", name: "Marco Conti", role: "Lead caretaker" },
        { id: "qa-p2", name: "Elena Ruiz", role: "Grounds" },
        { id: "qa-p3", name: "Tomas Brandt", role: "Maintenance" },
        { id: "qa-p4", name: "Priya Nair", role: "Cleaning" },
      ],
      phonebook: [
        { id: "qa-c1", name: "QA Emergency Line", company: "QA Residence", phone: "011 555 0100", note: "24 hours" },
        { id: "qa-c2", name: "QA Plumbing", company: "QA Plumbing CC", phone: "011 555 0142", note: "Leaks" },
      ],
      requests: [
        { id: "qa-r1", title: "QA request gate remote", location: "Main entrance", priority: "medium", requestedBy: "L. Marchetti", note: "Only works up close.", status: "pending" },
        { id: "qa-r2", title: "QA request stairwell handrail", location: "Block B - Stairwell", priority: "low", requestedBy: "S. Haddad", note: "", status: "pending" },
      ],
    };

    await fetch("/api/board", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(board),
    });

    // Confirm the server holds the state we just asked for. Suites share one
    // backend, so without this a later suite can start while an earlier save is
    // still settling and read a stale board.
    const expected = board.tasks.length;
    for (let attempt = 0; attempt < 40; attempt++) {
      const res = await fetch("/api/board");
      const current = await res.json();
      const hasRoster = Array.isArray(current.people) && current.people.length === board.people.length;
      const hasContacts = Array.isArray(current.phonebook) && current.phonebook.length === board.phonebook.length;
      const hasRequests = Array.isArray(current.requests) && current.requests.length === board.requests.length;
      const matches = hasRoster && hasContacts && hasRequests && current.tasks.length === expected &&
        current.shopping.length === board.shopping.length;
      if (matches) break;
      await new Promise(r => setTimeout(r, 100));
    }
  });

  if (reload) {
    // Re-navigate rather than calling reload(): a fresh navigation discards the
    // previous document outright, including its server-sent-events socket. A
    // reload can leave that socket in flight, which stops the load event from
    // settling and stalls the whole suite.
    await page.goto(page.url(), { waitUntil: "domcontentloaded" });
    // Booting now fetches from the server, so wait until the board and roster
    // have actually rendered rather than guessing at a delay: otherwise a suite
    // can interact mid-load and the re-render will undo it.
    await page.waitForFunction(
      () => document.querySelectorAll("#boardBody .task-card").length > 0 &&
            document.querySelectorAll("#peopleList .person-row").length > 0,
      null,
      { timeout: 20000 }
    );
    // A gated backend (the deployed site, and the local test board whenever a
    // person has a sign-in code) puts up a full-page sign-in overlay. Every
    // suite then ran behind it and asserted on a page nobody could touch. Sign
    // in as the QA person the runner seeded, if the gate is up at all, so the
    // suites start where a caretaker does.
    // Nothing may run in parallel here: signing in from a background promise
    // navigates the page out from under whatever else is still awaiting on it.
    await signInIfGated(page).catch(() => null);
    // The unlock prompt is offered a moment after boot. It only gets in the way
    // here, so it is dismissed whenever it turns up, including inside the sign-in
    // reload - a check made only once, at a fixed moment, missed it.
    for (let attempt = 0; attempt < 40; attempt++) {
      const dismissed = await page.evaluate(() => {
        const modal = document.getElementById("tokenModal");
        const cancel = document.getElementById("cancelToken");
        if (!modal || !modal.classList.contains("open")) return false;
        if (cancel) cancel.click();
        return true;
      }).catch(() => null);
      if (!dismissed) break;
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => {
      // Every suite starts on the calendar, so one can never inherit the tab
      // another left behind. dispatchEvent is the path the suites use too.
      document.querySelector('#mainNav .nav-item[data-view="tasks"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForTimeout(300);
  }
}

/** Current server-side board, for assertions about what was really stored. */
export async function serverBoard(page) {
  return page.evaluate(async () => {
    const res = await fetch("/api/board");
    return res.json();
  });
}

/** A unique marker so repeated runs never collide with earlier data. */
export function marker(prefix) {
  return prefix + " " + Date.now().toString(36) + Math.floor(Math.random() * 1000);
}

/**
 * Sign in at the gate if the page is showing one.
 *
 * The gate removes itself when /api/login says there is nobody to sign in as, so
 * an ungated local board is left alone. A gated one is signed in as the QA person
 * run-all.mjs seeded (QA_SESSION_NAME / QA_SESSION_CODE), which is what a
 * caretaker does before touching the board.
 *
 * Returns "signed-in", "not-gated" or a reason, so a suite that cares can say so.
 */
export async function signInIfGated(page) {
  const gate = page.locator("#loginGate");
  // The gate is added on DOMContentLoaded. Waiting for it to be *attached* piles
  // two delays together: the first eight seconds go on a gate that may never
  // come, and a real one then appears after this function has given up on it - a
  // suite's first click met its full-page dialog instead of the board. Ask the
  // server first, and only wait this long when it says a gate is coming.
  const announced = await page
    .evaluate(() => fetch("/api/login").then((r) => r.json()).then((c) => !!(c && c.gate)).catch(() => null))
    .catch(() => null);
  await gate.waitFor({ state: "attached", timeout: announced ? 8000 : 250 }).catch(() => null);
  if (!(await gate.count())) return "not-gated";

  const name = process.env.QA_SESSION_NAME || "QA Session";
  const code = process.env.QA_SESSION_CODE || "1357";
  await page.locator("#loginGate #loginCode").fill(code);
  await page.locator("#loginGate button[type=submit]").click();
  // Success reloads the document; failure leaves the gate up with a message.
  // Waiting for the element, not for a count taken before the reload, is what
  // notices the new document: the gate is only gone once that document boots.
  await gate
    .waitFor({ state: "detached", timeout: 30000 })
    .catch(() => null);
  await page.waitForFunction(() => !document.getElementById("loginGate"), null, { timeout: 5000 }).catch(() => null);
  if (!(await gate.count())) {
    // A fresh document after the reload: wait for it to finish booting.
    await page
      .waitForFunction(
        () => document.readyState === "complete" &&
          document.querySelectorAll("#boardBody .task-card").length > 0,
        null,
        { timeout: 20000 }
      )
      .catch(() => null);
    return "signed-in";
  }
  const error = await page.evaluate(
    () => (document.getElementById("loginError") || {}).innerText || ""
  ).catch(() => "");
  return `gate stayed up (${name}): ${String(error).slice(0, 80)}`;
}
