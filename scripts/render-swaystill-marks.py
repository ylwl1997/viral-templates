#!/usr/bin/env python3
"""Rasterize the Swaystill still-frame mark and the OG title card.

The mark is a 9:16 hairline frame with one pause bar. The title card sets
italic “Sway”, that bar, and roman “still” on rag paper. No third-party art.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "public" / "brand"
INK = (26, 22, 18, 255)
PAPER = (243, 236, 223, 255)
QUIET = (110, 101, 92, 255)
SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
SERIF_ITALIC = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"


def draw_mark(draw: ImageDraw.ImageDraw, box, stroke: int) -> None:
    x, y, w, h = box
    if stroke % 2 == 0:
        stroke += 1
    draw.rectangle((x, y, x + w - 1, y + h - 1), outline=INK, width=stroke)
    bar = stroke
    left = x + (w - bar) // 2
    top = y + int(h * 0.22)
    bot = y + int(h * 0.78)
    draw.rectangle((left, top, left + bar - 1, bot), fill=INK)


def icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), PAPER)
    draw = ImageDraw.Draw(img)
    h = int(size * 0.72)
    w = int(round(h * 9 / 16))
    if w % 2:
        w += 1
    stroke = max(2, size // 28)
    box = ((size - w) // 2, (size - h) // 2, w, h)
    draw_mark(draw, box, stroke)
    return img


def og() -> Image.Image:
    img = Image.new("RGBA", (1200, 630), PAPER)
    draw = ImageDraw.Draw(img)
    sway = ImageFont.truetype(SERIF_ITALIC, 96)
    still = ImageFont.truetype(SERIF, 96)
    sub = ImageFont.truetype(SERIF, 28)
    sway_text, still_text = "Sway", "still"
    gap = 22
    bar_w = 2
    sw = draw.textlength(sway_text, font=sway)
    st = draw.textlength(still_text, font=still)
    total = sw + gap + bar_w + gap + st
    x = (1200 - total) / 2
    y = 230
    draw.text((x, y), sway_text, font=sway, fill=INK)
    bar_x = x + sw + gap
    draw.rectangle((bar_x, y + 18, bar_x + bar_w - 1, y + 100), fill=INK)
    draw.text((bar_x + bar_w + gap, y), still_text, font=still, fill=INK)
    line = "A short clip, from a photo you already have."
    lw = draw.textlength(line, font=sub)
    draw.text(((1200 - lw) / 2, 390), line, font=sub, fill=QUIET)
    return img


def main() -> None:
    BRAND.mkdir(parents=True, exist_ok=True)
    icon(180).save(BRAND / "apple-touch-icon.png")
    icon(192).save(BRAND / "icon-192.png")
    icon(512).save(BRAND / "icon-512.png")
    og().save(BRAND / "og.png")


if __name__ == "__main__":
    main()
