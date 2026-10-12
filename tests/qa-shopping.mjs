/**
 * QA for the shopping list tab.
 *
 *   node <browser-automation-skill-dir>/browser.mjs \
 *     http://localhost:8123/dashboard/index.html --script ./tests/qa-shopping.mjs
 */
export default async function run(page) {
  const results = {};

  // --- The tab exists and switches views ---------------------------------
  results.shoppingTabVisible = await page.locator('.nav-item[data-view="shopping"]').isVisible();
  await page.locator('.nav-item[data-view="shopping"]').click();
  await page.waitForTimeout(250);
  results.shoppingViewActive = await page
    .locator("#view-shopping")
    .evaluate(el => el.classList.contains("active"));

  // --- Seeded items render -----------------------------------------------
  const seeded = await page.locator("#shoppingList .shopping-item").count();
  results.seededItems = seeded > 0;
  results.navCountMatches = Number(await page.locator("#navShoppingCount").innerText()) === seeded;
  results.itemsShowQuantity = await page
    .locator("#shoppingList .shopping-qty")
    .first()
    .evaluate(el => /^x\d+$/.test(el.innerText.trim()));

  // --- Adding an item -----------------------------------------------------
  await page.locator("#shoppingInput").fill("Drain cleaner");
  await page.locator("#shoppingQty").selectOption("3");
  await page.locator("#shoppingForm button[type=submit]").click();
  await page.waitForTimeout(300);
  results.addedItemAppears = (await page.locator("#shoppingList .shopping-item", { hasText: "Drain cleaner" }).count()) === 1;
  results.addedQtyApplied = await page
    .locator("#shoppingList .shopping-item", { hasText: "Drain cleaner" })
    .evaluate(el => el.innerText.includes("x3"));
  results.inputClearedAfterAdd = (await page.locator("#shoppingInput").inputValue()) === "";

  // --- Adding the same item again bumps the quantity, not the row ---------
  const beforeDup = await page.locator("#shoppingList .shopping-item").count();
  await page.locator("#shoppingInput").fill("drain cleaner");
  await page.locator("#shoppingForm button[type=submit]").click();
  await page.waitForTimeout(300);
  results.duplicateMergesInsteadOfDuplicating = (await page.locator("#shoppingList .shopping-item").count()) === beforeDup;
  results.duplicateBumpedQty = await page
    .locator("#shoppingList .shopping-item", { hasText: "Drain cleaner" })
    .evaluate(el => el.innerText.includes("x4"));

  // --- The core requirement: ticking an item REMOVES it -------------------
  const target = page.locator("#shoppingList .shopping-item", { hasText: "Drain cleaner" });
  const targetId = await target.getAttribute("data-id");
  const countBeforeTick = await page.locator("#shoppingList .shopping-item").count();
  // Click the visible box, which is what a caretaker actually taps.
  await target.locator(".shopping-box").click();
  await page.waitForTimeout(600); // tick animates out, then JS removes it
  results.checkedItemRemoved = (await page.locator('.shopping-item[data-id="' + targetId + '"]').count()) === 0;
  results.countDecremented = (await page.locator("#shoppingList .shopping-item").count()) === countBeforeTick - 1;
  results.navCountUpdated = Number(await page.locator("#navShoppingCount").innerText()) === countBeforeTick - 1;
  results.tickLoggedToActivity = await page
    .locator("#activityList")
    .evaluate(el => el.innerText.includes("Picked up"));

  // --- Ticking also works from the keyboard ---------------------------------
  const kb = page.locator("#shoppingList .shopping-item").first();
  const kbId = await kb.getAttribute("data-id");
  await kb.locator(".shopping-check input").focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(600);
  results.keyboardTickRemoves = (await page.locator('.shopping-item[data-id="' + kbId + '"]').count()) === 0;

  // --- The X button removes without ticking -------------------------------
  const beforeRemove = await page.locator("#shoppingList .shopping-item").count();
  await page.locator("#shoppingList .shopping-item").first().locator(".shopping-remove").click();
  await page.waitForTimeout(300);
  results.removeButtonDeletes = (await page.locator("#shoppingList .shopping-item").count()) === beforeRemove - 1;
  // --- Persistence across reload ------------------------------------------
  await page.locator("#shoppingInput").fill("Persisted test item");
  await page.locator("#shoppingForm button[type=submit]").click();
  await page.waitForTimeout(300);
  const savedInStorage = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sharondaleBoardData")).shopping.some(i => i.label === "Persisted test item")
  );
  results.savedToStorage = savedInStorage;

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  results.survivesReload = (await page
    .locator("#shoppingList .shopping-item", { hasText: "Persisted test item" })
    .count()) === 1;
  results.removedItemsStayRemoved = (await page
    .locator("#shoppingList .shopping-item", { hasText: "Drain cleaner" })
    .count()) === 0;

  // --- Empty state --------------------------------------------------------
  await page.evaluate(() => {
    document.querySelectorAll("#shoppingList .shopping-remove").forEach(b => b.click());
  });
  await page.waitForTimeout(400);
  results.emptyStateShown = (await page.locator("#shoppingList .shopping-empty").count()) === 1;
  results.summaryShowsNothingOutstanding = (await page.locator("#shoppingSummary").innerText()).includes("Nothing outstanding");

  return results;
}
