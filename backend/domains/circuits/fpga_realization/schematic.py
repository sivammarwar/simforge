"""
Placement-grid schematic renderer for fpga_realization.

Owns its own SVG rendering — same pattern as digital_logic/schematic.py's
gate-level renderer (itself mirroring analog_sim/schemdraw_fallback.py's
"own your own renderer" approach) rather than using the generic 3-box
fallback in shared/schematic_renderer.py.

Draws the OCCUPIED region of the iCE40 fabric grid — not the full chip,
unnecessary visual noise for a handful of placed cells — using the real
x/y coordinates nextpnr reports for each cell. Reuses the dark-theme
color/box conventions already established for fpga_realization in
shared/schematic_renderer.py's COLORS dict.
"""
from html import escape
from typing import Any, Dict, Tuple

_COLOR = "#22d3ee"  # matches COLORS["fpga_realization"] in shared/schematic_renderer.py
_BG = "#0d0f12"
_CELL_FILL = "#111827"
_TEXT = "#d1d5db"

_CELL_SIZE = 56
_CELL_GAP = 14
_MARGIN = 40
_TITLE_H = 44


class PlacementSchematicError(Exception):
    pass


def _short(value: Any, limit: int = 12) -> str:
    value = str(value)
    return value if len(value) <= limit else value[:limit - 1] + "…"


def render_placement_schematic(placement: Dict[str, Dict[str, int]]) -> str:
    """
    Returns an SVG string rendering nextpnr's real cell placement on the
    iCE40 fabric grid. Raises PlacementSchematicError on malformed input —
    callers (pipeline.py) wrap this in try/except; on failure the existing
    generic fallback in shared/schematic_renderer.py still applies.
    """
    if not placement:
        raise PlacementSchematicError("No placement data to render.")

    try:
        xs = [int(p["x"]) for p in placement.values()]
        ys = [int(p["y"]) for p in placement.values()]
    except (KeyError, TypeError, ValueError) as exc:
        raise PlacementSchematicError(f"Malformed placement entries: {exc}")

    # Pad the occupied bounding box by one grid unit on each side so
    # single-cell / single-row designs aren't drawn flush against the edge.
    min_x, max_x = min(xs) - 1, max(xs) + 1
    min_y, max_y = min(ys) - 1, max(ys) + 1
    cols = max_x - min_x + 1
    rows = max_y - min_y + 1
    step = _CELL_SIZE + _CELL_GAP

    grid_w = cols * step
    grid_h = rows * step
    x0 = _MARGIN
    y0 = _MARGIN + _TITLE_H
    width = _MARGIN * 2 + grid_w
    height = _MARGIN * 2 + _TITLE_H + grid_h

    def _cell_origin(x: int, y: int) -> Tuple[float, float]:
        return (
            x0 + (x - min_x) * step + _CELL_GAP / 2,
            y0 + (y - min_y) * step + _CELL_GAP / 2,
        )

    grid_lines = []
    for c in range(cols + 1):
        gx = x0 + c * step
        grid_lines.append(f'<line x1="{gx}" y1="{y0}" x2="{gx}" y2="{y0 + grid_h}" '
                           f'stroke="#1f2937" stroke-width="1"/>')
    for r in range(rows + 1):
        gy = y0 + r * step
        grid_lines.append(f'<line x1="{x0}" y1="{gy}" x2="{x0 + grid_w}" y2="{gy}" '
                           f'stroke="#1f2937" stroke-width="1"/>')

    cells_svg = []
    for name, coord in placement.items():
        px, py = _cell_origin(int(coord["x"]), int(coord["y"]))
        cells_svg.append(
            f'<rect x="{px}" y="{py}" width="{_CELL_SIZE}" height="{_CELL_SIZE}" rx="6" '
            f'fill="{_CELL_FILL}" stroke="{_COLOR}" stroke-width="2"/>'
            f'<text x="{px + _CELL_SIZE / 2}" y="{py + _CELL_SIZE / 2 - 3}" text-anchor="middle" '
            f'fill="{_COLOR}" font-size="10" font-weight="700">{escape(_short(name))}</text>'
            f'<text x="{px + _CELL_SIZE / 2}" y="{py + _CELL_SIZE / 2 + 13}" text-anchor="middle" '
            f'fill="{_TEXT}" font-size="9">X{coord["x"]},Y{coord["y"]}</text>'
        )

    title = f"iCE40 Placement — {len(placement)} cell(s)"
    body = "".join(grid_lines) + "".join(cells_svg)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'role="img" aria-label="{escape(title)}">'
        f'<rect width="{width}" height="{height}" rx="16" fill="{_BG}"/>'
        f'<text x="{width / 2}" y="30" text-anchor="middle" fill="#f3f4f6" '
        f'font-size="16" font-weight="700">{escape(title)}</text>'
        f'{body}</svg>'
    )
