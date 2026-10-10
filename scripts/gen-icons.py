"""Gera os PNGs do ícone (mesmo desenho do public/icons/icon.svg). Requer Pillow.

Uso: python3 scripts/gen-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
TOP, BOTTOM = (0x1C, 0xC2, 0x9F), (0x0B, 0x7A, 0x60)
S = 2048  # desenha grande e reduz, para bordas suaves


def gradient(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM))
    return img


def coin(scale):
    """Moeda partida ao meio, girada; scale = fração do lado ocupada pelo diâmetro."""
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = S * scale / 2
    c = S / 2
    gap = S * 12 / 512
    d.pieslice([c - r - gap, c - r, c + r - gap, c + r], 90, 270, fill=(255, 255, 255, 255))
    d.pieslice([c - r + gap, c - r, c + r + gap, c + r], 270, 90, fill=(255, 255, 255, 158))
    return layer.rotate(28, resample=Image.BICUBIC)


def icon(rounded, scale):
    bg = gradient(256).resize((S, S), Image.BICUBIC).convert("RGBA")
    bg.alpha_composite(coin(scale))
    if rounded:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 112 / 512, fill=255)
        bg.putalpha(mask)
    return bg


def plus_icon():
    img = icon(True, 0)
    d = ImageDraw.Draw(img)
    w, c, h = S * 0.09, S / 2, S * 0.28
    d.rounded_rectangle([c - w / 2, c - h, c + w / 2, c + h], radius=w / 2, fill="white")
    d.rounded_rectangle([c - h, c - w / 2, c + h, c + w / 2], radius=w / 2, fill="white")
    return img


def save(img, name, size):
    img.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)


regular = icon(True, 300 / 512)
save(regular, "icon-192.png", 192)
save(regular, "icon-512.png", 512)
# iOS aplica a própria máscara arredondada e não aceita transparência.
save(icon(False, 300 / 512).convert("RGB"), "apple-touch-icon.png", 180)
# Maskable: o Android recorta em círculo/squircle; desenho dentro dos 80% centrais.
save(icon(False, 230 / 512), "maskable-512.png", 512)
save(plus_icon(), "shortcut-add-96.png", 96)
print("ícones gerados em", OUT)
