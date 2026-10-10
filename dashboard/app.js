(function(){
  "use strict";

  /* ---------------- Date / week setup ---------------- */
  const DAY_KEYS = ["mon","tue","wed","thu","fri","sat","sun"];
  const DAY_NAMES = {mon:"Mon",tue:"Tue",wed:"Wed",thu:"Thu",fri:"Fri",sat:"Sat",sun:"Sun"};

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
  const todayKey = DAY_KEYS[ (jsDay === 0 ? 6 : jsDay - 1) ];

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const WEEKDAY_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  document.getElementById("todayLabel").textContent = WEEKDAY_FULL[jsDay] + ", " + now.getDate() + " " + MONTHS[now.getMonth()];
  const rangeText = "Mon " + weekDates[0].getDate() + " - Sun " + weekDates[6].getDate() + " " + MONTHS[weekDates[6].getMonth()] + " - Sharondale Residence";
  document.getElementById("weekRange").textContent = rangeText;
  document.getElementById("reportRange").textContent = weekDates[0].getDate() + " - " + weekDates[6].getDate() + " " + MONTHS[weekDates[6].getMonth()];

  /* ---------------- Data model ---------------- */
  let uid = 100;
  const tasks = [
    { id: uid++, title:"Pool filter back-flush", location:"Clubhouse - Pool deck", day:"mon", priority:"medium", done:true, photo:null, moved:null },
    { id: uid++, title:"Replace hallway bulb", location:"Block A - Floor 3", day:"mon", priority:"low", done:true, photo:null, moved:null },
    { id: uid++, title:"Elevator safety check", location:"Block B - Lobby", day:"tue", priority:"high", done:false, photo:null, moved:null },
    { id: uid++, title:"Irrigation timer reset", location:"Garden - Zone 2", day:"tue", priority:"low", done:false, photo:null, moved:null },
    { id: uid++, title:"Fix leaking tap - unit 14", location:"Block C - Unit 14", day:todayKey, priority:"high", done:false, photo:"gradient", moved:null },
    { id: uid++, title:"Gate motor lubrication", location:"Main entrance", day:todayKey, priority:"medium", done:false, photo:null, moved:null },
    { id: uid++, title:"Litter sweep - car park", location:"Basement P1", day:todayKey, priority:"low", done:true, photo:null, moved:null },
    { id: uid++, title:"Replace fire extinguisher tag", location:"Block A - Stairwell", day:"thu", priority:"medium", done:false, photo:null, moved:null },
    { id: uid++, title:"Clean gutters - east wing", location:"Block B - Roof", day:"fri", priority:"medium", done:false, photo:null, moved:null },
    { id: uid++, title:"Repaint parking bay lines", location:"Visitor car park", day:"sat", priority:"low", done:false, photo:null, moved:null },
  ];

  const complaints = [
    { id: 1, owner:"L. Marchetti", apt:"Block A - 12", type:"Noise complaint", age:"2 days", status:"open", note:null },
    { id: 2, owner:"R. Novak", apt:"Block C - 04", type:"Plumbing leak", age:"5 hours", status:"open", note:null },
    { id: 3, owner:"S. Haddad", apt:"Block B - 21", type:"Elevator fault", age:"1 day", status:"progress", note:null },
    { id: 4, owner:"P. Dumont", apt:"Block A - 07", type:"Parking dispute", age:"3 days", status:"open", note:null },
    { id: 5, owner:"A. Keller", apt:"Block D - 15", type:"Pest control", age:"6 days", status:"closed", note:"Technician treated unit, follow-up in 2 weeks." },
  ];

  /* ---------------- Helpers ---------------- */
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(m){
      return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[m];
    });
  }
  function toast(msg){
    const stack = document.getElementById("toastStack");
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg><span>' + escapeHtml(msg) + '</span>';
    stack.appendChild(el);
    setTimeout(function(){ el.classList.add("leaving"); setTimeout(function(){ el.remove(); }, 260); }, 2800);
  }
  function timeNow(){
    const d = new Date();
    return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  }
  let activityLog = [];
  function logActivity(text){
    activityLog.unshift({text: text, time: timeNow()});
    activityLog = activityLog.slice(0, 12);
    renderActivity();
  }
  function renderActivity(){
    const list = document.getElementById("activityList");
    list.innerHTML = activityLog.map(function(a){
      return '<div class="activity-item"><span class="a-dot"></span><div><span class="a-text">' + escapeHtml(a.text) + '</span><span class="a-time">' + a.time + '</span></div></div>';
    }).join("");
  }

  /* ---------------- Render: board header ---------------- */
  function renderBoardHeader(){
    const el = document.getElementById("boardHeader");
    el.innerHTML = DAY_KEYS.map(function(k,i){
      const d = weekDates[i];
      const count = tasks.filter(function(t){ return t.day === k; }).length;
      return '<div class="day-head ' + (k===todayKey ? 'today':'') + '">' +
        '<span class="name">' + DAY_NAMES[k] + '</span>' +
        '<span class="marker"></span>' +
        '<span class="num">' + d.getDate() + '</span>' +
        '<span class="task-count ' + (count===0?'zero':'') + '">' + count + ' task' + (count===1?'':'s') + '</span>' +
        '</div>';
    }).join("");
  }

  /* ---------------- Render: board body ---------------- */
  function taskCardHtml(t){
    const thumb = t.photo ? ('<div class="t-thumb">' + (t.photo && t.photo!=="gradient" ? ('<img src="' + t.photo + '" alt="">') : "") + '</div>') : "";
    return '<div class="task-card priority-' + t.priority + ' ' + (t.done ? 'done':'') + '" draggable="true" data-id="' + t.id + '" tabindex="0">' +
      '<span class="drag-handle"><svg class="icon" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg></span>' +
      '<div class="t-top"><span class="status-dot"></span><div style="min-width:0;">' +
      '<div class="t-title">' + escapeHtml(t.title) + '</div>' +
      '<div class="t-loc"><svg class="icon" viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/></svg>' + escapeHtml(t.location) + '</div>' +
      '</div></div>' +
      thumb +
      '<div class="t-meta"><span class="t-pill">' + (t.priority[0].toUpperCase()+t.priority.slice(1)) + ' priority</span>' +
      (t.moved ? ('<span class="t-moved">Moved from ' + DAY_NAMES[t.moved] + '</span>') : "") +
      '</div></div>';
  }

  function renderBoardBody(){
    const el = document.getElementById("boardBody");
    el.innerHTML = DAY_KEYS.map(function(k){
      const dayTasks = tasks.filter(function(t){ return t.day === k; });
      return '<div class="day-col ' + (dayTasks.length===0?'is-empty':'') + '" data-day="' + k + '">' + dayTasks.map(taskCardHtml).join("") + '</div>';
    }).join("");
    attachCardEvents();
    attachColumnEvents();
  }

  /* ---------------- KPIs & focus panel ---------------- */
  function renderKpis(){
    const todays = tasks.filter(function(t){ return t.day === todayKey; });
    const todayDone = todays.filter(function(t){ return t.done; }).length;
    const weekDone = tasks.filter(function(t){ return t.done; }).length;
    const openIssues = complaints.filter(function(c){ return c.status !== "closed"; }).length;

    document.getElementById("kpiToday").textContent = todays.length;
    document.getElementById("kpiTodayFoot").textContent = todayDone + " completed so far";
    document.getElementById("kpiDone").textContent = weekDone;
    document.getElementById("kpiDoneFoot").textContent = "of " + tasks.length + " this week's tasks";
    document.getElementById("kpiIssues").textContent = openIssues;
    document.getElementById("navComplaintCount").textContent = openIssues;

    const pct = todays.length ? Math.round((todayDone/todays.length)*100) : 0;
    const circumference = 2 * Math.PI * 33;
    const ring = document.getElementById("ringFg");
    ring.setAttribute("stroke-dasharray", circumference.toFixed(1));
    ring.setAttribute("stroke-dashoffset", (circumference * (1 - pct/100)).toFixed(1));
    document.getElementById("ringValue").textContent = todayDone + " / " + todays.length;

    document.getElementById("legendHigh").textContent = tasks.filter(function(t){ return t.priority==="high" && !t.done; }).length;
    document.getElementById("legendMed").textContent = tasks.filter(function(t){ return t.priority==="medium" && !t.done; }).length;
    document.getElementById("legendLow").textContent = tasks.filter(function(t){ return t.priority==="low" && !t.done; }).length;
  }

  function renderAll(){
    renderBoardHeader();
    renderBoardBody();
    renderKpis();
  }

  /* ---------------- Drag & drop + completion toggle ---------------- */
  let dragId = null;
  let dragMoved = false;

  function attachCardEvents(){
    document.querySelectorAll(".task-card").forEach(function(card){
      card.addEventListener("dragstart", function(e){
        dragId = Number(card.dataset.id);
        dragMoved = false;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", function(){
        card.classList.remove("dragging");
      });
      card.addEventListener("click", function(){
        if(dragMoved) return;
        const t = tasks.find(function(x){ return x.id === Number(card.dataset.id); });
        if(!t) return;
        t.done = !t.done;
        logActivity((t.done ? "Completed" : "Reopened") + " \"" + t.title + "\"");
        renderAll();
      });
      card.addEventListener("keydown", function(e){
        if(e.key === "Enter" || e.key === " "){
          e.preventDefault();
          card.click();
        }
      });
    });
  }

  function attachColumnEvents(){
    document.querySelectorAll(".day-col").forEach(function(col){
      col.addEventListener("dragover", function(e){
        e.preventDefault();
        col.classList.add("drag-over");
      });
      col.addEventListener("dragleave", function(){ col.classList.remove("drag-over"); });
      col.addEventListener("drop", function(e){
        e.preventDefault();
        col.classList.remove("drag-over");
        dragMoved = true;
        const t = tasks.find(function(x){ return x.id === dragId; });
        const newDay = col.dataset.day;
        if(t && t.day !== newDay){
          const fromDay = t.day;
          t.moved = fromDay;
          t.day = newDay;
          logActivity("Moved \"" + t.title + "\" from " + DAY_NAMES[fromDay] + " to " + DAY_NAMES[newDay]);
          renderAll();
        }
        setTimeout(function(){ dragMoved = false; }, 50);
      });
    });
  }

  /* ---------------- Composer ---------------- */
  const daySelect = document.getElementById("f-day");
  daySelect.innerHTML = DAY_KEYS.map(function(k,i){
    return '<option value="' + k + '" ' + (k===todayKey?'selected':'') + '>' + DAY_NAMES[k] + ' ' + weekDates[i].getDate() + '</option>';
  }).join("");

  const composer = document.getElementById("composer");
  document.getElementById("composerToggle").addEventListener("click", function(){
    composer.classList.toggle("collapsed");
  });

  let pendingPhoto = null;
  function wirePhotoInput(){
    const input = document.getElementById("f-photo");
    input.addEventListener("change", function(e){
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = function(ev){
        pendingPhoto = ev.target.result;
        document.getElementById("photoDrop").innerHTML = '<img src="' + pendingPhoto + '" alt="Preview"><input type="file" id="f-photo" accept="image/*">';
        wirePhotoInput();
        document.getElementById("photoHint").textContent = file.name;
      };
      reader.readAsDataURL(file);
    });
  }
  wirePhotoInput();

  function resetPhotoField(){
    pendingPhoto = null;
    document.getElementById("photoDrop").innerHTML = '<svg class="icon" viewBox="0 0 24 24" id="photoIcon"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.2"/></svg><input type="file" id="f-photo" accept="image/*">';
    wirePhotoInput();
    document.getElementById("photoHint").textContent = "Attach a site photo (optional)";
  }

  document.getElementById("clearComposer").addEventListener("click", function(){
    document.getElementById("f-title").value = "";
    document.getElementById("f-location").value = "";
    document.getElementById("f-priority").value = "medium";
    resetPhotoField();
  });

  composer.addEventListener("submit", function(e){
    e.preventDefault();
    const title = document.getElementById("f-title").value.trim();
    const location = document.getElementById("f-location").value.trim();
    if(!title || !location) return;
    const day = document.getElementById("f-day").value;
    const priority = document.getElementById("f-priority").value;
    tasks.push({ id: uid++, title: title, location: location, day: day, priority: priority, done:false, photo: pendingPhoto, moved:null });
    logActivity("Added \"" + title + "\" to " + DAY_NAMES[day]);
    toast("Task added to the board");
    document.getElementById("f-title").value = "";
    document.getElementById("f-location").value = "";
    document.getElementById("f-priority").value = "medium";
    daySelect.value = todayKey;
    resetPhotoField();
    renderAll();
  });

  document.getElementById("newTaskBtn").addEventListener("click", function(){
    document.getElementById("view-tasks").classList.add("active");
    document.getElementById("view-complaints").classList.remove("active");
    document.querySelectorAll(".nav-item[data-view]").forEach(function(n){ n.classList.toggle("active", n.dataset.view === "tasks"); });
    composer.classList.remove("collapsed");
    composer.scrollIntoView({behavior:"smooth", block:"center"});
    document.getElementById("f-title").focus();
  });

  /* ---------------- Nav / tab switching ---------------- */
  document.querySelectorAll(".nav-item[data-view]").forEach(function(btn){
    btn.addEventListener("click", function(){
      document.querySelectorAll(".nav-item[data-view]").forEach(function(n){ n.classList.remove("active"); });
      btn.classList.add("active");
      document.querySelectorAll(".view").forEach(function(v){ v.classList.remove("active"); });
      document.getElementById("view-" + btn.dataset.view).classList.add("active");
    });
  });

  /* ---------------- Complaints ---------------- */
  function complaintRowHtml(c){
    const statusLabel = c.status === "open" ? "Open" : c.status === "progress" ? "In progress" : "Closed";
    return '<div class="complaint-row ' + (c.status==='closed'?'closed':'') + '" data-id="' + c.id + '">' +
      '<div class="c-owner"><div class="who">' + escapeHtml(c.owner) + '</div><div class="apt">' + escapeHtml(c.apt) + '</div></div>' +
      '<div class="c-type">' + escapeHtml(c.type) + '</div>' +
      '<div class="c-age">' + escapeHtml(c.age) + '</div>' +
      '<div><span class="status-chip ' + c.status + '">' + statusLabel + '</span></div>' +
      '<div class="c-actions">' +
      '<button class="btn btn-ghost btn-sm act-create" ' + (c.status==='closed'?'disabled':'') + '>Create task</button>' +
      '<button class="btn btn-coral btn-sm act-close" ' + (c.status==='closed'?'disabled':'') + '>Close with action</button>' +
      '</div>' +
      '<div class="close-note" id="note-' + c.id + '">' +
      '<textarea placeholder="Describe the action taken to resolve this issue..."></textarea>' +
      '<div class="row"><button class="btn btn-ghost btn-sm act-cancel-note">Cancel</button>' +
      '<button class="btn btn-primary btn-sm act-confirm-note">Confirm &amp; close</button></div>' +
      '</div></div>';
  }

  function renderComplaints(){
    document.getElementById("complaintsList").innerHTML = complaints.map(complaintRowHtml).join("");
    document.querySelectorAll(".act-create").forEach(function(btn){
      btn.addEventListener("click", function(){
        const row = btn.closest(".complaint-row");
        const c = complaints.find(function(x){ return x.id === Number(row.dataset.id); });
        tasks.push({
          id: uid++,
          title: "Resolve: " + c.type,
          location: c.apt,
          day: todayKey,
          priority: "high",
          done:false, photo:null, moved:null
        });
        c.status = "progress";
        logActivity("Created task from " + c.owner + "'s report (" + c.type + ")");
        toast("Task created for " + c.owner + "'s issue");
        renderComplaints();
        renderAll();
      });
    });
    document.querySelectorAll(".act-close").forEach(function(btn){
      btn.addEventListener("click", function(){
        const row = btn.closest(".complaint-row");
        document.getElementById("note-" + row.dataset.id).classList.add("open");
      });
    });
    document.querySelectorAll(".act-cancel-note").forEach(function(btn){
      btn.addEventListener("click", function(){
        btn.closest(".close-note").classList.remove("open");
      });
    });
    document.querySelectorAll(".act-confirm-note").forEach(function(btn){
      btn.addEventListener("click", function(){
        const note = btn.closest(".close-note");
        const row = btn.closest(".complaint-row");
        const c = complaints.find(function(x){ return x.id === Number(row.dataset.id); });
        const text = note.querySelector("textarea").value.trim() || "Resolved by caretaker.";
        c.status = "closed";
        c.note = text;
        logActivity("Closed " + c.owner + "'s complaint - \"" + text.slice(0,40) + (text.length>40?'...':'') + "\"");
        toast("Complaint closed with recorded action");
        renderComplaints();
        renderAll();
      });
    });
  }

  /* ---------------- Weekly report modal ---------------- */
  const reportModal = document.getElementById("reportModal");
  function openReport(){
    const completed = tasks.filter(function(t){ return t.done; }).length;
    const carried = tasks.filter(function(t){ return t.moved && !t.done; }).length;
    const overdueDays = DAY_KEYS.slice(0, DAY_KEYS.indexOf(todayKey));
    const overdue = tasks.filter(function(t){ return overdueDays.indexOf(t.day) !== -1 && !t.done; }).length;
    document.getElementById("rCompleted").textContent = completed;
    document.getElementById("rCarried").textContent = carried;
    document.getElementById("rOverdue").textContent = overdue;
    document.getElementById("rTotal").textContent = tasks.length;
    document.getElementById("rResolved").textContent = complaints.filter(function(c){ return c.status==="closed"; }).length;
    document.getElementById("rOpenIssues").textContent = complaints.filter(function(c){ return c.status!=="closed"; }).length;
    reportModal.classList.add("open");
  }
  function closeReport(){ reportModal.classList.remove("open"); }
  document.getElementById("weeklyReportNav").addEventListener("click", openReport);
  document.getElementById("openReportFromTasks").addEventListener("click", openReport);
  document.getElementById("openReportFromComplaints").addEventListener("click", openReport);
  document.getElementById("closeReport").addEventListener("click", closeReport);
  document.getElementById("closeReport2").addEventListener("click", closeReport);
  reportModal.addEventListener("click", function(e){ if(e.target === reportModal) closeReport(); });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape") closeReport(); });

  document.getElementById("downloadReport").addEventListener("click", function(){
    const completed = tasks.filter(function(t){ return t.done; }).length;
    const carried = tasks.filter(function(t){ return t.moved && !t.done; }).length;
    const overdueDays = DAY_KEYS.slice(0, DAY_KEYS.indexOf(todayKey));
    const overdue = tasks.filter(function(t){ return overdueDays.indexOf(t.day) !== -1 && !t.done; }).length;
    const lines = [
      "SHARONDALE - WEEKLY OPERATIONS REPORT",
      document.getElementById("reportRange").textContent,
      "",
      "Completed tasks: " + completed,
      "Carried over: " + carried,
      "Overdue: " + overdue,
      "Total tasks logged: " + tasks.length,
      "Owner issues resolved: " + complaints.filter(function(c){ return c.status==='closed'; }).length,
      "Open issues remaining: " + complaints.filter(function(c){ return c.status!=='closed'; }).length,
      "",
      "Task detail:"
    ].concat(tasks.map(function(t){
      return " - [" + (t.done ? "x" : " ") + "] " + DAY_NAMES[t.day] + ": " + t.title + " (" + t.location + ", " + t.priority + " priority)" + (t.moved ? " - moved from " + DAY_NAMES[t.moved] : "");
    }));
    const blob = new Blob([lines.join("\n")], {type:"text/plain"});
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

  document.getElementById("bellBtn").addEventListener("click", function(){
    document.querySelectorAll(".nav-item[data-view]").forEach(function(n){ n.classList.toggle("active", n.dataset.view === "complaints"); });
    document.querySelectorAll(".view").forEach(function(v){ v.classList.remove("active"); });
    document.getElementById("view-complaints").classList.add("active");
  });

  /* ---------------- Init ---------------- */
  logActivity("Shift started - board synced");
  renderAll();
  renderComplaints();
})();
