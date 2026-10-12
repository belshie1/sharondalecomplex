# Deploying Sharondale

The app has two parts:

- a **dashboard** (static HTML/CSS/JS in `dashboard/`)
- a **backend** (a Node API over a database in `server/`)

They can be hosted together on one Node host, or split - which is what Netlify
requires, because Netlify serves the static files and runs the API as serverless
functions.

Two things must be right whatever you choose:

1. **The database must be persistent.** A file on disk does not survive a deploy
   on most hosts, so the board would reset.
2. **Writes must be protected.** Otherwise anyone who finds the URL can change or
   wipe the board.

---

## Option A - Single Node host (simplest)

The backend already serves the dashboard, so this needs one service and no
changes. Works on Railway, Fly.io, Koyeb, a VPS, or anything that runs Docker.

```bash
docker build -t sharondale .
docker run -d --name sharondale \
  -p 3000:3000 \
  -v sharondale-data:/app/data \
  -e SHARONDALE_TOKEN="$(openssl rand -hex 24)" \
  sharondale
```

`-v sharondale-data:/app/data` is the persistent volume - **do not omit it**.

| Variable | Purpose |
| --- | --- |
| `PORT` | Port to listen on. Most hosts set this for you. |
| `SHARONDALE_TOKEN` | Required to make writes safe. |
| `SHARONDALE_DB` | Path to the database, e.g. `/app/data/sharondale.db`. |

Then mount a volume at the database's directory and put HTTPS in front.

## Option B - Netlify

Netlify serves the dashboard and runs the API as serverless functions. That means
**SQLite cannot be used**: Netlify's filesystem is ephemeral, so a writable
`.db` file is lost between requests. The database has to move to a hosted one -
[Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database/)
is built into the platform and is the least moving parts.

This is a port, not a configuration change. What it involves:

1. The API routes in `server/index.mjs` become Netlify Functions.
2. `server/db.mjs` is reimplemented against Postgres. It is the only file that
   touches storage - it exports `readAll`, `replaceBoard`, `isSeeded` and
   `closeDb` - so the schema and queries carry over.
3. **Live sync changes.** Serverless functions cannot hold a server-sent-events
   stream open, so the dashboard polls for changes instead of receiving them.
4. Claim the database branch; an unclaimed Netlify database is deleted after a
   period, taking its data with it.

The dashboard's API contract stays the same, so `app.js` needs little change.

## Option C - Fly.io / Railway / a VPS

Use the same `Dockerfile` as Option A, with a volume mounted at the database's
directory. On Fly that is `fly volumes create` plus a `[mounts]` entry; on
Railway it is a volume on the service.

---

## Generating and applying the token

```bash
openssl rand -hex 24
```

Set it on the host as `SHARONDALE_TOKEN`, then **open the dashboard and enter the
same code when prompted**. The first load shows a "Locked - enter code" chip and
an unlock prompt; once entered, the code is stored in that browser only and you
are not asked again.

There is nothing to paste into the repo. The code is never committed and never
appears in the page source, so someone reading the HTML cannot copy it. Each
person who needs to make changes enters the code once on their own device.

If you would rather bake it into the page (simpler, but visible to anyone who
views source), put this in `dashboard/index.html` before `app.js` loads:

```html
<script>window.SHARONDALE_TOKEN = "the-same-value";</script>
```

The chip states:

| Chip | Meaning |
| --- | --- |
| **Saved** | Unlocked, and the server confirmed the last write. |
| **Locked - enter code** | Readable, but changes need the code. Click it to enter one. |
| **Offline - will retry** | The server is unreachable; the change is held and retried. |

**Be aware:** the code stops people *changing* the board, not *reading* it.
Anyone with the URL can still see every task and complaint. If the board will
hold anything sensitive, add real authentication (a login page and a session
cookie) before putting it on a public URL.

---

## Checking a deployment

```bash
curl https://your-app.example.com/api/health
```

```json
{"ok":true,"seeded":true,"tasks":12,"complaints":5,"shopping":4,"writesProtected":true}
```

`writesProtected: true` means the token is set. If it is `false`, **the board is
publicly writable** - anyone who finds the URL can change or wipe it - and you
should set the token immediately.

---

## What is still not done

- **No login.** Anyone with the URL can *view* the board. Adding the token stops
  them changing it, but not reading it.
- **SQLite on one instance.** This suits a single building with a handful of
  users. If several instances run behind a load balancer they would each need
  their own database, so move to Postgres first - `server/db.mjs` is the only
  file that touches storage.
