/**
 * Local helper: starts the backend exactly like tests/run-all.mjs does, then
 * runs only the named QA suites. Used when npm test's full run outlives the
 * terminal's time limit, so the remaining suites can still be verified.
 *
 *   node tests/run-remaining.mjs qa-complaint-delete.mjs qa-backend.mjs qa-static-host.mjs
 *
 * Suite names are resolved the same way run-all.mjs resolves them, so both
 * "qa-backend.mjs" and "qa-backend" work.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
// A different port from run-all.mjs on purpose: a leftover server from an
// interrupted `npm test` would still answer /api/health on 3123, and this
// helper would silently test against that stale instance instead of its own.
const PORT = Number(process.env.PORT) || 3125;
const BASE = `http://localhost:${PORT}/`;

const suites = process.argv.slice(2);
if (!suites.length) {
  console.error("Pass one or more suite file names, e.g. qa-backend.mjs qa-static-host.mjs");
  process.exit(2);
}

function findRunner() {
  const candidates = [
    process.env.BROWSER_RUNNER,
    path.join(os.homedir(), ".codegpt", "skills", "browser-automation", "browser.mjs"),
    path.join(root, "node_modules", ".bin", "browser.mjs"),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function resolveSuite(name) {
  // Accept "qa-backend", "qa-backend.mjs" and "tests/qa-backend.mjs".
  const withExt = path.extname(name) ? name : name + ".mjs";
  const candidates = [path.resolve(root, "tests", withExt), path.resolve(root, withExt)];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

function countAssertions(json) {
  let pass = 0;
  let fail = 0;
  const walk = (v) => {
    if (v === null || v === undefined) return;
    if (typeof v === "boolean") { v ? pass++ : fail++; return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(json);
  return { pass, fail };
}

function extractJson(output) {
  const start = output.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < output.length; i++) {
    if (output[i] === "{") depth++;
    else if (output[i] === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(output.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

const runner = findRunner();
if (!runner) {
  console.error("Could not find the browser-automation runner (browser.mjs).");
  console.error("Set BROWSER_RUNNER=/path/to/browser.mjs and try again.");
  process.exit(1);
}

const plans = [];
for (const name of suites) {
  const file = resolveSuite(name);
  if (!file) {
    console.error(`No such suite: ${name} (looked in tests/ for ${path.extname(name) ? name : name + ".mjs"})`);
    process.exit(2);
  }
  plans.push({ name: path.basename(file), file });
}

console.log(`Starting backend on port ${PORT}...`);
// The suites reset the board constantly, so they must never run against the
// cloud: .env.local names a real Supabase project, and SHARONDALE_DB alone no
// longer implies SQLite, so Supabase is switched off explicitly.
const server = spawn("node", ["server/index.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(PORT),
    SHARONDALE_DB: process.env.SHARONDALE_DB || ":memory:",
    SUPABASE_URL: "",
    SUPABASE_SECRET_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_KEY: "",
    SUPABASE_DB_URL: "",
    // Writes are open locally, exactly as for a visitor who entered the code.
    SHARONDALE_TOKEN: "",
    SHARONDALE_LOGIN: "off",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

let exited = false;
const cleanup = () => {
  if (!exited) server.kill("SIGTERM");
};
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

// Without this the script hangs until the health check times out when the
// backend dies on startup (port in use, bad config), because nothing listens.
server.on("error", (error) => {
  console.error("Could not start the backend: " + error.message);
  process.exit(1);
});
server.on("close", () => { exited = true; });

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited) return false;
    try {
      // Read the body, not just res.ok: another server on this port would
      // also answer 200 with some HTML, and the suites would fail confusingly.
      const res = await fetch(BASE + "api/health");
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && body.ok === true) return true;
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

if (!(await waitForServer())) {
  console.error(`Backend did not become healthy on ${BASE} within 15s.`);
  if (serverLog.trim()) {
    console.error("Backend output was:");
    console.error(serverLog.trim());
  } else if (!exited) {
    console.error(`Nothing answered on port ${PORT}. Is another process using it?`);
  }
  cleanup();
  process.exit(1);
}
console.log(`Backend is healthy on ${BASE}\n`);

let totalPass = 0;
let totalFail = 0;
const failures = [];

for (const { name, file } of plans) {
  const started = Date.now();
  const { code, out, err } = await run("node", [runner, BASE, "--script", file]);
  const ms = Date.now() - started;
  const json = extractJson(out);

  if (code !== 0 || !json) {
    totalFail++;
    failures.push(name);
    console.log(`FAIL  ${name}  (${ms}ms)`);
    console.log((err || out).split("\n").slice(-14).join("\n"));
    continue;
  }

  const { pass, fail } = countAssertions(json);
  totalPass += pass;
  totalFail += fail;
  if (fail > 0) failures.push(name);
  console.log(`${fail === 0 ? "PASS" : "FAIL"}  ${name}  ${pass} passed, ${fail} failed  (${ms}ms)`);
}

cleanup();
console.log("");
console.log(`${totalPass} assertions passed, ${totalFail} failed.`);
if (failures.length) {
  console.log("Suites with problems: " + failures.join(", "));
  process.exit(1);
}
console.log("Selected suites green.");
