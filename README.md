# Leads Follow-up Dashboard

A dashboard for call-center teams to follow up with university leads. Built with React and Vite.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. First login: `admin@admin.com` / `admin123`. Change this password under **Employees**.

Optional: a local, git-ignored `src/store/demo.local.js` generates sample data for development. Without it the app starts empty.

## Features

- **Admins** add call-center employees, import Excel sheets (map columns, assign to one employee or split evenly, skip duplicates), manage statuses, custom columns and certificate options.
- **Employees** see only their own leads, as a Kanban pipeline (drag cards between statuses) or a table (search, filters, sorting, bulk actions, Excel export).
- **Each lead** has name, email, phone, city, country, nationality, gender, last certificate stage, notes, files, date created, last contact date, WhatsApp call/message and 3CX call flags, answered, following up and blocked flags, custom columns, an activity log and meetings.
- **Dashboard** (by month, with a picker for earlier months):
  - **Overview:** KPIs with change from last month, top performers, daily activity, outcomes, a 6-month trend, the current pipeline, and the employee leaderboard.
  - **Employees:** each employee's monthly statistics and meetings.
  - **Meetings:** meetings done and upcoming.
  - **Export:** Excel report (several sheets) and Print / PDF.

## How the numbers are counted

- **Outcomes** (interested, very interested, not interested, registered, blocked): leads *moved into* a status of that kind during the month. Each status's "Counts as" setting is in **Settings**.
- **Calls, messages, follow-ups:** activities logged in the month.
- **Meetings:** meetings dated in the month.

## Data storage (current stage)

Data is saved in the browser's IndexedDB, through `src/store/StoreContext.jsx` and `src/lib/idb.js`. To share data between employees, the next step is a hosted database (e.g. Supabase) with real authentication. Then: push to GitHub and deploy to Vercel. `vercel.json` already has the SPA rewrite.
