"""VNS report generator — reproduces the user's "Report Layout.docx" report
exactly (ditto copy): a centred cover page, then numbered section headings
(1. Input Image, 2. Image Preprocessing, ...), the intro sentence under each
heading, the figure grids (each image captioned "Figure N: ..." below it),
and the Parameter/Value (or User Query/AI Response) tables.

This is the ONE file to edit when the report's look-and-feel needs to change.
The Electron main process only assembles the data (a JSON *manifest* of the
current session's section headings, captions and image paths) and hands this
script a <manifest.json> <output.pdf> pair. Every pixel of the PDF — fonts,
colours, cover, headings, figure grids, table styling — lives in here.

  Usage: report.py <manifest.json> [output.pdf]
          manifest.json:  { meta: { title, sessionId, date },
                            sections: [ { heading, intro, text, imageNotes,
                                          images: [{ caption, path }],
                                          table: { columns, rows } } ] }

Layout mirrors the reference document:
  * A4 page with 1.25" side margins and 1" top/bottom margins; Times New
    Roman look via the base-14 Times family.
  * Cover page: "Visison Navigation Analysis Report" (20pt bold, centred),
    "Image ID: <session>" (16pt bold, centred), "Date: <date>" (14pt bold,
    centred). The sections start on a fresh page, like the template's hard
    page break.
  * Section headings numbered "N. <Heading>" in 14pt bold, then the intro
    sentence (11pt), then the figure grid with "Figure N: <caption>" centred
    under each image, then the property table.
  * Grid shape per section taken from the reference layout: Input Image /
    Relative Elevation / Occupancy Grid / Safe Path stack single full-width
    figures; Image Preprocessing shows two side-by-side pairs then one
    full-width rectified figure; Obstacle Detection / Obstacle Distances
    show two side-by-side pairs; Visual Odometry shows one side-by-side pair
    plus a full-width localization figure; Scene Description is a
    Query/Response table with no figures.
  * Underlines reproduce the template: the "captured on <date>, at <time>"
    intro and the two NavCam camera captions are underlined.
  * Tables have a bold centred header row (Parameter/Value or User Query/AI
    Response); property cells centred, QA cells left-aligned; a single 0.5pt
    black grid. The first four sections' tables keep the reference's two
    trailing empty rows.

Pure standard library (the same rule as every other stage script), so the
whole thing can be packaged into one .exe with PyInstaller. PDFs are written
by hand (no reportlab/fpdf): base-14 Times fonts (no embedding needed), JPEG
images embedded as DCTDecode, PNG images rebuilt from their zlib-compressed
raw scanlines (Filter 0-4) — RGBA PNGs get a separate SMask.
"""
import json
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# Layout constants (mirror the reference Report Layout.docx)
# ---------------------------------------------------------------------------
BLACK = (0, 0, 0)
INK = (0, 0, 0)                 # body text
GRAY = (70, 70, 70)             # image notes

PAGE_W, PAGE_H = 595.3, 841.9   # A4 (pt)
ML = 90.0                       # left margin 1.25 in
MR = 90.0
MT = 72.0                       # top margin 1 in
MB = 72.0                       # bottom margin 1 in
TEXTW = PAGE_W - ML - MR        # text width 415.3 pt
PAIR_GAP = 10.0                 # gutter between two side-by-side figures

F_TIMES = "F1"        # Times-Roman
F_TIMES_B = "F2"      # Times-Bold
F_TIMES_I = "F3"      # Times-Italic
F_TIMES_BI = "F4"     # Times-BoldItalic

SZ_TITLE = 20         # cover title
SZ_IMGID = 16         # cover "Image ID:"
SZ_DATE = 14          # cover "Date:"
SZ_HEADING = 14       # numbered section headings
SZ_BODY = 11          # intro sentences / paragraphs
SZ_CAPTION = 11       # "Figure N: ..."
SZ_TABLE = 11         # property / QA table cells
SZ_NOTE = 9           # image notes

# Figure-grid shape per reference section. Every tuple is one row; 1 = a
# full-width figure, 0 = a side-by-side figure from a pair. Sections not
# listed fall back to one full-width figure per row.
GRID_LAYOUTS = {
    "Input Image": ((1,), (1,)),
    "Image Preprocessing": ((0, 0), (0, 0), (1,)),
    "Obstacle Detection": ((0, 0), (0, 0)),
    "Obstacle Distances": ((0, 0), (0, 0)),
    "Relative Elevation": ((1,), (1,), (1,)),
    "Occupancy Grid": ((1,), (1,)),
    "Safe Path": ((1,), (1,)),
    "Visual Odometry and Rover Localization": ((0, 0), (1,)),
    "Scene Description": (),
}

# Sentence that introduces each section's property table (verbatim from the
# reference document). Only used when the manifest section has no `text`.
TABLE_INTROS = {
    "Input Image": "The image properties are as follows:",
    "Image Preprocessing": "The following are the properties of the preprocessed and rectified images:",
    "Obstacle Detection": "The following are the details of the detected obstacles for the input image:",
    "Obstacle Distances": "The following are the details of the distances of the detected obstacles for the input image:",
    "Relative Elevation": "The following are the 3D properties for the input image:",
    "Occupancy Grid": "The following are the details of the occupancy grid generated from the input image:",
    "Safe Path": "The following are the details of the predicted safe path for the input image:",
    "Visual Odometry and Rover Localization": "The following are the details for the input image:",
    "Scene Description": "",
}

# Reference sections whose Parameter/Value table has two trailing empty rows.
BLANK_ROWS_SECTIONS = {"Input Image", "Image Preprocessing",
                       "Obstacle Detection", "Obstacle Distances"}

# Times-Roman advance widths (units / 1000) for ASCII 32..126 — used to
# centre/justify text and wrap paragraphs without embedding a font file.
_TIMES = {
    32:250, 33:333, 34:408, 35:500, 36:500, 37:833, 38:778, 39:180, 40:333, 41:333,
    42:500, 43:564, 44:250, 45:333, 46:250, 47:278, 48:500, 49:500, 50:500, 51:500,
    52:500, 53:500, 54:500, 55:500, 56:500, 57:500, 58:278, 59:278, 60:564, 61:564,
    62:564, 63:444, 64:921, 65:722, 66:667, 67:667, 68:722, 69:611, 70:556, 71:722,
    72:722, 73:333, 74:389, 75:722, 76:611, 77:889, 78:722, 79:722, 80:556, 81:722,
    82:667, 83:556, 84:611, 85:722, 86:722, 87:944, 88:722, 89:722, 90:611, 91:333,
    92:278, 93:333, 94:469, 95:500, 96:333, 97:444, 98:500, 99:444, 100:500, 101:444,
    102:333, 103:500, 104:556, 105:278, 106:278, 107:500, 108:278, 109:778, 110:556,
    111:500, 112:500, 113:500, 114:333, 115:389, 116:278, 117:556, 118:444, 119:667,
    120:500, 121:444, 122:389, 123:400, 124:275, 125:400, 126:500,
}
# Times-Bold advance widths (ASCII 32..126)
_TIMES_B = {
    32:250, 33:333, 34:555, 35:500, 36:500, 37:1000, 38:833, 39:278, 40:333, 41:333,
    42:500, 43:570, 44:250, 45:333, 46:250, 47:278, 48:500, 49:500, 50:500, 51:500,
    52:500, 53:500, 54:500, 55:500, 56:500, 57:500, 58:333, 59:333, 60:570, 61:570,
    62:570, 63:500, 64:930, 65:722, 66:667, 67:722, 68:722, 69:667, 70:611, 71:778,
    72:778, 73:389, 74:500, 75:778, 76:667, 77:944, 78:722, 79:778, 80:611, 81:778,
    82:722, 83:556, 84:667, 85:722, 86:722, 87:1000, 88:722, 89:722, 90:667, 91:333,
    92:278, 93:333, 94:581, 95:500, 96:333, 97:500, 98:556, 99:444, 100:556, 101:444,
    102:333, 103:500, 104:556, 105:278, 106:333, 107:556, 108:278, 109:833, 110:556,
    111:500, 112:556, 113:556, 114:444, 115:389, 116:333, 117:556, 118:500, 119:722,
    120:500, 121:500, 122:444, 123:394, 124:220, 125:394, 126:520,
}

_FONT_W = {F_TIMES: _TIMES, F_TIMES_B: _TIMES_B,
           F_TIMES_I: _TIMES, F_TIMES_BI: _TIMES_B}


def _text_width(text, size, font=F_TIMES):
    table = _FONT_W.get(font, _TIMES)
    w = 0
    for ch in text:
        code = ord(ch)
        w += table.get(code if 32 <= code <= 126 else -1, 556)
    return w * size / 1000.0


def _sanitize(text):
    """Make text encodable as cp1252 (WinAnsi), replacing anything exotic.

    cp1252 represents Latin-1 plus punctuation like — “ ” ‘ ’ € •. Those are
    kept as-is (Python encodes U+2014 to byte 0x97, which the WinAnsi
    Times font renders back as an em dash). Only chars cp1252 has no byte
    for are rewritten.
    """
    out = []
    for ch in str(text):
        try:
            ch.encode("cp1252")
        except UnicodeEncodeError:
            out.append("->" if ch == "\u2192" else "?")
        else:
            out.append(ch)
    return "".join(out)


def _pdf_text(text):
    return _sanitize(text).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _wrap(text, size, max_width, font=F_TIMES):
    words = str(text).split(" ")
    lines, cur, cur_w = [], [], 0.0
    for w in words:
        add = _text_width(w, size, font) + (_text_width(" ", size, font) if cur else 0)
        if cur and cur_w + add > max_width:
            lines.append(" ".join(cur))
            cur, cur_w = [w], _text_width(w, size, font)
        else:
            cur.append(w)
            cur_w += add
    if cur:
        lines.append(" ".join(cur))
    return lines or [""]


def _rgb(color):
    return " ".join("%g" % (c / 255.0) for c in color)


# ---------------------------------------------------------------------------
# PDF writer — content streams built in memory, serialised with xref table.
# FONT: base-14 names (no embedding). IMAGE: DCTDecode (JPEG) / FlateDecode
# (decoded PNG scanlines). Cursor is top-down: self.y is the NEXT baseline
# in PDF coordinates (high = top), decreasing as content is added.
# ---------------------------------------------------------------------------
class PdfBuilder:
    def __init__(self):
        self.pages = []        # list of { stream }
        self.xobjects = {}     # name -> { data, w, h, cs, bits, filter, smask: name|None }

    def new_page(self):
        self.pages.append({"stream": bytearray()})
        return self.pages[-1]

    def _op(self, page, s):
        page["stream"].extend(s.encode("cp1252"))

    def text(self, page, text, x, y, font, size, color, align="left", width=None, underline=False):
        esc = _pdf_text(text)
        tw = _text_width(_sanitize(text), size, font)
        # x is the LEFT edge of the layout box; width extends it rightward.
        if align == "center":
            x = x + ((width if width is not None else 0) - tw) / 2
        elif align == "right":
            x = x + (width if width is not None else 0) - tw
        self._op(page, "BT /%s %g Tf %g %g %g rg %g %g Td (%s) Tj ET\n"
                 % (font, size, *(c / 255.0 for c in color), x, y, esc))
        if underline:
            self.line(page, x, y - 2.0, x + tw, y - 2.0, color, 0.8)

    def rect(self, page, x, y, w, h, stroke=None, fill=None, lw=0.75):
        if stroke and fill:
            self._op(page, "%g w %s RG %s rg\n" % (lw, _rgb(stroke), _rgb(fill)))
            self._op(page, "%g %g %g %g re B\n" % (x, y, w, h))
        elif stroke:
            self._op(page, "%g w %s RG\n" % (lw, _rgb(stroke)))
            self._op(page, "%g %g %g %g re S\n" % (x, y, w, h))
        elif fill:
            self._op(page, "%s rg\n" % _rgb(fill))
            self._op(page, "%g %g %g %g re f\n" % (x, y, w, h))

    def line(self, page, x1, y1, x2, y2, color, lw=0.75):
        self._op(page, "%g w %s RG\n" % (lw, _rgb(color)))
        self._op(page, "%g %g m %g %g l S\n" % (x1, y1, x2, y2))

    def image(self, page, name, x, y, w, h):
        self._op(page, "q %g 0 0 %g %g %g cm /%s Do Q\n" % (w, h, x, y, name))

    # -- serialisation ------------------------------------------------------
    def save(self, out_path):
        n_pages = len(self.pages)

        # Object layout: 1 catalog, 2 pages tree, n page dicts, n content
        # streams, 4 fonts, then the image XObjects. /Kids must name the PAGE
        # DICTS; each page's /Contents must name its own CONTENT STREAM.
        page_nums = [3 + i for i in range(n_pages)]
        content_nums = [3 + n_pages + i for i in range(n_pages)]
        base = 3 + 2 * n_pages
        font_nums = {F_TIMES: base, F_TIMES_B: base + 1, F_TIMES_I: base + 2, F_TIMES_BI: base + 3}
        base += 4
        xo_nums = {}
        for name in self.xobjects:
            xo_nums[name] = base
            base += 1

        resources = ("<< /Font << /%s %d 0 R /%s %d 0 R /%s %d 0 R /%s %d 0 R >> "
                     "/XObject << %s >> >>"
                     % (F_TIMES, font_nums[F_TIMES],
                        F_TIMES_B, font_nums[F_TIMES_B],
                        F_TIMES_I, font_nums[F_TIMES_I],
                        F_TIMES_BI, font_nums[F_TIMES_BI],
                        " ".join("/%s %d 0 R" % (n, xo_nums[n]) for n in self.xobjects)))

        objs = [b"<< /Type /Catalog /Pages 2 0 R >>",
                b"<< /Type /Pages /Kids [%s] /Count %d >>"
                % (b" ".join(b"%d 0 R" % n for n in page_nums), n_pages)]

        for i in range(n_pages):
            objs.append(("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %g %g] "
                         "/Resources %s /Contents %d 0 R >>"
                         % (PAGE_W, PAGE_H, resources, content_nums[i])).encode("cp1252"))

        for i in range(n_pages):
            raw = bytes(self.pages[i]["stream"])
            z = zlib.compress(raw, 6)
            objs.append(b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(z)
                        + z + b"\nendstream")

        for _, base_font in ((F_TIMES, b"/Times-Roman"),
                             (F_TIMES_B, b"/Times-Bold"),
                             (F_TIMES_I, b"/Times-Italic"),
                             (F_TIMES_BI, b"/Times-BoldItalic")):
            objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont " + base_font
                        + b" /Encoding /WinAnsiEncoding >>")

        for name, xo in self.xobjects.items():
            sm = " /SMask %d 0 R" % xo_nums[xo["smask"]] if xo.get("smask") else ""
            data = xo["data"] if isinstance(xo["data"], bytes) else bytes(xo["data"])
            # DCTDecode streams hold the raw JPEG bytes verbatim — a Flate
            # layer would hide the JPEG SOI and make readers render blank.
            if xo["filter"] == "/DCTDecode":
                body = data
            else:
                body = zlib.compress(data, 6)
            head = ("<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace %s "
                    "/BitsPerComponent %d /Filter %s%s /Length %d >>"
                    % (xo["w"], xo["h"], xo["cs"], xo["bits"], xo["filter"], sm, len(body)))
            objs.append(head.encode("latin-1") + b"\nstream\n" + body + b"\nendstream")

        buf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = []
        for i, obj in enumerate(objs, start=1):
            offsets.append(len(buf))
            buf.extend(b"%d 0 obj\n" % i)
            buf.extend(obj)
            buf.extend(b"\nendobj\n")
        xref_at = len(buf)
        n = len(objs) + 1
        buf.extend(b"xref\n0 %d\n" % n)
        buf.extend(b"0000000000 65535 f \n")
        for off in offsets:
            buf.extend(b"%010d 00000 n \n" % off)
        buf.extend(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (n, xref_at))
        with open(out_path, "wb") as f:
            f.write(bytes(buf))


# ---------------------------------------------------------------------------
# JPEG / PNG decoding (pure stdlib)
# ---------------------------------------------------------------------------
def _jpeg_info(raw):
    i = 2
    while i + 9 < len(raw):
        if raw[i] != 0xFF:
            return None
        marker = raw[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            return {"w": int.from_bytes(raw[i + 7:i + 9], "big"),
                    "h": int.from_bytes(raw[i + 5:i + 7], "big"),
                    "data": raw, "filter": "/DCTDecode", "cs": "/DeviceRGB", "bits": 8}
        seg_len = int.from_bytes(raw[i + 2:i + 4], "big")
        if seg_len < 2:
            return None
        i += 2 + seg_len
    return None


def _png_info(raw):
    if not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    pos, idat = 8, b""
    w = h = bitdepth = color = interlace = None
    while pos + 8 <= len(raw):
        length = int.from_bytes(raw[pos:pos + 4], "big")
        ctype = raw[pos + 4:pos + 8]
        data = raw[pos + 8:pos + 8 + length]
        pos += 12 + length
        if ctype == b"IHDR":
            w = int.from_bytes(data[0:4], "big")
            h = int.from_bytes(data[4:8], "big")
            bitdepth, color, interlace = data[8], data[9], data[12]
        elif ctype == b"IDAT":
            idat += data
        elif ctype == b"IEND":
            break
    if not (w and h and bitdepth == 8 and interlace == 0):
        return None
    if color not in (0, 2, 4, 6):
        return None

    raw_rows = zlib.decompress(idat)
    bpp = {0: 1, 2: 3, 4: 2, 6: 4}[color]
    stride = w * bpp
    if len(raw_rows) < h * (stride + 1):
        return None

    def _paeth(a, b, c):
        p = a + b - c
        pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
        return a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)

    rows = []
    pos = 0
    for _y in range(h):
        ftype = raw_rows[pos]
        line = bytearray(raw_rows[pos + 1:pos + 1 + stride])
        pos += stride + 1
        up = rows[-1] if rows else None
        if ftype == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif ftype == 2:
            if up:
                for i in range(stride):
                    line[i] = (line[i] + up[i]) & 0xFF
        elif ftype == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                above = up[i] if up else 0
                line[i] = (line[i] + ((left + above) >> 1)) & 0xFF
        elif ftype == 4:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                above = up[i] if up else 0
                upleft = up[i - bpp] if (up and i >= bpp) else 0
                line[i] = (line[i] + _paeth(left, above, upleft)) & 0xFF
        rows.append(bytes(line))

    def _rows(extract=None):
        buf = bytearray()
        for row in rows:
            buf.append(0)  # filter type 0 (none) per scanline
            buf.extend(row if extract is None else extract(row))
        return bytes(buf)

    if color == 6:  # RGBA -> RGB + SMask
        return {"w": w, "h": h, "cs": "/DeviceRGB", "bits": 8, "filter": "/FlateDecode",
                "data": _rows(lambda r: bytes(x for i, x in enumerate(r) if i % 4 != 3)),
                "smask": ("/DeviceGray", _rows(lambda r: r[3::4]))}
    if color == 2:
        return {"w": w, "h": h, "cs": "/DeviceRGB", "bits": 8, "filter": "/FlateDecode",
                "data": _rows(), "smask": None}
    if color == 4:  # gray + alpha
        return {"w": w, "h": h, "cs": "/DeviceGray", "bits": 8, "filter": "/FlateDecode",
                "data": _rows(lambda r: r[0::2]),
                "smask": ("/DeviceGray", _rows(lambda r: r[1::2]))}
    return {"w": w, "h": h, "cs": "/DeviceGray", "bits": 8, "filter": "/FlateDecode",
            "data": _rows(), "smask": None}


def load_image(path):
    try:
        with open(path, "rb") as f:
            raw = f.read()
    except OSError as exc:
        return {"error": "cannot read: %s" % exc}
    if raw[:2] == b"\xff\xd8":
        info = _jpeg_info(raw)
    elif raw[:8] == b"\x89PNG\r\n\x1a\n":
        info = _png_info(raw)
    else:
        info = None
    if info is None:
        return {"error": "unrecognised image format"}
    return info


# ---------------------------------------------------------------------------
# Reference layout engine — renders the "Report Layout.docx" report (ditto)
# ---------------------------------------------------------------------------
class ReportBuilder:
    def __init__(self, meta, sections):
        self.meta = meta or {}
        self.sections = sections or []
        self.pdf = PdfBuilder()
        self.page = None
        self.y = PAGE_H
        self.top = PAGE_H - MT
        self.figure_no = 0
        self.table_no = 0
        self.xo_seq = 0

    # -- page / cursor lifecycle --------------------------------------------
    def new_page(self):
        self.page = self.pdf.new_page()
        self.y = self.top

    def ensure(self, needed):
        if self.y - needed < MB:
            self.new_page()

    # -- drawing helpers ----------------------------------------------------
    def _paragraph(self, text, underline=False):
        gap = SZ_BODY * 1.22
        for ln in _wrap(text, SZ_BODY, TEXTW, F_TIMES):
            self.ensure(gap + 4)
            self.pdf.text(self.page, ln, ML, self.y, F_TIMES, SZ_BODY, INK,
                          underline=underline)
            self.y -= gap

    def _draw_figure(self, im, box_x, box_w):
        info = im["info"]
        iw, ih = info["w"], info["h"]
        scale = min(box_w / iw, (TEXTW * 0.62) / ih)
        cw, ch = iw * scale, ih * scale
        self.ensure(ch + 30)
        cx = box_x + (box_w - cw) / 2
        name = self._register_image(info)
        self.pdf.image(self.page, name, cx, self.y - ch, cw, ch)
        self.y -= ch + 6
        self.figure_no += 1
        cap = "Figure %d: %s" % (self.figure_no, _sanitize(im["caption"]))
        underline = im["caption"] in ("Left Camera Image", "Right Camera Image")
        self.pdf.text(self.page, cap, cx, self.y, F_TIMES, SZ_CAPTION, BLACK,
                      align="center", width=cw, underline=underline)
        self.y -= SZ_CAPTION * 1.3

    # -- cover page ---------------------------------------------------------
    def build_cover(self):
        self.new_page()
        p = self.page
        # Reference cover, verbatim: title / image id / date, bold + centred.
        self.pdf.text(p, "Visison Navigation Analysis Report", ML, self.top - 104,
                      F_TIMES_B, SZ_TITLE, BLACK, align="center", width=TEXTW)
        self.pdf.text(p, "Image ID: %s" % (self.meta.get("sessionId") or "Session-ID"),
                      ML, self.top - 172, F_TIMES_B, SZ_IMGID, BLACK,
                      align="center", width=TEXTW)
        self.pdf.text(p, "Date: %s" % (self.meta.get("date") or ""),
                      ML, self.top - 214, F_TIMES_B, SZ_DATE, BLACK,
                      align="center", width=TEXTW)
        self.new_page()   # sections start on a fresh page (template's break)

    # -- sections -----------------------------------------------------------
    def build_sections(self):
        for idx, section in enumerate(self.sections, start=1):
            heading = (section.get("heading") or "").strip()
            self.ensure(SZ_HEADING * 2.2)
            self.pdf.text(self.page, "%d. %s" % (idx, _sanitize(heading)),
                          ML, self.y, F_TIMES_B, SZ_HEADING, BLACK)
            self.y -= SZ_HEADING * 1.4

            if section.get("intro"):
                self._paragraph(section["intro"], underline=(heading == "Input Image"))
                self.y -= 2.0

            images = self._load_section_images(section)
            pos = 0
            for row in self._grid_rows(heading, len(images)):
                if pos >= len(images):
                    break
                if len(row) == 2 and pos + 2 <= len(images):
                    box_w = (TEXTW - PAIR_GAP) / 2
                    for col in range(2):
                        self._draw_figure(images[pos + col],
                                          ML + col * (box_w + PAIR_GAP), box_w)
                    pos += 2
                else:
                    # row plan doesn't match the loaded figures: render the
                    # remaining ones full-width and stop planning.
                    for im in images[pos:]:
                        self._draw_figure(im, ML, TEXTW)
                    pos = len(images)
                    break

            table = section.get("table")
            if table and table.get("columns") and table.get("rows"):
                intro = _sanitize(section.get("text") or TABLE_INTROS.get(heading, ""))
                if intro:
                    self._paragraph(intro)
                    self.y -= 4.0
                self._draw_table(table, heading)

            for note in (section.get("imageNotes") or []):
                self.ensure(SZ_NOTE * 1.4)
                self.pdf.text(self.page, _sanitize(note), ML, self.y,
                              F_TIMES_I, SZ_NOTE, GRAY)
                self.y -= SZ_NOTE * 1.3

            self.y -= 10.0

    def _grid_rows(self, heading, count):
        if count == 0:
            return []
        rows = GRID_LAYOUTS.get(heading)
        if not rows or sum(len(r) for r in rows) != count:
            return [(1,) for _ in range(count)]
        return rows

    def _load_section_images(self, section):
        out = []
        for im in (section.get("images") or []):
            if not im or not im.get("path"):
                continue
            info = load_image(im["path"])
            if info.get("error"):
                print("[vns] report: skipping %s -> %s"
                      % (im.get("path"), info["error"]), file=sys.stderr)
                continue
            out.append({"caption": im.get("caption") or "", "info": info})
        return out

    def _register_image(self, info):
        self.xo_seq += 1
        name = "Im%d" % self.xo_seq
        smask_name = None
        if info.get("smask"):
            self.xo_seq += 1
            smask_name = "Im%d" % self.xo_seq
            acs, adata = info["smask"]
            self.pdf.xobjects[smask_name] = {
                "data": adata, "w": info["w"], "h": info["h"],
                "cs": acs, "bits": 8, "filter": "/FlateDecode", "smask": None}
        self.pdf.xobjects[name] = {
            "data": info["data"], "w": info["w"], "h": info["h"],
            "cs": info["cs"], "bits": info["bits"], "filter": info["filter"],
            "smask": smask_name}
        return name

    def _draw_table(self, table, heading):
        cols = [_sanitize(c) for c in table["columns"]]
        rows = [list(r) for r in table["rows"]]
        if heading in BLANK_ROWS_SECTIONS and len(rows) == 5:
            rows += [["", ""], ["", ""]]
        n = len(cols)
        colw = TEXTW / n
        pad = 5.0
        step = SZ_TABLE * 1.18
        qa = heading == "Scene Description"

        def cell_lines(cell, bold):
            return _wrap(cell, SZ_TABLE, colw - pad * 2, F_TIMES_B if bold else F_TIMES)

        def row_height(cell_values, bold):
            lines = [cell_lines(c, bold) for c in cell_values]
            return pad + max(len(L) for L in lines) * step + pad

        def draw_row(cell_values, bold, top):
            font = F_TIMES_B if bold else F_TIMES
            for i, cval in enumerate(cell_values):
                lines = cell_lines(cval, bold)
                cy = top - pad - SZ_TABLE
                for ln in lines:
                    x = ML + i * colw
                    if qa:
                        self.pdf.text(self.page, ln, x + pad, cy, font, SZ_TABLE, INK)
                    else:
                        self.pdf.text(self.page, ln, x, cy, font, SZ_TABLE, INK,
                                      align="center", width=colw)
                    cy -= step
            return top - row_height(cell_values, bold)

        self.table_no += 1
        heights = [row_height(cols, True)] + [row_height(r, False) for r in rows]
        total = sum(heights)
        self.ensure(total + 8)
        top = self.y
        edges = [ML + i * colw for i in range(n + 1)]
        bottom = draw_row(cols, True, top)
        for ex in edges:
            self.pdf.line(self.page, ex, top, ex, bottom, BLACK, 0.5)
        self.pdf.line(self.page, ML, top, ML + TEXTW, top, BLACK, 0.5)
        self.pdf.line(self.page, ML, bottom, ML + TEXTW, bottom, BLACK, 0.5)
        prev = bottom
        for row in rows:
            bottom = draw_row(row, False, prev)
            for ex in edges:
                self.pdf.line(self.page, ex, prev, ex, bottom, BLACK, 0.5)
            self.pdf.line(self.page, ML, bottom, ML + TEXTW, bottom, BLACK, 0.5)
            prev = bottom
        self.y = bottom    # -- finish -------------------------------------------------------------
    def finalise(self, out_path):
        self.pdf.save(out_path)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main(argv):
    if len(argv) < 2:
        print("usage: report.py <manifest.json> [output.pdf]", file=sys.stderr)
        return 2
    manifest_path = argv[1]
    out_path = argv[2] if len(argv) > 2 else os.path.join(os.getcwd(), "report.pdf")

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    print("[vns] Building Vision Navigation Analysis Report (reference layout) -> %s" % out_path, flush=True)
    builder = ReportBuilder(manifest.get("meta") or {}, manifest.get("sections") or [])
    builder.build_cover()
    builder.build_sections()
    builder.finalise(out_path)
    print("[vns] Report written: %d pages, %d figures, %d tables"
          % (len(builder.pdf.pages), builder.figure_no, builder.table_no), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except Exception as exc:  # noqa: BLE001 — surface to ScriptRunner modal
        import traceback
        traceback.print_exc(file=sys.stderr)
        print("report failed: %s" % exc, file=sys.stderr)
        sys.exit(1)