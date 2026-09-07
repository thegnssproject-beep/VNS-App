// src/hooks/useWorkspace.js
import { useCallback, useEffect, useState } from "react";

// Only true inside the Electron desktop shell (preload.cjs sets window.workspace).
// In plain-browser `npm run dev`, this stays false and every hook below is a
// harmless no-op — the manual "Load" button keeps working as a fallback.
const hasWorkspace = typeof window !== "undefined" && !!window.workspace;

export function useWorkspaceRoot() {
  // Intentionally NOT restored from disk on mount — the Workspace Folder
  // field should read empty ("Select Folder") on every fresh login/signup,
  // even if a folder was chosen in a previous session. It only gets filled
  // in once the user explicitly picks one via chooseRoot() below.
  const [root, setRoot] = useState(null);

  const chooseRoot = useCallback(async () => {
    if (!hasWorkspace) return null;
    const chosen = await window.workspace.chooseRoot();
    setRoot(chosen);
    return chosen;
  }, []);

  return { root, chooseRoot, available: hasWorkspace };
}

// Watches <root>/02_Raw_Image for new raw images (this is what drives the
// top status dot now):
// - hasNewImage flips true the moment a new raw image shows up
// - loadLatest() re-reads the folder and returns { left: [...], right: [...] },
//   each entry shaped as { name, path, url } (path is needed for Run Algorithms;
//   url is a base64 data: URL usable directly as an <img src>)
export function useRawImagesWatch() {
  const [hasNewImage, setHasNewImage] = useState(false);

  useEffect(() => {
    if (!hasWorkspace) return;
    const off = window.workspace.onNewImage(() => setHasNewImage(true));
    return off;
  }, []);

  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return { left: [], right: [] };
    const result = await window.workspace.listRawImages();
    setHasNewImage(false);
    return result;
  }, []);

  return { hasNewImage, loadLatest, available: hasWorkspace };
}

// Copies the given Left/Right raw image files into a new session folder
// under 03_Input_Image. Returns { ok, sessionFolder } or { ok: false, error }.
export async function runAlgorithms(leftPath, rightPath) {
  if (!hasWorkspace) {
    return { ok: false, error: "Workspace folder access is only available in the desktop app." };
  }
  return window.workspace.runAlgorithms(leftPath || null, rightPath || null);
}

// Reads the latest capture session under 03_Input_Image (unrelated to the
// raw-image browsing above) — used by the NavCam panel.
// loadLatest() returns { sessionFolder, left, right } (left/right are
// base64 data: URLs, or null).
export function useInputCaptureWatch() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return { sessionFolder: null, left: null, right: null };
    return window.workspace.getLatestCapture();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Reads the current session folder's sidecar property file (LR.json /
// LR.txt / LR.csv — whichever is present). loadLatest() returns an
// ordered array of { label, value } pairs, or [] if none exists yet.
export function useLatestProperties() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return [];
    return window.workspace.getLatestProperties();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Reads every image in the latest session folder under 04_Preprocessed.
// loadLatest() returns an ordered array of { name, url } (url is a base64
// data: URL usable directly as an <img src>), or [] if none exists yet.
export function usePreprocessedImages() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return [];
    return window.workspace.listPreprocessedImages();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Reads the latest session folder under 05_Obstacle.Detection: the
// Segmentation/Bbox images plus the per-obstacle records from
// Obstacle_details.json/.csv/.txt. loadLatest() returns
// { mask, bboxes, obstacles } — mask/bboxes are base64 data: URLs (or
// null), obstacles is an array of { id, conf, type, height, p05 }.
export function useObstacleDetection() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return { mask: null, bboxes: null, obstacles: [] };
    return window.workspace.getLatestObstacleDetection();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Reads the latest session folder under 06_Distance_Map: the 4 images
// (Obstacle Distances / Distance Map / 3D View / Relative Elevation) plus
// the per-obstacle records from Obstacle_distances.json/.csv/.txt.
// loadLatest() returns { obstacleDistancesImg, distanceMapImg, view3dImg,
// elevationImg, distances } — images are base64 data: URLs (or null),
// distances is an array of { id, distance }.
export function useDistanceMap() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) {
      return { obstacleDistancesImg: null, distanceMapImg: null, view3dImg: null, elevationImg: null, distances: [] };
    }
    return window.workspace.getLatestDistanceMap();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Reads the latest session folder under 07_Occupancy_Grid: Grid.png plus
// the per-obstacle records un-pivoted from Grid.json. loadLatest() returns
// { image, obstacles } — image is a base64 data: URL (or null), obstacles
// is an array of { id, type, x, z, width }.
export function useOccupancyGrid() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return { image: null, obstacles: [] };
    return window.workspace.getLatestOccupancyGrid();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Reads the latest session folder under 08_Pred_Safe_Path: SafePath.png.
// loadLatest() returns { image } — image is a base64 data: URL (or null).
export function usePredSafePath() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return { image: null };
    return window.workspace.getLatestPredSafePath();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Reads <root>/13_Rover_Health_Status/healthstatus.json — drives the
// "Rover Characteristics" panel. loadLatest() returns an ordered array of
// { subsystem, status, health, battery } (rows without a Subsystem are
// dropped), or [] if the file doesn't exist yet.
export function useRoverHealthStatus() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return [];
    return window.workspace.getRoverHealthStatus();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Reads every 03_Input_Image session's sidecar properties (not just the
// latest) — feeds the Data screen's "Parameter Table - L/R/PP Image" log,
// one row per past capture. loadLatest() returns an array of
// { path, size, resolution, timestamp, p05 }.
export function useInputImageLog() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return [];
    return window.workspace.getInputImageLog();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Reads Waypoints.json/.csv/.txt from the latest 09_Navigation session.
// loadLatest() returns an array of { id, x, z, p04, p05 }.
export function useWaypointsLog() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return [];
    return window.workspace.getWaypointsLog();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Reads Telemetry.json/.csv directly under 12_Telemetry_Data — an ongoing
// log, not session-based. loadLatest() returns an array of
// { distance, latN, lonE }.
export function useTelemetryLog() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return [];
    return window.workspace.getTelemetryLog();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Reads the ongoing Telecommand log from 11_Telecommand_Data. loadLatest()
// returns an array of { imgNo, module, size, value, timestamp, status }.
export function useTelecommandLog() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return [];
    return window.workspace.getTelecommandLog();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Generic pipeline-stage runner exposed to tabs. runStage({ actionId,
// inputHint }) launches the matching Python/.exe via ScriptRunner into that
// stage's folder. Returns { ok, stdout, stderr, outputDir }.
export function usePipelineRunner() {
  const run = useCallback(async (actionId, inputHint) => {
    if (!hasWorkspace) {
      return { ok: false, error: "Pipeline execution is only available in the desktop app." };
    }
    const map = {
      safePath: () => window.workspace.runSafePath(inputHint),
      distanceMap: () => window.workspace.runDistanceMap(inputHint),
      preprocess: () => window.workspace.runPreprocess(inputHint),
      occupancyGrid: () => window.workspace.runOccupancyGrid(inputHint),
      roverHealth: () => window.workspace.runRoverHealth(inputHint),
      navigation: () => window.workspace.runNavigation(inputHint),
      sceneAnalysis: () => window.workspace.runSceneAnalysis(inputHint),
    };
    const fn = map[actionId];
    if (!fn) return { ok: false, error: `Unknown action: ${actionId}` };
    return fn();
  }, []);
  return { run, available: hasWorkspace };
}

// Telemetry ("Run Telemetry") — writes the ongoing telemetry/telecommand log
// into 12_Telemetry_Data / 11_Telecommand_Data.
export function useTelemetryRunner() {
  const run = useCallback(async (channel) => {
    if (!hasWorkspace) {
      return { ok: false, error: "Pipeline execution is only available in the desktop app." };
    }
    return window.workspace.runTelemetry(channel || "telemetry");
  }, []);
  return { run, available: hasWorkspace };
}

// Reads the session's own Left input image for "Current", and the
// immediately-preceding session's Left input image for "Last".
// loadLatest() returns { current, last } — base64 data: URLs, or null.
export function useNavigationImages() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return { current: null, last: null };
    return window.workspace.getNavigationImages();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Reads Rover_Characterization.json/.csv/.txt from the latest 09_Navigation
// session. loadLatest() returns { distance, coords, p03, p04 }.
export function useNavigationProperties() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return { distance: "", coords: "", p03: "", p04: "" };
    return window.workspace.getNavigationProperties();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Reads the single video file in 10_ROS_Simulation. loadLatest() returns
// a base64 data: URL usable directly as a <video src>, or null.
export function useRosSimulationVideo() {
  const loadLatest = useCallback(async () => {
    if (!hasWorkspace) return null;
    return window.workspace.getRosSimulationVideo();
  }, []);

  return { loadLatest, available: hasWorkspace };
}

// Used by custom ("+ New Screen") windows: lets a window's folder path be
// chosen via the native folder picker instead of typed in, and lists the
// real images inside whatever folder was chosen (independent of the
// workspace root / pipeline-stage folders the other hooks above read from).
export function useWindowFolder() {
  const chooseFolder = useCallback(async () => {
    if (!hasWorkspace) return null;
    return window.workspace.chooseWindowFolder();
  }, []);

  const listImages = useCallback(async (folderPath) => {
    if (!hasWorkspace || !folderPath) return [];
    return window.workspace.listFolderImages(folderPath);
  }, []);

  return { chooseFolder, listImages, available: hasWorkspace };
}

// Replaces the manual "Select folder" flow for custom ("+ New Screen")
// windows: folders are provisioned automatically instead of picked, as a
// direct sibling of the pipeline-stage folders (02_Raw_Image, etc.) — no
// screen/tab-level folder.
// - ensureFolder(windowName) creates (if missing) and returns
//   { persistentPath, sessionPath } — persistentPath lives at
//   <root>/<windowName> and is permanent; sessionPath mirrors the
//   currently-active capture session and is null if none is active yet.
// - renameFolder(oldWindowName, newWindowName) moves both folders to
//   match a renamed window, returning the same shape.
// - listContents(persistentPath, sessionPath) returns { images, properties }
//   — images merged from both folders (session images first), properties
//   read from whichever folder has a JSON/txt/csv sidecar file.
export function useWindowFolderAuto() {
  const ensureFolder = useCallback(async (windowName) => {
    if (!hasWorkspace) return { error: "unavailable" };
    return window.workspace.ensureWindowFolder(windowName);
  }, []);

  const renameFolder = useCallback(async (oldWindowName, newWindowName) => {
    if (!hasWorkspace) return { error: "unavailable" };
    return window.workspace.renameWindowFolder(oldWindowName, newWindowName);
  }, []);

  const listContents = useCallback(async (persistentPath, sessionPath) => {
    if (!hasWorkspace) return { images: [], properties: [] };
    return window.workspace.listWindowFolderContents(persistentPath || null, sessionPath || null);
  }, []);

  return { ensureFolder, renameFolder, listContents, available: hasWorkspace };
}

// Writes a query to Query_<n>.txt in the active session's
// 14_Scene_Analysis_Report folder and lets the caller poll for the
// matching Response_<n>.txt — no PDF reading or in-app answering happens
// here anymore; the answer comes from whatever external process drops the
// response file in that same folder.
export function useSceneAnalysisQuery() {
  const writeQuery = useCallback(async (query) => {
    if (!hasWorkspace) {
      return { error: "Scene Analysis queries are only available in the desktop app." };
    }
    return window.workspace.writeSceneQuery(query);
  }, []);

  const readResponse = useCallback(async (number) => {
    if (!hasWorkspace) return { found: false };
    return window.workspace.readSceneResponse(number);
  }, []);

  return { writeQuery, readResponse, available: hasWorkspace };
}

// Used by every tab's "Generate Report" button. generate(payload) sends
// { tabLabel, sections } over to the main process, which turns it into a
// real PDF (matching the sample report layout: numbered sections, "Figure
// N: <caption>" under each image, a bordered parameter table underneath)
// and saves it to 15_Report/<currentSession>/<Tab>_Report_<timestamp>.pdf.
// Returns { ok:true, path, fileName, sessionFolder } or { ok:false, error }.
export function useGenerateReport() {
  const generate = useCallback(async (payload) => {
    if (!hasWorkspace) {
      return { ok: false, error: "Report generation is only available in the desktop app." };
    }
    return window.workspace.generateReport(payload);
  }, []);

  return { generate, available: hasWorkspace };
}

// Master "Full Report" — assembles all 9 sections (Input Image through
// Scene Description) into one PDF matching the sample Vision Navigation
// Analysis Report layout, pulled straight from whatever's newest on disk
// for the active session (not from any tab's in-memory state). Unlike
// useGenerateReport() above, generate() here takes no payload — there's
// nothing for the renderer to assemble, the whole thing is read fresh from
// disk on the main-process side.
export function useGenerateFullReport() {
  const generate = useCallback(async () => {
    if (!hasWorkspace) {
      return { ok: false, error: "Report generation is only available in the desktop app." };
    }
    return window.workspace.generateFullReport();
  }, []);

  return { generate, available: hasWorkspace };
}

// Used by every tab's "Share" button. share(items) sends
// { items: [{ label, url, properties }] } — one entry per checked
// panel/window — over to the main process, which saves each one's image
// (decoded from its base64 data: URL) and a properties.json to
// 16_Output/<currentSession>/<Window Label>/. Returns
// { ok:true, sessionFolder, folders } or { ok:false, error }.
export function useShareWindows() {
  const share = useCallback(async (items) => {
    if (!hasWorkspace) {
      return { ok: false, error: "Sharing to disk is only available in the desktop app." };
    }
    return window.workspace.shareWindows({ items });
  }, []);

  return { share, available: hasWorkspace };
}