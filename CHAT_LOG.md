# VNS App — Session Log / Conversation Continuation

> **Purpose:** Snapshot of the ongoing conversation so it can be resumed later
> without losing context. Lives next to `README.md` in the project root.

**Project root:** `C:\YousufVNS\vns-app\vns-app`
**Last updated (work state):** Section 24 DONE — generated report is now a ditto copy of `Report Layout.docx` (decoded from the .docx XML): A4 page, Times, cover page with the template's "Visison Navigation Analysis Report" / "Image ID: <session>" / "Date:" block, then numbered 1..9 bold-14 heading "N. <Heading>", intro sentence (the "captured on <date>, at <time>" intro and the Left/Right camera captions keep their template underlines), per-section figure grids (full-width stacks, side-by-side pairs, preprocess = 2 pairs + full-width rectified, VO = pair + full-width localization) captioned "Figure N: …" below each image (numbering runs 1..25), and bold-headed Parameter/Value (or User Query/AI Response) tables with a 0.5pt grid; the first four sections keep the template's two trailing empty rows. `report.py` rewritten (IEEE title block/two columns/Roman headings/footer removed); `PdfBuilder.text` gained an `underline` flag; `scripts/bin/report.exe` rebuilt. Verified: 12 pages / 25 figures / 9 tables, .py and .exe byte-identical (356649). Sample: `15_Report/session_2026-09-15T05-45-52-432Z/Report_Layout_Sample.pdf`. Section 23 (IEEE style) superseded. §22 DONE — (22.1) all bottom-right `.exe` buttons removed (input/obsdet/safepath/distmap/navigation/sceneanalysis/data/telecommand/telemetry exe): the per-window ▶ buttons run the identical stage via `useStageRun`/`WindowRunButton`/`ConsoleResultModal`. `PipelineRunButton`, the Obs. Det. bespoke `runResult` modal + `handleRunDetection`, and `useTelemetryRunner` deleted (telemetry refresh still via panel ▶). (22.2) Telemetry tab "Refresh Logs" sidebar now has **Telecommand / Telemetry headings with TC1–3 / TM1–3 checkboxes** that filter rows 1–3 of each log table (rows beyond 3 always shown). (22.3) Data tab sidebar made the same style: **every possible window sub-heading is now always listed** under each tab heading (via module `WINDOW_ITEMS`), master tab checkbox kept, collapse chevron removed. ESLint down to 10 pre-existing `set-state-in-effect` (2 preserve-memo errors gone). (22.4) Telemetry page-level `Telemetry & Telecommand` `section__title` heading removed (table `panel__title` headings kept). (22.5) Topbar **Run Algorithms button kept its name but now runs all tabs sequentially** (input copy → preprocess → obstacleDetection → occupancyGrid → safePath → distanceMap → navigation → sceneAnalysis → telemetry×2 → roverHealth), single runSignal bump + pass/fail summary toast, "Running…" while busy. Prior: §21 — Data-tab sub-window ▶ run buttons → checkboxes for report sub-heading include/exclude. `npm run build` passes; lint = only pre-existing errors.

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
| 17 | Data-tab sub-heading checkboxes in report | Done |

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

---

## §19 — Self-containment was built then REVERTED (2026-09-10)

The backend was temporarily made self-contained — `electron/server/*` (CJS
Express + `better-sqlite3` embedded in the Electron main process), MySQL
dropped, DB auto-seeded at `%APPDATA%\vns-app\vns.db`, new `start-dev.ps1` —
committed as **e7b182d** and pushed. It worked (verified standalone).

**Reverted by user decision** (`git revert e7b182d` → commit **3df2cdd**,
pushed): the local/per-install SQLite model means admin approval is
per-machine, not central — there is NO shared server for one admin to
approve users across machines. The project keeps the ORIGINAL architecture:

- **External Express backend** on `:4000` (repo `server/`, ESM + mysql2)
- **Portable MySQL 8.0.46** at `C:\YousufVNS\mysql\...` (manual schema load)
- **`start-dev.ps1`** starts MySQL + backend + Electron in one go
- Admin approval is a server-side feature: signup → `pending` → admin
  approves via the Admin panel on the shared backend.

Current HEAD is the pre-self-containment state (ef9b33b equivalent). The
GitHub release `v0.0.0` (created during this experiment) still contains the
**self-contained** installer — do not distribute it; rebuild the installer
from `main` if a release is needed. `better-sqlite3` and
`electron/server/*` are fully removed from the tree / node_modules / lockfile.

---

## §20 — Fullscreen fix, per-window triangle run buttons, Data-tab window subtabs (2026-09-10)

Three requested UI changes implemented in `src/VNSApp.jsx` + `src/App.css` + `src/hooks/useWorkspace.js`:

**20.1 Fullscreen blank white space fixed.** Root cause: `.vns` used
`height: 100%` but no ancestor has a definite height (`#root`/`body` only
have `min-height: 100vh`), so percentage height resolved to auto → app
shrank to content height → white band below. Both theme blocks of `.vns` in
`App.css` changed to `height: 100vh; min-height: 660px; box-sizing:
border-box;`. No `electron/main.cjs` fullscreen handling changed.

**20.2 Triangle "run" buttons on every window.** Extracted the pipeline-run
logic out of `PipelineRunButton` into a reusable `useStageRun` hook and a
shared `ConsoleResultModal`; added a new `WindowRunButton` component (small
▶ in each panel's header tools). Every `ResultPanel` / `DataTablePanel` /
`NavFeedPanel` instance across the tabs now accepts a `run` prop
`{ actionId, hint, title, onDone }` + `pushToast`, mapping each window to
its owning stage:

- Obs. Det.: left/preprocessed → `preprocess`; mask/bboxes →
  `obstacleDetection` (hint left/right)
- Safe Path: pre → `preprocess`; obstacle → `obstacleDetection`;
  occupancy → `occupancyGrid`; safepath → `safePath`
- Dist. Map: all four → `distanceMap`
- Navigation: all three (incl. sim video) → `navigation`
- Scene Analysis: navcam → `preprocess`; obstacle → `safePath`
- Telemetry: telecommand → `telemetry` (hint `telecommand`); telemetry →
  `telemetry` (hint `telemetry`)
- Input tab keeps its existing Play triangles (raw-feed toggle, not a stage run)

Backing change in `useWorkspace.js`: added `obstacleDetection` and
`telemetry` entries to the `usePipelineRunner` map (telemetry reuses
`window.workspace.runTelemetry(inputHint)`). `electron`/`preload` were already
exposing all the needed run functions — no IPC changes required.

**20.3 Data-tab sidebar: window subtabs, All Windows gallery removed.** The
"All Windows" tile grid (and its `IMAGE_MAP` / `allWindows` memos, and the now
unused `ppImages` state + `preprocessedCapture` prop that only fed it) is
gone. Each "Tabs to include in report" checkbox is now a collapsible group
(chevron toggle) with its produced windows listed underneath as sub-rows,
each with its own ▶ that runs that window's stage via `runDataWindow` →
`usePipelineRunner`. Windows appear only if actually produced this session:
input → Left/Right; obsdet → mask/bboxes; safepath → occupancy/safe path;
distmap → distances/heatmap/3D/elevation; navigation → last/current;
sceneanalysis → navcam 1/2 + safe path; telemetry → telecommand/telemetry logs.
New CSS: `.share-group*` / `.share-window*` (both light + dark).

**Verify:** `npm run build` passes. Lint shows only pre-existing errors
(React-Compiler set-state-in-effect / preserve-manual-memoization on
`navImages.current` ref access and other files) — nothing new introduced.
Dev check: `.\start-dev.ps1`, log in as admin, hit Run Algorithms, toggle
tabs/screens and the per-window ▶ buttons, and confirm Data sidebar subtab
groups + fullscreen has no bottom gap.

---

## §21 — DONE: Data-tab sub-heading checkboxes instead of run buttons (2026-09-14)

User request: under "Tabs to include in report" in the Data tab, the
sub-window rows should have a **checkbox to choose whether each sub-heading
goes into the report** — NOT the ▶ run button added in §20.3.

**Goal:** each collapsible tab group's sub-rows are checkboxes (default all
checked = all sub-headings included). Toggling one excludes just that
sub-heading (its image / table section) from "Generate Report". The data.exe
PipelineRunButton in the btn-row stays.

### Completed in `src/VNSApp.jsx` (DataScreen):
1. `windowItems` memo — each window carries `produces: [captionOrHeading...]`
   naming the exact report section it contributes (input-left → `["Left Image"]`,
   tel-telecommand → `["Telemetry — Telecommand Log"]`, distmap-elevation →
   `["Relative Elevation Map"]` which is the true report caption).
2. `windowChecked` state + `winIncluded(w)` (`windowChecked[w.id] !== false` →
   default included) + `toggleWindowCheck(id)`.
3. **`runDataWindow` useCallback deleted** + the `usePipelineRunner()` line in
   DataScreen removed (run buttons gone; per-window runs removed per design).
4. **`handleGenerateReport` rewritten** — per checked tab it filters the built
   sections by the group's windows:
   - `onProduced` = concat of `produces` from windows where `winIncluded(w)`;
     `allProduced` = from all windows of that tab.
   - sections with `images`: keep images whose `caption ∈ onProduced`; drop the
     section if none remain.
   - sections with no images: if `sec.heading ∈ allProduced` keep only when
     `∈ onProduced` (the two telemetry tables); otherwise keep (tab-scoped
     tables like Input props / Nav props / detection tables).
   - checked tab with zero sections → existing "Nothing captured for this tab
     yet — run Run Algorithms first." note style.
5. **Sidebar JSX** — sub-row is now `<label className="share-window">` +
   `Checkbox checked={winIncluded(w)} onChange={() => toggleWindowCheck(w.id)}`
   + `<span className="share-window__name">`. No run button.
6. **safepath `build()`** — occupancy grid image prepended to `images`
   (`gridImg` → caption "Occupancy Grid Map") so its sub-heading checkbox is
   meaningful; `gridImg` added to `tabItems`' dep array.
7. **CSS** (`App.css`, both theme blocks) — `.share-window__run*` rules
   removed (dead); `.share-window` is now a cursor-pointer label and reuses
   the existing `Checkbox`/`.chk` styling.

### Verified
- `npm run build` passes. ESLint = 12 pre-existing-only errors (10 ×
  `set-state-in-effect` + 2 × `preserve-manual-memoization` on `tabItems` /
  `windowItems` `navImages.current` ref access) — no new errors introduced
  (diff vs HEAD = 0 new; HEAD's 11 predates the uncommitted §21 partial work).
- Sidebar sub-headings are all-default-checked now; unchecking one excludes
  exactly that caption/heading from the Data report; telemetry tables are the
  only heading-gated (non-image) sections, so unchecking Telecommand/Telemetry
  removes just that table.

Note: `windowChecked` default (absent) = included, so existing users' reports
are unchanged until they uncheck something. Headers/§20 stay accurate for the
shipped state except the §20.3 mention that each sub-row has a run button — §21
supersedes that.

---

## §22 — DONE: exe buttons removed, Telemetry TC/TM row selector (2026-09-14)

Two UI decisions from live review. Both renderer-only (`src/VNSApp.jsx`,
`src/hooks/useWorkspace.js`, `src/App.css`); Vite HMR applies them live.

### 22.1 Bottom-right `.exe` buttons removed (per-window ▶ covers them)

The tab sidebars' bottom-right run buttons — `input.exe` (preprocess),
`obsdet.exe` (obstacleDetection), `safepath.exe` (safePath), `distmap.exe`
(distanceMap), `navigation.exe` (navigation), `sceneanalysis.exe`
(sceneAnalysis), `data.exe` (occupancyGrid) — are **gone**. Every pipeline
action they fired is the same `usePipelineRunner` → IPC → ScriptRunner stage
that the per-window ▶ buttons (§20.2, `WindowRunButton` +
`ConsoleResultModal` + all the friendly no-root/script-not-found error
messages via `useStageRun`) already launch, and the shared modal shows the
same stdout/stderr. So removal loses no coverage.

Deleted along the way (all become dead code):
- `PipelineRunButton` component (was the exe-button wrapper).
- Obs. Det.'s bespoke `runResult` console modal + `handleRunDetection` +
  `running`/`runResult` state (the ▶ on mask/bboxes covers detection now).
- `InputScreen`'s now-unused `pushToast` prop (its only consumer was
  `input.exe`).
- `useTelemetryRunner` hook in `useWorkspace.js` + its import/call/prop
  (`telemetryRunner`) — Telemetry refresh still happens via the two panels'
  ▶ buttons (`actionId: "telemetry", hint: telecommand/telemetry`).

### 22.2 Telemetry sidebar: Telecommand / Telemetry headings with TC/TM row checkboxes

The "Refresh Logs" box no longer has `telecommand.exe` / `telemetry.exe`
buttons. Each is now a **heading** with numbered **sub-heading checkboxes**:
- **Telecommand** → TC1, TC2, TC3
- **Telemetry** → TM1, TM2, TM3

Function: checking/unchecking a sub-heading includes/excludes that **row of
the corresponding log table** (TC<i> ↔ row *i* of the Telecommand table,
TM<i> ↔ row *i* of the Telemetry table). Rows 1–3 are toggleable; rows beyond
the third are not bound to a sub-heading and always stay visible.
`tcChecked`/`tmChecked` maps keyed by `imgNo` default to included (absent =
true), so nothing changes until the user unchecks.

Implementation: `filter((r) => r.imgNo > 3 || tcChecked[r.imgNo] !== false)`
inside the `telecommandTable`/`telemetryTable` `useMemo`s (deps now include
the checked maps). Sidebar reuses the Data sidebar's `.share-group` /
`.share-window` markup + `Checkbox`; new `.share-group__heading` style (both
theme blocks) for the uppercase group label.

### 22.3 Data sidebar: sub-headings always listed (Telemetry-style)

Follow-up: "do the same as the Telemetry tab in the Data tab — headings of
every tab, and under each heading sub-headings to select whether that tab's
**window** goes into the report." User chose to **keep the master tab
checkbox** + window checkboxes (asked via question).

- `windowItems` (a production-gated `useMemo` in `DataScreen`) is now a
  **module-level `WINDOW_ITEMS` const** listing every possible sub-heading per
  tab (input→Left/Right Image; obsdet→Mask/BBoxes; safepath→Occupancy Grid/
  Safe Path; distmap→Distances/Distance Map/3D View/Relative Elevation;
  navigation→Last/Current; sceneanalysis→NavCam 1/2 + Safe Path; telemetry→
  Telecommand/Telemetry Log), each carrying its `produces` captions.
- **Sub-headings now always render** — the collapse chevron (`openGroups`,
  `toggleWindowGroup`, `.share-group__toggle` CSS) is gone. Every tab heading
  (master checkbox + name) sits above its window checkboxes at all times.
- Unproduced windows contribute nothing to the PDF (their captions simply
  never appear in the built sections); the §21 `handleGenerateReport` filter
  logic is unchanged, only sourced from `WINDOW_ITEMS`.
- **Delete side-effect:** dropping the `windowItems` memo removed both
  `preserve-manual-memoization` lint errors — ESLint is now down to the 10
  pre-existing `set-state-in-effect` (best count seen).

### 22.4 Telemetry screen header removed (follow-up)

Aside: the "big black heading" above the tables was the page-level
`<h1 class="section__title">Telemetry & Telecommand</h1>` + hint, not the
`panel__title` table headings. An initial attempt removed the table titles via
a `hideTitle` prop on `DataTablePanel` — **reverted** (user said "not the table
headings"). Instead the Telemetry screen's `div.section__header` block was
deleted. Grep confirms `section__title` no longer appears anywhere in `src/`
(Telemetry was the last screen still using it).

### 22.5 Topbar "Run Algorithms" -> "Run All Tabs" (sequential)

Follow-up: the topbar CPU button used to only copy the selected raw images
into a new `03_Input_Image` session ("Sent to Input" toast). It now runs
**every tab's pipeline stage back to back**:

1. **Input step** — same `runAlgorithms(left, right)` session-folder copy,
   but only if `inputScreenRef.getSelectedRawPaths()` has a Left/Right picked;
   otherwise the batch just re-runs the stages against the latest session
   instead of erroring "Nothing selected".
2. **Sequential stages** (`RUN_ALL_STAGES` const, order = dependency chain:
   `preprocess` → `obstacleDetection` → `occupancyGrid` → `safePath` →
   `distanceMap` → `navigation` → `sceneAnalysis` → `telemetry`(telecommand)
   → `telemetry`(telemetry) → `roverHealth`, all `hint "left"` except the two
   telemetry modes) via the same `usePipelineRunner` the per-window ▶ buttons
   use.
3. **One `setRunSignal` bump** at the end so every tab re-pulls the newest
   output from disk, then a success/`N stage(s) failed: …` summary toast.

Button label is now **Run All** (— "Running…" + disabled + green-tinted
border while the batch is in flight via `.topbar__run-btn--active` /
`:disabled`, both theme blocks). Per-window ▶ buttons unchanged.

### 23 IEEE paper-style report format

User: "i want the report to follow IEEE format" → chose **IEEE paper style**
(journal-template): title/author/abstract block on page 1, two-column body
below, Roman-numeral sections, Times family font, US Letter page.

Rewrote `scripts/pipeline/report.py`'s layout engine:
- **Page**: US Letter 612×792; IEEE margins (0.75" top/left, 0.5" right, 1" bottom);
  two 3.5" columns with 0.25" gutter below the title block.
- **Fonts**: base-14 Times family (Times-Roman / -Bold / -Italic / -BoldItalic)
  replaces Helvetica everywhere; added `_TIMES`/`_TIMES_B` AFM width tables +
  font-aware `_text_width()`; PdfBuilder now registers 4 fonts.
- **Title block**: 24pt uppercase bold title, author line ("Vision Navigation
  Software System"), italic session/date affiliation line, then a full-width
  Abstract— / Index Terms— box (abstract synthesized from meta; index terms
  from the section headings). No separate cover page.
- **Body**: justified 10pt Times paragraphs, uppercase Roman-numeral
  section headings (I., II., …); figures → "Fig. N." italic captions below
  scaled to column width (max 150pt tall); tables → "TABLE N" bold + italic
  caption ABOVE, 8pt Times, gray header row. Column/page flow via
  `ensure()`/`advance()`; centred page-number footer bar.
- `_wrap`/`_wrap_inline` (inline Abstract/Index-Terms flow) + `_draw_words`
  justification helper added.
- **Deploy**: rebuilt `scripts/bin/report.exe` via PyInstaller (installed
  pyinstaller 6.22.2, Python 3.14.7) so the packaged app uses the new style.
  Verified `.py` and `.exe` both generate a 3-page / 10-figure / 3-table PDF
  from a real-session manifest; structure validated (Times fonts, 18 image
  XObjects, xref OK). Sample copy: `15_Report/session_2026-09-15T05-45-52-432Z/IEEE_Sample.pdf`
  (user's data folder — inspect to confirm look-and-feel).

Note: manifest sections are flat `{heading, intro, images, imageNotes, text,
table}` so reports use top-level Roman sections (I., II., …). No A./B.
subsections are fabricated (the manifest carries no per-window subsection
labels); the engine will render them if the manifest ever provides them.

### 24 Report replaced by ditto copy of "Report Layout.docx"

User supplied `C:\YousufVNS\Report Layout\Report Layout.docx` and asked for the
generated report to be a **ditto copy**: same headings, image grids, sentences
under the headings, with blanks filled from the session data. §23's IEEE style
was scrapped in favour of reproducing this template.

Decoded the .docx (unzipped + read document.xml/numbering.xml/rels):
- **Page**: A4 (595.3 × 841.9 pt), margins 1.25" sides / 1" top+bottom,
  Times New Roman (base-14 Times used), text width 415.3 pt.
- **Cover (page 1, hard break after)**: "Visison Navigation Analysis Report"
  20pt bold centred, "Image ID: <session>" 16pt bold centred, "Date: <date>"
  14pt bold centred — verbatim from the template (incl. the template's
  "Visison" spelling).
- **9 numbered headings** (1. Input Image … 9. Scene Description) via
  numId "12" → decimal "%1.", 14pt bold; intro sentence 11pt; "Figure N: …"
  captions centred 11pt under each image; underlines kept where the template
  has them (the "captured on <date>, at <time>" intro + the two NavCam camera
  captions).
- **Figure-grid shapes** per section: Input/Relative Elevation/Occupancy
  Grid/Safe Path = stacked full-width figures; Preprocessing = two
  side-by-side pairs + full-width rectified; Obstacle Detection & Distances =
  two side-by-side pairs; Visual Odometry = one pair + full-width
  localization; Scene Description = no figures. Figure numbers run 1..25.
- **Property tables**: bold centred Parameter/Value header, data cells
  centred (QA cells left-aligned), single 0.5 pt black grid, no header fill;
  the first four sections keep the reference's two trailing empty rows.
  Table-intro sentences ("The image properties are as follows:", etc.) come
  from `TABLE_INTROS` when the manifest section has no `text`.
- Removed IEEE leftovers: title/abstract block, Roman headings, two columns,
  figure/table frames, page-number footer.

Rewrote `scripts/pipeline/report.py` layout engine (PdfBuilder + image
decoders unchanged; PdfBuilder.text gained an `underline` flag). Verified with
a manifest mirroring `generateFullReport` from real session data →
**12 pages, 25 figures, 9 tables**; `.py` and rebuilt `scripts/bin/report.exe`
produce identical bytes (356649). Sample:
`15_Report/session_2026-09-15T05-45-52-432Z/Report_Layout_Sample.pdf`. The
electron side needs NO change — `generateFullReport` already feeds headings,
intro sentences, captions and Property/QA tables.

### Verified (all of §22)
- `npm run build` passes (1787 modules). ESLint = 10 pre-existing-only
  errors (all `set-state-in-effect`; the 2 `preserve-manual-memoization` on
  `tabItems`/`windowItems` gone with the memo removal).
- Dev check: `.\start-dev.ps1` was already up from §21 review; the app is
  running on :5173. Verify tabs show no bottom-right exe buttons, the ▶ on
  each window still runs + shows the console modal, Telemetry's Refresh Logs
  box shows TC1–3 / TM1–3 that hide/show rows 1–3, and the Data sidebar lists
  every tab's window checkboxes permanently under each heading.


