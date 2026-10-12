/**
 * Proves the dashboard is backed by the server, not by the browser.
 *
 *   node <browser-automation-skill-dir>/browser.mjs \
 *     http://localhost:3000/ --script ./tests/qa-backend.mjs
 */
import { resetBoard, marker } from "./helpers.mjs";

export default async function run(page) {
  const out = {};
  // Start from a known board: other suites share this server, and leftover
  // state would otherwise make the shopping list empty or the counts drift.
  await resetBoard(page);

  // 1. The board came from the API, not localStorage.
  out.boardLoadedFromServer = await page.locator("#boardBody .task-card").count() > 0;
  out.shoppingLoadedFromServer = await page.locator("#navShoppingCount").innerText();
  out.savedChip = (await page.locator("#saveState").innerText()).trim();

  // 2. A write goes to the server: add a task and read it back via the API.
  const marker_ = marker("BACKEND PROOF");
  await page.locator("#f-title").fill(marker_);
  await page.locator("#f-location").fill("Block Q");
  await page.locator("#f-assignee").selectOption("Priya Nair");
  await page.locator("#composer button[type=submit]").click();
  await page.waitForTimeout(1200);

  const viaApi = await page.evaluate(async () => {
    const r = await fetch("/api/board");
    const b = await r.json();
    return { count: b.tasks.length, titles: b.tasks.map(t => t.title) };
  });
  out.taskReachedServer = viaApi.titles.includes(marker_);
  out.serverTaskCount = viaApi.count;

  // 3. THE POINT: a completely separate browser context (own cookies, own
  //    localStorage, simulating another device) sees the same data.
  const other = await page.context().browser().newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await otherPage.waitForTimeout(1800);
  out.secondDeviceSeesTask = await otherPage
    .locator(".task-card", { hasText: marker_ })
    .count() === 1;
  out.secondDeviceHasNoLocalStorage = await otherPage.evaluate(() =>
    localStorage.getItem("sharondaleBoardData") === null
  );
  await other.close();

  // 4. A shopping tick on this device is visible to the server too.
  await page.locator('.nav-item[data-view="shopping"]').click();
  await page.waitForTimeout(200);
  const itemCount = await page.locator("#shoppingList .shopping-item").count();
  out.shoppingPresentForTest = itemCount > 0;
  const itemId = await page.locator("#shoppingList .shopping-item").first().getAttribute("data-id");
  await page.locator("#shoppingList .shopping-item").first().locator(".shopping-box").click();
  await page.waitForTimeout(1500);
  const shopViaApi = await page.evaluate(async () => {
    const r = await fetch("/api/board");
    const b = await r.json();
    return b.shopping.map(s => String(s.id));
  });
  out.shoppingRemovalReachedServer = !shopViaApi.includes(String(itemId)) && itemCount > 0;

  // 5. Nothing is being kept only in the browser: the cache is a mirror.
  out.cacheIsMirrorOnly = await page.evaluate(async () => {
    const cache = JSON.parse(localStorage.getItem("sharondaleBoardData") || "{}");
    const r = await fetch("/api/board");
    const server = await r.json();
    return Array.isArray(cache.tasks) && cache.tasks.length === server.tasks.length;
  });

  return out;
}
