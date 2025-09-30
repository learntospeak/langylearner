@echo off
setlocal
set SCRIPT=%~dp0backup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -KeepCount 12 -KeepDays 14
echo.
echo Backup finished. Press any key to close.
pause >nul
endlocal

