/**
 * The Task requests tab: a log of work that has been reported but not yet put on
 * the board, kept in a table with an add-request button.
 *
 * The point of the persistence assertions is that the request log is a real part
 * of the board payload: a request logged here must survive a reload and reach the
 * server, not just live in the DOM until the next fetch.
 *
 *   npm test            (runs every suite via tests/run-all.mjs)
 */
import { resetBoard, serverBoard, marker } from "./helpers.mjs";

export default async function run(page) {
  const results = {};

  await resetBoard(page);
  await page.locator('.nav-item[data-view="requests"]').dispatchEvent("click");
  await page.waitForTimeout(300);

  results.tabSwitches = await page
    .locator("#view-requests").evaluate((el) => el.classList.contains("active"));

  const rowsBefore = await page.locator("#requestsList .request-row").count();
  results.fixtureRequestsShown = rowsBefore === 2;
  results.navCountMatches = (await page.locator("#navRequestCount").innerText()) === String(rowsBefore);

  // The log is a table: a header row of column labels plus one row per request.
  results.tableHasHeader = (await page.locator(".requests-head span").count()) === 7;
  results.hasAddButton = (await page.locator("#addRequestBtn").count()) === 1;
  results.addButtonLabelled = (await page.locator("#addRequestBtn").innerText()).trim().includes("Add task request");

  // A request row shows what was asked for, where, by whom, who is allocated,
  // and its status.
  const firstRow = page.locator("#requestsList .request-row").first();
  results.rowShowsTitle = (await firstRow.locator(".r-title").count()) === 1;
  results.rowShowsLocation = (await firstRow.locator(".r-loc").count()) === 1;
  results.rowShowsPriority = (await firstRow.locator(".priority-chip").count()) === 1;
  results.rowShowsAllocatedPerson = (await firstRow
    .locator('.r-assignee, [data-label="Allocated to"] .r-none').count()) === 1;
  results.rowShowsStatus = (await firstRow.locator(".status-chip.pending").count()) === 1;

  // Nothing in the log is on the board: a request only becomes a task when it is
  // moved, so the calendar and the weekly report must not count it yet.
  const fixtureTitles = await page.locator("#requestsList .request-row .r-title").allInnerTexts();
  results.requestsNotOnBoardYet = await page.evaluate((titles) => {
    const cards = [...document.querySelectorAll("#boardBody .task-card .t-title")].map((e) => e.innerText);
    return titles.every((t) => !cards.includes(t));
  }, fixtureTitles);
  results.navCountIsPendingOnly = (await page.locator("#navRequestCount").innerText()) === String(rowsBefore);

  // Empty submit adds nothing.
  await page.locator("#requestForm button[type=submit]").click();
  await page.waitForTimeout(200);
  results.emptySubmitBlocked = (await page.locator("#requestsList .request-row").count()) === rowsBefore;

  // A real submit logs a request through the add-request button.
  const title = marker("QA request replace gate remote");
  const location = "Block Q - Unit 3";
  const dueDate = await page.evaluate(() => {
    const date = new Date();
    const offset = date.getDay() === 0 ? 1 : 8 - date.getDay();
    date.setDate(date.getDate() + offset + 14);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") +
      "-" + String(date.getDate()).padStart(2, "0");
  });
  await page.locator("#requestTitle").fill(title);
  await page.locator("#requestLocation").fill(location);
  await page.locator("#requestedBy").fill("QA Owner");
  await page.locator("#requestAssignee").selectOption("Elena Ruiz");
  await page.locator("#requestDate").fill(dueDate);
  await page.locator("#requestPriority").selectOption("high");
  await page.locator("#requestNote").fill("Reported twice this week");
  await page.locator("#addRequestBtn").click();
  await page.waitForTimeout(500);

  const newRow = page.locator("#requestsList .request-row").filter({ hasText: title });
  results.rowAdded = (await page.locator("#requestsList .request-row").count()) === rowsBefore + 1;
  results.newRowVisible = (await newRow.count()) === 1;
  results.newRowShowsLocation = (await newRow.locator(".r-loc").innerText()).includes(location);
  results.newRowShowsRequester = (await newRow.locator(".r-by").innerText()).includes("QA Owner");
  results.newRowShowsAssignee = (await newRow.locator(".r-assignee").innerText()) === "Elena Ruiz";
  results.newRowShowsDueDate = (await newRow.locator(".r-date").count()) === 1;
  const dueDateLabel = await newRow.locator(".r-date").innerText();
  results.newRowShowsPriority = (await newRow.locator(".priority-chip").innerText()).trim() === "High";
  results.newRowIsPending = (await newRow.locator(".status-chip.pending").count()) === 1;
  results.formCleared = (await page.locator("#requestTitle").inputValue()) === "" &&
    (await page.locator("#requestLocation").inputValue()) === "" &&
    (await page.locator("#requestAssignee").inputValue()) === "" &&
    (await page.locator("#requestDate").inputValue()) === "";
  results.navCountUpdated = (await page.locator("#navRequestCount").innerText()) === String(rowsBefore + 1);

  // It must reach the server, not just the DOM.
  let persisted = false;
  for (let attempt = 0; attempt < 40 && !persisted; attempt++) {
    const board = await serverBoard(page);
    persisted = Array.isArray(board.requests) &&
      board.requests.some((r) => r.title === title && r.location === location &&
        r.status === "pending" && r.assignee === "Elena Ruiz" && r.day === dueDate);
    if (!persisted) await page.waitForTimeout(100);
  }
  results.persistedToServer = persisted;

  // The activity feed records it.
  results.activityLogged = (await page.locator("#activityList").innerText()).includes(title);

  // And it survives a reload, which is what a caretaker sees.
  await page.goto(page.url(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelectorAll("#boardBody .task-card").length > 0,
    null,
    { timeout: 20000 }
  );
  await page.locator('.nav-item[data-view="requests"]').dispatchEvent("click");
  await page.waitForTimeout(400);
  results.survivesReload = (await page.locator("#requestsList .request-row").filter({ hasText: title }).count()) === 1;

  // The request's arbitrary due date and allocation follow it onto the board.
  const target = page.locator("#requestsList .request-row").filter({ hasText: title });
  results.moveButtonPresent = (await target.locator(".act-move").count()) === 1;
  const outsideWeekBefore = await page.locator("#outsideWeekList .backlog-item").count();
  await target.locator(".act-move").click();
  await page.waitForTimeout(600);

  results.rowMarkedMoved = (await target.locator(".status-chip.moved").count()) === 1;
  results.moveButtonGone = (await target.locator(".act-move").count()) === 0;
  results.navCountDecremented = (await page.locator("#navRequestCount").innerText()) === String(rowsBefore);
  results.taskCreatedOnOtherDate = (await page.locator("#outsideWeekList .backlog-item").count()) === outsideWeekBefore + 1;

  // It appears in the other-dates list with its due date and allocation.
  await page.locator('.nav-item[data-view="tasks"]').dispatchEvent("click");
  await page.waitForTimeout(200);
  const backlogItem = page.locator("#outsideWeekList .backlog-item").filter({ hasText: title });
  results.taskVisibleOnOtherDate = (await backlogItem.count()) === 1;
  results.taskKeepsLocation = (await backlogItem.locator(".b-meta").innerText()).includes(location);
  results.taskKeepsDueDate = (await backlogItem.locator(".b-meta").innerText()).includes(dueDateLabel);
  results.taskKeepsAssignee = await page.evaluate((taskTitle) => {
    const card = [...document.querySelectorAll(".backlog-item")]
      .find((item) => item.querySelector(".b-title")?.innerText === taskTitle);
    return !!card && card.innerText.includes("Elena Ruiz");
  }, title);

  // The move reaches the server: the request is marked moved and the task exists.
  let movePersisted = false;
  let movedTaskOnServer = false;
  for (let attempt = 0; attempt < 40 && !movePersisted; attempt++) {
    const board = await serverBoard(page);
    const request = (board.requests || []).find((r) => r.title === title);
    movedTaskOnServer = (board.tasks || []).some((t) =>
      t.title === title && t.day === dueDate && t.assignee === "Elena Ruiz");
    movePersisted = !!request && request.status === "moved" &&
      !!request.taskId && request.day === dueDate && movedTaskOnServer;
    if (!movePersisted) await page.waitForTimeout(100);
  }
  results.movePersistedToServer = movePersisted;
  results.movedTaskKeepsDateAndAssignee = movedTaskOnServer;

  // Deleting a request takes it off the server too.
  await page.locator('.nav-item[data-view="requests"]').dispatchEvent("click");
  await page.waitForTimeout(200);
  const toDelete = page.locator("#requestsList .request-row").filter({ hasText: title });
  await toDelete.locator(".act-remove").click();
  await page.waitForTimeout(500);
  results.rowRemoved = (await page.locator("#requestsList .request-row").filter({ hasText: title }).count()) === 0;

  let removalPersisted = false;
  for (let attempt = 0; attempt < 40 && !removalPersisted; attempt++) {
    const board = await serverBoard(page);
    removalPersisted = Array.isArray(board.requests) && !board.requests.some((r) => r.title === title);
    if (!removalPersisted) await page.waitForTimeout(100);
  }
  results.removalPersistedToServer = removalPersisted;

  // The request log is independent of the board and the roster.
  results.rosterUnaffected = (await page.locator("#navPeopleCount").innerText()) === "4";

  // Narrow-phone layout must stay usable with the extra form and table.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(400);
  results.noOverflowAt320 = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
  results.formControlsTouchSized = await page.evaluate(() =>
    [...document.querySelectorAll(".requests-add input, .requests-add select, .requests-add .btn")]
      .every((el) => el.getBoundingClientRect().height >= 44)
  );

  return results;
}
