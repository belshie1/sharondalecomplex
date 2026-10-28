/**
 * QA for the unscheduled backlog + persistence work.
 *
 * The dashboard is server-backed, so this resets the board first and uses a
 * unique marker: tasks from an earlier run would otherwise still be present.
 *
 *   node <browser-automation-skill-dir>/browser.mjs \
 *     http://localhost:3000/ --script ./tests/qa-backlog.mjs
 */
import { resetBoard, serverBoard, marker } from "./helpers.mjs";

export default async function run(page) {
  const results = {};
  await resetBoard(page);
  const TITLE = marker("Backlog park");

  // --- Backlog exists and starts with undated tasks -----------------------
  results.backlogVisible = await page.locator("#backlogCard").isVisible();
  const backlogCount = await page.locator("#backlogList .backlog-item").count();
  results.backlogSeeded = backlogCount > 0;
  results.backlogBadgeMatches = Number(await page.locator("#backlogCount").innerText()) === backlogCount;

  // --- Creating a task with "No date" parks it in the backlog -------------
  await page.locator("#f-title").fill(TITLE);
  await page.locator("#f-location").fill("Clubhouse - Entrance");
  await page.locator("#f-assignee").selectOption("Priya Nair");
  await page.locator("#f-day").selectOption(""); // No date
  await page.locator("#composer button[type=submit]").click();
  await page.waitForTimeout(400);
  const parked = page.locator(".backlog-item", { hasText: TITLE });
  results.newTaskParkedInBacklog = (await parked.count()) === 1;
  results.parkedTaskNotOnBoard = (await page.locator("#boardBody .task-card", { hasText: TITLE }).count()) === 0;

  // --- Drag the backlog task onto a specific day --------------------------
  const taskId = await parked.getAttribute("data-id");
  await page.evaluate((title) => {
    // Simulate the HTML5 drag sequence: dragstart on the item, drop on the column.
    const item = [...document.querySelectorAll(".backlog-item")]
      .find(el => el.innerText.includes(title));
    const col = document.querySelector('.day-col[data-day]');
    const dt = new DataTransfer();
    item.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
    col.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
    col.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
  }, TITLE);
  await page.waitForTimeout(500);

  const targetDay = await page.evaluate(() => document.querySelector(".day-col").dataset.day);
  const scheduled = page.locator('.day-col[data-day="' + targetDay + '"] .task-card[data-id="' + taskId + '"]');
  results.draggedOntoBoard = (await scheduled.count()) === 1;
  results.removedFromBacklog = (await page.locator('.backlog-item[data-id="' + taskId + '"]').count()) === 0;
  results.activityLoggedSchedule = await page
    .locator("#activityList").evaluate(el => el.innerText.includes("Scheduled"));

  // --- Drag it back to Unscheduled ---------------------------------------
  await page.evaluate((id) => {
    const card = document.querySelector('.task-card[data-id="' + id + '"]');
    const list = document.querySelector("#backlogList");
    const dt = new DataTransfer();
    card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
    list.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
    list.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
  }, taskId);
  await page.waitForTimeout(500);
  results.backToBacklog = (await page.locator('.backlog-item[data-id="' + taskId + '"]').count()) === 1;

  // --- Persistence: the SERVER holds it, not just this browser -------------
  const stored = await serverBoard(page);
  results.savedToServer = stored.tasks.some(t => t.title === TITLE);
  results.saveStateShowsSaved = (await page.locator("#saveState").innerText()).trim() === "Saved";

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  results.survivesReload = (await page.locator(".backlog-item", { hasText: TITLE }).count()) === 1;
  results.boardStillPopulatedAfterReload = (await page.locator("#boardBody .task-card").count()) > 0;
  results.assigneeSurvivesReload = await page
    .locator(".backlog-item", { hasText: TITLE })
    .evaluate(el => el.innerText.includes("Priya Nair"));

  // --- A task can be scheduled on an arbitrary future date -----------------
  const FUTURE_TITLE = marker("Future dated task");
  const futureDate = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 24);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") +
      "-" + String(date.getDate()).padStart(2, "0");
  });
  await page.locator("#f-title").fill(FUTURE_TITLE);
  await page.locator("#f-location").fill("Block Z");
  await page.locator("#f-date").fill(futureDate);
  await page.locator("#composer button[type=submit]").click();
  await page.waitForTimeout(500);
  const futureTask = page.locator("#outsideWeekList .backlog-item", { hasText: FUTURE_TITLE });
  results.customDateTaskVisibleOutsideWeek = (await futureTask.count()) === 1;
  results.customDateVisible = (await futureTask.locator(".b-meta").innerText())
    .includes(String(Number(futureDate.slice(-2))));
  results.customDateSavedToServer = (await serverBoard(page)).tasks
    .some((task) => task.title === FUTURE_TITLE && task.day === futureDate);

  const updatedDate = await page.evaluate((dateValue) => {
    const date = new Date(dateValue + "T12:00:00");
    date.setDate(date.getDate() + 14);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") +
      "-" + String(date.getDate()).padStart(2, "0");
  }, futureDate);
  await futureTask.dispatchEvent("click");
  results.customDateEditModalOpens = await page.locator("#editModal.open").count() === 1;
  await page.locator("#e-date").fill(updatedDate);
  results.customDateEditInputAcceptsDate = await page.locator("#e-date").inputValue() === updatedDate;
  await page.locator("#editForm button[type=submit]").click();
  await page.waitForTimeout(500);
  results.customDateEditModalCloses = await page.locator("#editModal.open").count() === 0;
  results.customDateCanBeEdited = (await page.locator("#outsideWeekList .backlog-item", {
    hasText: FUTURE_TITLE
  }).locator(".b-meta").innerText()).includes(String(Number(updatedDate.slice(-2))));
  results.editedDateSavedToServer = (await serverBoard(page)).tasks
    .some((task) => task.title === FUTURE_TITLE && task.day === updatedDate);

  // --- A completed task stays complete across a reload ---------------------
  const firstCard = page.locator("#boardBody .task-card").first();
  await firstCard.click();
  await page.waitForTimeout(400);
  const doneCountBefore = await page.locator("#boardBody .task-card.done").count();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  results.completionPersists = (await page.locator("#boardBody .task-card.done").count()) === doneCountBefore;

  // --- Day labels still resolve to weekday names for this week -------------
  // The heading is visually uppercased by CSS, so compare case-insensitively.
  results.dayLabelsUseWeekdays = await page.locator("#boardHeader .day-head .name").evaluateAll((els) => {
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    return els.length === 7 && els.every((el, i) => el.innerText.trim().toLowerCase() === days[i]);
  });

  return results;
}
