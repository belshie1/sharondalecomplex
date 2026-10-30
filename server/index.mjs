/**
 * Sharondale backend: a small HTTP API over SQLite that also serves the
 * dashboard, so the whole app runs from one process and one origin.
 *
 *   npm start                 # http://localhost:3000
 *   PORT=8080 npm start       # custom port
 *
 * Endpoints
 *   GET  /api/health                  -> { ok, tasks, complaints, shopping }
 *   GET  /api/board                   -> { tasks, complaints, shopping, recurring, requests }
 *   PUT  /api/board                   -> replace the board, returns the stored copy
 *   GET  /api/events                  -> server-sent events, pushed on every change
 *
 * A visible shared board cannot be done with localStorage, so this is the piece
 * that makes the data live somewhere other than one browser. To deploy, run this
 * on any Node host (Railway, Fly, a VPS) and point a custom domain at it.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// First import on purpose: env.mjs applies .env.local AND rewrites its
// OFF_SENTINEL switch-offs before anything below is read. db.mjs imports it too,
// but a nested import runs only once this file's own imports are done, which is
// too late for the settings immediately below.
import { OFF_SENTINEL, OFF_VALUE } from "./env.mjs";
import { storage, initStorage, pingStorage, storageDescription, closeStorage, usingSupabaseStorage } from "./db.mjs";
import { seedIfEmpty } from "./seed.mjs";
import { ADMIN_CODE, login, lockedOut, setCode, listCodes, sessionFromRequest } from "./access.mjs";

// When set, board reads and writes need a signed-in session (or the write
// token). Off by default so existing clients and tests keep working.
const REQUIRE_LOGIN = process.env.SHARONDALE_REQUIRE_LOGIN === "1";
// Automated browser tests set this to skip the sign-in screen. Never set it in
// production.
// "off" is the documented value; the sentinel counts too, so a script that
// switches the gate off cannot depend on which spelling survives Windows' lack
// of an empty environment variable.
const LOGIN_SETTING = String(process.env.SHARONDALE_LOGIN || "").trim().toLowerCase();
const LOGIN_OFF = LOGIN_SETTING === OFF_VALUE || process.env.SHARONDALE_LOGIN === OFF_SENTINEL;

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const port = Number(process.env.PORT) || 3000;
// Bind to every interface by default: a container host routes traffic to the
// container's own address, so listening only on loopback would make a deployed
// instance unreachable even though it started cleanly.
const host = process.env.HOST || "0.0.0.0";

// Requests carrying this token may write. When it is unset the API stays open,
// which is convenient locally and wrong on the public internet -- the startup
// banner says so loudly.
// A switched-off token reads as OFF_VALUE, not "", so only a real empty value
// counts as "no token".
const WRITE_TOKEN = process.env.SHARONDALE_TOKEN === OFF_VALUE ? "" : (process.env.SHARONDALE_TOKEN || "");

// Which SQLite file is in use. Reported by /api/health so a deployment can be
// checked from outside: on a host with an ephemeral filesystem the board silently
// resets on every deploy, and the only way to see that is to look at the path.
const DB_FILE = process.env.SHARONDALE_DB || path.join(root, "data", "sharondale.db");

// API only, no static files. This is what a serverless/edge host needs: on
// Vercel the page is served from the deployment's CDN and only /api/* reaches
// this process. Locally a single process still serves both.
const API_ONLY = process.env.SHARONDALE_API_ONLY === "1";
// Lets the dashboard on another origin use the live-sync stream. Off by default
// (cross-origin EventSource is unreliable through a CDN); same-origin hosts keep
// it, so the usual deployment is unaffected.
const SSE_CROSS_ORIGIN = process.env.SHARONDALE_SSE_CROSS_ORIGIN === "1";

// Browser origins allowed to call the API when the dashboard is hosted somewhere
// other than this process (for example the static site on GitHub Pages talking to
// a backend running on a home machine). Same-origin requests are always allowed;
// anything else must be listed here, comma-separated, or CORS is refused.
const ALLOWED_ORIGINS = (process.env.SHARONDALE_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

/* ------------------------- server-sent events --------------------------- */

const clients = new Set();

function broadcast() {
  for (const res of clients) {
    res.write("event: board\ndata: {}\n\n");
  }
}

/* ------------------------------- helpers -------------------------------- */

// Cross-origin rules for the API. Headers are added centrally so every response,
// including errors and the event stream, carries them.
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  // The answer differs per origin, so a shared cache must not reuse it.
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Sharondale-Token, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      // Photos are stored as data URLs, so allow a generous but bounded body.
      if (size > 12 * 1024 * 1024) {
        reject(new Error("Request body too large (12MB limit)."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function validateBoard(body) {
  const errors = [];
  if (!body || typeof body !== "object") return ["Body must be a JSON object."];

  const { tasks, complaints, shopping, recurring } = body;
  if (!Array.isArray(tasks)) errors.push("tasks must be an array.");
  if (!Array.isArray(complaints)) errors.push("complaints must be an array.");
  if (shopping !== undefined && !Array.isArray(shopping)) errors.push("shopping must be an array.");
  if (recurring !== undefined && !Array.isArray(recurring)) errors.push("recurring must be an array.");

  (tasks || []).forEach((t, i) => {
    if (typeof t.title !== "string" || !t.title.trim()) errors.push(`tasks[${i}].title is required.`);
    if (typeof t.location !== "string") errors.push(`tasks[${i}].location must be a string.`);
    if (!["low", "medium", "high"].includes(t.priority)) errors.push(`tasks[${i}].priority is invalid.`);
    if (t.id === undefined || t.id === null) errors.push(`tasks[${i}].id is required.`);
  });
  (complaints || []).forEach((c, i) => {
    if (typeof c.id !== "number") errors.push(`complaints[${i}].id must be a number.`);
    if (!["open", "progress", "closed"].includes(c.status)) errors.push(`complaints[${i}].status is invalid.`);
  });
  (shopping || []).forEach((s, i) => {
    if (typeof s.id !== "number") errors.push(`shopping[${i}].id must be a number.`);
    if (typeof s.label !== "string" || !s.label.trim()) errors.push(`shopping[${i}].label is required.`);
  });
  if (body.people !== undefined) {
    if (!Array.isArray(body.people)) {
      errors.push("people must be an array.");
    } else {
      const seen = new Set();
      body.people.forEach((p, i) => {
        if (typeof p.name !== "string" || !p.name.trim()) {
          errors.push(`people[${i}].name is required.`);
        } else {
          const key = p.name.trim().toLowerCase();
          if (seen.has(key)) errors.push(`people[${i}].name "${p.name}" is a duplicate.`);
          seen.add(key);
        }
        if (p.id === undefined || p.id === null) errors.push(`people[${i}].id is required.`);
      });
    }
  }
  if (body.phonebook !== undefined) {
    if (!Array.isArray(body.phonebook)) {
      errors.push("phonebook must be an array.");
    } else {
      body.phonebook.forEach((c, i) => {
        if (typeof c.name !== "string" || !c.name.trim()) {
          errors.push(`phonebook[${i}].name is required.`);
        }
        // A contact is only useful if it can be dialled, so at least one of
        // phone or company has to be present.
        const hasPhone = typeof c.phone === "string" && c.phone.trim();
        const hasCompany = typeof c.company === "string" && c.company.trim();
        if (!hasPhone && !hasCompany) {
          errors.push(`phonebook[${i}] needs a phone number or a company.`);
        }
        if (c.id === undefined || c.id === null) errors.push(`phonebook[${i}].id is required.`);
      });
    }
  }
  if (body.requests !== undefined) {
    if (!Array.isArray(body.requests)) {
      errors.push("requests must be an array.");
    } else {
      body.requests.forEach((r, i) => {
        if (typeof r.title !== "string" || !r.title.trim()) errors.push(`requests[${i}].title is required.`);
        if (typeof r.location !== "string" || !r.location.trim()) errors.push(`requests[${i}].location is required.`);
        if (!["low", "medium", "high"].includes(r.priority)) errors.push(`requests[${i}].priority is invalid.`);
        if (r.assignee !== undefined && typeof r.assignee !== "string") {
          errors.push(`requests[${i}].assignee must be a string.`);
        }
        if (r.day !== undefined && r.day !== "" &&
            (typeof r.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.day))) {
          errors.push(`requests[${i}].day must be an ISO date or empty.`);
        }
        // A request is either waiting to be picked up or has been moved onto
        // the board; anything else would lose it from both lists.
        if (r.status !== undefined && !["pending", "moved"].includes(r.status)) {
          errors.push(`requests[${i}].status is invalid.`);
        }
        if (r.id === undefined || r.id === null) errors.push(`requests[${i}].id is required.`);
      });
    }
  }
  return errors;
}

/* -------------------------------- routing ------------------------------- */

async function handleApi(req, res, pathname) {
  if (pathname === "/api/health" && req.method === "GET") {
    // Touching storage on every check is deliberate: a Supabase project pauses
    // after inactivity, and this is what proves the board can actually be read
    // right now rather than that the process is merely running.
    const latencies = { dbMs: null };
    try {
      latencies.dbMs = await pingStorage();
    } catch (error) {
      return sendJson(res, 503, { ok: false, error: "Storage is unreachable: " + error.message });
    }
    const board = await storage.readAll();
    return sendJson(res, 200, {
      ok: true,
      seeded: board.tasks.length > 0,
      storage: storageDescription(),
      tasks: board.tasks.length,
      complaints: board.complaints.length,
      shopping: board.shopping.length,
      requests: board.requests.length,
      writesProtected: !!WRITE_TOKEN,
      dbMs: latencies.dbMs,
      // Where the data actually lives. A path under /tmp or a path that is not
      // writable means the board will not survive a restart. A ":memory:"
      // database is thrown away when the process exits. With Supabase this says
      // so explicitly, because there is no path to inspect.
      database: usingSupabaseStorage() ? "supabase: " + storageDescription() : DB_FILE === ":memory:" ? ":memory: (not persisted)" : DB_FILE,
    });
  }

  if (pathname === "/api/login" && req.method === "GET") {
    // The page needs to know whether signing in can succeed, so it only shows
    // the gate when somebody actually has a code. A visible gate on a board
    // where every code returns "wrong code" is worse than no gate: it looks
    // like the right code is being rejected. A switch-off (LOGIN_OFF) is a
    // deliberate "no sign-in here" and wins over both.
    // `why` is for diagnostics only (nothing secret): a board whose gate is off
    // when it should be up says which setting decided that.
    if (LOGIN_OFF) return sendJson(res, 200, { gate: false, why: "SHARONDALE_LOGIN is off" });
    let anyoneCanSignIn = !!ADMIN_CODE;
    let why = anyoneCanSignIn ? "the admin code is set" : "";
    if (!anyoneCanSignIn) {
      try {
        anyoneCanSignIn = (await storage.readAccess()).length > 0;
        why = anyoneCanSignIn ? "a person has a code" : "nobody has a code";
      } catch (e) {
        anyoneCanSignIn = false;
        why = "codes could not be read: " + e.message;
      }
    }
    return sendJson(res, 200, { gate: anyoneCanSignIn, why });
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const key = req.socket.remoteAddress || "unknown";
    if (lockedOut(key)) return sendJson(res, 429, { error: "Too many wrong codes. Try again in 15 minutes." });
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON." });
    }
    const result = await login(body && body.code, key);
    if (!result) return sendJson(res, 401, { error: "Incorrect code." });
    return sendJson(res, 200, result);
  }

  if (pathname === "/api/codes") {
    const session = sessionFromRequest(req);
    if (!session || !session.admin) return sendJson(res, 403, { error: "Only the admin can manage codes." });
    if (req.method === "GET") return sendJson(res, 200, { codes: await listCodes() });
    if (req.method === "PUT") {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return sendJson(res, 400, { error: "Invalid JSON." });
      }
      const problem = await setCode(body && body.name, body && body.code);
      if (problem) return sendJson(res, 400, { error: problem });
      return sendJson(res, 200, { ok: true, codes: await listCodes() });
    }
  }

  if (REQUIRE_LOGIN && pathname.startsWith("/api/") && pathname !== "/api/health" && pathname !== "/api/events") {
    const tokenOk = WRITE_TOKEN && req.headers["x-sharondale-token"] === WRITE_TOKEN;
    if (!tokenOk && !sessionFromRequest(req)) return sendJson(res, 401, { error: "Sign in with your code first." });
  }

  if (pathname === "/api/board" && req.method === "GET") {
    return sendJson(res, 200, await storage.readAll());
  }

  if (pathname === "/api/events" && req.method === "GET") {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}` && !SSE_CROSS_ORIGIN) {
      return sendJson(res, 200, { events: "disabled for cross-origin clients" });
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tells buffering proxies (nginx, some PaaS routers) to pass events
      // straight through instead of holding the response open.
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 5000\n\n");
    res.write("event: hello\ndata: {}\n\n");
    clients.add(res);
    // SSE is a bonus, not a requirement: if nothing has changed for a while the
    // stream is closed so it never holds a page load or a reload open. The
    // browser reconnects automatically on the next change.
    let keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);
    const maxIdle = setTimeout(() => {
      try { res.end(); } catch (e) { /* already gone */ }
    }, 60000);
    req.on("close", () => {
      clearInterval(keepAlive);
      clearTimeout(maxIdle);
      clients.delete(res);
    });
    return;
  }

  if (pathname === "/api/board" && req.method === "PUT") {
    // A signed-in session may write too. The dashboard's sign-in gate puts the
    // session in Authorization and nothing in x-sharondale-token, so demanding
    // the write token alone meant signing in successfully changed nothing: the
    // first save came back 401, and the code prompt's "unlock" was a write
    // token the gate never asked anyone for.
    const session = sessionFromRequest(req);

    // A session replaces the write token as proof; it does not replace the
    // rules. Keeping authentication and validation separate is what a signed-in
    // client needs: without this branch it skipped every check below and could
    // store a board the token-protected API would have rejected.
    if (!session && !WRITE_TOKEN) {
      /* no credential configured: writes are open, as the startup banner warns */
    } else if (!session && (req.headers["x-sharondale-token"] || "") !== WRITE_TOKEN) {
      return sendJson(res, 401, { error: "Missing or incorrect write token." });
    }

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return sendJson(res, 400, { error: "Invalid JSON: " + error.message });
    }
    const errors = validateBoard(body);
    if (errors.length) return sendJson(res, 400, { error: "Validation failed.", details: errors });

    try {
      const saved = await storage.replaceBoard({
        tasks: body.tasks,
        complaints: body.complaints,
        shopping: body.shopping || [],
        recurring: body.recurring || [],
        // Omit people to leave them untouched; the People screen always sends
        // the full list, so an empty array there genuinely clears the roster.
        people: body.people === undefined ? null : body.people,
        phonebook: body.phonebook === undefined ? null : body.phonebook,
        // Same partial-write rule for the request log: the Task requests screen
        // sends it whole, while a partial writer leaves it alone.
        requests: body.requests === undefined ? null : body.requests,
      });
      broadcast();
      return sendJson(res, 200, { ok: true, board: saved });
    } catch (error) {
      return sendJson(res, 500, { error: "Could not save board: " + error.message });
    }
  }

  return sendJson(res, 404, { error: "Unknown API endpoint: " + pathname });
}

function serveStatic(req, res, pathname) {
  if (API_ONLY) {
    // On a serverless host the page is served by the host, not by this process.
    // Saying so is clearer than a 404 for / when testing the API directly.
    res.writeHead(404, { "Content-Type": "text/plain" }).end(
      "This process serves the API only. The dashboard is at the site URL; /api/* is here.\n"
    );
    return;
  }
  // The dashboard is served at "/" but its assets are requested relative to the
  // root (styles.css, app.js), while the files live in dashboard/. Try the
  // dashboard folder first for anything that is not an explicit path, then fall
  // back to the project root so /dashboard/index.html still works directly.
  const candidates = [];
  if (pathname === "/") {
    candidates.push("/dashboard/index.html");
  } else {
    candidates.push(pathname);
    if (!pathname.startsWith("/dashboard/")) candidates.push("/dashboard" + pathname);
  }

  let filePath = null;
  for (const candidate of candidates) {
    const resolved = path.join(root, candidate);
    if (!resolved.startsWith(root)) continue;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      filePath = resolved;
      break;
    }
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      const index = path.join(resolved, "index.html");
      if (fs.existsSync(index)) {
        filePath = index;
        break;
      }
    }
  }

  if (!filePath) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("404 " + pathname);
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("404 " + pathname);
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  try {
    // A serverless host can reuse a warm process; the schema and the first-run
    // seed are still made idempotent so a cold start always works.
    if (!ready) {
      await initStorage();
      await seedIfEmpty();
      ready = true;
    }
    if (pathname.startsWith("/api/")) {
      applyCors(req, res);
      // A cross-origin PUT sends a preflight first; answer it without touching
      // the API handlers.
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }
      await handleApi(req, res, pathname);
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (error) {
    if (!res.headersSent) sendJson(res, 500, { error: error.message });
    else res.end();
  }
});

// Startup: create the table/policies if needed, then seed a brand-new board.
// Awaited before listening so the first visitor never sees an empty screen.
let ready = false;
await initStorage();
await seedIfEmpty();
ready = true;

// Startup diagnostics. Two failure modes are invisible from the dashboard -- an
// unprotected board and a database that will not survive a restart -- so they
// are reported here, where a host's log captures them on every deploy.
function reportStorageRisk() {
  if (usingSupabaseStorage()) {
    // storageDescription() names the transport, which is what actually matters:
    // a pooler string, the direct host, or the HTTPS Data API fallback.
    console.log("Storage: Supabase Postgres - the board survives restarts without a volume.");
    console.log(`           ${storageDescription()}`);
    return;
  }
  if (DB_FILE === ":memory:") {
    console.log("NOTE: using an in-memory database. Nothing is persisted.");
    return;
  }
  // A path under the OS temp directory, or one that cannot be written, is lost
  // when the instance is replaced. That is the single most common way a deployed
  // board silently resets, so say so plainly rather than discovering it later.
  const tmp = os.tmpdir();
  const looksEphemeral = path.resolve(DB_FILE).startsWith(path.resolve(tmp));
  if (looksEphemeral) {
    console.log("");
    console.log("WARNING: the database is inside the temporary directory (" + tmp + ").");
    console.log("The board will be LOST when this instance restarts. Mount a");
    console.log("persistent volume and point SHARONDALE_DB at it.");
  }
}

server.listen(port, host, async () => {
  const board = await storage.readAll();
  console.log(`Sharondale backend listening on http://${host}:${port}`);
  console.log(API_ONLY ? "Mode:       API only (the dashboard is served by the host)" : `Dashboard:  http://localhost:${port}/`);
  console.log(`Database:   ${storageDescription()}`);
  if (ALLOWED_ORIGINS.length) {
    console.log(`CORS origins: ${ALLOWED_ORIGINS.join(", ")}`);
  }
  console.log(`Board holds ${board.tasks.length} tasks, ${board.complaints.length} complaints, ${board.shopping.length} shopping items, ${board.requests.length} task requests.`);
  if (!WRITE_TOKEN) {
    console.log("");
    console.log("WARNING: writes are UNPROTECTED (SHARONDALE_TOKEN is not set).");
    console.log("Anyone who can reach this port can change the board. Set");
    console.log("SHARONDALE_TOKEN before exposing it to the internet.");
  }
  reportStorageRisk();
});

// Hosts send SIGTERM on deploy or restart. Close the open event streams and the
// database first, so a redeploy cannot interrupt a write mid-transaction.
function shutdown(signal) {
  console.log(`${signal} received, shutting down.`);
  for (const res of clients) {
    try { res.end(); } catch (e) { /* already closed */ }
  }
  clients.clear();
  server.close(() => {
    closeStorage().catch(() => {}).finally(() => process.exit(0));
  });
  // Do not hang forever if a connection refuses to drain.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { server, broadcast };
