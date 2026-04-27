@echo off
title LocalDraft
cd /d "%~dp0"

REM If the dev server is already on port 3000, just open the browser.
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo LocalDraft is already running. Opening browser...
    start "" http://localhost:3000
    timeout /t 2 >nul
    exit /b 0
)

echo Starting LocalDraft on http://localhost:3000 ...
echo Closing this window will stop the server.
echo.

REM Open the browser a few seconds after npm spins up the dev server.
start "" cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:3000"

call npm run dev
