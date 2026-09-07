// ============================================================================
// ScriptRunner - the ONLY file you touch to add or swap Python/detection
// scripts or compiled executables.
//
// Every button that launches a pipeline stage goes through this class.
// To point an action at a different script or .exe, edit SCRIPT_CONFIG below.
// Nothing else in the codebase needs to change.
//
//   obstacleDetection: {                  // internal action id (used by UI)
//     fileName: "pipeline/obstacle_detection.py",  // .py fallback (dev)
//     exe:      "bin/obstacle_detection.exe",      // .exe preferred (ship)
//     description: "what this script does",
//   },
//
// HOW THE .exe SWAP WORKS:
//   1. Drop a compiled .exe into scripts/bin/ (one per stage).
//   2. Set the `exe` field in SCRIPT_CONFIG to the relative path.
//   3. That's it — ScriptRunner prefers .exe when it exists, falls back
//      to the .py script otherwise.
//
// .py files are launched with the `python` interpreter; .exe files are
// spawned directly (so they also run on machines without Python).
//
// ----------------------------------------------------------------------------
// EXECUTABLE CONTRACT — every SCRIPT_CONFIG exe must obey this. The current
// scripts/bin/*.exe are PyInstaller builds of the .py placeholders; when you
// drop in REAL compiled exes later, keep these three rules and nothing else
// in the app changes:
//
//   1. ARGUMENTS (positional, same for every stage):
//        stage scripts:   exe.exe [inputImagePath?] [outputDir]
//        telemetry:       telemetry.exe [channel] [outputDir]   (channel = "telecommand" | "telemetry")
//        report:          report.exe [manifest.json] [output.pdf]
//
//   2. WORKING DIRECTORY = the selected workspace root folder. It is NOT the
//      place to write outputs — write to the [outputDir] argv instead. (Stages
//      that need a session image get its absolute path as argv[1], resolved by
//      the main process; it is null-safe, so also render placeholder output.)
//
//   3. PROTOCOL: exit code 0 => success (stdout may carry a human line such
//      as "Wrote X.png"), any non-zero exit => failure (stderr is shown in the
//      app's error toast). Must finish before the DEFAULT_TIMEOUT_MS limit.
//      Runs are spawned non-blocking; the UI awaits the process close event.
//
// DEPLOYMENT: real binaries are NOT named in code. Drop
// <workspace root>/bin/<stage>.exe and findScript() returns that path first
// (checked before the bundled scripts/bin exe and the .py fallback), so the
// production swap is a pure file copy per stage — nothing to rebuild.
// ============================================================================

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// ----------------------------------------------------------------------------
// SCRIPT REGISTRY -- EDIT THIS FILE TO CHANGE WHICH SCRIPTS RUN
// ----------------------------------------------------------------------------
const SCRIPT_CONFIG = {
  // Every tab's "Run" button maps to one pipeline stage. Point `fileName` at
  // a .py in scripts/pipeline/ (dev) or a packaged .exe in scripts/bin/
  // (shipped) — the exact same contract the reference VNS build used
  // (01_Dashboard/VNS_DASH.exe plus one output folder per stage).

  // Obstacle Detection tab -> "Run Detection" button
  obstacleDetection: {
    fileName: "pipeline/obstacle_detection.py",
    exe: "bin/obstacle_detection.exe",
    description: "Detects obstacles in the input image and writes 05_Obstacle.Detection outputs (Bbox.jpg, Segmentation.png, Obstacle_details.*).",
  },

  // Safe Path tab -> "Run Path" button
  safePath: {
    fileName: "pipeline/safe_path.py",
    exe: "bin/safe_path.exe",
    description: "Generates the predicted safe path and writes 08_Pred_Safe_Path outputs (SafePath.png, Waypoints.*).",
  },

  // Dist. Map tab -> "Run Distance Map" button
  distanceMap: {
    fileName: "pipeline/distance_map.py",
    exe: "bin/distance_map.exe",
    description: "Computes obstacle distances and writes 06_Distance_Map outputs.",
  },

  // Obs. Det. / any tab wanting preprocessed output -> 04_Preprocessed
  preprocess: {
    fileName: "pipeline/preprocess.py",
    exe: "bin/preprocess.exe",
    description: "Preprocesses and rectifies the input image, writes 04_Preprocessed outputs.",
  },

  // Safe Path / Data -> 07_Occupancy_Grid
  occupancyGrid: {
    fileName: "pipeline/occupancy_grid.py",
    exe: "bin/occupancy_grid.exe",
    description: "Generates the occupancy grid and writes 07_Occupancy_Grid outputs.",
  },

  // Health panel -> 13_Rover_Health_Status
  roverHealth: {
    fileName: "pipeline/rover_health.py",
    exe: "bin/rover_health.exe",
    description: "Writes the Rover Health Status log (13_Rover_Health_Status).",
  },

  // Navigation tab -> 09_Navigation (Visual Odometry / Rover Localization)
  navigation: {
    fileName: "pipeline/navigation.py",
    exe: "bin/navigation.exe",
    description: "Writes the Rover Characterization + localization output (09_Navigation).",
  },

  // Scene Analysis tab -> 14_Scene_Analysis_Report
  sceneAnalysis: {
    fileName: "pipeline/scene_analysis.py",
    exe: "bin/scene_analysis.exe",
    description: "Answers pending scene-analysis queries (14_Scene_Analysis_Report).",
  },

  // Telemetry & Telecommand tab -> 12_Telemetry_Data / 11_Telecommand_Data
  telemetry: {
    fileName: "pipeline/telemetry.py",
    exe: "bin/telemetry.exe",
    description: "Writes the Telemetry / Telecommand log.",
  },

  // Report generation — reads a JSON manifest, writes a PDF report.
  report: {
    fileName: "pipeline/report.py",
    exe: "bin/report.exe",
    description: "Generates a formatted PDF report from a JSON manifest.",
  },
};

const DEFAULT_TIMEOUT_MS = 120000;

class ScriptRunner {
  constructor(opts = {}) {
    this.config = opts.config || SCRIPT_CONFIG;
    this.appPath = opts.appPath;
  }

  // Where bundled scripts live on disk. In a packaged build Electron packs
  // app files into an asar archive, but a spawned .exe needs a REAL path, so
  // we must use the automatically unpacked copy (app.asar.unpacked). The
  // plain path.join(appPath, "scripts") would point INSIDE the asar — and
  // although Electron's patched fs.existsSync reports those phantom asar
  // paths as existing, they are not real on disk, so spawn() fails with
  // ENOENT. We therefore check the unpacked dir FIRST, and only fall back to
  // the raw path when packing is off (dev / unpacked mode where no asar
  // exists and appPath/scripts is genuinely on disk).
  scriptDirs() {
    const unpacked = path.join(this.appPath, "..", "app.asar.unpacked", "scripts");
    const plain = path.join(this.appPath, "scripts");
    // app.getAppPath() ends in ".asar" only when packaged; then the unpacked
    // dir is the one that holds REAL files on disk for spawn().
    const packaged = !!this.appPath && path.extname(this.appPath) === ".asar";
    return packaged ? [unpacked, plain] : [plain, unpacked];
  }

  // All configured actions (id + fileName + description). Exposed to the UI
  // so the renderer can list what scripts are registered.
  getActions() {
    return Object.entries(this.config).map(([id, cfg]) => ({
      id,
      fileName: cfg.fileName,
      description: cfg.description || "",
    }));
  }

  // Resolve a configured action to an absolute path that exists.
  // Prefers a real .exe dropped in `overrideDir` (e.g. <workspace>/bin — the
  // ship-time swap point for production binaries) over the bundled dirs,
  // then the compiled .exe, then the .py dev script.
  // Returns { path, isExe } or null if neither exists.
  findScript(actionId, overrideDir) {
    const cfg = this.config[actionId];
    if (!cfg) return null;
    const check = (dir, file) => {
      if (!dir || !file) return null;
      const p = path.join(dir, file);
      return fs.existsSync(p) ? { path: p, isExe: path.extname(p).toLowerCase() === ".exe" } : null;
    };
    if (cfg.exe && overrideDir) {
      const overrideHit = check(overrideDir, path.basename(cfg.exe));
      if (overrideHit) return overrideHit;
    }
    for (const file of [cfg.exe, cfg.fileName]) {
      if (!file) continue;
      for (const dir of this.scriptDirs()) {
        const hit = check(dir, file);
        if (hit) return hit;
      }
    }
    return null;
  }

  // Run a configured script. Resolves { ok, actionId, script, stdout,
  // stderr, ... } -- never throws.
  run(actionId, args = [], opts = {}) {
    const cfg = this.config[actionId];
    if (!cfg) {
      return Promise.resolve({ ok: false, actionId, error: "unknown-action", script: null });
    }
    const found = this.findScript(actionId, opts.overrideDir);
    if (!found) {
      return Promise.resolve({ ok: false, actionId, error: "script-not-found", script: cfg.fileName });
    }
    const { path: scriptPath, isExe } = found;

    // .py files can't be spawn'd directly on Windows (spawn EFTYPE), so
    // prepend an interpreter. Compiled .exe binaries are launched directly.
    const isPy = !isExe;
    const file = isPy ? "python" : scriptPath;
    const fileArgs = isPy ? [scriptPath, ...args] : args;
    const cwd = opts.cwd;
    const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

    return new Promise((resolve) => {
      const child = spawn(file, fileArgs, { cwd });
      let stdout = "";
      let stderr = "";
      let done = false;

      const finish = (status, body) => {
        if (done) return;
        done = true;
        resolve({ ok: status === "ok", actionId, script: scriptPath, isExe, stdout, stderr, ...body });
      };

      const timer = setTimeout(() => {
        child.kill();
        finish("error", { error: "timeout" });
      }, timeoutMs);

      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("error", (err) => { clearTimeout(timer); finish("error", { error: err.message }); });
      child.on("close", (code) => {
        clearTimeout(timer);
        finish(code === 0 ? "ok" : "error", code === 0 ? {} : { error: `exit code ${code}` });
      });
    });
  }
}

module.exports = { ScriptRunner, SCRIPT_CONFIG };