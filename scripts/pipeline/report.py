"""VNS report generator — produces the "Vision Navigation Analysis Report" PDF.

This is the ONE file to edit when the report's look-and-feel needs to change.
The Electron main process only assembles the data (a JSON *manifest* of the
current session's section headings, captions and image paths) and hands this
script a <manifest.json> <output.pdf> pair. Every pixel of the PDF — fonts,
colours, cover page, figure layout, table styling — lives in here.

  Usage: report.py <manifest.json> [output.pdf]
          manifest.json:  { meta: { title, sessionId, date },
                            sections: [ { heading, intro, text, imageNotes,
                                          images: [{ caption, path }],
                                          table: { columns, rows } } ] }

Pure standard library (the same rule as every other stage script), so the
whole thing can be packaged into one .exe with PyInstaller and run on any
Windows box. PDFs are written by hand (no reportlab/fpdf): base-14 Helvetica
fonts (no embedding needed), JPEG images embedded as DCTDecode, PNG images
rebuilt from their zlib-compressed raw scanlines (Filter 0-4) — RGBA PNGs
get a separate SMask for a proper alpha channel.

Layout (mirrors the reference "Vision Navigation Analysis Report"):
  * A4 cover page with a double border, title, Image ID, Date
  * numbered section headings on a light-blue bar with an underline
  * images in bordered frames with "Figure N:" captions (2-up)
  * Parameter/Value (or Query/Response) tables with a light header fill
  * "Page X of Y" footer + report header on every body page
"""
import json
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# Palette + layout constants (edit these to re-theme the whole report)
# ---------------------------------------------------------------------------
NAVY = (15, 42, 74)          # section headings, cover title
BODY = (22, 50, 74)          # intro / table text
GRAY = (51, 71, 91)          # captions, footers
LIGHT = (92, 122, 150)       # muted notes
HEADER_FILL = (207, 227, 247)  # table header row
BORDER = (159, 184, 209)     # table / figure borders
ALT_ROW = (238, 245, 252)    # zebra rows
FRAME_FILL = (250, 252, 254)  # figure frame background

PAGE_W, PAGE_H = 595.276, 841.890  # A4 (pt)
ML, MR = 55.0, 55.0           # side margins
MB = 78.0                     # bottom margin (leaves footer room)

F_HELV = "F1"
F_HELV_B = "F2"
F_HELV_O = "F3"

FONT_SIZE_TITLE = 23
FONT_SIZE_HEADING = 13
FONT_SIZE_INTRO = 10
FONT_SIZE_CAPTION = 8.5
FONT_SIZE_TABLE = 9
FONT_SIZE_META = 11

CONTENT_W = PAGE_W - ML - MR

# Helvetica advance widths (units / 1000) for ASCII 32..126 — used to centre
# text and wrap paragraphs without embedding a font file.
_HELV = {
    32:278, 33:278, 34:355, 35:556, 36:556, 37:889, 38:667, 39:191, 40:333, 41:333,
    42:389, 43:584, 44:278, 45:333, 46:278, 47:278, 48:556, 49:556, 50:556, 51:556,
    52:556, 53:556, 54:556, 55:556, 56:556, 57:556, 58:278, 59:278, 60:584, 61:584,
    62:584, 63:556, 64:1015, 65:667, 66:667, 67:722, 68:722, 69:667, 70:611, 71:778,
    72:722, 73:278, 74:500, 75:667, 76:556, 77:833, 78:722, 79:778, 80:667, 81:778,
    82:722, 83:667, 84:611, 85:722, 86:667, 87:944, 88:667, 89:667, 90:611, 91:278,
    92:278, 93:278, 94:469, 95:556, 96:333, 97:556, 98:556, 99:500, 100:556, 101:556,
    102:278, 103:556, 104:556, 105:222, 106:222, 107:500, 108:222, 109:833, 110:556,
    111:556, 112:556, 113:556, 114:333, 115:500, 116:278, 117:556, 118:500, 119:722,
    120:500, 121:500, 122:500, 123:334, 124:260, 125:334, 126:584,
}
def _text_width(text, size):
    w = 0
    for ch in text:
        code = ord(ch)
        w += _HELV.get(code if 32 <= code <= 126 else -1, 556)
    return w * size / 1000.0


def _sanitize(text):
    """Make text encodable as cp1252 (WinAnsi), replacing anything exotic.

    cp1252 represents Latin-1 plus punctuation like — “ ” ‘ ’ € •. Those are
    kept as-is (Python encodes U+2014 to byte 0x97, which the WinAnsi
    Helvetica font renders back as an em dash). Only chars cp1252 has no byte
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


def _wrap(text, size, max_width):
    words = str(text).split(" ")
    lines, cur, cur_w = [], [], 0.0
    for w in words:
        add = _text_width(w, size) + (_text_width(" ", size) if cur else 0)
        if cur and cur_w + add > max_width:
            lines.append(" ".join(cur))
            cur, cur_w = [w], _text_width(w, size)
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

    def text(self, page, text, x, y, font, size, color, align="left", width=None):
        esc = _pdf_text(text)
        tw = _text_width(_sanitize(text), size)
        # x is the LEFT edge of the layout box; width extends it rightward.
        if align == "center":
            x = x + ((width if width is not None else 0) - tw) / 2
        elif align == "right":
            x = x + (width if width is not None else 0) - tw
        self._op(page, "BT /%s %g Tf %g %g %g rg %g %g Td (%s) Tj ET\n"
                 % (font, size, *(c / 255.0 for c in color), x, y, esc))

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
        # streams, 3 fonts, then the image XObjects. /Kids must name the PAGE
        # DICTS; each page's /Contents must name its own CONTENT STREAM.
        page_nums = [3 + i for i in range(n_pages)]
        content_nums = [3 + n_pages + i for i in range(n_pages)]
        base = 3 + 2 * n_pages
        font_nums = {F_HELV: base, F_HELV_B: base + 1, F_HELV_O: base + 2}
        base += 3
        xo_nums = {}
        for name in self.xobjects:
            xo_nums[name] = base
            base += 1

        resources = "<< /Font << /%s %d 0 R /%s %d 0 R /%s %d 0 R >> /XObject << %s >> >>" % (
            F_HELV, font_nums[F_HELV],
            F_HELV_B, font_nums[F_HELV_B],
            F_HELV_O, font_nums[F_HELV_O],
            " ".join("/%s %d 0 R" % (n, xo_nums[n]) for n in self.xobjects))

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

        for _, base_font in ((F_HELV, b"/Helvetica"), (F_HELV_B, b"/Helvetica-Bold"), (F_HELV_O, b"/Helvetica-Oblique")):
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
# Report layout engine
# ---------------------------------------------------------------------------
class ReportBuilder:
    def __init__(self, meta, sections):
        self.meta = meta or {}
        self.sections = sections or []
        self.pdf = PdfBuilder()
        self.page = None
        self.y = PAGE_H            # next baseline (PDF coords), top-down
        self.figure_no = 0
        self.xo_seq = 0

    # -- page lifecycle -----------------------------------------------------
    def new_page(self, header=True):
        self.page = self.pdf.new_page()
        self.y = PAGE_H - 60.0
        if header:
            self._draw_header()

    def _draw_header(self):
        p = self.page
        self.pdf.text(self.page, "Vision Navigation Analysis Report",
                      ML, self.y + 28, F_HELV, 8, GRAY, align="right", width=CONTENT_W)
        self.pdf.line(p, ML, PY := self.y + 22, PAGE_W - MR, PY, BORDER, 0.4)

    def ensure(self, needed):
        if self.y - MB < needed:
            self.new_page()
            return True
        return False

    def put_wrapped(self, text, font, size, color, width=None, gap=None, x=None):
        lines = _wrap(text, size, width if width is not None else CONTENT_W)
        gap = gap if gap is not None else size * 1.4
        xx = x if x is not None else ML
        for ln in lines:
            self.pdf.text(self.page, ln, xx, self.y, font, size, color)
            self.y -= gap
        return self.y

    def put_centered(self, text, font, size, color, width=None):
        self.pdf.text(self.page, text, ML, self.y, font, size, color,
                      align="center", width=width if width is not None else CONTENT_W)
        return self.y

    # -- cover --------------------------------------------------------------
    def build_cover(self):
        self.new_page(header=False)
        p = self.page
        self.pdf.rect(p, 26, 26, PAGE_W - 52, PAGE_H - 52, NAVY, None, 1.2)
        self.pdf.rect(p, 33, 33, PAGE_W - 66, PAGE_H - 66, BORDER, None, 0.4)

        self.y = PAGE_H - 185
        self.put_centered("R O V E R   V I S I O N   N A V I G A T I O N", F_HELV, 8, GRAY)

        title = self.meta.get("title") or "Vision Navigation Analysis Report"
        size = FONT_SIZE_TITLE
        while _text_width(title, size) > CONTENT_W - 40 and size > 12:
            size -= 1
        self.y -= 34
        self.put_centered(title, F_HELV_B, size, NAVY)

        self.y -= 10
        line_y = self.y - 14
        self.pdf.line(p, ML + (CONTENT_W - 170) / 2, line_y, ML + (CONTENT_W + 170) / 2, line_y, NAVY, 1.0)
        self.y -= 34
        self.put_centered("Vision-Based Navigation Summary", F_HELV, 11, GRAY)

        # Image ID box
        self.y -= 52
        box_w, box_h, bx = 300, 46, ML + (CONTENT_W - 300) / 2
        self.pdf.rect(p, bx, self.y, box_w, box_h, BORDER, FRAME_FILL, 0.6)
        self.pdf.text(p, "Image ID: %s" % (self.meta.get("sessionId") or ""), bx, self.y + 16,
                      F_HELV_B, FONT_SIZE_META, NAVY, align="center", width=box_w)
        self.y -= 56
        self.put_centered("Date: %s" % (self.meta.get("date") or ""), F_HELV, FONT_SIZE_META, BODY)

        foot = "Prepared by the Vision Navigation Software system"
        self.pdf.line(p, ML + 90, 96, PAGE_W - MR - 90, 96, BORDER, 0.4)
        self.pdf.text(p, foot, ML, 76, F_HELV, 8, LIGHT, align="center", width=CONTENT_W)

    # -- sections -----------------------------------------------------------
    def build_sections(self):
        for idx, section in enumerate(self.sections, start=1):
            self.ensure(40)
            self._section_heading(section, idx)
            if section.get("intro"):
                self.ensure(FONT_SIZE_INTRO * 1.4)
                self.put_wrapped(section["intro"], F_HELV, FONT_SIZE_INTRO, BODY)
            images = self._load_section_images(section)
            if images:
                self.ensure(40)
                self._draw_image_grid(images)
            elif section.get("imageNotes"):
                for note in section["imageNotes"]:
                    self.ensure(16)
                    self.pdf.text(self.page, note, ML, self.y, F_HELV_O, 9.5, LIGHT)
                    self.y -= 15
            if section.get("text"):
                self.ensure(FONT_SIZE_INTRO * 1.4)
                self.put_wrapped(section["text"], F_HELV, FONT_SIZE_INTRO, BODY)
            table = section.get("table") or {}
            if table.get("columns") and table.get("rows"):
                self.ensure(18)
                self.pdf.text(self.page,
                              "The following are the details for %s:"
                              % _sanitize(section.get("heading", "")).lower(),
                              ML, self.y, F_HELV_B, 9.5, BODY)
                self.y -= 17
                self._draw_table(table)
            self.y -= 24

    def _section_heading(self, section, idx):
        p = self.page
        self.pdf.rect(p, ML, self.y - 20, CONTENT_W, 20, None, HEADER_FILL, 0)
        self.pdf.text(p, "%d. %s" % (idx, _sanitize(section.get("heading", ""))),
                      ML + 6, self.y - 6, F_HELV_B, FONT_SIZE_HEADING, NAVY)
        self.pdf.line(p, ML + 6, self.y - 24, ML + CONTENT_W - 6, self.y - 24, NAVY, 0.8)
        self.y -= 34

    def _load_section_images(self, section):
        out = []
        for im in (section.get("images") or []):
            if not im or not im.get("path"):
                continue
            info = load_image(im["path"])
            if info.get("error"):
                print("[vns] report: skipping %s -> %s" % (im.get("path"), info["error"]), file=sys.stderr)
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

    def _draw_image_grid(self, images):
        colw = (CONTENT_W - 14) / 2 if len(images) > 1 else min(CONTENT_W, 430)
        rows = [images[i:i + 2] for i in range(0, len(images), 2)]
        for row in rows:
            fit = []
            for im in row:
                iw, ih = im["info"]["w"], im["info"]["h"]
                scale = min(colw / iw, 300.0 / ih)
                fit.append((im, iw * scale, ih * scale))
            row_h = max(ch + 32 for (_im, _cw, ch) in fit)
            self.ensure(row_h + 6)
            if len(fit) == 1:
                x = ML + (CONTENT_W - colw) / 2
            else:
                total_w = sum(cw for (_im, cw, _ch) in fit) + 14 * (len(fit) - 1)
                x = ML + (CONTENT_W - total_w) / 2
            for im, cw, ch in fit:
                frame_x, frame_h = x, ch + 30
                self.pdf.rect(self.page, frame_x, self.y - frame_h, cw, frame_h, BORDER, FRAME_FILL, 0.5)
                name = self._register_image(im["info"])
                self.pdf.image(self.page, name, frame_x, self.y - ch - 2, cw, ch)
                self.figure_no += 1
                cap = "Figure %d: %s" % (self.figure_no, _sanitize(im["caption"]))
                self.pdf.text(self.page, cap, frame_x, self.y - frame_h + 12,
                              F_HELV_O, FONT_SIZE_CAPTION, GRAY, align="center", width=cw)
                x += cw + 14
            self.y -= row_h

    def _draw_table(self, table):
        cols = table["columns"]
        rows = table["rows"]
        n = len(cols)
        colw = CONTENT_W / n
        cell_pad = 4.0

        def cell_lines(cell, header=False):
            return _wrap(cell, FONT_SIZE_TABLE, colw - cell_pad * 2)

        def row_height(cells):
            return max([len(cell_lines(c)) * (FONT_SIZE_TABLE * 1.3) + cell_pad * 2 for c in cells] or [22])

        def draw_row(cells, y_top, height, header=False):
            font = F_HELV_B if header else F_HELV
            for i, c in enumerate(cells):
                cur = y_top - FONT_SIZE_TABLE
                bx = ML + i * colw
                for ln in cell_lines(c):
                    self.pdf.text(self.page, ln, bx + 4, cur, font, FONT_SIZE_TABLE, BODY)
                    cur -= FONT_SIZE_TABLE * 1.3
            return y_top - height

        hh = row_height(cols)
        self.ensure(hh + 4)
        self.pdf.rect(self.page, ML, self.y - hh, CONTENT_W, hh, BORDER, HEADER_FILL, 0.5)
        self.y = draw_row(cols, self.y, hh, header=True)
        for r_i, row in enumerate(rows):
            rh = row_height(row)
            self.ensure(rh + 4)
            fill = ALT_ROW if r_i % 2 else (255, 255, 255)
            self.pdf.rect(self.page, ML, self.y - rh, CONTENT_W, rh, BORDER, fill, 0.5)
            self.y = draw_row(row, self.y, rh)
        return self.y

    # -- finish -------------------------------------------------------------
    def finalise(self, out_path):
        total = len(self.pdf.pages)
        for i, page in enumerate(self.pdf.pages):
            n = i + 1
            self.pdf.line(page, ML, MB - 4, PAGE_W - MR, MB - 4, BORDER, 0.4)
            label = "Page %d of %d" % (n, total)
            xw = _text_width(label, 8)
            self.pdf.text(page, label, ML + (CONTENT_W - xw) / 2, MB - 16, F_HELV, 8, GRAY)
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

    print("[vns] Building Vision Navigation Analysis Report -> %s" % out_path, flush=True)
    builder = ReportBuilder(manifest.get("meta") or {}, manifest.get("sections") or [])
    builder.build_cover()
    builder.build_sections()
    builder.finalise(out_path)
    print("[vns] Report written: %d pages, %d figures"
          % (len(builder.pdf.pages), builder.figure_no), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except Exception as exc:  # noqa: BLE001 — surface to ScriptRunner modal
        import traceback
        traceback.print_exc(file=sys.stderr)
        print("report failed: %s" % exc, file=sys.stderr)
        sys.exit(1)