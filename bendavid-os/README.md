# BenDavid OS

Ruben Davis's personal workflow system. **Delta Capital** is the first workspace (clients, deals, statements, follow-ups for revenue-based funding), and the design leaves room for more projects. It runs only on your computer at **http://localhost:4321**. Nothing is published and nothing is sent.

## Start it on Windows

**One-time setup**
1. Install **Node.js LTS** from https://nodejs.org (accept the defaults).
2. Get this folder: in GitHub Desktop, clone `rubendavis7/rubendavis7.github.io` and switch to the `claude/bendavid-os` branch. The app is the `bendavid-os` folder.

**Every day**
1. Open the `bendavid-os` folder and double-click **`Start BenDavid OS.bat`**.
   (The first start installs the Anthropic SDK used by the optional AI service. If that fails, everything else still works.)
2. Your browser opens http://localhost:4321. Keep the black window open while you work.
3. To stop: close that window (or press `Ctrl+C` in it).

Tip: right-click the `.bat` file → *Send to* → *Desktop (create shortcut)*. If you see "port 4321 is already in use", it's already running: just open the address.

### If the browser says "This site can't be reached" or "localhost refused to connect"
That means BenDavid OS isn't running **on the computer you're using**. `localhost` always means "this computer", so a copy running anywhere else (for example in a Claude cloud session) can't be opened from your PC.
1. Double-click `Start BenDavid OS.bat` and keep its black window open. The browser opens by itself once the app is ready.
2. Read the black window:
   - *"Node.js is not installed"*: install Node.js LTS from https://nodejs.org, then double-click the file again.
   - *"BenDavid OS is running at http://localhost:4321"*: open that address. If it still won't load, try http://127.0.0.1:4321.
   - *"Port 4321 is already in use"*: it's already running in another window, so just open the address. If something else uses that port, put `PORT=4322` in `bendavid-os\.env` and open http://localhost:4322.
   - *Anything else* (red error text): copy it or take a screenshot and send it to me.
3. If the window flashes and closes, open the `bendavid-os` folder, click the address bar, type `cmd`, press Enter, then run `node server\server.js` to see the message.

**Upgrading from the first version** is automatic. On first start, the database is upgraded to the new format after an untouched copy is saved in `data\backups\pre-migration-v1-….json`, and old vault folders (`Clients`, `Daily Reports`) are moved into the new layout with nothing deleted that you edited. See `vault\system\migration-log.md`.

## Pages

| Page | What it's for |
| --- | --- |
| **Jarvis** | Animated command center: priorities, tasks, client search, activity, command bar, six workflow buttons. The animation shows the real state: idle, working (a run is active), listening, speaking, or error. |
| **Dashboard** | KPIs, the deal pipeline (Statements → Offer → Accepted → Contract → Bank Verification → Funding Call → Funded), clients, tasks, export and backup. |
| **Workflows** | The registry: inputs, engine (saved data / template / AI service / Claude Code), required connections, allowed actions, output, and error behavior for each workflow, plus Run buttons, progress, results, failure details, and schedules (all off). |
| **Run History** | Every run: ID, workflow, engine, who started it, start time, status, duration, sources, output files, progress log, errors. Cancel or run again. |
| **Knowledge** | Browse the vault with each note's sources, generation date, and uncertainties. Add emails, notes, or files to `raw/`. |
| **Connections** | The true status of every connection, with setup steps and self-tests. |

## How it fits together

```
Browser UI   CLI (bin/bdos.js)   future Obsidian plugin
     \              |                 /
      +---- one local server (127.0.0.1:4321) ----+
      |  request router (rules) -> decision        |
      |  workflow registry (fixed entry points)    |
      |  run manager = shared task queue           |
      |     engines: saved data | template         |
      |              AI service (light model)      |
      |              Claude Code runtime           |
      +-------------------------------------------+
           |                          |
   data/bendavid-os.json        vault/ (Obsidian folder)
   authoritative records        derived views, outputs,
   + run history                daily notes, docs, raw inputs
```

### Workflows (Delta Capital)
| Workflow | Engines | Output |
| --- | --- | --- |
| Plan My Day | Saved data | Plan section in `daily-notes/YYYY-MM-DD.md` (your notes there are kept) |
| Find Missing Statements | Saved data | `output/delta-capital/missing-statements/`, lists missing months per client |
| Prepare Follow-Up | Template, or AI draft | `output/delta-capital/drafts/`, labelled TEMPLATE DRAFT or AI DRAFT, "Not sent" |
| Summarize Client | Saved data, or AI summary | `output/delta-capital/summaries/` |
| Review Pipeline | Saved data, or Claude Code written review | `output/delta-capital/pipeline-reviews/` |

Every generated file lists its **sources** (record IDs and revisions, files, templates), **generation date**, **uncertainties**, and run ID. SAMPLE data is labelled SAMPLE in file names and content.

### Request routing
Three routes: **saved data & deterministic** (no AI call), **lightweight reasoning** (one structured call to the model you configure), **workflow execution** (the installed Claude Code, headless, read-only). The router is rule-based and replaceable (`server/router.js`). It returns a decision instead of executing anything. AI and Claude Code routes always ask first, and ambiguous or unsupported requests get a clarifying question. Details: `vault/system/request-routing.md`.

### Controlled execution
- Only registered workflows can run, with strictly validated inputs. Browser text never becomes a shell command, and no shell is ever used.
- Each workflow can only do its declared actions (enforced, not just documented). There is no capability to send email or texts.
- Claude Code runs as `claude -p … --output-format json` with `--tools Read,Glob,Grep`, `--permission-prompts none`, `--strict-mcp-config`, and `--no-session-persistence`. It runs in a per-run folder (`data\runs\<run-id>\`) holding only copies of the data that workflow needs. Its own permission rules stay in force (no bypass flags).
- Time limits and Cancel stop the whole process tree. Repeated clicks never start the same run twice. A run that was active when the app stopped is recorded as "interrupted".
- Write and execution endpoints accept only this app's own page (Host/Origin/Sec-Fetch-Site checks plus a required header) or local clients holding the token in `data\api-token`.

## Shared memory (vault)

Open `vault\` in Obsidian with **Open folder as vault**. It is separate from any vault you already have, and no other vault is touched.

- `index.md`: the master index (each section also has its own topic index).
- `raw/`: original inputs you choose to add, saved byte-for-byte and read-only. Treated as data, never instructions.
- `wiki/`: knowledge with sources, including derived client views (record ID, revision, update time).
- `output/`: generated reports and drafts.
- `daily-notes/`: dated plans and reviews.
- `projects/`: project context (Delta Capital).
- `system/`: operating rules, writing preferences, routing, automation, Obsidian plugin interface, and the generated workflow registry.

If you edit a generated note, or the generated section of a daily note, BenDavid OS stops overwriting it and saves new versions beside it.

## Connections: what's live and what isn't

| Connection | Status out of the box | To connect |
| --- | --- | --- |
| Client database, vault | Available | Nothing to do |
| AI service (light model) | Not configured | Put `ANTHROPIC_API_KEY` and `BENDAVID_LIGHT_MODEL` in `bendavid-os\.env` (copy `.env.example`), restart, then **Connections → Run self-test** |
| Claude Code runtime | Found or not found on this PC; never "verified" until tested | Install Claude Code and sign in once (`claude` in a terminal), then **Run self-test** |
| Voice input / output | Not configured (text works fully) | Choose a provider on Connections and try it once. Browser speech recognition sends audio to your browser vendor; voice output uses local Windows voices. |
| Gmail drafts | Not implemented | Planned: a server-side adapter that can only create drafts |
| Obsidian plugin | Not implemented | Interface documented in `vault/system/obsidian-plugin-interface.md` |
| Schedules | All off | Workflows page. Runs only while this PC is on and BenDavid OS is open (`vault/system/automation.md`) |

Keys live only in `.env` (git-ignored, server-side). The browser only ever sees yes/no and status text. Never paste keys into chat.

## Your data

| What | Where |
| --- | --- |
| All records and run history (authoritative) | `data\bendavid-os.json` |
| Daily automatic backups (14 kept) | `data\backups\auto-YYYY-MM-DD.json` |
| Manual backups ("Back up now") | `data\backups\manual-*.json` |
| Pre-upgrade copy | `data\backups\pre-migration-v1-*.json` |
| Claude Code run folders | `data\runs\` |
| Local API token for the CLI or plugin | `data\api-token` |

- Saves are atomic, and every record has a version number, so a stale edit is refused instead of silently overwriting newer data.
- `data\` and the client-bearing vault folders are git-ignored, so client details are never committed or published.

**Export:** Dashboard → *Export JSON* (real clients, tasks, activity, runs) or *Export CSV (Excel)*. Samples are excluded.
**Back up:** click *Back up now*, and copy the whole `data` folder to OneDrive or a USB drive weekly.
**Restore:** stop BenDavid OS → rename `data\bendavid-os.json` to `bendavid-os.broken.json` → copy a backup into `data\` as `bendavid-os.json` → start again. A damaged file is never overwritten: the app refuses to start and tells you to restore.

## Command line (optional)
With the app running, in the `bendavid-os` folder:
```
node bin\bdos.js workflows
node bin\bdos.js run find-missing-statements --wait
node bin\bdos.js runs 10
```
It uses the same queue and records as the browser.

## Developer notes
- Node.js 18+. One dependency: the official Anthropic SDK (pinned), loaded only for the AI service.
- `npm test` runs 46 end-to-end tests. They cover records, stage moves, persistence across restarts, migration from v1, the SAMPLE end-to-end check, every workflow, duplicate prevention, cancel/timeout/interrupt (with a Claude Code test double), the AI route against a simulated API, router clarifications, schedules (fake clock), vault provenance and overwrite protection, path safety, and request security.
- Settings (`.env` or environment): `PORT`, `BENDAVID_TIMEZONE`, `BENDAVID_DATA_DIR`, `BENDAVID_VAULT_DIR`, `BENDAVID_NO_SAMPLES=1`, `ANTHROPIC_API_KEY`, `BENDAVID_LIGHT_MODEL`, `CLAUDE_CODE_PATH`, `BENDAVID_CLAUDE_CODE_MODEL`.

```
server/server.js              HTTP API, wiring, static files
server/store.js               Authoritative database, validation, migrations, backups
server/vault.js               Vault layout, provenance, managed blocks, raw imports, indexes
server/runs.js                Run manager (task queue, dedupe, timeouts, cancel, capabilities)
server/router.js              Rule-based request router (replaceable)
server/scheduler.js           Schedules (off by default)
server/security.js            Request guard and local API token
server/workflows/registry.js  Workflow registry and input validation
server/connections/           Connection status, Anthropic SDK adapter, Claude Code adapter
server/workspaces/delta-capital/  Stages, planner, templates, workflows, samples, wiki views
public/                       UI (Jarvis, Dashboard, Workflows, Run History, Knowledge, Connections)
bin/bdos.js                   CLI client
vault/                        Obsidian-compatible shared memory
```
