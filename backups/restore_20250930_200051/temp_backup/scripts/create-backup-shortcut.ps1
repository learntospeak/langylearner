$ErrorActionPreference = 'Stop'

# Resolve repo root and backup runner
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runner = Join-Path $repo 'scripts/run-backup.bat'
if (!(Test-Path $runner)) { throw "Backup runner not found: $runner" }

# Desktop path (respects OneDrive Desktop if enabled)
$desktop = [Environment]::GetFolderPath('Desktop')
if (-not (Test-Path $desktop)) { throw "Desktop folder not found at: $desktop" }

$name = 'KanaReader2 Backup Now.lnk'
$lnk  = Join-Path $desktop $name

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath = $runner
$sc.WorkingDirectory = $repo
$sc.IconLocation = "$env:SystemRoot\\System32\\shell32.dll,167"  # generic backup-like icon
$sc.Description = 'Create a timestamped backup of KanaReader2 into the backups folder.'
$sc.Save()

Write-Host "Created shortcut: $lnk"

