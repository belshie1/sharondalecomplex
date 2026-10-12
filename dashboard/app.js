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

  // People a task can be assigned to. "Unassigned" is represented by an empty
  // assignee value rather than a roster entry.
  const STAFF = ["Marco Conti", "Elena Ruiz", "Tomas Brandt", "Priya Nair"];
  const UNASSIGNED = "";
  function assigneeLabel(value) {
    return value ? value : "Unassigned";
  }

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

  /* ---------------- Helpers ---------------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m];
    });
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
  const RECURRING_TASKS_KEY = "sharondaleRecurringTasks";
  let recurringTasks = [];

  // ---- Durable store ----------------------------------------------------
  // The whole board is kept in localStorage so a task is never lost on
  // reload. Nothing here is destructive: a parse failure falls back to the
  // seed data rather than wiping what the caretaker already has.
  function isValidTask(t) {
    return t && typeof t.id === "number" &&
      typeof t.title === "string" && typeof t.location === "string" &&
      (t.day === UNASSIGNED_DATE || typeof t.day === "string") &&
      ["low", "medium", "high"].indexOf(t.priority) !== -1 &&
      typeof t.done === "boolean";
  }
  function isValidComplaint(c) {
    return c && typeof c.id === "number" && typeof c.owner === "string" &&
      ["open", "progress", "closed"].indexOf(c.status) !== -1;
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
  function saveBoardData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tasks: tasks, complaints: complaints }));
      setSaveState("saved");
      return true;
    } catch (error) {
      setSaveState("error");
      toast("Could not save your board: " + error.message);
      return false;
    }
  }
  function loadBoardData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === null) return null;
      const parsed = JSON.parse(saved);
      if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.complaints)) {
        throw new Error("Saved board has an unexpected shape.");
      }
      return {
        tasks: parsed.tasks.filter(isValidTask).map(normalizeTask),
        complaints: parsed.complaints.filter(isValidComplaint)
      };
    } catch (error) {
      toast("Could not read your saved board: " + error.message);
      return null;
    }
  }
  function loadRecurringTasks() {
    try {
      const saved = localStorage.getItem(RECURRING_TASKS_KEY);
      if (saved === null) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.some(function (task) {
        return !task || typeof task.id !== "string" ||
          typeof task.title !== "string" || typeof task.location !== "string" ||
          DAY_KEYS.indexOf(task.day) === -1 ||
          ["low", "medium", "high"].indexOf(task.priority) === -1;
      })) {
        throw new Error("Saved weekly tasks have an invalid format.");
      }
      return parsed;
    } catch (error) {
      toast("Could not load weekly tasks: " + error.message);
      return [];
    }
  }
  function saveRecurringTasks(updatedTasks) {
    try {
      localStorage.setItem(RECURRING_TASKS_KEY, JSON.stringify(updatedTasks));
      recurringTasks = updatedTasks;
      return true;
    } catch (error) {
      toast("Could not save weekly task: " + error.message);
      return false;
    }
  }
  recurringTasks = loadRecurringTasks();
  recurringTasks.forEach(function (task) {
    tasks.push({
      id: uid++,
      title: task.title,
      location: task.location,
      day: task.day,
      priority: task.priority,
      assignee: typeof task.assignee === "string" ? task.assignee : UNASSIGNED,
      done: false,
      photo: null,
      moved: null,
      recurring: true,
      recurringId: task.id
    });
  });
  // Restore the saved board over the seed data. Recurring templates are
  // re-applied above on every load, so they are excluded from the snapshot.
  const savedBoard = loadBoardData();
  if (savedBoard) {
    tasks.length = 0;
    savedBoard.tasks.forEach(function (t) { tasks.push(t); });
    complaints.length = 0;
    savedBoard.complaints.forEach(function (c) { complaints.push(c); });
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
    el.classList.toggle("saving", state === "saving");
    el.classList.toggle("error", state === "error");
    el.textContent = state === "error" ? "Could not save" : "Saved";
  }
  // Persist on every meaningful interaction, and once more if the tab is
  // closed mid-change so nothing is lost.
  function markSaving() { setSaveState("saving"); saveBoardData(); }
  window.addEventListener("beforeunload", function () { saveBoardData(); });
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
      '<div class="t-meta"><span class="t-pill">' + (t.priority[0].toUpperCase() + t.priority.slice(1)) + ' priority</span>' +
      (t.recurring ? '<span class="t-recurring">Weekly</span>' : "") +
      (t.moved ? ('<span class="t-moved">Moved from ' + DAY_NAMES[t.moved] + '</span>') : "") +
      '<span class="t-actions">' +
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

  /* ---------------- KPIs & focus panel ---------------- */
  function renderKpis() {
    const todays = tasks.filter(function (t) { return t.day === todayDate; });
    const todayDone = todays.filter(function (t) { return t.done; }).length;
    const weekDone = tasks.filter(function (t) { return t.done; }).length;
    const openIssues = complaints.filter(function (c) { return c.status !== "closed"; }).length;

    document.getElementById("kpiToday").textContent = todays.length;
    document.getElementById("kpiTodayFoot").textContent = todayDone + " completed so far";
    document.getElementById("kpiDone").textContent = weekDone;
    document.getElementById("kpiDoneFoot").textContent = "of " + tasks.length + " logged tasks";
    document.getElementById("kpiIssues").textContent = openIssues;
    document.getElementById("navComplaintCount").textContent = openIssues;
    document.getElementById("bellBadge").textContent = openIssues;
    document.getElementById("bellBtn").title = openIssues + " unresolved issue" + (openIssues === 1 ? "" : "s");

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
        dragId = Number(card.dataset.id);
        dragMoved = false;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", function () {
        card.classList.remove("dragging");
      });
      card.addEventListener("click", function (e) {
        if (dragMoved || e.target.closest(".task-delete") || e.target.closest(".task-edit")) return;
        const t = tasks.find(function (x) { return x.id === Number(card.dataset.id); });
        if (!t) return;
        t.done = !t.done;
        logActivity((t.done ? "Completed" : "Reopened") + " \"" + t.title + "\"");
        markSaving();
        renderAll();
      });
      card.addEventListener("keydown", function (e) {
        if (e.target.closest(".task-delete") || e.target.closest(".task-edit")) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          card.click();
        }
      });
      card.querySelector(".task-edit").addEventListener("click", function (e) {
        e.stopPropagation();
        const task = tasks.find(function (x) { return x.id === Number(card.dataset.id); });
        if (task) openEditModal(task);
      });
      card.querySelector(".task-delete").addEventListener("click", function (e) {
        e.stopPropagation();
        const task = tasks.find(function (x) { return x.id === Number(card.dataset.id); });
        if (task) requestTaskRemoval(task);
      });
    });
  }

  // Unscheduled tasks live in the sidebar and are dragged onto a day column.
  // They keep the same id, so the drag-and-drop wiring is shared with the board.
  function attachBacklogEvents() {
    document.querySelectorAll(".backlog-item").forEach(function (item) {
      item.addEventListener("dragstart", function (e) {
        dragId = Number(item.dataset.id);
        dragMoved = false;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      item.addEventListener("dragend", function () {
        item.classList.remove("dragging");
      });
      // Keyboard/touch fallback: focus an item, press Enter, then a day.
      item.addEventListener("click", function () {
        const t = tasks.find(function (x) { return x.id === Number(item.dataset.id); });
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
  let pendingDeleteTaskId = null;

  function requestTaskRemoval(task) {
    pendingDeleteTaskId = task.id;
    deleteModal.querySelector(".delete-description").textContent = task.recurring
      ? 'Remove "' + task.title + '" and stop it from repeating every week?'
      : 'Remove "' + task.title + '" from this week’s board?';
    deletePassword.value = "";
    deleteError.textContent = "";
    deleteModal.classList.add("open");
    deletePassword.focus();
  }

  function closeDeleteModal() {
    deleteModal.classList.remove("open");
    deleteForm.reset();
    deleteError.textContent = "";
    pendingDeleteTaskId = null;
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

  deleteForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (deletePassword.value !== DELETE_PASSWORD) {
      deleteError.textContent = "Incorrect password. The task was not removed.";
      deletePassword.select();
      return;
    }
    const taskId = pendingDeleteTaskId;
    closeDeleteModal();
    if (taskId !== null) removeTask(taskId);
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
    select.innerHTML = '<option value="">Unassigned</option>' + STAFF.map(function (name) {
      return '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>';
    }).join("");
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
    editAssigneeSelect.value = STAFF.indexOf(task.assignee) === -1 ? "" : task.assignee;
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
        const t = tasks.find(function (x) { return x.id === dragId; });
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
        assignee: assignee
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
      done: false,
      photo: pendingPhoto,
      moved: null,
      recurring: isRecurring,
      recurringId: isRecurring ? recurringTasks[recurringTasks.length - 1].id : null
    });
    logActivity(newDate
      ? "Added \"" + title + "\" to " + dateLabel(newDate) + (assignee ? " - assigned to " + assignee : "")
      : "Added \"" + title + "\" to Unscheduled" + (assignee ? " - assigned to " + assignee : ""));
    toast(isRecurring ? "Weekly task added and saved"
      : newDate ? "Task added to the board" : "Task parked in Unscheduled");
    document.getElementById("f-title").value = "";
    document.getElementById("f-location").value = "";
    document.getElementById("f-priority").value = "medium";
    composerAssignee.value = "";
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
    const t = tasks.find(function (x) { return x.id === dragId; });
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
  }

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

  document.getElementById("downloadReport").addEventListener("click", function () {
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
      "",
      "Task detail:"
    ].concat(tasks.map(function (t) {
      return " - [" + (t.done ? "x" : " ") + "] " + dateLabel(t.day) + ": " + t.title + " (" + t.location + ", " + t.priority + " priority, " + assigneeLabel(t.assignee) + ")" + (t.moved ? " - moved from " + dateLabel(t.moved) : "");
    }));
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sharondale-weekly-report.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Weekly report downloaded");
  });

  document.getElementById("bellBtn").addEventListener("click", function () {
    document.querySelectorAll(".nav-item[data-view]").forEach(function (n) { n.classList.toggle("active", n.dataset.view === "complaints"); });
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    document.getElementById("view-complaints").classList.add("active");
  });

  /* ---------------- Init ---------------- */
  fillStaffSelect(composerAssignee);
  logActivity("Shift started - board synced");
  setSaveState("saved");
  renderAll();
  renderComplaints();
  saveBoardData();
})();
