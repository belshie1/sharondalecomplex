/**
 * The Phonebook tab: contacts with a phone number and a company, stored on the
 * server so every device sees the same numbers.
 *
 * The point of the persistence assertions is that the phonebook is a real part
 * of the board payload: a contact added here must survive a reload and a live
 * sync, not just live in the DOM until the next fetch.
 *
 *   npm test            (runs every suite via tests/run-all.mjs)
 */
import { resetBoard, serverBoard, marker } from "./helpers.mjs";

export default async function run(page, ui) {
  const results = {};

  await resetBoard(page);
  await page.locator('.nav-item[data-view="phonebook"]').dispatchEvent("click");
  await page.waitForTimeout(300);

  results.tabSwitches = await page
    .locator("#view-phonebook").evaluate((el) => el.classList.contains("active"));
  const rowsBefore = await page.locator("#phonebookList .contact-row").count();
  results.fixtureContactsShown = rowsBefore === 2;
  results.navCountMatches = (await page.locator("#navPhonebookCount").innerText()) === String(rowsBefore);

  // A contact renders with a company and a dialable number.
  const firstRow = page.locator("#phonebookList .contact-row").first();
  results.contactShowsCompany = (await firstRow.locator(".contact-meta").innerText()).includes("QA Residence");
  results.phoneIsDialable = (await firstRow.locator(".contact-phone").getAttribute("href")) === "tel:0115550100";

  // Empty submit adds nothing.
  await page.locator("#phonebookForm button[type=submit]").click();
  await page.waitForTimeout(200);
  results.emptySubmitBlocked = (await page.locator("#phonebookList .contact-row").count()) === rowsBefore;

  // A real submit adds a contact with number and company.
  const name = marker("QA Plumber");
  const company = marker("QA Co");
  const phone = "011 555 0199";
  await page.locator("#phonebookName").fill(name);
  await page.locator("#phonebookCompany").fill(company);
  await page.locator("#phonebookPhone").fill(phone);
  await page.locator("#phonebookNote").fill("After-hours callout");
  await page.locator("#phonebookForm button[type=submit]").click();
  await page.waitForTimeout(500);

  const newRow = page.locator("#phonebookList .contact-row").filter({ hasText: name });
  results.rowAdded = (await page.locator("#phonebookList .contact-row").count()) === rowsBefore + 1;
  results.newRowVisible = (await newRow.count()) === 1;
  results.newRowShowsCompany = (await newRow.locator(".contact-meta").innerText()).includes(company);
  results.newRowPhone = (await newRow.locator(".contact-phone").innerText()).trim();
  results.newRowDialable = (await newRow.locator(".contact-phone").getAttribute("href")) === "tel:0115550199";
  results.formCleared = (await page.locator("#phonebookName").inputValue()) === "" &&
    (await page.locator("#phonebookCompany").inputValue()) === "" &&
    (await page.locator("#phonebookPhone").inputValue()) === "";
  results.navCountUpdated = (await page.locator("#navPhonebookCount").innerText()) === String(rowsBefore + 1);

  // A duplicate name+number is refused rather than silently doubled.
  await page.locator("#phonebookName").fill(name);
  await page.locator("#phonebookPhone").fill(phone);
  await page.locator("#phonebookForm button[type=submit]").click();
  await page.waitForTimeout(300);
  results.duplicateRefused = (await page.locator("#phonebookList .contact-row").count()) === rowsBefore + 1;
  await page.locator("#phonebookName").fill("");
  await page.locator("#phonebookPhone").fill("");

  // It must reach the server, not just the DOM.
  let persisted = false;
  for (let attempt = 0; attempt < 40 && !persisted; attempt++) {
    const board = await serverBoard(page);
    persisted = Array.isArray(board.phonebook) &&
      board.phonebook.some((c) => c.name === name && c.company === company && c.phone === phone);
    if (!persisted) await page.waitForTimeout(100);
  }
  results.persistedToServer = persisted;

  // The activity feed records it. Read before the reload, which rebuilds the feed.
  results.activityLogged = (await page.locator("#activityList").innerText()).includes(name);

  // And it survives a reload, which is what a caretaker sees.
  await page.goto(page.url(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelectorAll("#boardBody .task-card").length > 0,
    null,
    { timeout: 20000 }
  );
  await page.locator('.nav-item[data-view="phonebook"]').dispatchEvent("click");
  await page.waitForTimeout(400);
  results.survivesReload = (await page.locator("#phonebookList .contact-row").filter({ hasText: name }).count()) === 1;
  results.contactCountAfterReload = await page.locator("#phonebookList .contact-row").count();

  // Removing a contact takes it off the server too.
  const target = page.locator("#phonebookList .contact-row").filter({ hasText: name });
  await target.locator(".contact-remove").click();
  await page.waitForTimeout(500);
  results.rowRemoved = (await page.locator("#phonebookList .contact-row").filter({ hasText: name }).count()) === 0;

  let removalPersisted = false;
  for (let attempt = 0; attempt < 40 && !removalPersisted; attempt++) {
    const board = await serverBoard(page);
    removalPersisted = Array.isArray(board.phonebook) && !board.phonebook.some((c) => c.name === name);
    if (!removalPersisted) await page.waitForTimeout(100);
  }
  results.removalPersistedToServer = removalPersisted;

  // The phonebook is independent of the roster: it must not leak into the
  // "assign to" list, which is what would happen if it were stored as people.
  results.contactsNotAssignable = await page.evaluate(() => {
    const options = [...document.querySelectorAll("#composerAssignee option")].map((o) => o.textContent);
    return !options.some((t) => t.includes("QA Plumbing") || t.includes("QA Emergency"));
  });
  results.rosterUnaffected = (await page.locator("#navPeopleCount").innerText()) === "4";

  // Narrow-phone layout must stay usable with the extra form.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(400);
  results.noOverflowAt320 = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
  results.formControlsTouchSized = await page.evaluate(() =>
    [...document.querySelectorAll(".phonebook-add input, .phonebook-add .btn")]
      .every((el) => el.getBoundingClientRect().height >= 44)
  );

  return results;
}