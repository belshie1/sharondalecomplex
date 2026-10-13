/**
 * Focused QA for the task editing + assignment features.
 *
 * The dashboard is server-backed, so this resets the board first and uses a
 * unique marker: tasks from an earlier run would otherwise still be present.
 *
 *   node <browser-automation-skill-dir>/browser.mjs \
 *     http://localhost:3000/ --script ./tests/qa-edit-assign.mjs
 */
import { resetBoard, serverBoard, marker } from "./helpers.mjs";

export default async function run(page) {
  const results = {};
  await resetBoard(page);
  const TITLE = marker("Drain");
  const EDITED = TITLE + " rear";

  // --- Composer offers an assignee selector -------------------------------
  results.composerAssigneeOptions = await page
    .locator("#f-assignee option")
    .evaluateAll(opts => opts.map(o => o.value));

  // --- Create a task already assigned to a person -------------------------
  await page.locator("#f-title").fill(TITLE);
  await page.locator("#f-location").fill("Block D - Courtyard");
  await page.locator("#f-assignee").selectOption("Elena Ruiz");
  await page.locator("#composer button[type=submit]").click();
  await page.waitForTimeout(400);

  const created = page.locator(".task-card", { hasText: TITLE });
  results.createdCardShowsAssignee = (await created.locator(".t-assignee span").innerText()) === "Elena Ruiz";
  results.composerResetsAfterAdd = (await page.locator("#f-assignee").inputValue()) === "";

  // --- Edit a task: change fields and re-assign ---------------------------
  const taskId = await created.getAttribute("data-id");
  await created.locator(".task-edit").click();
  await page.waitForTimeout(250);
  results.editModalOpen = await page.locator("#editModal").evaluate(el => el.classList.contains("open"));
  results.editModalPrefilledTitle = (await page.locator("#e-title").inputValue()) === TITLE;
  results.editModalPrefilledAssignee = (await page.locator("#e-assignee").inputValue()) === "Elena Ruiz";

  await page.locator("#e-title").fill(EDITED);
  await page.locator("#e-priority").selectOption("high");
  await page.locator("#e-assignee").selectOption("Tomas Brandt");
  await page.locator("#editForm button[type=submit]").click();
  await page.waitForTimeout(500);

  const edited = page.locator('.task-card[data-id="' + taskId + '"]');
  results.editModalClosed = await page.locator("#editModal").evaluate(el => !el.classList.contains("open"));
  results.editedTitleApplied = (await edited.locator(".t-title").innerText()) === EDITED;
  results.reassignedToTomas = (await edited.locator(".t-assignee span").innerText()) === "Tomas Brandt";
  results.priorityClassUpdated = await edited.evaluate(el => el.classList.contains("priority-high"));
  results.clickingEditDidNotToggleDone = await edited.evaluate(el => !el.classList.contains("done"));
  results.activityLoggedEdit = await page
    .locator("#activityList")
    .evaluate(el => el.innerText.includes("assignee to Tomas Brandt"));

  // --- The edit was written to the SERVER, not just the page --------------
  const stored = await serverBoard(page);
  const storedTask = stored.tasks.find(t => String(t.id) === String(taskId));
  results.editSavedToServer = !!storedTask && storedTask.title === EDITED && storedTask.assignee === "Tomas Brandt";

  // --- Editing also moves a task to another day ----------------------------
  await edited.locator(".task-edit").click();
  await page.waitForTimeout(200);
  await page.locator("#e-day").selectOption("sat");
  await page.locator("#editForm button[type=submit]").click();
  await page.waitForTimeout(500);
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
  await page.waitForTimeout(200);
  await page.locator("#deletePassword").fill("5879");
  await page.locator("#deleteSubmit").click();
  await page.waitForTimeout(600);
  results.deleteStillWorksAfterEdit = (await page.locator('.task-card[data-id="' + taskId + '"]').count()) === 0;
  const afterDelete = await serverBoard(page);
  results.deleteSavedToServer = !afterDelete.tasks.some(t => String(t.id) === String(taskId));

  // --- Unassigned cards are labelled ---------------------------------------
  results.unassignedCardsLabelled = await page.evaluate(() =>
    [...document.querySelectorAll(".task-card .t-assignee")]
      .every(el => el.innerText.trim().length > 0)
  );

  return results;
}
