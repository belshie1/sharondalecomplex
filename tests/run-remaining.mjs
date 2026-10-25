/**
 * Local helper: starts the backend exactly like tests/run-all.mjs does, then
 * runs only the named QA suites. Used when npm test's full run outlives the
 * terminal's time limit, so the remaining suites can still be verified.
 *
 *   node tests/run-remaining.mjs qa-complaint-delete.mjs qa-backend.mjs qa-static-host.mjs
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const PORT = Number(process.env.PORT) || 3125;
const BASE = `http://localhost:${PORT}/`;

const suites = process.argv.slice(2);
if (!suites.length) {
  console.error("Pass one or more suite file names.");
  process.exit(2);
}

function findRunner() {
  return [
    process.env.BROWSER_RUNNER,
    path.join(os.homedir(), ".codegpt", "skills", "browser-automation", "browser.mjs"),
    path.join(root, "node_modules", ".bin", "browser.mjs"),
  ].filter(Boolean).find((p) => fs.existsSync(p)) || null;
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
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
  console.error("Could not find browser.mjs.");
  process.exit(1);
}

const server = spawn("node", ["server/index.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(PORT),
    SHARONDALE_DB: ":memory:",
    SUPABASE_URL: "",
    SUPABASE_SECRET_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_KEY: "",
    SUPABASE_DB_URL: "",
    SHARONDALE_TOKEN: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const cleanup = () => { if (!server.killed) server.kill("SIGTERM"); };
process.on("exit", cleanup);

const deadline = Date.now() + 15000;
let healthy = false;
while (Date.now() < deadline) {
  try {
    const res = await fetch(BASE + "api/health");
    if (res.ok) { healthy = true; break; }
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}
if (!healthy) {
  console.error("Backend did not become healthy in time.");
  cleanup();
  process.exit(1);
}
console.log(`Backend is healthy on ${BASE}\n`);

let failed = 0;
for (const suite of suites) {
  const started = Date.now();
  const { code, out, err } = await run("node", [runner, BASE, "--script", path.join(root, "tests", suite)]);
  const ms = Date.now() - started;
  const json = extractJson(out);
  if (code !== 0 || !json) {
    failed++;
    console.log(`FAIL  ${suite}  (${ms}ms)`);
    console.log((err || out).split("\n").slice(-14).join("\n"));
    continue;
  }
  const { pass, fail } = countAssertions(json);
  if (fail > 0) failed++;
  console.log(`${fail === 0 ? "PASS" : "FAIL"}  ${suite}  ${pass} passed, ${fail} failed  (${ms}ms)`);
}

cleanup();
process.exit(failed ? 1 : 0);
