# Deploying Sharondale

The app is a single Node process that serves both the dashboard and its API, and
keeps everything in one SQLite file. That makes deployment simple, with two
things that must be right:

1. **A persistent disk for the database.** Most hosts give you an ephemeral
   filesystem, so without this the board resets on every deploy.
2. **A write token.** Otherwise anyone who finds the URL can change the board.

Everything below has been tested by building and running the container locally,
including data surviving a restart.

---

## Option A - Render (blueprint, fewest clicks)

`render.yaml` in this repo describes the whole service, so Render only needs to
be pointed at the repository.

1. Create a free account at <https://render.com> and connect your GitHub.
2. **New → Blueprint**, pick `belshie1/sharondalecomplex`, and Confirm.
3. Render reads `render.yaml` and provisions:
   - a Docker web service on `plan: starter`
   - a 1 GB disk mounted at `/app/data` (where the database lives)
   - a health check on `/api/health`
4. When prompted for `SHARONDALE_TOKEN`, paste a generated secret (see below).
5. Wait for the first build, then open the URL Render gives you.

**Choose "starter" or higher.** The free instance type does not support
persistent disks, so on free the board would reset on every deploy. This is the
one place where deploying properly costs a few dollars a month.

## Option B - Any host that runs Docker

The `Dockerfile` is self-contained and has no build steps.

```bash
docker build -t sharondale .
docker run -d --name sharondale \
  -p 3000:3000 \
  -v sharondale-data:/app/data \
  -e SHARONDALE_TOKEN="$(openssl rand -hex 24)" \
  sharondale
```

Then put a reverse proxy (nginx, Caddy, Cloudflare Tunnel) in front for HTTPS.
`-v sharondale-data:/app/data` is the persistent volume - do not omit it.

## Option C - Fly.io / Railway / a VPS

Use the same `Dockerfile`. Set these environment variables:

| Variable | Purpose |
| --- | --- |
| `PORT` | Port to listen on. Most hosts set this for you. |
| `SHARONDALE_TOKEN` | Required to make writes safe. |
| `SHARONDALE_DB` | Path to the database, e.g. `/app/data/sharondale.db`. |

Mount a volume at the database's directory. On Fly that is `fly volumes create`
plus a `[mounts]` entry; on Railway it is a volume on the service.

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
