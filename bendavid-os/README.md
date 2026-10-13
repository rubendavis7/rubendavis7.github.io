# BenDavid OS

Ruben Davis's local command center for revenue-based funding deals at Delta Capital Group. It runs only on your computer at **http://localhost:4321**. Nothing is published, and nothing is sent.

## Start it on Windows

**One-time setup**
1. Install **Node.js LTS** from https://nodejs.org (accept the defaults).
2. Get this folder onto your PC: in GitHub Desktop (or `git clone`), clone `rubendavis7/rubendavis7.github.io` and switch to the `claude/bendavid-os` branch. The app is the `bendavid-os` folder.

**Every day**
1. Open the `bendavid-os` folder in File Explorer.
2. Double-click **`Start BenDavid OS.bat`**.
3. Your browser opens to http://localhost:4321. Keep the black window open while you work.
4. To stop: close that window, or press `Ctrl+C` in it.

Tip: right-click the `.bat` file → *Send to* → *Desktop (create shortcut)*.

Alternative (PowerShell, inside the folder): `npm start`

If you see "port 4321 is already in use", BenDavid OS is already running; just open http://localhost:4321.

## What it does

- **Jarvis view:** greeting, today's priorities, tasks, client search, recent activity, a command bar (local commands, no AI), and buttons for Plan My Day, Missing Statements, Deal Pipeline, and Prepare Follow-Up.
- **Sales Dashboard:** KPIs, pipeline board (Statements → Offer → Accepted → Contract → Bank Verification → Funding Call → Funded), client table, tasks, data/backup tools.
- **Clients:** contact, business, email, phone, stage, requested documents (received/missing), offer details (only numbers marked *confirmed* are used in drafts), last contact, next follow-up, next action, and timestamped notes.
- **Follow-ups:** stage-aware **templates**, clearly labeled, under 80 words, one action, revenue-based funding terminology (never "loan" or "interest"). You copy and send them yourself.
- **Sample records:** five fictional "(Sample)" clients load on first run with a SAMPLE badge. They're excluded from exports, daily reports, and the vault. Remove them anytime with **Remove all samples**.

Command bar examples: `plan my day`, `missing statements`, `pipeline`, `follow up derek`, `find bakery`, `new client`, `task call Maria at 3`, `daily report`, `backup`, `help`. Press `/` anywhere to jump to it.

## Your data

| What | Where |
| --- | --- |
| All clients, tasks, activity (the one authoritative store) | `data\bendavid-os.json` |
| Automatic daily backups (last 14 days) | `data\backups\auto-YYYY-MM-DD.json` |
| Manual backups ("Back up now") | `data\backups\manual-*.json` |
| Obsidian vault | `vault\` |

- Every save is atomic (written to a temp file, then swapped in), so a crash can't leave a half-written file.
- Every record has a version number. If something changed since you opened it, the app refuses the save and offers to load the newer version. Nothing is silently overwritten.
- `data\` is git-ignored: client records are never committed or published.

### Export
Sales Dashboard → *Data, Export & Backup*:
- **Export JSON** for a complete copy of real clients, tasks, and activity.
- **Export CSV (Excel)** for a client list that opens in Excel.

Samples are excluded. (Add `&samples=1` to the export URL if you ever want them.)

### Back up
1. Click **Back up now** (or rely on the automatic daily copy).
2. At least weekly, copy the whole `data` folder to OneDrive, Google Drive, or a USB drive.

### Restore
1. Stop BenDavid OS (close its window).
2. In `data\`, rename `bendavid-os.json` to `bendavid-os.broken.json`.
3. Copy the backup you want from `data\backups\` into `data\` and rename it `bendavid-os.json`.
4. Start BenDavid OS again.

If the data file is ever damaged, the app refuses to start rather than overwrite it, and tells you to restore.

## Obsidian

Open `vault\` with **Obsidian → Open folder as vault**. It holds your profile, writing preferences, workflow, read-only client mirrors, and daily reports. See `vault\README.md`. The app never edits any other vault. If you'd like it to write into your existing vault, say which one first.

## Integrations (not connected yet)

Gmail, AI execution, and Voice show as **Disconnected**. They stay that way until each one is actually built and passes a live self-test.

The boundary is `server/integrations/index.js`:
- Integrations run **on the local server only**. The browser only ever sees connected/disconnected status, never keys.
- Keys go in a `bendavid-os\.env` file (copy `.env.example`), which is git-ignored. Never paste keys into chat or the browser.
- A provider counts as connected only when `implemented` is true **and** its `selfTest()` passed.
- Gmail is scoped to **creating drafts only**. BenDavid OS never sends email or texts.
- Stub routes already exist: `POST /api/integrations/gmail/draft` and `POST /api/integrations/ai/command` answer "not connected" until implemented.

## Security

- Listens on `127.0.0.1` only, so other devices on your network can't reach it.
- Rejects requests from other websites (Host/Origin checks plus a required app header).
- No third-party code or CDNs; works offline.

## Developer notes

- Plain Node.js (18+), **no npm dependencies**.
- `npm test` runs end-to-end tests: create, edit, stale-edit protection, notes, all stage moves, task completion, template rules, vault overwrite protection, export, and persistence across a server restart.
- Environment overrides: `PORT`, `BENDAVID_DATA_DIR`, `BENDAVID_VAULT_DIR`, `BENDAVID_NO_SAMPLES=1`.

```
server/server.js      HTTP server, routes, security checks
server/store.js       JSON data store (authoritative), validation, backups
server/planner.js     Plan My Day, missing statements, follow-up templates, daily report
server/vault.js       Obsidian Markdown writer with overwrite protection
server/samples.js     Fictional sample records
server/integrations/  Integration boundary (all disconnected)
public/               Interface (HTML/CSS/JS, particle galaxy)
vault/                Obsidian-compatible folder
```
