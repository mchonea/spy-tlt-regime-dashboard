@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-market-data.ps1"
echo.
echo Exit code: %ERRORLEVEL%  (0 = ok, 2 = some series failed, 1 = nothing downloaded)
pause
