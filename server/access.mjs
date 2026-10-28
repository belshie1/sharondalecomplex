/**
 * Sign-in codes. Each person has a 4-digit code; one built-in admin code can
 * manage everyone else's. A successful login returns a signed, stateless
 * session token (HMAC), so it works the same on a long-running host and on a
 * serverless one.
 */
import crypto from "node:crypto";
import { storage } from "./db.mjs";

export const ADMIN_CODE = process.env.SHARONDALE_ADMIN_CODE || "123454321";
const SECRET = process.env.SHARONDALE_SESSION_SECRET || crypto.createHash("sha256").update("sharondale-session:" + ADMIN_CODE).digest("hex");
const SESSION_MS = 12 * 60 * 60 * 1000;

const sign = (payload) => crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function issueSession(name, admin) {
  const payload = Buffer.from(JSON.stringify({ n: name, a: admin ? 1 : 0, e: Date.now() + SESSION_MS })).toString("base64url");
  return payload + "." + sign(payload);
}

export function readSession(token) {
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data || data.e < Date.now()) return null;
    return { name: String(data.n), admin: data.a === 1 };
  } catch {
    return null;
  }
}

export function sessionFromRequest(req) {
  const header = String(req.headers.authorization || "");
  return readSession(header.startsWith("Bearer ") ? header.slice(7) : "");
}

// Four digits is a small space, so repeated wrong guesses from one address are
// refused for a while.
const failures = new Map();
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export function lockedOut(key) {
  const f = failures.get(key);
  if (!f) return false;
  if (f.until && f.until > Date.now()) return true;
  if (f.until) failures.delete(key);
  return false;
}

function recordFailure(key) {
  const f = failures.get(key) || { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILURES) {
    f.until = Date.now() + LOCK_MS;
    f.count = 0;
  }
  failures.set(key, f);
}

export async function login(code, key) {
  const entered = String(code || "").trim();
  if (!/^\d{4,9}$/.test(entered)) {
    recordFailure(key);
    return null;
  }
  if (safeEqual(entered, ADMIN_CODE)) {
    failures.delete(key);
    return { name: "Admin", admin: true, token: issueSession("Admin", true) };
  }
  const match = (await storage.readAccess()).find((c) => safeEqual(c.code, entered));
  if (!match) {
    recordFailure(key);
    return null;
  }
  failures.delete(key);
  return { name: match.name, admin: false, token: issueSession(match.name, false) };
}

/** Set (or, with an empty code, remove) one person's code. Returns an error string or null. */
export async function setCode(name, code) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return "A name is required.";
  const codes = await storage.readAccess();
  const others = codes.filter((c) => c.name !== cleanName);
  const next = String(code || "").trim();
  if (next) {
    if (!/^\d{4}$/.test(next)) return "A code must be exactly 4 digits.";
    if (next === ADMIN_CODE || others.some((c) => c.code === next)) return "That code is already in use.";
    others.push({ name: cleanName, code: next });
  }
  await storage.writeAccess(others);
  return null;
}

export const listCodes = () => storage.readAccess();
