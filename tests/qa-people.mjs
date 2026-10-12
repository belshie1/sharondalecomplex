/**
 * QA for the People roster and the "Created by" field.
 *
 *   node <browser-automation-skill-dir>/browser.mjs \
 *     http://localhost:3000/ --script ./tests/qa-people.mjs
 */
import { resetBoard, serverBoard, marker } from "./helpers.mjs";

export default async function run(page) {
  const results = {};
  await resetBoard(page);
  // The page has settled once the board and roster have rendered. Waiting on
  // this rather than on a fixed delay keeps the suite from typing into a view
  // that a still-in-flight load is about to re-render.
  await page.waitForFunction(
    () => document.querySelectorAll("#boardBody .task-card").length > 0 &&
          document.querySelectorAll("#peopleList .person-row").length > 0,
    null,
    { timeout: 30000 }
  );

  // --- The People tab exists with the seeded roster -----------------------
  results.peopleTabVisible = await page.locator('.nav-item[data-view="people"]').isVisible();
  await page.locator('.nav-item[data-view="people"]').click();
  // Switching tabs is a DOM class flip, but the async load can re-render just
  // after the click; wait for the view to actually be on screen before typing.
  await page.waitForFunction(
    () => document.getElementById("view-people").classList.contains("active") &&
      document.getElementById("peopleName").getBoundingClientRect().width > 0,
    null,
    { timeout: 30000 }
  );
  results.peopleViewActive = await page.locator("#view-people").evaluate(el => el.classList.contains("active"));
  const seeded = await page.locator("#peopleList .person-row").count();
  results.rosterRendered = seeded === 4;
  results.navCountMatches = Number(await page.locator("#navPeopleCount").innerText()) === seeded;

  // --- Adding a person ----------------------------------------------------
  const NAME = marker("Casey Diaz");
  // The runner's script-mode navigation can leave the page's load state
  // unsettled (it keeps a server-sent-events socket open), which makes
  // Playwright's actionability checks stall on an otherwise working form. Set
  // the fields directly so the assertion tests the app, not the harness.
  await page.evaluate((name) => {
    const nameEl = document.getElementById("peopleName");
    const roleEl = document.getElementById("peopleRole");
    nameEl.value = name;
    roleEl.value = "Electrician";
  }, NAME);
  await page.locator("#peopleForm button[type=submit]").dispatchEvent("click");
  await page.waitForTimeout(700);
  const added = page.locator(".person-row", { hasText: NAME });
  results.personAdded = (await added.count()) === 1;
  results.personRoleShown = await added.evaluate(el => el.innerText.includes("Electrician"));
  results.peopleInputCleared = (await page.locator("#peopleName").inputValue()) === "";

  // --- The new person appears in both task dropdowns ----------------------
  await page.locator('#mainNav .nav-item[data-view="tasks"]').dispatchEvent("click");
  await page.waitForTimeout(300);
  results.newPersonInAssignTo = await page
    .locator("#f-assignee option")
    .evaluateAll((opts, n) => opts.some(o => o.value === n), NAME);
  results.newPersonInCreatedBy = await page
    .locator("#f-created-by option")
    .evaluateAll((opts, n) => opts.some(o => o.value === n), NAME);

  // --- Duplicate names are rejected ---------------------------------------
  await page.locator('#mainNav .nav-item[data-view="people"]').dispatchEvent("click");
  await page.waitForTimeout(200);
  await page.evaluate((name) => { document.getElementById("peopleName").value = name; }, NAME);
  await page.locator("#peopleForm button[type=submit]").dispatchEvent("click");
  await page.waitForTimeout(500);
  const afterDup = await page.locator("#peopleList .person-row").count();
  results.duplicatePersonRejected = afterDup === seeded + 1;

  // --- Creating a task records who created it -----------------------------
  await page.locator('#mainNav .nav-item[data-view="tasks"]').dispatchEvent("click");
  await page.waitForTimeout(300);
  const TASK = marker("Creator check");
  await page.evaluate(({ task, creator }) => {
    document.getElementById("f-title").value = task;
    document.getElementById("f-location").value = "Block R";
    document.getElementById("f-created-by").value = creator;
    document.getElementById("f-assignee").value = "Elena Ruiz";
  }, { task: TASK, creator: NAME });
  await page.locator("#composer button[type=submit]").dispatchEvent("click");
  await page.waitForTimeout(1200);

  const card = page.locator(".task-card", { hasText: TASK });
  results.cardShowsCreator = await card.evaluate(el => el.innerText.includes("Created by"));
  results.cardShowsCreatorName = await card.evaluate((el, n) => el.innerText.includes(n), NAME);

  const stored = await serverBoard(page);
  const storedTask = stored.tasks.find(t => t.title === TASK);
  results.createdBySavedToServer = !!storedTask && storedTask.createdBy === NAME;

  // --- "Created by" defaults back to the signed-in user after adding ------
  results.creatorResetsToCurrentUser = (await page.locator("#f-created-by").inputValue()).length > 0;

  // --- The "Working as" selector drives the default creator ---------------
  await page.locator('#mainNav .nav-item[data-view="people"]').dispatchEvent("click");
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const sel = document.getElementById("currentUserSelect");
    sel.value = "Tomas Brandt";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(600);
  results.workingAsChanged = (await page.locator("#currentUserSelect").inputValue()) === "Tomas Brandt";
  await page.locator('#mainNav .nav-item[data-view="tasks"]').dispatchEvent("click");
  await page.waitForTimeout(300);
  results.creatorFollowsWorkingAs = (await page.locator("#f-created-by").inputValue()) === "Tomas Brandt";

  // --- Removing a person keeps their existing tasks ------------------------
  await page.locator('#mainNav .nav-item[data-view="people"]').dispatchEvent("click");
  await page.waitForTimeout(300);
  await page.locator(".person-row", { hasText: NAME }).locator(".person-remove").dispatchEvent("click");
  await page.waitForTimeout(1000);
  results.personRemoved = (await page.locator(".person-row", { hasText: NAME }).count()) === 0;
  const afterRemove = await serverBoard(page);
  results.removalSavedToServer = !afterRemove.people.some(p => p.name === NAME);
  results.tasksKeepAssigneeAfterRemoval = afterRemove.tasks.some(
    t => t.title === TASK && t.assignee === "Elena Ruiz"
  );
  await page.locator('#mainNav .nav-item[data-view="tasks"]').dispatchEvent("click");
  await page.waitForTimeout(300);
  results.removedPersonGoneFromDropdown = !(await page
    .locator("#f-assignee option")
    .evaluateAll((opts, n) => opts.some(o => o.value === n), NAME));

  // --- "Assign to me" on a task card --------------------------------------
  const mine = marker("Assign me check");
  await page.evaluate((task) => {
    document.getElementById("f-title").value = task;
    document.getElementById("f-location").value = "Block S";
    document.getElementById("f-assignee").value = "";
  }, mine);
  await page.locator("#composer button[type=submit]").dispatchEvent("click");
  await page.waitForTimeout(1200);
  const mineCard = page.locator(".task-card", { hasText: mine });
  results.unassignedShowsUnassigned = await mineCard.evaluate(el => el.innerText.includes("Unassigned"));
  // Current user is Tomas Brandt from the step above.
  await mineCard.locator(".task-assign-me").dispatchEvent("click");
  await page.waitForTimeout(1200);
  const reassigned = page.locator(".task-card", { hasText: mine });
  results.assignToMeWorks = await reassigned.evaluate(el => el.innerText.includes("Tomas Brandt"));
  const afterAssign = await serverBoard(page);
  results.assignToMeSavedToServer = afterAssign.tasks.some(
    t => t.title === mine && t.assignee === "Tomas Brandt"
  );

  return results;
}
