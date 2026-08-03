@echo off
setlocal
title Northern - Balance Studio
pushd "%~dp0"

where npm >nul 2>&1
if errorlevel 1 goto :missing_node

if not exist "node_modules\.bin\vite.cmd" goto :missing_dependencies

call npm run edit:balance -- --host 127.0.0.1 --open
set "exit_code=%errorlevel%"
if not "%exit_code%"=="0" (
  echo.
  echo Balance Studio exited with code %exit_code%.
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

:missing_dependencies
echo Project dependencies are not installed.
echo Run "npm install" in this folder, then run this launcher again.
pause
popd
exit /b 1
