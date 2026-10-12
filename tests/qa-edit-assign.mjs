/**
 * Focused QA for the task editing + assignment features.
 *
 *   node <browser-automation-skill-dir>/browser.mjs \
 *     http://localhost:8123/dashboard/index.html --script ./tests/qa-edit-assign.mjs
 */
export default async function run(page) {
  const results = {};

  // --- Composer offers an assignee selector -------------------------------
  results.composerAssigneeOptions = await page
    .locator("#f-assignee option")
    .evaluateAll(opts => opts.map(o => o.value));

  // --- Create a task already assigned to a person -------------------------
  await page.locator("#f-title").fill("Clear blocked drain");
  await page.locator("#f-location").fill("Block D - Courtyard");
  await page.locator("#f-assignee").selectOption("Elena Ruiz");
  await page.locator("#composer button[type=submit]").click();
  await page.waitForTimeout(200);

  const created = page.locator(".task-card", { hasText: "Clear blocked drain" });
  results.createdCardShowsAssignee = (await created.locator(".t-assignee span").innerText()) === "Elena Ruiz";
  results.composerResetsAfterAdd = (await page.locator("#f-assignee").inputValue()) === "";

  // --- Edit a task: change fields and re-assign ---------------------------
  const taskId = await created.getAttribute("data-id");
  await created.locator(".task-edit").click();
  await page.waitForTimeout(200);
  results.editModalOpen = await page.locator("#editModal").evaluate(el => el.classList.contains("open"));
  results.editModalPrefilledTitle = await page.locator("#e-title").inputValue();
  results.editModalPrefilledAssignee = await page.locator("#e-assignee").inputValue();

  await page.locator("#e-title").fill("Clear blocked drain - rear");
  await page.locator("#e-priority").selectOption("high");
  await page.locator("#e-assignee").selectOption("Tomas Brandt");
  await page.locator("#editForm button[type=submit]").click();
  await page.waitForTimeout(250);

  const edited = page.locator('.task-card[data-id="' + taskId + '"]');
  results.editModalClosed = await page.locator("#editModal").evaluate(el => !el.classList.contains("open"));
  results.editedTitleApplied = (await edited.locator(".t-title").innerText()) === "Clear blocked drain - rear";
  results.reassignedToTomas = (await edited.locator(".t-assignee span").innerText()) === "Tomas Brandt";
  results.priorityClassUpdated = await edited.evaluate(el => el.classList.contains("priority-high"));
  results.clickingEditDidNotToggleDone = await edited.evaluate(el => !el.classList.contains("done"));
  results.activityLoggedEdit = await page
    .locator("#activityList")
    .evaluate(el => el.innerText.includes("assignee to Tomas Brandt"));
  // --- Editing also moves a task to another day ----------------------------
  await edited.locator(".task-edit").click();
  await page.waitForTimeout(150);
  await page.locator("#e-day").selectOption("sat");
  await page.locator("#editForm button[type=submit]").click();
  await page.waitForTimeout(250);
  // Columns are keyed by real calendar date, so resolve "sat" to that date
  // via the board header, then check the task sits in the matching column.
  results.movedToSaturday = await page.evaluate((id) => {
    const heads = [...document.querySelectorAll("#boardHeader .day-head")];
    const cols = [...document.querySelectorAll("#boardBody .day-col")];
    const satIndex = heads.findIndex(h => h.querySelector(".name").innerText.trim().toLowerCase() === "sat");
    if (satIndex === -1) return false;
    return !!cols[satIndex].querySelector('.task-card[data-id="' + id + '"]');
  }, taskId);

  // --- Removing the task still requires the password ------------------------
  await page.locator('.task-card[data-id="' + taskId + '"] .task-delete').click();
  await page.locator("#deletePassword").fill("5879");
  await page.locator("#deleteForm button[type=submit]").click();
  await page.waitForTimeout(200);
  results.deleteStillWorksAfterEdit = (await page.locator('.task-card[data-id="' + taskId + '"]').count()) === 0;

  // --- Unassigned cards are labelled ---------------------------------------
  results.unassignedCardsLabelled = await page.evaluate(() =>
    [...document.querySelectorAll(".task-card .t-assignee")]
      .every(el => el.innerText.trim().length > 0)
  );

  return results;
}
