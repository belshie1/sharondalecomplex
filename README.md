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
- Record who created a task: the composer has a **Created by** list that defaults to whoever is signed in
- Manage the roster from the **People** screen: add or remove names, give them a role, and see each person's open task count
- Switch who you are with the **Working as** selector in the sidebar; the Created by default follows it
- Assign a task to yourself in one click from the card
- Edit an existing task (title, location, due date or Unscheduled, priority, and assignee) from the pencil button on its card
- Mark a task to repeat every week indefinitely; recurring templates are stored on the server, so every device sees the same repeats
- Require a password before removing tasks; removing a recurring task also stops future weekly repeats
- Drag tasks across the weekly calendar and record move notes
- Mark tasks complete for the day
- Review complaints and owner reports
- Create a task directly from a complaint
- Close complaints with a recorded action
- Review the weekly report and save it as a **PDF** (print-ready, with a plain-text export alongside)
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
- `tests/qa-people.mjs` - browser QA script covering the People roster and the Created by field
- `tests/qa-report.mjs` - browser QA script covering the printable PDF report
- `tests/run-all.mjs` - runs every QA suite against a throwaway backend (`npm test`)
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
| **Saved** | Unlocked, and the server confirmed the write. |
| **Locked - enter code** | Readable, but changes need the access code. Click it to enter one. |
| **Offline - will retry** | The server was unreachable; the change is held and retried. |

The browser keeps a `localStorage` snapshot purely as an **offline cache**: if the
API is down the dashboard still opens and stays usable, and it syncs once the
server returns. It is a mirror of the server, never the source of truth.

## Deploying it to a cloud host

See **[DEPLOY.md](DEPLOY.md)** for the full walkthrough - it covers a Render
blueprint deploy, plain Docker, and Fly/Railway/VPS, plus how to generate and
apply the write token.

In short, two things matter:

1. **Mount a persistent disk** for the database. Most hosts have an ephemeral
   filesystem, so without this the board resets on every deploy. Set
   `SHARONDALE_DB` to a path on the volume, or mount it at `/app/data`.
2. **Set `SHARONDALE_TOKEN`** before the URL is public, or anyone who finds it can
   change the board. There is nothing to paste into the repo: open the dashboard
   once and enter the code when prompted. It is stored in that browser and never
   appears in the page source.

Deploy artefacts included in the repo:

| File | Purpose |
|---|---|
| `Dockerfile` | Self-contained image, no build step, health check included. |
| `render.yaml` | Render blueprint: web service, disk, health check, token. |
| `Procfile` | For buildpack-based hosts such as Heroku. |
| `.dockerignore` | Keeps local data and secrets out of the image. |

`server/db.mjs` is the only file that touches storage, so moving to Postgres or
Supabase means rewriting that one file.

The roster of people lives on the server too, so a name added on one device is
immediately available everywhere.

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

The weekly report opens a print-ready A4 document in a new tab and triggers the
browser's print dialog, where **Save as PDF** produces the file. Doing it this
way avoids bundling a PDF library: the document is rendered by the browser the
caretaker already has. It is styled for print, grouped by day, and includes the
stats, progress, task detail, complaints and outstanding shopping. A plain-text
export sits beside it for anyone who wants the raw figures.

