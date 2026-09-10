// electron/main.cjs
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { ScriptRunner } = require("./scriptRunner.cjs");
const { runReportEngine } = require("./reportEngine.cjs");

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"]);

// Two separate folders, two separate roles:
//   <root>/02_Raw_Image/*                      -> flat pool of Left/Right images to browse
//                                                  (this is what's watched for the status dot)
//   <root>/03_Input_Image/<session>/Left.jpg    -> where Run Algorithms copies the chosen
//   <root>/03_Input_Image/<session>/LR.json...     pair to, and where the NavCam panel +
//                                                  Property fields read the latest capture from
const RAW_IMAGE_DIR = "02_Raw_Image";
const INPUT_IMAGE_DIR = "03_Input_Image";
const PREPROCESSED_DIR = "04_Preprocessed";
const OBSTACLE_DETECTION_DIR = "05_Obstacle.Detection";
const OCCUPANCY_GRID_DIR = "07_Occupancy_Grid";
const DISTANCE_MAP_DIR = "06_Distance_Map";
const PRED_SAFE_PATH_DIR = "08_Pred_Safe_Path";
const ROVER_HEALTH_DIR = "13_Rover_Health_Status";
const SCENE_ANALYSIS_DIR = "14_Scene_Analysis_Report";
const NAVIGATION_DIR = "09_Navigation";
const ROS_SIMULATION_DIR = "10_ROS_Simulation";
const TELECOMMAND_DIR = "11_Telecommand_Data"; // ASSUMPTION: full name wasn't visible in the folder-tree screenshot (shown truncated as "11_Telecommand_D...") — rename this constant if the real folder is named differently.
const TELEMETRY_DIR = "12_Telemetry_Data";
// <root>/15_Report/<session>/<Tab>_Report_<timestamp>.pdf — written by the
// "Generate Report" button on every tab that has one (Obs. Det., Safe Path,
// Dist. Map, Data, Scene Analysis). One session subfolder per input image
// session, matching 03_Input_Image's session naming; see generateReport().
const REPORT_DIR = "15_Report";
// <root>/16_Output/<session>/<Window Label>/<image + properties.json> —
// written by the "Share" button on every tab. One subfolder per checked
// panel/window, nested inside a session folder that matches the same
// session naming used everywhere else (03_Input_Image, 15_Report, ...);
// see shareWindows() below.
const OUTPUT_DIR = "16_Output";
// A small on-disk registry, one line per custom-screen window that's ever
// been created — <root>/.vns_custom_windows.json. This is what lets
// runAlgorithms() (below) recreate every known window's folder inside a
// BRAND NEW session the moment it's created, instead of waiting for the
// renderer to visit that screen first.
const CUSTOM_WINDOWS_REGISTRY_FILE = ".vns_custom_windows.json";
const WATCH_KEY = "raw-image";

// Every one of these gets created as an empty subfolder INSIDE each new
// session folder (03_Input_Image/<session>/<name>) the moment Run
// Algorithms is clicked — see runAlgorithms() below. Of these, the reading
// logic below treats 04-10 as session-scoped (only this session's own
// nested copy is ever read, never another session's — see stageSubdir()).
// 11_Telecommand_Data, 12_Telemetry_Data, and 13_Rover_Health_Status keep
// being read from their original top-level location, unchanged — they were
// already documented as ongoing/continuous data rather than per-run output,
// so nesting them is just for structural completeness. 14_Scene_Analysis_Report
// is also nested for completeness but still read from (or written to) its
// top-level location for now. Output is deliberately NOT created here —
// no session-nested Output folder should be auto-created on Run Algorithms.
const SESSION_SUBFOLDERS = [
  PREPROCESSED_DIR,
  OBSTACLE_DETECTION_DIR,
  DISTANCE_MAP_DIR,
  OCCUPANCY_GRID_DIR,
  PRED_SAFE_PATH_DIR,
  NAVIGATION_DIR,
  ROS_SIMULATION_DIR,
  TELECOMMAND_DIR,
  TELEMETRY_DIR,
  ROVER_HEALTH_DIR,
  SCENE_ANALYSIS_DIR,
];

let mainWindow;
let watcher = null;
let debounceTimer = null;

// Deliberately in-memory only (NOT persisted to disk via electron-store or
// anything else) — every fresh app launch must start with no workspace
// folder selected, so nothing (rover health, raw images, obstacle
// detection, etc.) can be silently read from a previous session's folder
// before the user explicitly picks one this session. It resets to null the
// moment the app process exits/restarts.
let currentRoot = null;

// The session folder name (e.g. "session_2026-08-05T..." ) created by the
// most recent Run Algorithms click, under 03_Input_Image. This is the
// SINGLE source of truth for "what session is currently active" — every
// getLatest*() reader for 04-09 below reads ONLY from the matching
// subfolder nested inside THIS session folder
// (03_Input_Image/<currentSessionName>/04_Preprocessed, etc.), never from
// any other session. Deliberately in-memory only, same lifecycle as
// currentRoot: resets to null on root change / app restart. While it's
// null (nothing run yet this launch), every current-session reader below
// returns nothing — properties/images are meant to stay empty until Run
// Algorithms has actually been clicked, not show whatever a previous
// session happened to leave behind.
let currentSessionName = null;

function getRoot() {
  return currentRoot;
}

// The active session's folder itself: 03_Input_Image/<currentSessionName>.
// Returns null if no session is active yet (nothing shows pre-run) or if
// that folder has somehow been removed from disk.
function getActiveSessionDir() {
  if (!currentSessionName) return null;
  const dir = inputImageDir();
  if (!dir) return null;
  const full = path.join(dir, currentSessionName);
  return fs.existsSync(full) ? full : null;
}

// The active session's nested subfolder for one pipeline stage, e.g.
// stageSubdir(PREPROCESSED_DIR) -> 03_Input_Image/<session>/04_Preprocessed.
// Returns null if there's no active session, or that stage's output hasn't
// been written for this session yet — callers should treat that as "no
// image yet", never fall back to a different session.
function stageSubdir(name) {
  const sessionDir = getActiveSessionDir();
  if (!sessionDir) return null;
  const full = path.join(sessionDir, name);
  return fs.existsSync(full) ? full : null;
}

// Tolerates the user picking the target folder itself in the folder dialog
// instead of its parent, so paths never silently point somewhere that
// doesn't exist.
function resolveDirFor(dirName, root) {
  if (!root) return null;
  const segments = root.split(path.sep);
  const idx = segments.lastIndexOf(dirName);
  if (idx !== -1) return segments.slice(0, idx + 1).join(path.sep);
  return path.join(root, dirName);
}

function rawImageDir() {
  return resolveDirFor(RAW_IMAGE_DIR, getRoot());
}

function inputImageDir() {
  return resolveDirFor(INPUT_IMAGE_DIR, getRoot());
}

// NOTE: 04_Preprocessed / 05_Obstacle.Detection / 06_Distance_Map /
// 07_Occupancy_Grid / 08_Pred_Safe_Path / 09_Navigation no longer have their
// own top-level resolvers — they're only ever read nested inside the active
// session folder now, via stageSubdir() below.

function roverHealthDir() {
  return resolveDirFor(ROVER_HEALTH_DIR, getRoot());
}

function telemetryDir() {
  return resolveDirFor(TELEMETRY_DIR, getRoot());
}

function reportDir() {
  return resolveDirFor(REPORT_DIR, getRoot());
}

function outputDir() {
  return resolveDirFor(OUTPUT_DIR, getRoot());
}

// --- Custom-window folder registry (root/.vns_custom_windows.json) ------
// Tracks every window-name slug that's ever had a folder created for it,
// so a brand-new session folder can get all of them pre-created on the
// spot (see runAlgorithms() below) rather than only the ones whichever
// screen happens to be open right now. Reloaded whenever a workspace root
// is (re)selected; in-memory only otherwise.
let knownWindowSlugs = new Set();

function registryPath() {
  return currentRoot ? path.join(currentRoot, CUSTOM_WINDOWS_REGISTRY_FILE) : null;
}

function loadWindowRegistry() {
  knownWindowSlugs = new Set();
  const file = registryPath();
  if (!file || !fs.existsSync(file)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(parsed)) knownWindowSlugs = new Set(parsed);
  } catch (err) {
    console.error(`Could not read ${file}:`, err.message);
  }
}

function saveWindowRegistry() {
  const file = registryPath();
  if (!file) return;
  try {
    fs.writeFileSync(file, JSON.stringify([...knownWindowSlugs], null, 2));
  } catch (err) {
    console.error(`Could not write ${file}:`, err.message);
  }
}

function registerWindowSlug(slug) {
  if (!knownWindowSlugs.has(slug)) {
    knownWindowSlugs.add(slug);
    saveWindowRegistry();
  }
}

// Classifies a filename as "left", "right", or null based on naming
// conventions like: Left.jpg, left_01.png, 1L.jpg, 2R.jpg, camL.jpg ...
function classifySide(filename) {
  const base = path.basename(filename, path.extname(filename)).toLowerCase();

  if (base.includes("left")) return "left";
  if (base.includes("right")) return "right";

  if (/^\d*l$/.test(base) || /^cam[_-]?l$/.test(base)) return "left";
  if (/^\d*r$/.test(base) || /^cam[_-]?r$/.test(base)) return "right";

  return null;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Guards against handing the renderer a half-written file (still mid-copy).
// Compares file size twice, 120ms apart.
async function isFileStable(filePath) {
  try {
    const size1 = fs.statSync(filePath).size;
    if (size1 === 0) return false;
    await wait(120);
    const size2 = fs.statSync(filePath).size;
    return size1 === size2;
  } catch {
    return false;
  }
}

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

// IMPORTANT: we hand back base64 data URLs, not file:// URLs. Chromium
// blocks file:// resource loads from pages served over http://localhost
// (which is how the Vite dev server serves the renderer), so
// <img src="file:///C:/..."> can silently fail there even when the path
// itself is perfectly correct. data: URLs aren't subject to that
// restriction and work the same in dev and in a packaged production build.
async function toDataUrl(fullPath) {
  if (!(await isFileStable(fullPath))) return null;
  const ext = path.extname(fullPath).toLowerCase();

  // Browsers cannot render TIFF through <img> at all, regardless of how
  // it's loaded (file://, data:, doesn't matter) — convert to PNG first.
  if (ext === ".tif" || ext === ".tiff") {
    try {
      const sharp = require("sharp");
      const pngBuffer = await sharp(fullPath).png().toBuffer();
      return `data:image/png;base64,${pngBuffer.toString("base64")}`;
    } catch (err) {
      console.error(`Could not convert TIFF ${fullPath} (is the 'sharp' dependency installed?):`, err.message);
      return null;
    }
  }

  const mime = MIME_BY_EXT[ext] || "application/octet-stream";
  const buffer = fs.readFileSync(fullPath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

// Cheap existence check (no data-URL conversion) used right after a folder
// is loaded, so the status dot can reflect "there's already an image
// sitting in 02_Raw_Image" immediately, instead of waiting for the next
// filesystem change event.
function rawDirHasImages() {
  const dir = rawImageDir();
  if (!dir || !fs.existsSync(dir)) return false;
  try {
    return fs.readdirSync(dir).some((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()));
  } catch (err) {
    console.error(`Could not read ${dir}:`, err.message);
    return false;
  }
}

// Reads 02_Raw_Image (flat — no subfolders) and splits everything into
// left/right lists, each item carrying the real path (for Run Algorithms
// to copy from) and a base64 data URL (for display).
async function listRawImages() {
  const dir = rawImageDir();
  if (!dir || !fs.existsSync(dir)) return { left: [], right: [] };

  const files = fs
    .readdirSync(dir)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .map((f) => {
      const full = path.join(dir, f);
      return { name: f, path: full, mtime: fs.statSync(full).mtimeMs, side: classifySide(f) };
    })
    .sort((a, b) => a.mtime - b.mtime); // oldest -> newest, matches nav-arrow order

  const toEntry = async (f) => ({ name: f.name, path: f.path, url: await toDataUrl(f.path) });

  const left = await Promise.all(files.filter((f) => f.side === "left").map(toEntry));
  const right = await Promise.all(files.filter((f) => f.side === "right").map(toEntry));

  return {
    left: left.filter((f) => f.url),
    right: right.filter((f) => f.url),
  };
}

// Reads any arbitrary folder (not one of the fixed pipeline-stage dirs) and
// returns its images as base64 data URLs. Used by custom ("+ New Screen")
// windows, whose folder path is chosen ad hoc by the user rather than being
// one of the fixed 02_Raw_Image/03_Input_Image/etc. locations.
async function listImagesInFolder(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) return [];

  let stat;
  try {
    stat = fs.statSync(folderPath);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) return [];

  const files = fs
    .readdirSync(folderPath)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .map((f) => {
      const full = path.join(folderPath, f);
      return { name: f, path: full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => a.mtime - b.mtime);

  const entries = await Promise.all(
    files.map(async (f) => {
      const stat = fs.statSync(f.path);
      return {
        name: f.name,
        path: f.path,
        url: await toDataUrl(f.path),
        size: stat.size,
        mtime: stat.mtimeMs,
      };
    })
  );
  return entries.filter((f) => f.url);
}

// --- Custom-screen windows: automatic (no more "Select folder") folders --
// Every custom-screen window gets TWO real folders on disk, both created
// the moment the window is added and kept in lockstep with its name — NOT
// nested under a screen/tab folder, just a plain sibling of 02_Raw_Image,
// 03_Input_Image, etc.:
//   <root>/<WindowSlug>                             (permanent — survives
//     across sessions/app restarts, this is the window's "home")
//   <root>/03_Input_Image/<currentSession>/<WindowSlug>  (mirrors whatever
//     the active capture session is, so "current session images" just have
//     to be dropped in here to show up in the window — null if no session
//     has been run yet this launch)

// Creates (if missing) and returns both folders for one window. Called on
// window creation, on every screen visit/reload (so the session folder
// keeps tracking whichever session is currently active), and after a
// rename (see renameWindowFolders() below, which calls this once the move
// is done). Returns { error: "no-root" } if no workspace folder is loaded.
function ensureWindowFolders(windowSlug) {
  if (!currentRoot) return { error: "no-root" };

  const persistentPath = path.join(currentRoot, windowSlug);
  fs.mkdirSync(persistentPath, { recursive: true });
  registerWindowSlug(windowSlug);

  let sessionPath = null;
  const sessionDir = getActiveSessionDir();
  if (sessionDir) {
    sessionPath = path.join(sessionDir, windowSlug);
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  return { persistentPath, sessionPath };
}

// Renaming a window renames its folder(s) to match — never leaves an
// orphaned old-name folder behind. Moves whichever of the persistent/
// session folders already exist under the old name, then re-runs
// ensureWindowFolders() under the new name so anything still missing
// (e.g. no session was active yet) gets created fresh.
function renameWindowFolders(oldWindowSlug, newWindowSlug) {
  if (!currentRoot) return { error: "no-root" };
  if (oldWindowSlug === newWindowSlug) return ensureWindowFolders(newWindowSlug);

  const oldP = path.join(currentRoot, oldWindowSlug);
  const newP = path.join(currentRoot, newWindowSlug);
  if (fs.existsSync(oldP) && !fs.existsSync(newP)) {
    fs.renameSync(oldP, newP);
  }
  if (knownWindowSlugs.has(oldWindowSlug)) {
    knownWindowSlugs.delete(oldWindowSlug);
    saveWindowRegistry();
  }

  const sessionDir = getActiveSessionDir();
  if (sessionDir) {
    const oldS = path.join(sessionDir, oldWindowSlug);
    const newS = path.join(sessionDir, newWindowSlug);
    if (fs.existsSync(oldS) && !fs.existsSync(newS)) {
      fs.renameSync(oldS, newS);
    }
  }

  return ensureWindowFolders(newWindowSlug);
}

// Like readSidecarProperties() but doesn't assume a fixed base name (a
// custom window's folder could hold any filename) — scans for the first
// .json, then .txt, then .csv file it finds and parses that.
function readAnyProperties(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) return null;
  let files;
  try {
    files = fs.readdirSync(folderPath);
  } catch {
    return null;
  }
  const findByExt = (ext) => files.find((f) => path.extname(f).toLowerCase() === ext);

  const tryParse = (file, parser) => {
    if (!file) return null;
    try {
      return parser(fs.readFileSync(path.join(folderPath, file), "utf8"));
    } catch (err) {
      console.error(`Could not parse ${file}:`, err.message);
      return null;
    }
  };

  return (
    tryParse(findByExt(".json"), parsePropertiesJson) ||
    tryParse(findByExt(".txt"), parsePropertiesTxt) ||
    tryParse(findByExt(".csv"), parsePropertiesCsv) ||
    null
  );
}

// Merges a window's persistent + session folder into one image list
// (session images — the "current" ones — first) and reads whichever
// folder has a JSON/txt/csv sidecar for the Properties sidebar (session
// folder wins on conflicts, same "current session" instinct as the rest
// of the app). Either path may be null/missing; both are tolerated.
async function listWindowFolderContents(persistentPath, sessionPath) {
  const [sessionImages, persistentImages] = await Promise.all([
    listImagesInFolder(sessionPath),
    listImagesInFolder(persistentPath),
  ]);
  const images = [...sessionImages, ...persistentImages];
  const properties = readAnyProperties(sessionPath) || readAnyProperties(persistentPath) || [];
  return { images, properties };
}

// Copies the currently-selected Left/Right raw images into a brand-new
// timestamped session folder under 03_Input_Image, as Left/Right.<ext>, and
// copies along the LR.json template from 03_Input_Image/img_280326_001 —
// this is what the Property_01..05 fields read.
function runAlgorithms(leftPath, rightPath) {
  const dir = inputImageDir();
  if (!dir) throw new Error("No workspace folder selected.");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sessionName = `session_${stamp}`;
  const sessionDir = path.join(dir, sessionName);
  fs.mkdirSync(sessionDir, { recursive: true });

  if (leftPath) fs.copyFileSync(leftPath, path.join(sessionDir, "Left" + path.extname(leftPath)));
  if (rightPath) fs.copyFileSync(rightPath, path.join(sessionDir, "Right" + path.extname(rightPath)));

  // The real LR.json is a fixed template that lives in
  // 03_Input_Image/img_280326_001, not alongside the raw image — copy it
  // into every new session folder from there.
  const sourceSidecar = path.join(dir, "img_280326_001", "LR.json");
  if (fs.existsSync(sourceSidecar)) {
    fs.copyFileSync(sourceSidecar, path.join(sessionDir, "LR.json"));
  }

  // Create every pipeline-stage folder NESTED inside this session folder
  // (03_Input_Image/<session>/04_Preprocessed, .../05_Obstacle.Detection,
  // etc.) — one self-contained tree per run, so there's never any question
  // of which session a downstream image belongs to.
  SESSION_SUBFOLDERS.forEach((name) => {
    const stageSessionDir = path.join(sessionDir, name);
    if (!fs.existsSync(stageSessionDir)) fs.mkdirSync(stageSessionDir, { recursive: true });
  });

  // Also pre-create every known custom-screen window's folder inside this
  // brand-new session — so as soon as Run Algorithms is clicked, each
  // window already has somewhere for "current session images" to land,
  // without needing that window's screen to be opened first.
  knownWindowSlugs.forEach((slug) => {
    const winSessionDir = path.join(sessionDir, slug);
    if (!fs.existsSync(winSessionDir)) fs.mkdirSync(winSessionDir, { recursive: true });
  });

  // From this point on, every screen reads THIS session only — until the
  // next Run Algorithms click (or app restart) replaces it.
  currentSessionName = sessionName;

  return { sessionFolder: sessionName };
}

// --- 03_Input_Image: latest session capture + sidecar properties -------
// (Used by the NavCam panel and the Property_01..04 fields — unrelated to
// the raw-image browsing above.)

function getLatestSessionDir() {
  return getActiveSessionDir();
}

async function findImageInSession(sessionDir, prefix) {
  if (!sessionDir) return null;

  const candidates = fs
    .readdirSync(sessionDir)
    .filter((f) => f.toLowerCase().includes(prefix) && IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .map((f) => {
      const full = path.join(sessionDir, f);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  if (!candidates.length) return null;
  return toDataUrl(candidates[0].full);
}

async function getLatestCapture() {
  const sessionDir = getLatestSessionDir();
  return {
    sessionFolder: sessionDir ? path.basename(sessionDir) : null,
    left: await findImageInSession(sessionDir, "left"),
    right: await findImageInSession(sessionDir, "right"),
  };
}

function parsePropertiesJson(content) {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => {
      const label = entry && Object.keys(entry)[0];
      if (!label) return null;
      return { label: label.trim(), value: stripDegreeArtifacts(String(entry[label] ?? "").trim()) };
    })
    .filter(Boolean);
}

function parsePropertiesTxt(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return null;
      return { label: line.slice(0, idx).trim(), value: stripDegreeArtifacts(line.slice(idx + 1).trim()) };
    })
    .filter(Boolean);
}

function parsePropertiesCsv(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(",");
      if (idx === -1) return null;
      return { label: line.slice(0, idx).trim(), value: stripDegreeArtifacts(line.slice(idx + 1).trim()) };
    })
    .filter(Boolean);
}

function readSidecarProperties(sessionDir, baseName = "LR") {
  if (!sessionDir) return [];

  const tryRead = (filename, parser) => {
    const full = path.join(sessionDir, filename);
    if (!fs.existsSync(full)) return null;
    try {
      return parser(fs.readFileSync(full, "utf8"));
    } catch (err) {
      console.error(`Could not parse ${full}:`, err.message);
      return null;
    }
  };

  return (
    tryRead(`${baseName}.json`, parsePropertiesJson) ||
    tryRead(`${baseName}.txt`, parsePropertiesTxt) ||
    tryRead(`${baseName}.csv`, parsePropertiesCsv) ||
    []
  );
}

function getLatestProperties() {
  return readSidecarProperties(getLatestSessionDir());
}

// All session subfolders under a base dir, oldest first — used for
// historical logs (the "Img No. 1, 2, 3..." style tables on the Data
// screen) and for finding the session that chronologically precedes the
// active one (see getNavigationImages' "Last" image below).
function listAllSessionDirs(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = path.join(dir, entry.name);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => a.mtime - b.mtime)
    .map((d) => d.full);
}

// One row per 03_Input_Image session (not just the latest) — feeds the
// Data screen's "Parameter Table - L/R/PP Image" log.
function getInputImageLog() {
  return listAllSessionDirs(inputImageDir())
    .map((sessionDir) => {
      const entries = readSidecarProperties(sessionDir);
      if (!entries.length) return null;
      return {
        path: entries[0]?.value || "",
        size: entries[1]?.value || "",
        resolution: entries[2]?.value || "",
        timestamp: entries[3]?.value || "",
        p05: entries[4]?.value || "",
      };
    })
    .filter(Boolean);
}

// --- 04_Preprocessed: current session's preprocessed images ------------
// Nested inside the session folder now (03_Input_Image/<session>/04_Preprocessed)
// — created empty by runAlgorithms() above, populated by whatever writes
// the actual preprocessing output. Reads ONLY that folder: nothing shows
// until this session's output is written there, and nothing from any other
// session is ever shown alongside it.

function getLatestPreprocessedDir() {
  return stageSubdir(PREPROCESSED_DIR);
}

// Returns every image file in that folder (any name — not just Left/Right),
// sorted by filename so frame order is stable and predictable.
async function listPreprocessedImages() {
  const sessionDir = getLatestPreprocessedDir();
  if (!sessionDir) return [];

  const files = fs
    .readdirSync(sessionDir)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  const entries = await Promise.all(
    files.map(async (f) => ({ name: f, url: await toDataUrl(path.join(sessionDir, f)) }))
  );
  return entries.filter((e) => e.url);
}

// --- 05_Obstacle.Detection: mask/bbox images + per-obstacle properties -
// Same "latest touched subfolder" rule as 04_Preprocessed above.

function getLatestObstacleDetectionDir() {
  return stageSubdir(OBSTACLE_DETECTION_DIR);
}

// Finds the image in `dir` whose filename contains `keyword`
// (case-insensitive) — used to pick out Segmentation.png / Bbox.png
// without hardcoding exact filenames. If more than one file matches (e.g.
// an algorithm re-run drops a newer file in without removing the old one),
// picks whichever has the newest mtime, so Refresh always surfaces the most
// recent output and never an older leftover.
async function findImageByKeyword(dir, keyword) {
  if (!dir) return null;
  const newest = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().includes(keyword) && IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .map((f) => {
      const full = path.join(dir, f);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (!newest) return null;
  return toDataUrl(newest.full);
}

// Same idea, but requires ALL of the given keywords to appear in the
// (normalized — punctuation/underscores stripped) filename. Needed because
// e.g. "Obs_distances.jpg" and "DistanceMap.png" both contain "distance" —
// requiring ["obs", "distance"] vs ["distance", "map"] tells them apart
// regardless of underscores/casing/spacing in the actual filename. Same
// newest-mtime-wins tie-break as findImageByKeyword above.
async function findImageByKeywords(dir, keywords) {
  if (!dir) return null;
  const normKeywords = keywords.map(normalizeKey);
  const newest = fs
    .readdirSync(dir)
    .filter((f) => {
      if (!IMAGE_EXT.has(path.extname(f).toLowerCase())) return false;
      const normName = normalizeKey(path.basename(f, path.extname(f)));
      return normKeywords.every((k) => normName.includes(k));
    })
    .map((f) => {
      const full = path.join(dir, f);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (!newest) return null;
  return toDataUrl(newest.full);
}

// Obstacle_details.{json,csv,txt} use full multi-field records per
// obstacle (unlike LR.*'s one-label-per-line format), and the field names
// have inconsistent punctuation/casing ("Obs. ID", "confidence",
// "Property_05"...) — normalize by stripping everything but letters/digits
// before matching, so small naming variations don't break the mapping.
function normalizeKey(k) {
  return k.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Coordinate-style values (e.g. "23.473° E") read from JSON/CSV/TXT files
// have been showing up as "23.473? E" or "23.473? E" in the UI — the
// degree sign is getting mangled somewhere in the save/read/encoding
// chain before it ever reaches this app. Rather than chase down which tool
// wrote the file with which encoding, we just strip the degree sign (and
// its common mis-decoded stand-ins — the UTF-8 "Â°" artifact, the Unicode
// replacement character, and a bare "?" sitting directly between a digit
// and a coordinate letter) wherever text is read from disk, per explicit
// request: don't display a degree sign at all, garbled or not.
function stripDegreeArtifacts(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/Â°/g, "")
    .replace(/°/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/(\d)\s*\?\s*(?=[NSEW]\b)/g, "$1 ");
}

function normalizeObstacleRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lookup = {};
  for (const [k, v] of Object.entries(raw)) lookup[normalizeKey(k)] = v;

  const id = lookup.obsid ?? lookup.id;
  if (id === undefined || id === "") return null;

  return {
    id: Number(id),
    conf: lookup.confidence ?? lookup.detconf ?? lookup.conf ?? "",
    type: lookup.type ?? lookup.obstype ?? "",
    height: lookup.height ?? lookup.obsheight ?? "",
    p05: lookup.property05 ?? lookup.p05 ?? "",
  };
}

function parseObstacleJson(content) {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeObstacleRecord).filter(Boolean);
}

function parseObstacleCsv(content) {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines
    .slice(1)
    .map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const obj = {};
      headers.forEach((h, i) => (obj[h] = cells[i]));
      return normalizeObstacleRecord(obj);
    })
    .filter(Boolean);
}

// Best-effort guess at the .txt shape: blank-line-separated blocks, each a
// set of "Label : value" lines (same convention as LR.txt, just repeated
// once per obstacle). If your actual Obstacle_details.txt looks different,
// this parser will just find nothing and the JSON/CSV versions take over —
// send an example and it can be adjusted.
function parseObstacleTxt(content) {
  const blocks = content.split(/\r?\n\s*\r?\n/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const obj = {};
      block.split(/\r?\n/).forEach((line) => {
        const idx = line.indexOf(":");
        if (idx === -1) return;
        obj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      });
      return normalizeObstacleRecord(obj);
    })
    .filter(Boolean);
}

function readObstacleRecords(sessionDir) {
  if (!sessionDir) return [];

  const tryRead = (filename, parser) => {
    const full = path.join(sessionDir, filename);
    if (!fs.existsSync(full)) return null;
    try {
      const records = parser(fs.readFileSync(full, "utf8"));
      return records.length ? records : null;
    } catch (err) {
      console.error(`Could not parse ${full}:`, err.message);
      return null;
    }
  };

  return (
    tryRead("Obstacle_details.json", parseObstacleJson) ||
    tryRead("Obstacle_details.csv", parseObstacleCsv) ||
    tryRead("Obstacle_details.txt", parseObstacleTxt) ||
    []
  );
}

async function getLatestObstacleDetection() {
  const sessionDir = getLatestObstacleDetectionDir();
  return {
    mask: await findImageByKeyword(sessionDir, "segmentation"),
    bboxes: await findImageByKeyword(sessionDir, "bbox"),
    obstacles: readObstacleRecords(sessionDir),
  };
}

// --- 05_Obstacle.Detection: run a bundled Python detection script ---------
// The "Run Detection" button on the Obstacle Detection tab calls this. It
// launches a Python script (later a .exe) from <app>/scripts/ via the
// ScriptRunner class (electron/scriptRunner.cjs) -- that file is the ONE
// place to add/swap scripts; no line-hunting in this file needed.
// It runs inside the active session's 05_Obstacle.Detection folder (creating
// it on demand) so any files the script writes land in the right place for
// the UI to pick back up on refresh.
//
// The renderer only sends which side (left/right) to run rather than an image
// path — the real input image path is resolved here from the active session's
// 03_Input_Image folder, so the Python script always gets a usable file path
// (not a base64 data URL).
const scriptRunner = new ScriptRunner({ appPath: app.getAppPath() });

function findSessionImagePath(sessionDir, prefix) {
  if (!sessionDir) return null;
  const newest = fs
    .readdirSync(sessionDir)
    .filter((f) => f.toLowerCase().includes(prefix) && IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .map((f) => {
      const full = path.join(sessionDir, f);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)[0];
  return newest ? newest.full : null;
}

// --- Generic pipeline-stage runner ---------------------------------------
// Every tab's "Run" button (Obs. Det. included) calls this with its own
// action id and stage folder. It resolves the active session's input image,
// calls ScriptRunner, and lets the script (Python or .exe) write into that
// stage's folder. One place for all stages keeps the wiring consistent.
// Returns { ...scriptResult, outputDir, inputImage }.
async function runPipelineStage(actionId, stageDir, inputHint) {
  if (!currentRoot) return { error: "no-root" };

  const outDir = stageDir;
  if (outDir) fs.mkdirSync(outDir, { recursive: true });

  let imagePath = null;
  const sideHint =
    typeof inputHint === "string" && inputHint.toLowerCase().startsWith("data:")
      ? null
      : inputHint;
  if (sideHint && path.isAbsolute(sideHint)) {
    imagePath = sideHint;
  } else {
    const sessionDir = getLatestSessionDir();
    const preferred = sideHint === "right" || sideHint === "left" ? sideHint : null;
    imagePath =
      (preferred && findSessionImagePath(sessionDir, preferred)) ||
      findSessionImagePath(sessionDir, "left") ||
      findSessionImagePath(sessionDir, "right");
  }

  const args = [];
  if (imagePath) args.push(imagePath);
  if (outDir) args.push(outDir);

  const result = await scriptRunner.run(actionId, args, { cwd: currentRoot, overrideDir: stageBinOverride() });
  return { ...result, outputDir: outDir, inputImage: imagePath };
}

// Where production pipeline .exe's can be dropped to override the bundled
// placeholders after deployment: <workspace root>/bin/<stage>.exe.
function stageBinOverride() {
  return currentRoot ? path.join(currentRoot, "bin") : null;
}

// Continuation log helper used by telemetry/telecommand readers below.
function normalizeCmdRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lookup = {};
  for (const [k, v] of Object.entries(raw)) lookup[normalizeKey(k)] = v;

  const imgNo = lookup.imgno ?? lookup.imgno_ ?? "";
  const module_ = lookup.module ?? "";
  const size = lookup.size ?? "";
  const value = lookup.value ?? "";
  const timestamp = lookup.timestamp ?? "";
  const status = lookup.status ?? "";

  // Drop the blank trailing template slot (like the reference Telemetry.json
  // has a final all-null row that should not show in the UI).
  if (imgNo === "" && module_ === "" && size === "" && value === "" && timestamp === "" && status === "") {
    return null;
  }

  return { imgNo: String(imgNo), module: module_, size: size, value: value, timestamp: String(timestamp ?? ""), status: String(status ?? "") };
}

function parseCmdJson(content) {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeCmdRecord).filter(Boolean);
}

function parseCmdCsv(content) {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines
    .slice(1)
    .map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const obj = {};
      headers.forEach((h, i) => (obj[h] = cells[i]));
      return normalizeCmdRecord(obj);
    })
    .filter(Boolean);
}

// Reads the ongoing telemetry / telecommand log from either
// 11_Telecommand_Data or 12_Telemetry_Data (once a matching file exists).
// dirName is stageSubdir() OR the top-level resolveDirFor helper already
// points at the folder; we just pass an explicit path.
function readTelemetryLogFromDir(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const tryRead = (filename, parser) => {
    const full = path.join(dir, filename);
    if (!fs.existsSync(full)) return null;
    try {
      const records = parser(fs.readFileSync(full, "utf8"));
      return records.length ? records : null;
    } catch (err) {
      console.error(`Could not parse ${full}:`, err.message);
      return null;
    }
  };
  return (
    tryRead("Telemetry.json", parseCmdJson) ||
    tryRead("Telemetry.csv", parseCmdCsv) ||
    []
  );
}

function getTelecommandLog() {
  return readTelemetryLogFromDir(stageSubdir(TELECOMMAND_DIR));
}

// --- 06_Distance_Map: 4 images + per-obstacle distance table -----------
// Same "latest touched subfolder" rule as 04_Preprocessed/05_Obstacle.Detection.
//
// Obstacle_distances.* is assumed to be one record per obstacle (like
// Obstacle_details.json), e.g. [{ "Obs. ID": 1, "Distance": "3.00 m" }, ...].
// If it's actually shaped like Grid.json's pivoted table instead (rows =
// properties, columns = obstacle IDs), the fallback below un-pivots it the
// same way — so either shape works without needing to guess right upfront.

function getLatestDistanceMapDir() {
  return stageSubdir(DISTANCE_MAP_DIR);
}

function normalizeDistanceRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lookup = {};
  for (const [k, v] of Object.entries(raw)) lookup[normalizeKey(k)] = v;

  const id = lookup.obsid ?? lookup.id;
  if (id === undefined || id === null || id === "") return null;

  return {
    id: Number(id),
    imgNo: lookup.imgno ?? "",
    type: lookup.type ?? "",
    height: lookup.height ?? "",
    width: lookup.width ?? "",
    distance: lookup.distance ?? lookup.obsdistance ?? "",
  };
}

// Un-pivots a Grid.json-style table (see parseGridPropertyRows above) down
// to just { id, distance } pairs, for when Obstacle_distances.json turns
// out to use that same pivoted shape instead of one-record-per-obstacle.
function pivotDistanceRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const keys = Object.keys(rows[0]);
  const labelKey = keys.find((k) => Number.isNaN(Number(k.trim()))) ?? keys[0];
  if (labelKey === undefined) return [];

  const byId = {};
  rows.forEach((row) => {
    const propertyName = row[labelKey];
    if (propertyName === undefined || propertyName === null || propertyName === "") return;
    if (!normalizeKey(String(propertyName)).includes("distance")) return;

    Object.keys(row).forEach((key) => {
      if (key === labelKey) return;
      const id = key.trim();
      if (!id) return;
      byId[id] = { id: Number(id) || id, distance: row[key] };
    });
  });

  return Object.values(byId);
}

function parseDistanceJson(content) {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) return [];

  const direct = parsed.map(normalizeDistanceRecord).filter(Boolean);
  if (direct.length) return direct;

  return pivotDistanceRows(parsed); // fall back to the pivoted shape
}

function parseDistanceCsv(content) {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cells[i]));
    return obj;
  });

  const direct = rows.map(normalizeDistanceRecord).filter(Boolean);
  if (direct.length) return direct;

  return pivotDistanceRows(rows);
}

function parseDistanceTxt(content) {
  const blocks = content.split(/\r?\n\s*\r?\n/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const obj = {};
      block.split(/\r?\n/).forEach((line) => {
        const idx = line.indexOf(":");
        if (idx === -1) return;
        obj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      });
      return normalizeDistanceRecord(obj);
    })
    .filter(Boolean);
}

function readDistanceRecords(sessionDir) {
  if (!sessionDir) return [];

  const tryRead = (filename, parser) => {
    const full = path.join(sessionDir, filename);
    if (!fs.existsSync(full)) return null;
    try {
      const records = parser(fs.readFileSync(full, "utf8"));
      return records.length ? records : null;
    } catch (err) {
      console.error(`Could not parse ${full}:`, err.message);
      return null;
    }
  };

  return (
    tryRead("Obstacle_distances.json", parseDistanceJson) ||
    tryRead("Obstacle_distances.csv", parseDistanceCsv) ||
    tryRead("Obstacle_distances.txt", parseDistanceTxt) ||
    []
  );
}

async function getLatestDistanceMap() {
  const sessionDir = getLatestDistanceMapDir();
  return {
    obstacleDistancesImg: await findImageByKeywords(sessionDir, ["obs", "distance"]),
    distanceMapImg: await findImageByKeywords(sessionDir, ["distance", "map"]),
    view3dImg: await findImageByKeywords(sessionDir, ["3d"]),
    elevationImg: await findImageByKeywords(sessionDir, ["elevation"]),
    distances: readDistanceRecords(sessionDir),
  };
}

// --- 07_Occupancy_Grid: Grid.png + Grid.json's per-obstacle table ------
// Same "latest touched subfolder" rule as 04_Preprocessed/05_Obstacle.Detection.
//
// Grid.json isn't shaped like Obstacle_details.json (one record per
// obstacle) — it's a pivoted property table: every row has the same two
// keys, the first key's VALUE names the property ("Obs. Type ", "Coordinates
// - x ", ...) and every other key is itself an obstacle ID whose value is
// that obstacle's value for the row's property, e.g.:
//   [{ "Obs. ID ": "Obs. Type ", "1": "Big Rock" },
//    { "Obs. ID ": "Coordinates - x ", "1": "2m" }, ...]
// parseGridPropertyRows() un-pivots that back into the familiar
// { id, type, x, z, width } shape used everywhere else (matches OCC_OBSTACLES).
function getLatestOccupancyGridDir() {
  return stageSubdir(OCCUPANCY_GRID_DIR);
}

function parseGridPropertyRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const keys = Object.keys(rows[0]);
  // The label column's key is text (e.g. "Obs. ID "); every other column's
  // key is a plain number (obstacle IDs like "1", "2"). JS silently
  // reorders integer-looking keys to the front of Object.keys() regardless
  // of their order in the JSON, so keys[0] isn't reliably the label column
  // — find the one that ISN'T a number instead.
  const labelKey = keys.find((k) => Number.isNaN(Number(k.trim()))) ?? keys[0];
  if (labelKey === undefined) return [];

  const byId = {};
  rows.forEach((row) => {
    const propertyName = row[labelKey];
    if (propertyName === undefined || propertyName === null || propertyName === "") return;
    const normalized = normalizeKey(String(propertyName));

    Object.keys(row).forEach((key) => {
      if (key === labelKey) return;
      const id = key.trim();
      if (!id) return;
      if (!byId[id]) byId[id] = { id: Number(id) || id };

      const value = row[key];
      if (normalized.includes("type")) byId[id].type = value;
      else if (normalized.includes("width")) byId[id].width = value;
      else if (normalized.endsWith("x")) byId[id].x = value;
      else if (normalized.endsWith("z")) byId[id].z = value;
    });
  });

  return Object.values(byId);
}

function parseGridJson(content) {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) return [];
  return parseGridPropertyRows(parsed);
}

function parseGridCsv(content) {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cells[i]));
    return obj;
  });
  return parseGridPropertyRows(rows);
}

function readGridProperties(sessionDir) {
  if (!sessionDir) return [];

  const tryRead = (filename, parser) => {
    const full = path.join(sessionDir, filename);
    if (!fs.existsSync(full)) return null;
    try {
      const records = parser(fs.readFileSync(full, "utf8"));
      return records.length ? records : null;
    } catch (err) {
      console.error(`Could not parse ${full}:`, err.message);
      return null;
    }
  };

  return tryRead("Grid.json", parseGridJson) || tryRead("Grid.csv", parseGridCsv) || [];
}

async function getLatestOccupancyGrid() {
  const sessionDir = getLatestOccupancyGridDir();
  return {
    image: await findImageByKeyword(sessionDir, "grid"),
    obstacles: readGridProperties(sessionDir),
  };
}

// --- 08_Pred_Safe_Path: SafePath.png -------------------------------------
// Same "latest touched subfolder" rule again. Only the image is wired up
// here (no Waypoints.json sample was provided, so the Waypoint properties
// panel keeps using its existing demo data for now).
function getLatestPredSafePathDir() {
  return stageSubdir(PRED_SAFE_PATH_DIR);
}

async function getLatestPredSafePath() {
  const sessionDir = getLatestPredSafePathDir();
  return {
    image: await findImageByKeyword(sessionDir, "safepath"),
  };
}

// --- 13_Rover_Health_Status: per-subsystem health/battery table --------
// Feeds the "Rover Characteristics" panel. healthstatus.json is a flat
// array of subsystem records (Subsystem/Status/%Health/%Battery Usage);
// rows with a null Subsystem are just an unfilled template slot and are
// dropped. Reuses normalizeKey() so naming variations like "%Health" vs
// "Health" don't break the mapping.
function normalizeHealthRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lookup = {};
  for (const [k, v] of Object.entries(raw)) lookup[normalizeKey(k)] = v;

  const subsystem = lookup.subsystem;
  if (subsystem === undefined || subsystem === null || subsystem === "") return null;

  return {
    subsystem: stripDegreeArtifacts(String(subsystem).trim()),
    status: stripDegreeArtifacts(String(lookup.status ?? "")),
    health: lookup.health ?? "",
    battery: lookup.batteryusage ?? lookup.battery ?? "",
  };
}

function parseRoverHealthJson(content) {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeHealthRecord).filter(Boolean);
}

// --- 14_Scene_Analysis_Report: file-drop query / response ---------------
// No PDF reading and no in-app answering here — Run Query just drops
// Query_<n>.txt into the ACTIVE session's 14_Scene_Analysis_Report folder
// (03_Input_Image/<session>/14_Scene_Analysis_Report), where <n> is a
// running count of queries asked THIS session. Whatever external process
// answers it is expected to write Response_<n>.txt (same number) back into
// that same folder; the app just polls for that file to show the report.

// 03_Input_Image/<currentSession>/14_Scene_Analysis_Report — created (empty)
// by runAlgorithms() already, but mkdir defensively here too in case a
// query is run before that ever happened.
function activeSceneAnalysisDir() {
  const sessionDir = getActiveSessionDir();
  if (!sessionDir) return null;
  const full = path.join(sessionDir, SCENE_ANALYSIS_DIR);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  return full;
}

// Next query number = 1 + the highest existing Query_<n>.txt in the
// session's folder, so numbering keeps climbing even if an earlier query
// file was deleted.
function nextSceneQueryNumber(dir) {
  const nums = fs
    .readdirSync(dir)
    .map((f) => f.match(/^Query_(\d+)\.txt$/i))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function writeSceneQuery(query) {
  const dir = activeSceneAnalysisDir();
  if (!dir) return { error: "no-session" };

  const n = nextSceneQueryNumber(dir);
  fs.writeFileSync(path.join(dir, `Query_${n}.txt`), query, "utf8");
  return { number: n };
}

// Returns { found: false } until Response_<n>.txt shows up in the same
// folder — the renderer polls this on an interval after Run Query.
function readSceneResponse(number) {
  const dir = activeSceneAnalysisDir();
  if (!dir) return { found: false };

  const file = path.join(dir, `Response_${number}.txt`);
  if (!fs.existsSync(file)) return { found: false };

  try {
    return { found: true, answer: fs.readFileSync(file, "utf8") };
  } catch (err) {
    return { found: false, error: err.message };
  }
}

// Every Query_<n>.txt paired with its matching Response_<n>.txt in the
// active session's 14_Scene_Analysis_Report folder, in ascending query
// order — feeds the full report's "9. Scene Description" table. A query
// still waiting on its response (no Response_<n>.txt yet) is skipped
// rather than shown with a blank answer.
function listSceneQA() {
  const sessionDir = getActiveSessionDir();
  if (!sessionDir) return [];
  const dir = path.join(sessionDir, SCENE_ANALYSIS_DIR);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir);
  const numbers = files
    .map((f) => f.match(/^Query_(\d+)\.txt$/i))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10))
    .sort((a, b) => a - b);

  return numbers
    .map((n) => {
      const queryFile = path.join(dir, `Query_${n}.txt`);
      const responseFile = path.join(dir, `Response_${n}.txt`);
      if (!fs.existsSync(responseFile)) return null;
      try {
        return {
          query: fs.readFileSync(queryFile, "utf8").trim(),
          response: fs.readFileSync(responseFile, "utf8").trim(),
        };
      } catch (err) {
        console.error(`Could not read scene Q&A #${n}:`, err.message);
        return null;
      }
    })
    .filter(Boolean);
}


function readRoverHealthStatus() {
  const dir = roverHealthDir();
  if (!dir || !fs.existsSync(dir)) return [];

  const match = fs.readdirSync(dir).find((f) => f.toLowerCase() === "healthstatus.json");
  if (!match) return [];

  try {
    return parseRoverHealthJson(fs.readFileSync(path.join(dir, match), "utf8"));
  } catch (err) {
    console.error(`Could not parse ${match}:`, err.message);
    return [];
  }
}

// --- 09_Navigation: Waypoints.* — per-waypoint records in the latest run
// Same one-record-per-item shape as Obstacle_details.json, just for
// waypoints instead of obstacles. ASSUMPTION (no sample file was provided
// for this one): filename "Waypoints.json/.csv/.txt" inside the latest
// session folder under 09_Navigation, each record having a Waypoint ID,
// Coord_X, Coord_Z, Property_04, Property_05. Adjust the field names in
// normalizeWaypointRecord below if the real file uses different labels.

function normalizeWaypointRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lookup = {};
  for (const [k, v] of Object.entries(raw)) lookup[normalizeKey(k)] = v;

  const id = lookup.waypointid ?? lookup.wpid ?? lookup.id;
  if (id === undefined || id === null || id === "") return null;

  return {
    id: Number(id),
    x: lookup.coordx ?? lookup.x ?? "",
    z: lookup.coordz ?? lookup.z ?? "",
    p04: stripDegreeArtifacts(String(lookup.property04 ?? lookup.p04 ?? "")),
    p05: stripDegreeArtifacts(String(lookup.property05 ?? lookup.p05 ?? "")),
  };
}

function parseWaypointsJson(content) {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeWaypointRecord).filter(Boolean);
}

function parseWaypointsCsv(content) {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines
    .slice(1)
    .map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const obj = {};
      headers.forEach((h, i) => (obj[h] = cells[i]));
      return normalizeWaypointRecord(obj);
    })
    .filter(Boolean);
}

function parseWaypointsTxt(content) {
  const blocks = content.split(/\r?\n\s*\r?\n/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const obj = {};
      block.split(/\r?\n/).forEach((line) => {
        const idx = line.indexOf(":");
        if (idx === -1) return;
        obj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      });
      return normalizeWaypointRecord(obj);
    })
    .filter(Boolean);
}

function getWaypointsLog() {
  const sessionDir = stageSubdir(NAVIGATION_DIR);
  if (!sessionDir) return [];

  const tryRead = (filename, parser) => {
    const full = path.join(sessionDir, filename);
    if (!fs.existsSync(full)) return null;
    try {
      const records = parser(fs.readFileSync(full, "utf8"));
      return records.length ? records : null;
    } catch (err) {
      console.error(`Could not parse ${full}:`, err.message);
      return null;
    }
  };

  return (
    tryRead("Waypoints.json", parseWaypointsJson) ||
    tryRead("Waypoints.csv", parseWaypointsCsv) ||
    tryRead("Waypoints.txt", parseWaypointsTxt) ||
    []
  );
}

// --- 09_Navigation: single Current/Last image + Rover_Characterization ---
// Nested per session now (03_Input_Image/<session>/09_Navigation), each
// holding exactly one real capture (any image extension, including .TIF —
// auto-converted to PNG by toDataUrl above) alongside its
// Rover_Characterization.csv/.json/.txt. "Current" = the active session's
// own 09_Navigation folder; "Last" = the same folder inside whichever
// session immediately precedes the active one, if any — never a folder
// picked by mtime alone.

// One (non-sidecar) image file in a Navigation session folder — newest by
// mtime if more than one is present, same tie-break as findImageByKeyword.
async function getNavigationImages() {
  const activeSessionDir = getActiveSessionDir();
  if (!activeSessionDir) return { current: null, last: null };

  // "Current image" = this session's own Left input image
  // (03_Input_Image/<currentSession>/Left.*).
  const current = activeSessionDir;

  // "Last image" = the Left input image from the session immediately
  // before the active one, chronologically
  // (03_Input_Image/<prevSession>/Left.*).
  const allSessions = listAllSessionDirs(inputImageDir()); // oldest -> newest
  const idx = allSessions.findIndex((s) => path.basename(s) === currentSessionName);
  const last = idx > 0 ? allSessions[idx - 1] : null;

  return {
    current: await findImageInSession(current, "left"),
    last: await findImageInSession(last, "left"),
  };
}

// ASSUMPTION (no sample file was provided for this one): Rover_Characterization.*
// uses the same label,value-per-line convention as LR.csv/.json/.txt, just
// under its own filename — 4 entries, positionally mapped to Visual Odom.
// Distance / Rover Coordinates / Property_03 / Property_04.
function getNavigationProperties() {
  const sessionDir = stageSubdir(NAVIGATION_DIR);
  const entries = readSidecarProperties(sessionDir, "Rover_Characterization");
  return {
    distance: entries[0]?.value || "",
    coords: entries[1]?.value || "",
    p03: entries[2]?.value || "",
    p04: entries[3]?.value || "",
  };
}

// --- 10_ROS_Simulation: a single video file, session-scoped like
// 04-09 above (03_Input_Image/<session>/10_ROS_Simulation) — so a video
// left over from an earlier session (or the empty folder Run Algorithms
// always creates) never shows up under a session that has no video of
// its own; "no active session" or "nothing in this session's folder yet"
// both correctly fall through to "No media loaded" in the UI. -------------
const VIDEO_EXT = new Set([".mp4", ".webm", ".ogv", ".mov"]);
const VIDEO_MIME_BY_EXT = { ".mp4": "video/mp4", ".webm": "video/webm", ".ogv": "video/ogg", ".mov": "video/quicktime" };

// NOTE: this reads the whole video into memory and base64-encodes it —
// fine for a short clip, but a large video will make this tab noticeably
// slower to open. A real production build would stream it via a custom
// protocol instead; flagging that as a known limitation of this approach.
async function getRosSimulationVideo() {
  const dir = stageSubdir(ROS_SIMULATION_DIR);
  if (!dir) return null;

  const match = fs.readdirSync(dir).find((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()));
  if (!match) return null;

  const fullPath = path.join(dir, match);
  if (!(await isFileStable(fullPath))) return null;

  const ext = path.extname(fullPath).toLowerCase();
  const mime = VIDEO_MIME_BY_EXT[ext] || "video/mp4";
  const buffer = fs.readFileSync(fullPath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

// --- 12_Telemetry_Data: Telemetry.* — ongoing distance/coordinate log ---
// ASSUMPTION (no sample file was provided for this one either): a single
// file "Telemetry.json/.csv/.txt" directly under 12_Telemetry_Data (not
// inside a session subfolder, since this is a running log rather than a
// per-capture snapshot), one row per past reading: VO - Distance Traveled,
// Lunar Coordinates (N), Lunar Coordinates (E).

function normalizeTelemetryRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lookup = {};
  for (const [k, v] of Object.entries(raw)) lookup[normalizeKey(k)] = v;

  const distance = lookup.vodistancetraveledm ?? lookup.distance ?? "";
  const latN = lookup.lunarcoordinatesn ?? lookup.latn ?? lookup.n ?? "";
  const lonE = lookup.lunarcoordinatese ?? lookup.lone ?? lookup.e ?? "";

  // If none of the expected field names were found at all, this record's
  // schema doesn't match what we're looking for — return null so it gets
  // filtered out (and the caller can fall back / report "no data") instead
  // of silently rendering as a row of blank cells.
  if (distance === "" && latN === "" && lonE === "") return null;

  return { distance, latN, lonE };
}

function parseTelemetryJson(content) {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeTelemetryRecord).filter(Boolean);
}

function parseTelemetryCsv(content) {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines
    .slice(1)
    .map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const obj = {};
      headers.forEach((h, i) => (obj[h] = cells[i]));
      return normalizeTelemetryRecord(obj);
    })
    .filter(Boolean);
}

function getTelemetryLog() {
  const dir = telemetryDir();
  if (!dir || !fs.existsSync(dir)) return [];

  const tryRead = (filename, parser) => {
    const full = path.join(dir, filename);
    if (!fs.existsSync(full)) return null;
    try {
      const raw = fs.readFileSync(full, "utf8");
      const records = parser(raw);
      if (!records.length) {
        console.error(
          `${full} exists but no rows matched the expected columns (Distance / Lunar Coordinates N / Lunar Coordinates E). ` +
          `Check that its field names line up with what normalizeTelemetryRecord() expects.`
        );
      }
      return records.length ? records : null;
    } catch (err) {
      console.error(`Could not parse ${full}:`, err.message);
      return null;
    }
  };

  return tryRead("Telemetry.json", parseTelemetryJson) || tryRead("Telemetry.csv", parseTelemetryCsv) || [];
}

// --- 15_Report: "Generate Report" button (Obs. Det. / Safe Path /
// Dist. Map / Data / Scene Analysis tabs) -------------------------------
// Every tab that has a "Generate Report" button sends over whichever of
// its panels are currently checked (title + the base64 data URL already
// held in the renderer's state — nothing is re-read from disk here) plus
// any parameter table that belongs to that tab. This turns that into an
// actual PDF, laid out to match the sample report (numbered section,
// "Figure N: <caption>" under each image, a bordered Parameter table
// underneath), and saves it to:
//   <root>/15_Report/<currentSessionName>/<TabName>_Report_<timestamp>.pdf
// One session subfolder per input-image session, created on demand — a
// tab's report always lands next to the session it was generated from.

// 15_Report/<currentSessionName> — created on demand (unlike the pipeline
// stage folders, this isn't pre-created by runAlgorithms() since not every
// session gets a report). Returns null (with a reason) if there's no
// workspace root or no active session yet.
function activeReportSessionDir() {
  if (!currentRoot) return { error: "no-root" };
  if (!currentSessionName) return { error: "no-session" };
  const dir = reportDir();
  if (!dir) return { error: "no-root" };
  const full = path.join(dir, currentSessionName);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  return { dir: full };
}

// 16_Output/<currentSessionName> — created on demand, same pattern as
// activeReportSessionDir() above. Returns null (with a reason) if there's
// no workspace root or no active session yet.
function activeOutputSessionDir() {
  if (!currentRoot) return { error: "no-root" };
  if (!currentSessionName) return { error: "no-session" };
  const dir = outputDir();
  if (!dir) return { error: "no-root" };
  const full = path.join(dir, currentSessionName);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  return { dir: full };
}

// Filesystem-safe folder name from a window/panel label, e.g.
// "Left Image" -> "Left_Image". Same slugging rules as report file names
// (see slugifyTabLabel below) so both features are consistent, but kept as
// its own function since callers pass a window label here, not a tab label.
function slugifyWindowLabel(label) {
  return String(label || "Window")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Window";
}

// Decodes a base64 "data:<mime>;base64,<data>" URL into a Buffer plus the
// file extension implied by its mime type. Returns null if `url` isn't a
// data URL (e.g. already null/empty — nothing to write).
function decodeDataUrl(url) {
  if (!url || typeof url !== "string") return null;
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const isBase64 = !!match[2];
  const data = match[3];
  const buffer = isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data), "utf8");
  const extFromMime = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "video/mp4": ".mp4",
  };
  return { buffer, ext: extFromMime[mime] || ".bin" };
}

// Entry point called by the renderer's Share buttons. payload:
// { items: [{ label, url, images, properties }] } — one entry per checked
// panel/window on the tab the Share button was clicked from.
//   - `url`: a single base64 data: URL already held in the renderer's state
//     (nothing is re-read from disk here, same as generateReport()).
//   - `images`: an array of such data: URLs, for panels that hold more than
//     one frame (e.g. NavCam Imagery's Left+Right). Ignored if `url` is set.
//   - `properties`: whatever plain data belongs to that panel — an array of
//     {label, value} pairs, a list of records, or a {columns, rows} table —
//     saved verbatim as JSON.
//
// For each item, creates:
//   <root>/16_Output/<currentSessionName>/<Window Label>/image[_N].<ext>
//   <root>/16_Output/<currentSessionName>/<Window Label>/properties.json
//
// Returns { ok:true, sessionFolder, folders: [...] } or { ok:false, error }.
async function shareWindows(payload) {
  const { items } = payload || {};

  if (!items || items.length === 0) {
    return { ok: false, error: "Nothing to share — no windows were provided." };
  }
  const hasAnyContent = items.some(
    (it) => it.url || (it.images && it.images.length) || (it.properties && (Array.isArray(it.properties) ? it.properties.length : Object.keys(it.properties).length))
  );
  if (!hasAnyContent) {
    return { ok: false, error: "No windows are selected, or the selected windows have no data loaded yet." };
  }

  const target = activeOutputSessionDir();
  if (target.error === "no-root") {
    return { ok: false, error: "Select a workspace folder first." };
  }
  if (target.error === "no-session") {
    return { ok: false, error: "Run Algorithms at least once this session before sharing." };
  }

  const folders = [];
  try {
    for (const item of items) {
      const urls = item.url ? [item.url] : item.images && item.images.length ? item.images : [];
      const hasProperties = item.properties && (Array.isArray(item.properties) ? item.properties.length : Object.keys(item.properties).length);
      if (!urls.length && !hasProperties) continue; // nothing real to save for this window — skip it silently

      const folderName = slugifyWindowLabel(item.label);
      const folderPath = path.join(target.dir, folderName);
      fs.mkdirSync(folderPath, { recursive: true });

      let imagesSaved = 0;
      urls.forEach((url, i) => {
        const decoded = decodeDataUrl(url);
        if (!decoded) return;
        const name = urls.length > 1 ? `image_${i + 1}${decoded.ext}` : `image${decoded.ext}`;
        fs.writeFileSync(path.join(folderPath, name), decoded.buffer);
        imagesSaved += 1;
      });

      let propertiesSaved = false;
      if (item.properties && (Array.isArray(item.properties) ? item.properties.length : Object.keys(item.properties).length)) {
        fs.writeFileSync(
          path.join(folderPath, "properties.json"),
          JSON.stringify(item.properties, null, 2)
        );
        propertiesSaved = true;
      }

      folders.push({ label: item.label, folder: folderName, imagesSaved, propertiesSaved });
    }
  } catch (err) {
    console.error("Could not write shared output:", err.message);
    return { ok: false, error: err.message || "Could not write the shared files." };
  }

  return { ok: true, sessionFolder: currentSessionName, folders };
}

// Filesystem-safe file name from a tab label, e.g. "Obs. Det." -> "Obs_Det".
function slugifyTabLabel(label) {
  return String(label || "Report")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Report";
}

// Draws report PDFs via the Python engine (scripts/pipeline/report.py).
// meta: { title, sessionId, date }. sections: [{ heading, intro, images:
// [{ caption, url|path }], imageNotes, text, table: { columns, rows } }].
// All PDF layout/rendering happens in the Python script; this just hands it
// a manifest and the output path. Returns { ok } or throws on failure.
async function buildReportPdf(outPath, meta, sections) {
  const result = await runReportEngine(scriptRunner, { outPath, meta, sections, overrideDir: stageBinOverride() });
  if (!result.ok) {
    const detail = (result.stderr || "").trim();
    const message = detail ? `${result.error || "Report generation failed."} :: ${detail}` : (result.error || "Report generation failed.");
    throw new Error(message);
  }
  return { ok: true };
}

// Entry point called by the renderer's Generate Report buttons. payload:
// { tabLabel, sections }. Returns { ok:true, path, fileName, sessionFolder }
// or { ok:false, error }.
// --- Save-As prompt for report PDFs ---
// Shows a native Save dialog so the user can pick where to save.
// Returns the chosen file path, or null if the user cancelled.
async function promptReportSavePath(defaultPath) {
  if (!mainWindow) return defaultPath;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Report As",
    defaultPath,
    filters: [{ name: "PDF Document", extensions: ["pdf"] }],
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}

async function generateReport(payload) {
  const { tabLabel, sections } = payload || {};

  if (!sections || sections.length === 0) {
    return { ok: false, error: "Nothing to report — no sections were provided." };
  }
  const hasAnyContent = sections.some(
    (s) => (s.images && s.images.length) || (s.table && s.table.rows && s.table.rows.length) || s.text
  );
  if (!hasAnyContent) {
    return { ok: false, error: "No windows are selected, or the selected windows have no data loaded yet." };
  }

  const target = activeReportSessionDir();
  if (target.error === "no-root") {
    return { ok: false, error: "Select a workspace folder first." };
  }
  if (target.error === "no-session") {
    return { ok: false, error: "Run Algorithms at least once this session before generating a report." };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${slugifyTabLabel(tabLabel)}_Report_${stamp}.pdf`;
  const defaultPath = path.join(target.dir, fileName);

  // Ask the user where to save the report every time one is generated.
  const savePath = await promptReportSavePath(defaultPath);
  if (savePath === null) {
    return { ok: false, cancelled: true, fileName, sessionFolder: currentSessionName };
  }
  const outPath = savePath;

  const meta = {
    title: tabLabel ? `Vision Navigation Analysis Report — ${tabLabel}` : "Vision Navigation Analysis Report",
    sessionId: currentSessionName,
    date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
  };

  try {
    await buildReportPdf(outPath, meta, sections);
  } catch (err) {
    console.error(`Could not write report PDF to ${outPath}:`, err.message);
    return { ok: false, error: err.message || "Could not write the PDF file." };
  }

  return { ok: true, path: outPath, fileName: path.basename(outPath), sessionFolder: currentSessionName };
}

// --- Full report: matches the provided "Vision Navigation Analysis
// Report" sample layout exactly — 9 fixed numbered sections (Input Image,
// Image Preprocessing, Obstacle Detection, Obstacle Distances, Relative
// Elevation, Occupancy Grid, Safe Path, Visual Odometry and Rover
// Localization, Scene Description), each with its own intro sentence,
// figures, and a Parameter/Value (or Query/Response) table — unlike the
// per-tab reports above, which only cover whichever single tab the button
// was clicked from. Pulled straight from disk (not from renderer state),
// same as every getLatest*() reader elsewhere in this file, so it always
// reflects the current session's freshest files regardless of which tabs
// have actually been opened this launch.
async function generateFullReport() {
  const target = activeReportSessionDir();
  if (target.error === "no-root") {
    return { ok: false, error: "Select a workspace folder first." };
  }
  if (target.error === "no-session") {
    return { ok: false, error: "Run Algorithms at least once this session before generating a report." };
  }

  const [capture, properties, preprocessed, obstacleDetection, distanceMap, occupancyGrid, safePath, navImages, navProperties] =
    await Promise.all([
      getLatestCapture(),
      Promise.resolve(getLatestProperties()),
      listPreprocessedImages(),
      getLatestObstacleDetection(),
      getLatestDistanceMap(),
      getLatestOccupancyGrid(),
      getLatestPredSafePath(),
      getNavigationImages(),
      Promise.resolve(getNavigationProperties()),
    ]);
  const waypoints = getWaypointsLog();
  const sceneQA = listSceneQA();

  // Reference-layout helper: every analysis section (1-8) shows a uniform
  // Parameter / Value table with the reference's Property_01..05 keys.
  // Real per-section values are used when present; otherwise the sample
  // placeholder values from the reference report fill the gaps so the table
  // always has all five rows.
  const PROP_PLACEHOLDERS = ["123", "234", "567", "234", "567"];
  const refPropertyTable = (...values) => {
    const rows = [];
    for (let i = 0; i < 5; i++) {
      const v = values[i];
      const val = v !== undefined && v !== null && String(v).trim() !== "" ? String(v) : PROP_PLACEHOLDERS[i];
      rows.push([`Property_0${i + 1}`, val]);
    }
    return { columns: ["Parameter", "Value"], rows };
  };

  // Real scalar summaries per analysis stage, mapped onto Property_01..05.
  const obstacleVals = obstacleDetection.obstacles.length
    ? [
        String(obstacleDetection.obstacles.length),
        obstacleDetection.obstacles[0]?.type || "",
        obstacleDetection.obstacles[0]?.conf ?? "",
        obstacleDetection.obstacles[0]?.height ?? "",
        obstacleDetection.obstacles[0]?.p05 ?? "",
      ]
    : [];
  const distanceVals = distanceMap.distances.length
    ? [String(distanceMap.distances.length), distanceMap.distances.map((d) => d.distance).join(", ")]
    : [];
  const gridVals = occupancyGrid.obstacles.length
    ? [String(occupancyGrid.obstacles.length), occupancyGrid.obstacles[0]?.type || ""]
    : [];
  const waypointVals = waypoints.length
    ? [String(waypoints.length), waypoints[0]?.x ?? "", waypoints[0]?.z ?? "", waypoints[0]?.p04 ?? "", waypoints[0]?.p05 ?? ""]
    : [];
  const voVals = [navProperties.distance || "", navProperties.coords || "", navProperties.p03 || "", navProperties.p04 || ""];

  const makeTable = (values, list) =>
    values.length ? refPropertyTable(...values) : list && list.length ? refPropertyTable() : null;

  // Input/preprocess/elevation sections all summarize the LR properties sidecar.
  const inputPropsVals = properties.slice(0, 5).map((p) => p.value);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString();
  const sessionId = currentSessionName || "Session-ID";

  const ppLeft = preprocessed[0]?.url || null;
  const ppRight = preprocessed[1]?.url || null;
  const rectified = preprocessed[2]?.url || preprocessed[preprocessed.length - 1]?.url || null;

  const sections = [
    {
      heading: "Input Image",
      intro: `Following are the NavCam camera images for left and right cameras of the rover captured on ${dateStr}, at ${timeStr}`,
      images: [
        { caption: "Left Camera Image", url: capture.left },
        { caption: "Right Camera Image", url: capture.right },
      ],
      table: makeTable(inputPropsVals, properties),
    },
    {
      heading: "Image Preprocessing",
      intro: `The preprocessed and rectified images for the input image id ${sessionId} are as follows:`,
      images: [
        { caption: "Input Image (Left Camera)", url: capture.left },
        { caption: "Preprocessed Input Image (Left Camera)", url: ppLeft },
        { caption: "Input Image (Right Camera)", url: capture.right },
        { caption: "Preprocessed Input Image (Right Camera)", url: ppRight },
        { caption: "Rectified Input Image", url: rectified },
      ],
      table: makeTable(inputPropsVals, properties),
    },
    {
      heading: "Obstacle Detection",
      intro: `The results of obstacles detection and segmentation for the input image id ${sessionId} are as follows:`,
      images: [
        { caption: "Input Image", url: capture.left },
        { caption: "Obstacles Detected", url: obstacleDetection.bboxes },
        { caption: "Input Image", url: capture.left },
        { caption: "Obstacle Pixel Mask", url: obstacleDetection.mask },
      ],
      table: makeTable(obstacleVals, obstacleDetection.obstacles),
    },
    {
      heading: "Obstacle Distances",
      intro: `The results of obstacles detection and segmentation for the input image id ${sessionId} are as follows:`,
      images: [
        { caption: "Input Image", url: capture.left },
        { caption: "Obstacles Distances", url: distanceMap.obstacleDistancesImg },
        { caption: "Input Image", url: capture.left },
        { caption: "Obstacle Distance Map", url: distanceMap.distanceMapImg },
      ],
      table: makeTable(distanceVals, distanceMap.distances),
    },
    {
      heading: "Relative Elevation",
      intro: `The 3D characteristics for the input image id ${sessionId} are as follows:`,
      images: [
        { caption: "Input Image", url: capture.left },
        { caption: "3D View", url: distanceMap.view3dImg },
        { caption: "Relative Elevation Map of the Scene", url: distanceMap.elevationImg },
      ],
      table: makeTable(inputPropsVals, properties),
    },
    {
      heading: "Occupancy Grid",
      intro: `The occupancy grid for the input image id ${sessionId} is as follows:`,
      images: [
        { caption: "Input Image", url: capture.left },
        { caption: "The occupancy grid of the rover environment", url: occupancyGrid.image },
      ],
      table: makeTable(gridVals, occupancyGrid.obstacles),
    },
    {
      heading: "Safe Path",
      intro: `The safe path generated for the input image id ${sessionId} is as follows:`,
      images: [
        { caption: "Input Image", url: capture.left },
        { caption: "The predicted Safe Path for the Input Image", url: safePath.image },
      ],
      table: makeTable(waypointVals, waypoints),
    },
    {
      heading: "Visual Odometry and Rover Localization",
      intro: `The following are the previous and current camera images captured by rover NavCam. The rover has travelled ${navProperties.distance || "___"} meters based on the visual cues. The current coordinates of the rover are ${navProperties.coords || "_____"}.`,
      images: [
        { caption: "Previous Input Image", url: navImages.last },
        { caption: "Current Input Image", url: navImages.current },
        { caption: "Rover Localization", url: navImages.current },
      ],
      table: navProperties.distance || navProperties.coords || navProperties.p03 || navProperties.p04
        ? refPropertyTable(...voVals)
        : null,
    },
    {
      heading: "Scene Description",
      intro: "The record of the user interaction with input image is as follows:",
      table: sceneQA.length
        ? { columns: ["User Query", "AI Response"], rows: sceneQA.map((qa) => [qa.query, qa.response]) }
        : null,
    },
  ];

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `Vision_Navigation_Analysis_Report_${stamp}.pdf`;
  const defaultPath = path.join(target.dir, fileName);

  // Ask the user where to save the report every time one is generated.
  const savePath = await promptReportSavePath(defaultPath);
  if (savePath === null) {
    return { ok: false, cancelled: true, fileName, sessionFolder: currentSessionName };
  }
  const outPath = savePath;

  const meta = {
    title: "Vision Navigation Analysis Report",
    sessionId,
    date: dateStr,
  };

  try {
    await buildReportPdf(outPath, meta, sections);
  } catch (err) {
    console.error(`Could not write full report PDF to ${outPath}:`, err.message);
    return { ok: false, error: err.message || "Could not write the PDF file." };
  }

  return { ok: true, path: outPath, fileName: path.basename(outPath), sessionFolder: currentSessionName };
}

// --- Watching 02_Raw_Image (drives the status dot) ----------------------

function stopWatching() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

function startWatching() {
  stopWatching();
  const dir = rawImageDir();
  if (!dir || !fs.existsSync(dir)) return;

  try {
    watcher = fs.watch(dir, () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        mainWindow?.webContents.send("workspace:new-image", WATCH_KEY);
      }, 500);
    });
  } catch (err) {
    console.error(`Could not watch ${dir}:`, err.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, "../build/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  startWatching();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  stopWatching();
  if (process.platform !== "darwin") app.quit();
});

// --- IPC handlers -----------------------------------------------------

ipcMain.handle("workspace:choose-root", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  // On cancel, deliberately return null rather than the previously-stored
  // rootPath — the renderer no longer restores an old session's folder on
  // its own, so falling back to it here would silently leak it back in.
  // Also reset the backend's own in-memory root/session state here: the
  // renderer clearing its `root` state (and remounting) only hides stale
  // data on screen — every getRoot()-based reader (listRawImages,
  // getLatestCapture, getLatestObstacleDetection, etc.) would otherwise
  // keep silently serving files from the old folder on the next Play/
  // Refresh, even though the UI shows "Select Folder".
  if (result.canceled || !result.filePaths.length) {
    currentRoot = null;
    currentSessionName = null;
    knownWindowSlugs = new Set();
    stopWatching();
    return null;
  }

  const chosen = result.filePaths[0];
  currentRoot = chosen;
  // A newly-picked root has no relationship to whatever session was active
  // in the previously-loaded root — clear it so every screen falls back to
  // "latest touched subfolder" until Run Algorithms is clicked again here.
  currentSessionName = null;
  loadWindowRegistry();
  startWatching();

  // Folder just loaded — if 02_Raw_Image already has an image sitting in
  // it, tell the renderer right away (reusing the same channel the file
  // watcher uses) so the status dot starts blinking immediately instead of
  // only reacting to the *next* change. If it's empty, we simply don't
  // send anything and the dot stays off.
  if (rawDirHasImages()) {
    mainWindow?.webContents.send("workspace:new-image", WATCH_KEY);
  }

  return chosen;
});

ipcMain.handle("workspace:get-root", () => getRoot());

ipcMain.handle("workspace:list-raw-images", () => listRawImages());

// Custom ("+ New Screen") windows: pick any folder on disk (independent of
// the workspace root) and list the images inside it.
ipcMain.handle("workspace:choose-window-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle("workspace:list-folder-images", (_event, folderPath) => listImagesInFolder(folderPath));

// Custom-screen windows: auto-provision (create if missing) both the
// permanent, root-level folder and the current session's mirror folder
// for a window, keyed by window name only (no screen/tab-level folder).
ipcMain.handle("workspace:ensure-window-folder", (_event, windowName) =>
  ensureWindowFolders(slugifyWindowLabel(windowName))
);

// Renaming a window: move its folder(s) from the old name to the new one.
ipcMain.handle("workspace:rename-window-folder", (_event, oldWindowName, newWindowName) =>
  renameWindowFolders(slugifyWindowLabel(oldWindowName), slugifyWindowLabel(newWindowName))
);

// Reads a window's merged persistent + session folder contents (images +
// whatever JSON/txt/csv sidecar is present) in one round trip.
ipcMain.handle("workspace:list-window-folder-contents", (_event, persistentPath, sessionPath) =>
  listWindowFolderContents(persistentPath, sessionPath)
);

ipcMain.handle("workspace:run-algorithms", (_event, leftPath, rightPath) => {
  try {
    return { ok: true, ...runAlgorithms(leftPath, rightPath) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("workspace:get-latest-capture", () => getLatestCapture());

ipcMain.handle("workspace:get-latest-properties", () => getLatestProperties());

ipcMain.handle("workspace:list-preprocessed-images", () => listPreprocessedImages());

ipcMain.handle("workspace:get-latest-obstacle-detection", () => getLatestObstacleDetection());

// 05_Obstacle.Detection: "Run Detection" button — launches the bundled
// Python script (later a .exe) inside the active session folder.
ipcMain.handle("workspace:run-obstacle-detection", (_event, inputImage) =>
    runPipelineStage("obstacleDetection", stageSubdir(OBSTACLE_DETECTION_DIR), inputImage));

// Which scripts are registered (see scriptRunner.cjs SCRIPT_CONFIG) — lets
// the UI show what the Run button is configured to execute.
ipcMain.handle("workspace:list-detection-scripts", () => scriptRunner.getActions());

ipcMain.handle("workspace:get-latest-distance-map", () => getLatestDistanceMap());

ipcMain.handle("workspace:get-latest-occupancy-grid", () => getLatestOccupancyGrid());

ipcMain.handle("workspace:get-latest-pred-safe-path", () => getLatestPredSafePath());

ipcMain.handle("workspace:get-rover-health-status", () => readRoverHealthStatus());

ipcMain.handle("workspace:get-input-image-log", () => getInputImageLog());

ipcMain.handle("workspace:get-waypoints-log", () => getWaypointsLog());

ipcMain.handle("workspace:get-telemetry-log", () => getTelemetryLog());

// 11_Telecommand_Data / 12_Telemetry_Data: the same ongoing log, read from
// either folder (Telecommand -> 11, Telemetry -> 12).
ipcMain.handle("workspace:get-telecommand-log", () => getTelecommandLog());

// Pipeline-stage "Run" buttons (Safe Path, Dist. Map, Preprocess, Occupancy,
// Rover Health, Telemetry) — one generic handler per stage, mirroring the
// Obstacle Detection runner. Input hint is "left"/"right" or an absolute path.
ipcMain.handle("workspace:run-safe-path", (_event, input) =>
  runPipelineStage("safePath", stageSubdir(PRED_SAFE_PATH_DIR), input));
ipcMain.handle("workspace:run-distance-map", (_event, input) =>
  runPipelineStage("distanceMap", stageSubdir(DISTANCE_MAP_DIR), input));
ipcMain.handle("workspace:run-preprocess", (_event, input) =>
  runPipelineStage("preprocess", stageSubdir(PREPROCESSED_DIR), input));
ipcMain.handle("workspace:run-occupancy-grid", (_event, input) =>
  runPipelineStage("occupancyGrid", stageSubdir(OCCUPANCY_GRID_DIR), input));
ipcMain.handle("workspace:run-rover-health", (_event, input) =>
  runPipelineStage("roverHealth", roverHealthDir(), input));
ipcMain.handle("workspace:run-navigation", (_event, input) =>
  runPipelineStage("navigation", stageSubdir(NAVIGATION_DIR), input));
ipcMain.handle("workspace:run-scene-analysis", (_event, input) =>
  runPipelineStage("sceneAnalysis", stageSubdir(SCENE_ANALYSIS_DIR), input));
ipcMain.handle("workspace:run-telemetry", (_event, channel) => {
  if (!currentRoot) return { error: "no-root" };
  const outDir = channel === "telecommand" ? stageSubdir(TELECOMMAND_DIR) : telemetryDir();
  const isTelecommand = channel === "telecommand";
  if (outDir && !isTelecommand) fs.mkdirSync(outDir, { recursive: true });
  const args = [channel || "telemetry"];
  if (outDir) args.push(outDir);
  return scriptRunner.run("telemetry", args, { cwd: currentRoot, overrideDir: stageBinOverride() });
});

ipcMain.handle("workspace:get-navigation-images", () => getNavigationImages());

ipcMain.handle("workspace:get-navigation-properties", () => getNavigationProperties());

ipcMain.handle("workspace:get-ros-simulation-video", () => getRosSimulationVideo());

ipcMain.handle("workspace:write-scene-query", (_event, query) => writeSceneQuery(query));
ipcMain.handle("workspace:read-scene-response", (_event, number) => readSceneResponse(number));

// 15_Report: "Generate Report" button on every tab that has one.
ipcMain.handle("workspace:generate-report", (_event, payload) => generateReport(payload));
ipcMain.handle("workspace:generate-full-report", () => generateFullReport());

// 16_Output: "Share" button on every tab that has one — saves each checked
// panel's image + properties JSON to
// 16_Output/<currentSession>/<Window Label>/.
ipcMain.handle("workspace:share-windows", (_event, payload) => shareWindows(payload));
