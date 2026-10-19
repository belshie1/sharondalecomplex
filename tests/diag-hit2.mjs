import { resetBoard } from "./helpers.mjs";

export default async function run(page) {
  const d = [];
  await resetBoard(page);

  const removableTask = page.locator(".task-card").first();
  const removableTaskId = await removableTask.getAttribute("data-id");

  const scrollProbe = await page.evaluate((id) => {
    const card = document.querySelector('.task-card[data-id="' + id + '"]');
    const btn = card.querySelector(".task-delete");
    btn.scrollIntoView({ block: "center" });
    return { ok: true };
  }, removableTaskId);

  await page.waitForTimeout(200);

  const probe = await page.evaluate((id) => {
    const card = document.querySelector('.task-card[data-id="' + id + '"]');
    const btn = card.querySelector(".task-delete");
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const t = card.querySelector(".t-title").getBoundingClientRect();
    const titleHit = document.elementFromPoint(t.x + t.width / 2, t.y + 4);
    return {
      scrollY: window.scrollY,
      viewportH: window.innerHeight,
      btnCenter: { x: cx, y: cy },
      btnInView: cy >= 0 && cy <= window.innerHeight,
      hitTag: hit && hit.tagName,
      hitClass: hit && String(hit.className),
      hitIsDelete: !!(hit && hit.closest && hit.closest(".task-delete")),
      titleHitTag: titleHit && titleHit.tagName,
      titleHitClass: titleHit && String(titleHit.className),
      titleHitIsDelete: !!(titleHit && titleHit.closest && titleHit.closest(".task-delete")),
      titleHitIsTitle: !!(titleHit && titleHit.closest && titleHit.closest(".t-title")),
      pointerEvents: getComputedStyle(card.querySelector(".t-title")).pointerEvents,
    };
  }, removableTaskId);

  d.push({ step: "after-scroll", ...probe });
  return { d };
}
