# build_pipeline_exe.ps1
# Builds every VNS pipeline stage script into a single Windows .exe with
# PyInstaller, placing the executables in <repo>/scripts/bin/.
#
# Prerequisite (run once): pip install pyinstaller
#
# Each .exe is fully self-contained (stdlib only) so it runs on any Windows
# machine WITHOUT Python installed — matching the reference build's
# "01_Dashboard/VNS_DASH.exe".
#
# Usage:
#   .\build_pipeline_exe.ps1          # build ALL stages
#   .\build_pipeline_exe.ps1 -Stage preprocess   # build one stage

param(
  [string]$Stage = ""
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$pipeline = Join-Path $root "scripts\pipeline"
$bin = Join-Path $root "scripts\bin"
New-Item -ItemType Directory -Path $bin -Force | Out-Null

function Test-Pyinstaller {
  try { pyinstaller --version | Out-Null; return $true } catch { return $false }
}

if (-not (Test-Pyinstaller)) {
  Write-Host "PyInstaller not found. Installing..."
  python -m pip install --quiet pyinstaller
}

# name -> entry script that maps to a tab's "Run" button
$stages = @{
  "preprocess"      = "preprocess.py"
  "obstacle"        = "obstacle_detection.py"
  "distancemap"     = "distance_map.py"
  "occupancygrid"   = "occupancy_grid.py"
  "safepath"        = "safe_path.py"
  "roverhealth"     = "rover_health.py"
  "telemetry"       = "telemetry.py"
}

$toBuild = if ($Stage) { @($Stage) } else { $stages.Keys }

foreach ($name in $toBuild) {
  if (-not $stages.ContainsKey($name)) {
    Write-Warning "Unknown stage '$name'. Valid: $($stages.Keys -join ', ')"
    continue
  }
  $entry = Join-Path $pipeline $stages[$name]
  Write-Host "Building $name -> $entry"
  pyinstaller --onefile --noconfirm --distpath $bin --workpath (Join-Path $env:TEMP "vns-py-$name") `
    --specpath (Join-Path $env:TEMP "vns-py-$name") $entry
  Write-Host "  -> $bin\$name.exe"
}

Write-Host ""
Write-Host "Done. Executables in: $bin"
Write-Host "Point ScriptRunner's SCRIPT_CONFIG at scripts\bin\<stage>.exe to use them."
