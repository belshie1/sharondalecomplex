/**
 * Sharondale Caretaker Operations — browser QA script.
 *
 * Run against a locally-served copy of the dashboard:
 *
 *   1. Serve the project root on a static server, e.g.
 *        node tests/serve.mjs
 *   2. Run this script through the browser-automation skill's runner:
 *        node <browser-automation-skill-dir>/browser.mjs \
 *          http://localhost:8123/dashboard/index.html --script ./tests/qa.mjs
 *
 * The runner navigates to the URL first, then calls this function with
 * (page, ui): `page` is a Playwright Page, `ui` is the ref helper
 * (ui.snapshot / ui.click / ui.fill / ui.text / ui.ref).
 *
 * The returned object is printed as JSON; each key is a named assertion.
 */
export default async function run(page, ui) {
  const results = {};

  // 1. Weekly report modal opens and reports live counts
  await ui.click((await ui.snapshot()).match(/(@e\d+) button "Weekly report"/)[1]);
  await page.waitForTimeout(300);
  results.modalOpen = await page.locator("#reportModal").evaluate(el => el.classList.contains("open"));
  results.rTotal = await page.locator("#rTotal").innerText();
  results.rOpenIssues = await page.locator("#rOpenIssues").innerText();

  // 2. Modal closes again
  await ui.click((await ui.snapshot()).match(/(@e\d+) button "Close"/)[1]);
  await page.waitForTimeout(200);
  results.modalClosed = await page.locator("#reportModal").evaluate(el => !el.classList.contains("open"));

  // 3. Clicking a task card toggles its completion state
  const beforeDone = await page.evaluate(() => document.querySelectorAll(".task-card.done").length);
  await page.locator(".task-card").first().click();
  await page.waitForTimeout(200);
  const afterDone = await page.evaluate(() => document.querySelectorAll(".task-card.done").length);
  results.toggleWorks = beforeDone !== afterDone;

  // 4. Sidebar switches to the complaints view
  await ui.click((await ui.snapshot()).match(/(@e\d+) button "Complaints & reports \d+"/)[1]);
  await page.waitForTimeout(200);
  results.complaintsVisible = await page.locator("#view-complaints").evaluate(el => el.classList.contains("active"));

  // 5. "Create task" on a complaint moves it to In progress and keeps the row count stable
  const rowsBefore = await page.locator("#complaintsList .complaint-row").count();
  await page.locator(".act-create").first().click();
  await page.waitForTimeout(200);
  results.complaintCreateTask = await page.locator("#complaintsList .status-chip").first().innerText();
  results.complaintRowCountStable = (await page.locator("#complaintsList .complaint-row").count()) === rowsBefore;

  return results;
}
