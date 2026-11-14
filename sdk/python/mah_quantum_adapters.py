"""Strict CSV edge-list adapter for the bounded industrial MaxCut API.

This is an *interoperability* adapter, NOT a general-purpose production
scheduler, capacity planner, power flow solver or physical equipment driver.
"""
import csv
import io
import math
from pathlib import Path
from typing import Any


def graph_from_csv(source: str | Path, *,
                   name: str = "Customer weighted interaction graph",
                   context: str = "Customer-provided weighted pairwise separation model") -> dict[str, Any]:
    """Load source,target,weight edge list; preserve stable node assignment order.

    src may be a CSV text string or a pathlib.Path. Every edge is a
    nonnegative *interaction separation objective*, not a measured constraint.
    """
    if isinstance(source, Path):
        raw = source.read_text(encoding="utf-8-sig")
    elif isinstance(source, str):
        raw = source
    else:
        raise TypeError("Input must be CSV text or a pathlib.Path.")
    if len(raw.encode("utf-8")) > 32768:
        raise ValueError("CSV exceeds 32 KiB.")
    reader = csv.DictReader(io.StringIO(raw.lstrip("\ufeff"), newline=""))
    if reader.fieldnames != ["source", "target", "weight"]:
        raise ValueError("CSV header must be exactly source,target,weight.")
    nodes: list[str] = []
    lookup: dict[str, int] = {}
    edges: list[dict[str, int | float]] = []
    seen: set[tuple[int, int]] = set()

    def node(label: str) -> int:
        value = label.strip()
        if not value or len(value) > 60 or value[0] in "=+-@":
            raise ValueError("Node labels must be nonempty, at most 60 characters and not spreadsheet formulas.")
        key = value.casefold()
        if key not in lookup:
            if len(nodes) >= 10:
                raise ValueError("The exact QAOA model supports at most ten variables.")
            lookup[key] = len(nodes)
            nodes.append(value)
        return lookup[key]

    for i, row in enumerate(reader, start=2):
        if i > 47:
            raise ValueError("CSV cannot contain more than 45 weighted edges.")
        if None in row or None in row.values():
            raise ValueError(f"Malformed CSV edge row {i}.")
        a, b = node(row["source"]), node(row["target"])
        if a == b:
            raise ValueError(f"Self-edge on row {i}.")
        try:
            w = float(row["weight"])
        except ValueError as exc:
            raise ValueError(f"Invalid weight on row {i}.") from exc
        if not math.isfinite(w) or not 0 < w <= 1000:
            raise ValueError(f"Weight must be finite, positive and at most 1000 on row {i}.")
        key = tuple(sorted((a, b)))
        if key in seen:
            raise ValueError(f"Duplicate weighted undirected edge on row {i}.")
        seen.add(key)
        edges.append({"source": key[0], "target": key[1], "weight": w})
    if not 2 <= len(nodes) <= 10 or not edges:
        raise ValueError("Model must contain 2–10 nodes and at least one edge.")
    if not name.strip() or len(name) > 110:
        raise ValueError("Graph name is required and must be at most 110 characters.")
    if len(context) > 400:
        raise ValueError("Graph context must be at most 400 characters.")
    return {"name": name.strip(), "nodes": nodes, "edges": edges, "context": context}


def example_csv() -> str:
    """A reproducible *synthetic* manufacturing graph, not plant data."""
    return "source,target,weight\nCutting,Welding,7\nWelding,Inspection,4\nCutting,Inspection,3\n"
