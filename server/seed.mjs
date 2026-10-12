/**
 * Seeds a brand-new database with the same starter board the dashboard used to
 * carry in memory, so a freshly deployed backend is not an empty screen.
 * Runs only when the tasks table has no rows.
 */
import { db, isSeeded, replaceBoard } from "./db.mjs";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// Dates are resolved at seed time so the starter board always looks "this week".
function weekDates() {
  const now = new Date();
  const jsDay = now.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const iso = (d) =>
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const map = {};
  DAY_KEYS.forEach((k, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    map[k] = iso(d);
  });
  map.today = iso(now);
  return map;
}

export function seedIfEmpty() {
  if (isSeeded()) return false;
  const d = weekDates();

  replaceBoard({
    tasks: [
      { id: "seed-1", title: "Pool filter back-flush", location: "Clubhouse - Pool deck", day: d.mon, priority: "medium", assignee: "Elena Ruiz", done: true },
      { id: "seed-2", title: "Replace hallway bulb", location: "Block A - Floor 3", day: d.mon, priority: "low", assignee: "Marco Conti", done: true },
      { id: "seed-3", title: "Elevator safety check", location: "Block B - Lobby", day: d.tue, priority: "high", assignee: "Tomas Brandt", done: false },
      { id: "seed-4", title: "Irrigation timer reset", location: "Garden - Zone 2", day: d.tue, priority: "low", assignee: "", done: false },
      { id: "seed-5", title: "Fix leaking tap - unit 14", location: "Block C - Unit 14", day: d.today, priority: "high", assignee: "Tomas Brandt", done: false, photo: "gradient" },
      { id: "seed-6", title: "Gate motor lubrication", location: "Main entrance", day: d.today, priority: "medium", assignee: "Priya Nair", done: false },
      { id: "seed-7", title: "Litter sweep - car park", location: "Basement P1", day: d.today, priority: "low", assignee: "Elena Ruiz", done: true },
      { id: "seed-8", title: "Replace fire extinguisher tag", location: "Block A - Stairwell", day: d.thu, priority: "medium", assignee: "Marco Conti", done: false },
      { id: "seed-9", title: "Clean gutters - east wing", location: "Block B - Roof", day: d.fri, priority: "medium", assignee: "Priya Nair", done: false },
      { id: "seed-10", title: "Repaint parking bay lines", location: "Visitor car park", day: "", priority: "low", assignee: "", done: false },
      { id: "seed-11", title: "Order replacement bin lids", location: "Block C - Bin store", day: "", priority: "medium", assignee: "", done: false },
      { id: "seed-12", title: "Trim hedge along boundary wall", location: "Garden - North edge", day: "", priority: "low", assignee: "Elena Ruiz", done: false },
    ],
    complaints: [
      { id: 1, owner: "L. Marchetti", apt: "Block A - 12", type: "Noise complaint", age: "2 days", status: "open" },
      { id: 2, owner: "R. Novak", apt: "Block C - 04", type: "Plumbing leak", age: "5 hours", status: "open" },
      { id: 3, owner: "S. Haddad", apt: "Block B - 21", type: "Elevator fault", age: "1 day", status: "progress" },
      { id: 4, owner: "P. Dumont", apt: "Block A - 07", type: "Parking dispute", age: "3 days", status: "open" },
      { id: 5, owner: "A. Keller", apt: "Block D - 15", type: "Pest control", age: "6 days", status: "closed", note: "Technician treated unit, follow-up in 2 weeks." },
    ],
    shopping: [
      { id: 1, label: "Bin liners (heavy duty)", qty: 2, addedBy: "Marco Conti" },
      { id: 2, label: "Replacement hallway bulbs", qty: 6, addedBy: "Marco Conti" },
      { id: 3, label: "WD-40 spray", qty: 1, addedBy: "Elena Ruiz" },
      { id: 4, label: "Pool chlorine tablets", qty: 3, addedBy: "Tomas Brandt" },
    ],
    recurring: [],
  });
  return true;
}

if (process.argv[1] && process.argv[1].endsWith("seed.mjs")) {
  const did = seedIfEmpty();
  const n = db.prepare("SELECT COUNT(*) AS n FROM tasks").get().n;
  console.log(did ? `Seeded. ${n} tasks in the database.` : `Already had data (${n} tasks); left untouched.`);
}
