/**
 * QA for the printable PDF weekly report.
 *
 *   node <browser-automation-skill-dir>/browser.mjs \
 *     http://localhost:3000/ --script ./tests/qa-report.mjs
 */
import { resetBoard, marker } from "./helpers.mjs";

export default async function run(page) {
  const results = {};
  await resetBoard(page);

  const fixtures = await page.evaluate(async () => {
    const board = await (await fetch("/api/board")).json();
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() + (today.getDay() === 0 ? -6 : 1 - today.getDay()));
    const lastWeekCompleted = new Date(monday);
    lastWeekCompleted.setDate(lastWeekCompleted.getDate() - 3);
    const thisWeekTaskDate = new Date(monday);
    thisWeekTaskDate.setDate(thisWeekTaskDate.getDate() + 2);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const previousMonthDate = new Date(today.getFullYear(), today.getMonth(), 0);
    const dateKey = (date) => date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") +
      "-" + String(date.getDate()).padStart(2, "0");
    const lastWeekTitle = "QA last-week completion fixture";
    const thisWeekTitle = "QA this-week unfinished fixture";
    const thisMonthTitle = "QA monthly completion fixture";
    const previousMonthTitle = "QA previous-month exclusion fixture";
    board.tasks.push(
      { id: "qa-report-last-week", title: lastWeekTitle, location: "Block R", day: dateKey(lastWeekCompleted), priority: "high", assignee: "Elena Ruiz", done: true, completedOn: dateKey(lastWeekCompleted) },
      { id: "qa-report-this-week", title: thisWeekTitle, location: "Block S", day: dateKey(thisWeekTaskDate), priority: "medium", assignee: "Tomas Brandt", done: false },
      { id: "qa-report-this-month", title: thisMonthTitle, location: "Block U", day: dateKey(monthStart), priority: "low", assignee: "Elena Ruiz", done: true, completedOn: dateKey(monthStart) },
      { id: "qa-report-previous-month", title: previousMonthTitle, location: "Block V", day: dateKey(previousMonthDate), priority: "low", done: false }
    );
    let token = "";
    try { token = localStorage.getItem("sharondaleToken") || ""; } catch (e) { /* token may be baked into the page */ }
    const response = await fetch("/api/board", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Sharondale-Token": token },
      body: JSON.stringify(board)
    });
    const stored = response.ok ? await (await fetch("/api/board")).json() : null;
    return {
      status: response.status,
      completionDatePersisted: stored &&
        stored.tasks.find((task) => task.id === "qa-report-last-week").completedOn === dateKey(lastWeekCompleted),
      lastWeekTitle,
      thisWeekTitle,
      thisMonthTitle,
      previousMonthTitle
    };
  });
  results.reportFixturesSaved = fixtures.status === 200;
  results.completionDateStoredInDatabase = fixtures.completionDatePersisted === true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  // Give the report a task with a known creator so the column is exercised.
  const TASK = marker("Report row");
  await page.evaluate((task) => {
    document.getElementById("f-title").value = task;
    document.getElementById("f-location").value = "Block T";
    document.getElementById("f-created-by").value = "Elena Ruiz";
    document.getElementById("f-assignee").value = "Tomas Brandt";
  }, TASK);
  await page.evaluate(() => document.getElementById("composer").requestSubmit());
  await page.waitForTimeout(1200);

  await page.locator('.nav-item[data-view="complaints"]').dispatchEvent("click");
  await page.waitForTimeout(300);
  await page.locator("#openReportFromComplaints").dispatchEvent("click");
  await page.waitForTimeout(400);
  results.modalOpened = await page.locator("#reportModal").evaluate(el => el.classList.contains("open"));
  results.pdfButtonLabelled = (await page.locator("#downloadReport").innerText()).includes("PDF");
  results.textButtonExists = await page.locator("#downloadReportText").isVisible();
  const modalReport = await page.locator("#reportTaskSections").innerText();
  results.modalShowsLastWeekCompleted = modalReport.includes(fixtures.lastWeekTitle);
  results.modalShowsThisWeekTasks = modalReport.includes(fixtures.thisWeekTitle);
  results.modalShowsUnfinishedList = modalReport.includes("Unfinished tasks") &&
    modalReport.includes(fixtures.thisWeekTitle);
  results.lastWeekCountCorrect = (await page.locator("#rCompleted").innerText()) === "1";

  // Clicking Download PDF opens a print-ready document in a new tab.
  const ctx = page.context();
  const popupPromise = ctx.waitForEvent("page", { timeout: 15000 });
  await page.evaluate(() => document.getElementById("downloadReport").click());
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  await popup.waitForTimeout(900);

  results.reportTitle = (await popup.title()).includes("Sharondale weekly report");
  const text = await popup.evaluate(() => document.body.innerText);
  results.hasOwnTask = text.includes(TASK);
  results.hasSections = text.includes("COMPLETED LAST WEEK") &&
    text.includes("THIS WEEK'S TASKS") && text.includes("UNFINISHED TASKS") &&
    text.includes("OWNER COMPLAINTS") && text.includes("SHOPPING LIST");
  results.pdfShowsLastWeekCompleted = text.includes(fixtures.lastWeekTitle);
  results.pdfShowsUnfinishedTask = text.includes(fixtures.thisWeekTitle);
  results.hasStats = (await popup.locator(".stat").count()) === 6;
  results.hasProgressBar = (await popup.locator(".bar span").count()) === 1;
  results.groupedByDay = (await popup.locator("section.day").count()) > 0;
  results.showsCreatedBy = text.includes("CREATED BY");
  results.creatorValue = text.includes("Elena Ruiz");
  results.isPaginatedA4 = await popup.evaluate(() =>
    [...document.styleSheets].some(s => s.ownerNode &&
      s.ownerNode.textContent.includes("@page") && s.ownerNode.textContent.includes("A4")));
  results.autoprints = await popup.evaluate(() =>
    document.documentElement.innerHTML.includes("window.print()"));

  // Nothing overflows the page box at A4 width.
  await popup.setViewportSize({ width: 794, height: 1123 });
  await popup.waitForTimeout(400);
  results.noOverflowAtA4 = await popup.evaluate(() =>
    document.body.scrollWidth <= window.innerWidth + 1);

  // It really produces a valid PDF.
  await popup.pdf({ path: "/tmp/qa-report.pdf", format: "A4", printBackground: true });
  results.pdfGenerated = true;

  // The plain-text export still works for anyone who wants the figures.
  await popup.close();
  const dl = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
  await page.evaluate(() => document.getElementById("downloadReportText").click());
  const download = await dl;
  results.textExportWorks = !!download;

  await page.locator("#closeReport").click();
  await page.locator("#monthlyReportNav").click();
  await page.waitForTimeout(300);
  results.monthlyModalOpened = await page.locator("#reportModal").evaluate(el => el.classList.contains("open"));
  results.monthlyTitle = (await page.locator("#reportTitle").innerText()) === "Monthly report";
  results.monthlyRange = (await page.locator("#reportRange").innerText()).includes(String(new Date().getFullYear()));
  results.monthlyCounts = Number(await page.locator("#rCompleted").innerText()) >= 1 &&
    Number(await page.locator("#rCarried").innerText()) >= 1 &&
    Number(await page.locator("#rOverdueCount").innerText()) >= 0;
  const monthlySections = await page.locator("#reportTaskSections").innerText();
  results.monthlyIncludesCompleted = monthlySections.includes(fixtures.thisMonthTitle);
  results.monthlyExcludesPreviousMonth = !monthlySections.includes(fixtures.previousMonthTitle);

  const monthlyPopupPromise = ctx.waitForEvent("page", { timeout: 15000 });
  await page.evaluate(() => document.getElementById("downloadReport").click());
  const monthlyPopup = await monthlyPopupPromise;
  await monthlyPopup.waitForLoadState("domcontentloaded");
  await monthlyPopup.waitForTimeout(500);
  results.monthlyPdfTitle = (await monthlyPopup.title()).includes("Sharondale monthly report");
  const monthlyPdfText = await monthlyPopup.evaluate(() => document.body.innerText);
  results.monthlyPdfIncludesCompleted = monthlyPdfText.includes(fixtures.thisMonthTitle);
  results.monthlyPdfExcludesPreviousMonth = !monthlyPdfText.includes(fixtures.previousMonthTitle);
  await monthlyPopup.close();

  const monthlyDownloadPromise = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
  await page.evaluate(() => document.getElementById("downloadReportText").click());
  const monthlyDownload = await monthlyDownloadPromise;
  results.monthlyTextExportWorks = !!monthlyDownload &&
    monthlyDownload.suggestedFilename() === "sharondale-monthly-report.txt";

  return results;
}
