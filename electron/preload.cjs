// electron/preload.cjs
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("workspace", {
  chooseRoot: () => ipcRenderer.invoke("workspace:choose-root"),
  getRoot: () => ipcRenderer.invoke("workspace:get-root"),

  // 02_Raw_Image browsing + Run Algorithms
  listRawImages: () => ipcRenderer.invoke("workspace:list-raw-images"),

  // Custom ("+ New Screen") windows: pick any folder on disk, and list
  // whatever images are inside it (independent of the workspace root).
  chooseWindowFolder: () => ipcRenderer.invoke("workspace:choose-window-folder"),
  listFolderImages: (folderPath) => ipcRenderer.invoke("workspace:list-folder-images", folderPath),

  // Custom-screen windows: automatic folder provisioning (replaces the old
  // manual "Select folder" flow). ensureWindowFolder creates/returns the
  // window's permanent + current-session folders; renameWindowFolder moves
  // them when the window is renamed; listWindowFolderContents reads the
  // merged images + any JSON/txt/csv sidecar for the Properties sidebar.
  ensureWindowFolder: (windowName) =>
    ipcRenderer.invoke("workspace:ensure-window-folder", windowName),
  renameWindowFolder: (oldWindowName, newWindowName) =>
    ipcRenderer.invoke("workspace:rename-window-folder", oldWindowName, newWindowName),
  listWindowFolderContents: (persistentPath, sessionPath) =>
    ipcRenderer.invoke("workspace:list-window-folder-contents", persistentPath, sessionPath),
  runAlgorithms: (leftPath, rightPath) =>
    ipcRenderer.invoke("workspace:run-algorithms", leftPath, rightPath),

  // 03_Input_Image latest capture + sidecar properties (NavCam panel / Property fields)
  getLatestCapture: () => ipcRenderer.invoke("workspace:get-latest-capture"),
  getLatestProperties: () => ipcRenderer.invoke("workspace:get-latest-properties"),

  // 04_Preprocessed latest session's images (Obs. Det. "Preprocessed Image" panel)
  listPreprocessedImages: () => ipcRenderer.invoke("workspace:list-preprocessed-images"),

  // 05_Obstacle.Detection latest session's mask/bbox images + obstacle records
  getLatestObstacleDetection: () => ipcRenderer.invoke("workspace:get-latest-obstacle-detection"),

  // 05_Obstacle.Detection: "Run Detection" button — launches the bundled
  // Python script (later a .exe) inside the active session folder. Accepts
  // the current input image path so the script knows what to process.
  runObstacleDetection: (inputImage) => ipcRenderer.invoke("workspace:run-obstacle-detection", inputImage),
  listDetectionScripts: () => ipcRenderer.invoke("workspace:list-detection-scripts"),

  // 06_Distance_Map latest session's 4 images + Obstacle_distances table
  getLatestDistanceMap: () => ipcRenderer.invoke("workspace:get-latest-distance-map"),

  // 07_Occupancy_Grid latest session's Grid.png + Grid.json obstacle table
  getLatestOccupancyGrid: () => ipcRenderer.invoke("workspace:get-latest-occupancy-grid"),

  // 08_Pred_Safe_Path latest session's SafePath.png
  getLatestPredSafePath: () => ipcRenderer.invoke("workspace:get-latest-pred-safe-path"),

  // 13_Rover_Health_Status/healthstatus.json (Rover Characteristics panel)
  getRoverHealthStatus: () => ipcRenderer.invoke("workspace:get-rover-health-status"),

  // Data screen's Parameter Tables — real logs instead of demo data
  getInputImageLog: () => ipcRenderer.invoke("workspace:get-input-image-log"),
  getWaypointsLog: () => ipcRenderer.invoke("workspace:get-waypoints-log"),
  getTelemetryLog: () => ipcRenderer.invoke("workspace:get-telemetry-log"),
  getTelecommandLog: () => ipcRenderer.invoke("workspace:get-telecommand-log"),

  // Pipeline-stage "Run" buttons (Safe Path, Dist. Map, Preprocess, Occupancy,
  // Rover Health, Telemetry). Each launches the matching Python/.exe script via
  // ScriptRunner and writes into that stage's folder.
  runSafePath: (input) => ipcRenderer.invoke("workspace:run-safe-path", input),
  runDistanceMap: (input) => ipcRenderer.invoke("workspace:run-distance-map", input),
  runPreprocess: (input) => ipcRenderer.invoke("workspace:run-preprocess", input),
  runOccupancyGrid: (input) => ipcRenderer.invoke("workspace:run-occupancy-grid", input),
  runRoverHealth: (input) => ipcRenderer.invoke("workspace:run-rover-health", input),
  runTelemetry: (channel) => ipcRenderer.invoke("workspace:run-telemetry", channel),
  runNavigation: (input) => ipcRenderer.invoke("workspace:run-navigation", input),
  runSceneAnalysis: (input) => ipcRenderer.invoke("workspace:run-scene-analysis", input),

  // 09_Navigation single Current/Last image + Rover_Characterization properties
  getNavigationImages: () => ipcRenderer.invoke("workspace:get-navigation-images"),
  getNavigationProperties: () => ipcRenderer.invoke("workspace:get-navigation-properties"),

  // 10_ROS_Simulation video file
  getRosSimulationVideo: () => ipcRenderer.invoke("workspace:get-ros-simulation-video"),

  // 14_Scene_Analysis_Report query/response file-drop (active session's
  // 14_Scene_Analysis_Report folder): Run Query writes Query_<n>.txt,
  // then polls readSceneResponse for a matching Response_<n>.txt.
  writeSceneQuery: (query) => ipcRenderer.invoke("workspace:write-scene-query", query),
  readSceneResponse: (number) => ipcRenderer.invoke("workspace:read-scene-response", number),

  // 15_Report: "Generate Report" button on every tab that has one — builds
  // a real PDF from whatever panels/tables the renderer sends over and
  // saves it to 15_Report/<currentSession>/<Tab>_Report_<timestamp>.pdf.
  generateReport: (payload) => ipcRenderer.invoke("workspace:generate-report", payload),

  // 15_Report: master "Full Report" — assembles all 9 sections (Input
  // Image through Scene Description) into one PDF matching the sample
  // Vision Navigation Analysis Report layout, pulled straight from disk
  // rather than from whatever a renderer tab currently has in state.
  generateFullReport: () => ipcRenderer.invoke("workspace:generate-full-report"),

  // 16_Output: "Share" button on every tab that has one — builds a session
  // folder (matching the current session) with one subfolder per checked
  // window, each holding that window's image + a properties.json.
  shareWindows: (payload) => ipcRenderer.invoke("workspace:share-windows", payload),

  // Returns an unsubscribe function.
  onNewImage: (callback) => {
    const listener = (_event, key) => callback(key);
    ipcRenderer.on("workspace:new-image", listener);
    return () => ipcRenderer.removeListener("workspace:new-image", listener);
  },
});
