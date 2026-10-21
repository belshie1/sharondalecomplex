/**
 * Checks a running deployment from the outside.
 *
 *   BASE_URL=https://your-app.example.com       node tests/verify-deploy.mjs
 *   BASE_URL=https://your-app.example.com/api   node tests/verify-deploy.mjs
 *
 * Both forms are accepted, because the two callers pass different things:
 * deploy-vercel.yml passes the deployed site, publish-dashboard.yml passes
 * SHARONDALE_API, which is the API root. Taking the page URL and appending
 * "/api" to it turned that API root into "/api/api/health" and failed every
 * publish, so the publish workflow could never ship a fresh dashboard.
 *
 * This exists because the previous GitHub Pages workflow published only the
 * static dashboard and went green on every push. The site loaded, so it looked
 * healthy, but /api/* returned 404 and nothing a caretaker did was ever saved.
 * A green deploy check has to prove the backend is reachable, that it is backed
 * by storage that survives a restart, and that writes are protected.
 *
 * Exits non-zero with a specific message on the first thing that is wrong.
 */

const given = (process.env.BASE_URL || "").replace(/\/+$/, "");

if (!given) {
  console.error("BASE_URL is not set. Example:");
  console.error("  BASE_URL=https://your-app.example.com node tests/verify-deploy.mjs");
  process.exit(1);
}

const fail = (msg) => {
  console.error("FAIL  " + msg);
  process.exit(1);
};

async function getJson(path) {
  let res;
  try {
    res = await fetch(base + path, { redirect: "follow" });
  } catch (error) {
    fail(`could not reach ${base}${path} (${error.message})`);
  }
  const text = await res.text();
  if (!res.ok) {
    // A 404 on /api/health is the signature of a static-only host: the page is
    // served, but no backend is there to answer.
    fail(
      `${base}${path} returned HTTP ${res.status}.` +
      (res.status === 404
        ? " That usually means only the static dashboard was deployed and no" +
        " backend is running at this address."
        : "") +
      (text ? `\n      Body: ${text.slice(0, 200)}` : "")
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`${base}${path} did not return JSON (got: ${text.slice(0, 120)})`);
  }
}

// An API root (".../api") names the backend, not the site: its paths are
// /health and /board, and there is no page to load. A site URL is the normal
// form, where the dashboard and the API share one origin.
const apiOnly = /\/api$/.test(given);
const siteBase = apiOnly ? given.replace(/\/api$/, "") : given;
const base = apiOnly ? given : given + "/api";

console.log(`Verifying ${apiOnly ? "API at " + base : siteBase}\n`);

// 1. The dashboard itself is served.
if (apiOnly) {
  console.log(`  --  the page is hosted separately; checking ${base} only`);
} else {
  const page = await fetch(siteBase + "/", { redirect: "follow" });
  if (!page.ok) fail(`the dashboard at ${siteBase}/ returned HTTP ${page.status}`);
  const html = await page.text();
  if (!html.includes("Sharondale")) {
    fail(`${siteBase}/ did not look like the dashboard (no "Sharondale" in the HTML)`);
  }
  console.log("  ok  dashboard is served");
}

// 2. The backend is alive.
const health = await getJson("/health");
if (health.ok !== true) fail(`${base}/health reported ok=${health.ok}`);
console.log("  ok  API is reachable");

// 3. Storage is real and persistent. ":memory:" or a temp path means the board
//    is lost when the instance is replaced.
const dbPath = String(health.database || "");
if (!dbPath) {
  fail(`${base}/health did not report a database path; deploy an up-to-date backend`);
}
if (dbPath.includes(":memory:")) {
  fail("the backend is using an in-memory database, so nothing is persisted");
}
if (/[\\/](tmp|var[\\/]tmp)[\\/]/i.test(dbPath)) {
  fail(
    `the database is at ${dbPath}, which looks like ephemeral storage.` +
    " Attach a persistent volume and set SHARONDALE_DB to a path on it."
  );
}
console.log(`  ok  database is at ${dbPath}`);

// 4. Writes are protected, or anyone who finds the URL can wipe the board.
if (health.writesProtected !== true) {
  fail(
    "writes are NOT protected (writesProtected:false). Set SHARONDALE_TOKEN on" +
    " the host; anyone who finds this URL can currently change or wipe the board."
  );
}
console.log("  ok  writes are protected by an access code");

// 5. The board is readable, and the API answers an unauthenticated write with
//    401 rather than accepting it.
const board = await getJson("/board");
for (const key of ["tasks", "complaints", "shopping", "requests"]) {
  if (!Array.isArray(board[key])) {
    fail(`${base}/board did not return a "${key}" array; the backend looks out of date`);
  }
}
console.log(
  `  ok  board is readable (${board.tasks.length} tasks, ${board.complaints.length} complaints, ${board.requests.length} requests)`
);

const put = await fetch(base + "/board", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tasks: [], complaints: [], shopping: [], recurring: [] }),
});
if (put.status !== 401) {
  fail(
    `an unauthenticated write returned HTTP ${put.status} instead of 401.` +
    " The board may be publicly writable - check SHARONDALE_TOKEN on the host."
  );
}
console.log("  ok  an unauthenticated write is refused with 401");

console.log(`\nPASS  ${siteBase} is a working Sharondale deployment.`);
