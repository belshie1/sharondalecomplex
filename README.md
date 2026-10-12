# Sharondale Complex Management

Sharondale Complex Management application - a caretaker operations dashboard for scheduling property tasks, tracking owner complaints, keeping a shopping list, and producing a weekly report. It runs as a Node backend with a SQLite database, so the board is shared between devices rather than stored in one browser.

## Quick start

```bash
npm start
```

Then open <http://localhost:3000/>. See [Running it](#running-it) for details and
[Deploying it to a cloud host](#deploying-it-to-a-cloud-host) to put it online.

## Included workflows

- Create tasks with location, priority, due date, notes, and a local photo preview
- Create a task with no date: it is parked in the **Unscheduled** list until you schedule it
- Drag an unscheduled task onto any day column to schedule it, or drag a scheduled task back to the Unscheduled list
- Assign a task to a team member when creating it, or leave it unassigned
- Edit an existing task (title, location, due date or Unscheduled, priority, and assignee) from the pencil button on its card
- Mark a task to repeat every week indefinitely; recurring templates are stored on the server, so every device sees the same repeats
- Require a password before removing tasks; removing a recurring task also stops future weekly repeats
- Drag tasks across the weekly calendar and record move notes
- Mark tasks complete for the day
- Review complaints and owner reports
- Create a task directly from a complaint
- Close complaints with a recorded action
- Review and download a weekly report
- Keep a shopping list of supplies: add items with a quantity, and ticking one off removes it from the list

## Project files

- `dashboard/index.html` - application markup
- `dashboard/styles.css` - visual design and responsive layout
- `dashboard/app.js` - task, complaint, calendar, photo, and report interactions
- `server/index.mjs` - the backend: HTTP API plus static serving of the dashboard
- `server/db.mjs` - SQLite schema and the only code that touches storage
- `server/seed.mjs` - seeds a brand-new database with the starter board
- `sharondale-weekly-report.csv` - sample weekly report export (mirrors the seeded data)
- `tests/qa.mjs` - browser QA script covering the board, password-protected task removal, complaints, and report
- `tests/qa-edit-assign.mjs` - browser QA script covering task editing, reassignment, and the assignee selector
- `tests/qa-backlog.mjs` - browser QA script covering the unscheduled list, drag-to-schedule, and persistence
- `tests/qa-shopping.mjs` - browser QA script covering the shopping list, tick-to-remove, and persistence
- `tests/qa-backend.mjs` - proves data is stored server-side and visible from a second device
- `tests/helpers.mjs` - shared QA helpers, including a board reset
- `tests/serve.mjs` - minimal static-only server, for working on the UI without the API

## Running it

The dashboard needs the backend, which serves both the API and the page:

```bash
npm start                 # http://localhost:3000
PORT=8080 npm start       # custom port
```

Open <http://localhost:3000/>. The database file is created automatically at
`data/sharondale.db` and seeded with the starter board the first time it runs.

To work on the interface without the API, `node tests/serve.mjs` serves just the
static files at <http://localhost:8123/dashboard/index.html>.

## How your data is saved

The board lives in a **real backend** - a Node HTTP API over a SQLite database
(`data/sharondale.db`) - so it is not tied to one browser. Every device that
opens the dashboard reads and writes the same board, and a change made on one
shows up on the others over a server-sent events stream, without a manual reload.

A "Saved" chip in the header reports the state of the connection:

| Chip | Meaning |
|---|---|
| **Saved** | The server confirmed the write. |
| **Offline - will retry** | The server was unreachable. The change is held locally and retried every 5 seconds. |
| **Could not save** | The server rejected the write (for example a bad payload). |

The browser keeps a `localStorage` snapshot purely as an **offline cache**: if the
API is down the dashboard still opens and stays usable, and it syncs once the
server returns. It is a mirror of the server, never the source of truth.

## Deploying it to a cloud host

This runs on any host that can run Node. Two things matter:

**1. Persist the database.** `data/sharondale.db` is the whole board. Most hosts
have an ephemeral filesystem, so mount a **persistent disk/volume** at `data/`
or set `SHARONDALE_DB` to a path on one. Without this the board resets on every
deploy.

```bash
SHARONDALE_DB=/var/data/sharondale.db npm start
```

**2. Protect writes before exposing it publicly.** By default the API is open:
anyone who can reach the port can change the board. Set a token and give the page
the same value:

```bash
SHARONDALE_TOKEN=$(openssl rand -hex 24) npm start
```

```html
<!-- in dashboard/index.html, before app.js -->
<script>window.SHARONDALE_TOKEN = "the-same-value";</script>
```

Requests without a matching `X-Sharondale-Token` header are refused with 401. The
startup banner warns loudly when the token is unset.

Typical steps on Render/Railway/Fly/a VPS:

```bash
# build: none needed, there are no dependencies
npm start                      # start command
```

Then point a domain or subdomain at it. Note the write token is visible to anyone
who can view the page source, so it stops casual tampering rather than a
determined attacker; add real authentication if the board holds anything
sensitive.

### Swapping the database

`server/db.mjs` is the only file that touches storage, and it exports exactly
four functions (`readAll`, `replaceBoard`, `isSeeded`, `closeDb`). Replacing the
SQLite calls with Postgres or Supabase means rewriting that one file.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Counts and whether writes are protected. |
| `GET` | `/api/board` | The whole board: tasks, complaints, shopping, recurring. |
| `PUT` | `/api/board` | Replace the whole board (validation errors return 400 with details). |
| `GET` | `/api/events` | Server-sent events; pushes `board` on every accepted write. |

The dashboard writes the board as a single unit, since a drag, a tick, or a move
changes several fields at once and a whole-board write cannot half-apply them.

## Tests

The browser suites expect the backend to be running:

```bash
npm start
node <browser-automation-skill-dir>/browser.mjs http://localhost:3000/ --script ./tests/qa.mjs
```

They share one server, so each suite resets the board through the API before
asserting, and identifies rows by unique markers rather than position.

The weekly report downloads as a plain-text summary built from the current board
state.

