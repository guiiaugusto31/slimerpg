#!/usr/bin/env python3
"""Recorta o fundo cinza liso dos dragões do Canva, amplia e salva PNG com transparência.
Uso: python3 recortar.py entrada.png saida.png [tamanho_final]"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, dst = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 512

im = Image.open(src).convert('RGB')
# amplia primeiro (Lanczos) para as bordas ficarem suaves
big = im.resize((size, size), Image.LANCZOS)
a = np.asarray(big).astype(np.float32)

# cor do fundo = mediana das bordas
edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
bg = np.median(edge, axis=0)
dist = np.sqrt(((a - bg) ** 2).sum(axis=2))

T0, T1 = 14.0, 40.0          # abaixo de T0 = fundo; acima de T1 = opaco
cand = dist < T1
lab, n = ndi.label(cand)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bgmask = np.isin(lab, list(border))
# buracos fechados (furos nas asas) com a cor do fundo também viram transparência
sizes = ndi.sum(cand, lab, index=np.arange(1, n + 1))
for i, s in enumerate(sizes, start=1):
    if i not in border and s >= 20:
        bgmask |= (lab == i)

alpha = np.ones(dist.shape, np.float32)
# fundo conectado às bordas fica transparente; a franja de transição ganha alfa suave
soft = np.clip((dist - T0) / (T1 - T0), 0, 1)
alpha[bgmask] = soft[bgmask]
# pixels de dentro do fundo mas na franja (vizinhos do fundo) também suavizam
near = ndi.binary_dilation(bgmask, iterations=2) & ~bgmask
alpha[near] = np.minimum(1.0, 0.35 + soft[near] * 1.3)
alpha = ndi.gaussian_filter(alpha, 0.6)
alpha[bgmask & (soft < 0.02)] = 0

# tira o tom de cinza que sobra na franja: puxa a cor para longe do fundo
rgb = a.copy()
fr = (alpha > 0) & (alpha < 0.98)
k = np.clip(alpha[fr], 0.15, 1.0)[:, None]
rgb[fr] = np.clip((a[fr] - (1 - k) * bg) / k, 0, 255)

out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
img = Image.fromarray(out, 'RGBA')
bbox = img.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
print(dst, 'bbox', bbox, 'bg', bg)
img.save(dst)
