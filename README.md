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
- **Arabic / English:** the EN | عربي switch (top bar and login page) changes the whole interface, right-to-left in Arabic. Each person's choice is remembered in their browser. Translations are in `src/i18n/ar.js`, keyed by the English text; default status and certificate names are translated, while names typed in Settings show exactly as written. Excel exports stay in English.

## How the numbers are counted

- **Outcomes** (interested, very interested, not interested, meeting done – candidate, meeting done – not a candidate, registered, blocked): leads *moved into* a status of that kind during the month. Each status's "Counts as" setting is in **Settings**.
- **Calls, messages, follow-ups:** activities logged in the month.
- **Meetings:** meetings dated in the month.

## Data storage

| Where | Mode | Data |
|---|---|---|
| Vercel (production) | **Server** | Neon Postgres (records) + Vercel Blob, private store (lead files) |
| `npm run dev` with `DATABASE_URL` in `.env.local` | Server | same as production |
| `npm run dev` without a database | Local | this browser only (IndexedDB) |

### Vercel setup
1. **Storage → Create Database → Neon (Postgres)**, connect it to this project (adds `DATABASE_URL`).
2. **Storage → Create → Blob**, choose **Private**, connect it to this project (for lead files).
3. **Settings → Environment Variables**: add `SESSION_SECRET` (32+ random characters), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (8+ characters).
4. Redeploy. Tables are created automatically on first use, and the first admin is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

The app shows a setup checklist until the database and session secret are configured.

### How it works
- `api/` holds Vercel Functions: `auth` (sign-in with a signed, HttpOnly cookie; scrypt password hashes), `data` (paged download of changes), `sync` (saves changes in one transaction), `users`, `files` (private Blob, max 4 MB per file), `health`.
- The server enforces permissions: employees only read and change their own leads (and their activity, meetings and files); statuses, settings and users are admin-only.
- The browser saves each change immediately and checks for teammates' changes every 15 seconds.
