#!/usr/bin/env python3
"""Recorta o ícone de uma arma ou roupa (fundo cinza liso), deixa só o objeto com transparência e reduz.
Uso: python3 tools/recortar-icone.py entrada.jpg saida.png [lado_maximo=256] [tolerancia=34] [halo]
("halo" também apaga um brilho claro e fino ao redor do objeto, como o anel dos sinos)

- Parte das bordas e apaga o que parece com o cinza do fundo (por região, então o aço cinza do objeto não some).
- Miolos grandes de fundo (dentro do arco ou do chicote) também somem; a borda fica suave.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, dst = sys.argv[1], sys.argv[2]
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 256
tol = float(sys.argv[4]) if len(sys.argv) > 4 else 34
halo = 'halo' in sys.argv[5:]

im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32)
h, w = a.shape[:2]

# fundo = degradê suave: estima por região (mediana das bordas, por canto) e interpola
def corner_med(ys, xs):
    return np.median(a[ys, xs].reshape(-1, 3), axis=0)
k = max(6, w // 30)
tl = corner_med(slice(0, k), slice(0, k)); tr = corner_med(slice(0, k), slice(w - k, w))
bl = corner_med(slice(h - k, h), slice(0, k)); br = corner_med(slice(h - k, h), slice(w - k, w))
yy, xx = np.mgrid[0:h, 0:w]
fx, fy = (xx / (w - 1))[..., None], (yy / (h - 1))[..., None]
bg = (tl * (1 - fx) * (1 - fy) + tr * fx * (1 - fy) + bl * (1 - fx) * fy + br * fx * fy)
dist = np.sqrt(((a - bg) ** 2).sum(axis=2))

chroma = a.max(axis=2) - a.min(axis=2)
cand = dist < tol

# fundo = o que é parecido com o cinza e está ligado às bordas, ou um miolo grande e liso de fundo (dentro do arco, do chicote, do halo)
lab, n = ndi.label(cand)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
outside = np.isin(lab, list(border))
# miolos de fundo (dentro do arco, do chicote ou do halo): só o que é quase exatamente a cor do fundo
pure = dist < 13
lab_p, n_p = ndi.label(pure)
if n_p:
    areas = ndi.sum(pure, lab_p, index=np.arange(1, n_p + 1))
    for i, ar in enumerate(areas, start=1):
        if ar >= 420:
            outside |= (lab_p == i)

solid = ~outside
lab2, n2 = ndi.label(solid)
sizes = ndi.sum(solid, lab2, index=np.arange(1, n2 + 1))
keep = np.zeros_like(solid)
mx = sizes.max() if len(sizes) else 0
for i, s in enumerate(sizes, start=1):
    if s >= max(60, mx * 0.02):
        keep |= (lab2 == i)
# buracos pequenos dentro do objeto (brilhos) são preenchidos; os grandes (que já viraram fundo) ficam vazados
holes = ndi.binary_fill_holes(keep) & ~keep
hl, hn = ndi.label(holes)
for i in range(1, hn + 1):
    m = hl == i
    if m.sum() < 420:
        keep |= m
if halo:
    ring = (a.mean(axis=2) > 210) & (chroma < 30) & keep
    keep &= ~ring
keep = ndi.binary_opening(keep, iterations=1)
if halo:
    lab3, n3 = ndi.label(keep)
    if n3:
        sz3 = ndi.sum(keep, lab3, index=np.arange(1, n3 + 1))
        keep = lab3 == (1 + int(np.argmax(sz3)))

core = ndi.binary_erosion(keep, iterations=1)
alpha = ndi.gaussian_filter(core.astype(np.float32), 0.9)
alpha = np.clip((alpha - 0.2) / 0.6, 0, 1)

rgb = a.copy()
dist_in, idx = ndi.distance_transform_edt(~core, return_indices=True)
fr = (alpha > 0) & (dist_in > 0)
rgb[fr] = a[idx[0][fr], idx[1][fr]]

out = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')
bb = out.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox()
pad = 3
bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(w, bb[2] + pad), min(h, bb[3] + pad))
out = out.crop(bb)
if max(out.size) > limit:
    s = limit / max(out.size)
    out = out.resize((max(1, round(out.width * s)), max(1, round(out.height * s))), Image.LANCZOS)
out.save(dst, optimize=True)
print(dst, out.size)
