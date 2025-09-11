Backups
=======

This folder stores timestamped zip snapshots of the project.

How to create a backup
----------------------

- Run: `scripts\run-backup.bat`
  - or: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup.ps1 -KeepCount 12 -KeepDays 14`

What it does
------------

- Copies the repo (excluding this `backups` folder and `.git`) to a temp dir and zips it to
  `backups/kana-reader2-backup-YYYYMMDD-HHMMSS[-git].zip`.
- Appends metadata to `backups/index.json` with timestamp, size, and (if available) the git commit.
- Prunes old zips based on the retention settings (by default: keep last 10).

Retention options
-----------------

- `-KeepCount N`  keep the most recent N backups (default 10)
- `-KeepDays D`   also remove backups older than D days (optional)
- `-NoPrune`      disable pruning (keeps everything)

Scheduling (Windows)
--------------------

Option A — quick register script (recommended)

- Open PowerShell as your user (no admin needed) in the project folder:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-backup-task.ps1 -Time 02:15 -KeepCount 12 -KeepDays 14`
- This creates a Task Scheduler job named `KanaReader2-DailyBackup` that runs every day at 02:15.
- To remove it: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/unregister-backup-task.ps1`

Option B — Task Scheduler UI

1. Open Task Scheduler → Create Task
2. Trigger: Daily (choose time)
3. Action: Start a program → Program/script: `powershell.exe`
   - Arguments: `-NoProfile -ExecutionPolicy Bypass -File "<project>\scripts\backup.ps1" -KeepCount 12 -KeepDays 14`
   - Start in: `<project>` (the repo root)
4. Set “Run only when user is logged on” (simplest) or adjust to your needs.

Restore
-------

Unzip the desired archive to a new folder. (Optional: make a backup first.)
