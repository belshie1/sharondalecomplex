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

  // 4. Task removal requires the password and preserves the task on cancel
  const removableTask = page.locator(".task-card").first();
  const removableTaskId = await removableTask.getAttribute("data-id");
  const taskAfterRemoval = page.locator('.task-card[data-id="' + removableTaskId + '"]');
  await removableTask.locator(".task-delete").click();
  await page.locator("#deletePassword").fill("0000");
  await page.locator("#deleteForm button[type=submit]").click();
  results.wrongPasswordBlocked = (await taskAfterRemoval.count()) === 1 &&
    (await page.locator("#deleteError").innerText()).length > 0;
  await page.locator("#cancelDelete").click();
  results.cancelPreservesTask = (await taskAfterRemoval.count()) === 1;
  await taskAfterRemoval.locator(".task-delete").click();
  await page.locator("#deletePassword").fill("5879");
  await page.locator("#deleteForm button[type=submit]").click();
  results.correctPasswordRemovesTask = (await taskAfterRemoval.count()) === 0;

  // 5. Sidebar switches to the complaints view
  await page.setViewportSize({ width: 390, height: 844 });
  await ui.click((await ui.snapshot()).match(/(@e\d+) button "Complaints & reports \d+"/)[1]);
  await page.waitForTimeout(200);
  results.complaintsVisible = await page.locator("#view-complaints").evaluate(el => el.classList.contains("active"));
  results.phoneComplaintsNoOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
  results.phoneComplaintButtonsAreTouchSized = await page.evaluate(() =>
    [...document.querySelectorAll(".c-actions button")].slice(0, 2).every(button => {
      const rect = button.getBoundingClientRect();
      return rect.width >= 44 && rect.height >= 44;
    })
  );
  await page.setViewportSize({ width: 320, height: 568 });
  results.smallPhoneComplaintButtonsStack = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll(".c-actions button")].slice(0, 2);
    return buttons.every(button => button.getBoundingClientRect().height >= 44) &&
      buttons[0].getBoundingClientRect().top < buttons[1].getBoundingClientRect().top;
  });
  await page.setViewportSize({ width: 390, height: 844 });

  // 5. "Create task" on a complaint moves it to In progress and keeps the row count stable
  const rowsBefore = await page.locator("#complaintsList .complaint-row").count();
  await page.locator(".act-create").first().click();
  await page.waitForTimeout(200);
  results.complaintCreateTask = await page.locator("#complaintsList .status-chip").first().innerText();
  results.complaintRowCountStable = (await page.locator("#complaintsList .complaint-row").count()) === rowsBefore;
  await page.locator(".act-close").first().click();
  await page.locator(".close-note textarea").first().fill("Caretaker inspected and repaired the issue.");
  await page.locator(".act-confirm-note").first().click();
  results.complaintCloseActionWorks = (await page.locator("#complaintsList .status-chip").first().innerText()) === "Closed";

  // 6. Calendar, navigation, and document remain usable at phone, tablet, and desktop widths
  await page.locator("#mainNav .nav-item[data-view='tasks']").click();
  const viewportResults = {};
  for (const viewport of [
    { name: "phone", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    // The scroll-edge state is driven by a `scroll` listener, so it settles a
    // frame after scrollLeft changes. Wait for the real state instead of
    // asserting on the stale class left over from the previous scroll position.
    // When the calendar fits (nothing to scroll) it is permanently "at end",
    // so the start-of-scroll check only applies where scrolling is possible.
    const edgeStartsVisible = await page.evaluate(async () => {
      const scroller = document.querySelector("#calendarScroll");
      if (scroller.scrollWidth <= scroller.clientWidth) return true; // fits: no edge to show
      scroller.scrollLeft = scroller.scrollWidth;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      scroller.scrollLeft = 0;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return !scroller.classList.contains("at-end");
    });
    viewportResults[viewport.name] = await page.evaluate((edgeStartsVisible) => {
      const scroller = document.querySelector("#calendarScroll");
      scroller.scrollLeft = scroller.scrollWidth;
      const header = [...document.querySelectorAll("#boardHeader .day-head")];
      const columns = [...document.querySelectorAll("#boardBody .day-col")];
      const aligned = header.length === 7 && columns.length === 7 &&
        header.every((day, index) => Math.abs(day.getBoundingClientRect().left - columns[index].getBoundingClientRect().left) < 1);
      scroller.scrollLeft = 0;
      return {
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        allDaysAligned: aligned,
        calendarScrollsWhenNarrow: window.innerWidth > 920 || scroller.scrollWidth > scroller.clientWidth,
        calendarFitsWhenWide: window.innerWidth <= 920 || scroller.scrollWidth <= scroller.clientWidth + 1,
        narrowCalendarColumns: window.innerWidth > 640 ||
          Number.parseFloat(getComputedStyle(columns[0]).width) >= 100 &&
          Number.parseFloat(getComputedStyle(columns[0]).width) <= 110,
        focusPanelNotSticky: window.innerWidth > 920 ||
          getComputedStyle(document.querySelector(".focus-card")).position !== "sticky",
        scrollEdgeAffordance: window.innerWidth > 920 ||
          getComputedStyle(scroller.querySelector(".calendar-edge")).display !== "none",
        phoneNavFits: window.innerWidth !== 390 ||
          document.querySelector("#mainNav").scrollWidth <= document.querySelector("#mainNav").clientWidth + 1,
        phoneRemoveTargetIsTouchFriendly: window.innerWidth !== 390 ||
          document.querySelector(".task-delete").getBoundingClientRect().width >= 40,
        phoneCalendarEdgeStartsVisible: window.innerWidth !== 390 || edgeStartsVisible,
      };
    }, edgeStartsVisible);
  }
  results.responsiveLayouts = viewportResults;

  return results;
}
