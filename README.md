# VNS App — Vision Navigation Software

Mission-console desktop app for rover vision/navigation pipelines. A React
frontend (multi-tab mission console) runs inside an Electron shell that
reads/writes rover data files on disk, backed by a local Express + MySQL
server for authentication and user roles.

## Table of contents

- [Stack](#stack)
- [Project layout](#project-layout)
- [Prerequisites (with versions)](#prerequisites-with-versions)
- [Environment setup (one-time)](#environment-setup-one-time)
- [Quick start](#quick-start)
- [Accounts & roles](#accounts--roles)
- [Workspace folders](#workspace-folders)
- [Scripts & pipeline executables](#scripts--pipeline-executables)
- [Replacing the pipeline executables (step-by-step)](#replacing-the-pipeline-executables-step-by-step)
- [Feeds & reading data](#feeds--reading-data)
- [Packaging & delivery](#packaging--delivery)

## Stack

- **Electron** (`electron/main.cjs`) — filesystem engine, IPC bridge,
  PDF report generation, session management.
- **React + Vite** (`src/`) — the mission-console UI.
- **Express + MySQL** (`server/`) — auth, admin, and role-request API.
- **bcryptjs + cookie sessions** — password hashing and session auth.
- **Python pipeline engines** (`scripts/pipeline/*.py`, compiled to
  `scripts/bin/*.exe`) — the vision/navigation stage logic driven by the
  per-tab run buttons.

## Project layout

```
electron/          Electron main/preload (IPC to disk, reports, PDFs)
src/               React app (VNSApp.jsx, hooks, auth screens)
server/            Express backend (index.js, routes/, schema.sql, .env)
scripts/pipeline/  Python stage sources (pure stdlib, one per stage)
scripts/bin/       Compiled stage executables (*.exe) bundled with the app
build/             App icons for electron-builder
public/            Vite static assets
```

## Prerequisites (with versions)

Tested on Windows 11 64-bit (Windows 10 64-bit also fine). Exact versions used
during development are listed; `^` ranges in `package.json` pin the minimums.

| Tool | Version | Required for |
|------|---------|--------------|
| Windows | 10/11 64-bit | running the app (spawns `.exe`) |
| Node.js | **v24.18.0** (Node ≥ 20.19 needed by Vite 8; 24.x LTS recommended) | frontend + Electron build, backend |
| npm | **12.0.2** (ships with Node 24) | installing JS dependencies |
| Python | **3.14.7** | only to rebuild the placeholder stage exes or the `.py` fallback — **not** needed to *run* the app (the shipped app uses standalone exes) |
| PyInstaller | **6.22.2** (`python -m pip install pyinstaller`) | compiling `scripts/pipeline/*.py` → `scripts/bin/*.exe` |
| MySQL | **8.0.46** (portable, `mysql-8.0.46-winx64`) | backend database (`vns_app`) |
| Git | 2.55 (optional) | pulling the source |

Key dependency versions resolved by `npm install`:

- Electron `^31.0.0`, electron-builder `^24.13.3`, Vite `^8.1.1`,
  React/ReactDOM `^19.2.7`, lucide-react `^1.24.0`, sharp `^0.33.5`
  (native — prebuilt binaries, no compiler needed)
- Backend (`server/`): Express `^4.19.2`, mysql2 `^3.11.0`, bcryptjs
  `^2.4.3`, dotenv `^16.4.5`, cookie-parser `^1.4.6`, cors `^2.8.5`

## Environment setup (one-time)

### 1. Install Node.js + npm

Install Node 24 LTS from <https://nodejs.org> (npm is bundled). Verify:

```powershell
node --version   # v24.18.0 (or ≥ v20.19)
npm --version    # 12.0.2 (or ≥ 10)
```

### 2. Install Python + PyInstaller (optional — only to rebuild the exes)

```powershell
# check "Add python.exe to PATH" at install time
python --version                              # 3.14.7
python -m pip install --upgrade pyinstaller   # 6.22.2
```

Python/PyInstaller are not required to *run* the app — they are only used to
recompile the placeholder stage exes from the `.py` sources (see
[Replacing the pipeline executables](#replacing-the-pipeline-executables-step-by-step)).

### 3. Portable MySQL

`start-dev.ps1` expects the portable server at `C:\YousufVNS\mysql\mysql-8.0.46-winx64`
(the `$mysqlDir` variable at the top of the script — change it there if your
path differs). No Windows service or global MySQL install is required.

Download the **mysql-8.0.46-winx64.zip** archive from dev.mysql.com, extract it,
and move the folder to that path.

### 4. Backend environment file

`server/` needs a populated `server/.env`. There is no committed example — copy
the working `server/.env` from this project, or create it from the template:

```ini
# server/.env
PORT=4000                          # Express API port
CORS_ORIGIN=http://localhost:5173  # Vite dev origin allowed by CORS
DB_HOST=127.0.0.1                  # MySQL host
DB_PORT=3306                       # MySQL port
DB_USER=root
DB_PASSWORD=sahiba2006             # must match the root password you set in step 5
DB_NAME=vns_app
NODE_ENV=development
```

### 5. Bootstrap the database (once)

```powershell
$mysqlBin = "C:\YousufVNS\mysql\mysql-8.0.46-winx64\bin"

# first time only — initialize an empty data directory
& "$mysqlBin\mysqld.exe" --defaults-file="C:\YousufVNS\mysql\mysql-8.0.46-winx64\my.ini" --initialize-insecure

# start the server (every time)
& "$mysqlBin\mysqld.exe" --defaults-file="C:\YousufVNS\mysql\mysql-8.0.46-winx64\my.ini"

# set the root password + create the database (password must match server/.env)
& "$mysqlBin\mysql.exe" -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'sahiba2006'; CREATE DATABASE vns_app CHARACTER SET utf8mb4;"

# load the schema
Get-Content server\schema.sql -Raw | & "$mysqlBin\mysql.exe" -u root -psahiba2006 vns_app
```

### 6. Install dependencies

```powershell
npm install          # root (frontend + Electron)
Push-Location server
npm install          # backend dependencies
Pop-Location
```

## Quick start

Everything in one command (MySQL → backend → Electron app):

```powershell
.\start-dev.ps1        # MySQL -> backend -> Electron app
.\start-dev.ps1 -NoApp # MySQL + backend only
```

Each component is only started if it isn't already running, so it's safe to
re-run. Shut everything down with:

```powershell
.\stop-dev.ps1            # app + backend + MySQL
.\stop-dev.ps1 -KeepMysql # app + backend only (leave MySQL up)
```

Open the app window (or `http://localhost:5173` in a browser) and log in with
`admin@vns.local` / `VNSProject`.

### Starting each piece manually

```powershell
# MySQL (see step 5 of Environment setup) — then:
Push-Location server
node index.js          # Express API on http://localhost:4000  (or: npm run dev)
Pop-Location

npm run electron:dev   # Vite on :5173 + Electron window
# or just: npm run dev # browser-only (no Electron IPC bridge)
```

## Accounts & roles

> **Default admin (bootstrap):**
>
> - **Email:** `admin@vns.local`
> - **Password:** `VNSProject`

New sign-ups start as **viewer**. Admins can:
- promote users via the **Admin Panel** (admin menu),
- or approve editor role requests from the **Role Request** flow.

To promote someone directly in SQL:

```sql
UPDATE users SET role = 'admin' WHERE email = 'someone@example.com';
```

To create a fresh admin from scratch (bcrypt-hash the password first, e.g.
with `bcryptjs`):

```sql
INSERT INTO users (full_name, email, password_hash, role)
VALUES ('Admin', 'admin@vns.local', '<bcrypt-hash>', 'admin');
```

## Workspace folders

Select a workspace root in the app (top bar). Pipeline folders are
`02_Raw_Image` … `16_Output`. Clicking **Run Algorithms** copies a Left/Right
pair into `03_Input_Image/<session>/` and creates the pipeline subfolders;
every tab reads only from the current session.

## Scripts & pipeline executables

`scripts/` holds the Python pipeline engines driven by the per-tab run buttons:

- `scripts/pipeline/*.py` — the stage sources (pure stdlib: preprocess,
  obstacle detection, safe path, distance map, occupancy grid, navigation,
  scene analysis, rover health, telemetry, report).
- `scripts/bin/*.exe` — each stage compiled to a standalone executable with
  PyInstaller:

  ```powershell
  python -m PyInstaller --onefile --console --clean `
    --distpath scripts/bin --paths scripts/pipeline `
    scripts/pipeline/<stage>.py
  ```

  The bundled exes embed Python, so **the delivered app does not need Python
  installed on the target machine.**

The list of stages lives in `electron/scriptRunner.cjs` → `SCRIPT_CONFIG`.
`ScriptRunner.findScript()` resolves each stage in this order:

1. `<workspace root>\bin\<stage>.exe` ← drop PRODUCTION real binaries here
2. bundled `<app>\resources\app.asar.unpacked\scripts\bin\<stage>.exe`
3. dev fallback `scripts\pipeline\<stage>.py`

`.exe` files are spawned directly (no interpreter needed); the `.py` fallback
spawns with `python`.

## Replacing the pipeline executables (step-by-step)

The `scripts/bin/*.exe` files currently shipped are **placeholders** compiled
from the Python sources so the app runs end-to-end. When you have the real,
production stage binaries, swapping them in is a **file copy only** — no code
change, no rebuild, no reinstall. The app re-resolves the executable on every
click.

### Step 1 — Know the stages

Each tab maps to one stage file, and **the file name must match exactly**
(the app looks up the name from `electron/scriptRunner.cjs` → `SCRIPT_CONFIG`):

| Tab / button | Required file name | Stage args | Writes to |
|--------------|--------------------|------------|-----------|
| Input (`input.exe`) | `preprocess.exe` | `[inputImage] [outputDir]` | `04_Preprocessed` |
| Obs. Det. (`obsdet.exe`) | `obstacle_detection.exe` | `[inputImage] [outputDir]` | `05_Obstacle.Detection` |
| Dist. Map (`distmap.exe`) | `distance_map.exe` | `[inputImage] [outputDir]` | `06_Distance_Map` |
| Data (`data.exe`) | `occupancy_grid.exe` | `[inputImage] [outputDir]` | `07_Occupancy_Grid` |
| Safe Path (`safepath.exe`) | `safe_path.exe` | `[inputImage] [outputDir]` | `08_Pred_Safe_Path` |
| Navigation (`navigation.exe`) | `navigation.exe` | `[inputImage] [outputDir]` | `09_Navigation` |
| Rover Health | `rover_health.exe` | `[inputImage] [outputDir]` | `13_Rover_Health_Status` |
| Scene Analysis (`sceneanalysis.exe`) | `scene_analysis.exe` | `[inputImage] [outputDir]` | `14_Scene_Analysis_Report` |
| Telemetry / Telecommand (`telecommand.exe` / `telemetry.exe`) | `telemetry.exe` | `[channel] [outputDir]` (`channel` = `telecommand` or `telemetry`) | `11_Telecommand_Data` / `12_Telemetry_Data` |
| Generate Report | `report.exe` | `[manifest.json] [output.pdf]` | `15_Report` |

> The button labels (e.g. `navigation.exe`) are cosmetic UI text; the actual
> file names the app runs are the **stage** names above (`navigation.exe` in
> both cases, but e.g. `input.exe` is served by `preprocess.exe`).

### Step 2 — Name and place your real binaries

Create the swap folder **inside the workspace** the app uses (the folder you
select via **Select Folder** in the top bar; it already contains
`02_Raw_Image` … `16_Output`):

```powershell
$ws = "C:\YousufVNS\Vision_Navigation_Software_02\Vision_Navigation_Software_02"
New-Item -ItemType Directory -Force -Path "$ws\bin"
```

Copy each production exe there, renamed to the stage name:

```powershell
Copy-Item "C:\build\Navi\prod_nav.exe" "$ws\bin\navigation.exe"
Copy-Item "C:\build\Det\prod_detect.exe" "$ws\bin\obstacle_detection.exe"
# ... and so on, one per row in the table above, all with the exact stage names.
```

Copying all ten at once:

```powershell
$src = "C:\build\stage-exes"          # folder holding your real binaries,
                                      # already named exactly like the table
$ws  = "C:\YousufVNS\Vision_Navigation_Software_02\Vision_Navigation_Software_02"
Copy-Item "$src\*.exe" "$ws\bin\"
```

### Step 3 — Follow the executable contract

Your real exes must obey the **EXECUTABLE CONTRACT** (full text documented in
the `electron/scriptRunner.cjs` header):

- **Args** — passed positionally as in the table above. A missing `inputImage`
  is allowed (render placeholder output).
- **Working directory** = the workspace root. Do **not** write to the cwd —
  write to the `outputDir` (or `output.pdf`) argv.
- **Exit code** — `0` = success (stdout may show a human line like
  `Wrote X.png`); any non-zero exit = failure and its `stderr` is shown in the
  app's error toast.
- **Timeout** — must finish within 120 s.

### Step 4 — Verify the swap

1. In the app, open any tab and click its run button.
2. Watch the **success toast** — it shows the resolved file path, e.g.
   `Script completed (C:\...\Vision_Navigation_Software_02\bin\navigation.exe).`
   That path ending in `<workspace>\bin\` confirms your real exe ran.
3. Check the stage output folder (table above) for the expected files.
4. If the toast instead shows a `scripts\bin\...` or `scripts\pipeline\...`
   path, your file isn't detected — double-check the name in `$ws\bin` matches
   the **Required file name** column byte-for-byte.

### Behaviour if a file is missing

Not having every stage in `<workspace>\bin` is fine — the app falls back to the
bundled placeholder exe, then to the `.py` in dev. Drop a file in later and the
next click just starts using it. (If no workspace folder is selected at all,
the buttons return *"No Workspace Folder selected"*.)

## Feeds & reading data

- Status dot on the right of the top bar reflects a file watcher on
  `02_Raw_Image` (new Left/Right images change its state).
- **Parameters** tab shows live telemetry, waypoint, and input-image logs
  from `12_Telemetry_Data`, `09_Navigation`, and `03_Input_Image`.
- **Generate Report** on each tab builds a per-tab PDF;
  **Full Report** (in Reports) assembles the 9-section Vision Navigation
  Analysis Report into `15_Report/<session>/`.
- **Share** on a tab writes each checked panel's image + `properties.json`
  into `16_Output/<session>/<Window Label>/`.

## Packaging & delivery

```bash
npm run electron:build   # vite build && electron-builder -> release/
```

Windows installer output lands in `release/`. Build config lives in
`package.json` (`build.files`, icons, `asarUnpack`, etc.). The placeholder exes
ship bundled in `scripts/bin/**` and are un-packed to
`<install>\resources\app.asar.unpacked\scripts\bin\`, so the delivered app runs
every stage out of the box; production binaries override via
`<workspace root>\bin\` (see
[Replacing the pipeline executables](#replacing-the-pipeline-executables-step-by-step)).

> **Note:** the installer ships the **Electron shell** (UI + pipeline exes).
> The Express backend (`server/`) and the MySQL `vns_app` database are separate
> and must be running on the machine (e.g. via `start-dev.ps1`) because login
> authenticates against `http://localhost:4000`. Target machines do **not**
> need Node, npm, Python, or a MySQL service installed — just the portable
> MySQL directory and the backend, started with the launch script.

### Build notes (read before packaging)

- **Vite base must stay relative.** `vite.config.js` sets `base: "./"`; if it is
  changed back to the default absolute base, the packaged window shows a blank
  white screen (the built `dist/index.html` resolves `/assets/...` against the
  drive root over `file://` instead of the app folder).
- **Run `electron-builder` from an elevated (admin) PowerShell.** On this
  machine the `winCodeSign` binary cache is extracted with 7-zip, which needs
  the `SeCreateSymbolicLinkPrivilege` to create two macOS-library symlinks
  (`darwin/10.12/lib/lib{crypto,ssl}.dylib`); without elevation the build fails
  on that extraction step.
- **Close the app before rebuilding.** If you launch the portable copy
  `release\win-unpacked\vns-app.exe` and leave it running while you rebuild,
  `electron-builder` fails clearing `release\` with
  `remove ...d3dcompiler_47.dll: Access is denied` (the build may also leave a
  stale, half-cleaned output). Quit the app — or delete `release\` manually —
  before running `npm run electron:build` again.
- **Bundled stage exes resolve from `app.asar.unpacked`.** Inside the packaged
  app, stage executables are found at
  `<install>\resources\app.asar.unpacked\scripts\bin\` — never at
  `<install>\resources\app.asar\scripts\bin\` (Electron's `fs.existsSync`
  reports asar entries as present, but `scripts/bin` is unpacked, so spawning
  the plain asar path fails with `ENOENT`). Resolution order per stage:
  `<workspace root>\bin\<stage>.exe` → bundled `app.asar.unpacked\...` → the
  `.py` dev fallback.