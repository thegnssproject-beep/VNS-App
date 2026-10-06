# VNS App — Vision Navigation Software

Mission-console desktop app for rover vision/navigation pipelines. A React
frontend (multi-tab mission console) runs inside an Electron shell that
reads/writes rover data files on disk, backed by an **embedded Express +
SQLite backend that ships inside the app itself** (no separate server or
MySQL to install — see [Single-file deployment](#single-file-deployment-the-deliverable)).

## Table of contents

- [Download (ready-to-run exe)](#download-ready-to-run-exe)
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
- [Single-file deployment (the deliverable)](#single-file-deployment-the-deliverable)
- [Packaging & delivery](#packaging--delivery)

## Download (ready-to-run exe)

**→ [GitHub Releases: v0.1.0](https://github.com/thegnssproject-beep/VNS-App/releases/tag/v0.1.0)**

Download `vns-app.0.0.0.exe` (~96 MB) and double-click it on any Windows
10/11 PC — no installer, no admin rights, no Node/Python/MySQL, no internet.

- First launch takes ~30 s (self-extraction), then the login window opens.
- **Login:** `admin@vns.local` / `VNSProject` (accounts are per-machine —
  each install creates its own database at `%APPDATA%\vns-app\vns.db`).
- Pick a workspace folder inside the app (top bar) to load/produce data.

The source in this repository is the same code the exe is built from — see
[Single-file deployment](#single-file-deployment-the-deliverable) for what's
inside and [Packaging & delivery](#packaging--delivery) for building it
yourself.

## Stack

- **Electron** (`electron/main.cjs`) — filesystem engine, IPC bridge,
  PDF report generation, session management; also **starts the embedded
  backend** on `127.0.0.1:4000` when the app launches.
- **React + Vite** (`src/`) — the mission-console UI.
- **Express + better-sqlite3** (`electron/server/`) — auth, admin, and
  role-request API running **inside the Electron process**, backed by an
  unencrypted SQLite file at `%APPDATA%\vns-app\vns.db` (schema + admin
  seeded on first launch).
- **bcryptjs + cookie sessions** — password hashing and session auth.
- **Python pipeline engines** (`scripts/pipeline/*.py`, compiled to
  `scripts/bin/*.exe`) — the vision/navigation stage logic driven by the
  per-window ▶ run buttons.
- `server/` (the original external Express + MySQL backend) is kept in the
  repo for reference but is **no longer started or used**.

## Project layout

```
electron/          Electron main/preload (IPC to disk, reports, PDFs)
electron/server/   Embedded backend: Express app, SQLite db bootstrap, auth/admin/role routes
src/               React app (VNSApp.jsx, hooks, auth screens)
server/            LEGACY external Express + MySQL backend (unused since §27)
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
| MySQL | 8.0.46 (portable) | **NOT required anymore** — only for the legacy `server/` backend (see below) |
| Git | 2.55 (optional) | pulling the source |

Key dependency versions resolved by `npm install`:

- Electron `^31.0.0`, electron-builder `^24.13.3`, Vite `^8.1.1`,
  React/ReactDOM `^19.2.7`, lucide-react `^1.24.0`, sharp `^0.33.5`
  (native — prebuilt binaries, no compiler needed)
- Embedded backend (`electron/server/`): Express `^4.19.2`,
  better-sqlite3 `^12.2.0` (native — prebuilt binary installed), bcryptjs
  `^2.4.3`, cookie-parser `^1.4.6`, cors `^2.8.5`

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

### 3. Install dependencies

```powershell
npm install          # frontend + Electron + embedded backend deps
```

> **No MySQL setup is needed.** The database is created automatically the
> first time the app launches (`%APPDATA%\vns-app\vns.db`, plain SQLite,
> admin seeded).
>
> **Legacy — external MySQL backend (`server/`):** the previous architecture
> (portable MySQL 8.0.46 at `C:\YousufVNS\mysql\mysql-8.0.46-winx64`, a
> `server/.env` with the DB credentials, `server/schema.sql` loaded once, and
> `npm install` inside `server/`) is still documented in git history and the
> `server/` folder, but nothing in the app starts or uses it anymore. Only
> pursue it if you deliberately want a shared multi-machine backend — and
> note port 4000 can't be held by both it and the embedded server at once.

## Quick start

Everything in one command (Vite + Electron; the backend starts with the app):

```powershell
.\start-dev.ps1        # Vite + Electron (embedded backend on :4000)
.\stop-dev.ps1         # stop the app
```

Each piece is only started if it isn't already running, so it's safe to
re-run. On the first launch the embedded backend creates
`%APPDATA%\vns-app\vns.db`, loads the schema and seeds the admin account.

Open the app window (or `http://localhost:5173` in a browser) and log in with
`admin@vns.local` / `VNSProject`.

### Starting each piece manually

```powershell
npm run electron:dev   # Vite on :5173 + Electron window (embedded backend)
# or just: npm run dev # browser-only (no Electron IPC bridge)
```

> If port 4000 is busy at launch, a leftover process is holding it (often an
> old external backend from `server/`, or another copy of the app). The
> startup script warns about it; free the port before launching.

## Accounts & roles

> **Default admin (bootstrap):** seeded automatically into the database on
> first launch.
>
> - **Email:** `admin@vns.local`
> - **Password:** `VNSProject`

Accounts live in the SQLite database `%APPDATA%\vns-app\vns.db` (plain file —
open it with any SQLite tool, e.g. `sqlite3`, DB Browser for SQLite, or
`python -c "import sqlite3; ..."`). **Accounts are per-machine**: each
installed copy has its own user list.

New sign-ups start as **viewer** and stay `pending` until an admin approves
them (Admin Panel → Pending New Accounts). Admins can:
- approve/reject users and set their role via the **Admin Panel**,
- or approve editor role requests from the **Role Request** flow.

To promote someone directly in the database:

```sql
UPDATE users SET role = 'admin', status = 'active' WHERE email = 'someone@example.com';
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

## Single-file deployment (the deliverable)

The whole application — **frontend + backend + database engine + all pipeline
executables** — ships as ONE portable file:

```
release\vns-app 0.0.0.exe     (~96 MB, 100,499,340 bytes)
```

**How to deploy:** copy that single `.exe` to any Windows 10/11 machine and
double-click it. No installer, no admin rights, no Node, no Python, no MySQL,
no internet. On first launch it extracts to `%TEMP%`, creates
`%APPDATA%\vns-app\vns.db` (schema + seeded admin), starts the backend on
`127.0.0.1:4000` and opens the login window. First launch takes ~30 s
(self-extraction); later launches are fast.

What's inside:

| Layer | Location in the exe | Notes |
|-------|---------------------|-------|
| React UI | `resources\app.asar` → `dist/` | built by Vite |
| Express backend | `resources\app.asar` → `electron/server/` | runs in the Electron main process |
| SQLite engine | `resources\app.asar.unpacked\node_modules\better-sqlite3` | native module |
| Pipeline stage exes | `resources\app.asar.unpacked\scripts\bin\` | all 10 stages |
| Database file | `%APPDATA%\vns-app\vns.db` (outside the exe) | plain, unencrypted; persists across runs |

Workspace data (images, pipeline outputs, reports) is still read/written from
the workspace folder the user selects inside the app — the exe holds the
program and the account database, not rover data.

**QA performed on the built exe:** launches, backend answers `/api/health`,
admin login + session restore OK, DB seeded with the full schema, signup →
admin-approval flow exercised through the packaged UI, all 10 stage exes
present, and no "Forgot password?" link in the UI.

## Packaging & delivery

```bash
npm run electron:build   # vite build && electron-builder -> release/
```

The configured Windows target is **portable**, so the output is the single
`release\vns-app 0.0.0.exe` (plus the intermediate `release\win-unpacked\`
folder used during the build). Build config lives in `package.json`
(`build.files`, `build.win.target`, icons, `asarUnpack`, etc.). The placeholder
stage exes ship bundled in `scripts/bin/**` and are un-packed to
`resources\app.asar.unpacked\scripts\bin\`, so the delivered exe runs every
stage out of the box; production binaries override via
`<workspace root>\bin\` (see
[Replacing the pipeline executables](#replacing-the-pipeline-executables-step-by-step)).

> **Note:** the exe now ships the **entire stack** — Electron shell (UI),
> the embedded Express backend and the SQLite database bootstrap, plus the
> pipeline exes. Target machines do **not** need Node, npm, Python, MySQL, or
> the `server/` folder; login authenticates against the backend inside the
> app itself (`http://localhost:4000`).

### Build notes (read before packaging)

- **Vite base must stay relative.** `vite.config.js` sets `base: "./"`; if it is
  changed back to the default absolute base, the packaged window shows a blank
  white screen (the built `dist/index.html` resolves `/assets/...` against the
  drive root over `file://` instead of the app folder).
- **Run `electron-builder` from an elevated (admin) PowerShell when the
  `winCodeSign` cache is cold.** On this machine the cache is extracted with
  7-zip, which needs `SeCreateSymbolicLinkPrivilege` to create two
  macOS-library symlinks (`darwin/10.12/lib/lib{crypto,ssl}.dylib`); without
  elevation that extraction step fails. If
  `%LOCALAPPDATA%\electron-builder\Cache` already contains `winCodeSign` +
  `nsis` (as it does after the first successful build), a normal shell works.
- **npm blocks install scripts unless approved.** npm 12 only runs
  `better-sqlite3`, `electron` and `sharp`'s install scripts because they are
  allow-listed under `allowScripts` in `package.json` (approved via
  `npm install-scripts approve <pkg>`). If you add a new native dependency,
  approve it the same way or its binary won't build. After a fresh
  `npm install`, `npx @electron/rebuild -f -w better-sqlite3` rebuilds the
  native module against Electron for dev mode (electron-builder redoes this
  itself at package time).
- **Close the app before rebuilding.** If you leave the portable exe (or
  `release\win-unpacked\vns-app.exe`) running while you rebuild,
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