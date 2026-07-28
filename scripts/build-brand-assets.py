#!/usr/bin/env python3
"""Build Janet web-brand assets from the approved raster source boards."""

from __future__ import annotations

import base64
import io
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "brand" / "source"
ICON_DIR = ROOT / "assets" / "icons"
OG_DIR = ROOT / "assets" / "og"
MARK_SOURCE = SOURCE_DIR / "janet-mark-original.png"
LOCKUP_SOURCE = SOURCE_DIR / "janet-lockups-original.png"

INK = "#0A0A0A"
PAPER = "#F7F5F0"
GREEN = "#183D2E"
CORAL = "#D8684F"


def source_alpha(image: Image.Image) -> np.ndarray:
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    border = np.concatenate(
        (
            gray[:32, :].ravel(),
            gray[-32:, :].ravel(),
            gray[:, :32].ravel(),
            gray[:, -32:].ravel(),
        )
    )
    paper = float(np.percentile(border, 55))
    alpha = np.clip((paper - gray - 2.5) / max(paper - 18.0, 1.0), 0.0, 1.0)
    return np.power(alpha, 0.82)


def content_box(image: Image.Image, region: tuple[int, int, int, int] | None = None) -> tuple[int, int, int, int]:
    gray = np.asarray(image.convert("L"))
    x0, y0, x1, y1 = region or (0, 0, image.width, image.height)
    ys, xs = np.where(gray[y0:y1, x0:x1] < 205)
    if not len(xs):
        raise RuntimeError("No logo content found in source image")
    return (
        int(xs.min() + x0),
        int(ys.min() + y0),
        int(xs.max() + x0 + 1),
        int(ys.max() + y0 + 1),
    )


def transparent_crop(
    image: Image.Image,
    region: tuple[int, int, int, int] | None = None,
    padding: int = 18,
    light: bool = False,
) -> Image.Image:
    box = content_box(image, region)
    box = (
        max(0, box[0] - padding),
        max(0, box[1] - padding),
        min(image.width, box[2] + padding),
        min(image.height, box[3] + padding),
    )
    crop = image.crop(box)
    alpha = (source_alpha(crop) * 255).astype(np.uint8)
    rgb = 255 if light else 0
    rgba = np.empty((crop.height, crop.width, 4), dtype=np.uint8)
    rgba[:, :, :3] = rgb
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba, "RGBA")


def fit_image(image: Image.Image, size: tuple[int, int], padding: int = 0) -> Image.Image:
    target_w, target_h = size
    available_w = max(1, target_w - padding * 2)
    available_h = max(1, target_h - padding * 2)
    scale = min(available_w / image.width, available_h / image.height)
    resized = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )
    output = Image.new("RGBA", size, (0, 0, 0, 0))
    output.alpha_composite(resized, ((target_w - resized.width) // 2, (target_h - resized.height) // 2))
    return output


def trace_paths(
    image: Image.Image,
    region: tuple[int, int, int, int] | None = None,
    min_area: float = 8.0,
) -> tuple[list[str], tuple[int, int, int, int]]:
    gray = np.asarray(image.convert("L"))
    x0, y0, x1, y1 = region or (0, 0, image.width, image.height)
    binary = np.where(gray[y0:y1, x0:x1] < 175, 255, 0).astype(np.uint8)
    contours, _ = cv2.findContours(binary, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE)
    kept = [contour for contour in contours if abs(cv2.contourArea(contour)) >= min_area]
    if not kept:
        raise RuntimeError("No vector contours found")

    xs: list[int] = []
    ys: list[int] = []
    paths: list[str] = []
    for contour in kept:
        approx = cv2.approxPolyDP(contour, epsilon=0.58, closed=True)
        points = [(int(point[0][0] + x0), int(point[0][1] + y0)) for point in approx]
        if len(points) < 3:
            continue
        xs.extend(point[0] for point in points)
        ys.extend(point[1] for point in points)
        paths.append("M " + " L ".join(f"{x} {y}" for x, y in points) + " Z")
    return paths, (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def svg_document(
    image: Image.Image,
    *,
    title: str,
    description: str,
    region: tuple[int, int, int, int] | None = None,
    square: bool = False,
    padding: int = 24,
) -> str:
    paths, box = trace_paths(image, region)
    source_w = box[2] - box[0]
    source_h = box[3] - box[1]
    if square:
        width = height = 512
        scale = min((width - 2 * padding) / source_w, (height - 2 * padding) / source_h)
        offset_x = (width - source_w * scale) / 2
        offset_y = (height - source_h * scale) / 2
    else:
        width = source_w + padding * 2
        height = source_h + padding * 2
        scale = 1.0
        offset_x = float(padding)
        offset_y = float(padding)
    transform = (
        f"translate({offset_x:.3f} {offset_y:.3f}) "
        f"scale({scale:.6f}) translate({-box[0]} {-box[1]})"
    )
    path_data = " ".join(paths)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
  <title id="title">{title}</title>
  <desc id="desc">{description}</desc>
  <path d="{path_data}" transform="{transform}" fill="{INK}" fill-rule="evenodd"/>
</svg>
"""


def save_png(image: Image.Image, path: Path, *, optimize: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=optimize)


def font(size: int, bold: bool = False, cjk: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("/System/Library/Fonts/Hiragino Sans GB.ttc") if cjk else Path("/System/Library/Fonts/SFNS.ttf"),
        Path("/System/Library/Fonts/SFNS.ttf"),
        Path("/System/Library/Fonts/Helvetica.ttc"),
        Path("/Library/Fonts/Arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            index = 1 if bold and candidate.suffix == ".ttc" else 0
            return ImageFont.truetype(str(candidate), size=size, index=index)
    return ImageFont.load_default(size=size)


def place_lockup(canvas: Image.Image, lockup: Image.Image, x: int, y: int, width: int) -> int:
    scale = width / lockup.width
    rendered = lockup.resize((width, round(lockup.height * scale)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(rendered, (x, y))
    return rendered.height


def build_og(lockup: Image.Image, name: str, eyebrow: str, title: str, subtitle: str, accent: str) -> None:
    canvas = Image.new("RGBA", (1200, 630), PAPER)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 1200, 9), fill=GREEN)
    draw.ellipse((1022, 72, 1050, 100), fill=accent)
    place_lockup(canvas, lockup, 78, 68, 236)
    draw.text((80, 216), eyebrow, fill=GREEN, font=font(22, bold=True))
    draw.multiline_text((76, 260), title, fill=INK, font=font(72, bold=True), spacing=4)
    draw.text((80, 492), subtitle, fill="#5D625D", font=font(25, cjk=True))
    draw.line((80, 560, 1120, 560), fill="#D7D2C9", width=2)
    draw.text((80, 578), "JANET PUBLIC SITE", fill=GREEN, font=font(18, bold=True))
    save_png(canvas.convert("RGB"), OG_DIR / f"{name}.png")


def embedded_png_data(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def build_legacy_og_svg(name: str, png: Image.Image) -> None:
    encoded = embedded_png_data(png)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" '
        'width="1200" height="630" role="img" aria-label="Janet">'
        f'<image width="1200" height="630" href="data:image/png;base64,{encoded}"/>'
        "</svg>\n"
    )
    (OG_DIR / f"{name}.svg").write_text(svg, encoding="utf-8")


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    OG_DIR.mkdir(parents=True, exist_ok=True)
    mark_source = Image.open(MARK_SOURCE).convert("RGB")
    lockup_source = Image.open(LOCKUP_SOURCE).convert("RGB")

    mark = transparent_crop(mark_source, padding=24)
    mark_light = transparent_crop(mark_source, padding=24, light=True)
    vertical = transparent_crop(lockup_source, region=(0, 0, 1254, 500), padding=20)
    horizontal = transparent_crop(lockup_source, region=(0, 930, 1254, 1254), padding=22)
    horizontal_light = transparent_crop(
        lockup_source,
        region=(0, 930, 1254, 1254),
        padding=22,
        light=True,
    )

    save_png(fit_image(mark, (512, 512), 20), ICON_DIR / "logo-mark.png")
    save_png(fit_image(mark_light, (512, 512), 20), ICON_DIR / "logo-mark-light.png")
    save_png(fit_image(horizontal, (1200, 360), 22), ICON_DIR / "logo-lockup-horizontal.png")
    save_png(fit_image(horizontal_light, (1200, 360), 22), ICON_DIR / "logo-lockup-horizontal-light.png")
    save_png(fit_image(vertical, (760, 920), 24), ICON_DIR / "logo-lockup-vertical.png")

    (ICON_DIR / "logo-mark.svg").write_text(
        svg_document(
            mark_source,
            title="Janet",
            description="Janet musical J monogram.",
            square=True,
            padding=28,
        ),
        encoding="utf-8",
    )
    horizontal_svg = svg_document(
        lockup_source,
        title="Janet",
        description="Janet horizontal wordmark.",
        region=(0, 930, 1254, 1254),
        padding=20,
    )
    vertical_svg = svg_document(
        lockup_source,
        title="Janet",
        description="Janet vertical wordmark.",
        region=(0, 0, 1254, 500),
        padding=20,
    )
    (ICON_DIR / "logo-lockup-horizontal.svg").write_text(horizontal_svg, encoding="utf-8")
    (ICON_DIR / "logo-lockup-vertical.svg").write_text(vertical_svg, encoding="utf-8")
    (ICON_DIR / "logo-janet.svg").write_text(horizontal_svg, encoding="utf-8")

    apple_icon = Image.new("RGBA", (180, 180), PAPER)
    draw = ImageDraw.Draw(apple_icon)
    draw.rounded_rectangle((0, 0, 179, 179), radius=40, fill=PAPER)
    apple_icon.alpha_composite(fit_image(mark, (142, 142), 4), (19, 19))
    save_png(apple_icon.convert("RGB"), ICON_DIR / "apple-touch-icon.png")
    save_png(fit_image(mark, (32, 32), 1), ICON_DIR / "favicon-32.png")
    save_png(fit_image(mark, (16, 16), 0), ICON_DIR / "favicon-16.png")
    fit_image(mark, (256, 256), 10).save(
        ROOT / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    build_og(
        horizontal,
        "janet-og",
        "WORKS / SIGNALS / DAILY BRIEF",
        "A personal archive\nfor work and signal.",
        "AI 影像、创作档案与每日 AI 晨报",
        CORAL,
    )
    build_og(
        horizontal,
        "news-og",
        "JANET DAILY AI BRIEFING",
        "Filter the noise.\nKeep the signal.",
        "全球 AI 变化，每天压缩成一份可判断的晨间信号",
        GREEN,
    )
    build_og(
        horizontal,
        "works-og",
        "JANET WORKS LIBRARY",
        "Ideas become\nworking images.",
        "AI 影像、剧情短片与完整创作流程档案",
        CORAL,
    )
    for name in ("janet-og", "news-og", "works-og"):
        build_legacy_og_svg(name, Image.open(OG_DIR / f"{name}.png").convert("RGB"))

    print("brand_assets_ready mark=1 lockups=2 favicons=3 og=3")


if __name__ == "__main__":
    main()
