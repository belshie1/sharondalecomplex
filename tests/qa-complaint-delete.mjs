/**
 * Deleting complaints/reports behind the password prompt.
 *
 * The board is server-backed now, so the point of this suite is not just that
 * the row disappears from the DOM but that the deletion is persisted: a change
 * that only edited the in-memory array would reappear on the next load or live
 * sync.
 *
 *   npm test            (runs every suite via tests/run-all.mjs)
 */
import { resetBoard, serverBoard } from "./helpers.mjs";

export default async function run(page, ui) {
  const results = {};

  await resetBoard(page);
  await page.locator('.nav-item[data-view="complaints"]').dispatchEvent("click");
  await page.waitForTimeout(200);

  const rowsBefore = await page.locator("#complaintsList .complaint-row").count();
  results.seededRows = rowsBefore === 4;
  results.deleteButtonOnEveryRow = (await page.locator(".act-delete").count()) === rowsBefore;

  // Target a specific row so the assertion does not depend on ordering.
  const targetRow = page.locator('#complaintsList .complaint-row[data-id="1"]');
  results.targetRowPresent = (await targetRow.count()) === 1;
  const owner = (await targetRow.locator(".who").innerText()).trim();

  // Wrong password: the dialog stays open, shows an error, and keeps the row.
  await targetRow.locator(".act-delete").click();
  await page.locator("#deletePassword").waitFor({ state: "visible", timeout: 5000 });
  results.modalTitle = await page.locator("#deleteModalTitle").innerText();
  results.submitLabel = await page.locator("#deleteSubmit").innerText();
  await page.locator("#deletePassword").fill("0000");
  await page.locator("#deleteSubmit").click();
  await page.waitForTimeout(300);
  results.wrongPasswordBlocked = (await page.locator("#deleteError").innerText()).length > 0;
  results.modalStaysOpenOnWrongPassword = await page
    .locator("#deleteModal").evaluate((el) => el.classList.contains("open"));
  results.wrongPasswordKeepsRow = (await targetRow.count()) === 1;

  // Cancel: still no deletion.
  await page.locator("#cancelDelete").click();
  await page.waitForTimeout(200);
  results.cancelPreservesRow = (await targetRow.count()) === 1;

  // Correct password: the row goes, the counts follow, and the server agrees.
  await targetRow.locator(".act-delete").click();
  await page.locator("#deletePassword").waitFor({ state: "visible", timeout: 5000 });
  await page.locator("#deletePassword").fill("5879");
  await page.locator("#deleteSubmit").click();
  await page.waitForTimeout(400);
  results.rowRemovedFromList = (await targetRow.count()) === 0;
  results.rowCountDecreased = (await page.locator("#complaintsList .complaint-row").count()) === rowsBefore - 1;

  // Wait for the whole-board save to land, then read the server's copy. This is
  // the assertion that would catch an in-memory-only deletion.
  let persisted = false;
  for (let attempt = 0; attempt < 40 && !persisted; attempt++) {
    const board = await serverBoard(page);
    persisted = Array.isArray(board.complaints) &&
      board.complaints.length === rowsBefore - 1 &&
      !board.complaints.some((c) => c.id === 1);
    if (!persisted) await page.waitForTimeout(100);
  }
  results.deletionPersistedToServer = persisted;

  // Activity log records what was deleted. Read it before the reload below,
  // which rebuilds the in-memory feed from scratch.
  results.activityLogged = (await page.locator("#activityList").innerText()).includes(owner);

  // The deletion must also survive a reload, which is what a caretaker sees.
  await page.goto(page.url(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelectorAll("#boardBody .task-card").length > 0,
    null,
    { timeout: 20000 }
  );
  await page.locator('.nav-item[data-view="complaints"]').dispatchEvent("click");
  await page.waitForTimeout(300);
  results.rowStaysGoneAfterReload = (await page.locator('#complaintsList .complaint-row[data-id="1"]').count()) === 0;
  results.survivingRowsIntact = (await page.locator("#complaintsList .complaint-row").count()) === rowsBefore - 1;

  // The open-issue counters track the deletion. The reset fixture has four
  // complaints, all non-closed (3 open + 1 in progress), so deleting one leaves 3.
  results.navCount = await page.locator("#navComplaintCount").innerText();
  results.kpiCount = await page.locator("#kpiIssues").innerText();
  results.countersDropped = results.navCount === "3" && results.kpiCount === "3";

  // Task deletion shares the dialog and must keep its own wording and behaviour.
  await page.locator('.nav-item[data-view="tasks"]').dispatchEvent("click");
  await page.waitForTimeout(200);
  const card = page.locator(".task-card").first();
  const cardId = await card.getAttribute("data-id");
  await card.locator(".task-delete").click();
  await page.locator("#deletePassword").waitFor({ state: "visible", timeout: 5000 });
  results.taskDialogTitle = await page.locator("#deleteModalTitle").innerText();
  results.taskDialogButton = await page.locator("#deleteSubmit").innerText();
  await page.locator("#deletePassword").fill("5879");
  await page.locator("#deleteSubmit").click();
  await page.waitForTimeout(400);
  results.taskDeleteStillWorks = (await page.locator('.task-card[data-id="' + cardId + '"]').count()) === 0;

  // The extra button must not break the narrow-phone layout.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('.nav-item[data-view="complaints"]').dispatchEvent("click");
  // Wait for the rows to actually be laid out at the new width before measuring,
  // otherwise the buttons are measured mid-reflow and read as too short.
  await page.waitForFunction(
    () => {
      const buttons = [...document.querySelectorAll(".act-delete")];
      return buttons.length > 0 && buttons.every((b) => b.getBoundingClientRect().height >= 44);
    },
    null,
    { timeout: 5000 }
  ).catch(() => { });
  results.noOverflowAt320 = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
  results.deleteButtonsAreTouchSized = await page.evaluate(() =>
    [...document.querySelectorAll(".act-delete")].every((b) => b.getBoundingClientRect().height >= 44)
  );

  return results;
}