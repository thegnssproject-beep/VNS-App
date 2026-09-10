# start-dev.ps1
# Starts the whole VNS dev environment in one go:
#   1. Portable MySQL server (C:\YousufVNS\mysql unless changed below)
#   2. Express backend on :4000
#   3. Vite + Electron app
#
# Usage:
#   .\start-dev.ps1                 # everything
#   .\start-dev.ps1 -NoApp          # MySQL + backend only (no Electron window)
#
# Each component is only started if it isn't already running, so the script
# is safe to run repeatedly.
#
# NOTE: keep this file ASCII-only. PowerShell 5.1 reads scripts without a
# UTF-8 BOM as ANSI, and multi-byte characters inside strings (em dashes,
# arrows, etc.) can confuse its parser. Everything here is plain ASCII.

param(
  [switch]$NoApp
)

$ErrorActionPreference = "Stop"

$root     = $PSScriptRoot
$mysqlDir = "C:\YousufVNS\mysql\mysql-8.0.46-winx64"
$mysqlBin = Join-Path $mysqlDir "bin"
$logDir   = Join-Path $env:TEMP "vns-logs"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Test-PortOpen([int]$port) {
  try {
    return (Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue -InformationLevel Quiet)
  } catch {
    return $false
  }
}

Write-Host "=== VNS dev environment ==="

# --- 1. MySQL -----------------------------------------------------------
if (Test-PortOpen 3306) {
  Write-Host "[mysql]    already running on :3306"
} elseif (Test-Path (Join-Path $mysqlBin "mysqld.exe")) {
  Write-Host "[mysql]    starting portable MySQL..."
  Start-Process -FilePath (Join-Path $mysqlBin "mysqld.exe") `
    -ArgumentList "--defaults-file=$mysqlDir\my.ini" -WindowStyle Hidden
  Start-Sleep -Seconds 4
  if (Test-PortOpen 3306) {
    Write-Host "[mysql]    up on :3306"
  } else {
    Write-Host "[mysql]    FAILED to start. Check err log in $mysqlDir\data\*.err"
  }
} else {
  Write-Warning "[mysql]    mysqld.exe not found at $mysqlBin - skipping. Install or relocate portable MySQL."
}

# --- 2. Backend ---------------------------------------------------------
if (Test-PortOpen 4000) {
  Write-Host "[backend]  already running on :4000"
} else {
  Write-Host "[backend]  starting Express server..."
  $beLog = Join-Path $logDir "vns-backend.log"
  Start-Process powershell -ArgumentList "-NoProfile", "-Command",
    "Set-Location '$root\server'; node index.js *> '$beLog'" -WindowStyle Hidden
  Start-Sleep -Seconds 3
  if (Test-PortOpen 4000) {
    Write-Host "[backend]  up on :4000 (log: $beLog)"
  } else {
    Write-Host "[backend]  FAILED. See $beLog"
  }
}

# --- 3. App (Vite + Electron) -------------------------------------------
if (-not $NoApp) {
  if ((Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle }) -or (Test-PortOpen 5173)) {
    Write-Host "[app]      already running"
  } else {
    Write-Host "[app]      launching Vite + Electron..."
    $appLog = Join-Path $logDir "vns-electron.log"
    Start-Process powershell -ArgumentList "-NoProfile", "-Command",
      "Set-Location '$root'; npm run electron:dev *> '$appLog'" -WindowStyle Hidden
    Write-Host "[app]      launching... (log: $appLog)"
  }
}

Write-Host ""
Write-Host "Backend API : http://localhost:4000  (/api/health)"
Write-Host "App (login): http://localhost:5173  (Electron window)"
Write-Host ""
Write-Host "Admin login: admin@vns.local / VNSProject"
Write-Host ""
