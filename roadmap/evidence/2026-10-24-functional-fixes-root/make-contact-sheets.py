#!/usr/bin/env python3
"""Build review aids from original captures without changing the captures."""
import json
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

source = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
output.mkdir(parents=True, exist_ok=False)
old = json.loads((Path(__file__).resolve().parent / "mock-captures.json").read_text())
group_for = {row["file"]: row["group"] for row in old["captures"]}
groups = {}
for path in sorted(source.glob("*.png")):
    group = group_for.get(path.name, "admin-gallery" if path.name.startswith("responsive-") else "other-flows")
    groups.setdefault(group, []).append(path)
font = ImageFont.truetype("/System/Library/Fonts/Monaco.ttf", 11)
index = {}
for group, paths in groups.items():
    index[group] = []
    for offset in range(0,len(paths),9):
        sheet = Image.new("RGB", (1260,1680), "#dddddd")
        draw = ImageDraw.Draw(sheet)
        selected = paths[offset:offset+9]
        for i,path in enumerate(selected):
            x=(i%3)*420;y=(i//3)*560
            with Image.open(path) as original:
                original_size=original.size
                copy=original.convert("RGB")
            copy.thumbnail((410,510))
            sheet.paste(copy,(x+(420-copy.width)//2,y+28))
            label=path.name
            draw.text((x+4,y+3),label[:57],font=font,fill="black")
            draw.text((x+4,y+539),str(original_size),font=font,fill="black")
        name=f"{group}-{offset//9+1:02d}.jpg"
        sheet.save(output/name,quality=88)
        index[group].append({"sheet":name,"originals":[p.name for p in selected]})
(output/"index.json").write_text(json.dumps(index,indent=2)+"\n")
print(json.dumps({group:len(paths) for group,paths in groups.items()}))
