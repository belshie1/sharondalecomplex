import { resetBoard, marker } from "./helpers.mjs";

export default async function run(page) {
  const results = {};
  await resetBoard(page);

  const TITLE = marker("Drain");
  const EDITED = TITLE + " rear";
  await page.locator("#f-title").fill(TITLE);
  await page.locator("#f-location").fill("Block D - Courtyard");
  await page.locator("#f-assignee").selectOption("Elena Ruiz");
  await page.locator("#composer button[type=submit]").click();
  await page.waitForTimeout(400);

  const created = page.locator(".task-card", { hasText: TITLE });
  const taskId = await created.getAttribute("data-id");
  results.taskId = taskId;

  await created.locator(".task-edit").click();
  await page.waitForTimeout(250);
  await page.locator("#e-title").fill(EDITED);
  await page.locator("#e-priority").selectOption("high");
  await page.locator("#e-assignee").selectOption("Tomas Brandt");
  await page.locator("#editForm button[type=submit]").click();
  await page.waitForTimeout(500);

  const edited = page.locator('.task-card[data-id="' + taskId + '"]');
  await edited.locator(".task-edit").click();
  await page.waitForTimeout(200);
  await page.locator("#e-day").selectOption("sat");
  await page.locator("#editForm button[type=submit]").click();
  await page.waitForTimeout(500);

  // Probe the delete button state before clicking.
  results.probe = await page.evaluate((id) => {
    const card = document.querySelector('.task-card[data-id="' + id + '"]');
    if (!card) return { card: false };
    const btn = card.querySelector(".task-delete");
    const r = btn.getBoundingClientRect();
    const mid = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      card: true,
      btnRect: { x: r.x, y: r.y, w: r.width, h: r.height },
      topElClass: mid ? mid.className : null,
      topElIsBtn: mid === btn,
      scrollY: window.scrollY,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
    };
  }, taskId);

  const deleteBtn = page.locator('.task-card[data-id="' + taskId + '"] .task-delete');
  await deleteBtn.scrollIntoViewIfNeeded();
  await deleteBtn.click({ force: true, noWaitAfter: true });
  await page.waitForTimeout(400);

  results.afterClick = await page.evaluate(() => {
    const modal = document.getElementById("deleteModal");
    return {
      hasOpenClass: modal.classList.contains("open"),
      overlayDisplay: getComputedStyle(modal).display,
      activeElId: document.activeElement ? document.activeElement.id : null,
      pwVisible: !!(document.getElementById("deletePassword") &&
        document.getElementById("deletePassword").offsetParent),
    };
  });

  return results;
}
