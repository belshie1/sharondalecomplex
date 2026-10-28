/**
 * Loads environment files without a dependency.
 *
 * Node's own --env-file flag exists, but `npm start` does not pass it and a host
 * injects variables instead of a file, so the app has to cope with all three:
 *
 *   * variables already in the environment (a cloud host, docker -e, a shell
 *     export) always win - a committed example file must never override them;
 *   * `.env.local`, then `.env`, are read from the project root if present, so
 *     `npm start` picks up the Supabase settings in .env.local as intended;
 *   * a quoted value keeps its inner spaces, and a line without "=" or starting
 *     with "#" is skipped, which covers every file this project ships.
 *
 * Both files are git-ignored. Nothing here logs a value, because the secret key
 * and the write token both live in them.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

/** Value a script passes to say "this key is deliberately off", even on Windows. */
export const OFF_SENTINEL = "__off__";

export function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/** Reads the files in order, keeping what is already set in the environment. */
export function loadEnvFiles(files = [".env.local", ".env"]) {
  const loaded = [];
  // A key the environment already mentions is settled: it either carries a
  // value, or it was deliberately emptied to switch something off
  // (`SHARONDALE_TOKEN=""` in the test runner). Neither may be overwritten by a
  // file. An empty value IN A FILE means "not configured" - `.env.local` ships
  // `SUPABASE_DB_URL=` - so it never replaces a real value from `.env`.
  //
  // An empty value is a deliberate switch-off, so it is kept: a script that
  // clears SUPABASE_* (the QA suites, which reset the board constantly) must not
  // have `.env.local` put the live project back. On Windows a variable cannot
  // hold an empty string - the shell turns `$env:X=''` into "absent", and Node
  // drops it from the child's environment - so a script that means "off" passes
  // a sentinel instead: OFF_SENTINEL marks a key as settled-and-empty.
  const settled = new Set();
  const offKeys = new Set();
  for (const key of Object.keys(process.env)) {
    if (process.platform === "win32" && process.env[key] === "") continue;
    if (process.env[key] === OFF_SENTINEL) {
      offKeys.add(key);
      settled.add(key);
      continue;
    }
    settled.add(key);
  }
  for (const name of files) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    let parsed;
    try {
      parsed = parseEnv(fs.readFileSync(file, "utf8"));
    } catch (error) {
      console.log(`Could not read ${name}: ${error.message}`);
      continue;
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (settled.has(key) || value === "") continue;
      process.env[key] = value;
      settled.add(key);
    }
    loaded.push(name);
  }
  // Hand the caller the switch-off it asked for: "" everywhere, which is what
  // every reader of process.env already treats as not configured.
  for (const key of offKeys) process.env[key] = "";
  return loaded;
}

export const envFiles = loadEnvFiles();
