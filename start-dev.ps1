# start-dev.ps1
# Starts the VNS app in one go.
#
# The app is now SELF-CONTAINED: the Express backend (auth/admin) runs
# inside the Electron main process and stores data in an embedded SQLite
# file (%APPDATA%\vns-app\vns.db). There is no external MySQL server and no
# separate backend process anymore - just run the app.
#
# Usage:
#   .\start-dev.ps1                 # launch Vite + Electron (dev)
#   .\start-dev.ps1 -NoApp          # no-op kept for compatibility
#
# NOTE: keep this file ASCII-only. PowerShell 5.1 reads scripts without a
# UTF-8 BOM as ANSI, and multi-byte characters inside strings (em dashes,
# arrows, etc.) can confuse its parser. Everything here is plain ASCII.

param(
  [switch]$NoApp
)

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$logDir = Join-Path $env:TEMP "vns-logs"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Test-PortOpen([int]$port) {
  try {
    return (Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue -InformationLevel Quiet)
  } catch {
    return $false
  }
}

Write-Host "=== VNS app (self-contained) ==="

# The embedded backend (auth/admin) must not already hold port 4000 -
# otherwise our embedded server inside Electron can't bind. A leftover from
# the old start-dev flow would be the cause.
if (Test-PortOpen 4000) {
  Write-Host "[backend]  port 4000 is busy. A leftover external backend may still be running - stopping it isn't automatic. Close/kill any old 'node index.js' from the server/ folder before launching the app."
}

# --- App (Vite + Electron) -------------------------------------------
if (-not $NoApp) {
  if ((Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle }) -or (Test-PortOpen 5173)) {
    Write-Host "[app]      already running"
  } else {
    Write-Host "[app]      launching Vite + Electron (embedded backend starts with the app)..."
    $appLog = Join-Path $logDir "vns-electron.log"
    Start-Process powershell -ArgumentList "-NoProfile", "-Command",
      "Set-Location '$root'; npm run electron:dev *> '$appLog'" -WindowStyle Hidden
    Write-Host "[app]      launching... (log: $appLog)"
  }
} else {
  Write-Host "[app]      skipped (-NoApp). Note: there is nothing else to start - the embedded backend is part of the app."
}

Write-Host ""
Write-Host "Backend API : http://localhost:4000  (/api/health)  [embedded in the app]"
Write-Host "App (login): http://localhost:5173  (Electron window)"
Write-Host ""
Write-Host "Admin login: admin@vns.local / VNSProject"
Write-Host "(SQLite db: %APPDATA%\vns-app\vns.db - created automatically on first launch)"
Write-Host ""