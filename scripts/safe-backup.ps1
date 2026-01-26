param(
  [string]$DestRoot = 'D:\kana-reader safe backup in case of emergencies'
)

$ErrorActionPreference = 'Stop'

function Show-Info($msg){ Write-Host ("[safe-backup] {0}" -f $msg) }
function Show-Warn($msg){ Write-Warning ("[safe-backup] {0}" -f $msg) }
function Show-Err($msg){ Write-Error ("[safe-backup] {0}" -f $msg) }

# Resolve repo root (this script lives in scripts/)
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo

# Verify destination drive is available
try {
  if (-not (Test-Path $DestRoot)) { New-Item -ItemType Directory -Path $DestRoot -Force | Out-Null }
  # quick write access check
  $probe = Join-Path $DestRoot '.__probe'
  Set-Content -Path $probe -Value (Get-Date).ToString('o') -Encoding UTF8
  Remove-Item $probe -Force
} catch {
  Show-Err "Destination '$DestRoot' is not available or not writable. Please connect the drive and try again."
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
    [System.Windows.Forms.MessageBox]::Show("Backup drive not available. Connect it and try again.", "KanaReader Backup", 'OK','Warning') | Out-Null
  } catch {}
  exit 2
}

# Timestamp + paths
$tsLocal = Get-Date -Format 'yyyyMMdd-HHmmss'
$baseName = "kana-reader2-safe-$tsLocal.zip"
$zipPath = Join-Path $DestRoot $baseName

# Create a temp staging folder, copy repo contents with excludes
$stage = Join-Path $env:TEMP ("kana-reader2-safe-stage-" + $tsLocal)
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

$exclude = @('.git','node_modules','backups','tmp_restore','temp_backup','.vscode')
Get-ChildItem -Force -LiteralPath $repo |
  Where-Object { $exclude -notcontains $_.Name } |
  ForEach-Object {
    $target = Join-Path $stage $_.Name
    if ($_.PSIsContainer) { Copy-Item -Recurse -Force -LiteralPath $_.FullName -Destination $target }
    else { Copy-Item -Force -LiteralPath $_.FullName -Destination $target }
  }

# Zip it
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($stage, $zipPath)

# Cleanup stage
Remove-Item $stage -Recurse -Force

# Report
$fi = Get-Item $zipPath
Show-Info ("Created: {0} ({1:N2} MB)" -f $zipPath, ($fi.Length/1MB))

