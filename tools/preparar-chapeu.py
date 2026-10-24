#!/usr/bin/env python3
"""Recorta o fundo magenta liso de um chapéu gerado por IA e salva em webp com transparência.
uso: preparar-chapeu.py entrada.jpg saida.webp [largura_max=512]"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, dst = sys.argv[1], sys.argv[2]
mx = int(sys.argv[3]) if len(sys.argv) > 3 else 512
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
h, w, _ = im.shape
edge = np.concatenate([im[0], im[-1], im[:, 0], im[:, -1]])
bg = np.median(edge, axis=0)                       # cor do fundo (magenta)
R, G, B = im[..., 0], im[..., 1], im[..., 2]
k = np.minimum(R, B) - G                           # "quanto magenta" é o pixel
kbg = float(np.median(np.minimum(edge[:, 0], edge[:, 2]) - edge[:, 1]))
a = np.clip(1 - (k - 55) / (kbg * 0.82 - 55), 0, 1)  # 1 = chapéu, 0 = fundo
# só fundo ligado às bordas (miolo magenta da coroa de flores também é fundo: ele é aberto)
a = ndimage.gaussian_filter(a, 0.6) if False else a
# remove ilhas pequenas (ruído do jpeg)
lab, n = ndimage.label(a > 0.5)
if n:
    sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 400])
    a = np.where(keep | ndimage.binary_dilation(keep, iterations=6) & (a > 0.02), a, 0)
# tira o magenta que sobrou nas bordas (mistura com o fundo): desfaz a mistura
out = im.copy()
m = (a > 0) & (a < 1)
for c in range(3):
    ch = (im[..., c] - (1 - a) * bg[c]) / np.maximum(a, 1e-3)
    out[..., c] = np.where(m, ch, im[..., c])
out = np.clip(out, 0, 255)
# resto de magenta nos pixels quase opacos de borda: puxa para o verde
rim = ndimage.binary_dilation(a < 0.5, iterations=3) & (a > 0)
sp = np.maximum(0, np.minimum(out[..., 0], out[..., 2]) - out[..., 1]) * 0.7
for c in (0, 2):
    out[..., c] = np.where(rim & (k > 25), out[..., c] - sp, out[..., c])
out = np.clip(out, 0, 255)
rgba = np.dstack([out, a * 255]).astype(np.uint8)
img = Image.fromarray(rgba, 'RGBA')
bb = img.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
img = img.crop(bb)
if img.width > mx:
    img = img.resize((mx, round(img.height * mx / img.width)), Image.LANCZOS)
img.save(dst, 'WEBP', quality=92, method=6)
print(dst, img.size)
