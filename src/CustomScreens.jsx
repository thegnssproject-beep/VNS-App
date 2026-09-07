import { useState, useEffect } from "react";
import {
  Check,
  Settings,
  X,
  Play,
  Pause,
  Pencil,
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Maximize2,
} from "lucide-react";
import { useWindowFolder, useWindowFolderAuto } from "./hooks/useWorkspace";

/* ==================================================================
   Dynamic ("custom") screen creation
   Everything needed for the rail's "+ New Screen" button lives here:
   - AddScreenModal: a 2-step wizard — pick a layout, then configure it
   - CustomScreen: dispatches to the renderer that matches screen.layout
   - useCustomScreens: owns the create/remove/persist state so VNSApp
     just wires up the pieces
   Kept deliberately self-contained (its own small Checkbox/IconBtn/
   terrainDataUri/DataTablePanel + an inline <style> block for the
   wizard) so this file has no dependency on VNSApp.jsx and there's
   no risk of a circular import.
=================================================================== */

/* ---------------- local building blocks (kept in sync with VNSApp's) ---------------- */
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

function IconBtn({ title, onClick, active, children }) {
  return (
    <button type="button" title={title} onClick={onClick} className={`icon-btn${active ? " icon-btn--active" : ""}`}>
      {children}
    </button>
  );
}

function seededRand(seed, i = 0) {
  const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function terrainDataUri(seed, tint = "#0c1116") {
  const rocks = Array.from({ length: 12 }, (_, i) => {
    const x = seededRand(seed, i) * 100;
    const y = 44 + seededRand(seed, i + 50) * 54;
    const r = 1 + seededRand(seed, i + 90) * 3.4;
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 0.6).toFixed(1)}" fill="rgba(255,255,255,0.07)"/>`;
  }).join("");
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>
      <rect width='100' height='100' fill='${tint}'/>
      <rect y='42' width='100' height='58' fill='#171f27'/>
      ${rocks}
    </svg>`
  )}`;
}

function slug(s) {
  return (s || "screen").toLowerCase().trim().replace(/\s+/g, "-");
}

/* ---------------- local data-table panel (kept in sync with VNSApp's DataTablePanel) ---------------- */
function DataTablePanel2({ title, table, showNav, onPrev, onNext }) {
  return (
    <section className="panel data-table-panel">
      <header className="panel__bar">
        {showNav && (
          <button className="panel__nav-arrow" onClick={onPrev} title="Previous window">
            <ChevronLeft size={14} />
          </button>
        )}
        <h3 className="panel__title">{title}</h3>
        <div className="panel__tools">
          {showNav && (
            <button className="panel__nav-arrow" onClick={onNext} title="Next window">
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

/* ---------------- Generic renderer for legacy (pre-layout) custom screens ---------------- */
function computeColumns(n) {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

function LegacyGridScreen({ screen, pushToast }) {
  const [windows, setWindows] = useState(screen.windows);
  const [activeWindow, setActiveWindow] = useState(screen.windows[0]?.id);
  const [selected, setSelected] = useState(() =>
    Object.fromEntries(screen.windows.map((w) => [w.id, true]))
  );
  const [openSettings, setOpenSettings] = useState({});

  const toggleSettings = (winId) => setOpenSettings((prev) => ({ ...prev, [winId]: !prev[winId] }));
  const updateWindowProperty = (winId, key, value) =>
    setWindows((prevWindows) => prevWindows.map((w) => (w.id === winId ? { ...w, [key]: value } : w)));

  const handleShare = () => {
    const checkedCount = Object.values(selected).filter(Boolean).length;
    if (checkedCount === 0) {
      pushToast({ type: "error", title: "Share failed", message: "No windows are selected. Check at least one panel first." });
      return;
    }
    pushToast({ type: "success", title: "Shared", message: `${checkedCount} item(s) saved to /shared/${slug(screen.name)}/` });
  };

  return (
    <div className="content">
      <div className="custom-grid" style={{ "--custom-columns": computeColumns(windows.length) }}>
        {windows.map((win, i) => {
          const isConfiguring = !!openSettings[win.id];
          return (
            <section key={win.id} className={`panel${activeWindow === win.id ? " panel--focused" : ""}`} onMouseDown={() => setActiveWindow(win.id)}>
              <header className="panel__bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Checkbox checked={!!selected[win.id]} onChange={(v) => setSelected((s) => ({ ...s, [win.id]: v }))} />
                  <h3 className="panel__title" style={{ margin: 0 }}>{win.title || `Window ${i + 1}`}</h3>
                </div>
                <button
                  className="btn-icon"
                  onClick={() => toggleSettings(win.id)}
                  title={isConfiguring ? "Save properties" : "Configure window properties"}
                  style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}
                >
                  {isConfiguring ? <Check size={16} color="#4caf50" /> : <Settings size={16} color="#77a5d1" />}
                </button>
              </header>
              <div className="panel__stage">
                {isConfiguring ? (
                  <div className="window__properties-form" style={{ padding: "15px", display: "flex", flexDirection: "column", gap: "12px", height: "100%", justifyContent: "center" }}>
                    <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", color: "#a5c2f1" }}>Window Properties</h4>
                    <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
                      <span>Window Title</span>
                      <input
                        className="settings-input"
                        style={{ padding: "6px", borderRadius: "4px", border: "1px solid #2d3748", background: "#1a202c", color: "#fff" }}
                        value={win.title || `Window ${i + 1}`}
                        onChange={(e) => updateWindowProperty(win.id, "title", e.target.value)}
                        placeholder={`Window ${i + 1}`}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
                      <span>Add folder name: </span>
                      <input
                        className="settings-input"
                        style={{ padding: "6px", borderRadius: "4px", border: "1px solid #2d3748", background: "#1a202c", color: "#fff" }}
                        type="text"
                        value={win.contentType || ""}
                        onChange={(e) => updateWindowProperty(win.id, "contentType", e.target.value)}
                        placeholder="e.g. raw_signal, map, console..."
                      />
                    </label>
                    <button className="btn btn-primary" style={{ marginTop: "4px", padding: "6px 12px", fontSize: "12px" }} onClick={() => toggleSettings(win.id)}>
                      Apply Properties
                    </button>
                  </div>
                ) : (
                  <div className="window__stage-content" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {win.contentType && win.contentType.trim() !== "" ? (
                      <div className="window__active-module">
                        <span style={{ color: "#a5c2f1", fontWeight: "bold" }}>[{win.contentType}]</span>
                      </div>
                    ) : (
                      <div className="window__empty" style={{ textAlign: "center", padding: "20px" }}>
                        <span style={{ display: "block", color: "#6b7280", fontSize: "13px" }}>Content type not yet wired to a backend module.</span>
                        <button
                          onClick={() => toggleSettings(win.id)}
                          style={{ background: "none", border: "none", color: "#3182ce", textDecoration: "underline", cursor: "pointer", fontSize: "12px", marginTop: "8px" }}
                        >
                          Configure properties
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" onClick={handleShare}>Share</button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   Shared window chrome for Layout 1 & Layout 2: prev/next frame nav,
   a maximize button, and an inline editor for the window's name.
   Folders are no longer picked by hand — every window's images live
   in two real, auto-created folders keyed by the window's own name
   (no screen/tab-level folder — a window's folder sits directly
   alongside 02_Raw_Image, 03_Input_Image, etc.): a permanent one at
   the workspace root, and a mirror of whatever the current capture
   session is. This component provisions those folders itself (on
   mount and whenever the window is renamed), loads whatever's inside
   them, and bubbles any JSON/txt/csv sidecar it finds up to the
   parent as `properties` — the parent owns a `meta` map
   (id -> {name, folderPath, sessionFolderPath}) and passes an
   onMetaChange updater so renames/path updates stick.
----------------------------------------------------------------- */
function EditableWindowPanel({ id, meta, seed, active, compact, onFocus, onMetaChange, onExpand, onProperties, checkbox, extraTools, stageExtra }) {
  const [frame, setFrame] = useState(0);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(meta.name);
  const { ensureFolder, renameFolder, listContents, available: workspaceAvailable } = useWindowFolderAuto();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!editing) setNameDraft(meta.name);
  }, [meta.name, editing]);

  // Provisions (creates if missing) this window's permanent + current-
  // session folders and loads whatever's inside them, every time the
  // screen is visited or the window's name changes. Re-running
  // ensureFolder() on every load — not just at creation — is what keeps
  // the session-side folder pointed at whichever capture session is
  // actually active right now, so "current session images" just show up
  // without anyone re-selecting a folder.
  useEffect(() => {
    let cancelled = false;
    if (!workspaceAvailable) {
      setImages([]);
      return;
    }
    setLoading(true);
    (async () => {
      const folders = await ensureFolder(meta.name);
      if (cancelled) return;
      if (folders && !folders.error) {
        if (folders.persistentPath !== meta.folderPath || folders.sessionPath !== meta.sessionFolderPath) {
          onMetaChange(id, { folderPath: folders.persistentPath, sessionFolderPath: folders.sessionPath });
        }
        const { images: all, properties } = await listContents(folders.persistentPath, folders.sessionPath);
        if (cancelled) return;
        setImages(all);
        onProperties?.(id, properties);
      } else {
        setImages([]);
      }
      setFrame(0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [meta.name, workspaceAvailable]);

  const commitName = async () => {
    const trimmed = nameDraft.trim() || meta.name;
    setEditing(false);
    if (trimmed === meta.name) return;
    if (workspaceAvailable) {
      const renamed = await renameFolder(meta.name, trimmed);
      onMetaChange(id, {
        name: trimmed,
        folderPath: renamed?.persistentPath ?? meta.folderPath,
        sessionFolderPath: renamed?.sessionPath ?? meta.sessionFolderPath,
      });
    } else {
      onMetaChange(id, { name: trimmed });
    }
  };

  const hasImages = images.length > 0;
  const frameCount = hasImages ? images.length : 1;
  const current = hasImages ? images[frame] : null;

  return (
    <section className={`panel${compact ? " panel--compact" : ""}${active ? " panel--focused" : ""}`} onMouseDown={onFocus}>
      <header className="panel__bar">
        {checkbox}
        <button className="panel__nav-arrow" onClick={(e) => { e.stopPropagation(); setFrame((f) => Math.max(0, f - 1)); }} disabled={frame === 0} title="Previous frame">
          <ChevronLeft size={14} />
        </button>
        {editing ? (
          <input
            className="prop__value"
            style={{ flex: 1, margin: "0 6px" }}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitName()}
            onMouseDown={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <h3 className="panel__title">{meta.name}</h3>
        )}
        <div className="panel__tools">
          {extraTools}
          <IconBtn title={editing ? "Save name" : "Rename window"} onClick={() => (editing ? commitName() : setEditing(true))} active={editing}>
            {editing ? <Check size={12} /> : <Pencil size={12} />}
          </IconBtn>
          <IconBtn title="Maximize" onClick={() => onExpand({ title: meta.name, imageUrl: current?.url, seed: seed + frame * 5 })}>
            <Maximize2 size={12} />
          </IconBtn>
          <button className="panel__nav-arrow" onClick={(e) => { e.stopPropagation(); setFrame((f) => Math.min(frameCount - 1, f + 1)); }} disabled={frame >= frameCount - 1} title="Next frame">
            <ChevronRight size={14} />
          </button>
        </div>
      </header>
      <div className="panel__stage">
        {loading ? (
          <div className="window__empty" style={{ textAlign: "center", padding: 20 }}>
            <span style={{ color: "#6b7280", fontSize: 13 }}>Loading images…</span>
          </div>
        ) : current ? (
          <img src={current.url} alt={current.name} className="panel__img" draggable={false} />
        ) : meta.folderPath ? (
          <div className="window__empty" style={{ textAlign: "center", padding: 20 }}>
            <span style={{ color: "#6b7280", fontSize: 13 }}>No images in "{meta.name}"'s folder yet.</span>
          </div>
        ) : (
          <div className="window__empty" style={{ textAlign: "center", padding: 20 }}>
            <span style={{ color: "#6b7280", fontSize: 13 }}>
              {workspaceAvailable ? "Setting up this window's folder…" : "Folder syncing is only available in the desktop app."}
            </span>
          </div>
        )}
        {stageExtra}
        <div className="panel__counter">frame {frameCount ? frame + 1 : 0} / {frameCount}</div>
      </div>
      {meta.folderPath && (
        <div
          style={{ fontSize: 10, color: "#7f93b8", padding: "3px 10px", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={meta.folderPath}
        >
          {meta.folderPath}
        </div>
      )}
    </section>
  );
}

function WindowExpandModal({ content, onClose }) {
  if (!content) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__bar">
          <span className="modal__title">{content.title}</span>
          <button className="modal__close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="modal__stage">
          <img src={content.imageUrl || terrainDataUri(content.seed)} alt={content.title} />
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   LAYOUT 1 — "Image Grid + Properties" (mirrors the Left/Preprocessed
   Image + Obstacle Pixel Mask/BBoxes mockup): a grid of image windows,
   each with a live properties sidebar driven by a JSON file supplied
   at setup time.
================================================================= */
function QuadPropertiesScreen({ screen, pushToast }) {
  const windows = screen.windows || [];
  const [activeWindow, setActiveWindow] = useState(windows[0]?.id);
  const [selected, setSelected] = useState(() => Object.fromEntries(windows.map((w) => [w.id, true])));
  const [windowMeta, setWindowMeta] = useState(() =>
    Object.fromEntries(windows.map((w) => [w.id, { name: w.name, folderPath: w.folderPath || "", sessionFolderPath: w.sessionFolderPath || "" }]))
  );
  // Properties shown in the sidebar now come live from whatever JSON/txt/
  // csv sidecar file sits in the window's folder, not just whatever was
  // supplied at setup time — updateProperties is passed to each
  // EditableWindowPanel as onProperties and fires whenever it re-reads its
  // folder (on load, on session change, after a rename).
  const [windowProperties, setWindowProperties] = useState(() =>
    Object.fromEntries(windows.map((w) => [w.id, w.properties || []]))
  );
  const [expanded, setExpanded] = useState(null);
  const updateMeta = (id, patch) => setWindowMeta((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
  const updateProperties = (id, properties) => setWindowProperties((p) => ({ ...p, [id]: properties || [] }));
  const focused = windows.find((w) => w.id === activeWindow) || windows[0];
  const focusedMeta = focused ? windowMeta[focused.id] : null;
  const focusedProperties = focused ? windowProperties[focused.id] || [] : [];

  // Rover Characteristics is included by default on every Layout 1 screen,
  // same fields as the built-in screens (Obs. Det., Safe Path, etc.).
  const [rover, setRover] = useState({ distance: "", coords: "", p1: "", p2: "", p3: "" });

  const handleShare = () => {
    const checkedCount = Object.values(selected).filter(Boolean).length;
    if (checkedCount === 0) {
      pushToast({ type: "error", title: "Share failed", message: "No windows are selected. Check at least one panel first." });
      return;
    }
    pushToast({ type: "success", title: "Shared", message: `${checkedCount} item(s) saved to /shared/${slug(screen.name)}/` });
  };

  const handleReport = () => {
    pushToast({ type: "success", title: "Report generated", message: `${screen.name || "Screen"} report is ready to download.` });
  };

  return (
    <div className="content">
      <div className="screen-grid">
        <div className="custom-grid" style={{ "--custom-columns": computeColumns(windows.length) }}>
          {windows.map((win) => (
            <EditableWindowPanel
              key={win.id}
              id={win.id}
              meta={windowMeta[win.id]}
              seed={win.id.length + 3}
              active={activeWindow === win.id}
              onFocus={() => setActiveWindow(win.id)}
              onMetaChange={updateMeta}
              onProperties={updateProperties}
              onExpand={setExpanded}
              checkbox={<Checkbox checked={!!selected[win.id]} onChange={(v) => setSelected((s) => ({ ...s, [win.id]: v }))} />}
            />
          ))}
        </div>

        <aside className="sidepanel">
          {focused && (
            <div className="propbox">
              <div className="propbox__title"><span>Properties - {focusedMeta?.name}</span></div>
              <div className="propbox__body">
                {focusedProperties.length === 0 ? (
                  <p className="wizard-empty-note">No properties file was provided for this window.</p>
                ) : (
                  focusedProperties.map((p, i) => (
                    <div className="proprow" key={`${p.label}-${i}`}>
                      <label className="proprow__label">{p.label} :</label>
                      <input className="proprow__input" value={p.value} readOnly />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="propbox">
            <div className="propbox__title"><span>Rover Characteristics</span></div>
            <div className="propbox__body">
              <div className="proprow">
                <label className="proprow__label">Distance Traveled :</label>
                <input className="proprow__input" value={rover.distance} onChange={(e) => setRover((r) => ({ ...r, distance: e.target.value }))} />
              </div>
              <div className="proprow">
                <label className="proprow__label">Rover Coordinates :</label>
                <input className="proprow__input" value={rover.coords} onChange={(e) => setRover((r) => ({ ...r, coords: e.target.value }))} />
              </div>
              <div className="proprow">
                <label className="proprow__label">Rover property_01 :</label>
                <input className="proprow__input" value={rover.p1} onChange={(e) => setRover((r) => ({ ...r, p1: e.target.value }))} />
              </div>
              <div className="proprow">
                <label className="proprow__label">Rover property_02 :</label>
                <input className="proprow__input" value={rover.p2} onChange={(e) => setRover((r) => ({ ...r, p2: e.target.value }))} />
              </div>
              <div className="proprow">
                <label className="proprow__label">Rover property_03 :</label>
                <input className="proprow__input" value={rover.p3} onChange={(e) => setRover((r) => ({ ...r, p3: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="btn-row">
            <button className="btn" onClick={handleReport}>Generate Report</button>
            <button className="btn btn-primary" onClick={handleShare}>Share</button>
          </div>
        </aside>
      </div>
      <WindowExpandModal content={expanded} onClose={() => setExpanded(null)} />
    </div>
  );
}

/* ================================================================
   LAYOUT 2 — "Feed + Main Viewer" (mirrors Last/Current image +
   Rover Simulation Video): small feed windows beside one large
   viewer, each window independently image- or video-typed, plus an
   editable bottom property bar (rename fields, set value + file path).
================================================================= */
function FeedVideoScreen({ screen, pushToast }) {
  const windows = screen.windows || [];
  const feeds = windows.slice(0, -1);
  const main = windows[windows.length - 1];
  const [activeWindow, setActiveWindow] = useState(main?.id);
  const [playing, setPlaying] = useState({});
  const [windowMeta, setWindowMeta] = useState(() =>
    Object.fromEntries(windows.map((w) => [w.id, { name: w.name, folderPath: w.folderPath || "", sessionFolderPath: w.sessionFolderPath || "" }]))
  );
  const [expanded, setExpanded] = useState(null);
  const updateMeta = (id, patch) => setWindowMeta((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
  const [properties, setProperties] = useState(
    screen.properties && screen.properties.length ? screen.properties : [{ id: "p1", label: "Property_01", value: "", path: "" }]
  );
  const [editingId, setEditingId] = useState(null);

  const togglePlay = (id) => setPlaying((p) => ({ ...p, [id]: !p[id] }));
  const addProperty = () => {
    const n = properties.length + 1;
    setProperties((props) => [...props, { id: `p${Date.now()}`, label: `Property_0${n}`, value: "", path: "" }]);
  };

  const handleShare = () => {
    pushToast({ type: "success", title: "Shared", message: `Saved to /shared/${slug(screen.name)}/` });
  };

  return (
    <div className="content">
      <div className="stage">
        <div className="stack">
          {feeds.map((win) => (
            <EditableWindowPanel
              key={win.id}
              id={win.id}
              meta={windowMeta[win.id]}
              seed={win.id.length + 5}
              active={activeWindow === win.id}
              compact
              onFocus={() => setActiveWindow(win.id)}
              onMetaChange={updateMeta}
              onExpand={setExpanded}
              extraTools={
                win.dataType === "video" && (
                  <IconBtn title={playing[win.id] ? "Pause feed" : "Play feed"} onClick={() => togglePlay(win.id)} active={playing[win.id]}>
                    {playing[win.id] ? <Pause size={12} /> : <Play size={12} />}
                  </IconBtn>
                )
              }
              stageExtra={playing[win.id] && <div className="panel__scan" />}
            />
          ))}
        </div>

        {main && (
          <EditableWindowPanel
            id={main.id}
            meta={windowMeta[main.id]}
            seed={main.id.length + 9}
            active={activeWindow === main.id}
            onFocus={() => setActiveWindow(main.id)}
            onMetaChange={updateMeta}
            onExpand={setExpanded}
            extraTools={
              main.dataType === "video" && (
                <IconBtn title={playing[main.id] ? "Pause feed" : "Play feed"} onClick={() => togglePlay(main.id)} active={playing[main.id]}>
                  {playing[main.id] ? <Pause size={12} /> : <Play size={12} />}
                </IconBtn>
              )
            }
            stageExtra={playing[main.id] && <div className="panel__scan" />}
          />
        )}
      </div>

      <div className="propbar">
        {properties.map((prop) => (
          <div className="prop" key={prop.id}>
            {editingId === prop.id ? (
              <input
                className="prop__label prop__label--edit"
                value={prop.label}
                onChange={(e) => setProperties((props) => props.map((p) => (p.id === prop.id ? { ...p, label: e.target.value } : p)))}
              />
            ) : (
              <label className="prop__label">{prop.label} :</label>
            )}
            <input
              className="prop__value"
              value={prop.value}
              placeholder="value"
              onChange={(e) => setProperties((props) => props.map((p) => (p.id === prop.id ? { ...p, value: e.target.value } : p)))}
            />
            <input
              className="prop__value"
              value={prop.path}
              placeholder="file path…"
              onChange={(e) => setProperties((props) => props.map((p) => (p.id === prop.id ? { ...p, path: e.target.value } : p)))}
            />
            <div className="prop__actions">
              <button className="prop__icon" onClick={() => setEditingId((id) => (id === prop.id ? null : prop.id))} title="Rename field">
                {editingId === prop.id ? <Check size={11} /> : <Pencil size={11} />}
              </button>
              <button
                className="prop__icon prop__icon--danger"
                onClick={() => setProperties((props) => props.filter((p) => p.id !== prop.id))}
                title="Remove field"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
        <button className="propbar__add" onClick={addProperty}><Plus size={12} /> Add field</button>
      </div>

      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" onClick={handleShare}>Share</button>
      </div>
      <WindowExpandModal content={expanded} onClose={() => setExpanded(null)} />
    </div>
  );
}

/* ================================================================
   LAYOUT 3 — "Data Tables + Share" (mirrors Parameter Table /
   Rover Characterization + Data to Share): pulls its data from
   windows already defined on other custom screens. Left/right
   arrows cycle through every selected window's mock table; the
   right-hand checklist controls what goes into the generated report.
================================================================= */
function mockWindowTable(win, seed) {
  return {
    heading: `Parameter Table — ${win.windowName}`,
    columns: [
      { key: "obsId", label: "Obs. ID" },
      { key: "type", label: "Type" },
      { key: "coordX", label: "Coord_X" },
      { key: "coordZ", label: "Coord_Z" },
      { key: "width", label: "Width" },
    ],
    rows: Array.from({ length: 2 }, (_, i) => ({
      obsId: i + 1,
      type: i % 2 === 0 ? "Rock" : "Crater",
      coordX: (seededRand(seed, i) * 2).toFixed(2),
      coordZ: (seededRand(seed, i + 5) * 2).toFixed(2),
      width: (0.3 + seededRand(seed, i + 9) * 1.2).toFixed(2),
    })),
  };
}

function mockWindowSummary(win, seed) {
  return {
    heading: `Rover Characterization — ${win.windowName}`,
    columns: [
      { key: "distance", label: "VO - Distance Traveled (m)" },
      { key: "coordN", label: "Lunar Coordinates (N)" },
      { key: "coordE", label: "Lunar Coordinates (E)" },
    ],
    rows: [
      {
        distance: (1 + seededRand(seed, 21) * 2).toFixed(1),
        coordN: `${(0.5 + seededRand(seed, 22) * 0.3).toFixed(3)} N`,
        coordE: `${(23 + seededRand(seed, 23) * 1.2).toFixed(3)} E`,
      },
    ],
  };
}

// Finds the real folder path for a selected-window ref by looking it up in
// the full customScreens list (refId is "<screenId>::<windowId>" for custom
// windows, or "core::<screenName>::<windowId>" for built-in ones — the
// latter have no real folder here since they live in VNSApp.jsx).
function resolveWindowFolder(refId, customScreens) {
  if (!refId || refId.startsWith("core::")) return null;
  const [screenId, windowId] = refId.split("::");
  const screen = (customScreens || []).find((s) => s.id === screenId);
  const win = screen?.windows?.find((w) => w.id === windowId);
  return win?.folderPath || null;
}

function realWindowTable(windowName, images) {
  return {
    heading: `Parameter Table — ${windowName}`,
    columns: [
      { key: "name", label: "Image Name" },
      { key: "size", label: "Size" },
      { key: "timestamp", label: "Timestamp" },
    ],
    rows: images.map((img) => ({
      name: img.name,
      size: img.size ? `${(img.size / 1024).toFixed(0)} KB` : "",
      timestamp: img.mtime ? new Date(img.mtime).toLocaleString() : "",
    })),
  };
}

function DataTableReportScreen({ screen, pushToast, customScreens }) {
  const selectedWindows = screen.selectedWindows || [];
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState(() => Object.fromEntries(selectedWindows.map((w) => [w.refId, false])));
  const { listImages, available: workspaceAvailable } = useWindowFolder();
  const [realData, setRealData] = useState({}); // refId -> { images, folderPath }

  // Load real folder contents for every selected window that has a real
  // folder attached (i.e. came from a Layout 1/2 custom screen).
  useEffect(() => {
    let cancelled = false;
    if (!workspaceAvailable) return;
    (async () => {
      const entries = await Promise.all(
        selectedWindows.map(async (w) => {
          const folderPath = resolveWindowFolder(w.refId, customScreens);
          if (!folderPath) return [w.refId, null];
          const images = await listImages(folderPath);
          return [w.refId, { images, folderPath }];
        })
      );
      if (!cancelled) setRealData(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedWindows.map((w) => w.refId).join(","), customScreens, workspaceAvailable, listImages]);

  if (selectedWindows.length === 0) {
    return (
      <div className="content">
        <div className="placeholder-screen">
          <strong>{screen.name}</strong>
          <span>No windows were selected when this screen was created.</span>
        </div>
      </div>
    );
  }

  const cycle = (dir) => setIndex((i) => (i + dir + selectedWindows.length) % selectedWindows.length);
  const current = selectedWindows[index];
  const seed = (current.refId || "seed").length * 13 + index * 7;
  const currentReal = realData[current.refId];
  const table = currentReal
    ? realWindowTable(current.windowName, currentReal.images)
    : mockWindowTable(current, seed);
  const summary = mockWindowSummary(current, seed);

  const toggle = (refId) => setChecked((c) => ({ ...c, [refId]: !c[refId] }));
  const checkedWindows = selectedWindows.filter((w) => checked[w.refId]);

  const handleGenerateReport = () => {
    if (checkedWindows.length === 0) {
      pushToast({ type: "error", title: "Nothing to report", message: "Tick at least one item in Data to Share first." });
      return;
    }
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      pushToast({ type: "error", title: "Report blocked", message: "Allow pop-ups for this site to view the generated report." });
      return;
    }
    const sections = checkedWindows
      .map((w, i) => {
        const real = realData[w.refId];
        const t = real ? realWindowTable(w.windowName, real.images) : mockWindowTable(w, (w.refId || "seed").length * 13 + i * 7);
        const headHtml = `<tr><th>Img No.</th>${t.columns.map((c) => `<th>${c.label}</th>`).join("")}</tr>`;
        const rowsHtml = t.rows
          .map((row, ri) => `<tr><td>${ri + 1}.</td>${t.columns.map((c) => `<td>${row[c.key] ?? ""}</td>`).join("")}</tr>`)
          .join("");
        const heroImg = real?.images?.[0]?.url;
        const imgHtml = heroImg ? `<img src="${heroImg}" alt="${w.windowName}" style="max-width:420px;border:1px solid #9fb8d1;border-radius:4px;margin:10px 0;display:block;" />` : "";
        return `<section><h2>${t.heading}</h2>${imgHtml}<table>${headHtml}${rowsHtml}</table></section>`;
      })
      .join("\n");

    reportWindow.document.write(`<!doctype html>
      <html>
        <head>
          <title>${screen.name || "Custom"} Report</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; padding: 32px; color: #16324a; background: #f4f8fc; }
            h1 { color: #0f4c81; margin-bottom: 2px; }
            h2 { color: #1e6fb5; margin-top: 30px; border-bottom: 2px solid #cfe3f7; padding-bottom: 4px; }
            table { border-collapse: collapse; width: 100%; margin-top: 10px; background: #fff; }
            th, td { border: 1px solid #9fb8d1; padding: 6px 10px; font-size: 13px; text-align: left; }
            th { background: #cfe3f7; }
            .meta { color: #5c7a96; font-size: 12px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <h1>${screen.name || "Custom Screen"} — Report</h1>
          <p class="meta">Generated ${new Date().toLocaleString()}</p>
          ${sections}
        </body>
      </html>`);
    reportWindow.document.close();
    pushToast({ type: "success", title: "Report generated", message: `${checkedWindows.length} section(s) compiled — opened in a new tab.` });
  };

  const handleShare = () => {
    if (checkedWindows.length === 0) {
      pushToast({ type: "error", title: "Share failed", message: "No windows are ticked in Data to Share." });
      return;
    }
    pushToast({ type: "success", title: "Shared", message: `${checkedWindows.length} item(s) saved to /shared/${slug(screen.name)}/` });
  };

  return (
    <div className="content">
      <div className="screen-grid">
        <div className="data-tables">
          <DataTablePanel2 title={table.heading} table={table} showNav onPrev={() => cycle(-1)} onNext={() => cycle(1)} />
          <DataTablePanel2 title={summary.heading} table={summary} />
        </div>

        <aside className="sidepanel">
          <div className="propbox share-box">
            <div className="propbox__title"><span>Data to Share</span></div>
            <div className="share-list">
              {selectedWindows.map((w) => (
                <label className="share-item" key={w.refId}>
                  <Checkbox checked={!!checked[w.refId]} onChange={() => toggle(w.refId)} />
                  <span>{w.windowName} <em style={{ opacity: 0.7, fontStyle: "italic" }}>({w.screenName})</em></span>
                </label>
              ))}
            </div>
          </div>
          <div className="btn-row">
            <button className="btn" onClick={handleGenerateReport}>Generate Report</button>
            <button className="btn btn-primary" onClick={handleShare}>Share</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ================================================================
   CustomScreen — dispatches to the renderer matching screen.layout.
   Screens saved before this wizard existed have no `layout` field
   and fall back to the original generic grid renderer.
================================================================= */
export function CustomScreen({ screen, pushToast, customScreens }) {
  switch (screen.layout) {
    case "feed-video":
      return <FeedVideoScreen screen={screen} pushToast={pushToast} />;
    case "data-table":
      return <DataTableReportScreen screen={screen} pushToast={pushToast} customScreens={customScreens} />;
    case "quad-properties":
      return <QuadPropertiesScreen screen={screen} pushToast={pushToast} />;
    default:
      return <LegacyGridScreen screen={screen} pushToast={pushToast} />;
  }
}

/* ================================================================
   AddScreenModal — Step 1: choose a layout. Step 2: a setup form
   specific to that layout. Layout thumbnails are simple CSS blocks,
   not the actual mockup images — just enough to convey the shape.
================================================================= */
const LAYOUTS = {
  QUAD_PROPERTIES: "quad-properties",
  FEED_VIDEO: "feed-video",
  DATA_TABLE: "data-table",
};

const LAYOUT_OPTIONS = [
  {
    id: LAYOUTS.QUAD_PROPERTIES,
    label: "Image Grid + Properties",
    description: "A grid of image windows, each backed by a real folder you pick, with a live sidebar and a report/share bar.",
  },
  {
    id: LAYOUTS.FEED_VIDEO,
    label: "Feed + Main Viewer",
    description: "Small feed windows beside one large image/video viewer, plus an editable, renameable property bar underneath.",
  },
  {
    id: LAYOUTS.DATA_TABLE,
    label: "Data Tables + Share",
    description: "Pick windows from your other custom screens; their data appears as navigable tables with a checklist that builds the report.",
  },
];

const WIZARD_STYLE = `
.layout-picker { display: flex; flex-direction: row; align-items: flex-start; flex-wrap: wrap; gap: 14px; }
.layout-card { width: 190px; display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid #9fb8d1; border-radius: 6px; background: #eaf2fa; cursor: pointer; text-align: left; font: inherit; }
.layout-card:hover { border-color: #1e6fb5; background: #dceafd; }
.layout-preview { width: 100%; height: 86px; background: #cfe3f7; border: 1px solid #9fb8d1; border-radius: 4px; display: flex; gap: 4px; padding: 6px; box-sizing: border-box; }
.lp-grid-2x2 { flex: 2; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 3px; }
.lp-grid-2x2 span { background: #5c8fb9; border-radius: 2px; }
.lp-side { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.lp-side i { flex: 1; background: #a8c8e2; border-radius: 2px; font-style: normal; display: block; }
.lp-feed-wrap { flex-direction: column; }
.lp-feed-top { flex: 1; display: flex; gap: 4px; min-height: 0; }
.lp-stack { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.lp-stack span { flex: 1; background: #5c8fb9; border-radius: 2px; display: block; }
.lp-main { flex: 2; background: #5c8fb9; border-radius: 2px; }
.lp-bar { height: 12px; background: #a8c8e2; border-radius: 2px; margin-top: 4px; }
.lp-tables { flex: 1.4; display: flex; flex-direction: column; gap: 3px; }
.lp-tables span { flex: 1; background: #5c8fb9; border-radius: 2px; display: block; }
.lp-list { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.lp-list i { flex: 1; background: #a8c8e2; border-radius: 2px; font-style: normal; display: block; }
.layout-card__label { font-weight: 600; font-size: 12.5px; color: #16324a; }
.layout-card__desc { font-size: 11px; color: #4b6a86; line-height: 1.35; }
.wizard-window-list { display: flex; flex-direction: column; gap: 10px; max-height: 320px; overflow-y: auto; padding-right: 4px; }
.wizard-window-row { border: 1px solid #cfe3f7; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px; background: #f4f8fc; }
.wizard-window-row__title { font-weight: 600; font-size: 12px; color: #1e6fb5; }
.wizard-window-row__error { font-size: 11px; color: #c0392b; }
.wizard-window-row__ok { font-size: 11px; color: #2e7d32; }
.wizard-window-checklist { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; }
.wizard-checklist-item { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
.wizard-checklist-item em { opacity: 0.65; font-style: italic; }
.wizard-empty-note { font-size: 12px; color: #6b7280; font-style: italic; margin: 4px 0; }
`;

function LayoutPreviewQuad() {
  return (
    <div className="layout-preview">
      <div className="lp-grid-2x2"><span /><span /><span /><span /></div>
      <div className="lp-side"><i /><i /></div>
    </div>
  );
}

function LayoutPreviewFeed() {
  return (
    <div className="layout-preview lp-feed-wrap">
      <div className="lp-feed-top">
        <div className="lp-stack"><span /><span /></div>
        <div className="lp-main" />
      </div>
      <div className="lp-bar" />
    </div>
  );
}

function LayoutPreviewTable() {
  return (
    <div className="layout-preview">
      <div className="lp-tables"><span /><span /></div>
      <div className="lp-list"><i /><i /><i /></div>
    </div>
  );
}

function LayoutPicker({ onChoose }) {
  return (
    <div className="settings-body layout-picker">
      {LAYOUT_OPTIONS.map((opt) => (
        <button key={opt.id} type="button" className="layout-card" onClick={() => onChoose(opt.id)}>
          {opt.id === LAYOUTS.QUAD_PROPERTIES && <LayoutPreviewQuad />}
          {opt.id === LAYOUTS.FEED_VIDEO && <LayoutPreviewFeed />}
          {opt.id === LAYOUTS.DATA_TABLE && <LayoutPreviewTable />}
          <div className="layout-card__label">{opt.label}</div>
          <div className="layout-card__desc">{opt.description}</div>
        </button>
      ))}
    </div>
  );
}

/* ---- Layout 1 setup: name + count, then per-window name (folders are
   auto-created — see useWindowFolderAuto — no picking required) ---- */
function QuadPropertiesSetupForm({ onBack, onCreate }) {
  const [name, setName] = useState("");
  const [windowCount, setWindowCount] = useState(4);
  const [phase, setPhase] = useState("basics");
  const [windowConfigs, setWindowConfigs] = useState([]);
  const [creating, setCreating] = useState(false);
  const { ensureFolder, available: workspaceAvailable } = useWindowFolderAuto();

  const goToWindows = (e) => {
    e.preventDefault();
    const count = Math.max(1, Math.min(12, Number(windowCount) || 1));
    setWindowConfigs(Array.from({ length: count }, (_, i) => ({ name: `Window ${i + 1}` })));
    setPhase("windows");
  };

  const updateWindow = (i, patch) => setWindowConfigs((cfgs) => cfgs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const submit = async (e) => {
    e.preventDefault();
    const screenName = name.trim() || "Custom Screen";
    setCreating(true);
    try {
      const windows = await Promise.all(
        windowConfigs.map(async (c, i) => {
          const windowName = c.name.trim() || `Window ${i + 1}`;
          const folders = workspaceAvailable ? await ensureFolder(windowName) : null;
          return {
            id: `w${Date.now()}-${i}`,
            name: windowName,
            dataType: "image",
            folderPath: folders && !folders.error ? folders.persistentPath : "",
            sessionFolderPath: folders && !folders.error ? folders.sessionPath : "",
            properties: [],
          };
        })
      );
      onCreate({ layout: LAYOUTS.QUAD_PROPERTIES, name: screenName, windows });
    } finally {
      setCreating(false);
    }
  };

  if (phase === "basics") {
    return (
      <form className="settings-body" onSubmit={goToWindows}>
        <label className="settings-field">
          <span>Screen name</span>
          <input className="settings-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thermal Overlay" autoFocus required />
        </label>
        <label className="settings-field">
          <span>Number of windows</span>
          <input className="settings-input" type="number" min={1} max={12} value={windowCount} onChange={(e) => setWindowCount(e.target.value)} />
        </label>
        <div className="btn-row">
          <button type="button" className="btn" onClick={onBack}>Back</button>
          <button type="submit" className="btn btn-primary">Next</button>
        </div>
      </form>
    );
  }

  return (
    <form className="settings-body" onSubmit={submit}>
      <div className="wizard-window-list">
        {windowConfigs.map((cfg, i) => (
          <div className="wizard-window-row" key={i}>
            <div className="wizard-window-row__title">Window {i + 1} · Image</div>
            <label className="settings-field">
              <span>Window name</span>
              <input className="settings-input" value={cfg.name} onChange={(e) => updateWindow(i, { name: e.target.value })} placeholder={`Window ${i + 1}`} />
            </label>
            {workspaceAvailable ? (
              <p className="wizard-window-row__ok">A folder for this window will be created automatically — no need to pick one.</p>
            ) : (
              <p className="wizard-window-row__error">Folder syncing is only available in the desktop app — this window will start with no images.</p>
            )}
          </div>
        ))}
      </div>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => setPhase("basics")} disabled={creating}>Back</button>
        <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? "Creating…" : "Create screen"}</button>
      </div>
    </form>
  );
}

/* ---- Layout 2 setup: name + count, then per-window name/type (folders
   are auto-created — see useWindowFolderAuto — no picking required) ---- */
function FeedVideoSetupForm({ onBack, onCreate }) {
  const [name, setName] = useState("");
  const [windowCount, setWindowCount] = useState(3);
  const [phase, setPhase] = useState("basics");
  const [windowConfigs, setWindowConfigs] = useState([]);
  const [creating, setCreating] = useState(false);
  const { ensureFolder, available: workspaceAvailable } = useWindowFolderAuto();

  const goToWindows = (e) => {
    e.preventDefault();
    const count = Math.max(2, Math.min(12, Number(windowCount) || 2));
    setWindowConfigs(Array.from({ length: count }, (_, i) => ({ name: `Window ${i + 1}`, dataType: "image" })));
    setPhase("windows");
  };

  const updateWindow = (i, patch) => setWindowConfigs((cfgs) => cfgs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const submit = async (e) => {
    e.preventDefault();
    const screenName = name.trim() || "Custom Screen";
    setCreating(true);
    try {
      const windows = await Promise.all(
        windowConfigs.map(async (c, i) => {
          const windowName = c.name.trim() || `Window ${i + 1}`;
          const folders = workspaceAvailable ? await ensureFolder(windowName) : null;
          return {
            id: `w${Date.now()}-${i}`,
            name: windowName,
            dataType: c.dataType,
            folderPath: folders && !folders.error ? folders.persistentPath : "",
            sessionFolderPath: folders && !folders.error ? folders.sessionPath : "",
          };
        })
      );
      onCreate({
        layout: LAYOUTS.FEED_VIDEO,
        name: screenName,
        windows,
        properties: [{ id: "p1", label: "Property_01", value: "", path: "" }],
      });
    } finally {
      setCreating(false);
    }
  };

  if (phase === "basics") {
    return (
      <form className="settings-body" onSubmit={goToWindows}>
        <label className="settings-field">
          <span>Screen name</span>
          <input className="settings-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rover Sim View" autoFocus required />
        </label>
        <label className="settings-field">
          <span>Number of windows (last one becomes the main viewer)</span>
          <input className="settings-input" type="number" min={2} max={12} value={windowCount} onChange={(e) => setWindowCount(e.target.value)} />
        </label>
        <div className="btn-row">
          <button type="button" className="btn" onClick={onBack}>Back</button>
          <button type="submit" className="btn btn-primary">Next</button>
        </div>
      </form>
    );
  }

  return (
    <form className="settings-body" onSubmit={submit}>
      <div className="wizard-window-list">
        {windowConfigs.map((cfg, i) => {
          const isMain = i === windowConfigs.length - 1;
          return (
            <div className="wizard-window-row" key={i}>
              <div className="wizard-window-row__title">{isMain ? "Main viewer" : `Feed window ${i + 1}`}</div>
              <label className="settings-field">
                <span>Window name</span>
                <input className="settings-input" value={cfg.name} onChange={(e) => updateWindow(i, { name: e.target.value })} placeholder={`Window ${i + 1}`} />
              </label>
              <label className="settings-field">
                <span>Data type</span>
                <select className="settings-input" value={cfg.dataType} onChange={(e) => updateWindow(i, { dataType: e.target.value })}>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </label>
              {workspaceAvailable ? (
                <p className="wizard-window-row__ok">A folder for this window will be created automatically — no need to pick one.</p>
              ) : (
                <p className="wizard-window-row__error">Folder syncing is only available in the desktop app — this window will start with no images.</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => setPhase("basics")} disabled={creating}>Back</button>
        <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? "Creating…" : "Create screen"}</button>
      </div>
    </form>
  );
}

/* ---- Every window/panel that actually exists in the app's built-in
   screens, kept in sync by hand with VNSApp.jsx. This is what lets
   Layout 3 offer "all windows in the application", not just windows
   from screens the user has custom-built. ---- */
const CORE_SCREEN_WINDOWS = [
  { screenName: "Input", windows: [
    { id: "camL", name: "CAM - 01 - L" },
    { id: "camR", name: "CAM - 02 - R" },
    { id: "main", name: "Available Images from Rover NavCam" },
  ]},
  { screenName: "Obs. Det.", windows: [
    { id: "left", name: "Left Image" },
    { id: "preprocessed", name: "Preprocessed Image" },
    { id: "mask", name: "Obstacle Pixel Mask" },
    { id: "bboxes", name: "Obstacle BBoxes" },
  ]},
  { screenName: "Safe Path", windows: [
    { id: "pre", name: "Preprocessed Image" },
    { id: "obstacle", name: "Obstacle Detection" },
    { id: "occupancy", name: "Occupancy Grid Map" },
    { id: "safepath", name: "Predicted Safe Path" },
  ]},
  { screenName: "Dist. Map", windows: [
    { id: "distances", name: "Obstacle Distances" },
    { id: "heatmap", name: "Distance Map" },
    { id: "threed", name: "3D View" },
    { id: "elevation", name: "Relative Elevation" },
  ]},
  { screenName: "Navigation", windows: [
    { id: "last", name: "Last image" },
    { id: "current", name: "Current Image" },
    { id: "sim", name: "Rover Simulation Video" },
  ]},
  { screenName: "Data", windows: [
    { id: "param", name: "Parameter Table" },
    { id: "rover", name: "Rover Characterization" },
  ]},
  { screenName: "Scene Analysis", windows: [
    { id: "navcam", name: "NavCam Imagery" },
    { id: "obstacle", name: "Obstacle with Safe path" },
    { id: "report", name: "Scene Analysis Report" },
  ]},
];

const CORE_AVAILABLE_WINDOWS = CORE_SCREEN_WINDOWS.flatMap((s) =>
  s.windows.map((w) => ({ refId: `core::${s.screenName}::${w.id}`, screenName: s.screenName, windowName: w.name }))
);

/* ---- Layout 3 setup: name + pick windows from anywhere in the app
   (the 7 built-in screens, plus any other custom screens you've made) ---- */
function DataTableSetupForm({ onBack, onCreate, customScreens }) {
  const [name, setName] = useState("");
  const [checked, setChecked] = useState({});

  const availableWindows = [
    ...CORE_AVAILABLE_WINDOWS,
    ...(customScreens || []).flatMap((s) =>
      (s.windows || []).map((w) => ({ refId: `${s.id}::${w.id}`, screenName: s.name, windowName: w.name }))
    ),
  ];

  const toggle = (refId) => setChecked((c) => ({ ...c, [refId]: !c[refId] }));
  const selectedRefs = availableWindows.filter((w) => checked[w.refId]);

  const submit = (e) => {
    e.preventDefault();
    if (selectedRefs.length === 0) return;
    onCreate({ layout: LAYOUTS.DATA_TABLE, name: name.trim(), selectedWindows: selectedRefs });
  };

  return (
    <form className="settings-body" onSubmit={submit}>
      <label className="settings-field">
        <span>Screen name</span>
        <input className="settings-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mission Data Report" autoFocus required />
      </label>
      <div className="settings-field">
        <span>Windows to display (select one or more)</span>
        {availableWindows.length === 0 ? (
          <p className="wizard-empty-note">No windows available yet — create an Image Grid or Feed/Viewer screen first, then come back here.</p>
        ) : (
          <div className="wizard-window-checklist">
            {availableWindows.map((w) => (
              <label key={w.refId} className="wizard-checklist-item">
                <input type="checkbox" checked={!!checked[w.refId]} onChange={() => toggle(w.refId)} />
                <span>{w.windowName} <em>({w.screenName})</em></span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="btn-row">
        <button type="button" className="btn" onClick={onBack}>Back</button>
        <button type="submit" className="btn btn-primary" disabled={selectedRefs.length === 0}>Create screen</button>
      </div>
    </form>
  );
}

export function AddScreenModal({ onClose, onCreate, customScreens }) {
  const [layout, setLayout] = useState(null);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal add-screen-modal" onClick={(e) => e.stopPropagation()}>
        <style>{WIZARD_STYLE}</style>
        <div className="modal__bar">
          <span className="modal__title">{layout ? "Configure screen" : "Choose a layout"}</span>
          <button className="modal__close" onClick={onClose}><X size={15} /></button>
        </div>
        {!layout ? (
          <LayoutPicker onChoose={setLayout} />
        ) : layout === LAYOUTS.QUAD_PROPERTIES ? (
          <QuadPropertiesSetupForm onBack={() => setLayout(null)} onCreate={onCreate} />
        ) : layout === LAYOUTS.FEED_VIDEO ? (
          <FeedVideoSetupForm onBack={() => setLayout(null)} onCreate={onCreate} />
        ) : (
          <DataTableSetupForm onBack={() => setLayout(null)} onCreate={onCreate} customScreens={customScreens} />
        )}
      </div>
    </div>
  );
}

/* ================================================================
   useCustomScreens
   Owns all state + persistence for user-created screens: creating,
   removing, syncing with localStorage, and falling back to "Input"
   if the active screen no longer exists. VNSApp just spreads the
   returned values/handlers into its render.
================================================================= */
export function useCustomScreens({ activeScreen, setActiveScreen, coreScreens, pushToast }) {
  const [customScreens, setCustomScreens] = useState(() => {
    const saved = localStorage.getItem("vns-custom-screens");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });
  const [addScreenOpen, setAddScreenOpen] = useState(false);

  const createCustomScreen = (config) => {
    const id = `custom-${Date.now()}`;
    const screenName = config.name?.trim() || `Custom Screen ${customScreens.length + 1}`;

    const newScreen = {
      id,
      name: screenName,
      layout: config.layout,
      windows: config.windows || [],
      properties: config.properties || [],
      selectedWindows: config.selectedWindows || [],
    };

    setCustomScreens((prev) => [...prev, newScreen]);
    setActiveScreen(id);
    setAddScreenOpen(false);

    pushToast({
      type: "success",
      title: "Screen created",
      message: `"${screenName}" added.`,
    });
  };

  const removeCustomScreen = (id) => {
    setCustomScreens((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      localStorage.setItem("vns-custom-screens", JSON.stringify(updated));
      return updated;
    });

    if (activeScreen === id) {
      setActiveScreen("Input");
    }
  };

  // Save custom screens whenever they change
  useEffect(() => {
    localStorage.setItem("vns-custom-screens", JSON.stringify(customScreens));
  }, [customScreens]);

  // Fall back to "Input" if the active screen no longer exists (e.g. it
  // was removed, or the id came from stale localStorage).
  useEffect(() => {
    const exists = coreScreens.includes(activeScreen) || customScreens.some((s) => s.id === activeScreen);
    if (!exists) {
      setActiveScreen("Input");
    }
  }, [activeScreen, customScreens, coreScreens, setActiveScreen]);

  const activeCustomScreen = customScreens.find((s) => s.id === activeScreen);

  return {
    customScreens,
    activeCustomScreen,
    addScreenOpen,
    setAddScreenOpen,
    createCustomScreen,
    removeCustomScreen,
  };
}