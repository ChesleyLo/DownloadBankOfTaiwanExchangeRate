#!/usr/bin/env python3
"""Convert docs/*.md to docs/pdf/*.pdf for distribution."""

from __future__ import annotations

import re
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1] / "docs"
OUT = ROOT / "pdf"

FILES = [
    ("USER_GUIDE.zh-TW.md", "USER_GUIDE.zh-TW.pdf"),
    ("USER_GUIDE.en.md", "USER_GUIDE.en.pdf"),
    ("TECHNICAL.zh-TW.md", "TECHNICAL.zh-TW.pdf"),
    ("TECHNICAL.en.md", "TECHNICAL.en.pdf"),
    ("SCHEDULING.zh-TW.md", "SCHEDULING.zh-TW.pdf"),
    ("SCHEDULING.en.md", "SCHEDULING.en.pdf"),
    ("README.md", "Documentation-Index.pdf"),
]

# macOS system font with broad CJK coverage
FONT_PATHS = [
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    Path("/Library/Fonts/Arial Unicode.ttf"),
]


def resolve_font() -> Path:
    for path in FONT_PATHS:
        if path.exists():
            return path
    raise FileNotFoundError(
        "No CJK-capable TTF found. Install Arial Unicode or set FONT_PATHS."
    )


class DocPDF(FPDF):
    def __init__(self, font_path: Path):
        super().__init__(format="A4")
        self.set_auto_page_break(auto=True, margin=18)
        self.set_margins(18, 18, 18)
        self.add_font("DocFont", "", str(font_path))
        self.add_font("DocFont", "B", str(font_path))
        self.add_font("DocFont", "I", str(font_path))
        self.alias_nb_pages()

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("DocFont", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"{self.page_no()}/{{nb}}", align="C")
        self.set_text_color(0, 0, 0)

    def _reset_x(self) -> None:
        self.set_x(self.l_margin)

    def plain(self, text: str, size: float = 11, style: str = "", h: float | None = None):
        self._reset_x()
        self.set_font("DocFont", style, size)
        self.multi_cell(0, h or max(5.0, size * 0.55), text)

    def heading(self, text: str, level: int) -> None:
        sizes = {1: 18, 2: 14, 3: 12, 4: 11}
        size = sizes.get(level, 11)
        self.ln(4 if level > 1 else 2)
        self._reset_x()
        self.set_font("DocFont", "B", size)
        self.multi_cell(0, size * 0.6, text)
        self.ln(1)

    def code_block(self, code: str) -> None:
        self.ln(1)
        self._reset_x()
        self.set_fill_color(245, 245, 245)
        self.set_font("DocFont", "", 8.5)
        # Keep long lines from overflowing by soft-wrapping on spaces / CJK
        self.multi_cell(0, 4.5, code.rstrip("\n"), fill=True)
        self.ln(1)
        self._reset_x()

    def bullet(self, text: str, numbered: bool = False, index: int = 1) -> None:
        prefix = f"{index}. " if numbered else "- "
        self._reset_x()
        self.set_font("DocFont", "", 11)
        self.multi_cell(0, 6, prefix + text)

    def table(self, rows: list[list[str]]) -> None:
        if not rows:
            return
        cols = max(len(r) for r in rows)
        usable = self.w - self.l_margin - self.r_margin
        col_w = usable / cols
        self.ln(1)
        self._reset_x()
        for i, row in enumerate(rows):
            self.set_font("DocFont", "B" if i == 0 else "", 8.5)
            cell_texts = []
            max_lines = 1
            for j in range(cols):
                raw = strip_md(row[j] if j < len(row) else "")
                cell_texts.append(raw)
                # Approximate lines without mutating cursor via split
                approx = max(1, int(self.get_string_width(raw) / max(col_w - 1, 1)) + 1)
                max_lines = max(max_lines, approx)
            row_h = max(5.5, max_lines * 4.2)
            if self.get_y() + row_h > self.page_break_trigger:
                self.add_page()
            y0 = self.get_y()
            x0 = self.l_margin
            for j, text in enumerate(cell_texts):
                x = x0 + j * col_w
                self.set_xy(x, y0)
                self.set_font("DocFont", "B" if i == 0 else "", 8.5)
                fill = i == 0
                if fill:
                    self.set_fill_color(230, 230, 230)
                self.rect(x, y0, col_w, row_h, style="DF" if fill else "D")
                # Clip-ish: write text inside cell with reduced width
                self.set_xy(x + 0.8, y0 + 0.6)
                self.multi_cell(col_w - 1.6, 4.0, text)
            self.set_xy(self.l_margin, y0 + row_h)
        self.ln(2)
        self._reset_x()


def strip_md(text: str) -> str:
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", text)
    return text.strip()


def parse_table_block(lines: list[str], start: int):
    rows: list[list[str]] = []
    index = start
    while index < len(lines) and lines[index].strip().startswith("|"):
        line = lines[index].strip()
        if re.match(r"^\|[\s\-:|]+\|$", line):
            index += 1
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        rows.append(cells)
        index += 1
    return rows, index


def md_to_pdf(md_path: Path, pdf_path: Path, font_path: Path) -> None:
    lines = md_path.read_text(encoding="utf-8").splitlines()
    pdf = DocPDF(font_path)
    pdf.add_page()

    index = 0
    in_code = False
    code_lines: list[str] = []
    list_index = 0

    while index < len(lines):
        line = lines[index]

        if line.strip().startswith("```"):
            if not in_code:
                in_code = True
                code_lines = []
            else:
                pdf.code_block("\n".join(code_lines))
                in_code = False
            index += 1
            continue

        if in_code:
            code_lines.append(line)
            index += 1
            continue

        if (
            line.strip().startswith("|")
            and index + 1 < len(lines)
            and re.search(r"\|\s*-+", lines[index + 1])
        ):
            rows, index = parse_table_block(lines, index)
            pdf.table(rows)
            list_index = 0
            continue

        if not line.strip():
            pdf.ln(2)
            list_index = 0
            index += 1
            continue

        if line.startswith("# "):
            pdf.heading(strip_md(line[2:]), 1)
            list_index = 0
        elif line.startswith("## "):
            pdf.heading(strip_md(line[3:]), 2)
            list_index = 0
        elif line.startswith("### "):
            pdf.heading(strip_md(line[4:]), 3)
            list_index = 0
        elif line.startswith("#### "):
            pdf.heading(strip_md(line[5:]), 4)
            list_index = 0
        elif re.match(r"^[-*] ", line):
            pdf.bullet(strip_md(line[2:]), numbered=False)
            list_index = 0
        elif re.match(r"^\d+\. ", line):
            list_index += 1
            pdf.bullet(strip_md(re.sub(r"^\d+\. ", "", line)), numbered=True, index=list_index)
        elif line.strip() == "---":
            pdf.ln(1)
            y = pdf.get_y()
            pdf.set_draw_color(180, 180, 180)
            pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
            pdf.ln(3)
            list_index = 0
        elif line.startswith("> "):
            pdf._reset_x()
            pdf.set_font("DocFont", "I", 10)
            pdf.set_text_color(60, 60, 60)
            pdf.multi_cell(0, 5.5, strip_md(line[2:]))
            pdf.set_text_color(0, 0, 0)
            list_index = 0
        else:
            pdf.plain(strip_md(line), size=11)
            list_index = 0

        index += 1

    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(pdf_path))


def main() -> int:
    font_path = resolve_font()
    OUT.mkdir(parents=True, exist_ok=True)
    for src_name, out_name in FILES:
        src = ROOT / src_name
        dst = OUT / out_name
        md_to_pdf(src, dst, font_path)
        print(f"wrote {dst} ({dst.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
