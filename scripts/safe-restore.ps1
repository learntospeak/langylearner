param(
  [string]$SourceRoot = 'D:\kana-reader safe backup in case of emergencies'
)

$ErrorActionPreference = 'Stop'

function Say($m){ Write-Host ("[safe-restore] {0}" -f $m) }
function Warn($m){ Write-Warning ("[safe-restore] {0}" -f $m) }

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo

if (-not (Test-Path $SourceRoot)) {
  Write-Error "Source '$SourceRoot' not found. Attach the drive and try again."; exit 2
}

# Find backups
$zips = Get-ChildItem -Path $SourceRoot -Filter 'kana-reader2-safe-*.zip' | Sort-Object LastWriteTime -Descending
if (-not $zips -or $zips.Count -eq 0) { Write-Error "No safe backup zips found in '$SourceRoot'"; exit 3 }
$latest = $zips | Select-Object -First 1

Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
$msg = "Restore from: `n`n$($latest.FullName)`n`nThis will overwrite files in:`n$repo`n`nA pre-restore backup will be created on D:. Continue?"
$resp = [System.Windows.Forms.MessageBox]::Show($msg, 'KanaReader Restore', 'YesNo', 'Warning')
if ($resp -ne 'Yes') { Say 'Cancelled by user.'; exit 0 }

try {
  # Pre-restore backup
  $preName = 'kana-reader2-pre-restore-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip'
  $prePath = Join-Path $SourceRoot $preName
  Say ("Creating pre-restore: {0}" -f $prePath)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $stage = Join-Path $env:TEMP ("kr2-pre-restore-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  New-Item -ItemType Directory -Path $stage | Out-Null

  $exclude = @('.git','node_modules','backups','tmp_restore','temp_backup','.vscode')
  Get-ChildItem -Force -LiteralPath $repo |
    Where-Object { $exclude -notcontains $_.Name } |
    ForEach-Object {
      $dst = Join-Path $stage $_.Name
      if ($_.PSIsContainer) { Copy-Item -Recurse -Force -LiteralPath $_.FullName -Destination $dst }
      else { Copy-Item -Force -LiteralPath $_.FullName -Destination $dst }
    }
  [IO.Compression.ZipFile]::CreateFromDirectory($stage, $prePath)
  Remove-Item $stage -Recurse -Force

  # Extract selected backup to temp
  $tmp = Join-Path $env:TEMP ("kr2-restore-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  New-Item -ItemType Directory -Path $tmp | Out-Null
  [IO.Compression.ZipFile]::ExtractToDirectory($latest.FullName, $tmp)

  # Copy restored contents back into repo (merge/overwrite)
  Get-ChildItem -Force -LiteralPath $tmp |
    ForEach-Object {
      $dst = Join-Path $repo $_.Name
      if ($_.PSIsContainer) { Copy-Item -Recurse -Force -LiteralPath $_.FullName -Destination $dst }
      else { Copy-Item -Force -LiteralPath $_.FullName -Destination $dst }
    }
  Remove-Item $tmp -Recurse -Force
  Say 'Restore completed.'
  [System.Windows.Forms.MessageBox]::Show('Restore completed successfully.', 'KanaReader Restore', 'OK', 'Information') | Out-Null
} catch {
  [System.Windows.Forms.MessageBox]::Show('Restore failed: ' + $_.Exception.Message, 'KanaReader Restore', 'OK', 'Error') | Out-Null
  throw
}

