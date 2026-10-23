#!/usr/bin/env python3
"""Gera os ícones PNG do PWA sem dependências externas (rasterização + zlib)."""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "client", "public", "icons")
os.makedirs(OUT, exist_ok=True)

TEAL_DARK = (4, 38, 43)
TEAL = (1, 105, 111)
TEAL_BRIGHT = (2, 162, 175)
MINT = (77, 208, 225)
GOLD = (233, 196, 106)
WHITE = (245, 250, 249)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def blend(dst, src, alpha):
    if alpha <= 0:
        return dst
    alpha = min(1.0, alpha)
    return tuple(int(dst[i] * (1 - alpha) + src[i] * alpha) for i in range(3))


def rounded_rect_mask(x, y, w, h, radius):
    dx = min(max(x - w / 2, 0), 0)
    return dx


def inside_round_rect(px, py, x0, y0, x1, y1, r):
    if px < x0 or px > x1 or py < y0 or py > y1:
        return False
    cx = min(max(px, x0 + r), x1 - r)
    cy = min(max(py, y0 + r), y1 - r)
    return (px - cx) ** 2 + (py - cy) ** 2 <= r ** 2 or (x0 + r <= px <= x1 - r) or (y0 + r <= py <= y1 - r)


def render(size, maskable=False):
    ss = 2  # supersampling
    S = size * ss
    px = [[(0, 0, 0, 0) for _ in range(S)] for _ in range(S)]

    # fundo: gradiente diagonal + brilho radial
    for y in range(S):
        for x in range(S):
            t = (x / S * 0.55 + y / S * 0.45)
            color = lerp(TEAL_DARK, TEAL, min(1.0, t * 1.25))
            gx, gy = S * 0.24, S * 0.16
            glow = max(0.0, 1 - math.hypot(x - gx, y - gy) / (S * 0.72))
            color = blend(color, TEAL_BRIGHT, glow ** 2 * 0.45)
            px[y][x] = (*color, 255)

    # máscara de cantos (apenas ícones "any"; maskable é full-bleed)
    radius = 0 if maskable else S * 0.235
    if radius > 0:
        for y in range(S):
            for x in range(S):
                if not inside_round_rect(x + 0.5, y + 0.5, 0, 0, S - 1, S - 1, radius):
                    px[y][x] = (0, 0, 0, 0)

    scale = 0.72 if maskable else 0.82
    W = S * scale
    ox = (S - W) / 2
    oy = (S - W) / 2

    def sx(v):
        return ox + v * W

    def sy(v):
        return oy + v * W

    # cartão do calendário
    card = (sx(0.08), sy(0.14), sx(0.92), sy(0.9))
    card_r = W * 0.11
    shadow_off = W * 0.025
    for y in range(S):
        for x in range(S):
            # sombra
            if inside_round_rect(x + 0.5 - shadow_off, y + 0.5 - shadow_off, *card, card_r):
                r, g, b, a = px[y][x]
                px[y][x] = (*blend((r, g, b), (0, 18, 20), 0.28), a)
            if inside_round_rect(x + 0.5, y + 0.5, *card, card_r):
                r, g, b, a = px[y][x]
                px[y][x] = (*blend((r, g, b), WHITE, 0.97), a)

    # faixa superior (dourada) com cantos arredondados apenas em cima
    band_top = sy(0.14)
    band_bottom = sy(0.32)
    for y in range(int(band_top), int(band_bottom)):
        for x in range(int(card[0]), int(card[2])):
            top_corner_r = card_r
            ok = True
            if y < band_top + top_corner_r:
                for cx in (card[0] + top_corner_r, card[2] - top_corner_r):
                    if (x - cx) ** 2 + (y - (band_top + top_corner_r)) ** 2 > top_corner_r ** 2:
                        ok = False
            if ok:
                r, g, b, a = px[y][x]
                px[y][x] = (*blend((r, g, b), GOLD, 0.95), a)

    # argolas do calendário
    ring_r = W * 0.035
    for cx in (sx(0.3), sx(0.7)):
        cy = sy(0.14)
        for y in range(max(0, int(cy - ring_r) - 2), min(S, int(cy + ring_r) + 3)):
            for x in range(max(0, int(cx - ring_r) - 2), min(S, int(cx + ring_r) + 3)):
                d = math.hypot(x - cx, y - cy)
                if d <= ring_r:
                    r, g, b, a = px[y][x]
                    px[y][x] = (*blend((r, g, b), WHITE, 0.98), a)

    # linhas da escala
    rows = [(0.45, 0.62), (0.58, 0.5), (0.71, 0.66)]
    for top, right in rows:
        y0 = sy(top)
        y1 = sy(top + 0.075)
        x0 = sx(0.2)
        x1 = sx(right)
        rr = W * 0.038
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                if inside_round_rect(x + 0.5, y + 0.5, x0, y0, x1, y1, rr):
                    r, g, b, a = px[y][x]
                    px[y][x] = (*blend((r, g, b), TEAL_BRIGHT, 0.92), a)

    # ponto dourado de destaque
    cx, cy = sx(0.76), sy(0.74)
    halo = W * 0.11
    for y in range(max(0, int(cy - halo) - 2), min(S, int(cy + halo) + 3)):
        for x in range(max(0, int(cx - halo) - 2), min(S, int(cx + halo) + 3)):
            d = math.hypot(x - cx, y - cy)
            if d <= W * 0.075:
                r, g, b, a = px[y][x]
                px[y][x] = (*blend((r, g, b), GOLD, 0.98), a)
            elif d <= W * 0.11:
                r, g, b, a = px[y][x]
                px[y][x] = (*blend((r, g, b), GOLD, 0.25 * (1 - (d - W * 0.075) / (W * 0.035))), a)

    # downsample
    out = [[(0, 0, 0, 0) for _ in range(size)] for _ in range(size)]
    for y in range(size):
        for x in range(size):
            rs = gs = bs = as_ = 0
            for dy in range(ss):
                for dx in range(ss):
                    r, g, b, a = px[y * ss + dy][x * ss + dx]
                    rs += r * a
                    gs += g * a
                    bs += b * a
                    as_ += a
            if as_ == 0:
                out[y][x] = (0, 0, 0, 0)
            else:
                n = ss * ss
                out[y][x] = (rs // as_, gs // as_, bs // as_, as_ // n)
    return out


def write_png(path, pixels):
    height = len(pixels)
    width = len(pixels[0])
    raw = b"".join(b"\x00" + bytes(v for p in row for v in p) for row in pixels)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


targets = [
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("icon-maskable-512.png", 512, True),
    ("apple-touch-icon-180.png", 180, False),
    ("favicon-32.png", 32, False),
]

if __name__ == "__main__":
    for name, size, maskable in targets:
        pixels = render(size, maskable)
        write_png(os.path.join(OUT, name), pixels)
        print("gerado", name, size)
