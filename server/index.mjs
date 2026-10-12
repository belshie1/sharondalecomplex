/**
 * Sharondale backend: a small HTTP API over SQLite that also serves the
 * dashboard, so the whole app runs from one process and one origin.
 *
 *   npm start                 # http://localhost:3000
 *   PORT=8080 npm start       # custom port
 *
 * Endpoints
 *   GET  /api/health                  -> { ok, tasks, complaints, shopping }
 *   GET  /api/board                   -> { tasks, complaints, shopping, recurring }
 *   PUT  /api/board                   -> replace the board, returns the stored copy
 *   GET  /api/events                  -> server-sent events, pushed on every change
 *
 * A visible shared board cannot be done with localStorage, so this is the piece
 * that makes the data live somewhere other than one browser. To deploy, run this
 * on any Node host (Render, Railway, Fly, a VPS) and point a custom domain at it.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, replaceBoard, isSeeded, db } from "./db.mjs";
import { seedIfEmpty } from "./seed.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const port = Number(process.env.PORT) || 3000;

// Requests carrying this token may write. When it is unset the API stays open,
// which is convenient locally and wrong on the public internet -- the startup
// banner says so loudly.
const WRITE_TOKEN = process.env.SHARONDALE_TOKEN || "";

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
  return errors;
}

/* -------------------------------- routing ------------------------------- */

async function handleApi(req, res, pathname) {
  if (pathname === "/api/health" && req.method === "GET") {
    const board = readAll();
    return sendJson(res, 200, {
      ok: true,
      seeded: isSeeded(),
      tasks: board.tasks.length,
      complaints: board.complaints.length,
      shopping: board.shopping.length,
      writesProtected: !!WRITE_TOKEN,
    });
  }

  if (pathname === "/api/board" && req.method === "GET") {
    return sendJson(res, 200, readAll());
  }

  if (pathname === "/api/events" && req.method === "GET") {
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
    if (WRITE_TOKEN) {
      const supplied = req.headers["x-sharondale-token"] || "";
      if (supplied !== WRITE_TOKEN) {
        return sendJson(res, 401, { error: "Missing or incorrect write token." });
      }
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
      const saved = replaceBoard({
        tasks: body.tasks,
        complaints: body.complaints,
        shopping: body.shopping || [],
        recurring: body.recurring || [],
        // Omit people to leave them untouched; the People screen always sends
        // the full list, so an empty array there genuinely clears the roster.
        people: body.people === undefined ? null : body.people,
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
    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (error) {
    if (!res.headersSent) sendJson(res, 500, { error: error.message });
    else res.end();
  }
});

seedIfEmpty();

server.listen(port, () => {
  const board = readAll();
  console.log(`Sharondale backend listening on http://localhost:${port}`);
  console.log(`Dashboard:  http://localhost:${port}/`);
  console.log(`Board holds ${board.tasks.length} tasks, ${board.complaints.length} complaints, ${board.shopping.length} shopping items.`);
  if (!WRITE_TOKEN) {
    console.log("");
    console.log("WARNING: writes are UNPROTECTED (SHARONDALE_TOKEN is not set).");
    console.log("Anyone who can reach this port can change the board. Set");
    console.log("SHARONDALE_TOKEN before exposing it to the internet.");
  }
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
    try { db.close(); } catch (e) { /* already closed */ }
    process.exit(0);
  });
  // Do not hang forever if a connection refuses to drain.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { server, broadcast, db };
