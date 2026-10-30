/* Sign-in gate and (for the admin) code management. Loaded before app.js. */
(function () {
  "use strict";
  var API = (window.SHARONDALE_API || "/api").replace(/\/+$/, "");
  var KEY = "sharondaleSession";
  var session = null;
  var codes = {};

  try { session = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { session = null; }

  // Anyone signed in works as themselves: pin the identity before app.js reads
  // it. The admin code is a session too, so it is locked as well rather than
  // re-opening the free choice it had. Nobody signed in (a board with the gate
  // switched off) keeps the old behaviour and can pick from the roster.
  var locked = !!session;
  if (locked) {
    try { localStorage.setItem("sharondaleCurrentUser", session.name); } catch (e) { /* optional */ }
  }

  // The sign-in POST itself answers 401 for a wrong code, and the gate's own
  // handler shows that message. Signing out here instead reloaded the page and
  // lost it, leaving a blank prompt that looked like a sign-in that did not
  // stick: /api/login is the one API path this wrapper must not police.
  var LOGIN_PATH = API + "/login";
  // Every API call carries the session, so app.js needs no changes.
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (session && url.indexOf(API + "/") === 0 && url.indexOf(API + "/login") !== 0) {
      init = Object.assign({}, init);
      init.headers = Object.assign({}, init.headers, { Authorization: "Bearer " + session.token });
    }
    return nativeFetch(input, init).then(function (res) {
      if (res.status === 401 && session && url.indexOf(API + "/") === 0 && url.indexOf(LOGIN_PATH) !== 0) signOut();
      return res;
    });
  };

  function signOut() {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    location.reload();
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text) node.textContent = text;
    return node;
  }

  /** Take the gate down and give the page back its normal state. */
  function removeGate(gate) {
    gate.remove();
    document.body.classList.remove("gate-up");
    document.documentElement.classList.remove("gate-up");
    var shell = document.querySelector(".app-shell");
    if (shell) {
      shell.removeAttribute("aria-hidden");
      shell.removeAttribute("inert");
    }
  }

  function addStyles() {
    var s = el("style");
    // Top and bottom are written out rather than left to inset:0, and the page is
    // locked while the gate is up. The gate used to cover only the first screen:
    // it sits on <body>, which on a long dashboard can be taller than one screen,
    // so scrolling revealed the caretaker board behind a page nobody had signed
    // in to.
    s.textContent =
      "html.gate-up,body.gate-up{overflow:hidden}" +
      "#loginGate{position:fixed;top:0;right:0;bottom:0;left:0;z-index:9999;overflow:auto;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:var(--canvas,#F5F1E8)}" +
      "#loginGate form{background:var(--card,#FFFDF8);padding:32px;border-radius:var(--radius-lg,20px);box-shadow:var(--shadow-lg);width:min(92vw,340px);text-align:center}" +
      "#loginGate h1{font-size:22px;margin:0 0 6px}#loginGate p{margin:0 0 18px;color:var(--muted,#69736B);font-size:14px}" +
      "#loginCode{width:100%;box-sizing:border-box;font-size:28px;letter-spacing:.5em;text-align:center;padding:12px;border:1px solid var(--line);border-radius:10px;margin-bottom:12px}" +
      "#loginError{color:var(--coral,#B95C4D);min-height:20px;font-size:13px;margin-bottom:8px}" +
      "#signOutBtn{position:fixed;top:10px;right:14px;z-index:900}" +
      ".code-set{display:inline-flex;gap:4px;align-items:center;margin-right:8px}" +
      (locked ? ".act-assign-me{display:none!important}" : "") +
      // "Working as" is a label for a signed-in person, not a control. app.js
      // re-renders the select's options on every roster change, so disabling the
      // element once at boot was undone by the next re-render; the style holds.
      (locked ? ".user-select{pointer-events:none;appearance:none;cursor:default;opacity:1}" : "") +
      ".code-set input{width:72px;text-align:center;letter-spacing:.2em;padding:4px;border:1px solid var(--line);border-radius:6px}";
    document.head.appendChild(s);
  }

  function showGate() {
    var gate = el("div", { id: "loginGate", role: "dialog", "aria-modal": "true", "aria-label": "Sign in" });
    // A dialog has to tell everything behind it is inert. Without this a screen
    // reader walks the whole dashboard while the visitor is entering a code.
    var shell = document.querySelector(".app-shell");
    if (shell) {
      shell.setAttribute("aria-hidden", "true");
      shell.setAttribute("inert", "");
    }
    if (document.body) document.body.classList.add("gate-up");
    document.documentElement.classList.add("gate-up");
    var form = el("form", { autocomplete: "off" });
    form.appendChild(el("h1", {}, "Sharondale"));
    form.appendChild(el("p", {}, "Enter your access code"));
    var input = el("input", { id: "loginCode", type: "password", inputmode: "numeric", maxlength: "9", pattern: "[0-9]*", "aria-label": "Access code", autocomplete: "off" });
    var error = el("div", { id: "loginError", role: "alert" });
    var button = el("button", { type: "submit", class: "btn btn-primary" }, "Enter");
    form.appendChild(input);
    form.appendChild(error);
    form.appendChild(button);
    gate.appendChild(form);
    document.body.appendChild(gate);
    input.addEventListener("input", function () { input.value = input.value.replace(/\D/g, ""); });
    input.focus();

    // Tests (and a page with no backend) have nothing to sign in to.
    nativeFetch(API + "/login").then(function (res) {
      return res.json();
    }).then(function (cfg) {
      if (cfg && cfg.gate === false) removeGate(gate);
    }).catch(function () { removeGate(gate); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      error.textContent = "";
      nativeFetch(API + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: input.value })
      }).then(function (res) {
        return res.json().then(function (body) { return { ok: res.ok, body: body }; });
      }).then(function (r) {
        if (!r.ok) {
          error.textContent = r.body.error || "Could not sign in.";
          input.value = "";
          input.focus();
          return;
        }
        try { sessionStorage.setItem(KEY, JSON.stringify(r.body)); } catch (e2) { /* ignore */ }
        // Work as the signed-in person; app.js reads this when it starts.
        if (!r.body.admin) {
          try { localStorage.setItem("sharondaleCurrentUser", r.body.name); } catch (e3) { /* optional */ }
        }
        location.reload();
      }).catch(function () {
        error.textContent = "Cannot reach the server. Try again.";
      });
    });
  }

  function authed(path, opts) {
    return fetch(API + path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts || {}));
  }

  function saveCode(name, code, cb) {
    authed("/codes", { method: "PUT", body: JSON.stringify({ name: name, code: code }) })
      .then(function (res) { return res.json(); })
      .then(function (body) {
        if (body.error) { alert(body.error); return; }
        codes = {};
        (body.codes || []).forEach(function (c) { codes[c.name] = c.code; });
        if (cb) cb();
        decorateRows();
      });
  }

  function decorateRows() {
    document.querySelectorAll("#peopleList .person-row").forEach(function (row) {
      var name = row.getAttribute("data-name");
      var box = row.querySelector(".code-set");
      if (box) { box.querySelector("input").value = codes[name] || ""; return; }
      box = el("span", { class: "code-set" });
      var input = el("input", { type: "text", inputmode: "numeric", maxlength: "4", placeholder: "Code", "aria-label": "Code for " + name });
      input.value = codes[name] || "";
      var save = el("button", { type: "button", class: "btn btn-ghost btn-sm" }, "Set");
      save.addEventListener("click", function () { saveCode(name, input.value.trim()); });
      box.appendChild(input);
      box.appendChild(save);
      var actions = row.querySelector(".person-actions");
      if (actions) actions.insertBefore(box, actions.firstChild);
      var remove = row.querySelector(".person-remove");
      if (remove) remove.addEventListener("click", function () { saveCode(name, ""); });
    });
  }

  function setupAdmin() {
    var form = document.getElementById("peopleForm");
    var list = document.getElementById("peopleList");
    if (!form || !list) return;
    var codeInput = el("input", { type: "text", id: "peopleCode", inputmode: "numeric", maxlength: "4", placeholder: "4-digit code", autocomplete: "off", "aria-label": "Code for new person" });
    form.insertBefore(codeInput, form.querySelector("button"));
    // Runs before app.js's own handler (registered earlier), so read the values now.
    form.addEventListener("submit", function () {
      var name = document.getElementById("peopleName").value.trim();
      var code = codeInput.value.trim();
      codeInput.value = "";
      if (name && code) setTimeout(function () { saveCode(name, code); }, 0);
    }, true);
    new MutationObserver(decorateRows).observe(list, { childList: true });
    authed("/codes").then(function (res) { return res.json(); }).then(function (body) {
      (body.codes || []).forEach(function (c) { codes[c.name] = c.code; });
      decorateRows();
    });
  }

  /**
   * Make "Working as" follow the signed-in person and nothing else.
   *
   * Setting `disabled` once was not enough: app.js re-renders the select's
   * options (refreshPeopleSelects) whenever the roster changes, which replaces
   * its contents and puts the free choice back. Watching for that re-render
   * keeps it locked; the style added in addStyles() keeps it from looking like a
   * control that nobody can operate.
   */
  function lockWorkingAs(name) {
    var select = document.getElementById("currentUserSelect");
    if (!select) return;
    select.disabled = true;
    select.setAttribute("aria-disabled", "true");
    select.title = "You are signed in as " + name;
    new MutationObserver(function () {
      select.disabled = true;
      select.value = name;
    }).observe(select, { childList: true });
  }

  addStyles();
  document.addEventListener("DOMContentLoaded", function () {
    if (!session) { showGate(); return; }
    var out = el("button", { type: "button", id: "signOutBtn", class: "btn btn-ghost btn-sm" }, "Sign out (" + session.name + ")");
    out.addEventListener("click", signOut);
    document.body.appendChild(out);
    if (locked) {
      lockWorkingAs(session.name);
    }
    if (session.admin) setupAdmin();
  });
})();
