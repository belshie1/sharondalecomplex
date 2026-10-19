/**
 * Vercel entry point: every request under /api/* arrives here.
 *
 * The page itself is served as a static file by Vercel (see vercel.json), so the
 * deploy is two halves in one project:
 *
 *   https://<project>.vercel.app/            -> dashboard/ (static, from the CDN)
 *   https://<project>.vercel.app/api/board   -> this function
 *
 * Storage is Supabase Postgres (server/supabase-db.mjs), because a function has
 * no disk to put a SQLite file on. Required environment variables:
 *
 *   SHARONDALE_TOKEN              the write access code
 *   SUPABASE_URL                  https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY     service_role key - server-side only
 *
 * server/index.mjs creates the server and listens when imported; on Vercel there
 * is nothing to listen on, so this wraps it the way Vercel expects: a default
 * export that is a request handler.
 */
process.env.SHARONDALE_API_ONLY = "1";

const { server } = await import("../server/index.mjs");

export default function handler(req, res) {
  server.emit("request", req, res);
}
