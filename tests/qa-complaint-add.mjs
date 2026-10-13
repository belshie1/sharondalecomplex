import { resetBoard, serverBoard, marker } from "./helpers.mjs";

export default async function run(page, ui) {
  const out = {};
  await resetBoard(page);
  await page.locator('.nav-item[data-view="complaints"]').dispatchEvent("click");
  await page.waitForTimeout(300);

  const rowsBefore = await page.locator("#complaintsList .complaint-row").count();
  const navBefore = await page.locator("#navComplaintCount").innerText();
  out.rowsBefore = rowsBefore;
  out.formPresent = (await page.locator("#complaintForm").count()) === 1;

  const owner = marker("QA Owner");
  const apt = "Block Z - 99";
  const type = marker("QA Issue");

  // Empty submit must not add anything.
  await page.locator("#complaintForm button[type=submit]").click();
  await page.waitForTimeout(200);
  out.emptySubmitBlocked = (await page.locator("#complaintsList .complaint-row").count()) === rowsBefore;

  // Real submit adds a row.
  await page.locator("#complaintOwner").fill(owner);
  await page.locator("#complaintApt").fill(apt);
  await page.locator("#complaintType").fill(type);
  await page.locator("#complaintForm button[type=submit]").click();
  await page.waitForTimeout(500);

  out.rowAdded = (await page.locator("#complaintsList .complaint-row").count()) === rowsBefore + 1;
  const newRow = page.locator("#complaintsList .complaint-row").filter({ hasText: type });
  out.newRowVisible = (await newRow.count()) === 1;
  out.newRowOwner = await newRow.locator(".who").innerText();
  out.newRowApt = await newRow.locator(".apt").innerText();
  out.newRowStatus = await newRow.locator(".status-chip").innerText();
  out.newRowHasDelete = (await newRow.locator(".act-delete").count()) === 1;
  out.formCleared = (await page.locator("#complaintOwner").inputValue()) === "" &&
    (await page.locator("#complaintApt").inputValue()) === "" &&
    (await page.locator("#complaintType").inputValue()) === "";

  // Counters must pick up the new open issue.
  out.navAfter = await page.locator("#navComplaintCount").innerText();
  out.navIncreased = Number(out.navAfter) === Number(navBefore) + 1;

  // The new id must be numeric or the server will drop the row on reload.
  const newId = await newRow.getAttribute("data-id");
  out.newIdNumeric = /^\d+$/.test(newId);
  out.newId = newId;
  out.idUnique = await page.evaluate((id) =>
    [...document.querySelectorAll("#complaintsList .complaint-row")]
      .filter((r) => r.dataset.id === id).length === 1, newId);

  // It must persist to the server.
  let persisted = false;
  for (let attempt = 0; attempt < 40 && !persisted; attempt++) {
    const board = await serverBoard(page);
    persisted = Array.isArray(board.complaints) &&
      board.complaints.some((c) => c.owner === owner && c.type === type);
    if (!persisted) await page.waitForTimeout(100);
  }
  out.persistedToServer = persisted;

  // Activity log records it. Read before the reload below, which rebuilds the
  // in-memory feed from scratch.
  out.activityLogged = (await page.locator("#activityList").innerText()).includes(owner);

  // And survive a reload (this is where a non-numeric id would disappear).
  await page.goto(page.url(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelectorAll("#boardBody .task-card").length > 0,
    null,
    { timeout: 20000 }
  );
  await page.locator('.nav-item[data-view="complaints"]').dispatchEvent("click");
  await page.waitForTimeout(400);
  out.survivesReload = (await page.locator("#complaintsList .complaint-row").filter({ hasText: type }).count()) === 1;

  // The new report flows into the weekly report too.
  await page.locator("#openReportFromComplaints").dispatchEvent("click");
  await page.waitForTimeout(300);
  out.inWeeklyReportCount = Number(await page.locator("#rTotal").innerText()) > 0;
  out.openIssuesInReport = await page.locator("#rOpenIssues").innerText();
  await page.locator("#closeReport").dispatchEvent("click");
  await page.waitForTimeout(200);

  // Phone layout must not overflow with the extra form, and its controls must be
  // big enough to tap.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(400);
  out.noOverflowAt320 = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
  out.formControlsTouchSized = await page.evaluate(() =>
    [...document.querySelectorAll(".complaint-add input, .complaint-add .btn")]
      .every((el) => el.getBoundingClientRect().height >= 44)
  );

  return out;
}