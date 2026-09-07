import "./App.css";
import { useState, useRef, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle } from "react";
import { useAuth } from "./auth/useAuth";
import AdminPanel from "./auth/AdminPanel";
import UserMenu from "./auth/UserMenu";
import RoleRequestButton from "./auth/RoleRequestButton";
import { AddScreenModal, CustomScreen, useCustomScreens } from "./CustomScreens";
import { useWorkspaceRoot, useInputCaptureWatch, useLatestProperties, useRawImagesWatch, usePreprocessedImages, useObstacleDetection, useDistanceMap, useOccupancyGrid, usePredSafePath, useRoverHealthStatus, useInputImageLog, useWaypointsLog, useTelemetryLog, useTelecommandLog, useTelemetryRunner, usePipelineRunner, useNavigationImages, useNavigationProperties, useRosSimulationVideo, useSceneAnalysisQuery, useWindowFolder, useGenerateReport, useShareWindows, runAlgorithms } from "./hooks/useWorkspace";

import {
  Play,
  Maximize2,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Upload,
  Sun,
  Moon,
  Pencil,
  Check,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Info,
  Settings,
  Cpu,
  RefreshCw,
} from "lucide-react";

/* ==================================================================
   Vision Navigation Software (VNS)
   Shared shell (status bar + screen rail) plus three built screens:
   Input, Obstacle Detection, Safe Path. Every screen is generated /
   simulated client-side — there is no backend yet, by design.
=================================================================== */

const CORE_SCREENS = ["Input", "Obs. Det.", "Safe Path", "Dist. Map", "Navigation", "Scene Analysis", "Telemetry", "Data"];

// Google Fonts loaded at runtime for the pairings below that need them
// (system/serif/mono/rounded need nothing extra). See the useEffect in
// VNSApp that injects this stylesheet on mount.
const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Rajdhani:wght@500;600;700&family=Orbitron:wght@600;700&family=Exo+2:wght@400;500;600&family=Share+Tech+Mono&family=Roboto:wght@400;500;700&family=Roboto+Condensed:wght@600;700&family=Roboto+Mono:wght@400;500&family=Sora:wght@600;700&family=Source+Sans+3:wght@400;600&family=Source+Code+Pro:wght@400;500&display=swap";

// Each pairing sets a heading face, a body face, and a monospace face
// (used for IDs/coordinates/data-table cells) — a real "GUI combination"
// rather than a single font applied everywhere. Picked for a technical,
// mission-control feel while keeping a couple of safe, download-free
// fallbacks (system / serif / mono-only / rounded).
const FONT_PAIRINGS = {
  system: {
    label: "System Default",
    heading: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
    note: "No download required — safest fallback.",
  },
  serif: {
    label: "Serif (Georgia)",
    heading: "Georgia, 'Times New Roman', Times, serif",
    body: "Georgia, 'Times New Roman', Times, serif",
    mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
    note: "Editorial and warm — a deliberate contrast to the technical look.",
  },
  plex: {
    label: "Mission Control Classic",
    heading: "'IBM Plex Sans', -apple-system, sans-serif",
    body: "'IBM Plex Sans', -apple-system, sans-serif",
    mono: "'IBM Plex Mono', 'SFMono-Regular', monospace",
    note: "IBM's own engineering-software trio — the pairing real technical dashboards use.",
  },
  hud: {
    label: "Modern HUD",
    heading: "'Space Grotesk', -apple-system, sans-serif",
    body: "'Inter', -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SFMono-Regular', monospace",
    note: "Geometric headers over a very legible body — current dev-tool aesthetic.",
  },
  console: {
    label: "Aerospace Console",
    heading: "'Rajdhani', -apple-system, sans-serif",
    body: "'Inter', -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SFMono-Regular', monospace",
    note: "Condensed, technical headers evoke a HUD without hurting body readability.",
  },
  deepspace: {
    label: "Deep Space Display",
    heading: "'Orbitron', -apple-system, sans-serif",
    body: "'Exo 2', -apple-system, sans-serif",
    mono: "'Share Tech Mono', 'SFMono-Regular', monospace",
    note: "The boldest sci-fi look — increase font size if you pick this one.",
  },
  engineering: {
    label: "Clean Engineering",
    heading: "'Roboto Condensed', -apple-system, sans-serif",
    body: "'Roboto', -apple-system, sans-serif",
    mono: "'Roboto Mono', 'SFMono-Regular', monospace",
    note: "Google's battle-tested trio — safe, dense, and legible at small sizes.",
  },
  editorial: {
    label: "Editorial Technical",
    heading: "'Sora', -apple-system, sans-serif",
    body: "'Source Sans 3', -apple-system, sans-serif",
    mono: "'Source Code Pro', 'SFMono-Regular', monospace",
    note: "Slightly warmer and less robotic while staying precise.",
  },
  mono: {
    label: "Monospace Only",
    heading: "'JetBrains Mono', 'SFMono-Regular', monospace",
    body: "'JetBrains Mono', 'SFMono-Regular', monospace",
    mono: "'JetBrains Mono', 'SFMono-Regular', monospace",
    note: "Full terminal feel throughout — every label reads like telemetry.",
  },
  rounded: {
    label: "Rounded",
    heading: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif",
    body: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif",
    mono: "'SFMono-Regular', Consolas, monospace",
    note: "Softer and friendlier if the mission-control look feels too cold.",
  },
};

/* ---------------- deterministic pseudo-random helpers ---------------- */
const rand = (seed, i = 0) => {
  const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const terrainDataUri = (seed, tint = "#0c1116") => {
  const rocks = Array.from({ length: 16 }, (_, i) => {
    const x = rand(seed, i) * 100;
    const y = 44 + rand(seed, i + 50) * 54;
    const r = 1 + rand(seed, i + 90) * 3.4;
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 0.6).toFixed(1)}" fill="rgba(255,255,255,0.07)"/>`;
  }).join("");
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>
      <rect width='100' height='100' fill='${tint}'/>
      <rect y='42' width='100' height='58' fill='#171f27'/>
      ${rocks}
    </svg>`
  )}`;
};

/* ---------------- DATA screen: one log per other screen's window, cycled in the Parameter Table ----------------
   No demo/mock rows here — every table starts empty (like every other
   screen) and is only ever filled from real data pulled off disk. */
const PARAMETER_TABLES = [
  {
    key: "img",
    heading: "Parameter Table - L/R/PP Image",
    columns: [
      { label: "Image Path", key: "path" },
      { label: "Image Size", key: "size" },
      { label: "Resolution", key: "resolution" },
      { label: "Timestamp", key: "timestamp" },
      { label: "Property_05", key: "p05" },
    ],
    rows: [],
  },
  {
    key: "obsdet",
    heading: "Parameter Table - Obstacle Detection",
    columns: [
      { label: "Obs. ID", key: "id" },
      { label: "confidence", key: "conf" },
      { label: "Type", key: "type" },
      { label: "Height", key: "height" },
      { label: "Property_05", key: "p05" },
    ],
    rows: [],
  },
  {
    key: "occupancy",
    heading: "Parameter Table - Occupancy Grid",
    columns: [
      { label: "Obs. ID", key: "id" },
      { label: "Type", key: "type" },
      { label: "Coord_X", key: "x" },
      { label: "Coord_Z", key: "z" },
      { label: "Width", key: "width" },
    ],
    rows: [],
  },
  {
    key: "waypoints",
    heading: "Parameter Table - Waypoints",
    columns: [
      { label: "Waypoint ID", key: "id" },
      { label: "Coord_X", key: "x" },
      { label: "Coord_Z", key: "z" },
      { label: "Property_04", key: "p04" },
      { label: "Property_05", key: "p05" },
    ],
    rows: [],
  },
  {
    key: "distances",
    heading: "Parameter Table - Obstacle Distances",
    columns: [
      { label: "Obs. ID", key: "id" },
      { label: "Type", key: "type" },
      { label: "Height", key: "height" },
      { label: "Width", key: "width" },
      { label: "Distance", key: "distance" },
    ],
    rows: [],
  },
];

const ROVER_TABLE = {
  heading: "Rover Characterization",
  columns: [
    { label: "Subsystem", key: "subsystem" },
    { label: "Status", key: "status" },
    { label: "Health", key: "health" },
    { label: "Battery", key: "battery" },
  ],
  rows: [],
};

const TELEMETRY_COLUMNS = [
  { label: "Module", key: "module" },
  { label: "Size", key: "size" },
  { label: "Value", key: "value" },
  { label: "Timestamp", key: "timestamp" },
  { label: "Status", key: "status" },
];

const TELECOMMAND_COLUMNS = [
  { label: "Module", key: "module" },
  { label: "Size", key: "size" },
  { label: "Value", key: "value" },
  { label: "Timestamp", key: "timestamp" },
  { label: "Status", key: "status" },
];

/* ================================================================
   Toast / alert framework — used by Share & Generate Report so the
   "explicit, context-specific alerts" requirement is a real thing
   rather than a static mock.
================================================================= */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((toast) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, ...toast }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  return { toasts, push, dismiss };
}

function ToastStack({ toasts, dismiss }) {
  const icon = { success: CheckCircle2, error: AlertTriangle, info: Info };
  return (
    <div className="toasts">
      {toasts.map((t) => {
        const Icon = icon[t.type] || Info;
        return (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <Icon size={15} />
            <div className="toast__body">
              <strong>{t.title}</strong>
              {t.message && <span>{t.message}</span>}
            </div>
            <button onClick={() => dismiss(t.id)} className="toast__close">
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- small shared atoms ---------------- */

function IconBtn({ title, onClick, active, children }) {
  return (
    <button type="button" title={title} onClick={onClick} className={`icon-btn${active ? " icon-btn--active" : ""}`}>
      {children}
    </button>
  );
}

function Checkbox({ checked, onChange, title }) {
  return (
    <button
      type="button"
      className={`chk${checked ? " chk--on" : ""}`}
      onClick={() => onChange(!checked)}
      title={title || "Select for sharing"}
      aria-pressed={checked}
    >
      {checked && <Check size={11} strokeWidth={3} />}
    </button>
  );
}

function ToggleStack({ options, value, onChange }) {
  return (
    <div className="toggle-stack">
      {options.map((opt) => (
        <button
          key={opt}
          className={`toggle-pill${value === opt ? " toggle-pill--on" : ""}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// Shared by every per-tab report below: turns that tab's Image Properties
// panel (Property_01..05, whatever labels the sidecar file gave them) into
// its own report section, so a report includes the same properties the
// screen is showing on-screen — not just the images/obstacle table.
// Returns null (section omitted) if every field is still blank.
function imagePropertiesReportSection(imgProps) {
  const rows = [
    ["Image Path", imgProps.path],
    ["Image Size", imgProps.size],
    ["Resolution", imgProps.resolution],
    ["TimeStamp", imgProps.timestamp],
    ["Property_05", imgProps.p05],
  ].filter(([, value]) => String(value ?? "").trim() !== "");
  if (!rows.length) return null;
  return {
    heading: "Image Properties",
    table: { columns: ["Parameter", "Value"], rows },
  };
}

// Shared by every per-tab report below: turns the Rover Characteristics
// panel (13_Rover_Health_Status) into its own report section. Returns null
// (section omitted) if no real health rows have loaded yet.
function roverCharacteristicsReportSection(roverHealth) {
  if (!roverHealth || !roverHealth.length) return null;
  return {
    heading: "Rover Characteristics",
    table: {
      columns: ["Subsystem", "Status", "Health", "Battery"],
      rows: roverHealth.map((r) => [
        r.subsystem ?? "",
        r.status ?? "",
        r.health === "" || r.health === null || r.health === undefined ? "" : `${r.health}%`,
        r.battery === "" || r.battery === null || r.battery === undefined ? "" : `${r.battery}%`,
      ]),
    },
  };
}
/* ---------------- Shared "Generate Report" runner ----------------
   Every screen below builds its own `sections` array (one entry per
   checked panel, plus that tab's parameter table where it has one) and
   hands it to this helper, which calls the real PDF generator exposed by
   useGenerateReport() and turns the result into the right toast. Keeping
   this in one place means every tab's success/error messaging (and the
   "desktop app only" / "nothing selected" guards) stays consistent. */
async function runGenerateReport(generateReport, pushToast, tabLabel, sections) {
  if (!generateReport?.available) {
    pushToast({ type: "error", title: "Report unavailable", message: "Report generation is only available in the desktop app." });
    return;
  }
  const result = await generateReport.generate({ tabLabel, sections });
  if (result.cancelled) {
    pushToast({ type: "info", title: "Report cancelled", message: "Save dialog was cancelled — no report was written." });
  } else if (result.ok) {
    pushToast({
      type: "success",
      title: "Report generated",
      message: `Saved to ${result.path}`,
    });
  } else {
    pushToast({ type: "error", title: "Report failed", message: result.error || "Could not generate the report." });
  }
}

/* ---------------- Shared "Share" runner ----------------
   Every screen below builds its own `items` array (one entry per checked
   panel — { label, url or images, properties }) and hands it to this
   helper, which calls the real filesystem writer exposed by
   useShareWindows() and turns the result into the right toast. Mirrors
   runGenerateReport() above: same "desktop app only" / "nothing selected"
   guards, same consistent success/error messaging. On success, each item
   lands at 16_Output/<session>/<Window Label>/ (image + properties.json). */
async function runShareWindows(shareWindows, pushToast, items) {
  if (!shareWindows?.available) {
    pushToast({ type: "error", title: "Share unavailable", message: "Sharing to disk is only available in the desktop app." });
    return;
  }
  const result = await shareWindows.share(items);
  if (result.ok) {
    pushToast({
      type: "success",
      title: "Shared",
      message: `${result.folders.length} item(s) saved to 16_Output/${result.sessionFolder}/`,
    });
  } else {
    pushToast({ type: "error", title: "Share failed", message: result.error || "Could not share the selected windows." });
  }
}

/* ---------------- Shared "Run Python script" button + console modal ----------------
   The Obs. Det. tab's "Run Detection" is the template every tab now gets:
   a primary button that launches that tab's own Python (.py, later .exe)
   stage script via ScriptRunner into the active session's stage folder,
   shows a console modal with the real stdout/stderr, toasts the outcome,
   and calls onDone() so the tab can refresh whatever the script wrote.

   props:
     actionId    — pipeline action registered in electron/scriptRunner.cjs
                    (safePath, distanceMap, preprocess, occupancyGrid,
                    roverHealth, navigation, sceneAnalysis, ...)
     label       — button text, e.g. "Run Safe Path"
     runningLabel— text while the script is running (default "Running...")
     title       — toast/modal title, e.g. "Safe Path"
     hint        — input hint passed to the stage runner ("left"/"right"),
                    default "left"
     onDone      — async callback fired after a successful run so the tab
                    can reload its panels (default none)
*/
function PipelineRunButton({ actionId, label, runningLabel, title, hint = "left", pushToast, onDone }) {
  const pipeline = usePipelineRunner();
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);

  const handleRun = async () => {
    if (running) return;
    if (!pipeline.available) {
      pushToast?.({
        type: "error",
        title: title || label,
        message: "Pipeline execution is only available in the desktop app.",
      });
      return;
    }
    setRunning(true);
    setRunResult(null);
    const runTitle = title || label;
    pushToast?.({ type: "info", title: runTitle, message: "Running script..." });
    try {
      const result = await pipeline.run(actionId, hint);
      if (!result) {
        setRunResult({ ok: false, script: null, stdout: "", stderr: "No result returned from the main process.", error: "no-result" });
        pushToast?.({ type: "error", title: runTitle, message: "Script failed: no result returned." });
      } else if (result.ok) {
        const which = result.script ? ` (${result.script})` : "";
        pushToast?.({ type: "success", title: runTitle, message: `Script completed${which}.` });
        setRunResult(result);
        if (onDone) await onDone();
      } else {
        setRunResult(result);
        pushToast?.({
          type: "error",
          title: runTitle,
          message:
            result?.error === "no-root"
              ? "No Workspace Folder selected. Click 'Select Folder' at the top of the Input tab first."
              : result?.error === "script-not-found"
                ? `Script not found (${result.script}). Add it to scripts/ and set its fileName in electron/scriptRunner.cjs.`
                : `Script failed: ${result?.stderr || result?.error || "unknown error"}`,
        });
      }
    } catch (err) {
      setRunResult({ ok: false, script: null, stdout: "", stderr: String(err), error: "exception" });
      pushToast?.({ type: "error", title: runTitle, message: String(err) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <button className="btn btn-primary" onClick={handleRun} disabled={running}>
        {running ? runningLabel || "Running..." : label}
      </button>

      {runResult && (
        <div className="modal-overlay" onClick={() => setRunResult(null)}>
          <div className="modal modal--console" onClick={(e) => e.stopPropagation()}>
            <div className="modal__bar">
              <span className="modal__title">{title || label} Output — {runResult.ok ? "completed" : "failed"}</span>
              <button className="modal__close" onClick={() => setRunResult(null)}><X size={15} /></button>
            </div>
            <div className="modal__stage modal__stage--console">
              <pre className="console">
                <span className="dim">script : {runResult.script || "(none)"}</span>{"\n"}
                <span className={runResult.ok ? "ok" : "err"}>
                  status : {runResult.ok ? "success" : "failed"}{runResult.error ? ` — ${runResult.error}` : ""}
                </span>{"\n"}
                <span className="dim">input  : {runResult.inputImage || "(none resolved)"}</span>{"\n"}
                <span className="dim">output : {runResult.outputDir || "(none)"}</span>{"\n"}
                {"\n"}
                {runResult.stdout ? (
                  <>
                    <span className="dim">--- stdout ---</span>{"\n"}
                    {runResult.stdout}
                    {"\n"}
                  </>
                ) : null}
                {runResult.error === "no-root" ? (
                  <>
                    <span className="err">No Workspace Folder is selected.</span>{"\n"}
                    <span className="dim">Click 'Select Folder' at the top of the Input tab to choose your vns-app data folder, then run the script again.</span>
                  </>
                ) : runResult.stderr ? (
                  <>
                    <span className="err">--- stderr ---</span>{"\n"}
                    <span className="err">{runResult.stderr}</span>
                    {"\n"}
                  </>
                ) : null}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ================================================================
   SCENE ANALYSIS screen
   NavCam Imagery + Obstacle-with-Safe-Path panels on the left, a
   Query panel underneath them (replaces the static "Scene Analysis
   points" table from the mockup), and a live Scene Analysis Report
   panel on the right that renders whatever query was last run.
   No backend is connected yet — handleRunQuery calls the expected
   endpoint and falls back to a simulated result so the UI stays
   usable; swap the fetch URL for your real API when it's ready.
================================================================= */
function SceneAnalysisScreen({ setExpandedContent, pushToast, inputCapture, predSafePathCapture, sceneQuery, runSignal, generateReport, shareWindows }) {
  const [activeWindow, setActiveWindow] = useState("navcam");
  const [selected, setSelected] = useState({ navcam: true, obstacle: true, report: true });
  const [query, setQuery] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState("");
  const pollRef = useRef(null);

  // Scene-analysis query history (Task 2b): every query + its response is
  // kept in order on this screen, and the "Scroll History" buttons let the
  // user page back through past entries in the report panel. historyIndex
  // points at the history entry currently shown (null = the live/latest
  // report).
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(null);

  // NavCam Imagery <- latest capture in 03_Input_Image (Left+Right, same
  // source as the Input screen's NavCam panel — flip with the arrows).
  // Obstacle with Safe path <- latest image in 08_Pred_Safe_Path.
  const [navcamImages, setNavcamImages] = useState([]);
  const [safePathImg, setSafePathImg] = useState(null);

  const loadAll = useCallback(async () => {
    if (inputCapture?.available) {
      const capture = await inputCapture.loadLatest();
      setNavcamImages([capture.left, capture.right].filter(Boolean));
    }
    if (predSafePathCapture?.available) {
      const result = await predSafePathCapture.loadLatest();
      setSafePathImg(result.image);
    }
  }, [inputCapture, predSafePathCapture]);

  // Intentionally NOT loading on mount — this screen (like every other
  // screen) starts empty on login / on first visiting the tab. Nothing is
  // pulled in from disk until Run Algorithms succeeds (runSignal bumps).
  useEffect(() => {
    if (runSignal === 0) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSignal]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // Always stop polling for a response when the screen unmounts, so a
  // query left "waiting" doesn't keep hitting disk after the user's
  // navigated away.
  useEffect(() => stopPolling, []);

  // Run Query no longer answers anything itself — it just drops
  // Query_<n>.txt into this session's 14_Scene_Analysis_Report folder
  // (n = 1, 2, 3... climbing per session) and then polls every few
  // seconds for a matching Response_<n>.txt written back by whatever
  // external process is answering it. Running a new query cancels
  // whatever poll was still waiting on the previous one.
  const runQuery = async () => {
    const q = query.trim();
    if (!q) {
      pushToast({ type: "error", title: "Empty query", message: "Type a query before running it." });
      return;
    }

    stopPolling();
    setIsRunning(true);

    const written = await sceneQuery.writeQuery(q);
    if (written.error) {
      setIsRunning(false);
      const message =
        written.error === "no-session"
          ? "Run Algorithms at least once this session before running a query."
          : written.error;
      pushToast({ type: "error", title: "Couldn't save query", message });
      return;
    }

    const { number } = written;
    const entryId = Date.now();
    setHistory((h) => [
      ...h,
      { id: entryId, number, query: q, answer: "", status: "waiting" },
    ]);
    setHistoryIndex(null);
    setReport(`Query #${number}: "${q}"\n\nWaiting for response...`);

    pollRef.current = setInterval(async () => {
      const result = await sceneQuery.readResponse(number);
      if (result.found) {
        stopPolling();
        setIsRunning(false);
        const answer = `Query #${number}: "${q}"\n\n${result.answer}`;
        setReport(answer);
        setHistory((h) =>
          h.map((e) =>
            e.id === entryId ? { ...e, answer: result.answer, status: "done" } : e
          )
        );
      }
    }, 3000);
  };

  const handleReport = async () => {
    const checkedCount = Object.values(selected).filter(Boolean).length;
    if (checkedCount === 0) {
      pushToast({ type: "error", title: "Report failed", message: "No windows are selected. Check at least one panel first." });
      return;
    }
    const images = [];
    if (selected.navcam) {
      navcamImages.forEach((url, i) =>
        images.push({ caption: navcamImages.length > 1 ? `NavCam Imagery ${i + 1}` : "NavCam Imagery", url })
      );
    }
    if (selected.obstacle && safePathImg) {
      images.push({ caption: "Obstacle with Safe Path", url: safePathImg });
    }
    const sections = [
      {
        heading: "Scene Description",
        intro: "The record of the scene analysis for the selected windows is as follows:",
        images,
        text: selected.report && report.trim() ? report.trim() : undefined,
      },
    ];
    await runGenerateReport(generateReport, pushToast, "Scene Analysis", sections);
  };

  const handleShare = async () => {
    const checkedCount = Object.values(selected).filter(Boolean).length;
    if (checkedCount === 0) {
      pushToast({ type: "error", title: "Share failed", message: "No windows are selected. Check at least one panel first." });
      return;
    }
    const items = [];
    if (selected.navcam && navcamImages.length) items.push({ label: "NavCam Imagery", images: navcamImages });
    if (selected.obstacle && safePathImg) items.push({ label: "Obstacle with Safe Path", url: safePathImg });
    if (selected.report && report.trim()) items.push({ label: "Scene Analysis Report", properties: { report: report.trim() } });
    await runShareWindows(shareWindows, pushToast, items);
  };

  const scrollHistory = (dir) => {
    if (history.length === 0) {
      pushToast({ type: "error", title: "No history", message: "Run a query first — there's no history to scroll yet." });
      return;
    }
    setHistoryIndex((cur) => {
      const base = cur === null ? history.length - 1 : cur;
      const next = Math.max(0, Math.min(history.length - 1, base + dir));
      return next;
    });
  };

  const currentHistoryEntry = historyIndex === null ? null : history[historyIndex];

  const shownReport =
    currentHistoryEntry && !currentHistoryEntry.answer
      ? `Query #${currentHistoryEntry.number}: "${currentHistoryEntry.query}"\n\nWaiting for response...`
      : currentHistoryEntry
      ? `Query #${currentHistoryEntry.number}: "${currentHistoryEntry.query}"\n\n${currentHistoryEntry.answer || "No response recorded."}`
      : report;

  return (
    <div className="content">
      <div className="screen-grid scene-analysis-grid">
        <div className="scene-analysis-left">
          <div className="scene-analysis-imgrow">
            <ResultPanel id="navcam" title="NavCam Imagery" selected={selected.navcam}
              onSelectChange={(v) => setSelected((s) => ({ ...s, navcam: v }))}
              activeWindow={activeWindow} onFocus={setActiveWindow}
              images={navcamImages}
              onExpand={() => setExpandedContent({ title: "NavCam Imagery", uri: navcamImages[0] || null })} />
            <ResultPanel id="obstacle" title="Obstacle with Safe path" selected={selected.obstacle}
              onSelectChange={(v) => setSelected((s) => ({ ...s, obstacle: v }))}
              activeWindow={activeWindow} onFocus={setActiveWindow}
              imageSrc={safePathImg}
              onExpand={() => setExpandedContent({ title: "Obstacle with Safe path", uri: safePathImg || null })} />
          </div>

          <section
            className={`panel scene-analysis-query${activeWindow === "query" ? " panel--focused" : ""}`}
            onMouseDown={() => setActiveWindow("query")}
          >
            <header className="panel__bar">
              <h3 className="panel__title">Query</h3>
              <div className="panel__tools">
                <button className="btn btn-primary btn-sm" onClick={runQuery} disabled={isRunning}>
                  {isRunning ? "Running..." : "Run Query"}
                </button>
              </div>
            </header>
            <div className="scene-analysis-query__body">
              <textarea
                className="scene-analysis-query__input"
                placeholder='Enter analysis query (e.g. "safe path distance at 0.674N, 23.473E")'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runQuery();
                }}
              />
            </div>
          </section>
        </div>

        <aside className="sidepanel scene-analysis-right">
          <section
            className={`panel scene-analysis-report${activeWindow === "report" ? " panel--focused" : ""}`}
            onMouseDown={() => setActiveWindow("report")}
          >
            <header className="panel__bar">
              <Checkbox checked={selected.report} onChange={(v) => setSelected((s) => ({ ...s, report: v }))} />
              <h3 className="panel__title">Scene Analysis Report</h3>
              <div className="panel__tools scene-analysis-history__tools">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => scrollHistory(-1)}
                  disabled={historyIndex === 0 || (historyIndex === null && history.length === 0)}
                  title="Previous query in history"
                >
                  <ChevronLeft size={14} /> History
                </button>
                {historyIndex !== null && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setHistoryIndex(null)}
                    title="Back to the latest report"
                  >
                    Latest
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => scrollHistory(1)}
                  disabled={historyIndex === history.length - 1}
                  title="Next query in history"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </header>
            <div className="scene-analysis-report__body">
              {historyIndex !== null && (
                <div className="scene-analysis-report__scope">
                  History {historyIndex + 1} of {history.length}
                </div>
              )}
              {shownReport ? (
                <pre className="scene-analysis-report__text">{shownReport}</pre>
              ) : (
                <span className="scene-analysis-report__placeholder">
                  Run a query on the left to display the analysis report here…
                </span>
              )}
            </div>
          </section>

          <div className="btn-row">
            <PipelineRunButton
              actionId="sceneAnalysis"
              label="sceneanalysis.exe"
              runningLabel="Analyzing..."
              title="Scene Analysis"
              hint="left"
              pushToast={pushToast}
              onDone={loadAll}
            />
            <button className="btn" onClick={handleReport}>Generate Report</button>
            <button className="btn btn-primary" onClick={handleShare}>Share</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
/* ---------------- DataTablePanel — real data table used by the Data screen ---------------- */
function DataTablePanel({ id, title, table, showNav, onPrev, onNext, selected, onSelectChange, activeWindow, onFocus, onExpand, fit }) {
  return (
    <section className={`panel data-table-panel${fit ? " data-table-panel--fit" : ""}${activeWindow === id ? " panel--focused" : ""}`} onMouseDown={() => onFocus(id)}>
      <header className="panel__bar">
        {showNav && (
          <button className="panel__nav-arrow" onClick={onPrev} title="Previous table">
            <ChevronLeft size={14} />
          </button>
        )}
        <Checkbox checked={selected} onChange={onSelectChange} />
        <h3 className="panel__title">{title}</h3>
        <div className="panel__tools">
          <IconBtn title="Expand" onClick={onExpand}>
            <Maximize2 size={12} />
          </IconBtn>
          {showNav && (
            <button className="panel__nav-arrow" onClick={onNext} title="Next table">
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </header>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Img No.</th>
              {table.columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                <td>{i + 1}.</td>
                {table.columns.map((c) => (
                  <td key={c.key}>{row[c.key] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Navigation screen panel (no prev arrow; checkbox only on the main feed) ---------------- */
function NavFeedPanel({ id, title, onAdvance, showCheckbox, selected, onSelectChange, activeWindow, onFocus, onExpand, compact, imageSrc, videoSrc }) {
  const isReal = !!(imageSrc || videoSrc);
  return (
    <section className={`panel${compact ? " panel--compact" : ""}${activeWindow === id ? " panel--focused" : ""}`} onMouseDown={() => onFocus(id)}>
      <header className="panel__bar">
        {showCheckbox && <Checkbox checked={selected} onChange={onSelectChange} />}
        <h3 className="panel__title">{title}</h3>
        <div className="panel__tools">
          <IconBtn title="Expand" onClick={onExpand}>
            <Maximize2 size={12} />
          </IconBtn>
          {!isReal && (
            <button className="panel__nav-arrow" onClick={onAdvance} title="Next frame">
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </header>
      <div className="panel__stage">
        {videoSrc ? (
          <video src={videoSrc} className="panel__img" controls />
        ) : isReal ? (
          <img src={imageSrc} alt={title} className="panel__img" draggable={false} />
        ) : (
          <div className="panel__empty"><span>No media loaded</span></div>
        )}
      </div>
    </section>
  );
}

/* ================================================================
   ResultPanel — read-only analysis panel used on Obstacle Detection
   and Safe Path (as opposed to Input's upload-driven ViewerPanel).
================================================================= */
function ResultPanel({
  id,
  title,
  selected,
  onSelectChange,
  activeWindow,
  onFocus,
  onExpand,
  toggleOptions,
  toggleValue,
  onToggleChange,
  imageSrc, // real captured image (base64 data URL) — empty by default
  images, // real paged image set (base64 data URLs), e.g. all of 04_Preprocessed
  frameIndex, // optional: controlled frame index, shared across tabs showing the same image set (e.g. Preprocessed Image on Obs. Det. + Safe Path)
  onFrameChange, // optional: setter for frameIndex — required together with frameIndex
  fit, // optional: 'contain' shows the whole image uncropped (letterboxed); defaults to the existing fill/crop behavior
}) {
  const [internalFrame, setInternalFrame] = useState(0);
  const isControlled = frameIndex !== undefined && !!onFrameChange;
  const frame = isControlled ? frameIndex : internalFrame;
  const setFrame = isControlled ? onFrameChange : setInternalFrame;

  const hasRealFrames = !!(images && images.length);
  const frameCount = hasRealFrames ? images.length : imageSrc ? 1 : 0;

  useEffect(() => {
    if (!isControlled) setInternalFrame(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  const displaySrc = hasRealFrames ? images[Math.min(frame, images.length - 1)] : imageSrc || null;

  return (
    <section className={`panel${activeWindow === id ? " panel--focused" : ""}`} onMouseDown={() => onFocus(id)}>
      <header className="panel__bar">
        <Checkbox checked={selected} onChange={onSelectChange} />
        <button className="panel__nav-arrow" onClick={() => setFrame((f) => Math.max(0, f - 1))} disabled={frame === 0 || frameCount === 0} title="Previous frame">
          <ChevronLeft size={14} />
        </button>
        <h3 className="panel__title">{title}</h3>
        <div className="panel__tools">
          <IconBtn title="Expand" onClick={onExpand}>
            <Maximize2 size={12} />
          </IconBtn>
          <button className="panel__nav-arrow" onClick={() => setFrame((f) => Math.min(Math.max(0, frameCount - 1), f + 1))} disabled={frame >= frameCount - 1 || frameCount === 0} title="Next frame">
            <ChevronRight size={14} />
          </button>
        </div>
      </header>

      <div className="panel__stage">
        {displaySrc ? (
          <img
            src={displaySrc}
            alt={title}
            className="panel__img"
            style={fit === "contain" ? { objectFit: "contain", background: "#0c1116" } : undefined}
            draggable={false}
          />
        ) : (
          <div className="panel__empty"><span>No image loaded</span></div>
        )}
        {toggleOptions && <ToggleStack options={toggleOptions} value={toggleValue} onChange={onToggleChange} />}
        {frameCount > 0 && <div className="panel__counter">frame {frame + 1} / {frameCount}</div>}
      </div>
    </section>
  );
}

/* ---------------- property box + row ---------------- */

function PropRow({ label, value, onChange, mono = true, extra }) {
  return (
    <div className="proprow">
      {/* A non-breaking space glues the colon to the label's last word so
          it can never wrap onto its own line by itself (e.g. long rover
          labels like "NavCam - Health" in the narrow sidebar) — the colon
          now only ever appears right after whichever word it belongs to. */}
      <label className="proprow__label">{label}&nbsp;:</label>
      <input
        className="proprow__input"
        style={mono ? undefined : { fontFamily: "var(--sans)" }}
        value={value}
        placeholder="—"
        onChange={(e) => onChange(e.target.value)}
      />
      {extra}
    </div>
  );
}

function PropBox({ title, children, spinner }) {
  return (
    <div className="propbox">
      <div className="propbox__title">
        <span>{title}</span>
        {spinner && (
          <div className="propbox__spinner">
            <button onClick={spinner.up} title="Next obstacle"><ChevronUp size={12} /></button>
            <button onClick={spinner.down} title="Previous obstacle"><ChevronDown size={12} /></button>
          </div>
        )}
      </div>
      <div className="propbox__body">{children}</div>
    </div>
  );
}

/* ================================================================
   INPUT screen (upload-driven)
================================================================= */
function ViewerPanel({ id, title, images, index, onNav, selected, onSelectChange, playing, onTogglePlay, onExpand, onUpload, compact, activeWindow, onFocus }) {
  const fileRef = useRef(null);
  const hasImage = images.length > 0;
  const src = hasImage ? images[index] : null;

  return (
    <section className={`panel${compact ? " panel--compact" : ""}${activeWindow === id ? " panel--focused" : ""}`} onMouseDown={() => onFocus(id)}>
      <header className="panel__bar">
        <Checkbox checked={selected} onChange={onSelectChange} />
        <button className="panel__nav-arrow" onClick={() => onNav(-1)} disabled={!hasImage || images.length < 2} title="Previous image">
          <ChevronLeft size={14} />
        </button>
        <h3 className="panel__title">{title}</h3>
        <div className="panel__tools">
          <IconBtn title="Play feed" onClick={onTogglePlay} active={playing}>
            <Play size={12} />
          </IconBtn>
          <IconBtn title="Expand" onClick={onExpand}>
            <Maximize2 size={12} />
          </IconBtn>
          <button className="panel__nav-arrow" onClick={() => onNav(1)} disabled={!hasImage || images.length < 2} title="Next image">
            <ChevronRight size={14} />
          </button>
        </div>
      </header>
      <div className="panel__stage">
        {hasImage ? (
          <img src={src} alt={title} className="panel__img" draggable={false} />
        ) : (
          <div className="panel__empty"><span>No feed loaded</span></div>
        )}
        {playing && hasImage && <div className="panel__scan" />}
        <button className="panel__upload" onClick={() => fileRef.current?.click()} title="Load image(s)">
          <Upload size={13} /><span>Load</span>
        </button>
        {hasImage && images.length > 1 && <div className="panel__counter">{index + 1} / {images.length}</div>}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onUpload(Array.from(e.target.files || [])); e.target.value = ""; }} />
      </div>
    </section>
  );
}

function PropertyField({ prop, onChange, onRemove, editing, onEditToggle }) {
  return (
    <div className="prop">
      {editing ? (
        <input className="prop__label prop__label--edit" value={prop.label} onChange={(e) => onChange({ ...prop, label: e.target.value })} />
      ) : (
        <label className="prop__label">{prop.label} :</label>
      )}
      <input className="prop__value" value={prop.value} placeholder="—" onChange={(e) => onChange({ ...prop, value: e.target.value })} />
      <div className="prop__actions">
        <button className="prop__icon" onClick={onEditToggle} title="Rename field">{editing ? <Check size={11} /> : <Pencil size={11} />}</button>
        <button className="prop__icon prop__icon--danger" onClick={onRemove} title="Remove field"><Trash2 size={11} /></button>
      </div>
    </div>
  );
}
function InputScreenHeader({ root, chooseRoot, available }) {
  const { user } = useAuth(); // Get currently logged in user
  const [currentDateTime, setCurrentDateTime] = useState("");

  useEffect(() => {
    // Function to update date and time continuously
    const updateDateTime = () => {
      const now = new Date();
      // Formats as "YYYY-MM-DD HH:mm:ss" or adjust to your preferred local format
      const formatted = now.toLocaleDateString() + " " + now.toLocaleTimeString();
      setCurrentDateTime(formatted);
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000); // Update every second

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="input-screen-header">
      <div className="header-field">
        <label>Date and time :</label>
        <input type="text" value={currentDateTime} readOnly />
      </div>

      <div className="header-field">
        <label>Session ID:</label>
        <input 
          type="text" 
          value={user?.id || user?.uid || "N/A"} 
          readOnly 
        />
      </div>

      <div className="header-field">
        <label>Login ID:</label>
        <input 
          type="text" 
          value={user?.displayName || user?.fullName || user?.email || "Guest"} 
          readOnly 
        />
      </div>

      {available && (
        <div className="header-field">
          <label>Workspace Folder:</label>
          <button className="btn" onClick={chooseRoot} title="Pick the root folder containing Input/CamL, Input/CamR, Input/NavCam">
            {root ? root : "Select Folder"}
          </button>
        </div>
      )}
    </div>
  );
}
const InputScreen = forwardRef(function InputScreen({ setExpandedContent, pushToast, inputCapture, playSignal, runSignal, propertiesCapture, rawWatch, workspaceRoot, chooseWorkspaceRoot, workspaceAvailable }, ref) {
  const [activeWindow, setActiveWindow] = useState("main");
  const [panels, setPanels] = useState({
    camL: { title: "CAM - 01 - L", images: [], paths: [], index: 0, selected: true, playing: false },
    camR: { title: "CAM - 02 - R", images: [], paths: [], index: 0, selected: true, playing: false },
    main: { title: "Available Images from Rover NavCam", images: [], index: 0, selected: true, playing: false },
  });
  const [properties, setProperties] = useState([
    { id: "p1", label: "Property_01", value: "" },
    { id: "p2", label: "Property_02", value: "" },
    { id: "p3", label: "Property_03", value: "" },
    { id: "p4", label: "Property_04", value: "" },
  ]);
  const [editingId, setEditingId] = useState(null);

  const updatePanel = useCallback((key, patch) => setPanels((p) => ({ ...p, [key]: { ...p[key], ...patch } })), []);

  // One physical capture (Left.jpg + Right.jpg from the newest session
  // folder in 03_Input_Image) feeds the NavCam panel — CAM-L/CAM-R are fed
  // separately from 02_Raw_Image browsing below.
  const applyCapture = useCallback((capture) => {
    setPanels((p) => ({
      ...p,
      main: {
        ...p.main,
        images: [capture.left, capture.right].filter(Boolean),
        index: 0,
      },
    }));
  }, []);

  // Fans one 02_Raw_Image read out to both CAM-L and CAM-R at once (one
  // folder read produces both lists together). Keeps a parallel `paths`
  // array so Run Algorithms knows the real file behind whatever's on screen.
  const applyRawImages = useCallback((left, right) => {
    setPanels((p) => ({
      ...p,
      camL: { ...p.camL, images: left.map((f) => f.url), paths: left.map((f) => f.path), index: left.length ? left.length - 1 : 0 },
      camR: { ...p.camR, images: right.map((f) => f.url), paths: right.map((f) => f.path), index: right.length ? right.length - 1 : 0 },
    }));
  }, []);

  // Replaces the Property fields wholesale with whatever the sidecar file
  // (LR.json / LR.txt / LR.csv) contains, in order and WITH ITS OWN LABELS
  // — e.g. Property_01 gets relabeled "Image Path" with the path as its
  // value, and so on. If the sidecar has no entries yet, the fields are
  // left as-is rather than blanked, since a capture without a sidecar file
  // is still a valid partial state.
  const applyProperties = useCallback((entries) => {
    if (!entries || !entries.length) return;
    setProperties((prev) =>
      entries.map((entry, i) => ({
        id: prev[i]?.id || `p${Date.now()}_${i}`,
        label: entry.label,
        value: entry.value,
      }))
    );
  }, []);

  // The single source of truth for "load whatever's newest": pulls the
  // image capture AND its sidecar properties together, so they always
  // change in lockstep — a new image never shows up with stale property
  // values (or vice versa).
  const loadCaptureAndProperties = useCallback(async () => {
    if (!inputCapture.available) return;
    const [capture, entries] = await Promise.all([
      inputCapture.loadLatest(),
      propertiesCapture?.available ? propertiesCapture.loadLatest() : Promise.resolve([]),
    ]);
    if (capture.left || capture.right) applyCapture(capture);
    applyProperties(entries);
  }, [inputCapture, propertiesCapture, applyCapture, applyProperties]);

  // Intentionally NOT auto-loading on mount: every window should start
  // empty on login. Nothing is pulled in from disk until the user presses
  // Play (see the playSignal effect below) — the green status dot is what
  // tells them a new raw image is waiting.

  // Fires every time the topbar Play button is clicked (playSignal bumped).
  // Per spec: Play only pulls in whatever's waiting in 02_Raw_Image (into
  // CAM-L/CAM-R — left images on CAM-L, right images on CAM-R) and clears
  // the blinking status dot. It does NOT touch the main NavCam panel or the
  // Property bar — those (like every other screen/window) stay empty until
  // Run Algorithms succeeds (see the runSignal effect below).
  const isFirstPlaySignal = useRef(true);
  useEffect(() => {
    if (isFirstPlaySignal.current) {
      isFirstPlaySignal.current = false; // skip the initial render's signal
      return;
    }
    if (rawWatch?.available) {
      rawWatch.loadLatest().then(({ left, right }) => applyRawImages(left, right));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSignal]);

  // Fires every time Run Algorithms succeeds. Only the NavCam panel +
  // Property bar are relevant here — Run Algorithms writes into
  // 03_Input_Image, not 02_Raw_Image, so CAM-L/CAM-R (the raw browser) has
  // nothing new to pull in.
  const isFirstRunSignal = useRef(true);
  useEffect(() => {
    if (isFirstRunSignal.current) {
      isFirstRunSignal.current = false; // skip the initial render's signal
      return;
    }
    loadCaptureAndProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSignal]);


  const handleUpload = (key, files) => {
    if (!files.length) return;
    const urls = files.map((f) => URL.createObjectURL(f));
    setPanels((p) => ({ ...p, [key]: { ...p[key], images: [...p[key].images, ...urls], index: p[key].images.length } }));
  };

  const handleNav = (key, dir) => {
    setPanels((p) => {
      const panel = p[key];
      if (panel.images.length < 2) return p;
      const next = (panel.index + dir + panel.images.length) % panel.images.length;
      return { ...p, [key]: { ...panel, index: next } };
    });
  };

  // Play on CAM-L/CAM-R pulls the full browsable list from 02_Raw_Image.
  // Play on the main NavCam panel keeps the original behavior: pull in the
  // latest 03_Input_Image capture (and its sidecar properties).
  const handlePlayToggle = async (key) => {
    if (key === "main") {
      if (inputCapture.available) {
        const capture = await inputCapture.loadLatest();
        if (capture.left || capture.right) applyCapture(capture);
      }
    } else if (rawWatch?.available) {
      const { left, right } = await rawWatch.loadLatest();
      applyRawImages(left, right);
    }
    updatePanel(key, { playing: !panels[key].playing });
  };

  // Lets the parent (VNSApp) read whichever Left/Right raw image is
  // currently on screen, so the Run Algorithms button can copy exactly
  // what's visible — without lifting all of panels' state up.
  useImperativeHandle(
    ref,
    () => ({
      getSelectedRawPaths: () => ({
        leftPath: panels.camL.paths[panels.camL.index] || null,
        rightPath: panels.camR.paths[panels.camR.index] || null,
      }),
    }),
    [panels.camL, panels.camR]
  );

  const addProperty = () => {
    const n = properties.length + 1;
    setProperties((props) => [...props, { id: `p${Date.now()}`, label: `Property_0${n}`, value: "" }]);
  };

  return (
    <div className="content">
      {/* 1. PLACE THE HEADER HERE */}
      <InputScreenHeader root={workspaceRoot} chooseRoot={chooseWorkspaceRoot} available={workspaceAvailable} />
      <div className="stage">
        <div className="stack">
          <ViewerPanel id="camL" title={panels.camL.title} images={panels.camL.images} index={panels.camL.index}
            selected={panels.camL.selected} playing={panels.camL.playing} compact activeWindow={activeWindow} onFocus={setActiveWindow}
            onSelectChange={(v) => updatePanel("camL", { selected: v })} onTogglePlay={() => handlePlayToggle("camL")}
            onExpand={() => setExpandedContent({ title: panels.camL.title, images: panels.camL.images, index: panels.camL.index })}
            onNav={(d) => handleNav("camL", d)} onUpload={(files) => handleUpload("camL", files)} />
          <ViewerPanel id="camR" title={panels.camR.title} images={panels.camR.images} index={panels.camR.index}
            selected={panels.camR.selected} playing={panels.camR.playing} compact activeWindow={activeWindow} onFocus={setActiveWindow}
            onSelectChange={(v) => updatePanel("camR", { selected: v })} onTogglePlay={() => handlePlayToggle("camR")}
            onExpand={() => setExpandedContent({ title: panels.camR.title, images: panels.camR.images, index: panels.camR.index })}
            onNav={(d) => handleNav("camR", d)} onUpload={(files) => handleUpload("camR", files)} />
        </div>
        <ViewerPanel id="main" title={panels.main.title} images={panels.main.images} index={panels.main.index}
          selected={panels.main.selected} playing={panels.main.playing} activeWindow={activeWindow} onFocus={setActiveWindow}
          onSelectChange={(v) => updatePanel("main", { selected: v })} onTogglePlay={() => handlePlayToggle("main")}
          onExpand={() => setExpandedContent({ title: panels.main.title, images: panels.main.images, index: panels.main.index })}
          onNav={(d) => handleNav("main", d)} onUpload={(files) => handleUpload("main", files)} />
      </div>
      <div className="propbar">
        {properties.map((prop) => (
          <PropertyField key={prop.id} prop={prop} editing={editingId === prop.id}
            onEditToggle={() => setEditingId((id) => (id === prop.id ? null : prop.id))}
            onChange={(next) => setProperties((props) => props.map((p) => (p.id === prop.id ? next : p)))}
            onRemove={() => setProperties((props) => props.filter((p) => p.id !== prop.id))} />
        ))}
        <button className="propbar__add" onClick={addProperty}><Plus size={12} /> Add field</button>
      </div>
      <div className="btn-row">
        <PipelineRunButton
          actionId="preprocess"
          label="input.exe"
          runningLabel="Preprocessing..."
          title="Preprocess"
          hint="left"
          pushToast={pushToast}
          onDone={loadCaptureAndProperties}
        />
      </div>
    </div>
  );
});

/* ================================================================
   OBSTACLE DETECTION screen
   Right-hand property box swaps between "L/R/PP Image" and
   "Obstacle BBox / Mask" depending on which of the four panels
   currently has focus — this replaces the callout note in the
   mockup with the actual described behaviour.
================================================================= */
function ObstacleDetectionScreen({ setExpandedContent, pushToast, inputCapture, propertiesCapture, preprocessedCapture, obstacleDetectionCapture, roverHealthCapture, runSignal, ppFrameIndex, setPpFrameIndex, generateReport, shareWindows }) {
  const [activeWindow, setActiveWindow] = useState("left");
  const RAW_GROUP = ["left", "preprocessed"];
  const [selected, setSelected] = useState({ left: true, preprocessed: true, mask: true, bboxes: true });
  const [rawView, setRawView] = useState("Left");

  const [imgProps, setImgProps] = useState({ path: "", size: "", resolution: "", timestamp: "", p05: "" });
  const [obsIndex, setObsIndex] = useState(0);
  const [obsProps, setObsProps] = useState({ id: "", conf: "", type: "", height: "", p05: "" });
  const [obsSearchId, setObsSearchId] = useState("");
  const [rover, setRover] = useState({ distance: "", coords: "", p1: "", p2: "", p3: "" });
  const [running, setRunning] = useState(false);

  // Holds the last "Run Detection" script output (stdout/stderr + paths) so a
  // modal can show exactly what the Python script printed.
  const [runResult, setRunResult] = useState(null);

  // The actual Left/Right captured image (whatever Run Algorithms most
  // recently copied into 03_Input_Image) — same source as the NavCam panel
  // on the Input screen.
  const [capture, setCapture] = useState({ left: null, right: null });

  // Every image found in the latest 04_Preprocessed session folder, in
  // filename order — feeds the "Preprocessed Image" panel's frame arrows.
  const [ppImages, setPpImages] = useState([]);

  // Real Segmentation/Bbox images + per-obstacle records from
  // 05_Obstacle.Detection. Starts empty; no demo fallback anywhere it's
  // used — only ever filled once a real Obstacle_details.* file is loaded.
  const [maskImg, setMaskImg] = useState(null);
  const [bboxImg, setBboxImg] = useState(null);
  const [obstacles, setObstacles] = useState([]);

  // Per-subsystem rows from 13_Rover_Health_Status/healthstatus.json — feeds
  // the "Rover Characteristics" panel below. Falls back to the manual
  // `rover` fields above until a real file has been loaded.
  const [roverHealth, setRoverHealth] = useState([]);

  // Pulls capture + properties + preprocessed images together, so this tab
  // always reflects whatever Run Algorithms most recently produced — not
  // just whatever was on disk the first time this tab was opened.
  const loadAll = useCallback(async () => {
    if (inputCapture?.available) {
      const result = await inputCapture.loadLatest();
      setCapture({ left: result.left, right: result.right });
    }
    if (propertiesCapture?.available) {
      const entries = await propertiesCapture.loadLatest();
      if (entries.length) {
        setImgProps({
          path: entries[0]?.value || "",
          size: entries[1]?.value || "",
          resolution: entries[2]?.value || "",
          timestamp: entries[3]?.value || "",
          p05: entries[4]?.value || "",
        });
      }
    }
    if (preprocessedCapture?.available) {
      const images = await preprocessedCapture.loadLatest();
      setPpImages(images.map((f) => f.url));
    }
    if (obstacleDetectionCapture?.available) {
      const detection = await obstacleDetectionCapture.loadLatest();
      setMaskImg(detection.mask);
      setBboxImg(detection.bboxes);
      setObstacles(detection.obstacles);
      if (detection.obstacles.length) {
        setObsIndex(0);
        setObsProps({ ...detection.obstacles[0] });
      }
    }
    if (roverHealthCapture?.available) {
      setRoverHealth(await roverHealthCapture.loadLatest());
    }
  }, [inputCapture, propertiesCapture, preprocessedCapture, obstacleDetectionCapture, roverHealthCapture]);

  // Intentionally NOT loading on mount — this tab starts empty on login /
  // on first visit, same as every other screen. Nothing is pulled in from
  // disk until Run Algorithms succeeds (runSignal increments); this also
  // keeps the tab in sync if it's already open when the button fires.
  useEffect(() => {
    if (runSignal === 0) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSignal]);

  // "Run Detection" button — launches the bundled Python script (later a
  // .exe) against the current input image, then refreshes this tab so any
  // mask/bbox/obstacle files the script wrote show up immediately.
  const handleRunDetection = async () => {
    if (running) return;
    const side = rawView === "Left" ? "left" : "right";
    setRunning(true);
    setRunResult(null);
    pushToast({ type: "info", title: "Obstacle Detection", message: "Running detection script..." });
    try {
      const result = await window.workspace.runObstacleDetection(side);
      if (!result) {
        setRunResult({ ok: false, script: null, stdout: "", stderr: "No result returned from the main process.", error: "no-result" });
        pushToast({ type: "error", title: "Obstacle Detection", message: "Detection failed: no result returned." });
      } else if (result.ok) {
        const which = result.script ? ` (${result.script})` : "";
        pushToast({ type: "success", title: "Obstacle Detection", message: `Detection script completed${which}.` });
        setRunResult(result);
        await loadAll();
      } else {
        setRunResult(result);
        pushToast({
          type: "error",
          title: "Obstacle Detection",
          message: result?.error === "no-root"
            ? "No Workspace Folder selected. Click 'Select Folder' at the top of the Input tab first."
            : result?.error === "script-not-found"
              ? `Detection script not found (${result.script}). Add it to scripts/ and set its fileName in electron/scriptRunner.cjs.`
              : `Detection failed: ${result?.stderr || result?.error || "unknown error"}`,
        });
      }
    } catch (err) {
      setRunResult({ ok: false, script: null, stdout: "", stderr: String(err), error: "exception" });
      pushToast({ type: "error", title: "Obstacle Detection", message: String(err) });
    } finally {
      setRunning(false);
    }
  };

  const jumpToObstacle = (idx) => {
    if (!obstacles.length) return;
    const clamped = Math.max(0, Math.min(obstacles.length - 1, idx));
    setObsIndex(clamped);
    setObsProps({ ...obstacles[clamped] });
  };

  // Searches by the obstacle's actual "Obs. ID" value (not array position —
  // real records can have gaps or be out of order), driven by the dedicated
  // search box rather than the ID field also being edited/displayed.
  const jumpToObstacleById = (rawId) => {
    const id = Number(rawId);
    if (!rawId || Number.isNaN(id)) {
      pushToast({ type: "error", title: "Search failed", message: "Enter a numeric Obs. ID first." });
      return;
    }
    const list = obstacles;
    const idx = list.findIndex((o) => Number(o.id) === id);
    if (idx === -1) {
      pushToast({ type: "error", title: "Not found", message: `No obstacle with ID ${id}.` });
      return;
    }
    jumpToObstacle(idx);
  };

  const showBBoxGroup = !RAW_GROUP.includes(activeWindow);

  const handleShare = async () => {
    const checkedCount = Object.values(selected).filter(Boolean).length;
    if (checkedCount === 0) {
      pushToast({ type: "error", title: "Share failed", message: "No windows are selected. Check at least one panel first." });
      return;
    }
    const items = [];
    if (selected.left) {
      const url = rawView === "Left" ? capture.left : capture.right;
      if (url) items.push({ label: rawView === "Left" ? "Left Image" : "Right Image", url, properties: imgProps });
    }
    if (selected.preprocessed) {
      const url = ppImages[Math.min(ppFrameIndex, ppImages.length - 1)];
      if (url) items.push({ label: "Preprocessed Image", url });
    }
    if (selected.mask && maskImg) items.push({ label: "Obstacle Pixel Mask", url: maskImg, properties: obstacles });
    if (selected.bboxes && bboxImg) items.push({ label: "Obstacle BBoxes", url: bboxImg, properties: obstacles });
    await runShareWindows(shareWindows, pushToast, items);
  };

  const handleReport = async () => {
    const checkedCount = Object.values(selected).filter(Boolean).length;
    if (checkedCount === 0) {
      pushToast({ type: "error", title: "Report failed", message: "No windows are selected. Check at least one panel first." });
      return;
    }
    const images = [];
    if (selected.left) {
      const url = rawView === "Left" ? capture.left : capture.right;
      if (url) images.push({ caption: rawView === "Left" ? "Left Image" : "Right Image", url });
    }
    if (selected.preprocessed) {
      const url = ppImages[Math.min(ppFrameIndex, ppImages.length - 1)];
      if (url) images.push({ caption: "Preprocessed Image", url });
    }
    if (selected.mask && maskImg) images.push({ caption: "Obstacle Pixel Mask", url: maskImg });
    if (selected.bboxes && bboxImg) images.push({ caption: "Obstacle BBoxes", url: bboxImg });

    const table = obstacles.length
      ? {
          columns: ["Obs. ID", "Confidence", "Type", "Height", "Property_05"],
          rows: obstacles.map((o) => [o.id, o.conf, o.type, o.height, o.p05]),
        }
      : null;

    const sections = [
      {
        heading: "Obstacle Detection",
        intro: "The results of obstacle detection and segmentation for the selected windows are as follows:",
        images,
        table,
      },
      imagePropertiesReportSection(imgProps),
      roverCharacteristicsReportSection(roverHealth),
    ].filter(Boolean);
    await runGenerateReport(generateReport, pushToast, "Obs. Det.", sections);
  };

  return (
    <div className="content">
      <div className="screen-grid">
        <div className="quad">
          <ResultPanel id="left" title={rawView === "Left" ? "Left Image" : "Right Image"} selected={selected.left}
            onSelectChange={(v) => setSelected((s) => ({ ...s, left: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            imageSrc={rawView === "Left" ? capture.left : capture.right}
            onExpand={() => setExpandedContent({ title: rawView === "Left" ? "Left Image" : "Right Image", uri: (rawView === "Left" ? capture.left : capture.right) || null })}
            toggleOptions={["Left", "Right"]} toggleValue={rawView} onToggleChange={setRawView} />
          <ResultPanel id="preprocessed" title="Preprocessed Image" selected={selected.preprocessed}
            onSelectChange={(v) => setSelected((s) => ({ ...s, preprocessed: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            images={ppImages}
            frameIndex={ppFrameIndex} onFrameChange={setPpFrameIndex}
            onExpand={() => setExpandedContent({ title: "Preprocessed Image", uri: ppImages[Math.min(ppFrameIndex, ppImages.length - 1)] || null })} />
          <ResultPanel id="mask" title="Obstacle Pixel Mask" selected={selected.mask}
            onSelectChange={(v) => setSelected((s) => ({ ...s, mask: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            images={maskImg ? [maskImg] : undefined}
            onExpand={() => setExpandedContent({ title: "Obstacle Pixel Mask", uri: maskImg || null })} />
          <ResultPanel id="bboxes" title="Obstacle BBoxes" selected={selected.bboxes}
            onSelectChange={(v) => setSelected((s) => ({ ...s, bboxes: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            images={bboxImg ? [bboxImg] : undefined}
            onExpand={() => setExpandedContent({ title: "Obstacle BBoxes", uri: bboxImg || null })} />
        </div>

        <aside className="sidepanel">
          {showBBoxGroup ? (
            <PropBox
              title="Properties - Obstacle BBox / Mask"
              spinner={{ up: () => jumpToObstacle(obsIndex + 1), down: () => jumpToObstacle(obsIndex - 1) }}
            >
              <div className="proprow">
                <label className="proprow__label">Search Obs. ID:</label>
                <input
                  className="proprow__input"
                  value={obsSearchId}
                  placeholder="e.g. 2"
                  onChange={(e) => setObsSearchId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && jumpToObstacleById(obsSearchId)}
                />
                <button className="id-jump" title="Jump to this Obs. ID" onClick={() => jumpToObstacleById(obsSearchId)}>ID</button>
              </div>
              <PropRow label="Obs. ID" value={String(obsProps.id)} onChange={(v) => setObsProps((p) => ({ ...p, id: v }))} />
              <PropRow label="Det. Conf" value={obsProps.conf} onChange={(v) => setObsProps((p) => ({ ...p, conf: v }))} />
              <PropRow label="Obs. Type" value={obsProps.type} onChange={(v) => setObsProps((p) => ({ ...p, type: v }))} mono={false} />
              <PropRow label="Obs. Height" value={obsProps.height} onChange={(v) => setObsProps((p) => ({ ...p, height: v }))} />
              <PropRow label="Property_05" value={obsProps.p05} onChange={(v) => setObsProps((p) => ({ ...p, p05: v }))} />
            </PropBox>
          ) : (
            <PropBox title="Properties - L/R/PP Image">
              <PropRow label="Image Path" value={imgProps.path} onChange={(v) => setImgProps((p) => ({ ...p, path: v }))} mono={false} />
              <PropRow label="Image Size" value={imgProps.size} onChange={(v) => setImgProps((p) => ({ ...p, size: v }))} />
              <PropRow label="Resolution" value={imgProps.resolution} onChange={(v) => setImgProps((p) => ({ ...p, resolution: v }))} />
              <PropRow label="TimeStamp" value={imgProps.timestamp} onChange={(v) => setImgProps((p) => ({ ...p, timestamp: v }))} />
              <PropRow label="Property_05" value={imgProps.p05} onChange={(v) => setImgProps((p) => ({ ...p, p05: v }))} />
            </PropBox>
          )}

          <PropBox title="Rover Characteristics">
            {roverHealth.length ? (
              roverHealth.flatMap((r, i) => [
                <PropRow key={`${i}-status`} label={`${r.subsystem} - Status`} value={String(r.status ?? "")} onChange={() => {}} mono={false} />,
                <PropRow key={`${i}-health`} label={`${r.subsystem} - Health`} value={r.health === "" || r.health === null || r.health === undefined ? "" : `${r.health}%`} onChange={() => {}} />,
                <PropRow key={`${i}-battery`} label={`${r.subsystem} - Battery`} value={r.battery === "" || r.battery === null || r.battery === undefined ? "" : `${r.battery}%`} onChange={() => {}} />,
              ])
            ) : (
              <>
                <PropRow label="Distance Traveled" value={rover.distance} onChange={(v) => setRover((r) => ({ ...r, distance: v }))} />
                <PropRow label="Rover Coordinates" value={rover.coords} onChange={(v) => setRover((r) => ({ ...r, coords: v }))} />
                <PropRow label="Rover property_01" value={rover.p1} onChange={(v) => setRover((r) => ({ ...r, p1: v }))} />
                <PropRow label="Rover property_02" value={rover.p2} onChange={(v) => setRover((r) => ({ ...r, p2: v }))} />
                <PropRow label="Rover property_03" value={rover.p3} onChange={(v) => setRover((r) => ({ ...r, p3: v }))} />
              </>
            )}
          </PropBox>

          <div className="btn-row">
            <button className="btn btn-primary" onClick={handleRunDetection} disabled={running}>
              {running ? "Running..." : "obsdet.exe"}
            </button>
          </div>

          <div className="btn-row">
            <button className="btn" onClick={handleReport}>Generate Report</button>
            <button className="btn btn-primary" onClick={handleShare}>Share</button>
          </div>
        </aside>
      </div>

      {runResult && (
        <div className="modal-overlay" onClick={() => setRunResult(null)}>
          <div className="modal modal--console" onClick={(e) => e.stopPropagation()}>
            <div className="modal__bar">
              <span className="modal__title">Detection Output — {runResult.ok ? "completed" : "failed"}</span>
              <button className="modal__close" onClick={() => setRunResult(null)}><X size={15} /></button>
            </div>
            <div className="modal__stage modal__stage--console">
              <pre className="console">
                <span className="dim">script : {runResult.script || "(none)"}</span>{"\n"}
                <span className={runResult.ok ? "ok" : "err"}>
                  status : {runResult.ok ? "success" : "failed"}{runResult.error ? ` — ${runResult.error}` : ""}
                </span>{"\n"}
                <span className="dim">input  : {runResult.inputImage || "(none resolved)"}</span>{"\n"}
                <span className="dim">output : {runResult.outputDir || "(none)"}</span>{"\n"}
                {"\n"}
                {runResult.stdout ? (
                  <>
                    <span className="dim">--- stdout ---</span>{"\n"}
                    {runResult.stdout}
                    {"\n"}
                  </>
                ) : null}
                {runResult.error === "no-root" ? (
                  <>
                    <span className="err">No Workspace Folder is selected.</span>{"\n"}
                    <span className="dim">Click 'Select Folder' at the top of the Input tab to choose your vns-app data folder, then run the detection again.</span>
                  </>
                ) : runResult.stderr ? (
                  <>
                    <span className="err">--- stderr ---</span>{"\n"}
                    <span className="err">{runResult.stderr}</span>
                    {"\n"}
                  </>
                ) : null}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   SAFE PATH screen
================================================================= */
function SafePathScreen({ setExpandedContent, pushToast, inputCapture, propertiesCapture, preprocessedCapture, obstacleDetectionCapture, occupancyGridCapture, predSafePathCapture, roverHealthCapture, runSignal, ppFrameIndex, setPpFrameIndex, generateReport, shareWindows }) {
  const [activeWindow, setActiveWindow] = useState("pre");
  const [selected, setSelected] = useState({ pre: true, obstacle: true, occupancy: true, safepath: true });
  const [preView, setPreView] = useState("Pre-processed");
  const [imgProps, setImgProps] = useState({ path: "", size: "", resolution: "", timestamp: "", p05: "" });
  const [rover, setRover] = useState({ distance: "", coords: "", p1: "", p2: "", p3: "" });

  // Per-subsystem rows from 13_Rover_Health_Status/healthstatus.json — feeds
  // the "Rover Characteristics" panel below. Starts empty; only loaded by
  // loadAll() below (gated behind Run Algorithms), same as every other
  // real data source on this screen — it must NOT auto-load on mount.
  const [roverHealth, setRoverHealth] = useState([]);

  // Left/Right capture + preprocessed frames — the exact same "latest
  // session" sources the Obs. Det. tab reads, so whatever was selected /
  // produced there is what shows up here too.
  const [capture, setCapture] = useState({ left: null, right: null });
  const [ppImages, setPpImages] = useState([]);

  // Real mask/bbox image + per-obstacle records from 05_Obstacle.Detection
  // (same latest session as above).
  const [maskImg, setMaskImg] = useState(null);
  const [bboxImg, setBboxImg] = useState(null);
  const [obstacles, setObstacles] = useState([]);

  // Real Grid.png + per-obstacle records from 07_Occupancy_Grid.
  const [gridImg, setGridImg] = useState(null);
  const [gridObstacles, setGridObstacles] = useState([]);

  // Real SafePath.png from 08_Pred_Safe_Path.
  const [safePathImg, setSafePathImg] = useState(null);

  // Obstacle Detection window properties — mirrors the same real
  // Obstacle_details.* records loaded in the Obs. Det. tab. Starts empty;
  // no demo fallback.
  const [obsDetIndex, setObsDetIndex] = useState(0);
  const [obsDetProps, setObsDetProps] = useState({ id: "", conf: "", type: "", height: "", p05: "" });
  const [obsDetSearchId, setObsDetSearchId] = useState("");
  const jumpObsDet = (idx) => {
    if (!obstacles.length) return;
    const clamped = Math.max(0, Math.min(obstacles.length - 1, idx));
    setObsDetIndex(clamped);
    setObsDetProps({ ...obstacles[clamped] });
  };
  // Searches by the obstacle's actual "Obs. ID" value (not array position),
  // exactly like the same search on the Obs. Det. tab.
  const jumpObsDetById = (rawId) => {
    const id = Number(rawId);
    if (!rawId || Number.isNaN(id)) {
      pushToast({ type: "error", title: "Search failed", message: "Enter a numeric Obs. ID first." });
      return;
    }
    const idx = obstacles.findIndex((o) => Number(o.id) === id);
    if (idx === -1) {
      pushToast({ type: "error", title: "Not found", message: `No obstacle with ID ${id}.` });
      return;
    }
    jumpObsDet(idx);
  };

  // Occupancy Grid window properties — mirrors Grid.json's per-obstacle
  // records. Starts empty; no demo fallback.
  const [occIndex, setOccIndex] = useState(0);
  const [occProps, setOccProps] = useState({ id: "", type: "", x: "", z: "", width: "" });
  const jumpOcc = (idx) => {
    if (!gridObstacles.length) return;
    const clamped = Math.max(0, Math.min(gridObstacles.length - 1, idx));
    setOccIndex(clamped);
    setOccProps({ ...gridObstacles[clamped] });
  };

  // Predicted Safe Path window properties. Starts empty; no demo fallback,
  // and no-ops until a real per-waypoint data source is wired in here.
  const [wpProps, setWpProps] = useState({ id: "", coord: "", p03: "", p04: "", p05: "" });

  // Pulls every real data source together, so this tab always shows the
  // same Left/Right/Preprocessed/Obstacle-Detection session that's showing
  // on the Obs. Det. tab, plus whatever's freshest under 07_Occupancy_Grid
  // and 08_Pred_Safe_Path.
  const loadAll = useCallback(async () => {
    if (inputCapture?.available) {
      const result = await inputCapture.loadLatest();
      setCapture({ left: result.left, right: result.right });
    }
    if (propertiesCapture?.available) {
      const entries = await propertiesCapture.loadLatest();
      if (entries.length) {
        setImgProps({
          path: entries[0]?.value || "",
          size: entries[1]?.value || "",
          resolution: entries[2]?.value || "",
          timestamp: entries[3]?.value || "",
          p05: entries[4]?.value || "",
        });
      }
    }
    if (preprocessedCapture?.available) {
      const images = await preprocessedCapture.loadLatest();
      setPpImages(images.map((f) => f.url));
    }
    if (obstacleDetectionCapture?.available) {
      const detection = await obstacleDetectionCapture.loadLatest();
      setMaskImg(detection.mask);
      setBboxImg(detection.bboxes);
      setObstacles(detection.obstacles);
      if (detection.obstacles.length) {
        setObsDetIndex(0);
        setObsDetProps({ ...detection.obstacles[0] });
      }
    }
    if (occupancyGridCapture?.available) {
      const grid = await occupancyGridCapture.loadLatest();
      setGridImg(grid.image);
      setGridObstacles(grid.obstacles);
      if (grid.obstacles.length) {
        setOccIndex(0);
        setOccProps({ ...grid.obstacles[0] });
      }
    }
    if (predSafePathCapture?.available) {
      const safePath = await predSafePathCapture.loadLatest();
      setSafePathImg(safePath.image);
    }
    if (roverHealthCapture?.available) {
      setRoverHealth(await roverHealthCapture.loadLatest());
    }
  }, [inputCapture, propertiesCapture, preprocessedCapture, obstacleDetectionCapture, occupancyGridCapture, predSafePathCapture, roverHealthCapture]);

  // Intentionally NOT loading on mount — starts empty on login / on first
  // visit, same as every other screen. Only Run Algorithms succeeding
  // (runSignal increments) pulls anything in from disk, and this also
  // keeps the tab in sync if it's already open when the button fires.
  useEffect(() => {
    if (runSignal === 0) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSignal]);

  const handleShare = async () => {
    const checkedCount = Object.values(selected).filter(Boolean).length;
    if (checkedCount === 0) {
      pushToast({ type: "error", title: "Share failed", message: "No windows are selected. Check at least one panel first." });
      return;
    }
    const items = [];
    if (selected.pre) {
      const url =
        preView === "Pre-processed"
          ? ppImages[Math.min(ppFrameIndex, ppImages.length - 1)]
          : preView === "Left"
          ? capture.left
          : capture.right;
      const label = preView === "Pre-processed" ? "Preprocessed Image" : preView === "Left" ? "Left Image" : "Right Image";
      if (url) items.push({ label, url, properties: imgProps });
    }
    if (selected.obstacle) {
      const urls = [maskImg, bboxImg].filter(Boolean);
      if (urls.length) items.push({ label: "Obstacle Detection", images: urls, properties: obstacles });
    }
    if (selected.occupancy && gridImg) items.push({ label: "Occupancy Grid Map", url: gridImg, properties: gridObstacles });
    if (selected.safepath && safePathImg) items.push({ label: "Predicted Safe Path", url: safePathImg });
    await runShareWindows(shareWindows, pushToast, items);
  };

  const handleReport = async () => {
    const checkedCount = Object.values(selected).filter(Boolean).length;
    if (checkedCount === 0) {
      pushToast({ type: "error", title: "Report failed", message: "No windows are selected. Check at least one panel first." });
      return;
    }
    const images = [];
    if (selected.pre) {
      const url =
        preView === "Pre-processed"
          ? ppImages[Math.min(ppFrameIndex, ppImages.length - 1)]
          : preView === "Left"
          ? capture.left
          : capture.right;
      const caption = preView === "Pre-processed" ? "Preprocessed Image" : preView === "Left" ? "Left Image" : "Right Image";
      if (url) images.push({ caption, url });
    }
    if (selected.obstacle) {
      [
        { url: maskImg, caption: "Obstacle Detection (Mask)" },
        { url: bboxImg, caption: "Obstacle Detection (BBoxes)" },
      ]
        .filter((im) => im.url)
        .forEach((im) => images.push(im));
    }
    if (selected.occupancy && gridImg) images.push({ caption: "Occupancy Grid Map", url: gridImg });
    if (selected.safepath && safePathImg) images.push({ caption: "Predicted Safe Path", url: safePathImg });

    const table =
      selected.occupancy && gridObstacles.length
        ? {
            columns: ["Obs. ID", "Type", "Coord_X", "Coord_Z", "Width"],
            rows: gridObstacles.map((o) => [o.id, o.type, o.x, o.z, o.width]),
          }
        : null;

    const sections = [
      {
        heading: "Safe Path",
        intro: "The safe path generated for the selected windows is as follows:",
        images,
        table,
      },
      imagePropertiesReportSection(imgProps),
      roverCharacteristicsReportSection(roverHealth),
    ].filter(Boolean);
    await runGenerateReport(generateReport, pushToast, "Safe Path", sections);
  };

  return (
    <div className="content">
      <div className="screen-grid">
        <div className="quad">
          <ResultPanel id="pre" title={preView === "Pre-processed" ? "Preprocessed Image" : preView === "Left" ? "Left Image" : "Right Image"} selected={selected.pre}
            onSelectChange={(v) => setSelected((s) => ({ ...s, pre: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            imageSrc={preView === "Pre-processed" ? undefined : preView === "Left" ? capture.left : capture.right}
            images={preView === "Pre-processed" ? ppImages : undefined}
            frameIndex={ppFrameIndex} onFrameChange={setPpFrameIndex}
            onExpand={() => setExpandedContent({ title: preView === "Pre-processed" ? "Preprocessed Image" : preView === "Left" ? "Left Image" : "Right Image", uri: (preView === "Pre-processed" ? ppImages[Math.min(ppFrameIndex, ppImages.length - 1)] : preView === "Left" ? capture.left : capture.right) || null })}
            toggleOptions={["Left", "Right", "Pre-processed"]} toggleValue={preView} onToggleChange={setPreView} />
          <ResultPanel id="obstacle" title="Obstacle Detection" selected={selected.obstacle}
            onSelectChange={(v) => setSelected((s) => ({ ...s, obstacle: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            images={[maskImg, bboxImg].filter(Boolean)}
            onExpand={() => setExpandedContent({ title: "Obstacle Detection", uri: maskImg || bboxImg || null })} />
          <ResultPanel id="occupancy" title="Occupancy Grid Map" selected={selected.occupancy}
            onSelectChange={(v) => setSelected((s) => ({ ...s, occupancy: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            imageSrc={gridImg}
            onExpand={() => setExpandedContent(gridImg ? { title: "Occupancy Grid Map", uri: gridImg } : { title: "Occupancy Grid Map", uri: null })} />
          <ResultPanel id="safepath" title="Predicted Safe Path" selected={selected.safepath}
            onSelectChange={(v) => setSelected((s) => ({ ...s, safepath: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            imageSrc={safePathImg}
            onExpand={() => setExpandedContent({ title: "Predicted Safe Path", uri: safePathImg || null })} />
        </div>

        <aside className="sidepanel">
          {activeWindow === "pre" && (
            <PropBox title="Properties - L/R/PP Image">
              <PropRow label="Image Path" value={imgProps.path} onChange={(v) => setImgProps((p) => ({ ...p, path: v }))} mono={false} />
              <PropRow label="Image Size" value={imgProps.size} onChange={(v) => setImgProps((p) => ({ ...p, size: v }))} />
              <PropRow label="Resolution" value={imgProps.resolution} onChange={(v) => setImgProps((p) => ({ ...p, resolution: v }))} />
              <PropRow label="TimeStamp" value={imgProps.timestamp} onChange={(v) => setImgProps((p) => ({ ...p, timestamp: v }))} />
              <PropRow label="Property_05" value={imgProps.p05} onChange={(v) => setImgProps((p) => ({ ...p, p05: v }))} />
            </PropBox>
          )}

          {activeWindow === "obstacle" && (
            <PropBox title="Properties - Obstacle Detection" spinner={{ up: () => jumpObsDet(obsDetIndex + 1), down: () => jumpObsDet(obsDetIndex - 1) }}>
              <div className="proprow">
                <label className="proprow__label">Search Obs. ID:</label>
                <input
                  className="proprow__input"
                  value={obsDetSearchId}
                  placeholder="e.g. 2"
                  onChange={(e) => setObsDetSearchId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && jumpObsDetById(obsDetSearchId)}
                />
                <button className="id-jump" title="Jump to this Obs. ID" onClick={() => jumpObsDetById(obsDetSearchId)}>ID</button>
              </div>
              <PropRow label="Obs. ID" value={String(obsDetProps.id)} onChange={(v) => setObsDetProps((p) => ({ ...p, id: v }))} />
              <PropRow label="Det. Conf" value={obsDetProps.conf} onChange={(v) => setObsDetProps((p) => ({ ...p, conf: v }))} />
              <PropRow label="Obs. Type" value={obsDetProps.type} onChange={(v) => setObsDetProps((p) => ({ ...p, type: v }))} mono={false} />
              <PropRow label="Obs. Height" value={obsDetProps.height} onChange={(v) => setObsDetProps((p) => ({ ...p, height: v }))} />
              <PropRow label="Property_05" value={obsDetProps.p05} onChange={(v) => setObsDetProps((p) => ({ ...p, p05: v }))} />
            </PropBox>
          )}

          {activeWindow === "occupancy" && (
            <PropBox title="Properties - Occupancy Grid" spinner={{ up: () => jumpOcc(occIndex + 1), down: () => jumpOcc(occIndex - 1) }}>
              <PropRow label="Obs. ID" value={String(occProps.id)} onChange={(v) => setOccProps((p) => ({ ...p, id: v }))} />
              <PropRow label="Obs. Type" value={occProps.type} onChange={(v) => setOccProps((p) => ({ ...p, type: v }))} mono={false} />
              <PropRow label="Coordinates - x" value={occProps.x} onChange={(v) => setOccProps((p) => ({ ...p, x: v }))} />
              <PropRow label="Coordinates - z" value={occProps.z} onChange={(v) => setOccProps((p) => ({ ...p, z: v }))} />
              <PropRow label="Obs. Width" value={occProps.width} onChange={(v) => setOccProps((p) => ({ ...p, width: v }))}  extra={<button className="id-jump" title="Type Obs. ID to jump to specified obstacle properties"
                  onClick={() => jumpOcc((Number(occProps.id) || 1) - 1)}>ID</button>} />
            </PropBox>
          )}

          {activeWindow === "safepath" && (
            <PropBox title="Properties - Safe Path">
              <PropRow label="Waypoint ID" value={String(wpProps.id)} onChange={(v) => setWpProps((p) => ({ ...p, id: v }))}/>
              <PropRow label="Waypoint Coord" value={wpProps.coord} onChange={(v) => setWpProps((p) => ({ ...p, coord: v }))} mono={false} />
              <PropRow label="property_03" value={wpProps.p03} onChange={(v) => setWpProps((p) => ({ ...p, p03: v }))} />
              <PropRow label="property_04" value={wpProps.p04} onChange={(v) => setWpProps((p) => ({ ...p, p04: v }))} />
              <PropRow label="property_05" value={wpProps.p05} onChange={(v) => setWpProps((p) => ({ ...p, p05: v }))}  extra={<button className="id-jump" title="Type Waypoint. ID to jump to specified Waypoint coord"
                  onClick={() => jumpObsDet((Number(obsDetProps.id) || 1) - 1)}>ID</button>} />
            </PropBox>
          )}

          <PropBox title="Rover Characteristics">
            {roverHealth.length ? (
              roverHealth.flatMap((r, i) => [
                <PropRow key={`${i}-status`} label={`${r.subsystem} - Status`} value={String(r.status ?? "")} onChange={() => {}} mono={false} />,
                <PropRow key={`${i}-health`} label={`${r.subsystem} - Health`} value={r.health === "" || r.health === null || r.health === undefined ? "" : `${r.health}%`} onChange={() => {}} />,
                <PropRow key={`${i}-battery`} label={`${r.subsystem} - Battery`} value={r.battery === "" || r.battery === null || r.battery === undefined ? "" : `${r.battery}%`} onChange={() => {}} />,
              ])
            ) : (
              <>
                <PropRow label="Distance Traveled" value={rover.distance} onChange={(v) => setRover((r) => ({ ...r, distance: v }))} />
                <PropRow label="Rover Coordinates" value={rover.coords} onChange={(v) => setRover((r) => ({ ...r, coords: v }))} />
                <PropRow label="Rover property_01" value={rover.p1} onChange={(v) => setRover((r) => ({ ...r, p1: v }))} />
                <PropRow label="Rover property_02" value={rover.p2} onChange={(v) => setRover((r) => ({ ...r, p2: v }))} />
                <PropRow label="Rover property_03" value={rover.p3} onChange={(v) => setRover((r) => ({ ...r, p3: v }))} />
              </>
            )}
          </PropBox>

          <div className="btn-row">
            <PipelineRunButton
              actionId="safePath"
              label="safepath.exe"
              runningLabel="Computing..."
              title="Safe Path"
              hint="left"
              pushToast={pushToast}
              onDone={loadAll}
            />
            <button className="btn" onClick={handleReport}>Generate Report</button>
            <button className="btn btn-primary" onClick={handleShare}>Share</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ================================================================
   DISTANCE MAP screen
   Obstacle Distances (photo + distance-labelled boxes), Distance Map
   (heatmap), 3D View, and Relative Elevation, plus a live-editable
   Obstacle Distances table (4 rows at a time, scrollable + ID-jump).
================================================================= */
function DistanceMapScreen({ setExpandedContent, pushToast, roverHealthCapture, distanceMapCapture, runSignal, generateReport, shareWindows }) {
  const [activeWindow, setActiveWindow] = useState("distances");
  const [selected, setSelected] = useState({ distances: true, heatmap: true, threed: true, elevation: true });
  const [rover, setRover] = useState({ distance: "", coords: "", p1: "", p2: "", p3: "" });

  // Per-subsystem rows from 13_Rover_Health_Status/healthstatus.json — feeds
  // the "Rover Characteristics" panel below. Falls back to the manual
  // `rover` fields above until a real file has been loaded.
  const [roverHealth, setRoverHealth] = useState([]);

  // The 4 real images from the latest 06_Distance_Map session, and its
  // Obstacle_distances.* table.
  const [images, setImages] = useState({ obstacleDistancesImg: null, distanceMapImg: null, view3dImg: null, elevationImg: null });
  const [distances, setDistances] = useState([]);

  const [distStart, setDistStart] = useState(0);
  const [distRows, setDistRows] = useState([]);

  // Pulls Rover Health + the Distance Map session together, so this tab
  // always reflects whatever Run Algorithms most recently produced — not
  // just whatever was on disk the first time this tab was opened.
  const loadAll = useCallback(async () => {
    if (roverHealthCapture?.available) {
      setRoverHealth(await roverHealthCapture.loadLatest());
    }
    if (distanceMapCapture?.available) {
      const result = await distanceMapCapture.loadLatest();
      setImages({
        obstacleDistancesImg: result.obstacleDistancesImg,
        distanceMapImg: result.distanceMapImg,
        view3dImg: result.view3dImg,
        elevationImg: result.elevationImg,
      });
      setDistances(result.distances);
      if (result.distances.length) {
        setDistStart(0);
        setDistRows(result.distances.slice(0, 4).map((d) => ({ ...d })));
      }
    }
  }, [roverHealthCapture, distanceMapCapture]);

  // Intentionally NOT loading on mount — starts empty on login / on first
  // visit, same as every other screen. Only Run Algorithms succeeding
  // (runSignal increments) pulls anything in from disk.
  useEffect(() => {
    if (runSignal === 0) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSignal]);

  const loadDistanceRows = (start) => {
    if (!distances.length) return;
    const clamped = Math.max(0, Math.min(Math.max(distances.length - 4, 0), start));
    setDistStart(clamped);
    setDistRows(distances.slice(clamped, clamped + 4).map((d) => ({ ...d })));
  };

  const updateDistRow = (idx, key, value) => {
    setDistRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };

  const [distSearchId, setDistSearchId] = useState("");
  // Searches by the obstacle's actual "Obs. ID" value (not array position),
  // exactly like the same search on the Obs. Det. / Safe Path tabs.
  const jumpToDistanceById = (rawId) => {
    const id = Number(rawId);
    if (!rawId || Number.isNaN(id)) {
      pushToast({ type: "error", title: "Search failed", message: "Enter a numeric Obs. ID first." });
      return;
    }
    const idx = distances.findIndex((o) => Number(o.id) === id);
    if (idx === -1) {
      pushToast({ type: "error", title: "Not found", message: `No obstacle with ID ${id}.` });
      return;
    }
    loadDistanceRows(idx);
  };

  const handleShare = async () => {
    const checkedCount = Object.values(selected).filter(Boolean).length;
    if (checkedCount === 0) {
      pushToast({ type: "error", title: "Share failed", message: "No windows are selected. Check at least one panel first." });
      return;
    }
    const items = [];
    if (selected.distances && images.obstacleDistancesImg) items.push({ label: "Obstacle Distances", url: images.obstacleDistancesImg, properties: distances });
    if (selected.heatmap && images.distanceMapImg) items.push({ label: "Distance Map", url: images.distanceMapImg });
    if (selected.threed && images.view3dImg) items.push({ label: "3D View", url: images.view3dImg });
    if (selected.elevation && images.elevationImg) items.push({ label: "Relative Elevation", url: images.elevationImg });
    await runShareWindows(shareWindows, pushToast, items);
  };

  const handleReport = async () => {
    const checkedCount = Object.values(selected).filter(Boolean).length;
    if (checkedCount === 0) {
      pushToast({ type: "error", title: "Report failed", message: "No windows are selected. Check at least one panel first." });
      return;
    }
    const reportImages = [];
    if (selected.distances && images.obstacleDistancesImg) reportImages.push({ caption: "Obstacle Distances", url: images.obstacleDistancesImg });
    if (selected.heatmap && images.distanceMapImg) reportImages.push({ caption: "Distance Map", url: images.distanceMapImg });
    if (selected.threed && images.view3dImg) reportImages.push({ caption: "3D View", url: images.view3dImg });
    if (selected.elevation && images.elevationImg) reportImages.push({ caption: "Relative Elevation", url: images.elevationImg });

    const table = distances.length
      ? {
          columns: ["Obs. ID", "Distance"],
          rows: distances.map((d) => [d.id, d.distance]),
        }
      : null;

    const sections = [
      {
        heading: "Obstacle Distances",
        intro: "The results of obstacle distances for the selected windows are as follows:",
        images: reportImages,
        table,
      },
      roverCharacteristicsReportSection(roverHealth),
    ].filter(Boolean);
    await runGenerateReport(generateReport, pushToast, "Dist. Map", sections);
  };

  return (
    <div className="content">
      <div className="screen-grid">
        <div className="quad">
          <ResultPanel id="distances" title="Obstacle Distances" selected={selected.distances}
            onSelectChange={(v) => setSelected((s) => ({ ...s, distances: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            imageSrc={images.obstacleDistancesImg}
            onExpand={() => setExpandedContent({ title: "Obstacle Distances", uri: images.obstacleDistancesImg || null })} />
          <ResultPanel id="heatmap" title="Distance Map" selected={selected.heatmap}
            onSelectChange={(v) => setSelected((s) => ({ ...s, heatmap: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            imageSrc={images.distanceMapImg}
            onExpand={() => setExpandedContent({ title: "Distance Map", uri: images.distanceMapImg || null })} />
          <ResultPanel id="threed" title="3D View" selected={selected.threed}
            onSelectChange={(v) => setSelected((s) => ({ ...s, threed: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            imageSrc={images.view3dImg}
            fit="contain"
            onExpand={() => setExpandedContent({ title: "3D View", uri: images.view3dImg || null })} />
          <ResultPanel id="elevation" title="Relative Elevation" selected={selected.elevation}
            onSelectChange={(v) => setSelected((s) => ({ ...s, elevation: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            imageSrc={images.elevationImg}
            onExpand={() => setExpandedContent({ title: "Relative Elevation", uri: images.elevationImg || null })} />
        </div>

        <aside className="sidepanel">
          <PropBox
            title="Properties - Obstacle Distances"
            spinner={{ up: () => loadDistanceRows(distStart + 1), down: () => loadDistanceRows(distStart - 1) }}
          >
            <div className="proprow">
              <label className="proprow__label">Search Obs. ID:</label>
              <input
                className="proprow__input"
                value={distSearchId}
                placeholder="e.g. 2"
                onChange={(e) => setDistSearchId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && jumpToDistanceById(distSearchId)}
              />
              <button className="id-jump" title="Jump to this Obs. ID" onClick={() => jumpToDistanceById(distSearchId)}>ID</button>
            </div>
            {distRows.map((row, idx) => (
              <div className="proprow proprow--dual" key={idx}>
                <label className="proprow__label proprow__label--tight">Obs. ID :</label>
                <input className="proprow__input proprow__input--sm" value={row.id}
                  onChange={(e) => updateDistRow(idx, "id", e.target.value)} placeholder="—" />
                <label className="proprow__label proprow__label--tight">Distance :</label>
                <input className="proprow__input proprow__input--sm" value={row.distance}
                  onChange={(e) => updateDistRow(idx, "distance", e.target.value)} placeholder="—" />
              </div>
            ))}
          </PropBox>

          <PropBox title="Rover Characteristics">
            {roverHealth.length ? (
              roverHealth.flatMap((r, i) => [
                <PropRow key={`${i}-status`} label={`${r.subsystem} - Status`} value={String(r.status ?? "")} onChange={() => {}} mono={false} />,
                <PropRow key={`${i}-health`} label={`${r.subsystem} - Health`} value={r.health === "" || r.health === null || r.health === undefined ? "" : `${r.health}%`} onChange={() => {}} />,
                <PropRow key={`${i}-battery`} label={`${r.subsystem} - Battery`} value={r.battery === "" || r.battery === null || r.battery === undefined ? "" : `${r.battery}%`} onChange={() => {}} />,
              ])
            ) : (
              <>
                <PropRow label="Distance Traveled" value={rover.distance} onChange={(v) => setRover((r) => ({ ...r, distance: v }))} />
                <PropRow label="Rover Coordinates" value={rover.coords} onChange={(v) => setRover((r) => ({ ...r, coords: v }))} />
                <PropRow label="Rover property_01" value={rover.p1} onChange={(v) => setRover((r) => ({ ...r, p1: v }))} />
                <PropRow label="Rover property_02" value={rover.p2} onChange={(v) => setRover((r) => ({ ...r, p2: v }))} />
                <PropRow label="Rover property_03" value={rover.p3} onChange={(v) => setRover((r) => ({ ...r, p3: v }))} />
              </>
            )}
          </PropBox>

          <div className="btn-row">
            <PipelineRunButton
              actionId="distanceMap"
              label="distmap.exe"
              runningLabel="Computing..."
              title="Distance Map"
              hint="left"
              pushToast={pushToast}
              onDone={loadAll}
            />
            <button className="btn" onClick={handleReport}>Generate Report</button>
            <button className="btn btn-primary" onClick={handleShare}>Share</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ================================================================
   NAVIGATION screen (ROS Simulation Module)
   Two small stacked feeds (Last image / Current image, no checkbox,
   next-frame only) beside one large "Rover Simulation Video" panel
   (checkbox + next-frame), plus a live property bar underneath.
================================================================= */
function NavigationScreen({ setExpandedContent, pushToast, navImagesCapture, navPropertiesCapture, rosVideoCapture, runSignal }) {
  const [activeWindow, setActiveWindow] = useState("sim");
  const [selected, setSelected] = useState({ sim: true });
  // Frame paging only still applies while showing the demo placeholders —
  // real content is always a single image/video, no paging (see NavFeedPanel).
  const [frames, setFrames] = useState({ last: 0, current: 0, sim: 0 });
  const [properties, setProperties] = useState([
    { id: "vod", label: "Visual Odom. Distance", value: "" },
    { id: "coords", label: "Rover Coordinates", value: "" },
    { id: "p3", label: "Property_03", value: "" },
    { id: "p4", label: "Property_04", value: "" },
  ]);
  const [editingId, setEditingId] = useState(null);

  const [navImages, setNavImages] = useState({ current: null, last: null });
  const [rosVideo, setRosVideo] = useState(null);

  const loadAll = useCallback(async () => {
    if (navImagesCapture?.available) setNavImages(await navImagesCapture.loadLatest());
    if (rosVideoCapture?.available) setRosVideo(await rosVideoCapture.loadLatest());
    if (navPropertiesCapture?.available) {
      const p = await navPropertiesCapture.loadLatest();
      setProperties((props) =>
        props.map((prop) => {
          if (prop.id === "vod") return { ...prop, value: p.distance };
          if (prop.id === "coords") return { ...prop, value: p.coords };
          if (prop.id === "p3") return { ...prop, value: p.p03 };
          if (prop.id === "p4") return { ...prop, value: p.p04 };
          return prop;
        })
      );
    }
  }, [navImagesCapture, rosVideoCapture, navPropertiesCapture]);

  // Intentionally NOT loading on mount — starts empty on login / on first
  // visit, same as every other screen. Only Run Algorithms succeeding
  // (runSignal increments) pulls anything in from disk.
  useEffect(() => {
    if (runSignal === 0) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSignal]);

  const advanceFrame = (key) => setFrames((f) => ({ ...f, [key]: (f[key] + 1) % 3 }));

  const addProperty = () => {
    setProperties((props) => [...props, { id: `p${Date.now()}`, label: `Property_0${props.length + 1}`, value: "" }]);
  };

  return (
    <div className="content">
      <div className="stage">
        <div className="stack">
          <NavFeedPanel id="last" title="Last image" compact
            imageSrc={navImages.last}
            onAdvance={() => advanceFrame("last")} activeWindow={activeWindow} onFocus={setActiveWindow} onExpand={() => setExpandedContent({ title: "Last image", uri: navImages.last || terrainDataUri(31 + frames.last * 5) })} />
          <NavFeedPanel id="current" title="Current Image" compact
            imageSrc={navImages.current}
            onAdvance={() => advanceFrame("current")} activeWindow={activeWindow} onFocus={setActiveWindow}
            onExpand={() => setExpandedContent({ title: "Current Image", uri: navImages.current || terrainDataUri(32 + frames.current * 5) })} />
        </div>
        <NavFeedPanel id="sim" title="Rover Simulation Video" showCheckbox
          videoSrc={rosVideo}
          selected={selected.sim} onSelectChange={(v) => setSelected((s) => ({ ...s, sim: v }))}
          onAdvance={() => advanceFrame("sim")} activeWindow={activeWindow} onFocus={setActiveWindow}
          onExpand={() => setExpandedContent({ title: "Rover Simulation Video", uri: rosVideo ? undefined : terrainDataUri(33 + frames.sim * 5) })} />
      </div>
      <div className="propbar">
        {properties.map((prop) => (
          <PropertyField key={prop.id} prop={prop} editing={editingId === prop.id}
            onEditToggle={() => setEditingId((id) => (id === prop.id ? null : prop.id))}
            onChange={(next) => setProperties((props) => props.map((p) => (p.id === prop.id ? next : p)))}
            onRemove={() => setProperties((props) => props.filter((p) => p.id !== prop.id))} />
        ))}
        <button className="propbar__add" onClick={addProperty}><Plus size={12} /> Add field</button>
      </div>
      <div className="btn-row">
        <PipelineRunButton
          actionId="navigation"
          label="navigation.exe"
          runningLabel="Localizing..."
          title="Navigation"
          hint="left"
          pushToast={pushToast}
          onDone={loadAll}
        />
      </div>
    </div>
  );
}

/* ================================================================
   DATA screen
   Parameter Table cycles (via the prev/next arrows) through the log
   kept by each other screen's window — Obstacle Detection, Occupancy
   Grid, Waypoints, Obstacle Distances, and Image properties — plus a
   fixed Rover Characterization table. "Data to Share" selects which
   of those, by name, get compiled into an actual generated report.
================================================================= */
function DataScreen({
  pushToast,
  setExpandedContent,
  inputCapture,
  propertiesCapture,
  preprocessedCapture,
  predSafePathCapture,
  inputImageLogCapture,
  obstacleDetectionCapture,
  occupancyGridCapture,
  waypointsLogCapture,
  distanceMapCapture,
  roverHealthCapture,
  navImagesCapture,
  navPropertiesCapture,
  telemetryLogCapture,
  telecommandLogCapture,
  runSignal,
  customScreens,
  generateReport,
}) {
  const [activeWindow, setActiveWindow] = useState("param");
  const [tableIndex, setTableIndex] = useState(0);
  const [selected, setSelected] = useState({ param: true, rover: true });
  const [checked, setChecked] = useState({});

  // Real rows for each of the 5 parameter tables + the rover log — each
  // starts empty on login/first visit and only ever fills in from what's
  // actually on disk (loadAll(), fired by Run Algorithms succeeding). No
  // demo/mock fallback, so the Data tab is never showing made-up numbers.
  const [imgRows, setImgRows] = useState([]);
  const [obsDetRows, setObsDetRows] = useState([]);
  const [occRows, setOccRows] = useState([]);
  const [waypointRows, setWaypointRows] = useState([]);
  const [distanceRows, setDistanceRows] = useState([]);
  const [roverRows, setRoverRows] = useState([]);
  const [navImages, setNavImages] = useState({ current: null, last: null });
  const [navProps, setNavProps] = useState({ distance: "", coords: "", p03: "", p04: "" });
  const [telemetryRows, setTelemetryRows] = useState([]);
  const [telecommandRows, setTelecommandRows] = useState([]);

  // Real captured frames behind each "Report to Generate" tab — same
  // sources every other screen reads (Obs. Det., Safe Path, Dist. Map) —
  // so a checked tab's report output carries its actual image, not just a
  // placeholder note. Starts empty; only ever filled by loadAll() below
  // (gated behind Run Algorithms), same as every other real data source on
  // this screen.
  const [capture, setCapture] = useState({ left: null, right: null });
  const [imgProps, setImgProps] = useState({ path: "", size: "", resolution: "", timestamp: "", p05: "" });
  const [ppImages, setPpImages] = useState([]);
  const [maskImg, setMaskImg] = useState(null);
  const [bboxImg, setBboxImg] = useState(null);
  const [gridImg, setGridImg] = useState(null);
  const [safePathImg, setSafePathImg] = useState(null);
  const [distanceImages, setDistanceImages] = useState({ obstacleDistancesImg: null, distanceMapImg: null, view3dImg: null, elevationImg: null });

  // name -> array of {name, size, mtime} for each custom-screen window's
  // real folder, keyed the same way as its custom-window entry.
  const [customWindowRows, setCustomWindowRows] = useState({});
  const { listImages: listWindowImages, available: windowFolderAvailable } = useWindowFolder();

  const customWindowRefs = useMemo(
    () =>
      customScreens.flatMap((s) =>
        (s.windows || [])
          .filter((w) => w.folderPath)
          .map((w) => ({ key: `custom-${s.id}-${w.id}`, name: w.name || w.title || "Window", screenName: s.name, folderPath: w.folderPath }))
      ),
    [customScreens]
  );

  const loadCustomWindowData = useCallback(async () => {
    if (!windowFolderAvailable || customWindowRefs.length === 0) return;
    const entries = await Promise.all(
      customWindowRefs.map(async (ref) => [ref.key, await listWindowImages(ref.folderPath)])
    );
    setCustomWindowRows(Object.fromEntries(entries));
  }, [customWindowRefs, windowFolderAvailable, listWindowImages]);

  const loadAll = useCallback(async () => {
    if (inputImageLogCapture?.available) setImgRows(await inputImageLogCapture.loadLatest());
    if (inputCapture?.available) {
      const result = await inputCapture.loadLatest();
      setCapture({ left: result.left, right: result.right });
    }
    if (propertiesCapture?.available) {
      const entries = await propertiesCapture.loadLatest();
      if (entries.length) {
        setImgProps({
          path: entries[0]?.value || "",
          size: entries[1]?.value || "",
          resolution: entries[2]?.value || "",
          timestamp: entries[3]?.value || "",
          p05: entries[4]?.value || "",
        });
      }
    }
    if (preprocessedCapture?.available) {
      const images = await preprocessedCapture.loadLatest();
      setPpImages(images.map((f) => f.url));
    }
    if (obstacleDetectionCapture?.available) {
      const d = await obstacleDetectionCapture.loadLatest();
      setObsDetRows(d.obstacles || []);
      setMaskImg(d.mask);
      setBboxImg(d.bboxes);
    }
    if (occupancyGridCapture?.available) {
      const o = await occupancyGridCapture.loadLatest();
      setOccRows(o.obstacles || []);
      setGridImg(o.image);
    }
    if (predSafePathCapture?.available) {
      const safePath = await predSafePathCapture.loadLatest();
      setSafePathImg(safePath.image);
    }
    if (waypointsLogCapture?.available) setWaypointRows(await waypointsLogCapture.loadLatest());
    if (distanceMapCapture?.available) {
      const d = await distanceMapCapture.loadLatest();
      setDistanceRows(d.distances || []);
      setDistanceImages({
        obstacleDistancesImg: d.obstacleDistancesImg,
        distanceMapImg: d.distanceMapImg,
        view3dImg: d.view3dImg,
        elevationImg: d.elevationImg,
      });
    }
    if (roverHealthCapture?.available) {
      const rows = await roverHealthCapture.loadLatest();
      setRoverRows(
        rows.map((r) => ({
          subsystem: r.subsystem ?? "",
          status: r.status ?? "",
          health: r.health === "" || r.health === null || r.health === undefined ? "" : `${r.health}%`,
          battery: r.battery === "" || r.battery === null || r.battery === undefined ? "" : `${r.battery}%`,
        }))
      );
    }
    if (navImagesCapture?.available) setNavImages(await navImagesCapture.loadLatest());
    if (navPropertiesCapture?.available) setNavProps(await navPropertiesCapture.loadLatest());
    if (telemetryLogCapture?.available) setTelemetryRows(await telemetryLogCapture.loadLatest());
    if (telecommandLogCapture?.available) setTelecommandRows(await telecommandLogCapture.loadLatest());
  }, [
    inputImageLogCapture,
    inputCapture,
    propertiesCapture,
    preprocessedCapture,
    obstacleDetectionCapture,
    occupancyGridCapture,
    predSafePathCapture,
    waypointsLogCapture,
    distanceMapCapture,
    roverHealthCapture,
    navImagesCapture,
    navPropertiesCapture,
    telemetryLogCapture,
    telecommandLogCapture,
  ]);

  // Intentionally NOT loading on mount — starts empty on login / on first
  // visit, same as every other screen. Only Run Algorithms succeeding
  // (runSignal increments) pulls anything in from disk.
  useEffect(() => {
    if (runSignal === 0) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSignal]);

  useEffect(() => {
    loadCustomWindowData();
  }, [loadCustomWindowData]);

  // Real rows only — no fallback to the static demo arrays, so this table
  // stays empty (like every other screen) until Run Algorithms has
  // actually produced something on disk.
  const parameterTables = useMemo(
    () => [
      { ...PARAMETER_TABLES[0], rows: imgRows },
      { ...PARAMETER_TABLES[1], rows: obsDetRows },
      { ...PARAMETER_TABLES[2], rows: occRows },
      { ...PARAMETER_TABLES[3], rows: waypointRows },
      { ...PARAMETER_TABLES[4], rows: distanceRows },
    ],
    [imgRows, obsDetRows, occRows, waypointRows, distanceRows]
  );
  const roverTable = useMemo(() => ({ ...ROVER_TABLE, rows: roverRows }), [roverRows]);

  // One extra Parameter Table per custom-screen window that has a real
  // folder attached, showing its actual files (name/size/timestamp) —
  // these get appended after the 5 built-in tables in the cycle.
  const customParameterTables = useMemo(
    () =>
      customWindowRefs.map((ref) => {
        const images = customWindowRows[ref.key] || [];
        return {
          key: ref.key,
          heading: `Parameter Table — ${ref.name} (${ref.screenName})`,
          columns: [
            { label: "Image Name", key: "name" },
            { label: "Size", key: "size" },
            { label: "Timestamp", key: "timestamp" },
          ],
          rows: images.map((img) => ({
            name: img.name,
            size: img.size ? `${(img.size / 1024).toFixed(0)} KB` : "",
            timestamp: img.mtime ? new Date(img.mtime).toLocaleString() : "",
          })),
        };
      }),
    [customWindowRefs, customWindowRows]
  );

  const allParameterTables = useMemo(
    () => [...parameterTables, ...customParameterTables],
    [parameterTables, customParameterTables]
  );

  // The right sidebar is a per-tab checklist (the other tabs that make up
  // the Data summary), NOT a per-window list. Checking a tab tells
  // "Generate Report" which tab's content to compile into the PDF section.
  // Each entry names a tab and builds that tab's report section(s) from the
  // data this screen already captures via loadAll().
  const tabItems = useMemo(
    () => [
      {
        id: "input",
        name: "Input",
        build: () => {
          const images = [
            ...(capture.left ? [{ caption: "Left Image", url: capture.left }] : []),
            ...(capture.right ? [{ caption: "Right Image", url: capture.right }] : []),
          ];
          const propsSection = imagePropertiesReportSection(imgProps);
          return [
            ...(images.length ? [{ heading: "Input — Captured Images", images }] : []),
            ...(propsSection ? [{ heading: `Input — ${propsSection.heading}`, table: propsSection.table }] : []),
          ];
        },
      },
      {
        id: "obsdet",
        name: "Obs. Det.",
        build: () => {
          const images = [
            ...(maskImg ? [{ caption: "Obstacle Pixel Mask", url: maskImg }] : []),
            ...(bboxImg ? [{ caption: "Obstacle BBoxes", url: bboxImg }] : []),
          ];
          const table = obsDetRows.length
            ? {
                columns: ["Img No.", ...PARAMETER_TABLES[1].columns.map((c) => c.label)],
                rows: obsDetRows.map((row, i) => [i + 1, ...PARAMETER_TABLES[1].columns.map((c) => row[c.key] ?? "")]),
              }
            : null;
          return [
            ...(images.length ? [{ heading: "Obstacle Detection — Outputs", images }] : []),
            ...(table ? [{ heading: "Obstacle Detection — Detection Table", table }] : []),
          ];
        },
      },
      {
        id: "safepath",
        name: "Safe Path",
        build: () => {
          const images = safePathImg ? [{ caption: "Predicted Safe Path", url: safePathImg }] : [];
          const table = waypointRows.length
            ? {
                columns: ["Img No.", ...PARAMETER_TABLES[3].columns.map((c) => c.label)],
                rows: waypointRows.map((row, i) => [i + 1, ...PARAMETER_TABLES[3].columns.map((c) => row[c.key] ?? "")]),
              }
            : null;
          return [
            ...(images.length ? [{ heading: "Safe Path — Outputs", images }] : []),
            ...(table ? [{ heading: "Safe Path — Waypoints Table", table }] : []),
          ];
        },
      },
      {
        id: "distmap",
        name: "Dist. Map",
        build: () => {
          const images = [
            ...(distanceImages.obstacleDistancesImg ? [{ caption: "Obstacle Distances", url: distanceImages.obstacleDistancesImg }] : []),
            ...(distanceImages.distanceMapImg ? [{ caption: "Distance Map", url: distanceImages.distanceMapImg }] : []),
            ...(distanceImages.view3dImg ? [{ caption: "3D View", url: distanceImages.view3dImg }] : []),
            ...(distanceImages.elevationImg ? [{ caption: "Relative Elevation Map", url: distanceImages.elevationImg }] : []),
          ];
          const table = distanceRows.length
            ? {
                columns: ["Img No.", ...PARAMETER_TABLES[4].columns.map((c) => c.label)],
                rows: distanceRows.map((row, i) => [i + 1, ...PARAMETER_TABLES[4].columns.map((c) => row[c.key] ?? "")]),
              }
            : null;
          return [
            ...(images.length ? [{ heading: "Distance Map — Outputs", images }] : []),
            ...(table ? [{ heading: "Distance Map — Distance Table", table }] : []),
          ];
        },
      },
      {
        id: "navigation",
        name: "Navigation",
        build: () => {
          const images = [
            ...(navImages.last ? [{ caption: "Navigation — Last Image", url: navImages.last }] : []),
            ...(navImages.current ? [{ caption: "Navigation — Current Image", url: navImages.current }] : []),
          ];
          const rows = [
            ["Visual Odom. Distance", navProps.distance],
            ["Rover Coordinates", navProps.coords],
            ["Property_03", navProps.p03],
            ["Property_04", navProps.p04],
          ].filter(([, value]) => String(value ?? "").trim() !== "");
          const table = rows.length ? { columns: ["Parameter", "Value"], rows } : null;
          return [
            ...(images.length ? [{ heading: "Navigation — Outputs", images }] : []),
            ...(table ? [{ heading: "Navigation — Properties Table", table }] : []),
          ];
        },
      },
      {
        id: "sceneanalysis",
        name: "Scene Analysis",
        build: () => {
          const images = [
            ...(capture.left ? [{ caption: "NavCam Imagery 1", url: capture.left }] : []),
            ...(capture.right ? [{ caption: "NavCam Imagery 2", url: capture.right }] : []),
            ...(safePathImg ? [{ caption: "Obstacle with Safe Path", url: safePathImg }] : []),
          ];
          const sections = [
            {
              heading: "Scene Analysis — Scene Description",
              intro: "The record of the scene analysis for the selected windows is as follows:",
              ...(images.length ? { images } : {}),
            },
          ];
          return sections;
        },
      },
      {
        id: "telemetry",
        name: "Telemetry",
        build: () => {
          const telemetryTable = telemetryRows.length
            ? {
                columns: ["Img No.", ...(TELEMETRY_COLUMNS || []).map((c) => c.label)],
                rows: telemetryRows.map((row, i) => [i + 1, ...(TELEMETRY_COLUMNS || []).map((c) => row[c.key] ?? "")]),
              }
            : null;
          const telecommandTable = telecommandRows.length
            ? {
                columns: ["Img No.", ...(TELECOMMAND_COLUMNS || []).map((c) => c.label)],
                rows: telecommandRows.map((row, i) => [i + 1, ...(TELECOMMAND_COLUMNS || []).map((c) => row[c.key] ?? "")]),
              }
            : null;
          return [
            ...(telemetryTable ? [{ heading: "Telemetry — Log", table: telemetryTable }] : []),
            ...(telecommandTable ? [{ heading: "Telemetry — Telecommand Log", table: telecommandTable }] : []),
          ];
        },
      },
    ],
    [
      capture,
      imgProps,
      maskImg,
      bboxImg,
      obsDetRows,
      safePathImg,
      waypointRows,
      distanceImages,
      distanceRows,
      navImages,
      navProps,
      telemetryRows,
      telecommandRows,
    ]
  );

  const table = allParameterTables[tableIndex];
  const cycleTable = (dir) => setTableIndex((i) => (i + dir + allParameterTables.length) % allParameterTables.length);

  const toggleCheck = (id) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const checkedItems = tabItems.filter((item) => checked[item.id]);

  // The real captured image(s) behind each "Data to Share" window — same
  // sources Obs. Det. / Safe Path / Dist. Map read from — keyed by item id
  // so both handlers below can just look up `IMAGE_MAP[item.id]`.
  const IMAGE_MAP = useMemo(
    () => ({
      left: capture.left ? [{ caption: "Left Image", url: capture.left }] : [],
      right: capture.right ? [{ caption: "Right Image", url: capture.right }] : [],
      preprocessed: ppImages.length ? [{ caption: "Preprocessed Image", url: ppImages[0] }] : [],
      obsdet: [
        maskImg ? { caption: "Obstacle Pixel Mask", url: maskImg } : null,
        bboxImg ? { caption: "Obstacle BBoxes", url: bboxImg } : null,
      ].filter(Boolean),
      occupancy: gridImg ? [{ caption: "Occupancy Grid Map", url: gridImg }] : [],
      predsafepath: safePathImg ? [{ caption: "Predicted Safe Path", url: safePathImg }] : [],
      distances: distanceImages.obstacleDistancesImg ? [{ caption: "Obstacle Distances", url: distanceImages.obstacleDistancesImg }] : [],
      distancemap: distanceImages.distanceMapImg ? [{ caption: "Distance Map", url: distanceImages.distanceMapImg }] : [],
      threedview: distanceImages.view3dImg ? [{ caption: "3D View", url: distanceImages.view3dImg }] : [],
      elevation: distanceImages.elevationImg ? [{ caption: "Relative Elevation Map", url: distanceImages.elevationImg }] : [],
    }),
    [capture.left, capture.right, ppImages, maskImg, bboxImg, gridImg, safePathImg, distanceImages]
  );

  // "All Windows" (Task 2e): a single gallery on the Data tab that shows
  // every captured output window the pipeline has produced so far, always in
  // the same order (Input -> Preprocessed -> Obstacle Detection -> Occupancy
  // -> Safe Path -> Distance Map -> 3D -> Elevation). Only windows the
  // backend has actually produced appear.
  const allWindows = useMemo(
    () =>
      [
        ...IMAGE_MAP.left,
        ...IMAGE_MAP.right,
        ...IMAGE_MAP.preprocessed,
        ...IMAGE_MAP.obsdet,
        ...IMAGE_MAP.occupancy,
        ...IMAGE_MAP.predsafepath,
        ...IMAGE_MAP.distances,
        ...IMAGE_MAP.distancemap,
        ...IMAGE_MAP.threedview,
        ...IMAGE_MAP.elevation,
      ].filter((t) => t && t.url),
    [
      IMAGE_MAP.left,
      IMAGE_MAP.right,
      IMAGE_MAP.preprocessed,
      IMAGE_MAP.obsdet,
      IMAGE_MAP.occupancy,
      IMAGE_MAP.predsafepath,
      IMAGE_MAP.distances,
      IMAGE_MAP.distancemap,
      IMAGE_MAP.threedview,
      IMAGE_MAP.elevation,
    ]
  );


  // Every ticked tab becomes its own set of numbered sections in the PDF —
  // images (where Run Algorithms has produced one this session) plus its
  // data table, mirroring the content that tab displays. If a checked tab
  // has no captured content yet, its section falls back to a short note
  // instead of rendering empty.
  const handleGenerateReport = async () => {
    if (checkedItems.length === 0) {
      pushToast({ type: "error", title: "Nothing to report", message: "Tick at least one tab to include in the report first." });
      return;
    }

    const sections = checkedItems.flatMap((item) => {
      const built = item.build();
      if (!built.length) {
        return [{ heading: item.name, imageNotes: ["Nothing captured for this tab yet — run Run Algorithms first."] }];
      }
      return built;
    });

    await runGenerateReport(generateReport, pushToast, "Data", sections);
  };

  return (
    <div className="content">
      <div className="screen-grid">
        <div className="data-tables">
          <DataTablePanel id="param" title={table.heading} table={table} showNav
            onPrev={() => cycleTable(-1)} onNext={() => cycleTable(1)}
            selected={selected.param} onSelectChange={(v) => setSelected((s) => ({ ...s, param: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            onExpand={() => setExpandedContent({ title: table.heading, table })} />
          <DataTablePanel id="rover" title={roverTable.heading} table={roverTable} fit
            selected={selected.rover} onSelectChange={(v) => setSelected((s) => ({ ...s, rover: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            onExpand={() => setExpandedContent({ title: roverTable.heading, table: roverTable })} />

          <div className="all-windows">
            <div className="all-windows__head">
              <span>All Windows</span>
              <span className="all-windows__count">{allWindows.length} window{allWindows.length === 1 ? "" : "s"}</span>
            </div>
            {allWindows.length === 0 ? (
              <div className="all-windows__empty">
                Run Algorithms to produce pipeline outputs; every generated
                window will appear here.
              </div>
            ) : (
              <div className="all-windows__grid">
                {allWindows.map((w, i) => (
                  <figure key={i} className="all-windows__tile">
                    <img src={w.url} alt={w.caption} />
                    <figcaption>{w.caption}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="sidepanel">
          <div className="propbox share-box">
            <div className="propbox__title"><span>Tabs to include in report</span></div>
            <div className="share-list">
              {tabItems.map((item) => (
                <label className="share-item" key={item.id}>
                  <Checkbox checked={!!checked[item.id]} onChange={() => toggleCheck(item.id)} />
                  <span>{item.name}</span>
                </label>
              ))}
            </div>
          </div>

<div className="btn-row">
            <PipelineRunButton
              actionId="occupancyGrid"
              label="data.exe"
              runningLabel="Building grid..."
              title="Occupancy Grid"
              hint="left"
              pushToast={pushToast}
              onDone={loadAll}
            />
            <button className="btn" onClick={handleGenerateReport}>Generate Report</button>
          </div>
        </aside>
      </div>
    </div>
  );
}


function SettingsModal({ onClose, fontChoice, setFontChoice, fontSize, setFontSize }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__bar">
          <span className="modal__title">Display settings</span>
          <button className="modal__close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="settings-body">
          <div className="settings-field">
            <span>Font pairing</span>
            <div className="font-pairing-list">
              {Object.entries(FONT_PAIRINGS).map(([key, f]) => (
                <button
                  key={key}
                  type="button"
                  className={`font-pairing-card${fontChoice === key ? " is-active" : ""}`}
                  onClick={() => setFontChoice(key)}
                >
                  <div className="font-pairing-preview" style={{ fontFamily: f.heading }}>Vision Navigation Software</div>
                  <div className="font-pairing-body-preview" style={{ fontFamily: f.body }}>Obstacle detection · Safe path · Distance map</div>
                  <div className="font-pairing-meta">
                    <span className="font-pairing-label">{f.label}</span>
                    <span className="font-pairing-note">{f.note}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <label className="settings-field">
            <span>Font size ({fontSize}px)</span>
            <input className="settings-range" type="range" min={12} max={20} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
          </label>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Telemetry & Telecommand (Task 2d)
----------------------------------------------------------------
   Two side-by-side panels showing the ongoing Telecommand log
   (11_Telecommand_Data) and Telemetry log (12_Telemetry_Data), each
   with a Run button that launches the matching stage script so the
   vessel's live telemetry can be refreshed on demand.
================================================================ */
function TelemetryScreen({ setExpandedContent, pushToast, telecommandLogCapture, telemetryLogCapture, telemetryRunner, runSignal }) {
  const [activeWindow, setActiveWindow] = useState("telecommand");
  const [selected, setSelected] = useState({ telecommand: true, telemetry: true });
  const [telemetryRows, setTelemetryRows] = useState([]);
  const [telecommandRows, setTelecommandRows] = useState([]);
  const [telemetryBusy, setTelemetryBusy] = useState(false);
  const [telecommandBusy, setTelecommandBusy] = useState(false);

  const loadAll = useCallback(async () => {
    if (telecommandLogCapture?.available) {
      setTelecommandRows(await telecommandLogCapture.loadLatest());
    }
    if (telemetryLogCapture?.available) {
      setTelemetryRows(await telemetryLogCapture.loadLatest());
    }
  }, [telecommandLogCapture, telemetryLogCapture]);

  useEffect(() => {
    if (runSignal === 0) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSignal]);

  const runTelecommand = async () => {
    if (!telemetryRunner?.available) {
      pushToast({ type: "error", title: "Unavailable", message: "Telecommand is only available in the desktop app." });
      return;
    }
    setTelecommandBusy(true);
    const result = await telemetryRunner.run("telecommand");
    setTelecommandBusy(false);
    if (result?.ok) {
      pushToast({ type: "success", title: "Telecommand sent", message: "Log refreshed." });
      await telecommandLogCapture.loadLatest().then(setTelecommandRows);
    } else {
      pushToast({ type: "error", title: "Telecommand failed", message: result?.error || "Unknown error." });
    }
  };

  const runTelemetry = async () => {
    if (!telemetryRunner?.available) {
      pushToast({ type: "error", title: "Unavailable", message: "Telemetry is only available in the desktop app." });
      return;
    }
    setTelemetryBusy(true);
    const result = await telemetryRunner.run("telemetry");
    setTelemetryBusy(false);
    if (result?.ok) {
      pushToast({ type: "success", title: "Telemetry refreshed", message: "Log updated." });
      await telemetryLogCapture.loadLatest().then(setTelemetryRows);
    } else {
      pushToast({ type: "error", title: "Telemetry failed", message: result?.error || "Unknown error." });
    }
  };

  // Same data-table shape as the rest of the app, so both logs can be
  // rendered with the shared DataTablePanel (checkbox + expand like the
  // Data tab) instead of bespoke side-by-side panels.
  const telecommandTable = useMemo(() => ({
    heading: "Telecommand Log (11_Telecommand_Data)",
    columns: TELECOMMAND_COLUMNS,
    rows: telecommandRows.map((r, i) => ({
      imgNo: i + 1, module: r.module ?? "", size: r.size ?? "", value: r.value ?? "",
      timestamp: r.timestamp ?? "", status: r.status ?? "",
    })),
  }), [telecommandRows]);

  const telemetryTable = useMemo(() => ({
    heading: "Telemetry Log (12_Telemetry_Data)",
    columns: TELEMETRY_COLUMNS,
    rows: telemetryRows.map((r, i) => ({
      imgNo: i + 1, module: r.module ?? "", size: r.size ?? "", value: r.value ?? "",
      timestamp: r.timestamp ?? "", status: r.status ?? "",
    })),
  }), [telemetryRows]);

  return (
    <div className="content">
      <div className="section__header">
        <div>
          <h1 className="section__title">Telemetry & Telecommand</h1>
          <p className="section__hint">Live vessel telemetry and issued telecommands.</p>
        </div>
      </div>

      <div className="screen-grid">
        <div className="data-tables">
          <DataTablePanel id="telecommand" title={telecommandTable.heading} table={telecommandTable}
            selected={selected.telecommand}
            onSelectChange={(v) => setSelected((s) => ({ ...s, telecommand: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            onExpand={() => setExpandedContent({ title: telecommandTable.heading, table: telecommandTable })} />

          <DataTablePanel id="telemetry" title={telemetryTable.heading} table={telemetryTable}
            selected={selected.telemetry}
            onSelectChange={(v) => setSelected((s) => ({ ...s, telemetry: v }))}
            activeWindow={activeWindow} onFocus={setActiveWindow}
            onExpand={() => setExpandedContent({ title: telemetryTable.heading, table: telemetryTable })} />
        </div>

        <aside className="sidepanel">
          <div className="propbox share-box">
            <div className="propbox__title"><span>Refresh Logs</span></div>
            <div className="share-list">
              <button className="btn btn-primary" disabled={telecommandBusy} onClick={runTelecommand}>
                {telecommandBusy ? "Sending..." : "telecommand.exe"}
              </button>
              <button className="btn btn-primary" disabled={telemetryBusy} onClick={runTelemetry}>
                {telemetryBusy ? "Refreshing..." : "telemetry.exe"}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ================================================================
   App shell
================================================================ */
export default function VNSApp() {
  const { role } = useAuth();
  const canEdit = role === "admin" || role === "editor";
  const isAdmin = role === "admin";
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [theme, setTheme] = useState("light");
const [activeScreen, setActiveScreen] = useState(() => {
  return localStorage.getItem("vns-active-screen") || "Input";
});
  // NOTE: this used to be a live/paused toggle (Play<->Pause icon). Per
  // request it's now a single, non-toggling Play button — everything it
  // triggers (bumping playSignal to load the pending capture + raw images
  // and clear the blinking status dot) is unchanged.
  // Shared between the Obs. Det. and Safe Path tabs' "Preprocessed Image"
  // panel, so picking a specific frame in one carries over to the other
  // instead of each tab independently resetting to frame 1.
  const [ppFrameIndex, setPpFrameIndex] = useState(0);
  // Bumped on every topbar Play/Pause click. InputScreen watches this to
  // pull in the pending capture (and its sidecar properties) and clear the
  // blinking status dot — this is the ONLY thing that should ever turn the
  // dot off.
  const [playSignal, setPlaySignal] = useState(0);
  // Bumped every time Run Algorithms succeeds, AND every time Refresh is
  // clicked (see the topbar buttons below). Every screen's loadAll() effect
  // just watches this counter and re-pulls whatever's currently on disk for
  // the active session — it doesn't care which button caused the bump — so
  // Refresh reuses this same signal instead of needing its own wiring per
  // screen. InputScreen and ObstacleDetectionScreen (and friends) all watch
  // this to refresh their captured image / properties / preprocessed
  // frames — without this, a screen that was already open would keep
  // showing stale data until the user navigated away and back.
  const [runSignal, setRunSignal] = useState(0);
  // True once Run Algorithms has succeeded at least once this launch — lets
  // the Refresh button tell "nothing to refresh yet" apart from "refreshed,
  // found nothing new".
  const [hasSession, setHasSession] = useState(false);
  const [expandedContent, setExpandedContent] = useState(null);
  const { toasts, push, dismiss } = useToasts();

  // Owned here (not inside InputScreenHeader) so every tab can be force-
  // remounted (via the `key` below) whenever the workspace folder changes
  // — including being cleared back to "none". A plain useState reset isn't
  // enough to guarantee no old data lingers on screen; unmounting/
  // remounting the whole tab is the only way to be certain nothing carries
  // over from a previous folder (or from manual "Load" testing) into a new
  // one.
  const { root: workspaceRoot, chooseRoot: chooseWorkspaceRoot, available: workspaceAvailable } = useWorkspaceRoot();
  const workspaceKey = workspaceRoot || "no-workspace";

  // Owned here (not inside InputScreen) so the single top status dot can see
  // the same state that drives the panels' Play-button loads.
  const rawWatch = useRawImagesWatch();
  const hasPendingImage = rawWatch.hasNewImage;
  const inputCapture = useInputCaptureWatch();
  const propertiesCapture = useLatestProperties();
  const preprocessedCapture = usePreprocessedImages();
  const obstacleDetectionCapture = useObstacleDetection();
  const distanceMapCapture = useDistanceMap();
  const occupancyGridCapture = useOccupancyGrid();
  const predSafePathCapture = usePredSafePath();
  const roverHealthCapture = useRoverHealthStatus();
  const inputImageLogCapture = useInputImageLog();
  const waypointsLogCapture = useWaypointsLog();
  const telemetryLogCapture = useTelemetryLog();
  const telecommandLogCapture = useTelecommandLog();
  const telemetryRunner = useTelemetryRunner();
  const navImagesCapture = useNavigationImages();
  const navPropertiesCapture = useNavigationProperties();
  const rosVideoCapture = useRosSimulationVideo();
  const sceneQuery = useSceneAnalysisQuery();
  const generateReport = useGenerateReport();
  const shareWindows = useShareWindows();
  const inputScreenRef = useRef(null);

  const {
    customScreens,
    activeCustomScreen,
    addScreenOpen,
    setAddScreenOpen,
    createCustomScreen,
    removeCustomScreen,
  } = useCustomScreens({ activeScreen, setActiveScreen, coreScreens: CORE_SCREENS, pushToast: push });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontChoice, setFontChoice] = useState("system");
  const [fontSize, setFontSize] = useState(14);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = GOOGLE_FONTS_URL;
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

// Save the currently selected screen
useEffect(() => {
  localStorage.setItem(
    "vns-active-screen",
    activeScreen
  );
}, [activeScreen]);
  const topbarTitle = activeCustomScreen
    ? `VNS - ${activeCustomScreen.name.toUpperCase()}`
    : `VNS - ${activeScreen.toUpperCase()}`;

  return (
    <div
      className={`vns vns--${theme}${!canEdit ? " vns--readonly" : ""}`}
      style={{
        "--sans": FONT_PAIRINGS[fontChoice].body,
        "--font-heading": FONT_PAIRINGS[fontChoice].heading,
        "--mono": FONT_PAIRINGS[fontChoice].mono,
        zoom: fontSize / 14,
      }}
    >
      <style>{`
        /* Panel-header buttons (maximize, play/pause, rename) and the
           prev/next frame arrows were nearly invisible against the blue
           panel__bar gradient — this gives them real contrast. */
        .icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; min-width: 22px;
          background: rgba(255, 255, 255, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.45);
          border-radius: 4px;
          color: #ffffff;
          cursor: pointer;
        }
        .icon-btn:hover { background: rgba(255, 255, 255, 0.32); border-color: #ffffff; }
        .icon-btn--active { background: rgba(255, 255, 255, 0.42); border-color: #ffffff; }
        .panel__nav-arrow {
          display: inline-flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; min-width: 20px;
          background: transparent; border: none; padding: 0;
          color: #ffffff; opacity: 0.85; cursor: pointer;
        }
        .panel__nav-arrow:hover:not(:disabled) { opacity: 1; }
        .panel__nav-arrow:disabled { opacity: 0.25; cursor: default; }

        /* Blinking attention pulse on the green status dot (overrides the
           default subtle ring-pulse from App.css with a real on/off blink) */
        .topbar__status .status-dot:not(.status-dot--off) {
          animation: status-dot-blink 1s ease-in-out infinite;
        }
        @keyframes status-dot-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }

        /* Property bar/box height caps + scrolling now live in App.css
           (the single source of truth — see .propbar and .propbox__body
           there), alongside the .content min-height:0 fix that was the
           actual root cause of the bar pushing the screen around. */

        /* Data screen's Parameter Table + Rover Characterization panels
           (both render through DataTablePanel, so one rule covers both)
           used to grow taller as more real rows piled up over a session —
           however many captures/obstacles had accumulated dictated the
           panel's height, making the screen feel cluttered and shifting
           whatever was below it. The Parameter Table shows a fixed
           5-data-row window; anything beyond that scrolls internally
           instead of growing the panel. flex: 0 0 auto stops the parent's
           flex layout from re-stretching it back out to fill the column. */
        .data-table-panel {
          flex: 0 0 auto;
        }
        .data-table-panel .data-table-wrap {
          max-height: 231px;  /* header row (~36px) + 5 data rows (~39px each) */
          min-height: 231px;
          overflow-y: auto;
          overflow-x: auto;
        }
        /* Rover Characterization ("fit") panel instead hugs its actual row
           count — 1 row, 2 rows, whatever is really there — instead of
           always reserving a fixed 5-row block of empty space. It only
           starts scrolling once rows exceed the 4-row cap; it never grows
           past that, so it can't push the rest of the screen (and the
           page-level scrollbar that produced) around. */
        .data-table-panel--fit .data-table-wrap {
          min-height: 0;
          height: auto;
          max-height: 192px;  /* header row (~36px) + 4 data rows (~39px each) */
        }
        /* Pins the header row while the body scrolls underneath it, with a
           solid background (sampled from the header's existing shading) so
           scrolled-past rows never show through it. */
        .data-table-panel .data-table thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #6f7e92;
        }
      `}</style>

      <div className="topbar">
        <div className="topbar__status">
          <span className={`status-dot${hasPendingImage ? "" : " status-dot--off"}`} title={hasPendingImage ? "New raw image detected — press Play to load it" : "No new raw image waiting"} />
          <button
            className="topbar__play"
            onClick={() => {
              setPlaySignal((n) => n + 1); // triggers the load + clears the dot
            }}
            title="Play — load the latest raw image into CAM-L / CAM-R"
          >
            <Play size={13} />
          </button>
          <button
            className="topbar__run-btn"
            onClick={async () => {
              const sel = inputScreenRef.current?.getSelectedRawPaths();
              if (!sel || (!sel.leftPath && !sel.rightPath)) {
                push({ type: "error", title: "Nothing selected", message: "Load and pick a Left/Right image in the Input screen first." });
                return;
              }
              const result = await runAlgorithms(sel.leftPath, sel.rightPath);
              if (result.ok) {
                push({ type: "success", title: "Sent to Input", message: `Copied into 03_Input_Image/${result.sessionFolder}.` });
                setHasSession(true);
                setRunSignal((n) => n + 1);
              } else {
                push({ type: "error", title: "Could not run", message: result.error || "Something went wrong." });
              }
            }}
            title="Run algorithms"
          >
            <Cpu size={13} />
            <span>Run Algorithms</span>
          </button>
          <button
            className="topbar__run-btn"
            onClick={() => {
              if (!hasSession) {
                push({ type: "error", title: "Nothing to refresh", message: "Run Algorithms first to start a session." });
                return;
              }
              // Re-pulls every screen's data from disk. Each panel's newest
              // matching file (by timestamp) in the current session's
              // folders replaces whatever it was showing before — nothing
              // old is left on screen once the new value comes in.
              setRunSignal((n) => n + 1);
              push({ type: "success", title: "Refreshed", message: "Reloaded the latest files from the current session." });
            }}
            title="Refresh — reload whatever's newest in the current session's folders"
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
        </div>
        <h1 className="topbar__title">{topbarTitle}</h1>
        <div className="topbar__right">
          {isAdmin && (
            <button
              className="topbar__ghost-btn"
              onClick={() => setAdminPanelOpen(true)}
              title="Manage users & roles"
              style={{ width: "auto", padding: "0 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}
            >
              USERS
            </button>
          )}

          <RoleRequestButton />
          <button className="topbar__ghost-btn" onClick={() => setSettingsOpen(true)} title="Font & display settings">
            <Settings size={14} />
          </button>
          <button className="topbar__ghost-btn" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))} title="Toggle light / dark theme">
            {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <UserMenu />
        </div>
      </div>
      {adminPanelOpen && <AdminPanel onClose={() => setAdminPanelOpen(false)} />}

      <div className="body">
        <nav className="rail">
          {CORE_SCREENS.map((s) => (
            <button key={s} className={`rail__tab${activeScreen === s ? " rail__tab--active" : ""}`} onClick={() => setActiveScreen(s)}>
              {s}
            </button>
          ))}
          {customScreens.map((s) => (
            <div key={s.id} className="rail__tab-custom">
              <button className={`rail__tab${activeScreen === s.id ? " rail__tab--active" : ""}`} onClick={() => setActiveScreen(s.id)}>
                {s.name}
              </button>
              <button className="rail__tab-remove" onClick={(e) => { e.stopPropagation(); removeCustomScreen(s.id); }} title="Remove screen">
                <X size={12} />
              </button>
            </div>
          ))}
          <button className="rail__add" onClick={() => setAddScreenOpen(true)} title="Add new screen">
            <Plus size={14} /> New Screen
          </button>
        </nav>

        {activeScreen === "Input" && (
          <InputScreen
            key={workspaceKey}
            ref={inputScreenRef}
            setExpandedContent={setExpandedContent}
            pushToast={push}
            inputCapture={inputCapture}
            playSignal={playSignal}
            runSignal={runSignal}
            propertiesCapture={propertiesCapture}
            rawWatch={rawWatch}
            workspaceRoot={workspaceRoot}
            chooseWorkspaceRoot={chooseWorkspaceRoot}
            workspaceAvailable={workspaceAvailable}
          />
        )}
        {activeScreen === "Obs. Det." && (
          <ObstacleDetectionScreen
            key={workspaceKey}
            setExpandedContent={setExpandedContent}
            pushToast={push}
            inputCapture={inputCapture}
            propertiesCapture={propertiesCapture}
            preprocessedCapture={preprocessedCapture}
            obstacleDetectionCapture={obstacleDetectionCapture}
            roverHealthCapture={roverHealthCapture}
            runSignal={runSignal}
            ppFrameIndex={ppFrameIndex}
            setPpFrameIndex={setPpFrameIndex}
            generateReport={generateReport}
            shareWindows={shareWindows}
          />
        )}
        {activeScreen === "Safe Path" && (
          <SafePathScreen
            key={workspaceKey}
            setExpandedContent={setExpandedContent}
            pushToast={push}
            inputCapture={inputCapture}
            propertiesCapture={propertiesCapture}
            preprocessedCapture={preprocessedCapture}
            obstacleDetectionCapture={obstacleDetectionCapture}
            occupancyGridCapture={occupancyGridCapture}
            predSafePathCapture={predSafePathCapture}
            roverHealthCapture={roverHealthCapture}
            runSignal={runSignal}
            ppFrameIndex={ppFrameIndex}
            setPpFrameIndex={setPpFrameIndex}
            generateReport={generateReport}
            shareWindows={shareWindows}
          />
        )}
        {activeScreen === "Dist. Map" && (
          <DistanceMapScreen key={workspaceKey} setExpandedContent={setExpandedContent} pushToast={push} roverHealthCapture={roverHealthCapture} distanceMapCapture={distanceMapCapture} runSignal={runSignal} generateReport={generateReport} shareWindows={shareWindows} />
        )}
        {activeScreen === "Navigation" && (
          <NavigationScreen
            key={workspaceKey}
            setExpandedContent={setExpandedContent}
            pushToast={push}
            navImagesCapture={navImagesCapture}
            navPropertiesCapture={navPropertiesCapture}
            rosVideoCapture={rosVideoCapture}
            runSignal={runSignal}
          />
        )}
        {activeScreen === "Data" && (
          <DataScreen
            key={workspaceKey}
            pushToast={push}
            setExpandedContent={setExpandedContent}
            inputCapture={inputCapture}
            propertiesCapture={propertiesCapture}
            preprocessedCapture={preprocessedCapture}
            predSafePathCapture={predSafePathCapture}
            inputImageLogCapture={inputImageLogCapture}
            obstacleDetectionCapture={obstacleDetectionCapture}
            occupancyGridCapture={occupancyGridCapture}
            waypointsLogCapture={waypointsLogCapture}
            distanceMapCapture={distanceMapCapture}
            roverHealthCapture={roverHealthCapture}
            navImagesCapture={navImagesCapture}
            navPropertiesCapture={navPropertiesCapture}
            telemetryLogCapture={telemetryLogCapture}
            telecommandLogCapture={telecommandLogCapture}
            runSignal={runSignal}
            customScreens={customScreens}
            generateReport={generateReport}
          />
        )}
        {activeScreen === "Scene Analysis" && (
          <SceneAnalysisScreen
            key={workspaceKey}
            setExpandedContent={setExpandedContent}
            pushToast={push}
            inputCapture={inputCapture}
            predSafePathCapture={predSafePathCapture}
            sceneQuery={sceneQuery}
            runSignal={runSignal}
            generateReport={generateReport}
            shareWindows={shareWindows}
          />
        )}
        {activeScreen === "Telemetry" && (
          <TelemetryScreen
            key={workspaceKey}
            setExpandedContent={setExpandedContent}
            pushToast={push}
            telecommandLogCapture={telecommandLogCapture}
            telemetryLogCapture={telemetryLogCapture}
            telemetryRunner={telemetryRunner}
            runSignal={runSignal}
          />
        )}
        {activeCustomScreen && (
          <CustomScreen screen={activeCustomScreen} pushToast={push} customScreens={customScreens} />
        )}
        {!["Input", "Obs. Det.", "Safe Path", "Dist. Map", "Navigation", "Scene Analysis", "Telemetry", "Data"].includes(activeScreen) && !activeCustomScreen && (
          <div className="content">
            <div className="placeholder-screen">
              <strong>{activeScreen}</strong>
              <span>This screen isn't built yet in this pass.</span>
            </div>
          </div>
        )}
      </div>

      {addScreenOpen && (
        <AddScreenModal
          onClose={() => setAddScreenOpen(false)}
          onCreate={createCustomScreen}
          customScreens={customScreens}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          fontChoice={fontChoice}
          setFontChoice={setFontChoice}
          fontSize={fontSize}
          setFontSize={setFontSize}
        />
      )}

      {expandedContent && (
        <div className="modal-overlay" onClick={() => setExpandedContent(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__bar">
              <span className="modal__title">{expandedContent.title}</span>
              <button className="modal__close" onClick={() => setExpandedContent(null)}><X size={15} /></button>
            </div>
            <div className={`modal__stage${expandedContent.table ? " modal__stage--table" : ""}`}>
              {expandedContent.table ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Img No.</th>
                      {expandedContent.table.columns.map((c) => (
                        <th key={c.key}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {expandedContent.table.rows.map((row, i) => (
                      <tr key={i}>
                        <td>{i + 1}.</td>
                        {expandedContent.table.columns.map((c) => (
                          <td key={c.key}>{row[c.key] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <img
                  src={expandedContent.images ? (expandedContent.images[expandedContent.index] || terrainDataUri(9)) : expandedContent.uri}
                  alt={expandedContent.title}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
