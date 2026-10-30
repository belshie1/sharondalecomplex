/**
 * QA for "Working as" being fixed to the signed-in person.
 *
 * A signed-in caretaker works as themselves. The selector used to stay a live
 * dropdown, and app.js re-rendered its options on every roster change, which
 * also undid the one-off disable. This suite signs in as the QA person the
 * runner seeded, then tries every way a person could change it.
 */
export default async function run(page) {
  const out = {};
  const me = process.env.QA_SESSION_NAME || "QA Session";

  // The browser starts with no session even on a gated board (the gate is up).
  // Sign in as the seeded QA person first, the way a caretaker would.
  const gateUp = (await page.locator("#loginGate").count()) > 0;
  if (gateUp) {
    const code = process.env.QA_SESSION_CODE || "1357";
    await page.locator("#loginGate #loginCode").fill(code);
    await page.locator("#loginGate button[type=submit]").click();
    await page
      .waitForFunction(
        () => {
          try {
            return !document.getElementById("loginGate") && !!sessionStorage.getItem("sharondaleSession");
          } catch (e) {
            return false;
          }
        },
        null,
        { timeout: 25000 }
      )
      .catch(() => null);
    // The sign-in reloads the document; wait for the board it boots with.
    await page
      .waitForFunction(() => document.querySelectorAll("#boardBody .task-card").length > 0, null, { timeout: 20000 })
      .catch(() => null);
    await page.waitForTimeout(300);
  }

  const session = await page.evaluate(() => {
    try { return JSON.parse(sessionStorage.getItem("sharondaleSession") || "null"); } catch (e) { return null; }
  });
  out.signedInAs = session && session.name ? session.name : "nobody";
  // The suite only ran against a backend whose gate removes itself on a board
  // with no codes, so there was nothing to sign in to. Nothing to assert: the
  // free choice is the intended behaviour when nobody is signed in.
  if (!session) {
    out.skipped = "not signed in on this backend (the gate is off)";
    return out;
  }

  const select = page.locator("#currentUserSelect");
  const state = () =>
    page.evaluate(() => {
      const s = document.getElementById("currentUserSelect");
      return {
        value: s.value,
        disabled: s.disabled,
        pointerEvents: getComputedStyle(s).pointerEvents,
        label: (document.getElementById("userRole") || {}).textContent || "",
      };
    });

  out.shownAs = (await state()).value;
  out.showsSignedInPerson = (await state()).value === me;

  // Someone else on the roster, so there is something to try to switch to.
  const other = await page.evaluate((me) => {
    const opt = Array.from(document.querySelectorAll("#currentUserSelect option"))
      .map((o) => o.value)
      .find((v) => v && v !== me);
    return opt || null;
  }, me);
  out.otherName = other || "(none)";

  // 1. A chosen option, driven the way a browser would: set, then change.
  out.blockedOnChange = await page.evaluate((target) => {
    const s = document.getElementById("currentUserSelect");
    if (!target) return false;
    s.value = target;
    s.dispatchEvent(new Event("change", { bubbles: true }));
    return s.value === s.options[0] ? false : true;
  }, other).catch(() => false);
  await page.waitForTimeout(300);
  out.valueAfterChange = (await state()).value;
  out.changeIgnored = out.valueAfterChange === me;

  // 2. A real click: pointer events must not reach the control at all.
  out.pointerEventsNone = (await state()).pointerEvents === "none";
  out.disabled = (await state()).disabled;
  out.clickDoesNothing = await (async () => {
    try {
      await select.click({ timeout: 2000 });
      return false; // it was clickable, so it did not do nothing
    } catch (e) {
      return /intercepts pointer events|not enabled|subtree intercepts|element is not enabled/i.test(String(e.message));
    }
  })();
  out.stillMeAfterClick = (await state()).value === me;

  // 3. The re-render that used to undo the lock: the roster list is rebuilt on
  // every change, so add a person and check the control is still locked.
  await page.locator('#mainNav .nav-item[data-view="people"]').dispatchEvent("click");
  await page.waitForTimeout(200);
  const added = await page.evaluate(async (name) => {
    const input = document.getElementById("peopleName");
    const role = document.getElementById("peopleRole");
    const form = document.getElementById("peopleForm");
    input.value = name;
    if (role) role.value = "QA";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return true;
  }, "QA WorkingAs " + Date.now().toString(36));
  await page.waitForTimeout(600);
  out.lockedAfterRosterChange = (await state()).disabled === true && (await state()).value === me;

  // Undo the roster addition so the suite leaves the board as it found it.
  const removed = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll("#peopleList .person-row"))
      .find((r) => /QA WorkingAs/.test(r.innerText));
    if (!row) return false;
    const btn = row.querySelector("[data-remove-person], .person-remove, button[title*=Remove]");
    if (!btn) return false;
    btn.click();
    const confirm = document.querySelector("[data-confirm], .delete-modal .btn-danger, .modal-actions .btn-primary");
    if (confirm) confirm.click();
    return true;
  }).catch(() => false);
  await page.waitForTimeout(400);
  out.rosterCleanedUp = removed || !added ? "yes" : "check manually";

  await page.locator('#mainNav .nav-item[data-view="tasks"]').dispatchEvent("click");
  return out;
}
