import { resetBoard } from "./helpers.mjs";

export default async function run(page) {
  const d = [];
  await resetBoard(page);

  const ui = await import("./helpers-ui.mjs").catch(() => null);
  if (ui) d.push({ step: "has-helpers-ui", val: Object.keys(ui) });

  const removableTask = page.locator(".task-card").first();
  const removableTaskId = await removableTask.getAttribute("data-id");
  d.push({ step: "target", removableTaskId });

  await page.evaluate(() => {
    window.__t = [];
    const m = document.getElementById("deleteModal");
    new MutationObserver((recs) => {
      for (const r of recs) {
        window.__t.push({ attr: r.attributeName, cls: m.className, disp: getComputedStyle(m).display });
      }
    }).observe(m, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("click", (e) => {
      const del = e.target.closest && e.target.closest(".task-delete");
      window.__t.push({ evt: "click", onDelete: !!del, cls: m.className, tag: e.target.tagName });
    }, true);
  });

  const btn = page.locator('.task-card[data-id="' + removableTaskId + '"] .task-delete');
  d.push({ step: "pre", visible: await btn.isVisible(), box: await btn.boundingBox() });

  const t0 = Date.now();
  try {
    await btn.click({ timeout: 8000 });
    d.push({ step: "click-ok", ms: Date.now() - t0 });
  } catch (e) {
    d.push({ step: "click-fail", ms: Date.now() - t0, err: String(e.message).split("\n").slice(0, 3).join(" | ") });
  }

  d.push({
    step: "modal",
    ...(await page.evaluate(() => {
      const m = document.getElementById("deleteModal");
      return { cls: m.className, disp: getComputedStyle(m).display, trace: window.__t.slice() };
    })),
  });

  return { d };
}
