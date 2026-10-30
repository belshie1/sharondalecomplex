/**
 * The sign-in gate must tell a visitor when their code is wrong.
 *
 * login.js wraps window.fetch and signed out on ANY 401 from /api/*. Signing in
 * is a POST to /api/login, which answers 401 for a wrong code - so a mistyped
 * code reloaded the page, cleared the field and showed no message at all. On the
 * deployed site that was the whole experience of getting the code wrong: the
 * prompt simply reappeared, looking like the sign-in had not worked.
 *
 * Drives the real gate: type a wrong code, submit, and require the message and
 * the page to still be there. The right code is then used to prove the gate is
 * not simply broken - the runner gives the test board that person's code.
 */
import { resetBoard } from "./helpers.mjs";

const CODE = process.env.QA_SESSION_CODE || "1357";
const NAME = process.env.QA_SESSION_NAME || "QA Session";
// One failure only: the server locks an address after 5, and a locked address
// would make every later run of this suite see the wrong reason.
const WRONG_CODE = "0000";

export default async function run(page) {
  const out = {};
  await resetBoard(page);

  let navigated = false;
  page.on("framenavigated", () => { navigated = true; });

  // Start from a browser that is not signed in, so the gate is what is on screen.
  await page.evaluate(() => { try { sessionStorage.removeItem("sharondaleSession"); } catch (e) { /* none */ } });
  await page.goto(page.url(), { waitUntil: "domcontentloaded" });

  // The gate asks /api/login whether there is anything to sign in to and removes
  // itself when the answer is no (a board with no codes). Give it that round
  // trip before deciding which mode this run is in.
  await page.waitForTimeout(1500);
  out.boardCards = await page.locator("#boardBody .task-card").count().catch(() => -1);
  // A diagnostic, not an assertion: a backend with the gate switched off (the
  // local test board) is a supported answer, and the suite reports what it found
  // rather than failing on it - the gate itself is what gets asserted.
  const gateConfig = await page.evaluate(async () => {
    const res = await fetch("/api/login").then((r) => r.json()).catch(() => null);
    return res && typeof res.gate === "boolean" ? res.gate : null;
  });
  out.gateConfig = "login gate: " + String(gateConfig);
  if (gateConfig !== true) {
    out.skipped = "this backend has no gate (no sign-in codes on the board)";
    out.gateHiddenWhenOff = (await page.locator("#loginGate").count()) === 0;
    return out;
  }
  // Only an assertion where a gate is expected: the count is what starts this
  // suite, so recording it on an ungated board reported a failure nobody caused.
  out.gateRendered = (await page.locator("#loginGate").count()) > 0;

  // The gate only appears when the document says so. A backend that reports a
  // gate but renders none is its own failure, so wait and say which happened
  // rather than dying on a missing element.
  await page.locator("#loginGate #loginCode").waitFor({ state: "visible", timeout: 15000 }).catch(() => null);
  out.gateShown = (await page.locator("#loginGate").count()) > 0;
  if (!out.gateShown) {
    out.skipped = "the backend reports a gate but the page shows no sign-in form";
    return out;
  }

  // The overlay has to cover the whole viewport, and the page behind it must not
  // scroll: it sits on <body>, which a long dashboard makes taller than one
  // screen, so a gate sized to the first screen can be scrolled past - revealing
  // the caretaker's board to somebody who has not signed in.
  out.gateCoversViewport = await page.evaluate(() => {
    const r = document.getElementById("loginGate").getBoundingClientRect();
    return r.top <= 0 && r.left <= 0 && r.bottom >= innerHeight - 1 && r.right >= innerWidth - 1;
  });
  out.pageLockedWhileGateUp = await page.evaluate(() => {
    const overflowing = document.documentElement.scrollHeight > innerHeight + 4;
    if (!overflowing) return true; // nothing to scroll, so nothing to protect
    const overflow = getComputedStyle(document.documentElement).overflowY;
    return overflow === "hidden" || getComputedStyle(document.body).overflowY === "hidden";
  });

  // A mistyped code: typed, submitted.
  await page.locator("#loginGate #loginCode").fill(WRONG_CODE);
  navigated = false;
  await page.locator("#loginGate button[type=submit]").click();
  await page.waitForFunction(
    () => {
      const err = document.getElementById("loginError");
      return !!err && err.innerText.trim().length > 0;
    },
    null,
    { timeout: 10000 }
  ).catch(() => { });
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => ({
    gate: !!document.getElementById("loginGate"),
    error: String((document.getElementById("loginError") || {}).innerText || "").trim(),
    typed: (document.getElementById("loginCode") || {}).value || ""
  }));
  out.gateStayed = after.gate === true;
  out.reloadAvoided = navigated === false;
  out.wrongCodeExplained = after.error.length > 0;
  // The field is cleared for the retry on purpose; what must not happen is the
  // message vanishing with a fresh page.
  out.errorText = String(after.error).slice(0, 60);

  // The right code still signs in: the message above must not be a gate that
  // can never open.
  await page.locator("#loginGate #loginCode").waitFor({ state: "visible", timeout: 10000 }).catch(() => null);
  await page.locator("#loginGate #loginCode").fill(CODE);
  await page.locator("#loginGate button[type=submit]").click();
  // A successful sign-in reloads the document. Polling for "no gate" across that
  // reload can catch the old document, so wait for the session to be stored - the
  // thing that actually proves the sign-in worked - and then for the new page.
  out.rightCodeSignsIn = await page
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
    .then(() => true, () => false);
  // The reload replaces the document; polling the new one too early reads
  // nothing. Wait for the board it boots with.
  await page
    .waitForFunction(
      () => document.querySelectorAll("#boardBody .task-card").length > 0,
      null,
      { timeout: 20000 }
    )
    .catch(() => { });
  await page.waitForTimeout(300);
  out.signedInAs = await page.evaluate(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem("sharondaleSession") || "null");
      return s ? s.name : null;
    } catch (e) {
      return null;
    }
  });
  out.signedInAsExpected = out.signedInAs === NAME;

  // Signing in gives the page back: the gate's lock on the page is released.
  out.pageUnlockedAfterSignIn = await page.evaluate(() =>
    !document.documentElement.classList.contains("gate-up") &&
    getComputedStyle(document.documentElement).overflowY !== "hidden"
  );

  // And the page it lands on works: the board is there, not a blank reload.
  out.boardRendered = await page
    .locator("#boardBody .task-card")
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  try { sessionStorage.removeItem("sharondaleSession"); } catch (e) { /* none */ }
  return out;
}
