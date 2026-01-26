param(
  [string]$TaskName = 'KanaReader2-DailyBackup',
  [string]$Time = '02:15',              # 24h format HH:mm
  [int]$KeepCount = 12,
  [int]$KeepDays = 14,
  [switch]$ReplaceIfExists
)

$ErrorActionPreference = 'Stop'

function New-TimeToday([string]$hhmm){
  try { return [DateTime]::Today.Add([TimeSpan]::Parse($hhmm)) } catch { throw "Invalid -Time '$hhmm'. Use HH:mm, e.g. 02:15" }
}

# Resolve repo root and script
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backupScript = Join-Path $repo 'scripts/backup.ps1'
if (!(Test-Path $backupScript)) { throw "backup.ps1 not found at $backupScript" }

# Build the powershell arguments for the action
$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`" -KeepCount $KeepCount -KeepDays $KeepDays"

# Define trigger/action/principal/settings
$trigger   = New-ScheduledTaskTrigger -Daily -At (New-TimeToday $Time)
$action    = New-ScheduledTaskAction  -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $repo
$principal = New-ScheduledTaskPrincipal -UserId $env:UserName -LogonType Interactive
$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

# Replace if exists (optional)
$exists = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($exists) {
  if ($ReplaceIfExists) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
  else { throw "Task '$TaskName' already exists. Re-run with -ReplaceIfExists to overwrite." }
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Daily backup of KanaReader2 repo" | Out-Null
Write-Host "Registered scheduled task '$TaskName' to run daily at $Time"
Write-Host "It runs: powershell $arg"

