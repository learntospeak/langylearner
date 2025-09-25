param(
  [string]$Destination = 'backups',
  [int]$KeepCount = 10,
  [int]$KeepDays = 0,
  [switch]$NoPrune
)

$ErrorActionPreference = 'Stop'

# Resolve repo root (this script lives in scripts/)
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo

# Ensure destination exists
$destDir = Join-Path $repo $Destination
if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }

# Timestamp + optional git ref
$tsLocal = Get-Date -Format 'yyyyMMdd-HHmmss'
$tsIso   = (Get-Date).ToString('o')
$gitRef = $null
try { $gitRef = (git -C $repo rev-parse --short HEAD).Trim() } catch {}

$baseName = if ($gitRef) { "kana-reader2-backup-$tsLocal-$gitRef" } else { "kana-reader2-backup-$tsLocal" }
$zipPath = Join-Path $destDir "$baseName.zip"

# Create a temp staging folder, copy everything except backups + dot-git
$stage = Join-Path $destDir "stage-$tsLocal"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Get-ChildItem -Force -LiteralPath $repo |
  Where-Object { $_.Name -ne (Split-Path $Destination -Leaf) -and $_.Name -ne '.git' } |
  ForEach-Object {
    Copy-Item -Recurse -Force -LiteralPath $_.FullName -Destination (Join-Path $stage $_.Name)
  }

# Zip it
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($stage, $zipPath)
Remove-Item $stage -Recurse -Force

# Record metadata
$fi = Get-Item $zipPath
$entry = [ordered]@{
  timestamp_iso = $tsIso
  filename      = Split-Path $zipPath -Leaf
  size_bytes    = $fi.Length
  git_commit    = $gitRef
}
$indexPath = Join-Path $destDir 'index.json'
$list = @()
if (Test-Path $indexPath) {
  try { $list = Get-Content -Raw -Encoding UTF8 $indexPath | ConvertFrom-Json } catch { $list = @() }
}
$list = @($entry) + @($list)
$list | ConvertTo-Json -Depth 5 | Set-Content -Path $indexPath -Encoding UTF8

Write-Host ("Created: {0} ({1:N2} MB)" -f $zipPath, ($fi.Length/1MB))

# Prune policy (if enabled)
if (-not $NoPrune) {
  $files = Get-ChildItem -Path $destDir -Filter 'kana-reader2-backup-*.zip' | Sort-Object LastWriteTime -Descending
  $toDelete = @()
  if ($KeepCount -gt 0 -and $files.Count -gt $KeepCount) { $toDelete += $files[$KeepCount..($files.Count-1)] }
  if ($KeepDays -gt 0) {
    $cutoff = (Get-Date).AddDays(-$KeepDays)
    $toDelete += $files | Where-Object { $_.LastWriteTime -lt $cutoff }
  }
  $toDelete = $toDelete | Sort-Object -Unique
  foreach ($f in $toDelete) {
    try { Remove-Item $f.FullName -Force; Write-Host "Pruned: $($f.Name)" } catch {}
  }
}

Write-Host "Done. Index: $indexPath"

