#!/usr/bin/env python3
"""Génère les icônes PWA 192/512 (ticket 014)."""
from PIL import Image, ImageDraw


def make_icon(size: int, path: str) -> None:
    img = Image.new('RGBA', (size, size), (0, 168, 107, 255))  # vert "pompe"
    d = ImageDraw.Draw(img)
    # corps de pompe (PIL 8.1 : pas de rounded_rectangle, rectangle simple)
    d.rectangle([size * 0.28, size * 0.16, size * 0.72, size * 0.78], fill=(255, 255, 255, 255))
    # tête / écran
    d.rectangle([size * 0.34, size * 0.24, size * 0.66, size * 0.42], fill=(0, 168, 107, 255))
    # tuyau
    d.rectangle([size * 0.58, size * 0.62, size * 0.86, size * 0.70], fill=(255, 255, 255, 255))
    # goutte (carburant)
    d.ellipse([size * 0.40, size * 0.52, size * 0.60, size * 0.72], fill=(0, 168, 107, 255))
    img.save(path, 'PNG')


make_icon(192, 'public/icons/icon-192.png')
make_icon(512, 'public/icons/icon-512.png')
print('icons OK')
