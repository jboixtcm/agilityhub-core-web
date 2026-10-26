#!/usr/bin/env python3
"""Inventory final PNG captures, preserving originals and reporting mobile overflow candidates."""
import hashlib
import json
from pathlib import Path
import re
import sys
from PIL import Image

folder = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
if output.exists():
    raise SystemExit("Refusing to overwrite prior capture inventory")
rows = []
for path in sorted(folder.rglob("*.png")):
    with Image.open(path) as img:
        width, height = img.size
    match = re.search(r"(?:^|-)(375|768|1280)(?:[-.]|$)", path.name)
    nominal = int(match.group(1)) if match else None
    rows.append({"file": str(path.relative_to(folder)), "width": width, "height": height,
                 "namedViewport": nominal, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
candidates = [row for row in rows if row["namedViewport"] in (375,768) and row["width"] > row["namedViewport"]]
report = {"source": str(folder), "count": len(rows), "mobileOverflowCandidates": candidates, "captures": rows,
          "limit": "Filename-based geometry check. Cropped-element images may differ from viewport. DOM measurements and original-image review decide actual defects; this does not establish accessibility or complete visual fidelity."}
output.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"count": len(rows), "mobileOverflowCandidates": candidates}, indent=2))
