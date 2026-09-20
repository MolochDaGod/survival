#!/usr/bin/env python3
"""Download-side post: remove vignette backgrounds from Imgur faction banners."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

RAW = Path(r"F:\GitHub\survival\artifacts\website\public\icons\factions\banners\raw")
OUT_WEB = Path(r"F:\GitHub\survival\artifacts\website\public\icons\factions\banners")
OUT_GAME = Path(r"F:\GitHub\survival\artifacts\arpg-game\public\icons\factions\banners")
OUT_MAP = Path(r"F:\GitHub\survival\artifacts\arpg-game\public\icons\factions")
WEB_ICON = Path(r"F:\GitHub\survival\artifacts\website\public\icons\factions")

MAP = {
    "8CQCr7p.png": "forgotten",
    "JHTHM2B.png": "network",
    "rPb5AGO.png": "hollow_lords",
    "WQSnfU0.png": "tech_scavengers",
    "vL1X74H.png": "keepers",
}
SHORT = {
    "forgotten": "forgotten",
    "network": "network",
    "hollow_lords": "hollow",
    "tech_scavengers": "scavengers",
    "keepers": "keepers",
}


def remove_dark_bg(im: Image.Image, lum_thresh: int = 48) -> Image.Image:
    """Flood-fill near-black vignette from edges → transparent."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()

    def is_bg(x: int, y: int) -> bool:
        r, g, b, _a = px[x, y]
        mx = max(r, g, b)
        mn = min(r, g, b)
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        chroma = mx - mn
        if lum <= lum_thresh and chroma < 28:
            return True
        if mx <= lum_thresh - 8:
            return True
        return False

    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(x, y):
                q.append((x, y))
                visited[y][x] = True
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y][x] and is_bg(x, y):
                q.append((x, y))
                visited[y][x] = True

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                visited[ny][nx] = True
                if is_bg(nx, ny):
                    q.append((nx, ny))

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            if lum > 40:
                continue
            t = 0
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    if px[nx, ny][3] == 0:
                        t += 1
                else:
                    t += 1
            if t >= 4 and lum < 55:
                px[x, y] = (0, 0, 0, 0)

    bbox = im.getbbox()
    if bbox:
        pad = 8
        x0 = max(0, bbox[0] - pad)
        y0 = max(0, bbox[1] - pad)
        x1 = min(w, bbox[2] + pad)
        y1 = min(h, bbox[3] + pad)
        im = im.crop((x0, y0, x1, y1))
    return im


def make_map_icon(im: Image.Image, size: int = 128) -> Image.Image:
    im = im.convert("RGBA")
    ratio = min(size / im.width, size / im.height)
    nw = max(1, int(im.width * ratio))
    nh = max(1, int(im.height * ratio))
    resized = im.resize((nw, nh), Image.Resampling.NEAREST)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return out


def main() -> None:
    for d in (OUT_WEB, OUT_GAME, OUT_MAP, WEB_ICON):
        d.mkdir(parents=True, exist_ok=True)

    for src, fid in MAP.items():
        path = RAW / src
        cut = remove_dark_bg(Image.open(path))
        short = SHORT[fid]
        for d in (OUT_WEB, OUT_GAME):
            cut.save(d / f"{fid}.png", "PNG", optimize=True)
            cut.save(d / f"{short}.png", "PNG", optimize=True)
        icon = make_map_icon(cut, 128)
        icon.save(OUT_MAP / f"banner_{fid}.png", "PNG", optimize=True)
        # Map tool short keys
        icon.save(OUT_MAP / f"banner_{short}.png", "PNG", optimize=True)
        # Website companion (do not overwrite original crest icons)
        icon.save(WEB_ICON / f"{short}_banner.png", "PNG", optimize=True)
        print(f"{fid}: full={cut.size} icon=128 from {src}")
    print("done")


if __name__ == "__main__":
    main()
