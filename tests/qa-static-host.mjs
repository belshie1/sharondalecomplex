/**
 * A page published without a backend must not look like a working board.
 *
 * This is the failure this repo has repeated: the dashboard went to GitHub
 * Pages, /api/* returned 404, and visitors saw a fully populated sample board
 * with a "1 / 3 tasks completed today" ring. Nothing they typed was saved.
 *
 * The suite fakes a static host inside the page - every /api request answers
 * 404 HTML, exactly as Pages does - so it does not need a second server:
 *
 *   node <browser-automation-skill-dir>/browser.mjs \
 *     http://localhost:3000/ --script ./tests/qa-static-host.mjs
 */
export default async function run(page) {
  const out = {};

  // Answer /api/* like GitHub Pages: 404, HTML, no JSON. Installed before any
  // app script runs, so the dashboard's very first fetch sees a static host.
  await page.addInitScript(() => {
    // A previous suite may have left an offline cache in this profile; it is
    // not what this test is about, and it must not be mistaken for one this
    // page wrote.
    try { localStorage.removeItem("sharondaleBoardData"); } catch (e) { /* no storage */ }
    const realFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      if (/\/api\//.test(url)) {
        return Promise.resolve(new Response(
          "<!DOCTYPE html><html><body><h1>404</h1><p>File not found</p></body></html>",
          { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
        ));
      }
      return realFetch.call(this, input, init);
    };
    // The live-sync stream is also part of the API.
    window.EventSource = function () {
      this.addEventListener = function () { };
      this.close = function () { };
    };
  });

  await page.goto(page.url(), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // 1. The board is empty: no sample tasks, issues, supplies or counts.
  out.noTaskCards = (await page.locator("#boardBody .task-card").count()) === 0;
  out.noBacklogItems = (await page.locator("#backlogList .backlog-item").count()) === 0;
  out.noComplaintRows = (await page.locator("#complaintsList .complaint-row").count()) === 0;
  out.noShoppingRows = (await page.locator("#shoppingList .shopping-item").count()) === 0;
  // Not "0" either: a zero is a figure, and this board holds no data at all.
  // Read the text nodes rather than innerText - a badge's innerText is "0"
  // whenever it is not rendered, which is exactly how an earlier version of
  // this check passed while the sidebar was still showing zeroes.
  out.navCountsAreBlank = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".nav .count"))
      .every((n) => n.textContent.trim() === ""));
  out.bellBadgeIsBlank = (await page.evaluate(() =>
    document.getElementById("bellBadge").textContent.trim())) === "";
  // A "1 / 3 completed today" figure is the most believable-looking lie of all.
  out.progressRingHasNoFigure = (await page.locator("#ringValue").innerText()).trim() === "\u2014";

  out.legendHasNoFigures = (await page.locator("#legendHigh").innerText()).trim() === "\u2014";

  // 2. The page says so, in words, and does not promise a retry that can
  //    never happen.
  out.bannerVisible = await page.locator("#syncBanner").isVisible();
  const banner = await page.locator("#syncBanner").innerText();
  out.bannerNamesTheCause = /no backend/i.test(banner) && /nothing is saved/i.test(banner);
  const chip = (await page.locator("#saveState").innerText()).trim();
  out.chipSaysNothingSaved = chip === "No backend - nothing saved";
  out.chipIsMarkedOffline = await page.locator("#saveState")
    .evaluate((el) => el.classList.contains("offline"));
  out.chipDoesNotPromiseRetry = !/will retry/i.test(chip);
  out.chipDoesNotClaimSaved = chip !== "Saved";

  // 3. Adding work is refused visibly, not silently "added" and lost.
  await page.locator("#f-title").fill("STATIC HOST PROBE");
  await page.locator("#f-location").fill("Block Z");
  await page.locator("#composer button[type=submit]").click();
  await page.waitForTimeout(600);
  out.noTaskAdded = (await page.locator("#boardBody .task-card").count()) === 0;
  const toasts = await page.locator(".toast").allInnerTexts();
  out.toastSaysNothingSaved = toasts.some((t) => /nothing is saved/i.test(t));
  out.noFalseSuccessToast = !toasts.some((t) => /task added/i.test(t));
  out.typedWorkIsKeptInTheForm = (await page.locator("#f-title").inputValue()) === "STATIC HOST PROBE";

  // 4. Nothing from this page is written to the browser cache either: a later,
  //    properly deployed page must not pick up a sample board as "last saved".
  out.noCacheWritten = await page.evaluate(() =>
    localStorage.getItem("sharondaleBoardData") === null);

  return out;
}
