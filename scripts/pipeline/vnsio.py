"""VNS pipeline shared IO helpers.

Everything in this module is standard-library only (json / csv / sqlite3 /
xml.sax.saxutils), so each stage script can be packaged into a single-file
.executable with PyInstaller with NO extra dependencies and run on any
Windows machine (even one without Python installed).

Each stage writes its outputs using the exact same contract the Vision
Navigation Software reference build produced:

  * every stage writes its results as .json / .txt / .csv / .xlsx sidecars
    (the app reads whichever is present)
  * images are written as real .png/.jpg files (RasterRenderer below draws
    them itself, no PIL needed)
  * .xlsx is a flat OOXML single-sheet workbook (no openpyxl dependency)
"""
import csv
import io
import json
import os
import re
import sys
import zipfile
from datetime import datetime
from xml.sax.saxutils import escape, quoteattr


# ---------------------------------------------------------------------------
# Small logging (to stdout so ScriptRunner captures it into the modal)
# ---------------------------------------------------------------------------
def log(message):
    print(f"[vns] {message}", flush=True)


def stage_name():
    """Return the human name of the current stage = the folder we write to."""
    return os.path.basename(os.getcwd())


def require_image_arg(argv):
    """Return the input image path (argv[1]) or None if not provided."""
    return argv[1] if len(argv) > 1 else None


def output_dir_arg(argv, default=""):
    return argv[2] if len(argv) > 2 else default


# ---------------------------------------------------------------------------
# Sidecar writers (json / txt / csv / xlsx)
# ---------------------------------------------------------------------------
def write_sidecars(out_dir, base_name, columns, rows):
    """Write an identical data file in all four formats.

    columns : list of str
    rows    : list of list (stringifiable cells)
    """
    os.makedirs(out_dir, exist_ok=True)

    # JSON: array of objects keyed by column name
    json_rows = []
    for r in rows:
        obj = {}
        for i, cname in enumerate(columns):
            obj[cname] = _cell_to_json(r[i] if i < len(r) else "")
        json_rows.append(obj)
    with open(os.path.join(out_dir, base_name + ".json"), "w", encoding="utf-8") as f:
        json.dump(json_rows, f, indent=2)

    # TXT: readable grid with a separator line after the header
    widths = []
    header = columns
    for i, cname in enumerate(header):
        cellw = max([len(str(cname))] + [len(_fmt(r)) for r in rows])
        widths.append(cellw)
    sep = "  ".join("-" * w for w in widths)
    txt_lines = ["  ".join(f"{str(c):<{w}}" for c, w in zip(header, widths)), sep]
    for r in rows:
        txt_lines.append("  ".join(f"{_fmt(r[i]):<{w}}" for i, w in enumerate(widths)))
    with open(os.path.join(out_dir, base_name + ".txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(txt_lines) + "\n")

    # CSV
    with open(os.path.join(out_dir, base_name + ".csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(columns)
        for r in rows:
            w.writerow([_cell_to_json(x) for x in r])

    # XLSX (flat, single sheet)
    workbook = build_xlsx(columns, rows)
    with open(os.path.join(out_dir, base_name + ".xlsx"), "wb") as f:
        f.write(workbook)


def _fmt(v):
    v = _cell_to_json(v)
    if isinstance(v, float):
        return f"{v:.2f}".rstrip("0").rstrip(".")
    return str(v)


def _cell_to_json(v):
    if v is None or v == "":
        return ""
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v
    try:
        return float(v)
    except (ValueError, TypeError):
        return str(v)


def build_xlsx(columns, rows):
    """Build a minimal but valid .xlsx (single sheet) with no dependencies."""
    sheet_xml_lines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetData>',
    ]
    def cell_ref(col, row):
        # base-26 column letters, 1-indexed rows
        letters = ""
        c = col + 1
        while c:
            c, rem = divmod(c - 1, 26)
            letters = chr(65 + rem) + letters
        return f"{letters}{row}"

    row_no = 1
    for r in [columns] + [[_cell_to_json(x) for x in r] for r in rows]:
        sheet_xml_lines.append(f'<row r="{row_no}">')
        for ci, val in enumerate(r):
            ref = cell_ref(ci, row_no)
            if isinstance(val, (int, float)) and not isinstance(val, bool):
                sheet_xml_lines.append(f'<c r="{ref}" t="n"><v>{val}</v></c>')
            else:
                sheet_xml_lines.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(val))}</t></is></c>')
        sheet_xml_lines.append("</row>")
        row_no += 1
    sheet_xml_lines.append("</sheetData></worksheet>")

    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        "</Relationships>"
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("xl/workbook.xml", workbook)
        z.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        z.writestr("xl/worksheets/sheet1.xml", "".join(sheet_xml_lines))
    return buf.getvalue()


def write_properties(out_dir, base_name, properties):
    """Write a label/value properties sidecar (like LR.json) in all formats.

    properties : list of (label, value)
    """
    csv_text = "\n".join(f"{label},{value}" for label, value in properties)
    txt_text = "\n".join(f"{label:<20}: {value}" for label, value in properties)
    json_text = json.dumps(
        [{label: value} for label, value in properties], indent=2
    )

    with open(os.path.join(out_dir, base_name + ".json"), "w", encoding="utf-8") as f:
        f.write(json_text)
    with open(os.path.join(out_dir, base_name + ".txt"), "w", encoding="utf-8") as f:
        f.write(txt_text + "\n")
    with open(os.path.join(out_dir, base_name + ".csv"), "w", encoding="utf-8") as f:
        f.write(csv_text + "\n")
    with open(os.path.join(out_dir, base_name + ".xlsx"), "wb") as f:
        f.write(build_xlsx(["Parameter", "Value"], [[l, v] for l, v in properties]))


# ---------------------------------------------------------------------------
# PNG writer (pure stdlib, zlib + struct) — produces real PNG files
# ---------------------------------------------------------------------------
import struct
import zlib


def write_png(width, height, pixels, path):
    """Write a PNG. pixels is a flat list of (r,g,b,a) tuples row-major."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 for each scanline
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            raw.extend((r, g, b, a))

    def chunk(ctype, data):
        c = ctype + data
        return (
            struct.pack(">I", len(data))
            + c
            + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))
    log(f"wrote image {os.path.basename(path)} ({width}x{height})")


class Canvas:
    """A tiny raster canvas so no PIL is needed."""

    def __init__(self, width=640, height=400, bg=(16, 20, 26, 255)):
        self.w = width
        self.h = height
        self.px = [bg] * (width * height)

    def _i(self, x, y):
        return int(max(0, min(self.w - 1, x))) + int(max(0, min(self.h - 1, y))) * self.w

    def fill_rect(self, x, y, w, h, color):
        for yy in range(int(y), min(self.h, int(y + h))):
            for xx in range(int(x), min(self.w, int(x + w))):
                self.px[self._i(xx, yy)] = color

    def rect(self, x, y, w, h, stroke, thickness=2):
        t = max(1, int(thickness))
        self.fill_rect(x, y, w, t, stroke)
        self.fill_rect(x, y + h - t, w, t, stroke)
        self.fill_rect(x, y, t, h, stroke)
        self.fill_rect(x + w - t, y, t, h, stroke)

    def ellipse(self, cx, cy, rx, ry, color, fill=True):
        for yy in range(self.h):
            for xx in range(self.w):
                dx = (xx - cx) / rx
                dy = (yy - cy) / ry
                if dx * dx + dy * dy <= 1.0:
                    if fill or dx * dx + dy * dy >= 0.7:
                        self.px[self._i(xx, yy)] = color

    def line(self, x1, y1, x2, y2, color, thickness=2):
        steps = max(abs(x2 - x1), abs(y2 - y1), 1)
        for s in range(int(steps) + 1):
            t = s / steps
            self.fill_rect(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, thickness, thickness, color)

    def text(self, text_, x, y, color, size=11):
        # crude 5x7 bitmap font for a handful of chars (digits + letters in labels)
        font = FONT5X7
        cursor = int(x)
        for ch in str(text_):
            glyph = font.get(ch.upper(), font["?"])
            for gy, row in enumerate(glyph):
                for gx in range(5):
                    if row >> (4 - gx) & 1:
                        for dy in range(max(1, size // 7)):
                            for dx in range(size // 7):
                                self.px[self._i(cursor + gx * (size // 7) + dx, y + gy * (size // 7) + dy)] = color
            cursor += 6 * (size // 7)
        return cursor


FONT5X7 = {
    "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
    "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
    "2": [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
    "3": [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
    "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
    "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
    "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
    "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
    "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
    "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
    "A": [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
    "B": [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
    "C": [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
    "D": [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
    "E": [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
    "F": [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
    "G": [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
    "H": [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
    "I": [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
    "J": [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
    "K": [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
    "L": [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
    "M": [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
    "N": [0b10001, 0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001],
    "O": [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    "P": [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
    "Q": [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
    "R": [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
    "S": [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
    "T": [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
    "U": [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    "V": [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
    "W": [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
    "X": [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
    "Y": [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
    "Z": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
    " ": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
    "-": [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
    ".": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00110, 0b00110],
    "/": [0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b00000, 0b00000],
    "?": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b00000, 0b00100],
    "%": [0b10001, 0b10010, 0b00100, 0b01000, 0b10000, 0b00000, 0b00000],
    "@": [0b01110, 0b10001, 0b10011, 0b10101, 0b10000, 0b10001, 0b01110],
}


# Convenience to paint a "terrain" background the VNS screens are used to.
def paint_terrain(canvas, seed=7):
    import random
    rng = random.Random(seed)
    canvas.fill_rect(0, 0, canvas.w, canvas.h, (30, 36, 44, 255))
    canvas.fill_rect(0, int(canvas.h * 0.55), canvas.w, int(canvas.h * 0.45), (52, 58, 66, 255))
    for _ in range(24):
        x = rng.randrange(0, canvas.w)
        y = int(canvas.h * 0.55) + rng.randrange(0, int(canvas.h * 0.45))
        r = rng.uniform(2, 9)
        shade = (rng.randrange(60, 120), rng.randrange(66, 128), rng.randrange(76, 140), 255)
        canvas.ellipse(x, y, r, r * 0.6, shade)
