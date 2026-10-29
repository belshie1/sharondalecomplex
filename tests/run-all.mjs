/**
 * Runs every browser QA suite against a freshly started backend and prints a
 * pass/fail summary.
 *
 *   npm test
 *
 * The browser driver lives in the browser-automation skill rather than in this
 * repo, so its path is discovered from BROWSER_RUNNER or the known skill
 * locations, and the suites are skipped with a clear message if it is missing
 * instead of failing confusingly.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { OFF_SENTINEL } from "../server/env.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const PORT = Number(process.env.PORT) || 3123;
const BASE = `http://localhost:${PORT}/`;

// qa-session-write.mjs signs in as this person on the throwaway test board, to
// prove a session can save. It is created below, on that board only, and is
// neither a real caretaker nor the admin code. Changing it must not change the
// write token's meaning: the suites still need writes open for everyone else.
const QA_SESSION_NAME = process.env.QA_SESSION_NAME || "QA Session";
const QA_SESSION_CODE = process.env.QA_SESSION_CODE || "1357";
const ADMIN_CODE = process.env.SHARONDALE_ADMIN_CODE || "123454321";
if (QA_SESSION_CODE === ADMIN_CODE) {
  console.error("QA_SESSION_CODE must not be the admin code: the suite checks it is NOT the admin.");
  process.exit(1);
}

const SUITES = [
  "qa.mjs",
  "qa-edit-assign.mjs",
  "qa-backlog.mjs",
  "qa-shopping.mjs",
  "qa-people.mjs",
  "qa-phonebook.mjs",
  "qa-requests.mjs",
  "qa-report.mjs",
  "qa-complaint-add.mjs",
  "qa-complaint-delete.mjs",
  "qa-backend.mjs",
  "qa-board-integrity.mjs",
  "qa-session-write.mjs",
  "qa-static-host.mjs",
];

function findRunner() {
  const candidates = [
    process.env.BROWSER_RUNNER,
    path.join(os.homedir(), ".codegpt", "skills", "browser-automation", "browser.mjs"),
    path.join(root, "node_modules", ".bin", "browser.mjs"),
  ].filter(Boolean);
  return candidates.find((p) => p && fs.existsSync(p)) || null;
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
    let timer = null;
    let timedOut = false;
    if (options.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        err += `\nTIMEOUT after ${options.timeoutMs}ms - suite killed`;
        try { child.kill(); } catch { /* already gone */ }
      }, options.timeoutMs);
    }
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: timedOut ? "TIMEOUT" : code, out, err });
    });
  });
}

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE + "api/health");
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function countAssertions(json) {
  // The runner prints the script's return value as JSON. Count truthy/falsy
  // leaves so the summary reflects real assertions rather than suite count.
  let pass = 0;
  let fail = 0;
  const walk = (v) => {
    if (v === null || v === undefined) return;
    if (typeof v === "boolean") {
      v ? pass++ : fail++;
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(json);
  return { pass, fail };
}

function extractJson(output) {
  // The runner prints a JSON object after the script finishes; grab the last
  // balanced top-level object so unrelated log lines do not break parsing.
  const start = output.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < output.length; i++) {
    if (output[i] === "{") depth++;
    else if (output[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(output.slice(start, i + 1));
        } catch {
          return null;
        }
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

console.log(`Starting backend on port ${PORT}...`);
// The suites reset the board constantly, so they must never run against the
// cloud. .env.local now names a real Supabase project, and SHARONDALE_DB alone
// no longer implies SQLite, so Supabase is switched off explicitly here.
//
// An empty value is how these are switched off, but Windows cannot pass an
// empty variable to a child process, so OFF_SENTINEL is used instead: the
// server's env loader reads it as "deliberately empty" and .env.local is not
// allowed to put the live project or its write token back.
const server = spawn("node", ["server/index.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(PORT),
    SHARONDALE_DB: process.env.SHARONDALE_DB || ":memory:",
    SUPABASE_URL: OFF_SENTINEL,
    SUPABASE_SECRET_KEY: OFF_SENTINEL,
    SUPABASE_SERVICE_ROLE_KEY: OFF_SENTINEL,
    SUPABASE_KEY: OFF_SENTINEL,
    SUPABASE_DB_URL: OFF_SENTINEL,
    // Writes are protected in production tests; locally the suites write
    // directly, exactly as a visitor who has entered the code would.
    SHARONDALE_TOKEN: OFF_SENTINEL,
    SHARONDALE_LOGIN: OFF_SENTINEL,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const cleanup = () => {
  if (!server.killed) server.kill("SIGTERM");
};
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

if (!(await waitForServer())) {
  console.error("Backend did not become healthy in time. Output was:");
  console.error(serverLog);
  cleanup();
  process.exit(1);
}
console.log("Backend is healthy.\n");

// The code belongs to the board, not the environment, so it is set through the
// admin API exactly as the admin screen would. A suite that resets the board
// must keep the roster, so the person survives every reset below.
async function seedSessionCode() {
  const loginRes = await fetch(BASE + "api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: ADMIN_CODE }),
  });
  const admin = await loginRes.json().catch(() => ({}));
  if (!admin.token) throw new Error("Admin sign-in failed: " + (admin.error || loginRes.status));

  const board = await (await fetch(BASE + "api/board")).json();
  if ((board.people || []).some((p) => p.name === QA_SESSION_NAME)) return;
  board.people = (board.people || []).concat([{ id: "qa-session-person", name: QA_SESSION_NAME, role: "QA" }]);
  const put = await fetch(BASE + "api/board", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(board),
  });
  if (!put.ok) throw new Error("Could not add the QA session person: HTTP " + put.status);

  const codeRes = await fetch(BASE + "api/codes", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + admin.token },
    body: JSON.stringify({ name: QA_SESSION_NAME, code: QA_SESSION_CODE }),
  });
  const body = await codeRes.json().catch(() => ({}));
  if (!codeRes.ok || body.error) throw new Error("Could not set the QA session code: " + (body.error || codeRes.status));
}
try {
  await seedSessionCode();
} catch (error) {
  console.error("Could not prepare the sign-in check: " + error.message);
  cleanup();
  process.exit(1);
}
console.log(`Sign-in check uses \"${QA_SESSION_NAME}\" with code ${QA_SESSION_CODE}.\n`);

let totalPass = 0;
let totalFail = 0;
const failures = [];

for (const suite of SUITES) {
  const scriptPath = path.join(root, "tests", suite);
  const started = Date.now();
  // A suite that hangs must not stall the whole run: every remaining suite then
  // never runs and the summary is never printed, which reads as "all green".
  const { code, out, err } = await run("node", [runner, BASE, "--script", scriptPath], {
    timeoutMs: 120000,
    // Handed to every suite and harmless to all but qa-session-write.mjs, which
    // must know the person the runner seeded on this board.
    env: { QA_SESSION_NAME, QA_SESSION_CODE },
  });
  const ms = Date.now() - started;
  const json = extractJson(out);

  if (code !== 0 || !json) {
    totalFail++;
    failures.push(suite);
    console.log(`FAIL  ${suite}  (${ms}ms)`);
    console.log((err || out).split("\n").slice(-14).join("\n"));
    continue;
  }

  const { pass, fail } = countAssertions(json);
  totalPass += pass;
  totalFail += fail;
  if (fail > 0) failures.push(suite);
  console.log(`${fail === 0 ? "PASS" : "FAIL"}  ${suite}  ${pass} passed, ${fail} failed  (${ms}ms)`);
  // Name the failing keys: a bare count says something is wrong but not what,
  // and the reason is often in a sibling value (a status, an error message).
  // Context keys are reported alongside: a failure is usually explained by a
  // status or message its sibling assertion recorded.
  const failed = Object.entries(json).filter(([, value]) => value === false).map(([key]) => key);
  for (const key of failed) console.log(`      failed: ${key}`);
  if (failed.length) {
    const context = Object.entries(json).filter(([key, value]) =>
      !failed.includes(key) && (typeof value === "string" || typeof value === "number")
    );
    if (context.length) console.log("      context: " + context.map(([k, v]) => `${k}=${v}`).join(", "));
  }
}

cleanup();
console.log("");
console.log(`${totalPass} assertions passed, ${totalFail} failed.`);
if (failures.length) {
  console.log("Suites with problems: " + failures.join(", "));
  process.exit(1);
}
console.log("All suites green.");
