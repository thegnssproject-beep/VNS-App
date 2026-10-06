# stop-dev.ps1
# Stops the VNS app started by start-dev.ps1 (Vite + Electron).
#
# There is no external MySQL or backend to stop anymore - closing the app
# shuts down the embedded server with it (the SQLite db file stays on disk,
# so users/data persist).
#
# Usage:
#   .\stop-dev.ps1            # stop the app
#
# NOTE: keep this file ASCII-only (see start-dev.ps1 header note).

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

Write-Host "Done."