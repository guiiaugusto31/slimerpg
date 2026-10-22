#!/usr/bin/env python3
"""Recorta os slimes desenhados no Higgsfield: tira o fundo cinza, a sombra do chão e deixa o contorno limpo.
Uso: python3 tools/recortar-slime.py entrada.jpg saida.png [escala] [lado_maximo]

- escala: multiplicador aplicado à imagem inteira ANTES do recorte. Use o MESMO valor nas três poses
  (parado, atacando, atingido) para o slime manter o tamanho quando troca de pose.
- A sombra do chão (cinza neutro, mais escuro que o fundo) é removida; o contorno escuro e o brilho branco ficam.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, dst = sys.argv[1], sys.argv[2]
scale = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
limit = int(sys.argv[4]) if len(sys.argv) > 4 else 0

im = Image.open(src).convert('RGB')
if scale != 1.0:
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)
h, w = a.shape[:2]

R, G, B = a[..., 0], a[..., 1], a[..., 2]
lum = 0.299 * R + 0.587 * G + 0.114 * B
chroma = a.max(axis=2) - a.min(axis=2)

edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
bg = np.median(edge, axis=0)
bgdist = np.sqrt(((a - bg) ** 2).sum(axis=2))

# "chão" = cinza neutro (fundo e sombra) que não é o contorno escuro nem o corpo azul
neutral = (chroma < 26) & (lum > 62)
ground = neutral | (bgdist < 30)
# sombra azulada/arroxeada fraca (a do slime achatado): pouco saturada e bem mais clara que o contorno
ground |= (chroma < 60) & (lum > 78) & (B - R < 70) & (G - R < 30) & (bgdist < 90) & (lum < bg.mean() - 8)

lab, n = ndi.label(ground)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
outside = np.isin(lab, list(border))

# o que sobra = slime. Tira ilhas minúsculas soltas (ruído) e preenche buracos internos do slime
solid = ~outside
lab2, n2 = ndi.label(solid)
sizes = ndi.sum(solid, lab2, index=np.arange(1, n2 + 1))
keep = np.zeros_like(solid)
for i, s in enumerate(sizes, start=1):
    if s >= 40:
        keep |= (lab2 == i)
keep = ndi.binary_fill_holes(keep)

# alfa: erode 1 px (some a franja cinza do contorno) e suaviza a borda
core = ndi.binary_erosion(keep, iterations=1)
alpha = ndi.gaussian_filter(core.astype(np.float32), 0.8)
alpha = np.clip((alpha - 0.15) / 0.7, 0, 1)

# cor da franja: puxa do interior para não ficar cinza
rgb = a.copy()
dist_in, idx = ndi.distance_transform_edt(~core, return_indices=True)
fr = (alpha > 0) & (dist_in > 0)
rgb[fr] = a[idx[0][fr], idx[1][fr]]

out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
img = Image.fromarray(out, 'RGBA')
bb = img.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
pad = 6
bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(w, bb[2] + pad), min(h, bb[3] + pad))
img = img.crop(bb)
if limit and max(img.size) > limit:
    k = limit / max(img.size)
    img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
img.save(dst)
print(dst, img.size, 'bbox', bb, 'fundo', bg.round(0))
