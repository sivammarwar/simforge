"""
Deterministic Netlist Translator
==================================
Converts the ONE AI-generated, Lcapy-flavored netlist (SPICE-like component
lines + lightweight layout hints after a semicolon) into a plain SPICE
component list that ngspice can simulate.

This file has ZERO knowledge of circuit topology — no "if RC filter" / "if
voltage divider" branches anywhere. It only does generic text/graph
operations (strip hints, merge wire-connected nodes via union-find), so it
scales to any circuit the AI can describe as a netlist, including ones that
don't exist yet in your domain.

The companion function `lcapy_netlist_clean` does the much smaller cleanup
needed before handing the SAME netlist text to Lcapy for schematic drawing
(it needs the hints, so it does much less stripping).
"""

import re
from typing import List, Tuple

# Lcapy-only line types that have no SPICE simulation equivalent.
_DRAWING_ONLY_PREFIXES = ("P",)  # P = port marker (drawing-only, Lcapy convention)
_WIRE_PREFIXES = ("W",)          # W = zero-resistance wire (Lcapy convention)

_DIRECTIVE_RE = re.compile(r"^\s*\.")
_COMMENT_RE = re.compile(r"^\s*([*#]|;;)")


class NetlistTranslationError(Exception):
    pass


def _split_hint(line: str) -> Tuple[str, str]:
    """Split a netlist line into (electrical_part, hint_part) on the FIRST
    semicolon — Lcapy hints always come after a single ';'."""
    if ";" in line:
        head, _, tail = line.partition(";")
        return head.rstrip(), tail.strip()
    return line.rstrip(), ""


def _tokenize(line: str) -> List[str]:
    return line.strip().split()


class _UnionFind:
    """Generic union-find so 'W a b' wire lines can merge node names without
    any per-topology logic."""

    def __init__(self):
        self.parent = {}

    def find(self, x: str) -> str:
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            # Keep literal ground node "0" as the canonical root whenever
            # it's involved, so SPICE ground stays spelled "0".
            if rb == "0":
                ra, rb = rb, ra
            self.parent[rb] = ra


def parse_netlist_lines(netlist_text: str) -> List[str]:
    """Return non-empty, non-comment lines from the raw AI netlist text."""
    lines = []
    for raw_line in netlist_text.replace("\\n", "\n").splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue
        if _COMMENT_RE.match(stripped):
            continue
        if stripped.startswith(";"):  # Lcapy global option line
            continue
        lines.append(stripped)
    return lines


def lcapy_netlist_to_spice(netlist_text: str) -> List[str]:
    """
    Deterministically derive plain SPICE component lines from the unified
    netlist. No circuit-type-specific logic — operates on netlist *syntax*,
    not circuit *semantics*.

    Returns a list of SPICE component-line strings (no title, no
    directives, no .end — the caller assembles the full deck).
    """
    lines = parse_netlist_lines(netlist_text)
    if not lines:
        raise NetlistTranslationError("Netlist is empty after stripping comments/options.")

    uf = _UnionFind()

    # Pass 1: collect wire unions
    for line in lines:
        electrical, _hint = _split_hint(line)
        if not electrical or _DIRECTIVE_RE.match(electrical):
            continue
        tokens = _tokenize(electrical)
        if not tokens:
            continue
        prefix = tokens[0][0].upper()
        if prefix in _WIRE_PREFIXES and len(tokens) >= 3:
            uf.union(tokens[1], tokens[2])

    def canon(node: str) -> str:
        node = "0" if node.lower() == "gnd" else node
        return uf.find(node)

    # Pass 2: emit SPICE component lines, dropping wire/port lines and
    # remapping node names through the union-find table.
    component_lines: List[str] = []
    for line in lines:
        electrical, _hint = _split_hint(line)
        if not electrical or _DIRECTIVE_RE.match(electrical):
            continue
        tokens = _tokenize(electrical)
        if not tokens:
            continue
        prefix = tokens[0][0].upper()
        if prefix in _WIRE_PREFIXES or prefix in _DRAWING_ONLY_PREFIXES:
            continue  # purely structural/drawing — no SPICE equivalent
        if len(tokens) < 3:
            raise NetlistTranslationError(f"Malformed component line: '{electrical}'")

        name = tokens[0]
        node_plus = canon(tokens[1])
        node_minus = canon(tokens[2])
        rest = tokens[3:]
        component_lines.append(" ".join([name, node_plus, node_minus] + rest))

    if not component_lines:
        raise NetlistTranslationError("No simulate-able components found in netlist.")

    return component_lines


def lcapy_netlist_clean(netlist_text: str) -> str:
    """
    Light cleanup pass for the SAME netlist before handing it to Lcapy for
    drawing: strips blank lines and comments, keeps everything else
    (including the layout hints — Lcapy needs those) exactly as the AI
    wrote it.
    """
    return "\n".join(parse_netlist_lines(netlist_text))
