// electron/reportEngine.cjs
// Replaces the old pdfkit-based PDF builder inside main.cjs. The renderer/
// main process only assemble data (JSON) and hand it to the Python report
// generator (scripts/pipeline/report.py) as a manifest. This engine:
//   1. Creates a temp dir.
//   2. Materializes each section image's base64 data: URL to a real file
//      (report.py reads file paths, not data URLs).
//   3. Writes manifest.json { meta, sections } where every image has a
//      `path` (file on disk) and its original `caption`.
//   4. Runs the registered `report` stage via scriptRunner.
//   5. Cleans up the temp dir (whether the run succeeded or failed).
//
// Inspect/report styling lives entirely in scripts/pipeline/report.py — the
// PDF is drawn pixel-by-pixel there with the stdlib, so this JS only ever
// shuffles data around.

const fs = require("fs");
const os = require("os");
const path = require("path");

// Decodes a base64 "data:<mime>;base64,<data>" URL into a Buffer plus the
// file extension implied by its mime type. Returns null for non-data URLs.
function decodeDataUrl(url) {
  if (!url || typeof url !== "string") return null;
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const isBase64 = !!match[2];
  const data = match[3];
  const buffer = isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data), "utf8");
  const extByMime = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
  };
  return { buffer, ext: extByMime[mime] || ".bin" };
}

// Builds the manifest from renderer-style sections ({ heading, intro,
// images: [{ caption, url }], imageNotes, text, table }) by materializing
// every `url` to a temp file and rewriting it as `{ caption, path }`.
// Returns { manifest, tempDir }.
function materializeSections(sections, tempDir) {
  let imgIndex = 0;
  const out = (sections || []).map((section) => {
    const images = (section.images || [])
      .filter((im) => im && (im.url || im.path))
      .map((im) => {
        if (im.path) {
          // Already a real path (caller may supply files directly).
          return { caption: im.caption || "", path: im.path };
        }
        const decoded = decodeDataUrl(im.url);
        if (!decoded) return null;
        imgIndex += 1;
        const filename = `img_${String(imgIndex).padStart(3, "0")}${decoded.ext}`;
        const filePath = path.join(tempDir, filename);
        fs.writeFileSync(filePath, decoded.buffer);
        return { caption: im.caption || "", path: filePath };
      })
      .filter(Boolean);

    return {
      heading: section.heading || "",
      intro: section.intro || "",
      text: section.text || "",
      imageNotes: section.imageNotes || [],
      images,
      table: section.table && section.table.columns && section.table.rows ? {
        columns: section.table.columns,
        rows: section.table.rows,
      } : null,
    };
  });
  return out;
}

// outPath: where to write the PDF. payload: { tabLabel, sections } or
// { sections }. meta: { title, sessionId, date }. Returns the raw scriptRunner
// result (with manifestPath for debug), never throws.
async function runReportEngine(scriptRunner, { outPath, meta, sections, overrideDir } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vns-report-"));
  try {
    const manifestSections = materializeSections(sections, tempDir);
    const manifest = { meta: meta || {}, sections: manifestSections };
    const manifestPath = path.join(tempDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    const result = await scriptRunner.run("report", [manifestPath, outPath], { overrideDir });
    if (!result.ok && result.stderr) {
      console.error(`[reportEngine] report.py failed; tempDir kept at ${tempDir}`);
      console.error(result.stderr);
      return { ...result, manifestPath, tempDir };
    }
    // Success: clean up the temp images + manifest. PDF already on disk.
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {
      /* best-effort cleanup */
    }
    return { ...result, manifestPath, tempDir };
  } catch (err) {
    console.error(`[reportEngine] error materialising report (tempDir kept at ${tempDir}):`, err);
    return { ok: false, error: err.message || String(err), tempDir };
  }
}

module.exports = { runReportEngine, decodeDataUrl };
