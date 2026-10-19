import { resetBoard } from "./helpers.mjs";

export default async function run(page) {
  const d = [];
  await resetBoard(page);

  const removableTask = page.locator(".task-card").first();
  const removableTaskId = await removableTask.getAttribute("data-id");

  const probe = await page.evaluate((id) => {
    const card = document.querySelector('.task-card[data-id="' + id + '"]');
    const btn = card.querySelector(".task-delete");
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const chain = [];
    let el = hit;
    while (el && chain.length < 8) { chain.push(el.tagName + "." + (el.className || "").toString().split(" ").slice(0, 2).join(".")); el = el.parentElement; }
    return {
      btnRect: { x: r.x, y: r.y, w: r.width, h: r.height },
      hitTag: hit && hit.tagName,
      hitClass: hit && String(hit.className),
      hitIsDelete: !!(hit && hit.closest && hit.closest(".task-delete")),
      chain,
      scrollY: window.scrollY,
      viewportH: window.innerHeight,
      cardRect: (() => { const c = card.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; })(),
      titleRect: (() => { const t = card.querySelector(".t-title"); const q = t.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height }; })(),
      actionsRect: (() => { const a = card.querySelector(".t-actions"); const q = a.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height }; })(),
      titleZ: getComputedStyle(card.querySelector(".t-title")).zIndex,
      actionsZ: getComputedStyle(card.querySelector(".t-actions")).zIndex,
    };
  }, removableTaskId);

  d.push({ step: "hit-test", ...probe });
  return { d };
}
