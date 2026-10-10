# Sharondale Complex Management

Sharondale Complex Management application — a standalone caretaker operations dashboard for scheduling property tasks, tracking owner complaints, and producing a weekly report.

## Run locally

Open `dashboard/index.html` in a modern browser, or serve the project directory with any static file server.

## Included workflows

- Create tasks with location, priority, due date, notes, and a local photo preview
- Drag tasks across the weekly calendar and record move notes
- Mark tasks complete for the day
- Review complaints and owner reports
- Create a task directly from a complaint
- Close complaints with a recorded action
- Review and download a weekly report

## Project files

- `dashboard/index.html` - application markup
- `dashboard/styles.css` - visual design and responsive layout
- `dashboard/app.js` - task, complaint, calendar, photo, and report interactions
- `sharondale-weekly-report.csv` - sample weekly report export (mirrors the seeded data)
- `tests/serve.mjs` - local static dev/QA server (`node tests/serve.mjs`)
- `tests/qa.mjs` - browser QA script covering the board, complaints, and report

## Notes

The dashboard is fully client-side: tasks and complaints live in memory for the
session and reset on reload. The weekly report downloads as a plain-text summary
built from the current board state.
