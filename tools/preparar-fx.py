#!/usr/bin/env python3
"""Prepara um efeito de fogo gerado sobre fundo preto para o jogo: tira o preto (vira transparência), recorta, ajusta o tamanho
e salva em WebP. O jogo desenha o resultado com mistura aditiva ("lighter"), então o brilho do fogo soma com o chão.

Uso: python3 tools/preparar-fx.py entrada.png saida.webp TIPO

  jato   sopro: a ponta fica no meio da borda esquerda (é ali que fica a boca do dragão); 1024 px de largura
  onda   pancada vista de cima: quadrado centrado no círculo; 640 px
  garra  marcas de garra: quadrado centrado; 512 px
  elipse círculo visto de cima em perspectiva (mais largo que alto): recorte justo, 640 px de largura, proporção mantida
  faixa  faixa/rastro horizontal: recorte justo, 1024 px de largura, proporção mantida
  elipse círculo visto de cima em perspectiva (mais largo que alto): recorte justo, 640 px de largura, proporção mantida
  faixa  faixa/rastro horizontal: recorte justo, 1024 px de largura, proporção mantida

Depois de salvar, imprime as medidas que fx.js usa (FXMETA). Precisa de Pillow e numpy."""
import sys
import numpy as np
from PIL import Image

src, dst, kind = sys.argv[1], sys.argv[2], sys.argv[3]
if kind not in ('jato', 'onda', 'garra', 'elipse', 'faixa'):
    sys.exit('TIPO deve ser jato, onda, garra, elipse ou faixa')
rgb = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255.0
h, w, _ = rgb.shape

# nível do preto = brilho do fundo nas bordas (o fundo nem sempre é preto puro: a onda vem em marrom-escuro)
edge = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]).max(axis=1)
bp = float(np.percentile(edge, 96)) + 0.025
lv = np.clip((rgb - bp) / (1.0 - bp), 0.0, 1.0)
alpha = lv.max(axis=2)
alpha = np.clip(alpha ** 0.8 * 1.15, 0.0, 1.0)          # um pouco mais sólido: chamas finas não somem
col = np.where(alpha[..., None] > 0.004, lv / np.maximum(lv.max(axis=2, keepdims=True), 1e-4), 0.0)  # cor sem multiplicar pelo alfa
out = np.dstack([col, alpha])

ys, xs = np.where(alpha > 0.06)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
meta = {}
if kind == 'jato':
    x0 = max(0, x0 - 4)
    # ponta: média vertical dos pontos fortes nas colunas da esquerda
    strip = alpha[:, x0:x0 + max(8, int((x1 - x0) * 0.04))]
    yy = np.where(strip > 0.35)[0]
    tip = float(yy.mean()) if len(yy) else (y0 + y1) / 2
    half = max(tip - y0, y1 - tip) + 6
    top, bot = int(round(tip - half)), int(round(tip + half))
    crop = np.zeros((bot - top, x1 - x0, 4), np.float32)
    ys0, ys1 = max(top, 0), min(bot, h)
    crop[ys0 - top:ys1 - top] = out[ys0:ys1, x0:x1]
    im = Image.fromarray((crop * 255).round().astype(np.uint8), 'RGBA')
    tw = 1024
    th = max(2, int(round(im.height * tw / im.width)))
    th += th % 2
    im = im.resize((tw, th), Image.LANCZOS)
    # altura da chama no fim do jato (último quinto): serve para casar o desenho com a largura do cone de dano
    a2 = np.asarray(im)[..., 3].astype(np.float32) / 255.0
    tail = a2[:, int(tw * 0.8):]
    rows = np.where(tail.max(axis=1) > 0.25)[0]
    meta = {'w': tw, 'h': th, 'tipY': th / 2, 'endH': int(rows.max() - rows.min()) if len(rows) else th}
elif kind in ('elipse', 'faixa'):
    pad = 6
    x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)
    im = Image.fromarray((out[y0:y1, x0:x1] * 255).round().astype(np.uint8), 'RGBA')
    tw = 640 if kind == 'elipse' else 1024
    th = max(2, int(round(im.height * tw / im.width)))
    im = im.resize((tw, th), Image.LANCZOS)
    meta = {'w': tw, 'h': th}
elif kind in ('elipse', 'faixa'):
    pad = 6
    x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)
    im = Image.fromarray((out[y0:y1, x0:x1] * 255).round().astype(np.uint8), 'RGBA')
    tw = 640 if kind == 'elipse' else 1024
    th = max(2, int(round(im.height * tw / im.width)))
    im = im.resize((tw, th), Image.LANCZOS)
    meta = {'w': tw, 'h': th}
else:
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half = max(x1 - x0, y1 - y0) / 2 + 6
    size = int(round(half * 2))
    crop = np.zeros((size, size, 4), np.float32)
    sx0, sy0 = int(round(cx - half)), int(round(cy - half))
    ax0, ay0, ax1, ay1 = max(sx0, 0), max(sy0, 0), min(sx0 + size, w), min(sy0 + size, h)
    crop[ay0 - sy0:ay1 - sy0, ax0 - sx0:ax1 - sx0] = out[ay0:ay1, ax0:ax1]
    im = Image.fromarray((crop * 255).round().astype(np.uint8), 'RGBA')
    tw = 640 if kind == 'onda' else 512
    im = im.resize((tw, tw), Image.LANCZOS)
    meta = {'w': tw, 'h': tw}
    if kind == 'onda':
        # raio da borda do anel de fogo (onde o brilho médio cai a 25% do pico), em fração da largura
        a2 = np.asarray(im).astype(np.float32) / 255.0
        lum = a2[..., 3]
        yy, xx = np.mgrid[0:tw, 0:tw]
        rr = np.hypot(xx - tw / 2, yy - tw / 2)
        prof = np.array([lum[(rr >= r) & (rr < r + 2)].mean() for r in range(0, tw // 2, 2)])
        pk = int(prof.argmax())
        out_i = pk
        while out_i < len(prof) - 1 and prof[out_i] > prof[pk] * 0.25:
            out_i += 1
        meta['ring'] = round((out_i * 2) / tw, 3)

im.save(dst, 'WEBP', quality=84, method=6)
import os
print(dst, os.path.getsize(dst) // 1024, 'KB', meta)
