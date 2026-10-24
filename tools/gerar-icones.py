#!/usr/bin/env python3
"""Gera os ícones do app (PWA) a partir do desenho do slime. Uso: python3 tools/gerar-icones.py"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import os

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src = Image.open(os.path.join(root, 'public/img/slime_idle.png')).convert('RGBA')

# o slime do desenho é azul: gira o matiz para o verde do jogo
hsv = np.array(src.convert('RGB').convert('HSV')).astype(np.int16)
graus = hsv[..., 0].astype(float) * 360 / 255
azul = np.clip(1 - np.abs(graus - 205) / 60, 0, 1)  # só o que é azul vira verde: as bochechas rosadas e o resto ficam como estão
hsv[..., 0] = (hsv[..., 0] + np.round(azul * ((105 - 205) / 360 * 255))) % 256
rgb = Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB')
slime = Image.merge('RGBA', (*rgb.split(), src.split()[3]))

def fundo(n):
    # luz suave no centro de um verde-musgo bem escuro (as cores da tela inicial do jogo)
    y, x = np.mgrid[0:n, 0:n]
    d = np.hypot(x - n * 0.5, y - n * 0.46) / (n * 0.62)
    d = np.clip(d, 0, 1)[..., None]
    c0 = np.array([58, 96, 54]); c1 = np.array([11, 20, 15])
    return Image.fromarray((c0 * (1 - d) + c1 * d).astype(np.uint8), 'RGB').convert('RGBA')

def icone(n, ocupa):
    im = fundo(n)
    h = int(n * ocupa); w = int(h * slime.width / slime.height)
    s = slime.resize((w, h), Image.LANCZOS)
    sombra = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    a = s.split()[3].point(lambda v: int(v * 0.45))
    sh = Image.new('RGBA', s.size, (0, 0, 0, 255)); sh.putalpha(a)
    sombra.paste(sh, ((n - w) // 2, (n - h) // 2 + int(n * 0.03) + int(n * 0.01)))
    sombra = sombra.filter(ImageFilter.GaussianBlur(n * 0.012))
    im.alpha_composite(sombra)
    im.alpha_composite(s, ((n - w) // 2, (n - h) // 2 + int(n * 0.015)))
    return im.convert('RGB')

out = os.path.join(root, 'public/icons')
os.makedirs(out, exist_ok=True)
base = icone(1024, 0.78)
base.resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'icon-512.png'), optimize=True)
base.resize((192, 192), Image.LANCZOS).save(os.path.join(out, 'icon-192.png'), optimize=True)
icone(1024, 0.80).resize((180, 180), Image.LANCZOS).save(os.path.join(out, 'apple-touch-icon.png'), optimize=True)
# maskable: o sistema recorta até 20% das bordas, então o slime fica na zona segura (centro, 60%)
icone(1024, 0.58).resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'icon-maskable-512.png'), optimize=True)
print('ok', os.listdir(out))
