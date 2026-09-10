# stop-dev.ps1
# Stops the VNS dev environment started by start-dev.ps1:
#   - the Vite + Electron app
#   - the Express backend on :4000
#   - the portable MySQL server on :3306   (add -KeepMysql to leave it running)
#
# Usage:
#   .\stop-dev.ps1            # app + backend + mysql
#   .\stop-dev.ps1 -KeepMysql # app + backend only
#
# NOTE: keep this file ASCII-only (see start-dev.ps1 header note).

param(
  [switch]$KeepMysql
)

$mysqlBin = "C:\YousufVNS\mysql\mysql-8.0.46-winx64\bin"

# --- App (Vite + Electron) ------------------------------------------------
$appKilled = $false
foreach ($proc in Get-CimInstance Win32_Process | Where-Object {
  $_.Name -in @("electron.exe", "node.exe") -and
  ($_.CommandLine -like "*electron:dev*" -or $_.CommandLine -like "*vite*")
}) {
  Write-Host "[stop] killing $($proc.Name) (pid $($proc.ProcessId))"
  Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
  $appKilled = $true
}
if (-not $appKilled) {
  Write-Host "[stop] app already stopped"
}

# --- Backend --------------------------------------------------------------
$backendKilled = $false
foreach ($proc in Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "node.exe" -and $_.CommandLine -like "*vns-app\server*"
}) {
  Write-Host "[stop] killing backend node (pid $($proc.ProcessId))"
  Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
  $backendKilled = $true
  Start-Sleep -Seconds 1
}
if (-not $backendKilled) {
  $listener = (netstat -ano | Select-String ":4000\s.*LISTENING")
  if ($listener) {
    $backendPid = ($listener[0].ToString() -split "\s+" | Where-Object { $_ })[-1]
    Write-Host "[stop] killing :4000 listener (pid $backendPid)"
    Stop-Process -Id $backendPid -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "[stop] backend already stopped"
  }
}

# --- MySQL ----------------------------------------------------------------
if (-not $KeepMysql) {
  $mysqladm = Join-Path $mysqlBin "mysqladmin.exe"
  if (Test-Path $mysqladm) {
    & $mysqladm -u root -psahiba2006 --host=127.0.0.1 shutdown 2>$null | Out-Null
    Write-Host "[stop] MySQL shut down"
  } else {
    Write-Host "[stop] mysqladmin.exe not found at $mysqlBin"
  }
} else {
  Write-Host "[stop] keeping MySQL running (-KeepMysql)"
}

Write-Host "Done."
