(function () {
  "use strict";

  /* ---------------- Date / week setup ---------------- */
  const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const DAY_NAMES = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

  const now = new Date();
  const jsDay = now.getDay();
  const mondayOffset = (jsDay === 0) ? -6 : (1 - jsDay);
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);

  const weekDates = DAY_KEYS.map((k, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const todayKey = DAY_KEYS[(jsDay === 0 ? 6 : jsDay - 1)];

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  document.getElementById("todayLabel").textContent = WEEKDAY_FULL[jsDay] + ", " + now.getDate() + " " + MONTHS[now.getMonth()];
  const rangeText = "Mon " + weekDates[0].getDate() + " - Sun " + weekDates[6].getDate() + " " + MONTHS[weekDates[6].getMonth()] + " - Sharondale Residence";
  document.getElementById("weekRange").textContent = rangeText;
  document.getElementById("reportRange").textContent = weekDates[0].getDate() + " - " + weekDates[6].getDate() + " " + MONTHS[weekDates[6].getMonth()];

  // Stable calendar date (YYYY-MM-DD) for each weekday of the current week. Tasks
  // are stored against the real date, so a task scheduled for today stays on
  // today even after the week rolls over and the board re-labels its columns.
  const todayDate = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const UNASSIGNED_DATE = "";
  const dayDate = {};
  DAY_KEYS.forEach(function (k, i) {
    const d = weekDates[i];
    dayDate[k] = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  });
  function dayKeyFromDate(dateStr) {
    for (let i = 0; i < DAY_KEYS.length; i++) {
      if (dayDate[DAY_KEYS[i]] === dateStr) return DAY_KEYS[i];
    }
    return null;
  }
  // Human word for a stored date: a day of this week, a friendly relative label
  // for anything outside it, or "Unscheduled" when there is no date at all.
  function dateLabel(dateStr) {
    if (!dateStr) return "Unscheduled";
    const k = dayKeyFromDate(dateStr);
    if (k) return DAY_NAMES[k];
    const parts = dateStr.split("-");
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const diff = Math.round((d - now) / 86400000);
    if (diff === 0) return "Today";
    if (Math.abs(diff) <= 6) return (diff < 0 ? "Last " : "Next ") + WEEKDAY_FULL[d.getDay()];
    return d.getDate() + " " + MONTHS[d.getMonth()];
  }

  /* ---------------- Data model ---------------- */
  let uid = 100;
  const DELETE_PASSWORD = "5879";

  // The roster of people tasks can be assigned to. It comes from the server so
  // the caretaker can manage it from the People screen instead of it being a
  // constant buried in this file. "Unassigned" is an empty value, not a person.
  let people = [];
  let peopleUid = 1;
  // External contacts (contractors, suppliers, emergency numbers). Separate from
  // the roster because they are people to phone, not people to assign work to.
  let phonebook = [];
  let phonebookUid = 1;
  // Work that has been reported but not yet accepted onto the board. A request is
  // deliberately NOT a task: it does not appear on the calendar, in the counters
  // or in the weekly report until the caretaker moves it across, so logging what
  // an owner asks for never inflates the week's figures.
  let requests = [];
  let requestUid = 1;
  const UNASSIGNED = "";
  function assigneeLabel(value) {
    return value ? value : "Unassigned";
  }
  // Current signed-in caretaker, from the "working as" choice in the sidebar.
  let currentUser = "Marco Conti";

  // The boxed sample below is a placeholder for the moment before the server
  // answers. Once the server has answered, the lists hold what it holds, so boot
  // must not mistake "the server is empty" for "nothing has been loaded yet" and
  // push this sample over a real (possibly deliberately cleared) board.
  let boardLoaded = false;

  const tasks = [
    { id: uid++, title: "Pool filter back-flush", location: "Clubhouse - Pool deck", day: dayDate.mon, priority: "medium", assignee: "Elena Ruiz", done: true, photo: null, moved: null },
    { id: uid++, title: "Replace hallway bulb", location: "Block A - Floor 3", day: dayDate.mon, priority: "low", assignee: "Marco Conti", done: true, photo: null, moved: null },
    { id: uid++, title: "Elevator safety check", location: "Block B - Lobby", day: dayDate.tue, priority: "high", assignee: "Tomas Brandt", done: false, photo: null, moved: null },
    { id: uid++, title: "Irrigation timer reset", location: "Garden - Zone 2", day: dayDate.tue, priority: "low", assignee: UNASSIGNED, done: false, photo: null, moved: null },
    { id: uid++, title: "Fix leaking tap - unit 14", location: "Block C - Unit 14", day: todayDate, priority: "high", assignee: "Tomas Brandt", done: false, photo: "gradient", moved: null },
    { id: uid++, title: "Gate motor lubrication", location: "Main entrance", day: todayDate, priority: "medium", assignee: "Priya Nair", done: false, photo: null, moved: null },
    { id: uid++, title: "Litter sweep - car park", location: "Basement P1", day: todayDate, priority: "low", assignee: "Elena Ruiz", done: true, photo: null, moved: null },
    { id: uid++, title: "Replace fire extinguisher tag", location: "Block A - Stairwell", day: dayDate.thu, priority: "medium", assignee: "Marco Conti", done: false, photo: null, moved: null },
    { id: uid++, title: "Clean gutters - east wing", location: "Block B - Roof", day: dayDate.fri, priority: "medium", assignee: "Priya Nair", done: false, photo: null, moved: null },
    { id: uid++, title: "Repaint parking bay lines", location: "Visitor car park", day: UNASSIGNED_DATE, priority: "low", assignee: UNASSIGNED, done: false, photo: null, moved: null },
    { id: uid++, title: "Order replacement bin lids", location: "Block C - Bin store", day: UNASSIGNED_DATE, priority: "medium", assignee: UNASSIGNED, done: false, photo: null, moved: null },
    { id: uid++, title: "Trim hedge along boundary wall", location: "Garden - North edge", day: UNASSIGNED_DATE, priority: "low", assignee: "Elena Ruiz", done: false, photo: null, moved: null },
  ];

  const complaints = [
    { id: 1, owner: "L. Marchetti", apt: "Block A - 12", type: "Noise complaint", age: "2 days", status: "open", note: null },
    { id: 2, owner: "R. Novak", apt: "Block C - 04", type: "Plumbing leak", age: "5 hours", status: "open", note: null },
    { id: 3, owner: "S. Haddad", apt: "Block B - 21", type: "Elevator fault", age: "1 day", status: "progress", note: null },
    { id: 4, owner: "P. Dumont", apt: "Block A - 07", type: "Parking dispute", age: "3 days", status: "open", note: null },
    { id: 5, owner: "A. Keller", apt: "Block D - 15", type: "Pest control", age: "6 days", status: "closed", note: "Technician treated unit, follow-up in 2 weeks." },
  ];

  // Shopping list: supplies to pick up for the complex. Ticking an item removes
  // it, so the list only ever holds things still outstanding.
  const shopping = [
    { id: 1, label: "Bin liners (heavy duty)", qty: 2, addedBy: "Marco Conti" },
    { id: 2, label: "Replacement hallway bulbs", qty: 6, addedBy: "Marco Conti" },
    { id: 3, label: "WD-40 spray", qty: 1, addedBy: "Elena Ruiz" },
    { id: 4, label: "Pool chlorine tablets", qty: 3, addedBy: "Tomas Brandt" },
  ];
  let shoppingUid = 100;

  /* ---------------- Helpers ---------------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m];
    });
  }
  // Task ids arrive as numbers from the built-in seed data but as strings from
  // the server ("seed-1"), so every lookup must compare them loosely rather than
  // coercing the DOM id with Number(), which turns "seed-1" into NaN.
  function findTask(id) {
    return tasks.find(function (t) { return String(t.id) === String(id); });
  }
  function toast(msg) {
    const stack = document.getElementById("toastStack");
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg><span>' + escapeHtml(msg) + '</span>';
    stack.appendChild(el);
    setTimeout(function () { el.classList.add("leaving"); setTimeout(function () { el.remove(); }, 260); }, 2800);
  }
  const STORAGE_KEY = "sharondaleBoardData";
  let recurringTasks = [];

  // ---- Durable store ----------------------------------------------------
  // The board lives in a real backend now, not in this browser. Two layers:
  //   * the server (server/index.mjs + SQLite) is the source of truth and is
  //     shared by every device,
  //   * a localStorage snapshot is kept purely as an offline cache so the
  //     dashboard still opens and stays usable when the API is unreachable.
  // Nothing here is destructive: a failed read falls back to the cache, and a
  // failed write keeps the change locally and retries.
  const API_BASE = (window.SHARONDALE_API || "/api").replace(/\/+$/, "");
  // The write token authorises changes. It comes from a value baked into the
  // page if the operator chose that, otherwise from this browser's storage once
  // the caretaker has entered it. Keeping it out of the repo means the key is
  // not sitting in the page source for anyone to copy.
  const TOKEN_KEY = "sharondaleToken";
  let writeToken = "";
  function readStoredToken() {
    if (window.SHARONDALE_TOKEN) return window.SHARONDALE_TOKEN;
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function storeToken(value) {
    writeToken = value;
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* private mode: works for this session, just not remembered */ }
  }
  writeToken = readStoredToken();
  // Set once the server refuses a write for lack of authorisation, so the UI can
  // offer the unlock prompt instead of silently failing to save.
  let needsToken = false;
  let serverReachable = null; // null = unknown yet
  let pendingSync = false;    // local changes not yet confirmed by the server
  let syncTimer = null;
  // True from the moment the API has been tried and found to be a static host -
  // a page served by GitHub Pages, S3 or any CDN. The board on screen is then the
  // sample from this file, not data, and must be labelled as such.
  let backendMissing = false;

  function isValidTask(t) {
    return t && (typeof t.id === "number" || typeof t.id === "string") &&
      typeof t.title === "string" && typeof t.location === "string" &&
      (t.day === UNASSIGNED_DATE || typeof t.day === "string") &&
      ["low", "medium", "high"].indexOf(t.priority) !== -1 &&
      typeof t.done === "boolean";
  }
  function isValidComplaint(c) {
    return c && typeof c.id === "number" && typeof c.owner === "string" &&
      ["open", "progress", "closed"].indexOf(c.status) !== -1;
  }
  function isValidShoppingItem(i) {
    return i && typeof i.id === "number" && typeof i.label === "string" &&
      i.label.trim().length > 0;
  }
  // A request id is either a string ("r-1" from the seed) or a number, and an
  // unrecognised status would hide the row from both the pending and the moved
  // list, so both are checked before the row is allowed onto the screen.
  function isValidRequest(r) {
    return r && (typeof r.id === "number" || typeof r.id === "string") &&
      typeof r.title === "string" && r.title.trim().length > 0 &&
      typeof r.location === "string" &&
      ["low", "medium", "high"].indexOf(r.priority) !== -1 &&
      ["pending", "moved"].indexOf(r.status) !== -1;
  }
  function normalizeRequest(r) {
    return {
      id: r.id, title: r.title, location: r.location, priority: r.priority,
      requestedBy: typeof r.requestedBy === "string" ? r.requestedBy : "",
      note: typeof r.note === "string" ? r.note : "",
      status: r.status, taskId: r.taskId === undefined ? null : r.taskId
    };
  }
  // A chip reading "high" is easier to scan than a bare word in a table cell.
  function priorityLabel(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  function normalizeTask(t) {
    return {
      id: t.id, title: t.title, location: t.location,
      day: typeof t.day === "string" ? t.day : UNASSIGNED_DATE,
      priority: t.priority,
      assignee: typeof t.assignee === "string" ? t.assignee : UNASSIGNED,
      done: !!t.done, photo: t.photo || null, moved: t.moved || null,
      recurring: !!t.recurring, recurringId: t.recurringId || null
    };
  }
  // Serialise what the server expects. Recurring templates travel with the
  // board so every device re-applies the same weekly tasks. The roster travels
  // with it too: without `people` here, adding someone only changed this tab,
  // and the next live-sync event replaced the list with the server's copy and
  // the new person vanished.
  function boardPayload() {
    return {
      tasks: tasks,
      complaints: complaints,
      shopping: shopping,
      recurring: recurringTasks,
      people: people,
      phonebook: phonebook,
      requests: requests
    };
  }

  // The offline cache is a convenience only: it lets the dashboard open and
  // stay usable when the API cannot be reached. It is never the source of truth.
  // A page that has proved it has no backend must not write one: the cache
  // outlives the visit, so a later, correctly deployed page would load this
  // sample board as "the last saved copy" and pass it off as data.
  function writeCache() {
    if (backendMissing) return;
    // Saving locally while the server has refused the write for lack of the
    // access code is what makes a locked page look "Saved" after a reload.
    if (needsToken || saveState === "locked") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, cachedAt: Date.now(), ...boardPayload() }));
    } catch (error) {
      /* a full or disabled localStorage must not break saving to the server */
    }
  }
  function readCache() {
    if (backendMissing) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tasks)) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  // Hoisted on purpose: the board can be pushed to the server during boot, which
  // runs before the modal wiring further down this file, and a refused write at
  // that point still has to offer the prompt instead of throwing.
  function offerUnlock() {
    if (unlockOffered) return;
    unlockOffered = true;
    const modal = document.getElementById("tokenModal");
    if (!modal) return;
    const error = document.getElementById("tokenError");
    const input = document.getElementById("tokenInput");
    if (error) error.textContent = "";
    if (input) input.value = "";
    modal.classList.add("open");
    if (input) input.focus();
  }

  function api(path, options) {
    const opts = options || {};
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (writeToken) headers["X-Sharondale-Token"] = writeToken;
    return fetch(API_BASE + path, Object.assign({}, opts, { headers }));
  }

  // Push the whole board to the server. The dashboard treats the task list as a
  // unit, so a single whole-board write cannot half-apply a drag or a tick.
  async function saveBoardData() {
    writeCache();
    setSaveState("saving");
    try {
      const res = await api("/board", {
        method: "PUT",
        body: JSON.stringify(boardPayload())
      });
      if (res.status === 401) {
        // The server wants an access code. This is not a lost change and not a
        // network problem, so it gets its own state and the unlock prompt.
        needsToken = true;
        serverReachable = true;
        pendingSync = false;
        setSaveState("locked");
        offerUnlock();
        return false;
      }
      if (!res.ok) {
        const detail = await res.json().catch(function () { return {}; });
        throw new Error(detail.error || ("HTTP " + res.status));
      }
      needsToken = false;
      serverReachable = true;
      backendMissing = false;
      pendingSync = false;
      setSaveState("saved");
      return true;
    } catch (error) {
      // Keep the change (it is already in the cache) and retry shortly rather
      // than telling the caretaker their work was lost.
      serverReachable = false;
      pendingSync = true;
      setSaveState("offline");
      scheduleRetry();
      return false;
    }
  }

  // The one honest statement a page with no backend can make: there is no data
  // on screen and nothing typed here is kept anywhere. It is shown as soon as an
  // /api call proves there is no API behind the page, so a static host can never
  // again look like a working deployment.
  function renderSyncBanner() {
    const el = document.getElementById("syncBanner");
    if (!el) return;
    if (!backendMissing) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = "";
    const title = document.createElement("strong");
    title.textContent = "This page has no backend - the board is empty and nothing is saved.";
    const body = document.createElement("span");
    body.textContent =
      "No API answered at " + API_BASE + ", so this board holds no data and anything " +
      "added to it is lost on reload and invisible to other devices. This happens when " +
      "only the dashboard is published (for example to GitHub Pages). Point the page " +
      "at a running backend by setting window.SHARONDALE_API before app.js loads - " +
      "see DEPLOY.md.";
    el.appendChild(title);
    el.appendChild(body);
  }

  // With no backend, a form submit must not add a row and then say "Task added
  // to the board": that row is gone on reload. The submit is stopped before
  // the form's own handler runs (the capture phase), so nothing is added.
  function blockWithoutBackend(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener("submit", function (e) {
      if (!backendMissing) return;
      // preventDefault alone is not enough: a form's own listener still runs
      // and still toasts "added", so nothing after this point may hear it.
      e.preventDefault();
      e.stopImmediatePropagation();
      renderSyncBanner();
      toast("Nothing is saved here: this page has no backend.");
    }, true);
  }
  ["composer", "complaintForm", "requestForm", "shoppingForm", "peopleForm", "phonebookForm"]
    .forEach(blockWithoutBackend);

  function scheduleRetry() {
    if (syncTimer) return;
    // A page with no backend at all has nothing to retry against, and a timer
    // that fires every five seconds against a static host is pure noise.
    if (backendMissing) return;
    syncTimer = setTimeout(function () {
      syncTimer = null;
      if (pendingSync) syncNow();
    }, 5000);
  }

  async function syncNow() {
    const ok = await saveBoardData();
    if (ok && pendingSync === false) renderSyncBanner();
    return ok;
  }

  async function loadBoardData() {
    try {
      const res = await api("/board", { method: "GET" });
      // A static host answers /api/board with its own 404 page, usually as HTML.
      // That is not "the server is briefly down" - there is no server - so it is
      // reported separately from the retryable offline state.
      if ((res.status === 404 || res.status === 405) ||
          !(res.headers.get("content-type") || "").includes("application/json")) {
        // Show the banner now rather than after the caller gets around to it:
        // writeCache() refuses to run while this is set, and loadBoardData is
        // awaited before anything else touches storage.
        backendMissing = true;
        serverReachable = false;
        renderSyncBanner();
        return null;
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      backendMissing = false;
      const board = await res.json();
      serverReachable = true;
      pendingSync = false;
      return {
        tasks: (board.tasks || []).filter(isValidTask).map(normalizeTask),
        complaints: (board.complaints || []).filter(isValidComplaint),
        shopping: (board.shopping || []).filter(isValidShoppingItem),
        recurring: board.recurring || [],
        people: board.people || [],
        phonebook: board.phonebook || [],
        requests: (board.requests || []).filter(isValidRequest).map(normalizeRequest)
      };
    } catch (error) {
      serverReachable = false;
      // A real 404/405 or HTML answer above means there is no backend, so the
      // fetch above never threw for that case - only an unreachable one lands
      // here. Fall back to the offline cache so the dashboard still opens.
      const cached = readCache();
      if (!cached) {
        toast("Cannot reach the server and no offline copy exists: " + error.message);
        return null;
      }
      toast("Working offline - showing the last saved copy");
      return {
        tasks: (cached.tasks || []).filter(isValidTask).map(normalizeTask),
        complaints: (cached.complaints || []).filter(isValidComplaint),
        shopping: (cached.shopping || []).filter(isValidShoppingItem),
        recurring: cached.recurring || [],
        people: cached.people || [],
        phonebook: cached.phonebook || [],
        requests: (cached.requests || []).filter(isValidRequest).map(normalizeRequest)
      };
    }
  }
  function saveRecurringTasks(updatedTasks) {
    try {
      recurringTasks = updatedTasks;
      // Recurring templates travel with the board, so a single whole-board
      // write persists them; no separate request is needed.
      saveBoardData();
      return true;
    } catch (error) {
      toast("Could not save weekly task: " + error.message);
      return false;
    }
  }

  // Apply the server's recurring templates as fresh tasks for this week. They
  // are ephemeral (never stored as ordinary tasks) so each week starts clean.
  function applyRecurringTasks() {
    recurringTasks.forEach(function (task) {
      const exists = tasks.some(function (t) {
        return t.recurring && t.recurringId === task.id && t.day === dayDate[task.day];
      });
      if (exists) return;
      tasks.push({
        id: uid++,
        title: task.title,
        location: task.location,
        day: dayDate[task.day] || UNASSIGNED_DATE,
        priority: task.priority,
        assignee: typeof task.assignee === "string" ? task.assignee : UNASSIGNED,
        done: false,
        photo: null,
        moved: null,
        recurring: true,
        recurringId: task.id
      });
    });
  }
  function timeNow() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  let activityLog = [];
  let saveState = "saving";
  function setSaveState(state) {
    saveState = state;
    const el = document.getElementById("saveState");
    if (!el) return;
    // A static host does not make the chip "offline": it is not coming back,
    // so promising a retry would be the same lie as the sample board. Say once,
    // plainly, that nothing is kept.
    const noBackend = state === "offline" && backendMissing;
    el.classList.toggle("saving", state === "saving");
    el.classList.toggle("offline", state === "offline");
    el.classList.toggle("locked", state === "locked");
    el.classList.toggle("error", state === "error");
    el.textContent =
      noBackend ? "No backend - nothing saved" :
      state === "saving" ? "Saving..." :
      state === "offline" ? "Offline - will retry" :
      state === "locked" ? "Locked - enter code" :
      state === "error" ? "Could not save" : "Saved";
    el.title =
      noBackend ? "There is no server behind this page, so nothing here is saved and a reload discards it." :
      state === "saving" ? "Contacting the server to save the board." :
      state === "offline" ? "The server is unreachable. Your change is kept here and will be sent when it comes back." :
      state === "locked" ? "You can browse, but changes need the access code. Click to enter it." :
      state === "error" ? "The board could not be saved." :
      "Your board is saved on the server and shared with every device.";
  }

  /* ---------------- Access code (write token) ---------------- */
  // The board is readable by anyone with the link, but changing it needs the
  // code the operator set on the server. The code lives in this browser only.
  const tokenModal = document.getElementById("tokenModal");
  const tokenForm = document.getElementById("tokenForm");
  const tokenInput = document.getElementById("tokenInput");
  const tokenError = document.getElementById("tokenError");

  function openTokenModal() {
    tokenError.textContent = "";
    tokenInput.value = "";
    tokenModal.classList.add("open");
    tokenInput.focus();
  }
  function closeTokenModal() { tokenModal.classList.remove("open"); }

  // Only interrupt the caretaker once: after the first refusal the header chip
  // carries the state, and clicking it reopens the prompt.
  let unlockOffered = false;

  async function verifyAndStoreToken(candidate) {
    const previous = writeToken;
    writeToken = candidate;
    try {
      const res = await api("/board", {
        method: "PUT",
        body: JSON.stringify(boardPayload())
      });
      if (res.status === 401) {
        writeToken = previous;
        return false;
      }
      if (!res.ok) {
        writeToken = previous;
        throw new Error("HTTP " + res.status);
      }
      storeToken(candidate);
      needsToken = false;
      serverReachable = true;
      pendingSync = false;
      setSaveState("saved");
      return true;
    } catch (error) {
      writeToken = previous;
      throw error;
    }
  }

  tokenForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const candidate = tokenInput.value.trim();
    if (!candidate) return;
    tokenError.textContent = "Checking...";
    try {
      const ok = await verifyAndStoreToken(candidate);
      if (!ok) {
        tokenError.textContent = "That code was not accepted. Try again.";
        tokenInput.select();
        return;
      }
      closeTokenModal();
      logActivity("Unlocked this browser for editing");
      toast("Unlocked - you can now make changes");
      renderAll();
      renderComplaints();
      renderRequests();
      renderShopping();
      renderPeople();
      renderPhonebook();
    } catch (error) {
      tokenError.textContent = "Could not reach the server: " + error.message;
    }
  });

  document.getElementById("cancelToken").addEventListener("click", function () {
    closeTokenModal();
    toast("Browsing read-only");
  });
  tokenModal.addEventListener("click", function (e) {
    if (e.target === tokenModal) closeTokenModal();
  });
  document.getElementById("saveState").addEventListener("click", function () {
    if (needsToken || saveState === "locked") openTokenModal();
  });

  // Persist on every meaningful interaction, and once more if the tab is
  // closed mid-change so nothing is lost.
  function markSaving() { setSaveState("saving"); saveBoardData(); }
  window.addEventListener("beforeunload", function () { writeCache(); });
  function logActivity(text) {
    activityLog.unshift({ text: text, time: timeNow() });
    activityLog = activityLog.slice(0, 12);
    renderActivity();
  }
  function renderActivity() {
    const list = document.getElementById("activityList");
    list.innerHTML = activityLog.map(function (a) {
      return '<div class="activity-item"><span class="a-dot"></span><div><span class="a-text">' + escapeHtml(a.text) + '</span><span class="a-time">' + a.time + '</span></div></div>';
    }).join("");
  }

  /* ---------------- Render: board header ---------------- */
  function renderBoardHeader() {
    const el = document.getElementById("boardHeader");
    el.innerHTML = DAY_KEYS.map(function (k, i) {
      const d = weekDates[i];
      const count = tasks.filter(function (t) { return t.day === dayDate[k]; }).length;
      return '<div class="day-head ' + (k === todayKey ? 'today' : '') + '">' +
        '<span class="name">' + DAY_NAMES[k] + '</span>' +
        '<span class="marker"></span>' +
        '<span class="num">' + d.getDate() + '</span>' +
        '<span class="task-count ' + (count === 0 ? 'zero' : '') + '">' + count + ' task' + (count === 1 ? '' : 's') + '</span>' +
        '</div>';
    }).join("");
  }

  /* ---------------- Render: board body ---------------- */
  function taskCardHtml(t) {
    const thumb = t.photo ? ('<div class="t-thumb">' + (t.photo && t.photo !== "gradient" ? ('<img src="' + t.photo + '" alt="">') : "") + '</div>') : "";
    return '<div class="task-card priority-' + t.priority + ' ' + (t.done ? 'done' : '') + '" draggable="true" data-id="' + t.id + '" tabindex="0">' +
      '<span class="drag-handle"><svg class="icon" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg></span>' +
      '<div class="t-top"><span class="status-dot"></span><div style="min-width:0;">' +
      '<div class="t-title">' + escapeHtml(t.title) + '</div>' +
      '<div class="t-loc"><svg class="icon" viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/></svg>' + escapeHtml(t.location) + '</div>' +
      '</div></div>' +
      thumb +
      '<div class="t-assignee' + (t.assignee ? "" : " unassigned") + '">' +
        '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"/></svg>' +
        '<span>' + escapeHtml(assigneeLabel(t.assignee)) + '</span>' +
      '</div>' +
      (t.createdBy ? '<div class="t-creator">Created by ' + escapeHtml(t.createdBy) + '</div>' : "") +
      '<div class="t-meta"><span class="t-pill">' + (t.priority[0].toUpperCase() + t.priority.slice(1)) + ' priority</span>' +
      (t.recurring ? '<span class="t-recurring">Weekly</span>' : "") +
      (t.moved ? ('<span class="t-moved">Moved from ' + dateLabel(t.moved) + '</span>') : "") +
      '<span class="t-actions">' +
      (currentUser && t.assignee !== currentUser
        ? '<button type="button" class="task-assign-me" title="Assign this task to ' + escapeHtml(currentUser) + '">' +
          '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"/></svg>' +
          '<span class="sr-label">Assign to me</span></button>'
        : "") +
      '<button type="button" class="task-edit" aria-label="Edit ' + escapeHtml(t.title) + '" title="Edit task"><svg class="icon" viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/></svg></button>' +
      '<button type="button" class="task-delete" aria-label="Remove ' + escapeHtml(t.title) + '" title="Remove task"><svg class="icon" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button>' +
      '</span>' +
      '</div></div>';
  }

  function renderBoardBody() {
    const el = document.getElementById("boardBody");
    el.innerHTML = DAY_KEYS.map(function (k) {
      const dayTasks = tasks.filter(function (t) { return t.day === dayDate[k]; });
      return '<div class="day-col ' + (dayTasks.length === 0 ? 'is-empty' : '') + '" data-day="' + dayDate[k] + '">' + dayTasks.map(taskCardHtml).join("") + '</div>';
    }).join("");
    attachCardEvents();
    attachColumnEvents();
  }

  /* ---------------- Render: unscheduled backlog ---------------- */
  function renderBacklog() {
    const list = document.getElementById("backlogList");
    if (!list) return;
    const backlog = tasks.filter(function (t) { return !t.day; }).sort(function (a, b) {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.priority] - rank[b.priority];
    });
    document.getElementById("backlogCount").textContent = backlog.length;
    list.classList.toggle("drag-over", false);
    if (backlog.length === 0) {
      list.innerHTML = '<p class="backlog-empty">Everything is scheduled. Add a task without a date to park it here.</p>';
      return;
    }
    list.innerHTML = backlog.map(function (t) {
      return '<div class="backlog-item priority-' + t.priority + '" draggable="true" data-id="' + t.id + '" tabindex="0" ' +
        'role="button" aria-label="' + escapeHtml(t.title) + ', unscheduled. Drag onto a day to schedule it.">' +
        '<span class="drag-handle"><svg class="icon" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg></span>' +
        '<span class="status-dot"></span>' +
        '<div class="b-body">' +
        '<div class="b-title">' + escapeHtml(t.title) + '</div>' +
        '<div class="b-meta">' + escapeHtml(t.location) + ' · ' + escapeHtml(assigneeLabel(t.assignee)) + '</div>' +
        '</div>' +
        '</div>';
    }).join("");
    attachBacklogEvents();
  }

  /* ---------------- Counters & focus panel ---------------- */
  // The KPI cards that used to sit above the calendar are gone, but the counts
  // they showed still drive the sidebar badge, the bell, and the focus panel.
  function renderKpis() {
    // A board that is known to have no backend has no figures: a "1 / 3 tasks
    // completed today" ring is exactly the sort of number that gets trusted.
    if (backendMissing) {
      document.getElementById("ringFg").setAttribute("stroke-dashoffset", "999");
      document.getElementById("ringValue").textContent = "—";
      ["legendHigh", "legendMed", "legendLow"].forEach(function (id) {
        document.getElementById(id).textContent = "—";
      });
      return;
    }
    const todays = tasks.filter(function (t) { return t.day === todayDate; });
    const todayDone = todays.filter(function (t) { return t.done; }).length;
    const openIssues = complaints.filter(function (c) { return c.status !== "closed"; }).length;

    // With no backend there is nothing to count: leave the badges blank rather
    // than asserting "0 open issues", which is just as wrong as the sample.
    const badge = backendMissing ? "" : openIssues;
    document.getElementById("navComplaintCount").textContent = badge;
    document.getElementById("bellBadge").textContent = badge;
    document.getElementById("bellBtn").title = backendMissing
      ? "This page has no backend - no issues to show"
      : openIssues + " unresolved issue" + (openIssues === 1 ? "" : "s");

    const pct = todays.length ? Math.round((todayDone / todays.length) * 100) : 0;
    const circumference = 2 * Math.PI * 33;
    const ring = document.getElementById("ringFg");
    ring.setAttribute("stroke-dasharray", circumference.toFixed(1));
    ring.setAttribute("stroke-dashoffset", (circumference * (1 - pct / 100)).toFixed(1));
    document.getElementById("ringValue").textContent = todayDone + " / " + todays.length;

    document.getElementById("legendHigh").textContent = tasks.filter(function (t) { return t.priority === "high" && !t.done; }).length;
    document.getElementById("legendMed").textContent = tasks.filter(function (t) { return t.priority === "medium" && !t.done; }).length;
    document.getElementById("legendLow").textContent = tasks.filter(function (t) { return t.priority === "low" && !t.done; }).length;
  }

  function renderAll() {
    renderBoardHeader();
    renderBoardBody();
    renderBacklog();
    renderKpis();
    updateCalendarScrollState();
    // The chip depends on backendMissing, which is only known after the first
    // API call - by then something has usually already set it to "saving".
    setSaveState(saveState);
  }

  const calendarScroll = document.getElementById("calendarScroll");
  function updateCalendarScrollState() {
    // The seven-day board needs a usable minimum column width. When the board is
    // too narrow to honour it the grid overflows horizontally: then, and only
    // then, show the scroll-edge affordance. It was previously tied to the
    // phone breakpoint, which hid the clipped desktop columns behind a hint
    // that never appeared.
    calendarScroll.classList.toggle("overflows",
      calendarScroll.scrollWidth > calendarScroll.clientWidth + 1);
    calendarScroll.classList.toggle("at-end",
      calendarScroll.scrollLeft + calendarScroll.clientWidth >= calendarScroll.scrollWidth - 2);
  }
  calendarScroll.addEventListener("scroll", updateCalendarScrollState, { passive: true });
  window.addEventListener("resize", updateCalendarScrollState);

  /* ---------------- Drag & drop + completion toggle ---------------- */
  let dragId = null;
  let dragMoved = false;

  function attachCardEvents() {
    document.querySelectorAll(".task-card").forEach(function (card) {
      card.addEventListener("dragstart", function (e) {
        dragId = card.dataset.id;
        dragMoved = false;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", function () {
        card.classList.remove("dragging");
      });
      card.addEventListener("click", function (e) {
        // The whole actions row is dead space: a click on its padding between the
        // buttons used to fall through to the card, toggle the task and re-render
        // the board, destroying the very button the caretaker was aiming for.
        if (dragMoved || e.target.closest(".t-actions")) return;
        const t = findTask(card.dataset.id);
        if (!t) return;
        t.done = !t.done;
        logActivity((t.done ? "Completed" : "Reopened") + " \"" + t.title + "\"");
        markSaving();
        renderAll();
      });
      card.addEventListener("keydown", function (e) {
        if (e.target.closest(".t-actions")) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          card.click();
        }
      });
      card.querySelector(".task-edit").addEventListener("click", function (e) {
        e.stopPropagation();
        const task = findTask(card.dataset.id);
        if (task) openEditModal(task);
      });
      const assignMe = card.querySelector(".task-assign-me");
      if (assignMe) {
        assignMe.addEventListener("click", function (e) {
          e.stopPropagation();
          const task = findTask(card.dataset.id);
          if (!task || !currentUser) return;
          const previous = task.assignee;
          task.assignee = currentUser;
          logActivity("Assigned \"" + task.title + "\" to " + currentUser +
            (previous ? " (was " + previous + ")" : ""));
          toast("Assigned to " + currentUser);
          markSaving();
          renderAll();
        });
      }
      card.querySelector(".task-delete").addEventListener("click", function (e) {
        e.stopPropagation();
        const task = findTask(card.dataset.id);
        if (task) requestTaskRemoval(task);
      });
    });
  }

  // Unscheduled tasks live in the sidebar and are dragged onto a day column.
  // They keep the same id, so the drag-and-drop wiring is shared with the board.
  function attachBacklogEvents() {
    document.querySelectorAll(".backlog-item").forEach(function (item) {
      item.addEventListener("dragstart", function (e) {
        dragId = item.dataset.id;
        dragMoved = false;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      item.addEventListener("dragend", function () {
        item.classList.remove("dragging");
      });
      // Keyboard/touch fallback: open the item for editing.
      item.addEventListener("click", function () {
        const t = findTask(item.dataset.id);
        if (t) openEditModal(t);
      });
      item.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          item.click();
        }
      });
    });
  }

  const deleteModal = document.getElementById("deleteModal");
  const deleteForm = document.getElementById("deleteForm");
  const deletePassword = document.getElementById("deletePassword");
  const deleteError = document.getElementById("deleteError");
  const deleteModalTitle = document.getElementById("deleteModalTitle");
  const deleteSubmit = document.getElementById("deleteSubmit");
  const deleteDescription = deleteModal.querySelector(".delete-description");
  let pendingDeleteTaskId = null;
  let pendingDeleteComplaintId = null;

  function openDeleteModal(description, focusTitle, focusAction, target) {
    pendingDeleteTaskId = target && target.type === "task" ? target.id : null;
    pendingDeleteComplaintId = target && target.type === "complaint" ? target.id : null;
    deleteModalTitle.textContent = focusTitle;
    deleteSubmit.textContent = focusAction;
    deleteDescription.textContent = description;
    deletePassword.value = "";
    deleteError.textContent = "";
    deleteModal.classList.add("open");
    deletePassword.focus();
  }

  function requestTaskRemoval(task) {
    openDeleteModal(
      task.recurring
        ? 'Remove "' + task.title + '" and stop it from repeating every week?'
        : 'Remove "' + task.title + '" from this week’s board?',
      "Confirm task removal",
      "Remove task",
      { type: "task", id: task.id }
    );
  }

  function requestComplaintRemoval(complaint) {
    openDeleteModal(
      'Delete the report from ' + complaint.owner + ' (' + complaint.type + ')? This cannot be undone.',
      "Confirm report deletion",
      "Delete report",
      { type: "complaint", id: complaint.id }
    );
  }

  function closeDeleteModal() {
    deleteModal.classList.remove("open");
    deleteForm.reset();
    deleteError.textContent = "";
    pendingDeleteTaskId = null;
    pendingDeleteComplaintId = null;
  }

  function removeTask(taskId) {
    const taskIndex = tasks.findIndex(function (task) { return task.id === taskId; });
    if (taskIndex === -1) return;
    const task = tasks[taskIndex];
    if (task.recurring && task.recurringId) {
      const updatedRecurringTasks = recurringTasks.filter(function (template) {
        return template.id !== task.recurringId;
      });
      if (!saveRecurringTasks(updatedRecurringTasks)) return;
    }
    tasks.splice(taskIndex, 1);
    logActivity("Removed \"" + task.title + "\"");
    toast(task.recurring ? "Weekly task removed" : "Task removed from this week");
    markSaving();
    renderAll();
  }

  function removeComplaint(complaintId) {
    const complaintIndex = complaints.findIndex(function (c) { return c.id === complaintId; });
    if (complaintIndex === -1) return;
    const complaint = complaints[complaintIndex];
    complaints.splice(complaintIndex, 1);
    logActivity("Deleted " + complaint.owner + "'s report (" + complaint.type + ")");
    toast("Report deleted");
    markSaving();
    renderComplaints();
    renderAll();
  }

  function submitDelete() {
    if (deletePassword.value !== DELETE_PASSWORD) {
      deleteError.textContent = "Incorrect password. Nothing was deleted.";
      deletePassword.select();
      return;
    }
    const taskId = pendingDeleteTaskId;
    const complaintId = pendingDeleteComplaintId;
    closeDeleteModal();
    if (taskId !== null) removeTask(taskId);
    else if (complaintId !== null) removeComplaint(complaintId);
  }

  // The confirm control is a plain button and the form submit is only a keyboard
  // fallback (Enter in the password field), so both paths share one code path.
  deleteSubmit.addEventListener("click", submitDelete);
  deleteForm.addEventListener("submit", function (e) {
    e.preventDefault();
    submitDelete();
  });
  document.getElementById("cancelDelete").addEventListener("click", closeDeleteModal);
  deleteModal.addEventListener("click", function (e) {
    if (e.target === deleteModal) closeDeleteModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && deleteModal.classList.contains("open")) closeDeleteModal();
  });

  /* ---------------- Edit task modal ---------------- */
  const editModal = document.getElementById("editModal");
  const editForm = document.getElementById("editForm");
  const editDaySelect = document.getElementById("e-day");
  const editAssigneeSelect = document.getElementById("e-assignee");
  let pendingEditTaskId = null;

  // The edit modal works in real dates: the select carries a day key, which is
  // resolved to that day's date, and an unscheduled task opens on "Unscheduled".
  editDaySelect.innerHTML =
    '<option value="">Unscheduled</option>' +
    DAY_KEYS.map(function (k, i) {
      return '<option value="' + k + '">' + DAY_NAMES[k] + ' ' + weekDates[i].getDate() + '</option>';
    }).join("");

  function fillStaffSelect(select) {
    select.innerHTML = '<option value="">Unassigned</option>' + people.map(function (p) {
      return '<option value="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) +
        (p.role ? ' - ' + escapeHtml(p.role) : '') + '</option>';
    }).join("");
  }
  // Same roster, but a task's creator is never "Unassigned" - either the person
  // is known or it is left unspecified.
  function fillCreatedBySelect(select, selected) {
    select.innerHTML = '<option value="">Not specified</option>' + people.map(function (p) {
      return '<option value="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) +
        (p.role ? ' - ' + escapeHtml(p.role) : '') + '</option>';
    }).join("");
    select.value = personNames().indexOf(selected) === -1 ? "" : selected;
  }
  function personNames() {
    return people.map(function (p) { return p.name; });
  }

  function openEditModal(task) {
    pendingEditTaskId = task.id;
    editModal.querySelector(".edit-description").textContent = task.recurring
      ? 'Editing the task for this week. Weekly repeats keep their original details.'
      : 'Update this task or assign it to a team member.';
    fillStaffSelect(editAssigneeSelect);
    document.getElementById("e-title").value = task.title;
    document.getElementById("e-location").value = task.location;
    editDaySelect.value = dayKeyFromDate(task.day) || "";
    document.getElementById("e-priority").value = task.priority;
    editAssigneeSelect.value = personNames().indexOf(task.assignee) === -1 ? "" : task.assignee;
    editModal.classList.add("open");
    document.getElementById("e-title").focus();
  }

  function closeEditModal() {
    editModal.classList.remove("open");
    editForm.reset();
    editAssigneeSelect.innerHTML = '<option value="">Unassigned</option>';
    pendingEditTaskId = null;
  }

  editForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const task = tasks.find(function (x) { return x.id === pendingEditTaskId; });
    if (!task) { closeEditModal(); return; }
    const title = document.getElementById("e-title").value.trim();
    const location = document.getElementById("e-location").value.trim();
    if (!title || !location) return;
    const dayKey = editDaySelect.value;
    const newDate = dayKey ? dayDate[dayKey] : UNASSIGNED_DATE;
    const priority = document.getElementById("e-priority").value;
    const assignee = editAssigneeSelect.value;

    const changes = [];
    if (task.title !== title) changes.push('title to "' + title + '"');
    if (task.location !== location) changes.push("location to " + location);
    const wasDate = task.day;
    if (newDate !== wasDate) changes.push("date from " + dateLabel(wasDate) + " to " + dateLabel(newDate));
    if (priority !== task.priority) changes.push("priority to " + priority);
    const assigneeChanged = (task.assignee || "") !== assignee;
    if (assigneeChanged) changes.push("assignee to " + assigneeLabel(assignee));

    // "moved" only makes sense between two real dates; clearing to Unscheduled
    // is a different action and should not claim the task was carried over.
    if (newDate !== wasDate) task.moved = wasDate || null;
    task.title = title;
    task.location = location;
    task.day = newDate;
    task.priority = priority;
    task.assignee = assignee;

    logActivity(changes.length ? "Edited \"" + task.title + "\" - " + changes.join(", ") : "Saved \"" + task.title + "\" with no changes");
    toast(assigneeChanged && changes.length === 1 ? "Assigned to " + assigneeLabel(assignee) : "Task updated");
    closeEditModal();
    markSaving();
    renderAll();
  });

  document.getElementById("closeEdit").addEventListener("click", closeEditModal);
  document.getElementById("cancelEdit").addEventListener("click", closeEditModal);
  editModal.addEventListener("click", function (e) {
    if (e.target === editModal) closeEditModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && editModal.classList.contains("open")) closeEditModal();
  });

  function attachColumnEvents() {
    document.querySelectorAll(".day-col").forEach(function (col) {
      col.addEventListener("dragover", function (e) {
        e.preventDefault();
        col.classList.add("drag-over");
      });
      col.addEventListener("dragleave", function () { col.classList.remove("drag-over"); });
      col.addEventListener("drop", function (e) {
        e.preventDefault();
        col.classList.remove("drag-over");
        dragMoved = true;
        const t = findTask(dragId);
        const newDate = col.dataset.day;
        if (t && t.day !== newDate) {
          const wasDate = t.day;
          t.moved = wasDate || null;
          t.day = newDate;
          logActivity(wasDate
            ? "Moved \"" + t.title + "\" from " + dateLabel(wasDate) + " to " + dateLabel(newDate)
            : "Scheduled \"" + t.title + "\" for " + dateLabel(newDate));
          markSaving();
          renderAll();
        }
        setTimeout(function () { dragMoved = false; }, 50);
      });
    });
  }

  /* ---------------- Composer ---------------- */
  const daySelect = document.getElementById("f-day");
  daySelect.innerHTML =
    '<option value="" selected>No date - unscheduled</option>' +
    DAY_KEYS.map(function (k, i) {
      return '<option value="' + k + '" ' + (k === todayKey ? 'selected' : '') + '>' + DAY_NAMES[k] + ' ' + weekDates[i].getDate() + '</option>';
    }).join("");
  daySelect.value = todayKey;
  const composerAssignee = document.getElementById("f-assignee");
  const composerCreatedBy = document.getElementById("f-created-by");

  const composer = document.getElementById("composer");
  document.getElementById("composerToggle").addEventListener("click", function () {
    composer.classList.toggle("collapsed");
  });

  let pendingPhoto = null;
  function wirePhotoInput() {
    const input = document.getElementById("f-photo");
    input.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        pendingPhoto = ev.target.result;
        document.getElementById("photoDrop").innerHTML = '<img src="' + pendingPhoto + '" alt="Preview"><input type="file" id="f-photo" accept="image/*">';
        wirePhotoInput();
        document.getElementById("photoHint").textContent = file.name;
      };
      reader.readAsDataURL(file);
    });
  }
  wirePhotoInput();

  function resetPhotoField() {
    pendingPhoto = null;
    document.getElementById("photoDrop").innerHTML = '<svg class="icon" viewBox="0 0 24 24" id="photoIcon"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.2"/></svg><input type="file" id="f-photo" accept="image/*">';
    wirePhotoInput();
    document.getElementById("photoHint").textContent = "Attach a site photo (optional)";
  }

  document.getElementById("clearComposer").addEventListener("click", function () {
    document.getElementById("f-title").value = "";
    document.getElementById("f-location").value = "";
    document.getElementById("f-priority").value = "medium";
    composerAssignee.value = "";
    document.getElementById("f-recurring").checked = false;
    resetPhotoField();
  });

  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    const title = document.getElementById("f-title").value.trim();
    const location = document.getElementById("f-location").value.trim();
    if (!title || !location) return;
    const dayKey = document.getElementById("f-day").value;
    const newDate = dayKey ? dayDate[dayKey] : UNASSIGNED_DATE;
    const priority = document.getElementById("f-priority").value;
    const assignee = composerAssignee.value;
    // Defaults to whoever is signed in, but can be set explicitly for a task
    // logged on someone else's behalf.
    const createdBy = composerCreatedBy.value || currentUser || "";
    // A weekly repeat needs a weekday to repeat on, so an unscheduled task can
    // never be recurring.
    const isRecurring = document.getElementById("f-recurring").checked && !!dayKey;
    if (isRecurring) {
      const recurringTask = {
        id: "weekly-" + Date.now().toString(36) + "-" + uid,
        title: title,
        location: location,
        day: dayKey,
        priority: priority,
        assignee: assignee,
        createdBy: createdBy
      };
      if (!saveRecurringTasks(recurringTasks.concat(recurringTask))) return;
    }
    tasks.push({
      id: uid++,
      title: title,
      location: location,
      day: newDate,
      priority: priority,
      assignee: assignee,
      createdBy: createdBy,
      done: false,
      photo: pendingPhoto,
      moved: null,
      recurring: isRecurring,
      recurringId: isRecurring ? recurringTasks[recurringTasks.length - 1].id : null
    });
    logActivity("Added \"" + title + "\"" +
      (newDate ? " to " + dateLabel(newDate) : " to Unscheduled") +
      (createdBy ? " (by " + createdBy + ")" : "") +
      (assignee ? " - assigned to " + assignee : ""));
    toast(isRecurring ? "Weekly task added and saved"
      : newDate ? "Task added to the board" : "Task parked in Unscheduled");
    document.getElementById("f-title").value = "";
    document.getElementById("f-location").value = "";
    document.getElementById("f-priority").value = "medium";
    composerAssignee.value = "";
    // Reset the creator back to the signed-in user, not to blank.
    fillCreatedBySelect(composerCreatedBy, currentUser);
    document.getElementById("f-recurring").checked = false;
    daySelect.value = todayKey;
    resetPhotoField();
    markSaving();
    renderAll();
  });

  document.getElementById("newTaskBtn").addEventListener("click", function () {
    document.getElementById("view-tasks").classList.add("active");
    document.getElementById("view-complaints").classList.remove("active");
    document.querySelectorAll(".nav-item[data-view]").forEach(function (n) { n.classList.toggle("active", n.dataset.view === "tasks"); });
    composer.classList.remove("collapsed");
    composer.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("f-title").focus();
  });

  // Drop target for un-scheduling: drag a board task here to take it off the
  // calendar without deleting it.
  const backlogList = document.getElementById("backlogList");
  backlogList.addEventListener("dragover", function (e) {
    e.preventDefault();
    backlogList.classList.add("drag-over");
  });
  backlogList.addEventListener("dragleave", function () { backlogList.classList.remove("drag-over"); });
  backlogList.addEventListener("drop", function (e) {
    e.preventDefault();
    backlogList.classList.remove("drag-over");
    dragMoved = true;
    const t = findTask(dragId);
    if (t && t.day) {
      const wasDate = t.day;
      t.day = UNASSIGNED_DATE;
      t.moved = null;
      logActivity("Un-scheduled \"" + t.title + "\" from " + dateLabel(wasDate));
      toast("Task moved to Unscheduled");
      markSaving();
      renderAll();
    }
    setTimeout(function () { dragMoved = false; }, 50);
  });

  /* ---------------- Nav / tab switching ---------------- */
  document.querySelectorAll(".nav-item[data-view]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".nav-item[data-view]").forEach(function (n) { n.classList.remove("active"); });
      btn.classList.add("active");
      document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
      document.getElementById("view-" + btn.dataset.view).classList.add("active");
    });
  });

  /* ---------------- Complaints ---------------- */
  function complaintRowHtml(c) {
    const statusLabel = c.status === "open" ? "Open" : c.status === "progress" ? "In progress" : "Closed";
    return '<div class="complaint-row ' + (c.status === 'closed' ? 'closed' : '') + '" data-id="' + c.id + '">' +
      '<div class="c-owner"><div class="who">' + escapeHtml(c.owner) + '</div><div class="apt">' + escapeHtml(c.apt) + '</div></div>' +
      '<div class="c-type">' + escapeHtml(c.type) + '</div>' +
      '<div class="c-age">' + escapeHtml(c.age) + '</div>' +
      '<div><span class="status-chip ' + c.status + '">' + statusLabel + '</span></div>' +
      '<div class="c-actions">' +
      '<button class="btn btn-ghost btn-sm act-create" ' + (c.status === 'closed' ? 'disabled' : '') + '>Create task</button>' +
      '<button class="btn btn-coral btn-sm act-close" ' + (c.status === 'closed' ? 'disabled' : '') + '>Close with action</button>' +
      '<button type="button" class="btn btn-ghost btn-sm act-delete" aria-label="Delete report from ' + escapeHtml(c.owner) + '" title="Delete report">Delete</button>' +
      '</div>' +
      '<div class="close-note" id="note-' + c.id + '">' +
      '<textarea placeholder="Describe the action taken to resolve this issue..."></textarea>' +
      '<div class="row"><button class="btn btn-ghost btn-sm act-cancel-note">Cancel</button>' +
      '<button class="btn btn-primary btn-sm act-confirm-note">Confirm &amp; close</button></div>' +
      '</div></div>';
  }

  function renderComplaints() {
    document.getElementById("complaintsList").innerHTML = complaints.map(complaintRowHtml).join("");
    document.querySelectorAll(".act-create").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const row = btn.closest(".complaint-row");
        const c = complaints.find(function (x) { return x.id === Number(row.dataset.id); });
        tasks.push({
          id: uid++,
          title: "Resolve: " + c.type,
          location: c.apt,
          day: todayDate,
          priority: "high",
          assignee: UNASSIGNED,
          done: false, photo: null, moved: null
        });
        c.status = "progress";
        logActivity("Created task from " + c.owner + "'s report (" + c.type + ")");
        toast("Task created for " + c.owner + "'s issue");
        markSaving();
        renderComplaints();
        renderAll();
      });
    });
    document.querySelectorAll(".act-close").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const row = btn.closest(".complaint-row");
        document.getElementById("note-" + row.dataset.id).classList.add("open");
      });
    });
    document.querySelectorAll(".act-cancel-note").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.closest(".close-note").classList.remove("open");
      });
    });
    document.querySelectorAll(".act-confirm-note").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const note = btn.closest(".close-note");
        const row = btn.closest(".complaint-row");
        const c = complaints.find(function (x) { return x.id === Number(row.dataset.id); });
        const text = note.querySelector("textarea").value.trim() || "Resolved by caretaker.";
        c.status = "closed";
        c.note = text;
        logActivity("Closed " + c.owner + "'s complaint - \"" + text.slice(0, 40) + (text.length > 40 ? '...' : '') + "\"");
        toast("Complaint closed with recorded action");
        markSaving();
        renderComplaints();
        renderAll();
      });
    });
    document.querySelectorAll(".act-delete").forEach(function(btn){
      btn.addEventListener("click", function(){
        const row = btn.closest(".complaint-row");
        const c = complaints.find(function(x){ return x.id === Number(row.dataset.id); });
        if(c) requestComplaintRemoval(c);
      });
    });
  }

  // New reports are logged straight into the same list the owner issues live in,
  // so they flow into the weekly report and the open-issue counters like any
  // other complaint. Ids must stay numeric: isValidComplaint rejects anything
  // else, and a rejected row would silently vanish on the next server load.
  let complaintUid = complaints.reduce(function (max, c) {
    return typeof c.id === "number" && c.id > max ? c.id : max;
  }, 0) + 1;

  const complaintForm = document.getElementById("complaintForm");
  complaintForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const ownerInput = document.getElementById("complaintOwner");
    const aptInput = document.getElementById("complaintApt");
    const typeInput = document.getElementById("complaintType");
    const owner = ownerInput.value.trim();
    const apt = aptInput.value.trim();
    const type = typeInput.value.trim();
    if (!owner || !apt || !type) return;

    complaints.push({
      id: complaintUid++,
      owner: owner,
      apt: apt,
      type: type,
      age: "just now",
      status: "open",
      note: null,
    });
    logActivity("Logged " + owner + "'s report (" + type + ")");
    toast("Report added for " + owner);
    ownerInput.value = "";
    aptInput.value = "";
    typeInput.value = "";
    markSaving();
    renderComplaints();
    renderAll();
    ownerInput.focus();
  });

  /* ---------------- Task requests ---------------- */
  // The log of work that still has to be turned into board tasks. Two statuses:
  // "pending" (waiting to be picked up) and "moved" (it became a task, and the
  // row keeps a record of which one). A row is never a task itself, so nothing
  // here reaches the calendar, the counters or the weekly report until it is
  // moved across with the Move to task button.
  function requestIndex(id) {
    return requests.findIndex(function (r) { return String(r.id) === String(id); });
  }

  function requestRowHtml(r) {
    const moved = r.status === "moved";
    const linked = moved && r.taskId !== null && r.taskId !== undefined &&
      findTask(r.taskId) ? findTask(r.taskId) : null;
    return '<div class="request-row ' + (moved ? 'moved' : '') + '" data-id="' + escapeHtml(r.id) + '">' +
      '<div class="r-what">' +
        '<div class="r-title">' + escapeHtml(r.title) + '</div>' +
        '<div class="r-loc">' + escapeHtml(r.location) + '</div>' +
        (r.note ? '<div class="r-note">' + escapeHtml(r.note) + '</div>' : '') +
      '</div>' +
      '<div><span class="priority-chip ' + r.priority + '">' + priorityLabel(r.priority) + '</span></div>' +
      '<div>' + (r.requestedBy
        ? '<span class="r-by">' + escapeHtml(r.requestedBy) + '</span>'
        : '<span class="r-none">Not recorded</span>') + '</div>' +
      '<div><span class="status-chip ' + r.status + '">' + (moved ? "Moved to tasks" : "Pending") + '</span></div>' +
      '<div class="r-actions">' +
        (moved
          ? '<span class="r-none">' + (linked ? 'On the board as "' + escapeHtml(linked.title) + '"' : "Task since removed") + '</span>'
          : '<button type="button" class="btn btn-primary btn-sm act-move">' +
            '<svg class="icon" viewBox="0 0 24 24"><path d="M4 12h14"/><path d="M13 7l5 5-5 5"/></svg>' +
            'Move to task</button>') +
        '<button type="button" class="btn btn-ghost btn-sm act-remove" aria-label="Delete request ' + escapeHtml(r.title) + '" title="Delete request">Delete</button>' +
      '</div>' +
      '</div>';
  }

  function renderRequests() {
    const list = document.getElementById("requestsList");
    if (!list) return;

    const pending = requests.filter(function (r) { return r.status !== "moved"; });
    // "0" is itself a figure a caretaker can trust; with no backend there is
    // nothing to count, so the badge is left blank rather than filled in.
    document.getElementById("navRequestCount").textContent = backendMissing ? "" : pending.length;
    const summary = document.getElementById("requestsSummary");
    if (backendMissing) {
      summary.textContent = "This page has no backend - no requests to show";
    } else summary.textContent = requests.length === 0
      ? "Nothing logged yet"
      : pending.length === 0
        ? "Nothing waiting - every request has been moved to tasks"
        : pending.length + (pending.length === 1 ? " request" : " requests") + " waiting to be moved to tasks";

    if (requests.length === 0) {
      list.innerHTML = '<p class="requests-empty">Log work reported to you here, then move it onto the board when you pick it up.</p>';
      return;
    }

    list.innerHTML = requests.map(requestRowHtml).join("");

    list.querySelectorAll(".act-move").forEach(function (btn) {
      btn.addEventListener("click", function () {
        moveRequestToTask(btn.closest(".request-row").dataset.id);
      });
    });
    list.querySelectorAll(".act-remove").forEach(function (btn) {
      btn.addEventListener("click", function () {
        removeRequest(btn.closest(".request-row").dataset.id);
      });
    });
  }

  // The move itself: the request becomes a real task on the board (parked in
  // Unscheduled, where a new task with no agreed date belongs) and the row stays
  // behind as a "moved" record that links back to the task it produced.
  function moveRequestToTask(id) {
    const index = requestIndex(id);
    if (index === -1) return;
    const request = requests[index];
    if (request.status === "moved") return;
    const taskId = uid++;
    tasks.push({
      id: taskId,
      title: request.title,
      location: request.location,
      day: UNASSIGNED_DATE,
      priority: request.priority,
      assignee: UNASSIGNED,
      createdBy: request.requestedBy || currentUser || "",
      done: false,
      photo: null,
      moved: null
    });
    request.status = "moved";
    request.taskId = taskId;
    logActivity('Moved "' + request.title + '" from task requests to Unscheduled');
    toast('"' + request.title + '" added to Unscheduled');
    markSaving();
    renderRequests();
    renderAll();
  }

  function removeRequest(id) {
    const index = requestIndex(id);
    if (index === -1) return;
    const request = requests[index];
    requests.splice(index, 1);
    logActivity('Deleted the task request "' + request.title + '"');
    toast("Request deleted");
    markSaving();
    renderRequests();
  }

  const requestForm = document.getElementById("requestForm");
  requestForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const titleInput = document.getElementById("requestTitle");
    const locationInput = document.getElementById("requestLocation");
    const byInput = document.getElementById("requestedBy");
    const noteInput = document.getElementById("requestNote");
    const title = titleInput.value.trim();
    const location = locationInput.value.trim();
    if (!title || !location) return;

    requests.unshift({
      id: "r-" + Date.now().toString(36) + "-" + requestUid++,
      title: title,
      location: location,
      priority: document.getElementById("requestPriority").value,
      requestedBy: byInput.value.trim(),
      note: noteInput.value.trim(),
      status: "pending",
      taskId: null
    });
    logActivity('Logged the task request "' + title + '" for ' + location);
    toast("Task request logged");
    titleInput.value = "";
    locationInput.value = "";
    byInput.value = "";
    noteInput.value = "";
    document.getElementById("requestPriority").value = "medium";
    markSaving();
    renderRequests();
    titleInput.focus();
  });

  /* ---------------- Shopping list ---------------- */
  // Ticking an item removes it from the list, so what remains is exactly what
  // still needs buying. Removal is permanent, so it is logged to the activity
  // feed for a record of what was picked up and by whom.
  function renderShopping() {
    const list = document.getElementById("shoppingList");
    if (!list) return;

    document.getElementById("navShoppingCount").textContent = backendMissing ? "" : shopping.length;
    const summary = document.getElementById("shoppingSummary");
    summary.textContent = backendMissing
      ? "This page has no backend - no supplies to show"
      : shopping.length === 0
      ? "Nothing outstanding"
      : shopping.length + (shopping.length === 1 ? " item" : " items") + " still to pick up";

    if (shopping.length === 0) {
      list.innerHTML = '<p class="shopping-empty">' +
        '<svg class="icon" viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>' +
        '<span>All done. Nothing left on the list.</span></p>';
      return;
    }

    list.innerHTML = shopping.map(function (item) {
      return '<div class="shopping-item" data-id="' + item.id + '">' +
        '<label class="shopping-check">' +
        '<input type="checkbox" data-id="' + item.id + '" ' +
        'aria-label="Mark ' + escapeHtml(item.label) + ' as bought and remove it">' +
        '<span class="shopping-box" aria-hidden="true">' +
        '<svg class="icon" viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>' +
        '</span>' +
        '</label>' +
        '<div class="shopping-body">' +
        '<div class="shopping-label">' + escapeHtml(item.label) + '</div>' +
        '<div class="shopping-meta">' +
        '<span class="shopping-qty">x' + item.qty + '</span>' +
        (item.addedBy ? '<span>added by ' + escapeHtml(item.addedBy) + '</span>' : '') +
        '</div>' +
        '</div>' +
        '<button type="button" class="shopping-remove" data-id="' + item.id + '" ' +
        'aria-label="Remove ' + escapeHtml(item.label) + '" title="Remove from list">' +
        '<svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
        '</button>' +
        '</div>';
    }).join("");

    list.querySelectorAll(".shopping-check input").forEach(function (box) {
      box.addEventListener("change", function () {
        tickOffShoppingItem(box.dataset.id);
      });
    });
    list.querySelectorAll(".shopping-remove").forEach(function (btn) {
      btn.addEventListener("click", function () {
        removeShoppingItem(btn.dataset.id);
      });
    });
  }

  function shoppingIndex(id) {
    return shopping.findIndex(function (item) { return String(item.id) === String(id); });
  }

  function tickOffShoppingItem(id) {
    const index = shoppingIndex(id);
    if (index === -1) return;
    const item = shopping[index];
    // Let the checkmark paint before the row is pulled out of the list.
    const row = document.querySelector('.shopping-item[data-id="' + id + '"]');
    if (row) row.classList.add("checked");
    setTimeout(function () {
      shopping.splice(shoppingIndex(id), 1);
      logActivity("Picked up \"" + item.label + "\" x" + item.qty + " - removed from shopping list");
      toast("\"" + item.label + "\" ticked off");
      markSaving();
      renderShopping();
    }, 260);
  }

  function removeShoppingItem(id) {
    const index = shoppingIndex(id);
    if (index === -1) return;
    const item = shopping[index];
    shopping.splice(index, 1);
    logActivity("Removed \"" + item.label + "\" from shopping list");
    toast("Item removed");
    markSaving();
    renderShopping();
  }

  const shoppingForm = document.getElementById("shoppingForm");
  shoppingForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const input = document.getElementById("shoppingInput");
    const label = input.value.trim();
    if (!label) return;
    const qty = Number(document.getElementById("shoppingQty").value) || 1;
    const existing = shopping.find(function (item) {
      return item.label.toLowerCase() === label.toLowerCase();
    });
    if (existing) {
      // Same item added again: bump the quantity rather than duplicating it.
      existing.qty += qty;
      toast("\"" + existing.label + "\" is now x" + existing.qty);
    } else {
      shopping.push({ id: shoppingUid++, label: label, qty: qty, addedBy: "Marco Conti" });
      toast("Added \"" + label + "\" to the shopping list");
    }
    logActivity("Added \"" + label + "\" x" + qty + " to shopping list");
    input.value = "";
    document.getElementById("shoppingQty").value = "1";
    markSaving();
    renderShopping();
    input.focus();
  });

  /* ---------------- People ---------------- */
  // The roster behind "Assign to" and "Created by". It lives on the server, so a
  // name added here is immediately available on every device.
  function initialsOf(name) {
    return String(name).split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (w) { return w[0]; }).join("").toUpperCase() || "?";
  }
  function openTaskCount(name) {
    return tasks.filter(function (t) { return t.assignee === name && !t.done; }).length;
  }
  function isAdmin(name) {
    const person = people.find(function (p) { return p.name === name; });
    return !!person && /lead|manager|supervisor/i.test(person.role || "");
  }

  function renderPeople() {
    const list = document.getElementById("peopleList");
    if (!list) return;
    document.getElementById("navPeopleCount").textContent = backendMissing ? "" : people.length;
    document.getElementById("peopleSummary").textContent = backendMissing
      ? "This page has no backend - no roster to show"
      : people.length === 0
      ? "No one on the roster yet"
      : people.length + (people.length === 1 ? " person" : " people") + " can be assigned tasks";

    if (people.length === 0) {
      list.innerHTML = '<p class="people-empty">Add the caretakers and contractors you assign work to. ' +
        'They will then appear in the Assign to and Created by lists.</p>';
      return;
    }

    list.innerHTML = people.map(function (p) {
      const open = openTaskCount(p.name);
      const isCurrent = p.name === currentUser;
      return '<div class="person-row" data-id="' + escapeHtml(p.id) + '" data-name="' + escapeHtml(p.name) + '">' +
        '<span class="person-avatar" aria-hidden="true">' + escapeHtml(initialsOf(p.name)) + '</span>' +
        '<div class="person-body">' +
        '<div class="person-name">' + escapeHtml(p.name) +
        (isCurrent ? '<span class="person-me">You</span>' : '') +
        (isAdmin(p.name) ? '<span class="person-admin" title="Can approve task removal">Admin</span>' : '') +
        '</div>' +
        '<div class="person-meta">' + (p.role ? escapeHtml(p.role) + ' · ' : '') +
        open + ' open task' + (open === 1 ? '' : 's') + '</div>' +
        '</div>' +
        '<div class="person-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm act-assign-me" ' + (isCurrent ? 'disabled' : '') +
        'title="Work as this person">Work as</button>' +
        '<button type="button" class="person-remove" data-name="' + escapeHtml(p.name) + '" ' +
        'aria-label="Remove ' + escapeHtml(p.name) + '" title="Remove from roster">' +
        '<svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
        '</button>' +
        '</div>' +
        '</div>';
    }).join("");

    list.querySelectorAll(".act-assign-me").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setCurrentUser(btn.closest(".person-row").dataset.name);
      });
    });
    list.querySelectorAll(".person-remove").forEach(function (btn) {
      btn.addEventListener("click", function () {
        removePerson(btn.dataset.name);
      });
    });
  }

  function removePerson(name) {
    const person = people.find(function (p) { return p.name === name; });
    if (!person) return;
    const assigned = tasks.filter(function (t) { return t.assignee === name; }).length;
    people = people.filter(function (p) { return p.name !== name; });
    if (currentUser === name) setCurrentUser(people.length ? people[0].name : "");
    logActivity("Removed " + name + " from the roster" +
      (assigned ? " - their " + assigned + " task" + (assigned === 1 ? "" : "s") + " keep the name" : ""));
    toast(assigned
      ? name + " removed. Their existing tasks keep the name."
      : name + " removed from the roster");
    markSaving();
    refreshPeopleSelects();
    renderPeople();
    renderAll();
    renderComplaints();
    renderShopping();
  }

  // Keep every roster-driven dropdown in step after the list changes.
  // `creatorFollowsUser` is set when the signed-in user changed, so the composer
  // adopts them as the default creator; otherwise a hand-picked creator is kept.
  function refreshPeopleSelects(creatorFollowsUser) {
    fillStaffSelect(composerAssignee);
    const createdBySelect = document.getElementById("f-created-by");
    const creator = !creatorFollowsUser && personNames().indexOf(createdBySelect.value) !== -1
      ? createdBySelect.value
      : currentUser;
    fillCreatedBySelect(createdBySelect, creator);
    fillStaffSelect(editAssigneeSelect);
    document.getElementById("currentUserSelect").innerHTML = people.map(function (p) {
      return '<option value="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + '</option>';
    }).join("");
    document.getElementById("currentUserSelect").value = currentUser;
    const person = people.find(function (p) { return p.name === currentUser; });
    document.getElementById("userAvatar").textContent = initialsOf(currentUser || "?");
    document.getElementById("userRole").textContent = person && person.role ? person.role : "Caretaker";
  }

  function setCurrentUser(name) {
    currentUser = name;
    try { localStorage.setItem("sharondaleCurrentUser", name); } catch (e) { /* optional */ }
    // The composer's "Created by" follows whoever is now signed in.
    refreshPeopleSelects(true);
    renderPeople();
    toast("Now working as " + name);
  }

  const peopleForm = document.getElementById("peopleForm");
  peopleForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const nameInput = document.getElementById("peopleName");
    const roleInput = document.getElementById("peopleRole");
    const name = nameInput.value.trim();
    const role = roleInput.value.trim();
    if (!name) return;
    if (people.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); })) {
      toast("\"" + name + "\" is already on the roster");
      nameInput.select();
      return;
    }
    people.push({ id: "p-" + Date.now().toString(36) + "-" + peopleUid++, name: name, role: role });
    logActivity("Added " + name + (role ? " (" + role + ")" : "") + " to the roster");
    toast(name + " can now be assigned tasks");
    nameInput.value = "";
    roleInput.value = "";
    markSaving();
    refreshPeopleSelects();
    renderPeople();
    nameInput.focus();
  });

  document.getElementById("currentUserSelect").addEventListener("change", function (e) {
    setCurrentUser(e.target.value);
  });

  /* ---------------- Phonebook ---------------- */
  // External contacts the caretaker phones: contractors, suppliers, emergency
  // lines. Kept apart from the roster so a plumber never shows up in the
  // "assign to" list, and stored on the server so every device sees the same
  // numbers.
  function phonebookMatches(contact, query) {
    if (!query) return true;
    const haystack = [contact.name, contact.company, contact.phone, contact.note]
      .join(" ").toLowerCase();
    return haystack.indexOf(query) !== -1;
  }

  function renderPhonebook() {
    const list = document.getElementById("phonebookList");
    if (!list) return;

    document.getElementById("navPhonebookCount").textContent = backendMissing ? "" : phonebook.length;
    const summary = document.getElementById("phonebookSummary");
    summary.textContent = backendMissing
      ? "This page has no backend - no contacts to show"
      : phonebook.length === 0
      ? "No contacts yet"
      : phonebook.length + (phonebook.length === 1 ? " contact" : " contacts") +
        " for contractors, suppliers and emergencies";

    if (phonebook.length === 0) {
      list.innerHTML = '<p class="phonebook-empty">' +
        '<svg class="icon" viewBox="0 0 24 24"><path d="M6 3.5h12v17H6z"/><path d="M9 11h6M9 14.5h4"/></svg>' +
        '<span>Add the contractors, suppliers and emergency numbers you call.</span></p>';
      return;
    }

    list.innerHTML = phonebook.map(function (c) {
      return '<div class="contact-row" data-id="' + escapeHtml(c.id) + '">' +
        '<span class="contact-avatar" aria-hidden="true">' + escapeHtml(initialsOf(c.name)) + '</span>' +
        '<div class="contact-body">' +
        '<div class="contact-name">' + escapeHtml(c.name) + '</div>' +
        '<div class="contact-meta">' +
        (c.company ? escapeHtml(c.company) : '<span class="contact-none">No company</span>') +
        (c.note ? ' · ' + escapeHtml(c.note) : '') +
        '</div>' +
        '<a class="contact-phone" href="tel:' + escapeHtml(String(c.phone).replace(/[^0-9+]/g, '')) + '">' +
        '<svg class="icon" viewBox="0 0 24 24"><path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z"/></svg>' +
        escapeHtml(c.phone) + '</a>' +
        '</div>' +
        '<div class="contact-actions">' +
        '<button type="button" class="contact-remove" aria-label="Remove ' + escapeHtml(c.name) + '" title="Remove contact">' +
        '<svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
        '</button>' +
        '</div>' +
        '</div>';
    }).join("");

    list.querySelectorAll(".contact-remove").forEach(function (btn) {
      btn.addEventListener("click", function () {
        removeContact(btn.closest(".contact-row").dataset.id);
      });
    });
  }

  function removeContact(id) {
    const contact = phonebook.find(function (c) { return c.id === id; });
    if (!contact) return;
    phonebook = phonebook.filter(function (c) { return c.id !== id; });
    logActivity("Removed " + contact.name + " from the phonebook");
    toast(contact.name + " removed from the phonebook");
    markSaving();
    renderPhonebook();
  }

  const phonebookForm = document.getElementById("phonebookForm");
  phonebookForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const nameInput = document.getElementById("phonebookName");
    const companyInput = document.getElementById("phonebookCompany");
    const phoneInput = document.getElementById("phonebookPhone");
    const noteInput = document.getElementById("phonebookNote");
    const name = nameInput.value.trim();
    const company = companyInput.value.trim();
    const phone = phoneInput.value.trim();
    const note = noteInput.value.trim();
    if (!name || !phone) return;
    if (phonebook.some(function (c) {
      return c.name.toLowerCase() === name.toLowerCase() && c.phone === phone;
    })) {
      toast("\"" + name + "\" is already in the phonebook with that number");
      nameInput.select();
      return;
    }
    phonebook.push({
      id: "c-" + Date.now().toString(36) + "-" + phonebookUid++,
      name: name,
      company: company,
      phone: phone,
      note: note,
    });
    logActivity("Added " + name + " to the phonebook" + (company ? " (" + company + ")" : ""));
    toast(name + " added to the phonebook");
    nameInput.value = "";
    companyInput.value = "";
    phoneInput.value = "";
    noteInput.value = "";
    markSaving();
    renderPhonebook();
    nameInput.focus();
  });

  /* ---------------- Weekly report modal ---------------- */
  const reportModal = document.getElementById("reportModal");
  function openReport() {
    const completed = tasks.filter(function (t) { return t.done; }).length;
    const carried = tasks.filter(function (t) { return t.moved && !t.done; }).length;
    // "Overdue" is any still-open task whose real date has already passed.
    const overdue = tasks.filter(function (t) { return t.day && t.day < todayDate && !t.done; }).length;
    document.getElementById("rCompleted").textContent = completed;
    document.getElementById("rCarried").textContent = carried;
    document.getElementById("rOverdue").textContent = overdue;
    document.getElementById("rTotal").textContent = tasks.length;
    document.getElementById("rResolved").textContent = complaints.filter(function (c) { return c.status === "closed"; }).length;
    document.getElementById("rOpenIssues").textContent = complaints.filter(function (c) { return c.status !== "closed"; }).length;
    reportModal.classList.add("open");
  }
  function closeReport() { reportModal.classList.remove("open"); }
  document.getElementById("weeklyReportNav").addEventListener("click", openReport);
  document.getElementById("openReportFromTasks").addEventListener("click", openReport);
  document.getElementById("openReportFromComplaints").addEventListener("click", openReport);
  document.getElementById("closeReport").addEventListener("click", closeReport);
  document.getElementById("closeReport2").addEventListener("click", closeReport);
  reportModal.addEventListener("click", function (e) { if (e.target === reportModal) closeReport(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeReport(); });

  // Print stylesheet for the generated report. Kept as a string so the report
  // document is completely self-contained and needs no second request.
  const REPORT_CSS = `
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    html { background: #fff; }
    body {
      /* @page margins only apply when actually printing, so the same inset is
         applied here too. Without it the saved PDF (and the print preview)
         renders with the content hard against the paper edge. */
      margin: 0; padding: 14mm;
      max-width: 210mm;
      color: #1B2A24;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 11px; line-height: 1.45;
    }
    @media print {
      /* The page box already supplies the margin when printing. */
      body { padding: 0; max-width: none; }
    }
    h1, h2, h3 { margin: 0; font-weight: 700; }
    .head {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 16px; padding-bottom: 14px; border-bottom: 3px solid #17483A;
    }
    .head > * { min-width: 0; }
    .brand { display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
    .brand .mark {
      width: 30px; height: 30px; border-radius: 8px; flex: 0 0 auto;
      background: linear-gradient(135deg, #17483A, #C9A565);
    }
    .wordmark { font-size: 15px; font-weight: 800; letter-spacing: 0.12em; color: #17483A; }
    .brand .sub { font-size: 10px; color: #6B7A72; letter-spacing: 0.04em; }
    .head-right { text-align: right; flex: 0 0 auto; }
    .head-right h1 { font-size: 20px; color: #17483A; white-space: nowrap; }
    .period { font-size: 12px; font-weight: 600; margin-top: 2px; white-space: nowrap; }
    .generated { font-size: 9.5px; color: #6B7A72; margin-top: 2px; white-space: nowrap; }
    .stats { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 7px; margin: 16px 0 14px; }
    .stat { border: 1px solid #DFE4DE; border-radius: 8px; padding: 9px 2px; text-align: center; background: #FAF8F2; }
    .stat .num { font-size: 18px; font-weight: 700; line-height: 1.1; }
    .stat .lbl { font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #6B7A72; margin-top: 3px; }
    .stat-green .num { color: #17483A; }
    .stat-amber .num { color: #A9761B; }
    .stat-coral .num { color: #BE4A34; }
    .stat-muted .num { color: #6B7A72; }
    .bar-wrap { margin-bottom: 18px; }
    .bar-label { display: flex; justify-content: space-between; font-size: 10px; color: #6B7A72; margin-bottom: 4px; }
    .bar-label b { color: #17483A; font-size: 11px; }
    .bar { height: 8px; background: #E7EBE6; border-radius: 99px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: linear-gradient(90deg, #17483A, #C9A565); }
    .bar-foot { font-size: 9.5px; color: #6B7A72; margin-top: 5px; }
    .section-title {
      font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
      color: #17483A; margin: 18px 0 8px; padding-bottom: 5px;
      border-bottom: 1px solid #DFE4DE;
    }
    .day { margin-bottom: 12px; break-inside: avoid; }
    .day h3 {
      font-size: 11px; color: #1B2A24; margin-bottom: 5px;
      display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
    }
    .day h3 > span:first-child { min-width: 0; }
    .day-count { font-size: 9px; font-weight: 500; color: #6B7A72; text-transform: none; letter-spacing: 0; white-space: nowrap; flex: 0 0 auto; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: fixed; }
    thead { display: table-header-group; }
    th {
      font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.05em;
      color: #17483A; text-align: left; padding: 5px 6px;
      background: #EFF3EE; border-bottom: 1px solid #DFE4DE;
    }
    td { padding: 5px 6px; border-bottom: 1px solid #F0F2EE; vertical-align: top; overflow-wrap: anywhere; }
    tr { break-inside: avoid; }
    tr.is-done .col-task { color: #6B7A72; text-decoration: line-through; }
    .col-state { width: 18px; }
    .col-by { width: 84px; }
    th.col-task, td.col-task { width: 30%; }
    .tick { color: #17483A; font-weight: 700; }
    .chip { font-size: 8px; padding: 1px 5px; border-radius: 99px; white-space: nowrap; }
    .chip-weekly { background: #E4EEE7; color: #17483A; font-weight: 700; }
    .chip-moved { background: #F6EBD8; color: #A9761B; font-style: italic; }
    .pri { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
    .pri-low { color: #17483A; }
    .pri-medium { color: #A9761B; }
    .pri-high { color: #BE4A34; }
    .status { font-size: 8.5px; font-weight: 700; padding: 2px 6px; border-radius: 99px; }
    .status-open { background: #F7E4E0; color: #BE4A34; }
    .status-progress { background: #F6EBD8; color: #A9761B; }
    .status-closed { background: #E4EEE7; color: #17483A; }
    .empty { color: #6B7A72; font-style: italic; padding: 8px 6px; }
    .foot {
      display: flex; justify-content: space-between;
      margin-top: 22px; padding-top: 10px; border-top: 1px solid #DFE4DE;
      font-size: 9px; color: #6B7A72;
    }
    @media print { .stat, thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  `;

  // Builds a self-contained, print-ready report and opens the browser's print
  // dialog, where "Save as PDF" produces a real PDF. Doing it this way means no
  // PDF library to download and no dependency on a print service: the document
  // is rendered by the browser the caretaker already has.
  function openPrintableReport() {
    const completed = tasks.filter(function (t) { return t.done; }).length;
    const carried = tasks.filter(function (t) { return t.moved && !t.done; }).length;
    const overdue = tasks.filter(function (t) { return t.day && t.day < todayDate && !t.done; }).length;
    const unscheduled = tasks.filter(function (t) { return !t.day; }).length;
    const openIssues = complaints.filter(function (c) { return c.status !== "closed"; }).length;
    const resolvedIssues = complaints.filter(function (c) { return c.status === "closed"; }).length;
    const rangeText = document.getElementById("reportRange").textContent;
    const generated = new Date().toLocaleString([], {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    const completionPct = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

    // Group the tasks by day so the report reads like a week, not a flat list.
    const byDate = {};
    tasks.forEach(function (t) {
      const key = t.day || "unscheduled";
      (byDate[key] = byDate[key] || []).push(t);
    });
    const orderedDates = Object.keys(byDate).sort(function (a, b) {
      if (a === "unscheduled") return 1;
      if (b === "unscheduled") return -1;
      return a < b ? -1 : 1;
    });

    const dayBlocks = orderedDates.map(function (key) {
      const rows = byDate[key].map(function (t) {
        return '<tr class="' + (t.done ? "is-done" : "") + '">' +
          '<td class="col-state"><span class="tick">' + (t.done ? "&#10003;" : "") + '</span></td>' +
          '<td class="col-task">' + escapeHtml(t.title) +
            (t.recurring ? ' <span class="chip chip-weekly">Weekly</span>' : "") +
            (t.moved ? ' <span class="chip chip-moved">moved from ' + escapeHtml(dateLabel(t.moved)) + '</span>' : "") +
          '</td>' +
          '<td>' + escapeHtml(t.location) + '</td>' +
          '<td><span class="pri pri-' + t.priority + '">' + t.priority + '</span></td>' +
          '<td>' + escapeHtml(assigneeLabel(t.assignee)) + '</td>' +
          '<td class="col-by">' + escapeHtml(t.createdBy || "-") + '</td>' +
          '</tr>';
      }).join("");
      return '<section class="day">' +
        '<h3>' + escapeHtml(dateLabel(key === "unscheduled" ? "" : key)) +
        '<span class="day-count">' + byDate[key].length + ' task' + (byDate[key].length === 1 ? '' : 's') + '</span></h3>' +
        '<table><thead><tr>' +
        '<th class="col-state"></th><th>Task</th><th>Location</th><th>Priority</th><th>Assigned to</th><th class="col-by">Created by</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
        '</section>';
    }).join("");

    const complaintRows = complaints.map(function (c) {
      const label = c.status === "open" ? "Open" : c.status === "progress" ? "In progress" : "Resolved";
      return '<tr><td>' + escapeHtml(c.owner) + '</td><td>' + escapeHtml(c.apt) + '</td>' +
        '<td>' + escapeHtml(c.type) + '</td><td>' + escapeHtml(c.age) + '</td>' +
        '<td><span class="status status-' + c.status + '">' + label + '</span></td>' +
        '<td>' + escapeHtml(c.note || "-") + '</td></tr>';
    }).join("");

    const shoppingRows = shopping.length
      ? shopping.map(function (i) {
          return '<tr><td>' + escapeHtml(i.label) + '</td><td>x' + i.qty + '</td><td>' +
            escapeHtml(i.addedBy || "-") + '</td></tr>';
        }).join("")
      : '<tr><td colspan="3" class="empty">Nothing outstanding</td></tr>';

    const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
      '<title>Sharondale weekly report ' + escapeHtml(rangeText) + '</title>' +
      '<style>' + REPORT_CSS + '</style></head><body>' +
      '<header class="head">' +
        '<div class="brand"><span class="mark"></span><div>' +
          '<div class="wordmark">SHARONDALE</div>' +
          '<div class="sub">Caretaker operations</div>' +
        '</div></div>' +
        '<div class="head-right">' +
          '<h1>Weekly report</h1>' +
          '<div class="period">' + escapeHtml(rangeText) + '</div>' +
          '<div class="generated">Generated ' + escapeHtml(generated) + '</div>' +
        '</div>' +
      '</header>' +
      '<section class="stats">' +
        statCard(completed, "Completed", "green") +
        statCard(carried, "Carried over", "amber") +
        statCard(overdue, "Overdue", "coral") +
        statCard(unscheduled, "Unscheduled", "muted") +
        statCard(openIssues, "Open issues", "coral") +
        statCard(resolvedIssues, "Issues resolved", "green") +
      '</section>' +
      '<section class="bar-wrap">' +
        '<div class="bar-label"><span>Completion this week</span><b>' + completionPct + '%</b></div>' +
        '<div class="bar"><span style="width:' + completionPct + '%"></span></div>' +
        '<div class="bar-foot">' + completed + ' of ' + tasks.length + ' logged tasks done' +
          (shopping.length ? ' &middot; ' + shopping.length + ' shopping item' + (shopping.length === 1 ? '' : 's') + ' outstanding' : '') +
        '</div>' +
      '</section>' +
      '<h2 class="section-title">Task detail</h2>' +
      (dayBlocks || '<p class="empty">No tasks logged for this week.</p>') +
      '<h2 class="section-title">Owner complaints &amp; reports</h2>' +
      (complaints.length
        ? '<table><thead><tr><th>Owner</th><th>Apartment</th><th>Type</th><th>Age</th><th>Status</th><th>Action taken</th></tr></thead><tbody>' + complaintRows + '</tbody></table>'
        : '<p class="empty">No complaints recorded.</p>') +
      '<h2 class="section-title">Shopping list outstanding</h2>' +
      '<table><thead><tr><th>Item</th><th>Qty</th><th>Added by</th></tr></thead><tbody>' + shoppingRows + '</tbody></table>' +
      '<footer class="foot">' +
        '<span>Prepared by ' + escapeHtml(currentUser || "Caretaker") + '</span>' +
        '<span>Sharondale Residence &middot; ' + escapeHtml(rangeText) + '</span>' +
      '</footer>' +
      '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},350);});<' + '/script>' +
      '</body></html>';

    const win = window.open("", "_blank");
    if (!win) {
      toast("Allow pop-ups to open the report");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    logActivity("Opened the weekly report for printing");
    toast("Report ready - choose Save as PDF");
  }

  function statCard(value, label, tone) {
    return '<div class="stat stat-' + tone + '"><div class="num">' + value + '</div>' +
      '<div class="lbl">' + escapeHtml(label) + '</div></div>';
  }

  // PDF is the primary action; the plain-text export stays available for anyone
  // who wants to paste the figures into something else.
  document.getElementById("downloadReport").addEventListener("click", openPrintableReport);

  document.getElementById("downloadReportText").addEventListener("click", function () {
    const completed = tasks.filter(function (t) { return t.done; }).length;
    const carried = tasks.filter(function (t) { return t.moved && !t.done; }).length;
    const overdue = tasks.filter(function (t) { return t.day && t.day < todayDate && !t.done; }).length;
    const unscheduled = tasks.filter(function (t) { return !t.day; }).length;
    const lines = [
      "SHARONDALE - WEEKLY OPERATIONS REPORT",
      document.getElementById("reportRange").textContent,
      "",
      "Completed tasks: " + completed,
      "Carried over: " + carried,
      "Overdue: " + overdue,
      "Unscheduled: " + unscheduled,
      "Total tasks logged: " + tasks.length,
      "Owner issues resolved: " + complaints.filter(function (c) { return c.status === 'closed'; }).length,
      "Open issues remaining: " + complaints.filter(function (c) { return c.status !== 'closed'; }).length,
      "Shopping items outstanding: " + shopping.length,
      "",
      "Task detail:"
    ].concat(tasks.map(function (t) {
      return " - [" + (t.done ? "x" : " ") + "] " + dateLabel(t.day) + ": " + t.title + " (" + t.location + ", " + t.priority + " priority, " + assigneeLabel(t.assignee) + ")" + (t.moved ? " - moved from " + dateLabel(t.moved) : "");
    })).concat(shopping.length ? ["", "Shopping list detail:"].concat(shopping.map(function (i) {
      return " - x" + i.qty + " " + i.label;
    })) : []);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sharondale-weekly-report.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Plain-text report downloaded");
  });

  document.getElementById("bellBtn").addEventListener("click", function () {
    document.querySelectorAll(".nav-item[data-view]").forEach(function (n) { n.classList.toggle("active", n.dataset.view === "complaints"); });
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    document.getElementById("view-complaints").classList.add("active");
  });

  /* ---------------- Init ---------------- */
  // The board now comes from the server, so booting is asynchronous: render
  // the shell immediately, then swap in whatever the backend holds. While the
  // fetch is in flight the seeded demo data is on screen rather than a blank
  // page, and if the API is unreachable the offline cache takes over.
  function start() {
    fillStaffSelect(composerAssignee);
    logActivity("Shift started - connecting to the server");
    // Deliberately nothing is drawn yet. The sample board in this file is only
    // ever a placeholder for the moment or two before the server answers, and
    // drawing it first is how a page with no backend ended up showing a full
    // board. renderAll() runs from the load below.

    // Whoever used this browser last stays selected; it is a convenience, not
    // shared state, so it is kept locally rather than on the server.
    try {
      const remembered = localStorage.getItem("sharondaleCurrentUser");
      if (remembered) currentUser = remembered;
    } catch (e) { /* optional */ }

    loadBoardData().then(function (board) {
      // A page with no backend is labelled before anything else is rendered, so
      // the sample board is never mistaken for saved data.
      renderSyncBanner();
      if (backendMissing) {
        setSaveState("offline");
        // Nothing on screen came from anywhere: it is the sample in this file.
        // Start from a blank board instead, so there are no figures, tasks or
        // "completed today" counts to mistake for real ones.
        tasks.length = 0;
        complaints.length = 0;
        shopping.length = 0;
        recurringTasks = [];
        people = [];
        phonebook = [];
        requests = [];
        currentUser = "";
        fillStaffSelect(composerAssignee);
        refreshPeopleSelects();
        logActivity("No backend answered - nothing is being saved; this board is empty");
        renderAll();
        renderComplaints();
        renderRequests();
        renderShopping();
        renderPeople();
        renderPhonebook();
        return;
      }
      if (board) {
        boardLoaded = true;
        tasks.length = 0;
        board.tasks.forEach(function (t) { tasks.push(t); });
        complaints.length = 0;
        board.complaints.forEach(function (c) { complaints.push(c); });
        shopping.length = 0;
        board.shopping.forEach(function (i) { shopping.push(i); });
        recurringTasks = board.recurring || [];
        people = board.people || [];
        phonebook = board.phonebook || [];
        requests = board.requests || [];
        // Start new ids above anything the server already holds, so a contact
        // added in this session cannot collide with an existing one.
        phonebookUid = phonebook.length + 1;
        requestUid = requests.length + 1;
        applyRecurringTasks();
        logActivity(serverReachable
          ? "Board loaded from the server"
          : "Board loaded from the offline copy");
      }
      if (!people.some(function (p) { return p.name === currentUser; })) {
        currentUser = people.length ? people[0].name : "";
      }
      refreshPeopleSelects();
      // Render before saving, not after: seed.mjs already seeds a new database,
      // so the tasks this pushes up are the sample board on screen. Drawing it
      // first made it look like data; drawing it after the write confirmed only
      // shows those rows if the server actually kept them.
      renderAll();
      renderComplaints();
      renderRequests();
      renderShopping();
      renderPeople();
      renderPhonebook();
      // Seed the server on a first ever run so a new deployment is not empty.
      // Only ever with the sample still in place: an empty board that came from
      // the server is the caretaker's board, not a new deployment.
      if (serverReachable && !boardLoaded &&
          tasks.length === 0 && complaints.length === 0 && shopping.length === 0) {
        saveBoardData();
      }
      setSaveState(serverReachable ? "saved" : "offline");
      // Establishing read access does not prove write access, so probe with a
      // no-op save. If the server wants a code, the chip says so rather than the
      // caretaker discovering it when their first change appears to vanish.
      if (serverReachable) probeWriteAccess();
      watchForOtherDevices();
    });
  }

  async function probeWriteAccess() {
    if (!serverReachable) return;
    try {
      const res = await api("/board", { method: "PUT", body: JSON.stringify(boardPayload()) });
      if (res.status === 401) {
        needsToken = true;
        setSaveState("locked");
        offerUnlock();
      }
    } catch (error) {
      /* the retry loop and the offline chip already cover this */
    }
  }

  // Live sync: the backend pushes an event whenever any device writes, so a
  // change made on one machine appears on the others without a manual reload.
  // Not supported everywhere, so failure here is silent and harmless.
  function watchForOtherDevices() {
    if (typeof EventSource === "undefined") return;
    try {
      // Only a same-origin dashboard gets the live stream. A cross-origin one
      // (the static site on GitHub Pages) skips it: the browser would refuse to
      // reconnect after the very first event, so it would only add console
      // errors. That page still saves normally, it just does not update live.
      const sameOrigin = /^https?:\/\//.test(API_BASE)
        ? API_BASE.indexOf(location.origin + "/") === 0
        : !/^\/\//.test(API_BASE);
      if (!sameOrigin) return;
      const stream = new EventSource(API_BASE + "/events");
      // An open SSE stream keeps the browser's load/network-idle state busy, so
      // close it on unload and when the tab is hidden. Without this a reload has
      // to wait on the old socket and the dashboard can appear to hang.
      window.addEventListener("beforeunload", function () { stream.close(); });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") stream.close();
      });
      stream.addEventListener("board", function () {
        // Ignore our own writes: they are already on screen and mid-edit state
        // would otherwise be thrown away under the caretaker.
        if (pendingSync || saveState === "saving") return;
        api("/board", { method: "GET" })
          .then(function (res) { return res.ok ? res.json() : null; })
          .then(function (board) {
            if (!board) return;
            boardLoaded = true;
            tasks.length = 0;
            (board.tasks || []).filter(isValidTask).map(normalizeTask)
              .forEach(function (t) { tasks.push(t); });
            complaints.length = 0;
            (board.complaints || []).filter(isValidComplaint)
              .forEach(function (c) { complaints.push(c); });
            shopping.length = 0;
            (board.shopping || []).filter(isValidShoppingItem)
              .forEach(function (i) { shopping.push(i); });
            recurringTasks = board.recurring || [];
            people = board.people || people;
            phonebook = board.phonebook || phonebook;
            requests = (board.requests || []).filter(isValidRequest).map(normalizeRequest);
            refreshPeopleSelects();
            renderPeople();
            renderPhonebook();
            applyRecurringTasks();
            renderAll();
            renderComplaints();
            renderRequests();
            renderShopping();
          })
          .catch(function () { /* transient; the next event will resync */ });
      });
      stream.onerror = function () { /* EventSource retries on its own */ };
    } catch (error) {
      /* live sync is a bonus, not a requirement */
    }
  }

  start();
})();
