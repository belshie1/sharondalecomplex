/**
 * QA for the access-code (write token) lock.
 *
 * Runs against a server started with SHARONDALE_TOKEN set, so writes are
 * protected. Verifies the dashboard reads, reports itself locked, and can be
 * unlocked with the right code without the code being baked into the page.
 *
 *   SHARONDALE_TOKEN=secret123 node server/index.mjs
 *   node <browser-automation-skill-dir>/browser.mjs \
 *     http://localhost:3000/ --script ./tests/qa-token.mjs
 */
export default async function run(page) {
  const results = {};

  // The board is readable without the code: viewing is not gated, only writing.
  await page.waitForTimeout(1500);
  results.boardReadableWithoutCode = (await page.locator("#boardBody .task-card").count()) > 0;
  results.peopleVisible = Number(await page.locator("#navPeopleCount").innerText()) > 0;

  // The dashboard should recognise it cannot write and say so.
  await page.waitForFunction(
    () => {
      const t = document.getElementById("saveState").innerText;
      return t.includes("Locked") || t.includes("Saved");
    },
    null,
    { timeout: 15000 }
  );
  results.chipReportsLocked = (await page.locator("#saveState").innerText()).includes("Locked");

  // The unlock prompt should have appeared on its own.
  await page.waitForTimeout(600);
  results.promptAppeared = await page.locator("#tokenModal").evaluate(el => el.classList.contains("open"));

  // The prompt is modal: it must be dismissible with "Just browse" so a
  // read-only visitor is never stuck behind it, and the board behind it stays
  // on screen.
  results.boardStillShownUnderPrompt = (await page.locator("#boardBody .task-card").count()) > 0;
  await page.locator("#cancelToken").click();
  await page.waitForTimeout(300);
  results.justBrowseDismisses = await page.locator("#tokenModal").evaluate(el => !el.classList.contains("open"));
  await page.locator('.nav-item[data-view="shopping"]').click();
  await page.waitForTimeout(400);
  results.canNavigateAfterDismissing = await page
    .locator("#view-shopping")
    .evaluate(el => !el.hidden);
  // The chip carries the state from here on, and clicking it reopens the prompt.
  await page.locator("#saveState").click();
  await page.waitForTimeout(300);
  results.chipReopensPrompt = await page.locator("#tokenModal").evaluate(el => el.classList.contains("open"));

  // A wrong code is refused and the prompt stays open.
  await page.evaluate(() => {
    document.getElementById("tokenInput").value = "definitely-wrong";
  });
  await page.evaluate(() => document.getElementById("tokenForm").requestSubmit());
  await page.waitForTimeout(1500);
  results.wrongCodeRefused = (await page.locator("#tokenError").innerText()).includes("not accepted");
  results.stillLockedAfterWrongCode = (await page.locator("#saveState").innerText()).includes("Locked");
  results.promptStaysOpenAfterWrongCode = await page.locator("#tokenModal").evaluate(el => el.classList.contains("open"));

  // Back to the task composer for the write check below.
  await page.locator("#cancelToken").click();
  await page.locator('.nav-item[data-view="tasks"]').click();
  await page.waitForTimeout(300);
  await page.locator("#saveState").click();
  await page.waitForTimeout(300);

  // The right code unlocks and the chip flips to Saved.
  await page.evaluate(() => {
    const el = document.getElementById("tokenInput");
    el.value = "secret123";
  });
  await page.evaluate(() => document.getElementById("tokenForm").requestSubmit());
  await page.waitForTimeout(1800);
  results.modalClosedAfterUnlock = await page.locator("#tokenModal").evaluate(el => !el.classList.contains("open"));
  results.chipShowsSaved = (await page.locator("#saveState").innerText()).trim() === "Saved";

  // A change now actually reaches the server.
  const marker = "Token write check " + Date.now();
  await page.evaluate((t) => {
    document.getElementById("f-title").value = t;
    document.getElementById("f-location").value = "Block L";
    document.getElementById("f-assignee").value = "";
  }, marker);
  await page.evaluate(() => document.getElementById("composer").requestSubmit());
  await page.waitForTimeout(2000);
  const stored = await page.evaluate(async () => {
    const r = await fetch("/api/board");
    return r.json();
  });
  results.changeReachedServer = stored.tasks.some(t => t.title === marker);

  // The code is remembered for this browser, so a reload does not re-prompt.
  await page.goto(page.url(), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  results.remembersCodeAfterReload =
    !(await page.locator("#tokenModal").evaluate(el => el.classList.contains("open")));
  results.stillSavedAfterReload = (await page.locator("#saveState").innerText()).trim() === "Saved";
  results.codeNotInPageSource = !(await page.content()).includes("secret123");

  // Forgetting the code returns the board to locked.
  await page.evaluate(() => localStorage.removeItem("sharondaleToken"));
  await page.goto(page.url(), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  results.locksAgainWhenCodeCleared = (await page.locator("#saveState").innerText()).includes("Locked");

  return results;
}
