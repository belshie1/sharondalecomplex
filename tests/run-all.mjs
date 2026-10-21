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

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const PORT = Number(process.env.PORT) || 3123;
const BASE = `http://localhost:${PORT}/`;

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
    child.on("close", (code) => resolve({ code, out, err }));
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
    // Writes are protected in production tests; locally the suites write
    // directly, exactly as a visitor who has entered the code would.
    SHARONDALE_TOKEN: "",
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

let totalPass = 0;
let totalFail = 0;
const failures = [];

for (const suite of SUITES) {
  const scriptPath = path.join(root, "tests", suite);
  const started = Date.now();
  const { code, out, err } = await run("node", [runner, BASE, "--script", scriptPath]);
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
}

cleanup();
console.log("");
console.log(`${totalPass} assertions passed, ${totalFail} failed.`);
if (failures.length) {
  console.log("Suites with problems: " + failures.join(", "));
  process.exit(1);
}
console.log("All suites green.");
