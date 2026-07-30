@echo off
setlocal
title Northern - Head Box Editor
pushd "%~dp0"

where npm >nul 2>&1
if errorlevel 1 goto :missing_node

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 900; Start-Process 'http://localhost:5183'"
call npm run edit:head-boxes
set "exit_code=%errorlevel%"
if not "%exit_code%"=="0" (
  echo.
  echo Head box editor exited with code %exit_code%.
  pause
)
popd
exit /b %exit_code%

:missing_node
echo Node.js and npm were not found in PATH.
echo Install Node.js, then run this launcher again.
pause
popd
exit /b 1
