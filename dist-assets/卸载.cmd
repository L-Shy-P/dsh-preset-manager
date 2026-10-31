@echo off
setlocal EnableDelayedExpansion
title DSH Preset Manager - Uninstall

set "HERE=%~dp0"
set "NODE_EXE="

where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"

if not defined NODE_EXE (
  set "RES="
  for /f "usebackq delims=" %%R in (`powershell -NoProfile -Command "(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'DeepSeek Harness*' } | Select-Object -First 1 -ExpandProperty InstallLocation)"`) do set "RES=%%R"
  if defined RES if exist "!RES!\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=!RES!\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
)

if not defined NODE_EXE (
  echo.
  echo [ERROR] Node.js not found, and DeepSeek Harness install dir not found either.
  echo.
  pause
  exit /b 1
)

echo.
"%NODE_EXE%" "%HERE%install.mjs" --uninstall %*
set "CODE=%ERRORLEVEL%"
echo.
if not "%CODE%"=="0" (
  echo [FAILED] exit code %CODE%
) else (
  echo [OK] Removed. Fully quit and restart DeepSeek Harness.
)
echo.
pause
exit /b %CODE%
