# Sharondale Complex Management

Sharondale Complex Management application — a standalone caretaker operations dashboard for scheduling property tasks, tracking owner complaints, and producing a weekly report.

## Run locally

Open `dashboard/index.html` in a modern browser, or serve the project directory with any static file server.

## Included workflows

- Create tasks with location, priority, due date, notes, and a local photo preview
- Create a task with no date: it is parked in the **Unscheduled** list until you schedule it
- Drag an unscheduled task onto any day column to schedule it, or drag a scheduled task back to the Unscheduled list
- Assign a task to a team member when creating it, or leave it unassigned
- Edit an existing task (title, location, due date or Unscheduled, priority, and assignee) from the pencil button on its card
- Mark a task to repeat every week indefinitely; recurring task templates are saved in the browser
- Require a password before removing tasks; removing a recurring task also stops future weekly repeats
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
- `tests/qa.mjs` - browser QA script covering the board, password-protected task removal, complaints, and report
- `tests/qa-edit-assign.mjs` - browser QA script covering task editing, reassignment, and the assignee selector
- `tests/qa-backlog.mjs` - browser QA script covering the unscheduled list, drag-to-schedule, and reload persistence

## How your data is saved

The dashboard is fully client-side, so it has no server to sync to. Everything you
enter — tasks, assignments, completion state, the unscheduled list, and complaints
— is saved in your **browser's local storage** under the `sharondaleBoardData` key
on every change. A "Saved" chip in the header confirms the write, and turns amber
while saving or red if the browser refuses the write (for example in private
browsing, where storage is limited).

Data is also re-saved if you close the tab mid-edit, and it is validated on load:
a corrupted or partially-written entry falls back to the seeded demo board rather
than wiping what is there.

Because this is browser storage, the important limits are:

- It is **per browser and per device**. Opening the dashboard on another computer,
  or in a different browser, shows that browser's own board, not a shared one.
- Clearing site data / "cookies and other site data" for this origin erases it.
- Private/incognito windows discard it when the window closes.

Weekly recurring task templates are stored separately under
`sharondaleRecurringTasks` and re-appear as fresh, incomplete tasks on their
chosen weekday each time the dashboard loads.

For a board genuinely shared between people and devices, the storage layer would
need to move to a hosted backend; `saveBoardData()` / `loadBoardData()` in
`dashboard/app.js` are the two functions to swap out.

The weekly report downloads as a plain-text summary built from the current board
state.
