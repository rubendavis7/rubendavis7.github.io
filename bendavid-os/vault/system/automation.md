---
type: system-doc
---
# Automation and schedules

Every workflow runs manually first: the Jarvis buttons, the Workflows page, the command bar, or the API.

## Schedules (off by default)
- Plan My Day (07:45, Mon–Fri), Find Missing Statements (09:00, Mon–Fri), and Review Pipeline (16:00, Fri) have schedules prepared, **all turned off**.
- Times are **America/New_York**.
- Scheduled runs may only use saved-data or template engines. They never call an AI service and never send anything.
- A schedule fires at most once a day, and only within 60 minutes after its time.

## What it depends on
Scheduled work runs **inside the BenDavid OS window on your Windows computer**. It only happens if:
1. the computer is on and awake (not asleep or hibernating), and
2. BenDavid OS is running (the black window is open).

If either is false at the scheduled time, that day's run is skipped.

## Status
Unattended operation is **not configured**. Turning a schedule on is a choice you make on the Workflows page. Even then, the Connections page only reports unattended operation as observed after a scheduled run has actually happened.

## Optional: start BenDavid OS when you sign in to Windows
Not set up. If you want it: press Win+R, type `shell:startup`, and put a shortcut to `Start BenDavid OS.bat` in that folder.
