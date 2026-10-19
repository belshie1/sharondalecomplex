# Deploying Sharondale

The app has two parts, and **they must be deployed together**:

- a **dashboard** (static HTML/CSS/JS in `dashboard/`)
- a **backend** (a Node API over a SQLite database in `server/`)

The backend serves the dashboard, so this is **one service and one URL**.

## Read this first: a static host is not enough

The dashboard used to be published to GitHub Pages, and that was a mistake worth
understanding before choosing a host.

GitHub Pages serves static files only. It cannot run `server/index.mjs`, so
`/api/*` returned 404 and **nothing was ever saved**. It looked fine, because
`dashboard/app.js` ships a hardcoded fallback board that looks just like the
seeded data - a visitor saw a fully populated dashboard. The only clue was the
header chip reading **"Offline - will retry"** and an activity entry saying
*"Cannot reach the server and no offline copy exists"*.

The Pages workflow has been removed. **Do not put this app on a static-only
host** (GitHub Pages, plain S3, a CDN) unless you only want a demo. If you keep
the dashboard static and host the API elsewhere, point it at the API with:

```html
<script>window.SHARONDALE_API = "https://your-api.example.com/api";</script>
```

placed in `dashboard/index.html` before `app.js` loads. The API must then send
`Access-Control-Allow-Origin` for the dashboard's origin, which this backend does
not do yet.

---

## The two things that must be right

1. **The database must be persistent.** A file on the instance's disk does not
   survive a deploy or a restart on most hosts, so the board would silently
   reset. Attach a volume and point `SHARONDALE_DB` at it.
2. **Writes must be protected.** Without `SHARONDALE_TOKEN` anyone who finds the
   URL can change or wipe the board.

The server warns about both at startup, and `/api/health` reports the database
path so you can check it from outside.

---

## Option A - Fly.io (recommended)

`fly.toml` is already in the repo. Fly volumes are straightforward, which makes
the persistent-database requirement easy to satisfy.

```bash
fly launch --no-deploy --copy-config
fly volumes create sharondale_data --size 1 --region jnb
fly secrets set SHARONDALE_TOKEN="$(openssl rand -hex 24)"
fly deploy
```

Then check it:

```bash
fly open /api/health
```

Expect `"writesProtected": true` and a `database` path under `/app/data`.

## Option B - Railway

`railway.toml` is in the repo. Railway builds the `Dockerfile`.

1. Create a project from this repo.
2. **Add a Volume** mounted at `/app/data`. Without this the board resets on
   every deploy.
3. Set variables: `SHARONDALE_DB=/app/data/sharondale.db` and
   `SHARONDALE_TOKEN=<your code>`.
4. Keep replicas at **1**.

## Option C - Render

`render.yaml` is a blueprint that declares the disk and the environment. Commit
it, then create a Blueprint instance from the repo and set `SHARONDALE_TOKEN` in
the dashboard when prompted.

## Option D - Koyeb

`koyeb.yaml` describes the service. Deploy from the `Dockerfile`, then add a
volume at `/app/data`, set `SHARONDALE_DB=/app/data/sharondale.db`, set
`SHARONDALE_TOKEN`, and keep the instance count at 1.

## Option E - Docker on a VPS

```bash
docker build -t sharondale .
docker run -d --name sharondale \
  -p 3000:3000 \
  -v sharondale-data:/app/data \
  -e SHARONDALE_TOKEN="$(openssl rand -hex 24)" \
  sharondale
```

`-v sharondale-data:/app/data` is the persistent volume - **do not omit it**.
Put HTTPS in front (Caddy or nginx).

## Option F - a machine that stays on (no cloud account, no card)

This is the option to use when there is no free Node host available. The app runs
on any always-on Windows, Linux or macOS machine, and **Tailscale Serve** gives it
a stable `https://` address: no port forwarding, no dynamic-DNS, no certificate
to renew.

**Important:** the address is `https://sharondale.<your-tailnet>.ts.net`, which is
reachable **only from devices signed in to your tailnet**. Anyone who needs to use
the board installs Tailscale and you share the machine with them (one click per
person in the admin console). That is what makes the data private; a plain public
URL would expose every task and complaint to anyone who finds it.

1. Install [Docker](https://docs.docker.com/get-docker/) and
   [Tailscale](https://tailscale.com/download) on the machine.
2. Create an auth key: <https://login.tailscale.com/admin/settings/keys> -
   **reusable** and **pre-approved** (the second one lets Serve publish HTTPS).
3. Copy `.env.example` to `.env` and fill in `SHARONDALE_TOKEN` and `TS_AUTHKEY`.
4. Start it:

   ```bash
   docker compose up -d
   ```

5. Sign in to Tailscale on your phone or laptop and open
   `https://sharondale.<your-tailnet>.ts.net`.

With a Linux server instead of a desktop, `deploy/vps/deploy.sh user@server` does
the same in one step (Docker + `tailscale serve`), and
`deploy/tailscale/serve.json` is the config the compose file uses.

Check it from outside with the address you see:

```bash
BASE_URL=https://sharondale.your-tailnet.ts.net node tests/verify-deploy.mjs
```

### Putting the page back on GitHub Pages

If you want the familiar `https://belshie1.github.io/sharondalecomplex/` address
and the backend elsewhere, both halves can be split. That only works when the
two agree, so this repo enforces it:

1. On the backend set `SHARONDALE_ALLOWED_ORIGINS=https://belshie1.github.io`,
   or every save from the page is refused by the browser.
2. In the repo set the action variable `SHARONDALE_API` to the backend's API
   root, e.g. `https://sharondale.your-tailnet.ts.net/api`, then run
   **Publish dashboard to Pages**. The workflow injects that address into the
   page, publishes it, and immediately runs `verify-deploy.mjs` against the
   result - a green run means the page and the backend are talking.

Without `SHARONDALE_API` the workflow fails instead of publishing. A page alone
loads a hardcoded fallback board that looks real but never saves, which is how
the original deployment looked healthy while losing everything.

---

## Why one instance only

The board is a single SQLite file. Two instances would each hold their own copy
and the two would diverge, so every option above pins the service to one
instance. If you need more than one - or more than a handful of users - move to
Postgres first. `server/db.mjs` is the only file that touches storage: it exports
`readAll`, `replaceBoard`, `isSeeded` and `closeDb`, so the schema and queries
carry over.

Note that the server-sent-events stream (`/api/events`) is what makes a change on
one device appear on another without a reload. It needs a host that allows a
long-lived HTTP response. If a platform buffers or times out that stream, the
dashboard still works - it just refreshes on the next load instead of live.

---

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Port to listen on. Most hosts set this for you. |
| `SHARONDALE_TOKEN` | **Required in production.** The write access code. |
| `SHARONDALE_DB` | Path to the database, e.g. `/app/data/sharondale.db`. |
| `SHARONDALE_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the API, needed only when the page is hosted separately (e.g. `https://belshie1.github.io`). |
| `HOST` | Interface to bind. Defaults to `0.0.0.0`. |

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
BASE_URL=https://your-app.example.com node tests/verify-deploy.mjs
```

This is the check that would have caught the broken Pages deployment. It fails
with a specific reason if any of these is wrong:

- the dashboard is not served,
- `/api/health` 404s (no backend deployed),
- the database is in memory or in a temp directory (the board will not survive),
- `writesProtected` is false (the board is publicly writable),
- the board cannot be read, or an unauthenticated write is not refused with 401.

You can also check by hand:

```bash
curl https://your-app.example.com/api/health
```

```json
{
  "ok": true,
  "seeded": true,
  "tasks": 12,
  "complaints": 5,
  "shopping": 4,
  "requests": 3,
  "writesProtected": true,
  "database": "/app/data/sharondale.db"
}
```

`writesProtected: true` means the token is set. If it is `false`, **the board is
publicly writable** - set the token immediately. If `database` is missing, the
backend is out of date; if it contains `:memory:` or a `/tmp/` path, the board
will not survive a restart.

## Continuously checking the live deployment

`.github/workflows/verify-deploy.yml` calls `/api/health` on `SHARONDALE_URL`
**directly**, with no browser involved, so a browser's CORS rules never apply to
it. A backend that only lives on a private tailnet cannot be reached from a
GitHub runner at all, so for those deployments run the check by hand from a
device on the tailnet (below). For a public host, set the variable and the check
runs on every push, daily, and on demand.

**Settings -> Secrets and variables -> Actions -> Variables -> New variable**

| Name | Value |
| --- | --- |
| `SHARONDALE_URL` | `https://your-app.example.com` |

Until that variable is set the workflow skips instead of failing. Once it is
set, a red check means the live app is genuinely broken - which is what the old
Pages workflow never did. If it is red, the failure text names the exact problem
- a 404 means the backend is gone, `writesProtected:false` means the access code
was cleared, and a temp `database` path means the volume detached.

---

## What is still not done

- **No login.** Anyone with the URL can *view* the board. Adding the token stops
  them changing it, but not reading it.
- **No CORS by default.** The API answers same-origin requests only, which is why
  the dashboard and the API should be deployed together. Set
  `SHARONDALE_ALLOWED_ORIGINS` if the page is hosted separately (see Option F).
- **SQLite on one instance.** This suits a single building with a handful of
  users. If several instances run behind a load balancer they would each need
  their own database, so move to Postgres first - `server/db.mjs` is the only
  file that touches storage.
