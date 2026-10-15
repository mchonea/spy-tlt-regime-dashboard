@echo off
rem Stores the FRED key (if missing) and (re)registers the local scheduled data update.
rem Safe to re-run any time, e.g. after the folder moves.
rem Once GitHub Actions is doing the updates, choose R to remove the local task.
cd /d "%~dp0"
echo.
echo   [Enter] Set up / refresh the local scheduled task
echo   [R]     Remove the local scheduled task (use after GitHub Actions has succeeded twice in a row)
echo.
set /p CHOICE=Choice: 
if /i "%CHOICE%"=="R" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-schedule.ps1" -RemoveTask
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-schedule.ps1"
)
echo.
pause
