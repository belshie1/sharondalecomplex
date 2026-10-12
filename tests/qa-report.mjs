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

  // Give the report a task with a known creator so the column is exercised.
  const TASK = marker("Report row");
  await page.evaluate((task) => {
    document.getElementById("f-title").value = task;
    document.getElementById("f-location").value = "Block T";
    document.getElementById("f-created-by").value = "Elena Ruiz";
    document.getElementById("f-assignee").value = "Tomas Brandt";
  }, TASK);
  await page.locator("#composer button[type=submit]").dispatchEvent("click");
  await page.waitForTimeout(1200);

  await page.locator('.nav-item[data-view="complaints"]').dispatchEvent("click");
  await page.waitForTimeout(300);
  await page.locator("#openReportFromComplaints").dispatchEvent("click");
  await page.waitForTimeout(400);
  results.modalOpened = await page.locator("#reportModal").evaluate(el => el.classList.contains("open"));
  results.pdfButtonLabelled = (await page.locator("#downloadReport").innerText()).includes("PDF");
  results.textButtonExists = await page.locator("#downloadReportText").isVisible();

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
  results.hasSections = text.includes("TASK DETAIL") &&
    text.includes("OWNER COMPLAINTS") && text.includes("SHOPPING LIST");
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

  return results;
}
