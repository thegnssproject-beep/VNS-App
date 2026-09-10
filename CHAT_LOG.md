# VNS App — Session Log / Conversation Continuation

> **Purpose:** Snapshot of the ongoing conversation so it can be resumed later
> without losing context. Lives next to `README.md` in the project root.

**Project root:** `C:\YousufVNS\vns-app\vns-app`
**Last updated (work state):** Sections 16–17 — report generation moved out of pdfkit into a new pure-stdlib Python engine `scripts/pipeline/report.py`, driven by `electron/reportEngine.cjs` (data-URL images → JSON manifest → `scriptRunner.run("report", …)`). `pdfkit` removed. Five report bugs fixed in app: exit-code-1 (UnicodeEncodeError, 16.1), `/Contents`→Page-dict refs (16.2), `/Kids`→content-stream refs + missing `/Encoding /WinAnsiEncoding` (16.3, the blank/empty issue), centred/right text pushed off-page (`bx=width` base; 16.4), and table rows both misaligned (single shared baseline through all cells) and spilling out of boxes + blAnk JPEGs (zlib-compressed DCT streams; 16.5). All verified via pypdf extraction + per-op coordinate audit + PDFium pixel checks (DCT streams now `ff d8`, figure rects show real imagery std 78–90). §17: all 10 stage scripts compiled to standalone `scripts/bin/NAME.exe` via PyInstaller 6.22.2 — every exe verified byte-identical to its `.py` run (images/sidecars/PDF), picked up automatically by `scriptRunner.cjs` (prefers `exe:` over `.py`), no restart needed. 17.1: EXECUTABLE CONTRACT documented + stage cwd unified to the workspace root. 17.2: delivered-app swap = drop real exes at `<workspace root>\bin\<stage>.exe` (checked first, live per click) — `findScript(overrideDir)` + threaded through all run paths incl. report. 17.3: `telemetry.py` aligns its column schema per channel (`telecommand` vs `telemetry`) and the telemetry sidecar was regenerated — kills the "no rows matched" log spam. To restyle the PDF, edit `scripts/pipeline/report.py` only.

---

## 1. How to resume the chat later

Show this file to the assistant (opencode) and say *"continue from
CHAT_LOG.md / Session Log"*. It contains enough context to get back up to
speed: what was built, how to start/stop the app, admin credentials, known
issues, and the pending item with the RAR password.

---

## 2. How to run the app (one-command)

Everything is scripted. From the project root:

```
.\start-dev.ps1     # starts MySQL + backend + Electron app
.\stop-dev.ps1      # stops app + backend + MySQL (use -KeepMysql to keep DB up)
```

- MySQL (portable 8.0.46): `C:\YousufVNS\mysql\mysql-8.0.46-winx64`
- Backend API: `http://localhost:4000` (`/api/health`)
- App / login: `http://localhost:5173` (Electron window title `vns-app`)

**Admin login:** `admin@vns.local` / `VNSProject`
(role admin; bcrypt hash `$2a$10$sD2iusU.HBdYrkSkwqiJ7e3Dt4fSPASBiSkOf6TMpr6YSEF.5Tyh2` in `vns_app.users` id=1)

---

## 3. Project layout

```
C:\YousufVNS\vns-app\vns-app\
  electron/main.cjs              Electron main (IPC, pipeline runner, save dialog, report wiring)
  electron/preload.cjs           Renderer bridge (window.workspace)
  electron/scriptRunner.cjs      ScriptRunner + SCRIPT_CONFIG (10 stages incl. report, .exe swap)
  electron/reportEngine.cjs      Builds report manifest + runs scripts/pipeline/report.py
  scripts/pipeline/*.py          10 stdlib-only pipeline scripts + vnsio.py (incl. report.py)
  scripts/bin/                   (empty) — drop compiled .exe here per stage
  scripts/build_pipeline_exe.ps1 PyInstaller EXE builder per stage
  src/VNSApp.jsx                 React UI (all screens + PipelineRunButton + tab-based Data report)
  src/hooks/useWorkspace.js      IPC-backed hooks (usePipelineRunner etc.)
  src/auth/                      LoginForm, SignupForm, AuthContext, AdminPanel, AuthGate
  src/App.css                    Styles (light + dark)
  src/CustomScreens.jsx          Custom "+ New Screen" logic
  server/                        Express API (auth, admin, password reset)
  start-dev.ps1 / stop-dev.ps1   One-command start/stop
  CHAT_LOG.md                    (this file)
```

---

## 4. What was built this session

### 4.1 "Run Detection" button (Obstacle Detection tab)
- Button lives in the right sidebar of the **Obs. Det.** tab, above
  *Generate Report / Share*.
- Launches a bundled Python script via Electron IPC
  (`workspace:run-obstacle-detection`), then refreshes the tab.
- **ScriptRunner class** introduced so switching scripts is a one-line change.

#### ScriptRunner (`electron/scriptRunner.cjs`)
Single registry `SCRIPT_CONFIG` at the top of the file — now holds 9
stages (obstacleDetection, safePath, distanceMap, preprocess,
occupancyGrid, roverHealth, navigation, sceneAnalysis, telemetry):

```js
const SCRIPT_CONFIG = {
  obstacleDetection: { fileName: "pipeline/obstacle_detection.py", ... },
  safePath:          { fileName: "pipeline/safe_path.py", ... },
  distanceMap:       { fileName: "pipeline/distance_map.py", ... },
  preprocess:        { fileName: "pipeline/preprocess.py", ... },
  occupancyGrid:     { fileName: "pipeline/occupancy_grid.py", ... },
  roverHealth:       { fileName: "pipeline/rover_health.py", ... },
  navigation:        { fileName: "pipeline/navigation.py", ... },
  sceneAnalysis:     { fileName: "pipeline/scene_analysis.py", ... },
  telemetry:         { fileName: "pipeline/telemetry.py", ... },
};
```

- Locates the script under `<appPath>/scripts/` (falls back to
  `app.asar.unpacked/scripts/` for packaged builds).
- `.py` → spawned via `python`; `.exe` → spawned directly (runs without Python).
- 120 s timeout, captures stdout/stderr, resolves `{ ok, stdout, stderr, ... }`.

### 4.2 Detection output popup
Clicking **Run Detection** opens a modal (`modal--console`) showing the
script's **stdout / stderr** plus `script / status / input / output` paths.
Uses the app's existing `.modal-overlay` / `.modal` pattern. Added console
CSS (`.modal__stage--console`, `.console .dim/.ok/.err`) to **both** theme
blocks in `App.css`.

### 4.3 no-root handling
If no Workspace Folder is selected, the button now shows a **friendly** message
(instead of cryptic "Detection failed: no root"):
- toast: *"No Workspace Folder selected. Click 'Select Folder' at the top of
  the Input tab first."*
- popup shows the same hint.
- Cause: `currentRoot` in `main.cjs` is in-memory and only set when a folder
  is picked; it resets on every app restart. Design intentionally clears the
  workspace per fresh launch (see comment in `useWorkspace.js`).

### 4.4 Bug fixed: blank Data tab
Two pre-existing bugs in `DataScreen` (`src/VNSApp.jsx`) caused a **blank
screen** when clicking the **Data** tab:
1. Button used `onClick={handleReport}` but DataScreen names its handler
   `handleGenerateReport` → undefined var → React unmounted (ReferenceError).
2. A stray `runResult` popup block (belonging to Obs. Det.) sat inside
   DataScreen where that state doesn't exist.

**Fix:** DataScreen button now calls `handleGenerateReport`; the `runResult`
modal lives only in the Obs. Det. screen (which owns that state). Verified:
exactly 1 detection-output modal, correctly in Obs. Det.; 4 other screens
use their own correctly-defined `handleReport`.

---

## 5. Known issues / gotchas

- **No workspace root on fresh launch** → Run Detection gives "no-root"
  message until you click **Select Folder** (Input tab). Works-as-designed;
  folder isn't persisted across restarts.
- `electron/main.cjs` **does NOT hot-reload** — changing it requires an app
  restart (`.\stop-dev.ps1 -KeepMysql` then `.\start-dev.ps1`).
- `.py` can't be spawned directly on Windows → `ScriptRunner` prepends
  `python`.
- `rg` is not installed on this machine — use `Select-String`/`grep` in
  PowerShell for searching.
- Vite binds IPv6 `::1`; `Test-NetConnection 127.0.0.1:5173` returns False but
  `http://localhost:5173` returns 200.
- PowerShell 5.1 parses `.ps1` without a UTF-8 BOM as ANSI → keep
  `start-dev.ps1` / `stop-dev.ps1` **ASCII-only** with a trailing newline.

---

## 6. PENDING ITEM — cannot extract `Vision_Navigation_Software_02.rar`

- **File:** `C:\Users\sahibalaljee\Downloads\Vision_Navigation_Software_02.rar`
  (14 MiB, RAR, password-encrypted).
- **Goal:** user has the input file but could not extract it.
- **Tools available:** 7-Zip (`C:\Program Files\7-Zip\7z.exe`) and Windows
  `bsdtar`. Both installed.
- **Password attempt:** user provided `DHA_SUFFA`. Tried exact string plus
  case/format variants (`dha_suffa`, `Dha_Suffa`, `DHASUFFA`, `dha suffa`,
  `DHA SUFFA`) — **all rejected** by 7-Zip ("Wrong password?" / "Cannot open
  encrypted archive").

- **RESOLVED:** correct password is **`DHA_SUFA`** (SUFA not SUFFA). Extracted
  to `C:\Users\sahibalaljee\Downloads\Vision_Navigation_Software_02\` —
  44 folders, 103 files, ~16 MiB extracted (Rar5, no errors).
## 7. Session: six requested features (Telemetry tab, auth approval + recovery, etc.)

- **Scope addressed:** all six features requested in this pass.
- **1) Python .exe backend per tab:** stdlib-only pipeline scripts
  (`scripts/pipeline/*.py` incl. `telemetry.py` with `[channel] [output_dir]`)
  + `scripts/build_pipeline_exe.ps1` (PyInstaller per stage) + `SCRIPT_CONFIG`
  in `electron/scriptRunner.cjs`; `runPipelineStage`/IPC handlers + preload
  bridges added for Safe Path / Dist. Map / Preprocess / Occupancy / Rover
  Health / Telemetry/Telecommand.
- **2a) Forgot/recover password:** `password_resets` table + `POST
  /api/auth/forgot-password` (returns `dev_token` since no mail service) +
  `POST /api/auth/reset-password`; "Forgot password?" link + reset view in
  `LoginForm.jsx`. Verified: reset works, old password rejected, token cannot
  be reused.
- **2c) Admin approval before viewer/admin access:** `users.status`
  (pending/active/rejected); signup creates `pending` (no auto-login);
  login blocks non-active (403); `AdminPanel.jsx` "Pending New Accounts" with
  Approve/Reject (+ grant viewer/editor/admin); `/api/admin/users/:id/approve`
  + `/reject`. Note: admin/bootstrap account was force-set to `status=active`.
- **2d) Telemetry & Telecommand tab:** new `CORE_SCREENS` entry + `TelemetryScreen`
  with Telecommand/Telemetry log tables and Run buttons.
- **2e) Data tab shows all windows:** "All Windows" gallery of every captured
  stage output.
- **2b) Scroll history button on Scene Analysis:** history tracked in-component;
  prev/Next/Latest buttons page through past query/response entries.
- **2f) Generate Report match:** per-tab reports now titled "Vision Navigation
  Analysis Report - <Tab>" on the bordered cover (Image ID + Date), matching
  the shared Report Layout; `generateFullReport` already produced the exact
  9-section layout.
- **DB migration applied live:** `ALTER TABLE users ADD COLUMN status` +
  `CREATE TABLE password_resets` (admin/active confirmed via query).
- **QA (backend live, then stopped):** signup->pending->admin approve->login;
  reject->403; forgot->reset->new pw works/old fails; token reuse blocked.
- **Build:** `npx vite build` passes; `node --check` on all edited electron
  files passes.

---

## 8. Report alignment with reference layout

- Compared generated PDF vs `C:\YousufVNS\Report Layout\Report Layout.pdf`
  using pdf-parse text extraction. Found table mismatches between the
  one-off generation script and the reference layout.
- **Fix applied to `electron/main.cjs`** (`generateFullReport`):
  - Added `refPropertyTable()` helper that builds uniform
    `Parameter / Value` tables with `Property_01..05` keys.
  - Added `makeTable`, `obstacleVals`, `distanceVals`, `gridVals`,
    `waypointVals`, `voVals`, `inputPropsVals` helpers.
  - Sections S1–S8 now all use the reference layout:
    `Property_01..05` with real values where available, placeholders
    `123/234/567` where not.
  - Section 9 (Scene Analysis) keeps `User Query / AI Response`.
- **Verified:** `node --check` + ESLint pass on `main.cjs`.
- **Report regenerated** against `session_run_20260902_003717`:
  - 7-page PDF, extracted text confirms tables match reference:
    - S1/2/5: `\Input\img_280326_001`, `2MB`, `1920x1080`,
      `2032026-01:26:44`, `567`
    - S3: `3/Rock/0.84/0.42/1.2`
    - S4: `3/0.77, 1.53, 1.42/567/234/567`
    - S6: `3/Big Rock/567/234/567`
    - S7: `6/0.5/0.6/0.5/0.5`
    - S8: `1.2/(0.8, 1.2)/567/234/567`

---

## 9. Pipeline "Run" buttons on every core tab

Every core tab now has its own **Run** button (matching the Obs. Det.
"Run Detection" pattern): button → console modal with real stdout/stderr
→ toast → panel refresh. Each button runs an **independent, different
Python script** for its own tab via the ScriptRunner IPC bridge.

### Button → script mapping

| Tab             | Button Label           | Script                    | Stage Dir           |
|-----------------|------------------------|---------------------------|---------------------|
| Input           | Run Preprocess         | `preprocess.py`           | 04_Preprocessed     |
| Obs. Det.       | Run Detection          | `obstacle_detection.py`   | 05_Obstacle.Detection |
| Safe Path       | Run Safe Path          | `safe_path.py`            | 08_Pred_Safe_Path   |
| Dist. Map       | Run Distance Map       | `distance_map.py`         | 06_Distance_Map     |
| Data            | Run Occupancy Grid     | `occupancy_grid.py`       | 07_Occupancy_Grid   |
| Navigation      | Run Navigation         | `navigation.py` **[new]** | 09_Navigation       |
| Scene Analysis  | Run Scene Analysis     | `scene_analysis.py` **[new]** | 14_Scene_Analysis_Report |
| Telemetry       | Run Telemetry          | `telemetry.py`            | 12_Telemetry_Data   |

### New files

- `scripts/pipeline/navigation.py` — writes `Rover_Characterization`
  sidecars (JSON/TXT/CSV/XLSX) + `Rover_Localization.png` into
  `09_Navigation`. Uses stdlib `vnsio.py` canvas helpers.
- `scripts/pipeline/scene_analysis.py` — scans `14_Scene_Analysis_Report`
  for unanswered `Query_<n>.txt` files and writes matching
  `Response_<n>.txt` (obstacle/path/generic descriptions). Plugs into
  the Scene Analysis tab's existing query/poll flow.

### Infra changes

- **`electron/scriptRunner.cjs`** — registered `navigation` and
  `sceneAnalysis` in `SCRIPT_CONFIG`.
- **`electron/main.cjs`** — IPC handlers `workspace:run-navigation` /
  `workspace:run-scene-analysis` via `runPipelineStage`.
- **`electron/preload.cjs`** — `runNavigation` / `runSceneAnalysis`
  bridges added.
- **`src/hooks/useWorkspace.js`** — `usePipelineRunner` map expanded
  with `navigation` and `sceneAnalysis` entries.
- **`src/VNSApp.jsx`** — new reusable `PipelineRunButton` component
  (button + console modal + toasts + optional `onDone` refresh).
  Added `pushToast` prop to `InputScreen` and `NavigationScreen`.
  Button placed in each tab's sidebar/btn-row area.

### Verified

- `node --check` on all electron files; ESLint clean on `main.cjs`.
- `npx vite build` passes (0 new errors; 19 pre-existing baseline).
- `navigation.py` tested with real Python: wrote all 5 output files
  (sidecars + PNG) into `09_Navigation` of the reference session.
- `scene_analysis.py` tested with real Python: created `Response_1.txt`
  from a test `Query_1.txt`, then cleaned up.

---

## 10. Summary of all completed features

| # | Feature                          | Status |
|---|----------------------------------|--------|
| 1 | Run Detection button (Obs. Det.) | Done   |
| 2 | ScriptRunner + stage scripts     | Done   |
| 3 | Forgot/recover password          | Done   |
| 4 | Admin approval for new users     | Done   |
| 5 | Telemetry & Telecommand tab      | Done   |
| 6 | Data tab "All Windows" gallery   | Done   |
| 7 | Scene Analysis scroll history    | Done   |
| 8 | Per-tab report title alignment   | Done   |
| 9 | Report table layout (Property_01..05) | Done |
| 10 | Pipeline Run button on every tab | Done   |
| 11 | Navigation script (09_Navigation)| Done   |
| 12 | Scene Analysis script (14_Report)| Done   |
| 13 | .exe swap support (SCRIPT_CONFIG)| Done   |
| 14 | Data tab — tab-level report summary | Done  |
| 15 | Save-As dialog for report generation | Done |
| 16 | Nav rail reorder (Data at end)  | Done   |

---

## 11. Project layout (superseded)

See **section 3** above for the current layout.

---

## 12. Known issues / gotchas (unchanged + additions)

- Same gotchas from section 5 still apply.
- `rg` is not installed — use `Select-String` in PowerShell.
- `electron/main.cjs` does NOT hot-reload — restart app after changes.
- `.py` scripts spawn via `python` on Windows (ScriptRunner handles this).
- `pipeline/navigation.py` writes placeholder values for rover properties
  (real odometry/localization not implemented; sidecar format matches
  `useNavigationProperties` reader).
- `pipeline/scene_analysis.py` writes canned responses — not AI-generated.
  Real integration would require an LLM backend.
- Pre-existing ESLint warnings in `VNSApp.jsx` (9 errors, all the
  `set-state-in-effect` loadAll/loadCustomWindowData pattern — see §15).
  None from new code.
- **NEVER use PowerShell `Get-Content`/`Set-Content` on UTF-8 source files**
  (JSX/CJS without BOM). PS 5.1 reads them as ANSI → em-dashes/arrows turn
  into `â€”` mojibake, and `Set-Content -Encoding UTF8` adds a BOM. Use the
  Read/Edit/Write tools instead. (Recovery trick if it happens: read file
  as UTF-8, `[System.Text.Encoding]::GetEncoding(1252).GetBytes(text)`,
  write those raw bytes back.)

---

## 13. Data tab reworked into a tab-level report summary

- **Change:** The Data tab's right sidebar no longer lists individual
  output *windows* ("Data to Share"). It now lists the **names of the
  other tabs** (Input, Obs. Det., Safe Path, Dist. Map, Navigation,
  Scene Analysis, Telemetry), and ticking a tab includes that tab's
  content in the **Generate Report** PDF.
- **Sidebar title:** "Tabs to include in report".
- **`handleGenerateReport`** now flattens each checked tab's report
  section(s) built by a per-tab `build()` function in a new `tabItems`
  array inside `DataScreen`. Each tab contributes its images + table
  (Input: left/right + image props; Obs. Det.: mask/bbox + detection
  rows; Safe Path: safepath + waypoints; Dist. Map: distance images +
  distances; Navigation: nav images + nav properties; Scene Analysis:
  navcam/safepath imagery + Scene Description heading; Telemetry:
  telemetry + telecommand logs).
- **Removed** the Data tab's **Share** button (per user decision — the
  sidebar checkboxes now feed the report only). Share still exists on
  other tabs where per-window selection remains.
- **New data wired into DataScreen** so the report has real content:
  `navImagesCapture`, `navPropertiesCapture`, `telemetryLogCapture`,
  `telecommandLogCapture` (all loaded via `loadAll()` on `runSignal`).
- **Added module consts** `TELEMETRY_COLUMNS` / `TELECOMMAND_COLUMNS`
  (Module/Size/Value/Timestamp/Status) and removed the now-unused
  `SHARE_ITEMS` const and `propertiesForItem()` helper.
- **Verified:** `npx vite build` passes; ESLint still 19 baseline errors
  (0 new).

---

## 14. Save-As dialog for report generation

- **Feature:** Every time "Generate Report" is clicked, a native Save
  dialog now appears asking the user where to save the PDF, with a
  default filename pre-filled (e.g.
  `Obs_Det_Report_2026-09-02T...pdf` or
  `Vision_Navigation_Analysis_Report_...pdf`).
- **Default save location:** `15_Report/<currentSession>/` (the same
  path the report previously auto-saved to). The user can choose any
  location.
- **Cancellation:** if the user cancels the dialog, an info toast is
  shown ("Report cancelled — no report was written") instead of an error.
- **Implementation:** `promptReportSavePath(defaultPath)` helper in
  `electron/main.cjs` shows `dialog.showSaveDialog` with PDF filter.
  Both `generateReport` and `generateFullReport` call it before writing
  the PDF.
- **Renderer:** `runGenerateReport()` in `VNSApp.jsx` now handles the
  `cancelled` result and updates the success toast to show the actual
  file path (`result.path`) instead of the old hardcoded
  `15_Report/<session>/<filename>`.
- **Verified:** `node --check` passes on `main.cjs`; `npx vite build`
  passes (0 new errors; 19 pre-existing baseline).

---

## 15. Codebase optimization scan (EXECUTED)

- Full scan of `VNSApp.jsx`, `electron/*.cjs`, `src/hooks/`,
  `src/auth/`, `src/CustomScreens.jsx`, `server/` was performed.
- **All safe removals below were applied and verified** (`node --check`,
  `npx vite build` green, ESLint baseline **19 → 9**, no new errors).

### Done in `VNSApp.jsx` (~225 lines removed)

| Lines (old) | Item | Result |
|-------------|------|--------|
| 322–544 | `MaskOverlay`, `BBoxOverlay`, `SafePathOverlay`, `DistanceOverlay`, `RoverSimOverlay`, `OccupancyChart`, `KIND_OVERLAY`, `DistanceHeatmap`, `ThreeDView`, `RelativeElevation`, `ChartPanel` | Removed (all unreferenced) |
| 3759–3764 | Unreachable `expandedContent.chart` / `render` branch | Removed (verified `chart` never set anywhere) |
| 1132 | `kind` param on `ResultPanel` (unused) | Removed from signature + all 14 call sites |
| 1093 | `seed`/`frame`/`overlay` params on `NavFeedPanel` (unused) | Removed from signature + all 3 call sites |
| 1095 | `hasMedia = isReal \|\| imageSrc` | Collapsed to `isReal` (fully redundant) |
| 2968–2982 | `IMAGE_MAP` recreated every render | Wrapped in `useMemo` |
| — | `setWpIndex` + no-op `jumpWp` + dead spinner | Removed (spinner arrows literally did nothing) |

### Done in `electron/main.cjs` (~40 lines removed)

| Lines (old) | Item | Result |
|-------------|------|--------|
| 874–906 | `runObstacleDetectionScript()` — near-duplicate of `runPipelineStage()` | Removed; IPC `workspace:run-obstacle-detection` now calls `runPipelineStage("obstacleDetection", stageSubdir(OBSTACLE_DETECTION_DIR), inputImage)` like every other tab |
| 1016–1018 | `getLatestTelemetryLogRenamed()` unused wrapper | Removed |
| 992/1013 | `label` param in `readTelemetryLogFromDir()` | Removed (unused) |

### Audit corrections (NOT dead code — kept)

- **`navProps` state in DataScreen** — flagged as "set but never read",
  but it **is** read at report build (`["Visual Odom. Distance", navProps.distance]`, etc.)
  and loaded from `navPropertiesCapture` in `loadAll`. Kept.
- **`rover` state in ObsDet / SafePath / DistMap** — flagged as "vestigial",
  but it is the live editable input state bound to the Rover Characteristics
  `PropRow` fields. Kept.

### Other files — still clean

- `electron/preload.cjs`, `electron/scriptRunner.cjs`, `src/hooks/useWorkspace.js`,
  `src/auth/*`, `src/CustomScreens.jsx`, `server/*` — no dead code.

### Remaining ESLint baseline (9, all pre-existing)

- 9 × `set-state-in-effect` (`loadAll` / `loadCustomWindowData` /
  `setInternalFrame` calls inside `useEffect` — same pattern as before).
- The 5 unused-component errors are gone with the removal above.

### Honest accounting

~265 lines of genuinely dead code removed and verified against the audit.
Two audit items were re-investigated and found to be live UI state — noted
above so the work isn't re-done next session.

## 16. Report generator moved to a Python script (pipeline/report.py)

Report generation previously lived entirely in `electron/main.cjs` as
**pdfkit** code (`buildReportPdf`, `drawReportTable`, `openImageSafe`). It is
now delegated to a pure-stdlib Python generator so the report layout can be
restyled by editing one file (`scripts/pipeline/report.py`) — same pattern as
every other pipeline stage (object detection, safe path, etc.).

### Architecture (how a report is generated now)

1. Renderer builds `sections` (as before) — each image is a base64 `data:` URL
   (`{ caption, url }`). No change on the renderer side.
2. `electron/reportEngine.cjs` (`runReportEngine`) materializes every image's
   data URL to a temp file, writes a JSON **manifest**
   `{ meta: {title, sessionId, date}, sections: [{heading, intro, text,
   imageNotes, images: [{caption, path}], table: {columns, rows}}] }`, and
   runs the registered `report` stage via `scriptRunner`.
3. `scripts/pipeline/report.py` reads the manifest and draws the PDF
   pixel-by-pixel with the stdlib — **no pdfkit, no reportlab** (reportlab has
   no wheels for Python 3.14.7; project rule is stdlib-only so scripts can be
   PyInstaller-packaged to a single `.exe`).
4. `reportEngine.cjs` deletes the temp dir after a *successful* run; on failure
   it keeps the temp dir (manifest + images) and logs `report.py`'s stderr so
   the failure is reproducible.

### Files changed this session

- **`scripts/pipeline/report.py`** (new) — the report layout engine. Pure
  stdlib SVG-like PDF writer that embedded **JPEGs via DCTDecode** and rebuilds
  **PNGs from their zlib scanlines** (Filter 0–4 unfilter + Paeth), handling
  RGBA PNGs as RGB + SMask (`DeviceGray` alpha). Cover page + numbered
  sections + bordered Parameter/Value (or Query/Response) tables + figure
  captions. To restyle the report, edit this one file only.
  - Bug fixes made while testing: `rect`/`line` used `rg` (fill) where `RG`
    (stroke) is required; cleaned up two leftover grid-`x`‑offset lines and a
    stray walrus/`x` expression; **`raw[:8] == b"\x89PNG"` compared 8 bytes to
    a 4‑byte literal, so every PNG was rejected** — fixed to the full 8-byte
    PNG signature.
- **`electron/reportEngine.cjs`** (new) — data-URL → temp-file manifest
  builder + the `scriptRunner.run("report", …)` call + temp-dir cleanup.
- **`electron/scriptRunner.cjs`** — added `report` entry to `SCRIPT_CONFIG`
  (`fileName: "pipeline/report.py"`, `exe: "bin/report.exe"`).
- **`electron/main.cjs`** — removed `require("pdfkit")`, `PDFDocument`,
  `buildReportPdf` (pdfkit body), `drawReportTable`, `openImageSafe`; replaced
  with a thin `buildReportPdf` that calls `runReportEngine`. `generateReport`
  and `generateFullReport` are otherwise unchanged (Save-As dialog, meta,
  sections assembly all kept). Require of `reportEngine.cjs` added.
- **`package.json`** — removed `pdfkit` dependency.

### Verification

- `python scripts/pipeline/report.py <manifest.json> <out.pdf>` standalone:
  7-page / 15-figure PDF from the reference session (`C:\Users\sahibalaljee\...
  \Vision_Navigation_Software (1)\Vision_Navigation_Software\`), valid PDF
  structure (23 image XObjects incl. SMasks, headers, xref, `%%EOF`).
- End-to-end JS chain: `reportEngine` + `scriptRunner` + `report.py`, feeding
  real data-URL JPEG+RGBA-PNG images → valid PDF (220 KB, 6 image XObjects,
  correct DCTDecode/FlateDecode/SMask) + temp dir cleaned up.
- `node --check` on all touched `.cjs`, `py_compile` on `report.py`, `npx
  vite build` green, ESLint green on all three Electron files, project lint
  still at the 9 pre-existing `set-state-in-effect` baseline (no new errors).

### 16.1 In-app fix: "report failed exit code 1" (UnicodeEncodeError on em dashes)

The app spawned `report.py` as usual, but Python exited 1 on every real
report. Root cause (found by replaying a faithful Data-tab manifest — em-dash
headings like `Input — Captured Images`, numeric table cells, table-only
sections):

- `_sanitize` remapped `—` (U+2014) to `chr(0x97)` — the *byte* cp1252 uses for
  em dash, but as a Python char (U+0097, a C1 control). `str.encode("cp1252")`
  then raised `UnicodeEncodeError` for Python's `\x97`, crashing in
  `PDF.text` → `_op`. All the Data-tab headings contain `—`, so every attempt
  failed identically.
- Fix: `_sanitize` no longer remaps; it keeps every char cp1252 can encode
  (U+2014 encodes to byte 0x97, which the WinAnsi base font renders back as
  the em dash) and rewrites only what cp1252 truly can't represent (`→` → `->`,
  everything else → `?`).
- Re-verified after fix: 2-page/2-figure numeric + em-dash manifest and a
  3-page/8-figure multi-image (JPEG + RGBA/FlateDecode PNG + 3-up grid +
  numeric table) manifest both exit 0 and produce valid `%%EOF` PDFs with the
  `0x97` bytes intact.
- Diagnostics improved: `reportEngine.cjs` keeps the temp dir + logs stderr on
  failure, and `main.cjs` `buildReportPdf` now includes `result.stderr` in the
  thrown error instead of just "exit code 1".

### 16.2 In-app fix: rendered PDF was blank ("empty") — /Contents pointed at Page dicts

After the exit-code-1 fix, reports generated but opened as **blank pages.
Cause: an object-number collision in `PdfBuilder.save()`. `content_nums` was
`[3 + i …]`, but objects `3 … 2+n` are the **Page dictionaries** emitted first.
So every page's `/Contents` referenced a Page dict (not a content stream);
real streams (JPEG/PNG XObjects, text) were written to orphaned objects, and
viewers rendered white pages. Verified by decompressing the streams: all 5
`/Contents` targets resolved to the same first stream bytes.

### 16.5 In-app fix: table cell misalignment/spill + blank JPEG figures

User: "contents are being spilled out of the tables and the grids, contents are
not properly aligned, some images are blank." Two concrete bugs:

- Tables: `_draw_table.draw_row` decremented ONE running baseline `cur` across
  all cells of a row, so every cell's first line sat one line-height lower than
  the previous cell's (header `Img No.`→`confidence` dropped 23 pt and fell
  past the header box bottom). Fix: reset `cur = y_top - FONT_SIZE_TABLE` per
  cell. Verified: all header cells share baseline y (242.18 / 533.16) and each
  data row's cells are on one baseline, multi-line cells stay in-cell.
- Blank JPEGs: `PdfBuilder.save()` zlib-compressed EVERY XObject including
  `/DCTDecode` images, so the stream began `78 9c` (zlib header) instead of
  `ff d8` — viewers could not decode them and rendered blank frames. All the
  camera images (JPEG) were affected; PNG maps (FlateDecode) were fine. Fix:
  for `/DCTDecode`, write the raw JPEG bytes verbatim (no Flate layer).
  Verified: new exports start `ff d8`, and PDFium renders the previously-blank
  figures with real imagery (pixel std 78–90 in the figure rects).

### 16.4 In-app fix: cover/centred text pushed off-page ("format totally out")

After 16.3 the PDF had content but the layout was broken: every centred text
(cover brand, title, summary, date, "Image ID", and the figure captions) was
displaced ~one content-width to the right, partly off-page.

- Cause: `PdfBuilder.text(..., align="center"/"right")` used `bx = width` as
  the centring base, i.e. `x = width + (width - tw) / 2` — starting the line
  at the box's *right* edge instead of its left edge. Right-alignment suffered
  the same shift (`x = width - tw`).
- Fix: `x` is the layout box's left edge, `width` extends it rightward —
  `center: x = x + (width - tw) / 2`, `right: x = x + width - tw`. Also fixed
  the report header call in `_draw_header` to pass `(ML, width=CONTENT_W)` so
  right-aligned text ends at the content's right margin (PAGE_W - MR).
- Verified on the 2-page E2E PDF: brand/title/summary/date back inside
  [55, 540]; "Image ID" centred in its 300pt box; figure captions centred in
  their frames; 6-column detection table evenly spaced (59→463.4); header text
  right edge lands at the margin. Cover render shows dark content distributed
  across the page with no right-edge overflow.

### 16.3 In-app fix: Pages tree /Kids named content streams (blank in strict viewers)

After 16.2, reports still opened blank in the user's viewer and a
PDF→MD converter reported "empty file" (pypdf showed 0 text, 0 XObjects per
page). Cause: my 16.2 change to `save()` made `content_nums` point at the real
streams, but the **Pages tree `/Kids` was also built from `content_nums`** —
so `/Kids` named the *content stream* objects as "pages". Strict parsers then
treated each stream object (which only has `/Filter /FlateDecode`) as a page:
no `/MediaBox`, no `/Resources`, no `/Contents` → blank page, no extractable
text. PDFium happens to render the first one by forgiving the references,
which masked the problem.

- Fix: two separate number lists in `PdfBuilder.save()`: `page_nums = [3+i]`
  for the Page dicts (used by `/Kids`) and `content_nums = [3+n_pages+i]` for
  the content streams (used by each page's `/Contents`).
- Also: fonts now carry `/Encoding /WinAnsiEncoding` exactly like the old
  pdfkit output, so text extractors can map bytes → unicode.
- Verified with the independent `pypdf` parser on a 4-page / 8-figure test:
  every page resolves to a proper dictionary (`/Type /Page, /Parent, /MediaBox,
  /Resources, /Contents`), `extract_text()` returns 244–503 chars per page
  (cover, sections, tables incl. em dashes), and 13 XObjects are visible per
  page. Chromium's viewer renders the cover with full content (57% dark px).

### Note

- To ship a compiled `report.exe`, drop `scripts/bin/report.exe` and it's used
  automatically (ScriptRunner prefers `.exe`).

## §17 — Pipeline scripts compiled to Windows .exe (2026-09-07)

Goal: the tab "Run" buttons should execute compiled **Python executables**
(`*.exe`) rather than launching `python script.py` — the ship form of the VNS
reference build (VNS_DASH.exe).

### What changed

- Installed `pyinstaller` 6.22.2 (supports Python 3.14.7, the only interpreter
  on this machine: `C:\Users\sahibalaljee\AppData\Local\Python\pythoncore-3.14-64`).
- Compiled **all 10 pipeline stage scripts** into single-file console exes under
  `scripts/bin/`, one per stage, each ~9.5 MB:

  | exe                  | source script       |
  |----------------------|---------------------|
  | obstacle_detection.exe | pipeline/obstacle_detection.py |
  | safe_path.exe          | pipeline/safe_path.py |
  | distance_map.exe       | pipeline/distance_map.py |
  | preprocess.exe         | pipeline/preprocess.py |
  | occupancy_grid.exe     | pipeline/occupancy_grid.py |
  | rover_health.exe       | pipeline/rover_health.py |
  | navigation.exe         | pipeline/navigation.py |
  | scene_analysis.exe     | pipeline/scene_analysis.py |
  | telemetry.exe          | pipeline/telemetry.py |
  | report.exe             | pipeline/report.py |

- Build invoked per stage:
  `python -m PyInstaller --noconfirm --onefile --console --clean
    --distpath scripts/bin --paths scripts/pipeline <scripts/pipeline/NAME.py>`
  (work/spec paths routed to a temp dir so the repo stays clean).
- No code changes needed: every stage script is pure stdlib + local `vnsio`
  helper (PyInstaller bundles `vnsio` automatically), and all read their inputs
  from `sys.argv` / `os.getcwd()` the same frozen vs interpreted. `vnsio.py`
  was **not** bundled as a module by name — it ships inside each exe.
- `electron/scriptRunner.cjs` needed no edits: it already preferred the
  `exe:` entry (`bin/NAME.exe`) over the `.py` fallback and spawns `.exe`
  directly (no interpreter needed → runs on machines without Python).

### Verification (exe vs `.py`, identical args/cwd as the main-process handlers)

Ran each `NAME.exe` and `NAME.py` with the same `[input] [output_dir]`
(`cwd=output_dir`) against the real newest session
(`03_Input_Image/session_2026-09-07T06-57-38-652Z/Left.jpg`):

- preprocess, obstacle_detection, distance_map, occupancy_grid, safe_path,
  navigation, rover_health: **equal output file counts + byte-identical
  PNG/JPGs** (e.g. preprocess 7/7 files, 3/3 images identical).
- telemetry on both channels (`telecommand`, `telemetry`): same 4 sidecar
  files (json/txt/csv/xlsx).
- scene_analysis with a pending `Query_1.txt`: identical `Response_1.txt`.
- report.exe with a minimal JSON manifest: **byte-identical PDF** to
  report.py (1556 B → 1556 B, same MD5).

### Packaging

`package.json` `build` config already ships `scripts/**/*` and unpacks
`scripts/bin/**/*` (asarUnpack) so the packaged app finds real on-disk exes.
The running dev Electron app picks the exes up immediately (ScriptRunner
resolves per click; no restart needed).

### §17.1 Ready for real-exe swap (zero-code)

- The app is now fully "drop a real exe and it runs" ready. To replace a stage,
  only the file in `scripts/bin/<stage>.exe` changes — no code edits:
  `electron/scriptRunner.cjs` `findScript()` prefers `bin/NAME.exe` over the
  `.py`, spawns it directly, and the success toast already shows the resolved
  exe path (`result.script`).
- Documented an **EXECUTABLE CONTRACT** in the `scriptRunner.cjs` header that
  real exes must follow:
  - stage exes: `exe [inputImagePath?] [outputDir]`
  - telemetry: `telemetry.exe [channel] [outputDir]` (telecommand | telemetry)
  - report: `report.exe [manifest.json] [output.pdf]`
  - cwd = **workspace root** (not the output dir); write outputs to argv only.
    exit 0 = success (stdout = human line, shown in toast), non-zero = failure
    (stderr shown in error toast), must finish before the 120 s timeout.
- Unified the stage handlers: `runPipelineStage` now also runs with
  `cwd: currentRoot` (was `outDir || currentRoot`) so every stage shares the
  same working-dir convention. Re-verified preprocess/telemetry/report exes
  run from the workspace root (exit 0, outputs written via argv).

### §17.2 Delivered-app real-exe swap: `<workspace root>\bin\` override

- Delivery: `npm run electron:build` bundles `scripts/**/*` and un-packs
  `scripts/bin/**/*` (asarUnpack) so placeholder exes ship at
  `<install>\resources\app.asar.unpacked\scripts\bin\` and work out of the box.
- To install PRODUCTION binaries after deployment, drop
  `<workspace root>\bin\<stage>.exe` — the app checks that folder first for
  every stage. Resolution order per stage:
  1. `<workspace root>\bin\<stage>.exe` (real binaries; the only swap step)
  2. bundled `<app>\resources\app.asar.unpacked\scripts\bin\<stage>.exe`
  3. dev fallback `scripts\pipeline\<stage>.py`
- Implemented: `ScriptRunner.findScript(actionId, overrideDir)` re-checked the
  override dir first (using `path.basename(cfg.exe)` — cfg.exe is `bin/…`
  relative so joining it onto the override dir doubled `bin`; fixed). Threaded
  `overrideDir` through every run path: `runPipelineStage`, the telemetry IPC
  handler, and `runReportEngine` → `buildReportPdf`. `stageBinOverride()` =
  `currentRoot ? join(currentRoot,"bin") : null` in main.cjs.
- Verified: override exe wins (fake content read back), bundled exe used when
  no override, all stage ids resolve, and `runReportEngine` produced a valid
  PDF via an override-copied `report.exe` (1409 B). README "Scripts" section
  rewritten with the ship/swap contract; scriptRunner.cjs header documents the
  EXECUTABLE CONTRACT + deployment note.

### §17.3 Telemetry column schema aligned (no more "no rows matched" spam)

- `12_Telemetry_Data` reader (`normalizeTelemetryRecord` in main.cjs) expects
  `VO Distance Traveled (m)` / `Lunar Coordinates (N)` / `Lunar Coordinates (E)`
  (or `Distance`/`Lat N`/`Lon E` aliases). The placeholder `telemetry.py` wrote
  the cmd schema (`Img No / Module / Size / Value / timestamp / Status`) into
  BOTH folders → the 12_Telemetry_Data reader logged "no rows matched" on every
  telemetry render.
- Telecommand reader (`normalizeCmdRecord`) already matched the placeholder
  columns, so only the `telemetry` channel needed fixing.
- `telemetry.py` now branches on `channel`: telecommand keeps its schema,
  telemetry writes the Distance/Lunar Coordinates schema (4 sample rows).
  Rebuilt `telemetry.exe` (PyInstaller) and regenerated both reference log
  folders. Verified with the exact JS reader logic: 4/4 rows on each channel,
  JSON + CSV. No other file/stage touched.

## §18 — Packaging into a Windows installer & shipped-app fixes (2026-09-07)

### What changed
- `npm run electron:build` now produces a working NSIS one-click installer,
  `release\vns-app Setup 0.0.0.exe` (~184 MB), plus the portable
  `release\win-unpacked\` folder. `build/icon.ico` regenerated as a real
  multi-size 16/32/48/256 ICO (215,965 B) from `build/icon.png` (512²) via a
  hand-assembled ICO (sharp can't write `.ico`). `package.json` gained
  `description`/`author`; the app exe metadata is stamped (v0.0.0,
  thegnssproject-beep). All commits through `a9c9394` pushed to GitHub.

### §18.1 Packaged app showed a blank white window → vite `base: "./"`
- Cause: built `dist/index.html` referenced `/assets/...` absolutely. Vite's
  dev server served those; in the packaged app `loadFile()` reads it over
  `file://`, so `/assets/...` resolved to the drive root → blank renderer.
- Fix: `base: "./"` in `vite.config.js` → assets become `./assets/...`.
  Confirmed the relative paths inside the shipped `app.asar`.

### §18.2 Workspace data now auto-loads on folder selection
- InputScreen intentionally never auto-loaded on mount; data only appeared
  after Run Algorithms/Play bumped `runSignal`/`playSignal`. In dev this was
  masked (the dev session had already run the pipeline); a fresh installed app
  sat empty after picking a workspace folder.
- `chooseRootAndLoad` wraps `chooseRoot()` in `VNSApp.jsx` and, on a successful
  pick, bumps `playSignal` (02_Raw_Image lists → CAM-L/CAM-R) and `runSignal`
  (latest session outputs + NavCam capture/properties on every tab).
- InputScreen's two effects switched from skip-first-render-ref gating to
  `signal === 0` gating — the whole tab remounts per folder via `key`, so the
  ref guards were swallowing the post-selection bump.

### §18.3 Packaged stage-exe buttons failed with ENOENT
- Symptom (installed build): `spawn ...\app.asar\scripts\bin\preprocess.exe
  ENOENT` in the run toast.
- Cause: `scriptDirs()` in `scriptRunner.cjs` checked
  `appPath/scripts` (the `.asar` path) before
  `appPath/../app.asar.unpacked/scripts`. Electron's patched `fs.existsSync`
  reports packed asar entries as existing, but `scripts/bin` was `asarUnpack`ed
  so that path is phantom on disk → spawn ENOENT (exes were always bundled and
  work fine directly).
- Fix: `scriptDirs()` detects packaged mode via `path.extname(appPath) ===
  ".asar"` and returns the real `app.asar.unpacked` dir first, falling back to
  the plain path only when no asar exists (dev). Verified the fix is inside the
  shipped asar with all 10 stage exes un-packed.

### Build-process notes for this machine
- `electron-builder` needs admin for the `winCodeSign` cache extraction
  (7-zip must create two macOS `.dylib` symlinks → needs
  `SeCreateSymbolicLinkPrivilege`) — run the build from an elevated PowerShell.
- A running `release\win-unpacked\vns-app.exe` locks DLLs and makes
  `electron-builder` fail with `Remove ...d3dcompiler_47.dll: Access is
  denied` — close the app / delete `release\` before rebuilding.


