param([string]$TaskName = 'KanaReader2-DailyBackup')
$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed scheduled task '$TaskName'"
} else {
  Write-Host "No task named '$TaskName' was found."
}

