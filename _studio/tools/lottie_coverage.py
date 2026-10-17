"""Measure how much of a Lottie's subject is visible at each sampled frame of an inspector sheet.

usage: python lottie_coverage.py <frame.png> <json: {"cols", "cw", "ch", "frames": [...]}>
Cells sit on a light checkerboard (#e6e6e6 / #ffffff). For each cell we count "ink" pixels (anything not
checker/border/label) and find its bounding box. A moment is flagged when its ink area drops below 60 % of the
best moment, or the subject touches a cell edge (it is leaving / entering the frame). Prints JSON.
"""
import json, sys
from PIL import Image

img = Image.open(sys.argv[1]).convert("RGB")
cfg = json.loads(sys.argv[2])
W, H = img.size
sx, sy = W / 1080, H / 1920
px = img.load()

def is_bg(c):
    r, g, b = c
    if abs(r - g) < 6 and abs(g - b) < 6 and (r > 218):  # checker greys/whites
        return True
    return False

cells = []
for i, fr in enumerate(cfg["frames"]):
    col, row = i % cfg["cols"], i // cfg["cols"]
    x0 = int((20 + col * cfg["cw"] + 6) * sx); x1 = int((20 + col * cfg["cw"] + cfg["cw"] - 16) * sx)
    y0 = int((70 + row * cfg["ch"] + 34) * sy); y1 = int((70 + row * cfg["ch"] + cfg["ch"] - 16) * sy)
    n = 0; bx0, by0, bx1, by1 = 10**9, 10**9, -1, -1
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            if not is_bg(px[x, y]):
                n += 1
                bx0 = min(bx0, x); bx1 = max(bx1, x); by0 = min(by0, y); by1 = max(by1, y)
    edge = n > 0 and (bx0 <= x0 + 3 or bx1 >= x1 - 4 or by0 <= y0 + 3 or by1 >= y1 - 4)
    cells.append({"frame": fr, "ink": n, "edge": edge})

best = max(c["ink"] for c in cells) or 1
# a full-bleed asset (water strip, background) touches the edges at every moment — then only coverage is informative
full_bleed = sum(1 for c in cells if c["edge"]) > 0.7 * len(cells)
if full_bleed:
    for c in cells: c["edge"] = False
for c in cells:
    c["cover"] = round(c["ink"] / best, 2)
    c["ok"] = c["cover"] >= 0.6 and not c["edge"]
# contiguous ok ranges
ranges, cur = [], None
for c in cells:
    if c["ok"]:
        cur = [c["frame"], c["frame"]] if cur is None else [cur[0], c["frame"]]
    else:
        if cur: ranges.append(cur); cur = None
if cur: ranges.append(cur)
print(json.dumps({"cells": cells, "safe": ranges, "full_bleed": full_bleed}))
