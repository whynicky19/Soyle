#!/usr/bin/env python3
"""Build the Söyle visual asset catalog and enforce the diversity policy."""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import math
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, UnidentifiedImageError


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"
POLICY_PATH = ROOT / "docs" / "visual-assets" / "policy.json"
CATALOG_PATH = ROOT / "docs" / "visual-assets" / "catalog.json"
REPORT_PATH = ROOT / "docs" / "visual-assets" / "audit.md"
ASSET_EXTENSIONS = {".avif", ".jpeg", ".jpg", ".png", ".svg", ".webp"}
RASTER_EXTENSIONS = {".avif", ".jpeg", ".jpg", ".png", ".webp"}
SOURCE_EXTENSIONS = {".css", ".js", ".json", ".mjs", ".py", ".ts", ".tsx"}
REFERENCE_RE = re.compile(r"(?P<path>/[A-Za-z0-9_./-]+\.(?:avif|jpe?g|png|svg|webp))")
EXCLUDED_PARTS = {".git", ".next", "node_modules", "output", "presentation_assets"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def perceptual_hash(path: Path) -> tuple[str | None, list[int] | None]:
    if path.suffix.lower() not in RASTER_EXTENSIONS:
        return None, None
    try:
        with Image.open(path) as source:
            image = source.convert("RGBA")
            background = Image.new("RGBA", image.size, "white")
            background.alpha_composite(image)
            grayscale = background.convert("L").resize((32, 32), Image.Resampling.LANCZOS)
            pixels = list(grayscale.get_flattened_data())
            dimensions = [source.width, source.height]
    except (OSError, UnidentifiedImageError):
        return None, None

    cosine = [[math.cos(math.pi * (2 * x + 1) * frequency / 64) for x in range(32)] for frequency in range(8)]
    scale = [1 / math.sqrt(2), *([1.0] * 7)]
    coefficients: list[float] = []
    for vertical in range(8):
        for horizontal in range(8):
            total = 0.0
            for y in range(32):
                offset = y * 32
                row = sum(pixels[offset + x] * cosine[horizontal][x] for x in range(32))
                total += cosine[vertical][y] * row
            coefficients.append(0.25 * scale[horizontal] * scale[vertical] * total)

    body = coefficients[1:]
    median = sorted(body)[len(body) // 2]
    value = 0
    for coefficient in body:
        value = (value << 1) | int(coefficient > median)
    return f"{value:016x}", dimensions


def product_sources() -> list[Path]:
    roots = [ROOT / "frontend" / "app", ROOT / "frontend" / "components", ROOT / "frontend" / "lib", ROOT / "backend" / "app"]
    files: list[Path] = []
    for source_root in roots:
        for path in source_root.rglob("*"):
            if path.is_file() and path.suffix.lower() in SOURCE_EXTENSIONS and not EXCLUDED_PARTS.intersection(path.parts):
                files.append(path)
    return sorted(files)


def scan_references() -> dict[str, list[dict[str, object]]]:
    references: dict[str, list[dict[str, object]]] = defaultdict(list)
    for source in product_sources():
        try:
            lines = source.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for line_number, line in enumerate(lines, start=1):
            for match in REFERENCE_RE.finditer(line):
                references[match.group("path")].append({
                    "file": source.relative_to(ROOT).as_posix(),
                    "line": line_number,
                })
    return references


def matches_exception(asset: str, exceptions: list[dict[str, str]]) -> dict[str, str] | None:
    return next((item for item in exceptions if fnmatch.fnmatch(asset, item["pattern"])), None)


def similarity_exception(first: str, second: str, exceptions: list[dict[str, object]]) -> dict[str, object] | None:
    pair = {first, second}
    for item in exceptions:
        if pair == set(item.get("assets", [])):
            return item
    return None


def build_catalog() -> tuple[list[dict[str, object]], dict[str, list[dict[str, object]]]]:
    references = scan_references()
    assets: list[dict[str, object]] = []
    for path in sorted(item for item in PUBLIC.rglob("*") if item.is_file() and item.suffix.lower() in ASSET_EXTENSIONS):
        public_path = "/" + path.relative_to(PUBLIC).as_posix()
        phash, dimensions = perceptual_hash(path)
        assets.append({
            "asset": public_path,
            "format": path.suffix.lower().lstrip("."),
            "bytes": path.stat().st_size,
            "dimensions": dimensions,
            "sha256": sha256(path),
            "phash": phash,
            "references": references.get(public_path, []),
        })
    return assets, references


def audit(assets: list[dict[str, object]], references: dict[str, list[dict[str, object]]], policy: dict[str, object]) -> dict[str, object]:
    known = {item["asset"] for item in assets}
    exact_groups: dict[str, list[str]] = defaultdict(list)
    for item in assets:
        exact_groups[str(item["sha256"])].append(str(item["asset"]))
    exact_duplicates = [group for group in exact_groups.values() if len(group) > 1]

    threshold = int(policy["phash_threshold"])
    raster = [item for item in assets if item["phash"]]
    near_duplicates: list[dict[str, object]] = []
    for index, first in enumerate(raster):
        first_hash = int(str(first["phash"]), 16)
        for second in raster[index + 1:]:
            if first["sha256"] == second["sha256"]:
                continue
            distance = (first_hash ^ int(str(second["phash"]), 16)).bit_count()
            if distance <= threshold and not similarity_exception(str(first["asset"]), str(second["asset"]), policy["similarity_exceptions"]):
                near_duplicates.append({"first": first["asset"], "second": second["asset"], "distance": distance})

    reused: list[dict[str, object]] = []
    for item in assets:
        contexts = {(str(reference["file"]), int(reference["line"])) for reference in item["references"]}
        if len(contexts) < 2:
            continue
        exception = matches_exception(str(item["asset"]), policy["reuse_exceptions"])
        reused.append({
            "asset": item["asset"],
            "contexts": len(contexts),
            "allowed": bool(exception),
            "reason": exception["reason"] if exception else None,
        })

    broken = sorted(path for path in references if path not in known)
    unjustified_reuse = [item for item in reused if not item["allowed"]]
    return {
        "asset_count": len(assets),
        "referenced_asset_count": sum(bool(item["references"]) for item in assets),
        "exact_duplicates": exact_duplicates,
        "near_duplicates": near_duplicates,
        "reused_assets": reused,
        "unjustified_reuse": unjustified_reuse,
        "broken_references": broken,
        "passed": not (exact_duplicates or near_duplicates or unjustified_reuse or broken),
    }


def write_outputs(assets: list[dict[str, object]], results: dict[str, object], policy: dict[str, object]) -> None:
    generated_at = datetime.now(timezone.utc).isoformat()
    CATALOG_PATH.write_text(json.dumps({"generated_at": generated_at, "assets": assets}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Visual Asset Diversity Audit",
        "",
        f"Generated: {generated_at}",
        "",
        f"Status: **{'PASS' if results['passed'] else 'FAIL'}**",
        "",
        f"- Runtime visual assets cataloged: {results['asset_count']}",
        f"- Assets referenced by product source: {results['referenced_asset_count']}",
        f"- Exact duplicate groups: {len(results['exact_duplicates'])}",
        f"- Near-duplicate pairs (pHash distance ≤ {policy['phash_threshold']}): {len(results['near_duplicates'])}",
        f"- Unjustified multi-context reuse: {len(results['unjustified_reuse'])}",
        f"- Broken direct asset references: {len(results['broken_references'])}",
        "",
        "## Exact duplicates",
        "",
    ]
    if results["exact_duplicates"]:
        for group in results["exact_duplicates"]:
            lines.append("- " + ", ".join(f"`{asset}`" for asset in group))
    else:
        lines.append("None.")

    lines.extend(["", "## Visual near-duplicates", ""])
    if results["near_duplicates"]:
        for pair in results["near_duplicates"]:
            lines.append(f"- `{pair['first']}` ↔ `{pair['second']}` — pHash distance {pair['distance']}")
    else:
        lines.append("None.")

    lines.extend(["", "## Multi-context reuse", ""])
    if results["reused_assets"]:
        for item in results["reused_assets"]:
            status = "allowed" if item["allowed"] else "not justified"
            reason = f" — {item['reason']}" if item["reason"] else ""
            lines.append(f"- `{item['asset']}` — {item['contexts']} contexts, {status}{reason}")
    else:
        lines.append("None.")

    lines.extend(["", "## Broken references", ""])
    if results["broken_references"]:
        lines.extend(f"- `{path}`" for path in results["broken_references"])
    else:
        lines.append("None.")

    lines.extend([
        "",
        "## Scope and rule",
        "",
        "The catalog covers product runtime images in `frontend/public`. SHA-256 catches byte-identical files; a 64-bit perceptual hash catches visually close raster files. Direct product-source references are checked separately so one scene cannot silently be reused in multiple contexts. Explicit exceptions are limited to logos, reviewed educational stimuli, stable AAC symbols, and documented same-context responsive declarations.",
        "",
        "**ONE SCENE — ONE ORIGINAL ILLUSTRATION.**",
        "",
    ])
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="Write catalog.json and audit.md")
    parser.add_argument("--check", action="store_true", help="Exit non-zero when the policy fails")
    args = parser.parse_args()

    policy = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    assets, references = build_catalog()
    results = audit(assets, references, policy)
    if args.write:
        write_outputs(assets, results, policy)
    print(json.dumps({key: value for key, value in results.items() if key not in {"reused_assets"}}, ensure_ascii=False, indent=2))
    return 1 if args.check and not results["passed"] else 0


if __name__ == "__main__":
    sys.exit(main())
