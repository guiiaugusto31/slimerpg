// Arte do jogo: desenhos procedurais de reserva + carregamento opcional das imagens de public/img/.
// Qualquer imagem colocada em public/img/ com o nome certo substitui o desenho correspondente (veja IMAGENS.md).
(function () {
  'use strict';
  var GD = module.exports, W = GD.WORLD, FAM = GD.FAMILIES, ITEMS = GD.ITEMS;
  var IMG = {};

  /* ---------- cores ---------- */
  function hex2rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(c, d, a) {
    var A = hex2rgb(c), B = hex2rgb(d);
    return 'rgb(' + A.map(function (v, i) { return Math.round(v + (B[i] - v) * a); }).join(',') + ')';
  }
  function light(c, a) { return mix(c, '#ffffff', a); }
  function dark(c, a) { return mix(c, '#000000', a); }
  function rgba(c, a) { return 'rgba(' + hex2rgb(c).join(',') + ',' + a + ')'; }
  function rng(seed) { // mulberry32
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- carregamento das imagens opcionais ---------- */
  function loadImg(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = rej;
      im.src = src;
    });
  }
  // Remove um fundo liso (cinza/branco) ligado às bordas da imagem e reduz para 256 px.
  function prepare(base, im) {
    if (base === 'mapa' || /^fx_|^hat_/.test(base)) return im; // o mapa e os efeitos de fogo (já preparados com transparência) ficam como vieram
    var max = /^mob_dragao/.test(base) ? 512 : /^slime_/.test(base) ? 384 : 256, sc = Math.min(1, max / Math.max(im.width, im.height)); // o dragão é enorme: guarda mais resolução
    var w = Math.max(1, Math.round(im.width * sc)), h = Math.max(1, Math.round(im.height * sc));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0, w, h);
    var d;
    try { d = g.getImageData(0, 0, w, h); } catch (e) { return c; }
    var a = d.data, px = function (x, y) { return (y * w + x) * 4; };
    var corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
    for (var i = 0; i < 4; i++) if (a[corners[i] + 3] < 250) return c; // já tem transparência
    var r = 0, gg = 0, b = 0;
    corners.forEach(function (k) { r += a[k]; gg += a[k + 1]; b += a[k + 2]; });
    r /= 4; gg /= 4; b /= 4;
    var spread = 0;
    corners.forEach(function (k) { spread = Math.max(spread, Math.abs(a[k] - r) + Math.abs(a[k + 1] - gg) + Math.abs(a[k + 2] - b)); });
    if (spread > 60) return c; // fundo não é liso
    var tol = 42, tol2 = tol * tol;
    function dist2(k) { var dr = a[k] - r, dg = a[k + 1] - gg, db = a[k + 2] - b; return dr * dr + dg * dg + db * db; }
    var seen = new Uint8Array(w * h), stack = [];
    function push(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      var k = y * w + x;
      if (seen[k]) return;
      seen[k] = 1;
      if (dist2(k * 4) < tol2) { a[k * 4 + 3] = 0; stack.push(k); }
    }
    var x, y;
    for (x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      var k = stack.pop(), kx = k % w, ky = (k / w) | 0;
      push(kx + 1, ky); push(kx - 1, ky); push(kx, ky + 1); push(kx, ky - 1);
    }
    // tira o contorno claro que sobra junto ao fundo removido
    var halo = (tol * 1.9) * (tol * 1.9), kill = [];
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      var q = (y * w + x) * 4;
      if (a[q + 3] === 0) continue;
      if ((a[q - 1] === 0 || a[q + 7] === 0 || a[q - w * 4 + 3] === 0 || a[q + w * 4 + 3] === 0) && dist2(q) < halo) kill.push(q);
    }
    kill.forEach(function (q) { a[q + 3] = 0; });
    g.putImageData(d, 0, 0);
    return c;
  }
  function load() {
    return fetch('/img-list').then(function (r) { return r.json(); }).catch(function () { return []; }).then(function (list) {
      var by = {};
      list.forEach(function (f) { var m = /^(.+)\.(png|jpe?g|webp)$/i.exec(f); if (m) by[m[1]] = f; });
      return Promise.all(Object.keys(by).map(function (base) {
        return loadImg('img/' + by[base]).then(function (im) { IMG[base] = prepare(base, im); }).catch(function () {});
      }));
    }).then(function () {
      iconCache = {}; tiles = {}; tileKeys = []; tintCache = {}; dragonCache = {}; SLIME_META = {}; clothCache = {}; geoCache = {};
      if (IMG.slime_idle) slimeRef(IMG.slime_idle);
      Object.keys(IMG).forEach(function (k) { if (/^slime_/.test(k)) SLIME_META[k] = slimeMeta(IMG[k]); });
      return Object.keys(IMG);
    });
  }

  /* ---------- slime ---------- */
  // O slime vem do desenho feito no Higgsfield (slime_idle, slime_attack, slime_hurt) e é pintado com a cor do jogador:
  // o corpo azul vira um degradê da cor escolhida, o contorno e os olhos viram uma versão bem escura dela, e o brilho
  // branco e a bochecha rosada ficam como estão. Sem as imagens, o desenho de reserva (mais abaixo) é usado.
  var tintCache = {}, SLIME_META = {}, SLIME_REF = { lo: 70, mid: 122, hi: 185 };
  var SLIME_EYES = [[0.417, 0.344], [0.753, 0.325]], SLIME_EYE_R = [0.07, 0.08]; // posição e raio dos olhos no desenho parado (fração do tamanho)
  var SLIME_W = 2.3, SLIME_SQUAT = 0.92; // largura do desenho em múltiplos de r, e quanto ele é achatado (visto de cima)
  var SLIME_TOP = 1.68; // quanto o slime ilustrado sobe acima do centro (em r): a barra de vida e o nome ficam acima disso

  function cnv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  // Onde o slime encosta no chão (ponto de apoio) e o quanto ele ocupa, medidos no próprio desenho.
  function slimeMeta(c) {
    var w = c.width, h = c.height, d;
    try { d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data; } catch (e) { return { ax: 0.5, ay: 1 }; }
    var bottom = h - 1, y, x, n;
    for (y = h - 1; y >= 0; y--) { n = 0; for (x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) n++; if (n >= Math.max(4, w * 0.04)) { bottom = y; break; } }
    var sx = 0, cnt = 0, y0 = Math.max(0, Math.round(bottom - h * 0.3));
    for (y = y0; y <= bottom; y++) for (x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { sx += x; cnt++; }
    return { ax: cnt ? sx / cnt / w : 0.5, ay: (bottom + 1) / h };
  }
  // Referências de luz do corpo azul do desenho parado (mediana e extremos), usadas para pintar todas as poses do mesmo jeito.
  function slimeRef(c) {
    var w = c.width, h = c.height, d;
    try { d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data; } catch (e) { return; }
    var v = [], i;
    for (i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i + 2] - d[i] > 40) v.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    if (v.length < 200) return;
    v.sort(function (a, b) { return a - b; });
    SLIME_REF = { lo: v[Math.floor(v.length * 0.05)], mid: v[Math.floor(v.length * 0.5)], hi: v[Math.floor(v.length * 0.95)] };
  }
  function paintSlime(src, color) {
    var c = cnv(src.width, src.height), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    var im = g.getImageData(0, 0, c.width, c.height), p = im.data, T = hex2rgb(color), R = SLIME_REF, i;
    var ink = [T[0] * 0.15, T[1] * 0.15, T[2] * 0.15];
    for (i = 0; i < p.length; i += 4) {
      if (p[i + 3] === 0) continue;
      var r = p[i], gg = p[i + 1], b = p[i + 2], sat = Math.max(r, gg, b) - Math.min(r, gg, b), lum = 0.299 * r + 0.587 * gg + 0.114 * b;
      var d = lum >= R.mid ? (lum - R.mid) / (R.hi - R.mid) : (lum - R.mid) / (R.mid - R.lo), k, o0, o1, o2;
      if (d >= 0) { k = Math.min(1.1, d) * 0.86; o0 = T[0] + (255 - T[0]) * k; o1 = T[1] + (255 - T[1]) * k; o2 = T[2] + (255 - T[2]) * k; }
      else { k = Math.min(1.25, -d) * 0.6; o0 = T[0] * (1 - k); o1 = T[1] * (1 - k); o2 = T[2] * (1 - k); }
      var wb = Math.max(0, Math.min(1, (sat - 20) / 50));            // corpo azul (o brilho branco e o contorno preto quase não têm cor)
      var wi = Math.max(0, Math.min(1, (96 - lum) / 46));            // contorno e olhos escuros
      var pink = (r - b > 24 && r - gg > 28) ? 0.85 : 0;             // bochechas e língua ficam rosadas
      var q0 = r + (o0 - r) * wb, q1 = gg + (o1 - gg) * wb, q2 = b + (o2 - b) * wb;
      q0 += (ink[0] - q0) * wi; q1 += (ink[1] - q1) * wi; q2 += (ink[2] - q2) * wi;
      p[i] = q0 + (r - q0) * pink; p[i + 1] = q1 + (gg - q1) * pink; p[i + 2] = q2 + (b - q2) * pink;
    }
    g.putImageData(im, 0, 0);
    return c;
  }
  function slimeTinted(base, color) {
    var key = 't' + base + color;
    return tintCache[key] || (tintCache[key] = paintSlime(IMG[base], color));
  }
  // Silhueta de uma cor só (o clarão branco quando leva dano), guardada para não refazer a cada quadro.
  function slimeFlat(base, color, rgbStr) {
    var key = 'f' + base + color + rgbStr;
    if (tintCache[key]) return tintCache[key];
    var src = slimeTinted(base, color), c = cnv(src.width, src.height), g = c.getContext('2d');
    g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = rgbStr; g.fillRect(0, 0, c.width, c.height);
    return (tintCache[key] = c);
  }
  // Slime piscando: apaga os olhos com a cor do corpo e desenha dois risquinhos fechados.
  function slimeBlink(color) {
    var key = 'b' + color;
    if (tintCache[key]) return tintCache[key];
    var src = slimeTinted('slime_idle', color), w = src.width, h = src.height, c = cnv(w, h), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    var T = hex2rgb(color), ink = 'rgb(' + Math.round(T[0] * 0.15) + ',' + Math.round(T[1] * 0.15) + ',' + Math.round(T[2] * 0.15) + ')';
    SLIME_EYES.forEach(function (e, i) {
      var cx = e[0] * w, cy = e[1] * h, rx = SLIME_EYE_R[0] * w, ry = SLIME_EYE_R[1] * h, px = [0, 0, 0, 255];
      try { px = src.getContext('2d').getImageData(Math.round(cx), Math.round(cy - ry * 1.9), 1, 1).data; } catch (x) { /* cor padrão */ }
      var col = 'rgb(' + px[0] + ',' + px[1] + ',' + px[2] + ')', col0 = 'rgba(' + px[0] + ',' + px[1] + ',' + px[2] + ',0)';
      var gr = g.createRadialGradient(cx, cy, 0, cx, cy, rx * 1.45);
      gr.addColorStop(0, col); gr.addColorStop(0.72, col); gr.addColorStop(1, col0);
      g.fillStyle = gr; g.save(); g.translate(cx, cy); g.scale(1, ry / rx); g.translate(-cx, -cy);
      g.beginPath(); g.arc(cx, cy, rx * 1.45, 0, 7); g.fill(); g.restore();
      g.strokeStyle = ink; g.lineWidth = Math.max(2, w * 0.022); g.lineCap = 'round';
      g.beginPath(); g.arc(cx, cy - ry * 0.35, rx * 0.95, Math.PI * 0.18, Math.PI * 0.82); g.stroke();
    });
    return (tintCache[key] = c);
  }
  // Slime zangado: o desenho parado com sobrancelhas inclinadas e a boca aberta (usado no golpe, já que os bracinhos
  // que seguram a arma são desenhados à parte e o desenho "atacando" tem os próprios braços).
  var SLIME_MOUTH = [0.606, 0.413], SLIME_BROWS = [[0.31, 0.232, 0.489, 0.284], [0.684, 0.274, 0.877, 0.211]];
  function slimeAngry(color) {
    var key = 'g' + color;
    if (tintCache[key]) return tintCache[key];
    var src = slimeTinted('slime_idle', color), w = src.width, h = src.height, c = cnv(w, h), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    var T = hex2rgb(color), ink = 'rgb(' + Math.round(T[0] * 0.15) + ',' + Math.round(T[1] * 0.15) + ',' + Math.round(T[2] * 0.15) + ')';
    var mx = SLIME_MOUTH[0] * w, my = SLIME_MOUTH[1] * h, px = [0, 0, 0, 255];
    try { px = src.getContext('2d').getImageData(Math.round(mx), Math.round(my + h * 0.07), 1, 1).data; } catch (x) { /* cor padrão */ }
    var col = 'rgb(' + px[0] + ',' + px[1] + ',' + px[2] + ')', col0 = 'rgba(' + px[0] + ',' + px[1] + ',' + px[2] + ',0)';
    g.save(); g.translate(mx, my); g.scale(1, 0.46);
    var gr = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.12); gr.addColorStop(0, col); gr.addColorStop(0.7, col); gr.addColorStop(1, col0);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, w * 0.12, 0, 7); g.fill(); g.restore();
    var cx = mx, cy = my + h * 0.014, rx = w * 0.05, ry = h * 0.043;
    g.fillStyle = ink; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.fill();
    g.fillStyle = 'rgb(222,112,118)'; g.beginPath(); g.ellipse(cx, cy + ry * 0.45, rx * 0.66, ry * 0.5, 0, 0, Math.PI); g.fill();
    g.strokeStyle = ink; g.lineWidth = Math.max(3, w * 0.034); g.lineCap = 'round';
    SLIME_BROWS.forEach(function (b) { g.beginPath(); g.moveTo(b[0] * w, b[1] * h); g.lineTo(b[2] * w, b[3] * h); g.stroke(); });
    return (tintCache[key] = c);
  }
  function slimeOk() { return !!IMG.slime_idle; }
  // pose: 'idle' | 'attack' | 'hurt'. Mantido para quem só quer o desenho pintado.
  function slimeSprite(color, mode) {
    var base = IMG['slime_' + mode] ? 'slime_' + mode : (IMG.slime_idle ? 'slime_idle' : null);
    return base ? slimeTinted(base, color) : null;
  }
  /* Desenha o slime. o (opcional) controla a animação:
     pose ('idle' | 'attack' | 'hurt'), flip (espelha o desenho), ox/oy (deslocamento, ex.: pancada para trás ou investida),
     sx/sy (achatar e esticar), lean (inclinação em radianos), hop (altura do pulo em px), flash (0 a 1, clarão branco), alpha,
     cloth (id do peitoral equipado, desenhado no corpo), ownArms (usa o desenho "atacando" com os braços dele). */
  function drawSlime(g, x, y, r, color, t, hurt, blink, o) {
    o = o || {};
    var skin = o.skin || null;
    var pose = o.pose || (hurt ? 'hurt' : 'idle'), angry = pose === 'attack' && !!IMG.slime_idle && !o.ownArms;
    var base = angry ? 'slime_idle' : (IMG['slime_' + pose] ? 'slime_' + pose : (IMG.slime_idle ? 'slime_idle' : null));
    var breath = (o.sy === undefined) ? 1 + Math.sin(t * 3.4) * 0.035 : 1;
    var sx = (o.sx === undefined ? 1 / breath : o.sx), sy = (o.sy === undefined ? breath : o.sy);
    var ox = o.ox || 0, oy = o.oy || 0, hop = o.hop || 0, sh = Math.max(0.55, 1 - hop / (r * 1.6));
    g.save();
    if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
    var gx = x + ox, gy = y + r * 0.78 + oy; // ponto no chão
    g.fillStyle = 'rgba(0,0,0,' + (0.36 * sh) + ')';
    g.beginPath(); g.ellipse(gx, gy, r * 1.08 * sh * (0.8 + 0.2 * sx), r * 0.3 * sh, 0, 0, 7); g.fill();
    if (base) {
      var sp = angry ? slimeAngry(color) : (pose === 'idle' && blink && !o.flash) ? slimeBlink(color) : slimeTinted(base, color), M = SLIME_META[base] || { ax: 0.5, ay: 1 };
      var k = r * SLIME_W / IMG.slime_idle.width, w = sp.width * k, h = sp.height * k * SLIME_SQUAT;
      g.translate(gx, gy - hop); g.rotate(o.lean || 0); g.scale((o.flip && !angry ? -1 : 1) * sx, sy);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(sp, -M.ax * w, -M.ay * h, w, h);
      if (o.cloth) drawCloth(g, o.cloth, base, -M.ax * w, -M.ay * h, w / sp.width, h / sp.height, false);
      if (skin && skin.head && pose !== 'hurt' && !(pose === 'attack' && !angry)) { // chapéu (não aparece na pose de dano nem no desenho "atacando" com braços próprios)
        g.save(); g.translate(-M.ax * w, -M.ay * h); g.scale(w, h); drawAccessories(g, skin, base, t, w, h); g.restore();
      }
      if (o.flash > 0) {
        g.globalAlpha *= Math.min(0.85, o.flash); g.drawImage(slimeFlat(base, color, 'rgb(255,255,255)'), -M.ax * w, -M.ay * h, w, h);
        if (o.cloth) drawCloth(g, o.cloth, base, -M.ax * w, -M.ay * h, w / sp.width, h / sp.height, true);
      }
      g.restore();
      return;
    }
    // desenho de reserva (sem imagens): meia-esfera com brilho e olhos
    g.translate(x + ox, y + oy - hop); g.rotate(o.lean || 0); g.scale(sx, sy);
    var bw = r * 1.18, bh = r * 0.98;
    var grd = g.createRadialGradient(-bw * 0.3, -bh * 0.45, r * 0.1, 0, 0, bw * 1.25);
    grd.addColorStop(0, light(color, 0.5)); grd.addColorStop(0.55, color); grd.addColorStop(1, dark(color, 0.42));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-bw, r * 0.4);
    g.bezierCurveTo(-bw, -bh * 1.2, bw, -bh * 1.2, bw, r * 0.4);
    g.bezierCurveTo(bw * 0.9, r * 0.8, -bw * 0.9, r * 0.8, -bw, r * 0.4);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.lineWidth = Math.max(1, r * 0.07); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.beginPath(); g.ellipse(-bw * 0.38, -bh * 0.5, bw * 0.2, bh * 0.12, -0.55, 0, 7); g.fill();
    var ex = bw * 0.34, ey = -bh * 0.02, er = r * 0.15;
    if (pose === 'hurt' || blink) {
      g.strokeStyle = '#1b1410'; g.lineWidth = Math.max(1.5, r * 0.08); g.lineCap = 'round';
      g.beginPath(); g.moveTo(-ex - er, ey); g.lineTo(-ex + er, ey); g.moveTo(ex - er, ey); g.lineTo(ex + er, ey); g.stroke();
    } else {
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(-ex, ey, er, 0, 7); g.arc(ex, ey, er, 0, 7); g.fill();
      g.fillStyle = '#1b1410';
      g.beginPath(); g.arc(-ex + er * 0.15, ey + er * 0.1, er * 0.55, 0, 7); g.arc(ex + er * 0.15, ey + er * 0.1, er * 0.55, 0, 7); g.fill();
    }
    if (o.flash > 0) { g.globalAlpha *= Math.min(0.7, o.flash); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, bw, bh * 0.9, 0, 0, 7); g.fill(); }
    g.restore();
  }


  /* ---------- skins: chapéus (só visuais) ---------- */
  // Os chapéus são desenhados em coordenadas do desenho do slime (1 = o desenho todo), depois do corpo e da roupa, então acompanham
  // pulo, achatar, inclinação e golpe. Cada chapéu se apoia no contorno do topo do corpo (topProfile), medido no próprio desenho.
  function topProfile(base) { // y (fração) da primeira parte opaca em 33 colunas
    var key = 'P' + base;
    if (clothCache[key]) return clothCache[key];
    var src = IMG[base], w = src.width, h = src.height, c = cnv(w, h), g = c.getContext('2d', { willReadFrequently: true }), out = [], n, x, y, d;
    g.drawImage(src, 0, 0);
    try { d = g.getImageData(0, 0, w, h).data; } catch (e) { d = null; }
    for (n = 0; n <= 32; n++) {
      x = Math.min(w - 1, Math.round(n / 32 * (w - 1))); var top = 0.08;
      if (d) for (y = 0; y < h; y++) if (d[(y * w + x) * 4 + 3] > 60) { top = y / h; break; }
      out.push(top);
    }
    return (clothCache[key] = out);
  }
  function topAt(prof, fx) { var f = Math.max(0, Math.min(1, fx)) * 32, i = Math.min(31, Math.floor(f)), k = f - i; return prof[i] * (1 - k) + prof[i + 1] * k; }
  var SK_INK = 'rgba(22,14,10,0.92)', SK_LW = 0.017;
  function skOutline(g, w) { g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = SK_INK; g.lineWidth = w || SK_LW; g.stroke(); }
  function skShine(g, x, y, rx, ry, rot) { g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(x, y, rx, ry, rot || -0.5, 0, 7); g.fill(); }
  function skSparkle(g, x, y, rr, a, col) { // estrelinha de quatro pontas (mistura aditiva)
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = col.replace('A', a.toFixed(2));
    g.beginPath(); g.moveTo(x, y - rr * 1.7); g.lineTo(x + rr * 0.3, y - rr * 0.3); g.lineTo(x + rr * 1.7, y); g.lineTo(x + rr * 0.3, y + rr * 0.3);
    g.lineTo(x, y + rr * 1.7); g.lineTo(x - rr * 0.3, y + rr * 0.3); g.lineTo(x - rr * 1.7, y); g.lineTo(x - rr * 0.3, y - rr * 0.3); g.closePath(); g.fill(); g.restore();
  }
  function hatBase(g, prof, t, dx, lift, tilt) { // origem no topo da cabeça, com um balanço leve
    g.translate(0.5 + (dx || 0), topAt(prof, 0.5 + (dx || 0)) + (lift === undefined ? 0.05 : lift) + Math.sin(t * 3.4 + 0.8) * 0.005);
    g.rotate(tilt === undefined ? -0.08 : tilt);
  }
  var HATS = {
    cogumelo: function (g, prof, t) {
      g.save(); hatBase(g, prof, t, 0, 0.07, -0.1);
      var ex = 0.27;
      g.beginPath(); g.moveTo(-ex, 0); g.bezierCurveTo(-ex, -0.27, ex, -0.27, ex, 0); g.bezierCurveTo(ex * 0.5, 0.045, -ex * 0.5, 0.045, -ex, 0); g.closePath();
      var gr = g.createRadialGradient(-0.08, -0.14, 0.01, 0, -0.05, 0.3); gr.addColorStop(0, '#ff6b5a'); gr.addColorStop(0.6, '#d8352c'); gr.addColorStop(1, '#8c1d1d');
      g.fillStyle = gr; g.fill(); skOutline(g);
      g.fillStyle = '#fff4e0';
      [[-0.13, -0.1, 0.04, 0.032], [0.03, -0.17, 0.045, 0.036], [0.15, -0.08, 0.035, 0.03], [-0.02, -0.05, 0.026, 0.02]].forEach(function (s) { g.beginPath(); g.ellipse(s[0], s[1], s[2], s[3], 0, 0, 7); g.fill(); });
      skShine(g, -0.14, -0.17, 0.05, 0.02);
      g.restore();
    },
    marinheiro: function (g, prof, t) { // gorro branco com faixa azul e fitas
      g.save(); hatBase(g, prof, t, 0, 0.05, 0.05);
      var ex = 0.25;
      g.beginPath(); g.moveTo(-ex, 0); g.bezierCurveTo(-ex * 1.05, -0.2, ex * 1.05, -0.2, ex, 0); g.closePath(); // copa
      var gr = g.createLinearGradient(0, -0.18, 0, 0); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#cfd8e4');
      g.fillStyle = gr; g.fill(); skOutline(g);
      g.beginPath(); g.moveTo(-ex * 1.04, 0.005); g.lineTo(ex * 1.04, 0.005); g.lineTo(ex * 1.12, 0.055); g.quadraticCurveTo(0, 0.1, -ex * 1.12, 0.055); g.closePath(); // aba virada
      g.fillStyle = '#fafcff'; g.fill(); skOutline(g);
      g.beginPath(); g.moveTo(-ex * 1.0, -0.015); g.lineTo(ex * 1.0, -0.015); g.lineTo(ex * 1.03, 0.012); g.lineTo(-ex * 1.03, 0.012); g.closePath(); g.fillStyle = '#2f58b8'; g.fill();
      g.fillStyle = '#2f58b8'; g.strokeStyle = SK_INK; g.lineWidth = 0.012;
      [[-1, 0.4], [1, -0.3]].forEach(function (s) { g.beginPath(); g.moveTo(ex * 0.95 * s[0], 0.04); g.quadraticCurveTo(ex * 1.2 * s[0], 0.12, ex * (1.12 + s[1] * 0.2) * s[0], 0.2 + Math.sin(t * 3 + s[1]) * 0.012); g.lineTo(ex * (1.04 + s[1] * 0.2) * s[0], 0.2); g.quadraticCurveTo(ex * 1.05 * s[0], 0.1, ex * 0.85 * s[0], 0.045); g.closePath(); g.fill(); g.stroke(); });
      skShine(g, -0.1, -0.12, 0.06, 0.02);
      g.restore();
    },
    coroa: function (g, prof, t) {
      var pts = [0.22, 0.36, 0.5, 0.64, 0.78], cols = ['#ff8fb8', '#fff4d6', '#ffd34d', '#fff4d6', '#ff8fb8'], i;
      g.save();
      g.beginPath(); pts.forEach(function (x, k) { var y = topAt(prof, x) + 0.012; if (k) g.lineTo(x, y); else g.moveTo(x, y); });
      g.strokeStyle = '#2f7a3a'; g.lineWidth = 0.03; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
      g.strokeStyle = '#5fc062'; g.lineWidth = 0.018; g.stroke();
      for (i = 0; i < pts.length; i++) {
        var x = pts[i], y = topAt(prof, x) - 0.005, big = i === 2 ? 1.2 : 1, pr = 0.032 * big, a;
        for (a = 0; a < 5; a++) {
          var ang = a / 5 * 6.283 + i + Math.sin(t * 2 + i) * 0.05;
          g.beginPath(); g.ellipse(x + Math.cos(ang) * pr * 1.05, y + Math.sin(ang) * pr * 1.05, pr, pr * 0.78, ang, 0, 7);
          g.fillStyle = cols[i]; g.fill(); skOutline(g, 0.009);
        }
        g.fillStyle = i === 2 ? '#e0732a' : '#ffcf4a'; g.beginPath(); g.arc(x, y, pr * 0.78, 0, 7); g.fill(); skOutline(g, 0.008);
      }
      g.restore();
    },
    cartola: function (g, prof, t) {
      g.save(); hatBase(g, prof, t, 0, 0.045, -0.06);
      var hw = 0.17, ht = 0.27;
      g.beginPath(); g.moveTo(-hw, 0); g.lineTo(-hw * 0.94, -ht); g.quadraticCurveTo(0, -ht - 0.025, hw * 0.94, -ht); g.lineTo(hw, 0); g.closePath(); // copa
      var gr = g.createLinearGradient(-hw, 0, hw, 0); gr.addColorStop(0, '#3a3438'); gr.addColorStop(0.35, '#59525a'); gr.addColorStop(1, '#1d191c');
      g.fillStyle = gr; g.fill(); skOutline(g);
      g.beginPath(); g.moveTo(-hw, -0.045); g.lineTo(hw, -0.045); g.lineTo(hw * 0.99, -0.095); g.lineTo(-hw * 0.99, -0.095); g.closePath(); g.fillStyle = '#c4302b'; g.fill(); skOutline(g, 0.01);
      g.fillStyle = '#ffd34d'; g.fillRect(hw * 0.2, -0.088, 0.05, 0.036); g.strokeStyle = SK_INK; g.lineWidth = 0.007; g.strokeRect(hw * 0.2, -0.088, 0.05, 0.036);
      g.beginPath(); g.ellipse(0, 0.005, 0.29, 0.042, 0, 0, 7); g.fillStyle = '#2a2428'; g.fill(); skOutline(g); // aba
      skShine(g, -0.1, -0.17, 0.018, 0.07, 0.05);
      g.restore();
    },
    mago: function (g, prof, t) { // premium: estrelas que piscam
      g.save(); hatBase(g, prof, t, 0, 0.05, -0.04);
      var tip = Math.sin(t * 2.2) * 0.01;
      g.beginPath(); g.moveTo(-0.2, 0); g.bezierCurveTo(-0.17, -0.14, -0.06, -0.3, 0.05 + tip, -0.43); g.bezierCurveTo(0.13, -0.42, 0.2, -0.46, 0.2 + tip * 2, -0.38);
      g.bezierCurveTo(0.12, -0.34, 0.1, -0.2, 0.2, 0); g.closePath(); // cone com a ponta dobrada
      var gr = g.createLinearGradient(-0.2, 0, 0.2, -0.4); gr.addColorStop(0, '#3b2a8c'); gr.addColorStop(0.55, '#5a3fc4'); gr.addColorStop(1, '#8a6ff0');
      g.fillStyle = gr; g.fill(); skOutline(g);
      g.beginPath(); g.moveTo(-0.19, -0.025); g.quadraticCurveTo(0, -0.005, 0.19, -0.025); g.lineTo(0.2, 0.002); g.quadraticCurveTo(0, 0.025, -0.2, 0.002); g.closePath(); g.fillStyle = '#ffd34d'; g.fill(); skOutline(g, 0.009);
      g.beginPath(); g.ellipse(0, 0.012, 0.31, 0.05, 0, 0, 7); g.fillStyle = '#3b2a8c'; g.fill(); skOutline(g); // aba larga
      g.beginPath(); g.ellipse(0, 0.012, 0.31, 0.05, 0, Math.PI * 1.05, Math.PI * 1.7); g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 0.01; g.stroke();
      [[-0.04, -0.1, 0], [0.06, -0.2, 1.6], [-0.01, -0.27, 3.1]].forEach(function (s) { skSparkle(g, s[0], s[1], 0.022, 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.6 + s[2])), 'rgba(255,240,170,A)'); });
      g.restore();
    },
    pirata: function (g, prof, t) { // premium: tricórnio com caveira e galão dourado
      g.save(); hatBase(g, prof, t, 0, 0.055, 0.04);
      g.beginPath(); g.moveTo(-0.34, 0.01); g.quadraticCurveTo(-0.3, -0.14, -0.12, -0.17); g.quadraticCurveTo(0, -0.2, 0.12, -0.17); g.quadraticCurveTo(0.3, -0.14, 0.34, 0.01);
      g.quadraticCurveTo(0.2, 0.07, 0, 0.05); g.quadraticCurveTo(-0.2, 0.07, -0.34, 0.01); g.closePath();
      var gr = g.createLinearGradient(0, -0.2, 0, 0.06); gr.addColorStop(0, '#3d3a46'); gr.addColorStop(1, '#14121a');
      g.fillStyle = gr; g.fill(); skOutline(g);
      g.beginPath(); g.moveTo(-0.33, 0.012); g.quadraticCurveTo(-0.2, 0.065, 0, 0.045); g.quadraticCurveTo(0.2, 0.065, 0.33, 0.012);
      g.strokeStyle = '#e8b82a'; g.lineWidth = 0.016; g.stroke();
      g.fillStyle = '#f4f0e6'; g.beginPath(); g.ellipse(0, -0.085, 0.045, 0.04, 0, 0, 7); g.fill(); g.fillRect(-0.025, -0.07, 0.05, 0.04); // caveira
      g.fillStyle = '#14121a'; g.beginPath(); g.arc(-0.017, -0.088, 0.012, 0, 7); g.arc(0.017, -0.088, 0.012, 0, 7); g.fill();
      g.strokeStyle = '#f4f0e6'; g.lineWidth = 0.012; g.beginPath(); g.moveTo(-0.07, -0.03); g.lineTo(0.07, -0.13); g.moveTo(0.07, -0.03); g.lineTo(-0.07, -0.13); g.stroke();
      skSparkle(g, 0.3, -0.02, 0.016, Math.max(0, Math.sin(t * 2.1)), 'rgba(255,230,140,A)');
      g.restore();
    },
    dragao: function (g, prof, t) { dragonHead(g, prof, t, false); }, // prêmio semanal (cooperativo)
    dragao_ouro: function (g, prof, t) { dragonHead(g, prof, t, true); } // prêmio semanal (clássico)
  };
  // Cabeça de dragão apoiada no topo do slime: chifres para trás, focinho para a frente, olho com pupila de fenda.
  function dragonHead(g, prof, t, gold) {
    var C = gold ? { b: '#e3ac1c', d: '#a8740d', l: '#ffe483', h: '#fff3c4', e: '#ff4a2a' } : { b: '#3f9a4d', d: '#246a33', l: '#8bdc74', h: '#eadfc2', e: '#ffd23a' };
    g.save(); hatBase(g, prof, t, 0, 0.055, 0.04);
    // chifres (atrás da cabeça)
    [[-0.07, -0.12, -0.2, -0.29, -0.16, -0.13], [0.02, -0.14, -0.08, -0.3, -0.04, -0.14]].forEach(function (h) {
      g.beginPath(); g.moveTo(h[0], h[1]); g.quadraticCurveTo(h[2] - 0.03, h[3] + 0.08, h[2], h[3]); g.quadraticCurveTo(h[4] + 0.01, h[5] - 0.04, h[4] + 0.07, h[5] + 0.02); g.closePath();
      g.fillStyle = C.h; g.fill(); skOutline(g);
    });
    // cabeça
    g.beginPath(); g.moveTo(-0.23, 0.025); g.quadraticCurveTo(-0.25, -0.15, -0.03, -0.165); g.quadraticCurveTo(0.15, -0.17, 0.27, -0.085);
    g.quadraticCurveTo(0.33, -0.05, 0.31, -0.015); g.quadraticCurveTo(0.2, 0.035, 0.08, 0.03); g.quadraticCurveTo(-0.08, 0.05, -0.23, 0.025); g.closePath();
    var gr = g.createLinearGradient(0, -0.17, 0, 0.04); gr.addColorStop(0, C.l); gr.addColorStop(0.45, C.b); gr.addColorStop(1, C.d);
    g.fillStyle = gr; g.fill(); skOutline(g);
    // escamas e dentes
    g.strokeStyle = C.d; g.lineWidth = 0.011; g.beginPath();
    [[-0.15, -0.08], [-0.08, -0.12], [-0.12, -0.02], [-0.03, -0.07]].forEach(function (q) { g.moveTo(q[0] - 0.025, q[1]); g.quadraticCurveTo(q[0], q[1] + 0.03, q[0] + 0.025, q[1]); });
    g.stroke();
    g.fillStyle = '#fffaf0'; [0.16, 0.2, 0.245].forEach(function (x) { g.beginPath(); g.moveTo(x - 0.014, 0.024); g.lineTo(x, 0.058); g.lineTo(x + 0.014, 0.022); g.closePath(); g.fill(); });
    // olho, sobrancelha e narina
    g.fillStyle = C.e; g.beginPath(); g.ellipse(0.1, -0.09, 0.034, 0.026, -0.2, 0, 7); g.fill(); skOutline(g, 0.012);
    g.fillStyle = '#14121a'; g.beginPath(); g.ellipse(0.105, -0.09, 0.008, 0.022, -0.2, 0, 7); g.fill();
    g.strokeStyle = C.d; g.lineWidth = 0.02; g.beginPath(); g.moveTo(0.05, -0.13); g.lineTo(0.15, -0.115); g.stroke();
    g.fillStyle = '#14121a'; g.beginPath(); g.ellipse(0.26, -0.06, 0.012, 0.008, 0.4, 0, 7); g.fill();
    skShine(g, -0.06, -0.14, 0.035, 0.012, -0.2);
    if (gold) skSparkle(g, 0.22, -0.14, 0.017, Math.max(0, Math.sin(t * 2.4)), 'rgba(255,240,170,A)');
    else { var puff = (t * 0.8) % 1; g.fillStyle = 'rgba(210,210,210,' + (0.45 * (1 - puff)).toFixed(2) + ')'; g.beginPath(); g.arc(0.3 + puff * 0.04, -0.07 - puff * 0.12, 0.012 + puff * 0.02, 0, 7); g.fill(); } // fumacinha da narina
    g.restore();
  }
  // Chapéus em arte de imagem (public/img/hat_<id>.webp, fundo já recortado). w = largura do chapéu (fração da largura do slime),
  // ay = altura (fração do chapéu) que fica no topo da cabeça, lift = quanto afunda na cabeça, tilt = inclinação. Sem a imagem, usa o desenho por código.
  var HAT_IMG = {
    cogumelo:   { w: 0.72, ay: 0.97, lift: 0.07, tilt: -0.05 },
    marinheiro: { w: 0.78, ay: 0.78, lift: 0.105, tilt: 0.03 },
    cartola:    { w: 0.64, ay: 0.80, lift: 0.15, tilt: -0.05, flip: true },
    mago:       { w: 0.84, ay: 0.88, lift: 0.105, tilt: -0.04 },
    pirata:     { w: 0.82, ay: 0.74, lift: 0.115, tilt: 0 }
  };
  function spriteHat(g, id, prof, t, w, h) {
    var C = HAT_IMG[id], im = IMG['hat_' + id];
    if (!C || !im || !w || !h) return false;
    var pw = C.w * w, ph = pw * im.height / im.width * (C.sy || 1);
    g.save();
    g.translate(0.5, topAt(prof, 0.5) + C.lift + Math.sin(t * 3.4 + 0.8) * 0.005);
    g.scale(1 / w, 1 / h); // de volta a pixels, para o chapéu não esticar junto com o desenho do slime
    g.rotate(C.tilt + Math.sin(t * 2.1) * 0.015);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    if (C.flip) g.scale(-1, 1); // espelha o chapéu (ex.: fivela do outro lado)
    g.drawImage(im, -pw / 2, -ph * C.ay, pw, ph);
    g.restore();
    return true;
  }
  function drawAccessories(g, skin, base, t, w, h) {
    if (!skin || !skin.head || !HATS[skin.head]) return;
    var prof = topProfile(base);
    if (spriteHat(g, skin.head, prof, t, w, h)) return;
    HATS[skin.head](g, prof, t);
  }

  /* ---------- roupa, bracinhos e mãos ---------- */
  // A roupa equipada (peitoral) é desenhada em cima da barriga do slime, com contorno da cor da faixa; o corpo e a roupa
  // se mexem juntos (achatar, pulo, inclinação). Os bracinhos saem dos lados e seguram as armas pelo cabo.
  /* Roupa feita sob medida para o slime: não é o ícone da mochila, e sim uma faixa que abraça a barriga (segue a curva do corpo,
     é cortada pela silhueta do desenho e some embaixo do contorno) mais duas ombreiras onde os bracinhos saem.
     Cada tipo tem seu jeito: Vital = jaqueta de couro com cadarço e cinto, Arcano = túnica de mago com runas e gema,
     Blindado = couraça de placas com rebites. A faixa (cinza, verde, azul, roxo, dourado) aparece no debrum, nas fivelas e nas gemas. */
  var clothCache = {}, ARM_MG = 20; // margem extra, em pixels do desenho, para as ombreiras passarem da borda do corpo
  var ARM_BAND = { slime_idle: [-1.16, -0.1], slime_hurt: [-0.64, -0.06], slime_attack: [-1.0, -0.1] }; // topo e base da faixa (em r; o topo fica abaixo do rosto)
  var ARM_HW = 1.3, ARM_SHOULDER = [0.98, -0.62];
  var INK = 'rgba(22,14,10,0.9)';

  // contorno do corpo encolhido: a roupa não cobre a linha escura do desenho
  function bodyMask(base) {
    var key = 'M' + base;
    if (clothCache[key]) return clothCache[key];
    var src = IMG[base], w = src.width, h = src.height, c = cnv(w, h), g = c.getContext('2d'), t = cnv(w, h), tg = t.getContext('2d'), k, e = 7;
    g.drawImage(src, 0, 0);
    for (k = 0; k < 8; k++) {
      tg.clearRect(0, 0, w, h); tg.drawImage(src, Math.cos(k * 0.7854) * e, Math.sin(k * 0.7854) * e);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(t, 0, 0);
    }
    return (clothCache[key] = c);
  }
  function edgeY(x, ctrl) { return ctrl * 0.5 * (1 - (x / ARM_HW) * (x / ARM_HW)); } // quanto o meio da curva desce em relação às pontas
  function bandPath(g, top, bot) {
    g.beginPath(); g.moveTo(-ARM_HW, top); g.quadraticCurveTo(0, top + 0.28, ARM_HW, top);
    g.lineTo(ARM_HW, bot); g.quadraticCurveTo(0, bot + 0.22, -ARM_HW, bot); g.closePath();
  }
  function stroke(g, col, w) { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  function rivet(g, x, y, rad, col) {
    g.fillStyle = INK; g.beginPath(); g.arc(x, y, rad * 1.35, 0, 7); g.fill();
    g.fillStyle = col || '#aeb8bf'; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.4, 0, 7); g.fill();
  }
  function armGem(g, x, y, rad, col) {
    g.save(); g.globalCompositeOperation = 'lighter'; var gl = g.createRadialGradient(x, y, 0, x, y, rad * 3.2); gl.addColorStop(0, rgba(col, 0.55)); gl.addColorStop(1, rgba(col, 0)); g.fillStyle = gl; g.beginPath(); g.arc(x, y, rad * 3.2, 0, 7); g.fill(); g.restore();
    g.fillStyle = INK; g.beginPath(); g.moveTo(x, y - rad * 1.35); g.lineTo(x + rad * 1.1, y); g.lineTo(x, y + rad * 1.35); g.lineTo(x - rad * 1.1, y); g.closePath(); g.fill();
    var gr = g.createLinearGradient(x - rad, y - rad, x + rad, y + rad); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, col); gr.addColorStop(1, dark(col, 0.45));
    g.fillStyle = gr; g.beginPath(); g.moveTo(x, y - rad); g.lineTo(x + rad * 0.8, y); g.lineTo(x, y + rad); g.lineTo(x - rad * 0.8, y); g.closePath(); g.fill();
  }

  var ARM_PAINT = {
    // Casaca de Gelatina: colete de gelatina transparente, com costura e botões-bolha
    jelly: function (g, top, bot) {
      bandPath(g, top, bot);
      var gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, 'rgba(235,255,245,.62)'); gr.addColorStop(1, 'rgba(150,235,200,.48)');
      g.fillStyle = gr; g.fill(); stroke(g, 'rgba(255,255,255,.75)', 0.035);
      g.beginPath(); g.moveTo(0, top + 0.14); g.lineTo(0, bot); stroke(g, 'rgba(255,255,255,.8)', 0.022);
      var h = bot - top, i, y;
      for (i = 0; i < 3; i++) { y = top + h * (0.3 + i * 0.22) + 0.1; g.fillStyle = 'rgba(255,255,255,.88)'; g.beginPath(); g.arc(0.12, y, 0.055, 0, 7); g.fill(); g.fillStyle = 'rgba(120,200,170,.9)'; g.beginPath(); g.arc(0.12, y, 0.032, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(-0.55, top + h * 0.35 + 0.1, 0.26, 0.09, -0.35, 0, 7); g.fill();
    },
    vital: function (g, top, bot, tier, TC) {
      var h = bot - top, i, x, y;
      bandPath(g, top, bot);
      var gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, '#b07c50'); gr.addColorStop(1, '#6a4128'); g.fillStyle = gr; g.fill();
      var sh = g.createLinearGradient(-ARM_HW, 0, ARM_HW, 0); sh.addColorStop(0, 'rgba(0,0,0,.4)'); sh.addColorStop(0.24, 'rgba(0,0,0,0)'); sh.addColorStop(0.76, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.4)'); g.fillStyle = sh; g.fill();
      g.fillStyle = 'rgba(255,235,200,.15)'; g.beginPath(); g.ellipse(-0.5, top + h * 0.3 + 0.1, 0.34, 0.1, -0.3, 0, 7); g.fill();
      // costura do meio com cadarço
      var seamBot = top + h * 0.6 + 0.1;
      g.beginPath(); g.moveTo(0, top + 0.14); g.lineTo(0, seamBot); stroke(g, 'rgba(30,18,10,.55)', 0.05);
      for (i = 0; i < 4; i++) {
        y = top + 0.2 + i * (seamBot - top - 0.26) / 3;
        g.beginPath(); g.moveTo(-0.075, y); g.lineTo(0.075, y + 0.07); g.moveTo(0.075, y); g.lineTo(-0.075, y + 0.07); stroke(g, '#f0e2bc', 0.02);
        g.fillStyle = '#f0e2bc'; g.beginPath(); g.arc(-0.085, y + 0.035, 0.016, 0, 7); g.arc(0.085, y + 0.035, 0.016, 0, 7); g.fill();
      }
      // cinto com fivela
      var b0 = top + h * 0.64, b1 = top + h * 0.86;
      g.beginPath(); g.moveTo(-ARM_HW, b0); g.quadraticCurveTo(0, b0 + 0.2, ARM_HW, b0); g.lineTo(ARM_HW, b1); g.quadraticCurveTo(0, b1 + 0.2, -ARM_HW, b1); g.closePath();
      var bg = g.createLinearGradient(0, b0, 0, b1 + 0.1); bg.addColorStop(0, '#4d2f1a'); bg.addColorStop(1, '#2d1a0e'); g.fillStyle = bg; g.fill(); stroke(g, INK, 0.03);
      g.beginPath(); g.moveTo(-ARM_HW, b0 + 0.03); g.quadraticCurveTo(0, b0 + 0.23, ARM_HW, b0 + 0.03); g.setLineDash([0.05, 0.045]); stroke(g, 'rgba(240,215,170,.6)', 0.014); g.setLineDash([]);
      var by = (b0 + b1) / 2 + 0.1, bc = tier >= 1 ? TC : '#d6b36a';
      if (tier >= 2) for (i = 0; i < 4; i++) { x = 0.34 + i * 0.22; y = (b0 + b1) / 2 + edgeY(x, 0.2); rivet(g, x, y, 0.028, bc); rivet(g, -x, y, 0.028, bc); }
      g.fillStyle = INK; g.fillRect(-0.17, by - 0.1, 0.34, 0.2);
      var fg = g.createLinearGradient(-0.14, by - 0.08, 0.14, by + 0.08); fg.addColorStop(0, light(bc, 0.55)); fg.addColorStop(0.5, bc); fg.addColorStop(1, dark(bc, 0.4)); g.fillStyle = fg; g.fillRect(-0.145, by - 0.075, 0.29, 0.15);
      g.fillStyle = '#2d1a0e'; g.fillRect(-0.08, by - 0.04, 0.16, 0.08);
      if (tier >= 5) armGem(g, 0, by, 0.045, '#ffffff');
      if (tier >= 1) { // bolsinha pendurada no cinto, com aba e botão da cor da faixa
        var px = 0.78, py = b0 + 0.02 + edgeY(0.78, 0.2);
        g.beginPath(); g.moveTo(px - 0.15, py); g.lineTo(px + 0.15, py); g.lineTo(px + 0.16, py + 0.26); g.quadraticCurveTo(px, py + 0.32, px - 0.16, py + 0.26); g.closePath();
        var pg = g.createLinearGradient(0, py, 0, py + 0.3); pg.addColorStop(0, '#9a6a42'); pg.addColorStop(1, '#5c3a22'); g.fillStyle = pg; g.fill(); stroke(g, INK, 0.03);
        g.beginPath(); g.moveTo(px - 0.15, py + 0.07); g.quadraticCurveTo(px, py + 0.17, px + 0.15, py + 0.07); stroke(g, 'rgba(30,18,10,.6)', 0.025);
        rivet(g, px, py + 0.13, 0.03, bc);
      }
      bandPath(g, top, bot); stroke(g, INK, 0.04);
      if (tier >= 1) { g.beginPath(); g.moveTo(-ARM_HW, top + 0.015); g.quadraticCurveTo(0, top + 0.295, ARM_HW, top + 0.015); stroke(g, TC, 0.05); }
    },
    arcano: function (g, top, bot, tier, TC) {
      var h = bot - top, i, x, y, rc = tier >= 1 ? light(TC, 0.35) : '#cbbcff';
      bandPath(g, top, bot);
      var gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, '#5c62c8'); gr.addColorStop(1, '#262a6c'); g.fillStyle = gr; g.fill();
      var sh = g.createLinearGradient(-ARM_HW, 0, ARM_HW, 0); sh.addColorStop(0, 'rgba(5,6,40,.45)'); sh.addColorStop(0.26, 'rgba(0,0,0,0)'); sh.addColorStop(0.74, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(5,6,40,.45)'); g.fillStyle = sh; g.fill();
      // dobras do tecido
      for (i = -3; i <= 3; i++) {
        if (i === 0) continue;
        x = i * 0.34; g.beginPath(); g.moveTo(x, top + edgeY(x, 0.28) + 0.04); g.quadraticCurveTo(x * 1.06, (top + bot) / 2 + 0.05, x * 1.16, bot + 0.04); stroke(g, 'rgba(8,10,55,.4)', 0.03);
        g.beginPath(); g.moveTo(x + 0.035, top + edgeY(x, 0.28) + 0.04); g.quadraticCurveTo(x * 1.06 + 0.035, (top + bot) / 2 + 0.05, x * 1.16 + 0.035, bot + 0.04); stroke(g, 'rgba(170,180,255,.16)', 0.015);
      }
      // faixa central com runas que brilham
      g.beginPath(); g.moveTo(-0.2, top + 0.12); g.lineTo(-0.2, bot + 0.05); g.lineTo(0.2, bot + 0.05); g.lineTo(0.2, top + 0.12); g.closePath(); g.fillStyle = 'rgba(255,255,255,.1)'; g.fill();
      g.beginPath(); g.moveTo(-0.2, top + 0.12); g.lineTo(-0.2, bot + 0.05); g.moveTo(0.2, top + 0.12); g.lineTo(0.2, bot + 0.05); stroke(g, tier >= 1 ? TC : '#b9a8ff', 0.02);
      g.save(); g.shadowColor = rc; g.shadowBlur = 9; g.strokeStyle = rc; g.lineWidth = 0.028; g.lineCap = 'round'; g.lineJoin = 'round';
      var gy = top + h * 0.42 + 0.1;
      g.beginPath(); g.moveTo(0, gy - 0.09); g.lineTo(0.07, gy); g.lineTo(0, gy + 0.09); g.lineTo(-0.07, gy); g.closePath(); g.stroke();
      gy = top + h * 0.62 + 0.1; g.beginPath(); g.moveTo(0, gy - 0.08); g.lineTo(0, gy + 0.09); g.moveTo(-0.08, gy - 0.07); g.lineTo(0, gy); g.lineTo(0.08, gy - 0.07); g.stroke();
      gy = top + h * 0.8 + 0.08; g.beginPath(); g.moveTo(-0.07, gy - 0.07); g.lineTo(-0.07, gy + 0.07); g.moveTo(-0.07, gy - 0.07); g.lineTo(0.07, gy - 0.01); g.lineTo(-0.07, gy + 0.03); g.stroke();
      g.restore();
      // barra com ondinhas e franjas
      var hy = bot - 0.13;
      g.beginPath(); g.moveTo(-ARM_HW, hy); for (i = 0; i <= 26; i++) { x = -ARM_HW + i * (2 * ARM_HW / 26); g.lineTo(x, hy + edgeY(x, 0.22) + Math.sin(i * 1.4) * 0.025); } stroke(g, tier >= 1 ? TC : '#b9a8ff', 0.035);
      for (i = -5; i <= 5; i++) { x = i * 0.22; rivet(g, x, hy + edgeY(x, 0.22) + 0.075, 0.017, tier >= 1 ? light(TC, 0.3) : '#d8ccff'); }
      if (tier >= 4) for (i = 0; i < 7; i++) { x = -1 + i * 0.33 + (i % 2) * 0.05; y = top + h * (0.25 + ((i * 37) % 5) * 0.12) + 0.1; g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba('#ffffff', 0.7); g.beginPath(); g.moveTo(x, y - 0.06); g.lineTo(x + 0.015, y - 0.015); g.lineTo(x + 0.06, y); g.lineTo(x + 0.015, y + 0.015); g.lineTo(x, y + 0.06); g.lineTo(x - 0.015, y + 0.015); g.lineTo(x - 0.06, y); g.lineTo(x - 0.015, y - 0.015); g.closePath(); g.fill(); g.restore(); }
      bandPath(g, top, bot); stroke(g, INK, 0.04);
      g.beginPath(); g.moveTo(-ARM_HW, top + 0.015); g.quadraticCurveTo(0, top + 0.295, ARM_HW, top + 0.015); stroke(g, tier >= 1 ? TC : '#b9a8ff', 0.05);
      armGem(g, 0, top + 0.17, 0.075, tier >= 1 ? TC : '#9a7dff');
    },
    blindado: function (g, top, bot, tier, TC) {
      var h = bot - top, i, x, y, ln;
      bandPath(g, top, bot);
      var gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, '#dbe2e6'); gr.addColorStop(0.55, '#a3adb4'); gr.addColorStop(1, '#68737b'); g.fillStyle = gr; g.fill();
      var hl = g.createLinearGradient(-ARM_HW, 0, ARM_HW, 0); hl.addColorStop(0, 'rgba(20,28,36,.5)'); hl.addColorStop(0.2, 'rgba(20,28,36,0)'); hl.addColorStop(0.38, 'rgba(255,255,255,.3)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)'); hl.addColorStop(0.8, 'rgba(20,28,36,0)'); hl.addColorStop(1, 'rgba(20,28,36,.5)'); g.fillStyle = hl; g.fill();
      // placas sobrepostas
      [0.36, 0.68].forEach(function (v) {
        var ly = top + h * v;
        g.beginPath(); g.moveTo(-ARM_HW, ly); g.quadraticCurveTo(0, ly + 0.24, ARM_HW, ly); stroke(g, 'rgba(18,24,30,.75)', 0.04);
        g.beginPath(); g.moveTo(-ARM_HW, ly + 0.035); g.quadraticCurveTo(0, ly + 0.275, ARM_HW, ly + 0.035); stroke(g, 'rgba(255,255,255,.5)', 0.016);
        for (var j = 0; j < 5; j++) { var rx = 0.28 + j * 0.2; rivet(g, rx, ly + edgeY(rx, 0.24) + 0.085, 0.024); rivet(g, -rx, ly + edgeY(rx, 0.24) + 0.085, 0.024); }
      });
      // nervura central
      g.beginPath(); g.moveTo(0, top + 0.14); g.lineTo(0, bot + 0.05); stroke(g, 'rgba(18,24,30,.5)', 0.04); g.beginPath(); g.moveTo(0.025, top + 0.14); g.lineTo(0.025, bot + 0.05); stroke(g, 'rgba(255,255,255,.45)', 0.015);
      for (i = 0; i < 4; i++) { x = 0.3 + i * 0.22; rivet(g, x, top + edgeY(x, 0.28) + 0.075, 0.024); rivet(g, -x, top + edgeY(x, 0.28) + 0.075, 0.024); }
      if (tier >= 3) { // filigrana
        g.save(); g.shadowColor = tier >= 5 ? '#ffd36b' : TC; g.shadowBlur = tier >= 4 ? 7 : 0; g.strokeStyle = tier >= 4 ? '#ffe39a' : light(TC, 0.4); g.lineWidth = 0.022; g.lineCap = 'round';
        for (i = -1; i <= 1; i += 2) { g.beginPath(); g.moveTo(i * 0.1, top + h * 0.42 + 0.1); g.quadraticCurveTo(i * 0.36, top + h * 0.5 + 0.1, i * 0.3, top + h * 0.62 + 0.1); g.stroke(); g.beginPath(); g.moveTo(i * 0.1, top + h * 0.12 + 0.12); g.quadraticCurveTo(i * 0.34, top + h * 0.2 + 0.12, i * 0.28, top + h * 0.31 + 0.12); g.stroke(); }
        g.restore();
      }
      if (tier >= 4) armGem(g, 0, top + h * 0.5 + 0.1, 0.06, tier >= 5 ? '#ff4f6a' : TC);
      bandPath(g, top, bot); stroke(g, INK, 0.04);
      if (tier >= 1) {
        g.beginPath(); g.moveTo(-ARM_HW, top + 0.015); g.quadraticCurveTo(0, top + 0.295, ARM_HW, top + 0.015); stroke(g, TC, 0.05);
        g.beginPath(); g.moveTo(-ARM_HW, bot - 0.015); g.quadraticCurveTo(0, bot + 0.205, ARM_HW, bot - 0.015); stroke(g, TC, 0.04);
      }
    },
    // Peitoral Dracônico (mítico): escamas de dragão vermelhas no meio e carvão nos lados, bordas de ouro, rachaduras de brasa e um olho de dragão no peito
    draco: function (g, top, bot) {
      var h = bot - top, i, j, x, y, GOLD = '#e8bb4e';
      bandPath(g, top, bot);
      var gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, '#9c1f19'); gr.addColorStop(1, '#4a0b09'); g.fillStyle = gr; g.fill();
      g.save(); bandPath(g, top, bot); g.clip();
      // escamas: fileiras que se sobrepõem, vermelhas no centro e escuras nos lados
      for (j = 8; j >= 0; j--) { // de baixo para cima: cada fileira de cima cobre a ponta da de baixo, como telhas
        for (i = -7; i <= 7; i++) {
          x = i * 0.2 + (j % 2) * 0.1; if (Math.abs(x) > ARM_HW + 0.1) continue;
          y = top + edgeY(x, 0.26) + 0.02 + j * 0.12;
          var mid = Math.abs(x) < 0.66, sg = g.createLinearGradient(0, y - 0.06, 0, y + 0.16);
          if (mid) { sg.addColorStop(0, '#f05a46'); sg.addColorStop(0.55, '#b3261b'); sg.addColorStop(1, '#6e100b'); } else { sg.addColorStop(0, '#5a4c4c'); sg.addColorStop(0.55, '#2e2626'); sg.addColorStop(1, '#141010'); }
          g.beginPath(); g.moveTo(x - 0.108, y - 0.06); g.quadraticCurveTo(x - 0.1, y + 0.08, x, y + 0.17); g.quadraticCurveTo(x + 0.1, y + 0.08, x + 0.108, y - 0.06); g.closePath();
          g.fillStyle = sg; g.fill(); stroke(g, 'rgba(25,4,3,.85)', 0.02);
          g.beginPath(); g.moveTo(x - 0.06, y + 0.0); g.quadraticCurveTo(x - 0.055, y + 0.07, x - 0.01, y + 0.12); stroke(g, mid ? 'rgba(255,200,160,.5)' : 'rgba(255,255,255,.16)', 0.014);
        }
      }
      // rachaduras de brasa entre as escamas
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
      var cracks = [[[-0.5, top + 0.4], [-0.38, top + 0.52], [-0.45, top + 0.64], [-0.3, top + 0.78]], [[0.42, top + 0.34], [0.3, top + 0.5], [0.4, top + 0.62], [0.26, top + 0.8]], [[0.06, top + 0.62], [0.1, top + 0.74], [0.02, top + 0.86]]];
      cracks.forEach(function (c) {
        for (var pass = 0; pass < 2; pass++) { g.beginPath(); g.moveTo(c[0][0], c[0][1]); for (var k = 1; k < c.length; k++) g.lineTo(c[k][0], c[k][1]); g.strokeStyle = pass ? 'rgba(255,230,150,.95)' : 'rgba(255,110,30,.55)'; g.lineWidth = pass ? 0.018 : 0.05; g.stroke(); }
      });
      g.restore();
      // nervura central
      g.beginPath(); g.moveTo(0, top + 0.2); g.lineTo(0, bot); stroke(g, 'rgba(30,4,3,.55)', 0.045); g.beginPath(); g.moveTo(0.03, top + 0.2); g.lineTo(0.03, bot); stroke(g, 'rgba(255,170,120,.4)', 0.014);
      // barra de ouro no fim, com pontas para baixo
      var hy = bot - 0.15; g.beginPath(); g.moveTo(-ARM_HW, hy); g.quadraticCurveTo(0, hy + 0.22, ARM_HW, hy); g.lineTo(ARM_HW, bot + 0.3); g.lineTo(-ARM_HW, bot + 0.3); g.closePath();
      var hg = g.createLinearGradient(0, hy, 0, bot + 0.1); hg.addColorStop(0, '#f6d87e'); hg.addColorStop(0.5, GOLD); hg.addColorStop(1, '#8a6414'); g.fillStyle = hg; g.fill(); stroke(g, INK, 0.03);
      for (i = -5; i <= 5; i++) { x = i * 0.24; rivet(g, x, hy + edgeY(x, 0.22) + 0.07, 0.022, '#fff1b8'); }
      g.restore();
      // olho de dragão: gema de brasa com a pupila fina
      var ey = top + h * 0.34 + 0.1;
      g.save(); g.globalCompositeOperation = 'lighter'; var eg = g.createRadialGradient(0, ey, 0, 0, ey, 0.42); eg.addColorStop(0, 'rgba(255,150,40,.6)'); eg.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = eg; g.beginPath(); g.arc(0, ey, 0.42, 0, 7); g.fill(); g.restore();
      g.beginPath(); g.moveTo(0, ey - 0.2); g.lineTo(0.17, ey); g.lineTo(0, ey + 0.2); g.lineTo(-0.17, ey); g.closePath(); g.fillStyle = INK; g.fill(); stroke(g, GOLD, 0.045);
      var yg = g.createRadialGradient(0, ey - 0.03, 0.01, 0, ey, 0.17); yg.addColorStop(0, '#fff3a0'); yg.addColorStop(0.5, '#ff9a22'); yg.addColorStop(1, '#c2330f');
      g.beginPath(); g.moveTo(0, ey - 0.15); g.lineTo(0.125, ey); g.lineTo(0, ey + 0.15); g.lineTo(-0.125, ey); g.closePath(); g.fillStyle = yg; g.fill();
      g.beginPath(); g.ellipse(0, ey, 0.026, 0.115, 0, 0, 7); g.fillStyle = '#220806'; g.fill();
      bandPath(g, top, bot); stroke(g, INK, 0.04);
      g.beginPath(); g.moveTo(-ARM_HW, top + 0.015); g.quadraticCurveTo(0, top + 0.295, ARM_HW, top + 0.015); stroke(g, GOLD, 0.055);
    }
  };
  // Ombreiras: onde os bracinhos saem. Ficam por cima da borda do corpo (não são cortadas pela silhueta).
  var ARM_PADS = {
    vital: function (g, x, y, tier, TC) {
      var gr = g.createRadialGradient(x - 0.08, y - 0.1, 0.02, x, y, 0.34); gr.addColorStop(0, '#c08a5c'); gr.addColorStop(1, '#5e3a22');
      g.fillStyle = INK; g.beginPath(); g.arc(x, y, 0.34, 0, 7); g.fill(); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 0.3, 0, 7); g.fill();
      g.beginPath(); g.arc(x, y, 0.23, 0, 7); g.setLineDash([0.05, 0.04]); stroke(g, 'rgba(245,225,185,.7)', 0.016); g.setLineDash([]);
      if (tier >= 1) { g.beginPath(); g.arc(x, y, 0.3, 0, 7); stroke(g, TC, 0.035); }
    },
    arcano: function (g, x, y, tier, TC) {
      var gr = g.createRadialGradient(x - 0.08, y - 0.1, 0.02, x, y, 0.34); gr.addColorStop(0, '#7a80e0'); gr.addColorStop(1, '#2b2f78');
      g.fillStyle = INK; g.beginPath(); g.arc(x, y, 0.34, 0, 7); g.fill(); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 0.3, 0, 7); g.fill();
      g.beginPath(); g.arc(x, y, 0.3, 0, 7); stroke(g, tier >= 1 ? TC : '#b9a8ff', 0.035);
      armGem(g, x + Math.sign(x) * 0.12, y - 0.2, 0.05, tier >= 1 ? TC : '#9a7dff');
    },
    blindado: function (g, x, y, tier, TC) {
      var gr = g.createRadialGradient(x - 0.1, y - 0.13, 0.02, x, y, 0.4); gr.addColorStop(0, '#f0f4f6'); gr.addColorStop(0.5, '#a9b3ba'); gr.addColorStop(1, '#5d6870');
      g.fillStyle = INK; g.beginPath(); g.arc(x, y, 0.4, 0, 7); g.fill(); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 0.36, 0, 7); g.fill();
      g.beginPath(); g.arc(x, y, 0.36, 0, 7); stroke(g, tier >= 1 ? TC : '#7d8890', 0.04);
      for (var i = 0; i < 6; i++) rivet(g, x + Math.cos(i * 1.0472 + 0.5) * 0.27, y + Math.sin(i * 1.0472 + 0.5) * 0.27, 0.02);
    },
    // Ombreira de escamas com três chifres para cima e para fora
    draco: function (g, x, y) {
      var s = x < 0 ? -1 : 1, GOLD = '#e8bb4e', k;
      [[-0.3, 0.36], [0.3, 0.4], [0.9, 0.34]].forEach(function (sp) { // [ângulo para fora a partir de cima, comprimento]
        var a = -Math.PI / 2 + s * sp[0], L = sp[1], bx = x + Math.cos(a) * 0.28, by = y + Math.sin(a) * 0.28;
        var nx = -Math.sin(a) * 0.1, ny = Math.cos(a) * 0.1, tx = x + Math.cos(a) * (0.28 + L), ty = y + Math.sin(a) * (0.28 + L);
        g.beginPath(); g.moveTo(bx + nx, by + ny); g.lineTo(tx, ty); g.lineTo(bx - nx, by - ny); g.closePath();
        var sg = g.createLinearGradient(bx, by, tx, ty); sg.addColorStop(0, '#8a1510'); sg.addColorStop(1, '#ff6a3a'); g.fillStyle = sg; g.fill(); stroke(g, INK, 0.03);
      });
      var gr = g.createRadialGradient(x - 0.1, y - 0.12, 0.02, x, y, 0.42); gr.addColorStop(0, '#d8402f'); gr.addColorStop(0.6, '#8e1712'); gr.addColorStop(1, '#3d0907');
      g.fillStyle = INK; g.beginPath(); g.arc(x, y, 0.4, 0, 7); g.fill(); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 0.36, 0, 7); g.fill();
      for (k = 0; k < 3; k++) { // escamas
        var sy = y - 0.16 + k * 0.14, sw = 0.3 - Math.abs(k - 1) * 0.04;
        for (var m = -1; m <= 1; m++) { var sx = x + m * 0.15 + (k % 2) * 0.07 * s; g.beginPath(); g.moveTo(sx - 0.075, sy - 0.02); g.quadraticCurveTo(sx - 0.075, sy + 0.09, sx, sy + 0.1); g.quadraticCurveTo(sx + 0.075, sy + 0.09, sx + 0.075, sy - 0.02); g.closePath(); g.fillStyle = 'rgba(255,120,90,.2)'; g.fill(); stroke(g, 'rgba(25,4,3,.7)', 0.014); }
      }
      g.beginPath(); g.arc(x, y, 0.36, 0, 7); stroke(g, GOLD, 0.05);
      rivet(g, x + s * 0.18, y - 0.2, 0.026, '#fff1b8');
    }
  };
  // Golas: alas nos dois lados do pescoço, por cima da borda de cima da roupa (só da faixa 1 para cima)
  var ARM_COLLAR = {
    vital: function (g, s, top, tier, TC) { // abas de couro dobradas, com costura
      g.beginPath(); g.moveTo(s * 0.2, top + 0.17); g.lineTo(s * 0.66, top - 0.1); g.quadraticCurveTo(s * 0.98, top - 0.02, s * 1.02, top + 0.12); g.lineTo(s * 0.7, top + 0.24); g.closePath();
      var gr = g.createLinearGradient(0, top - 0.1, 0, top + 0.24); gr.addColorStop(0, '#b98456'); gr.addColorStop(1, '#6b4228'); g.fillStyle = gr; g.fill(); stroke(g, INK, 0.035);
      g.beginPath(); g.moveTo(s * 0.26, top + 0.2); g.lineTo(s * 0.66, top - 0.04); g.setLineDash([0.05, 0.04]); stroke(g, 'rgba(245,225,185,.7)', 0.014); g.setLineDash([]);
      if (tier >= 1) { g.beginPath(); g.moveTo(s * 0.7, top + 0.24); g.lineTo(s * 1.02, top + 0.12); stroke(g, TC, 0.04); }
    },
    arcano: function (g, s, top, tier, TC) { // asas de manto, com a ponta para cima e uma gemazinha
      g.beginPath(); g.moveTo(s * 0.18, top + 0.18); g.lineTo(s * 0.78, top - 0.26); g.quadraticCurveTo(s * 0.9, top - 0.02, s * 1.04, top + 0.1); g.lineTo(s * 0.66, top + 0.26); g.closePath();
      var gr = g.createLinearGradient(s * 0.2, top + 0.2, s * 0.8, top - 0.26); gr.addColorStop(0, '#2b2f78'); gr.addColorStop(1, '#6a70d8'); g.fillStyle = gr; g.fill(); stroke(g, INK, 0.035);
      g.beginPath(); g.moveTo(s * 0.24, top + 0.19); g.lineTo(s * 0.78, top - 0.21); stroke(g, tier >= 1 ? TC : '#b9a8ff', 0.03);
      armGem(g, s * 0.62, top - 0.01, 0.035, tier >= 1 ? TC : '#9a7dff');
    },
    blindado: function (g, s, top, tier, TC) { // gorjal de aço: duas placas curvas
      g.beginPath(); g.moveTo(s * 0.18, top + 0.16); g.lineTo(s * 0.56, top - 0.18); g.lineTo(s * 0.92, top - 0.14); g.quadraticCurveTo(s * 1.04, top - 0.02, s * 1.04, top + 0.1); g.lineTo(s * 0.66, top + 0.26); g.closePath();
      var gr = g.createLinearGradient(0, top - 0.18, 0, top + 0.26); gr.addColorStop(0, '#eef2f4'); gr.addColorStop(0.5, '#a9b3ba'); gr.addColorStop(1, '#5d6870'); g.fillStyle = gr; g.fill(); stroke(g, INK, 0.035);
      g.beginPath(); g.moveTo(s * 0.26, top + 0.16); g.lineTo(s * 0.62, top - 0.1); g.lineTo(s * 0.95, top - 0.06); stroke(g, 'rgba(18,24,30,.5)', 0.025);
      rivet(g, s * 0.72, top - 0.04, 0.022); rivet(g, s * 0.5, top + 0.04, 0.02);
      if (tier >= 1) { g.beginPath(); g.moveTo(s * 0.66, top + 0.26); g.lineTo(s * 1.04, top + 0.1); stroke(g, TC, 0.04); }
    },
    draco: function (g, s, top) { // gola de espinhos de dragão
      var GOLD = '#e8bb4e';
      [[0.58, 0.1, 0.74, 0.26], [0.78, 0.08, 1.0, 0.3], [0.97, 0.04, 1.18, 0.2]].forEach(function (sp, i) {
        var b0 = sp[0], bw = 0.15;
        g.beginPath(); g.moveTo(s * (b0 - bw * 0.6), top + 0.2 - i * 0.04); g.lineTo(s * sp[2], top - sp[3]); g.lineTo(s * (b0 + bw * 0.9), top + 0.16 - i * 0.04); g.closePath();
        var sg = g.createLinearGradient(0, top - sp[3], 0, top + 0.2); sg.addColorStop(0, '#ff7a3c'); sg.addColorStop(0.5, '#b32116'); sg.addColorStop(1, '#5a0d0a'); g.fillStyle = sg; g.fill(); stroke(g, INK, 0.03);
      });
      g.beginPath(); g.moveTo(s * 0.14, top + 0.17); g.quadraticCurveTo(s * 0.7, top - 0.04, s * 1.04, top + 0.1); stroke(g, GOLD, 0.045);
    }
  };
  // Mangas: cor, sombra, debrum e quantidade de costuras/placas no braço
  var ARM_SLEEVE = {
    vital: { c: '#94623c', d: '#5a3720', trim: '#d6b36a', ribs: 0 },
    arcano: { c: '#4f55bb', d: '#262a6c', trim: '#cbbcff', ribs: 0 },
    blindado: { c: '#aab4bb', d: '#68737b', trim: '#7d8890', ribs: 2 },
    draco: { c: '#a8261c', d: '#470b08', trim: '#e8bb4e', ribs: 3, gold: true }
  };
  function armorSleeve(id) {
    var it = ITEMS[id];
    if (!it || it.kind !== 'armor' || !it.tier) return null;
    var s = ARM_SLEEVE[it.type] || ARM_SLEEVE.vital;
    return { c: s.c, d: s.d, ribs: s.ribs, trim: s.gold ? s.trim : GD.TIER_COLORS[it.tier - 1] };
  }

  // Camada de roupa de uma pose: mesmo tamanho do desenho do slime (mais a margem), pronta para ser desenhada com a mesma transformação.
  function armorLayer(id, base) {
    var key = id + '|' + base;
    if (clothCache[key]) return clothCache[key];
    var it = ITEMS[id], src = IMG[base], M = SLIME_META[base] || { ax: 0.5, ay: 1 };
    if (!it || it.kind !== 'armor' || !src) return null;
    var w = src.width, h = src.height, mg = ARM_MG, L = cnv(w + mg * 2, h + mg * 2), g = L.getContext('2d');
    var band = ARM_BAND[base] || ARM_BAND.slime_idle, TC = it.tier > 0 ? GD.TIER_COLORS[it.tier - 1] : '#ffffff';
    var R = IMG.slime_idle.width / SLIME_W, ox = mg + M.ax * w, oy = mg + M.ay * h;
    // 1) o tecido (ou couraça) numa camada própria, para receber luz e sombra
    var cc = cnv(L.width, L.height), cg = cc.getContext('2d');
    cg.translate(ox, oy); cg.scale(R, R / SLIME_SQUAT);
    if (it.tier === 0) ARM_PAINT.jelly(cg, band[0], band[1]); else (ARM_PAINT[it.type] || ARM_PAINT.vital)(cg, band[0], band[1], it.tier, TC);
    if (it.tier > 0) { // volume: luz de cima à esquerda, sombra embaixo e nas laterais (a barriga é redonda)
      cg.save(); cg.globalCompositeOperation = 'source-atop';
      var hl = cg.createRadialGradient(-0.5, band[0] + 0.3, 0.05, -0.3, band[0] + 0.5, 1.5); hl.addColorStop(0, 'rgba(255,255,255,.2)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
      cg.fillStyle = hl; cg.fillRect(-2, -3, 4, 4);
      var sd = cg.createLinearGradient(0, band[0] + 0.3, 0, band[1] + 0.15); sd.addColorStop(0, 'rgba(0,0,0,0)'); sd.addColorStop(1, 'rgba(0,0,0,.3)'); cg.fillStyle = sd; cg.fillRect(-2, -3, 4, 4);
      var sx = cg.createLinearGradient(-ARM_HW, 0, ARM_HW, 0); sx.addColorStop(0, 'rgba(0,0,0,.24)'); sx.addColorStop(0.24, 'rgba(0,0,0,0)'); sx.addColorStop(0.76, 'rgba(0,0,0,0)'); sx.addColorStop(1, 'rgba(0,0,0,.28)');
      cg.fillStyle = sx; cg.fillRect(-2, -3, 4, 4); cg.restore();
    }
    // 2) sombra de contato no corpo, logo acima da gola, e a roupa por cima; tudo cortado pela silhueta
    var bc = cnv(L.width, L.height), bg = bc.getContext('2d');
    if (it.tier > 0) {
      bg.save(); bg.translate(ox, oy); bg.scale(R, R / SLIME_SQUAT);
      [[0.34, 0.07], [0.22, 0.09], [0.1, 0.12]].forEach(function (s) { bg.beginPath(); bg.moveTo(-ARM_HW, band[0] - 0.02); bg.quadraticCurveTo(0, band[0] + 0.26, ARM_HW, band[0] - 0.02); stroke(bg, 'rgba(8,30,16,' + s[1] + ')', s[0]); });
      bg.restore();
    }
    bg.drawImage(cc, 0, 0);
    bg.globalCompositeOperation = 'destination-in'; bg.drawImage(bodyMask(base), mg, mg);
    g.drawImage(bc, 0, 0);
    if (it.tier > 0) { // ombreiras e golas passam da borda do corpo (não são cortadas)
      g.translate(ox, oy); g.scale(R, R / SLIME_SQUAT);
      var pad = ARM_PADS[it.type] || ARM_PADS.vital, col = ARM_COLLAR[it.type] || ARM_COLLAR.vital;
      pad(g, -ARM_SHOULDER[0], ARM_SHOULDER[1], it.tier, TC); pad(g, ARM_SHOULDER[0], ARM_SHOULDER[1], it.tier, TC);
      col(g, -1, band[0], it.tier, TC); col(g, 1, band[0], it.tier, TC);
    }
    return (clothCache[key] = L);
  }
  function armorFlat(id, base) {
    var key = 'F' + id + '|' + base;
    if (clothCache[key]) return clothCache[key];
    var src = armorLayer(id, base), c = cnv(src.width, src.height), g = c.getContext('2d');
    g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    return (clothCache[key] = c);
  }
  // Desenha a roupa por cima do corpo; (x0, y0, kx, ky) = canto do desenho e escala (iguais aos do corpo).
  function drawCloth(g, id, base, x0, y0, kx, ky, flat) {
    var L = flat ? (armorLayer(id, base) && armorFlat(id, base)) : armorLayer(id, base);
    if (!L) return;
    g.drawImage(L, x0 - ARM_MG * kx, y0 - ARM_MG * ky, L.width * kx, L.height * ky);
  }

  // Leva um ponto do desenho do slime (em múltiplos de r a partir do ponto de apoio; y negativo sobe) para o mundo,
  // com a mesma transformação do drawSlime (respirar, achatar, pular, inclinar, espelhar).
  function slimeXf(x, y, r, t, o) {
    o = o || {};
    var breath = (o.sy === undefined) ? 1 + Math.sin(t * 3.4) * 0.035 : 1;
    var sx = (o.sx === undefined ? 1 / breath : o.sx), sy = (o.sy === undefined ? breath : o.sy);
    var gx = x + (o.ox || 0), gy = (slimeOk() ? y + r * 0.78 : y + r * 0.4) + (o.oy || 0) - (o.hop || 0);
    var ln = o.lean || 0, fl = o.flip ? -1 : 1, c = Math.cos(ln), s = Math.sin(ln);
    return function (lx, ly) {
      var px = lx * r * fl * sx, py = ly * r * sy;
      return [gx + px * c - py * s, gy + px * s + py * c];
    };
  }
  // Bracinho de gelatina: do ombro (sx, sy) até a mão (hx, hy), mais grosso no ombro; cotovelo dobra para fora do corpo (bx, by = centro do corpo).
  // sleeve (opcional, de armorSleeve): manga da roupa cobrindo o começo do braço, com punho da cor da faixa.
  function drawArm(g, sx, sy, hx, hy, color, r, bx, by, sleeve) {
    var dx = hx - sx, dy = hy - sy, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    var mx = (sx + hx) / 2, my = (sy + hy) / 2, side = (nx * (mx - bx) + ny * (my - by)) >= 0 ? 1 : -1;
    var cx = mx + nx * side * len * 0.2, cy = my + ny * side * len * 0.2 + r * 0.1;
    var w0 = r * 0.44, w1 = r * 0.32, grow = Math.max(2, r * 0.11);
    var inkA = 'rgba(30,18,24,0.9)';
    taper(g, sx, sy, cx, cy, hx, hy, w0, w1, inkA, grow * 1.5);                    // contorno escuro, no traço dos monstros
    var ag = g.createLinearGradient(sx, sy, hx, hy); ag.addColorStop(0, light(color, 0.18)); ag.addColorStop(0.55, color); ag.addColorStop(1, dark(color, 0.14));
    taper(g, sx, sy, cx, cy, hx, hy, w0, w1, ag, 0);
    g.fillStyle = color; g.beginPath(); g.arc(sx, sy, w0 * 0.5, 0, 7); g.fill();       // ombro redondo, se funde com o corpo
    g.strokeStyle = rgba(dark(color, 0.3), 0.45); g.lineWidth = Math.max(1.2, r * 0.05); g.lineCap = 'round'; // dobrinha do cotovelo
    g.beginPath(); g.arc(cx, cy, w1 * 0.32, side > 0 ? 0.3 : 2.2, side > 0 ? 2.4 : 4.3); g.stroke();
    g.save(); g.strokeStyle = rgba('#ffffff', 0.32); g.lineWidth = Math.max(1.4, r * 0.1); g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx + nx * -side * w0 * 0.18, sy + ny * -side * w0 * 0.18 - r * 0.04); g.quadraticCurveTo(cx + nx * -side * w0 * 0.14, cy + ny * -side * w0 * 0.14 - r * 0.04, hx + nx * -side * w1 * 0.12, hy + ny * -side * w1 * 0.12); g.stroke();
    g.restore();
    if (!sleeve) return;
    var wa = function (u) { return w0 + (w1 - w0) * u; };
    var bz = function (u) { var a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u; return [a * sx + b * cx + c * hx, a * sy + b * cy + c * hy]; };
    var sub = function (u0, u1) { var A0 = bz(u0), A1 = bz(u1), k1 = (1 - u0) * (1 - u1), k2 = (1 - u0) * u1 + u0 * (1 - u1), k3 = u0 * u1; return [A0[0], A0[1], k1 * sx + k2 * cx + k3 * hx, k1 * sy + k2 * cy + k3 * hy, A1[0], A1[1]]; };
    var us = 0.46, fat = r * 0.13, ink = 'rgba(22,14,10,0.92)', p = sub(0, us), i, q;
    taper(g, p[0], p[1], p[2], p[3], p[4], p[5], wa(0) + fat, wa(us) + fat, ink, Math.max(2, r * 0.1));
    var sg = g.createLinearGradient(sx, sy - w0 * 0.6, sx, sy + w0 * 0.6); sg.addColorStop(0, light(sleeve.c, 0.25)); sg.addColorStop(1, sleeve.d);
    taper(g, p[0], p[1], p[2], p[3], p[4], p[5], wa(0) + fat, wa(us) + fat, sg, 0);
    for (i = 1; i <= (sleeve.ribs || 0); i++) { // placas ou costuras atravessadas
      var u = us * i / (sleeve.ribs + 1), c0 = bz(u), c1 = bz(u + 0.01), tl = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) || 1, tn = [-(c1[1] - c0[1]) / tl, (c1[0] - c0[0]) / tl], ww = (wa(u) + fat) / 2;
      g.strokeStyle = rgba('#000000', 0.38); g.lineWidth = Math.max(1, r * 0.05); g.lineCap = 'round'; g.beginPath(); g.moveTo(c0[0] + tn[0] * ww, c0[1] + tn[1] * ww); g.lineTo(c0[0] - tn[0] * ww, c0[1] - tn[1] * ww); g.stroke();
    }
    q = sub(us - 0.1, us + 0.02); // punho
    taper(g, q[0], q[1], q[2], q[3], q[4], q[5], wa(us - 0.1) + fat * 1.5, wa(us + 0.02) + fat * 1.5, ink, Math.max(2, r * 0.09));
    taper(g, q[0], q[1], q[2], q[3], q[4], q[5], wa(us - 0.1) + fat * 1.5, wa(us + 0.02) + fat * 1.5, sleeve.trim, 0);
    g.save(); g.strokeStyle = rgba('#ffffff', 0.28); g.lineWidth = Math.max(1.2, r * 0.07); g.lineCap = 'round';
    g.beginPath(); g.moveTo(p[0] + nx * -side * w0 * 0.22, p[1] + ny * -side * w0 * 0.22 - r * 0.04); g.quadraticCurveTo(p[2] + nx * -side * w0 * 0.2, p[3] + ny * -side * w0 * 0.2 - r * 0.04, p[4] + nx * -side * wa(us) * 0.18, p[5] + ny * -side * wa(us) * 0.18); g.stroke();
    g.restore();
  }
  // Mão: bolinha de gelatina (vai por cima do cabo da arma).
  function drawHand(g, x, y, color, r) {
    var rad = r * 0.24;
    g.fillStyle = 'rgba(30,18,24,0.9)'; g.beginPath(); g.arc(x, y, rad + Math.max(2, r * 0.1), 0, 7); g.fill();
    g.beginPath(); g.arc(x + rad * 0.55, y - rad * 0.75, rad * 0.5 + Math.max(2, r * 0.09), 0, 7); g.fill(); // polegar (contorno)
    g.fillStyle = color; g.beginPath(); g.arc(x + rad * 0.55, y - rad * 0.75, rad * 0.5, 0, 7); g.fill();
    var gr = g.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad * 1.1); gr.addColorStop(0, light(color, 0.5)); gr.addColorStop(0.6, color); gr.addColorStop(1, dark(color, 0.22));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(x - rad * 0.3, y - rad * 0.35, rad * 0.28, rad * 0.18, -0.6, 0, 7); g.fill();
    g.strokeStyle = rgba(dark(color, 0.35), 0.55); g.lineWidth = Math.max(1, r * 0.04); g.lineCap = 'round'; // dedinhos agarrando o cabo
    for (var q = -1; q <= 1; q++) { g.beginPath(); g.moveTo(x - rad * 0.2 + q * rad * 0.1, y + rad * 0.15 + q * rad * 0.3); g.lineTo(x + rad * 0.5, y + rad * 0.3 + q * rad * 0.3); g.stroke(); }
  }

  /* ---------- monstros (reserva procedural, vistos de cima) ---------- */
  function ell(g, x, y, rx, ry, fill, rot) { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, 7); g.fill(); }
  // Membro afilado: curva de (x0,y0) até (x1,y1) passando perto de (cx,cy), com largura w0 -> w1 (grow engrossa, para fazer contorno).
  function taper(g, x0, y0, cx, cy, x1, y1, w0, w1, fill, grow) {
    var N = 10, L = [], R = [], k;
    for (k = 0; k <= N; k++) {
      var u = k / N, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      var x = a * x0 + b * cx + c * x1, y = a * y0 + b * cy + c * y1;
      var dx = 2 * (1 - u) * (cx - x0) + 2 * u * (x1 - cx), dy = 2 * (1 - u) * (cy - y0) + 2 * u * (y1 - cy);
      var l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, w = ((w0 + (w1 - w0) * u) + (grow || 0)) / 2;
      L.push([x + nx * w, y + ny * w]); R.push([x - nx * w, y - ny * w]);
    }
    g.fillStyle = fill; g.beginPath(); g.moveTo(L[0][0], L[0][1]);
    for (k = 1; k <= N; k++) g.lineTo(L[k][0], L[k][1]);
    for (k = N; k >= 0; k--) g.lineTo(R[k][0], R[k][1]);
    g.closePath(); g.fill();
  }
  var MOB_DRAW = {
    cogumelo: function (g, r) {
      ell(g, 0, r * 0.25, r * 0.4, r * 0.6, '#d8ccb0');
      var cg = g.createRadialGradient(-r * 0.3, -r * 0.55, r * 0.1, 0, -r * 0.2, r * 1.2);
      cg.addColorStop(0, '#b44a3c'); cg.addColorStop(1, '#4d1a18');
      g.fillStyle = cg; g.beginPath(); g.ellipse(0, -r * 0.1, r * 1.05, r * 0.85, 0, Math.PI, 2 * Math.PI);
      g.quadraticCurveTo(0, r * 0.3, -r * 1.05, -r * 0.1); g.fill();
      g.fillStyle = 'rgba(235,225,200,.85)';
      [[-0.5, -0.55, 0.16], [0.35, -0.7, 0.2], [0.1, -0.3, 0.11], [0.62, -0.32, 0.12]].forEach(function (s) { g.beginPath(); g.arc(s[0] * r, s[1] * r, s[2] * r, 0, 7); g.fill(); });
      g.fillStyle = '#f2c94c'; g.fillRect(-r * 0.2, r * 0.18, r * 0.1, r * 0.1); g.fillRect(r * 0.1, r * 0.18, r * 0.1, r * 0.1);
    },
    coelho: function (g, r, t) {
      ell(g, -r * 0.15, r * 0.15, r * 0.95, r * 0.65, '#6c8466');
      ell(g, -r * 0.8, r * 0.3, r * 0.22, r * 0.22, '#d9e0cf');
      ell(g, r * 0.7, -r * 0.05, r * 0.5, r * 0.45, '#7b9575');
      var w = Math.sin(t * 8) * 0.12;
      ell(g, r * 0.55, -r * 0.8, r * 0.14, r * 0.55, '#6c8466', -0.15 + w);
      ell(g, r * 0.85, -r * 0.78, r * 0.14, r * 0.52, '#5d7458', 0.15 - w);
      ell(g, -r * 0.2, -r * 0.1, r * 0.35, r * 0.2, '#41603a');
      g.fillStyle = '#e0483c'; g.beginPath(); g.arc(r * 0.82, -r * 0.12, r * 0.08, 0, 7); g.fill();
    },
    lobo: function (g, r) {
      ell(g, -r * 0.2, r * 0.1, r * 1.15, r * 0.6, '#464b50');
      ell(g, r * 0.95, -r * 0.05, r * 0.5, r * 0.4, '#555b61');
      ell(g, r * 1.38, 0, r * 0.28, r * 0.17, '#40454a');
      g.fillStyle = '#2f3336'; g.beginPath(); g.moveTo(r * 0.75, -r * 0.35); g.lineTo(r * 0.9, -r * 0.8); g.lineTo(r * 1.05, -r * 0.3); g.fill();
      g.strokeStyle = '#6b4c2b'; g.lineWidth = Math.max(1.5, r * 0.08); g.lineCap = 'round';
      for (var i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(-r * 0.2 + i * r * 0.3, -r * 0.35); g.lineTo(-r * 0.25 + i * r * 0.3, -r * 0.8 - (i & 1) * r * 0.15); g.stroke(); }
      g.fillStyle = '#f2d04a'; g.beginPath(); g.arc(r * 1.05, -r * 0.1, r * 0.07, 0, 7); g.fill();
    },
    javali: function (g, r) {
      ell(g, -r * 0.1, r * 0.1, r * 1.1, r * 0.8, '#5a3b29');
      ell(g, r * 0.95, 0, r * 0.55, r * 0.5, '#6b4733');
      ell(g, r * 1.4, r * 0.05, r * 0.2, r * 0.17, '#3a2519');
      g.fillStyle = '#efe7d0'; g.beginPath(); g.moveTo(r * 1.15, r * 0.25); g.lineTo(r * 1.4, r * 0.65); g.lineTo(r * 1.0, r * 0.4); g.fill();
      g.fillStyle = '#304a2a';
      for (var i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(-r * 0.1 + i * r * 0.26 - r * 0.1, -r * 0.45); g.lineTo(-r * 0.1 + i * r * 0.26, -r * 0.95); g.lineTo(-r * 0.1 + i * r * 0.26 + r * 0.1, -r * 0.45); g.fill(); }
      g.fillStyle = '#e0483c'; g.beginPath(); g.arc(r * 1.05, -r * 0.12, r * 0.07, 0, 7); g.fill();
    },
    // Broto ancião: toco antigo e retorcido, com olhos de brasa, braços de galho e um broto novo na cabeça.
    broto: function (g, r, t) {
      var sw = Math.sin(t * 1.6) * r * 0.05, sw2 = Math.sin(t * 1.6 + 1.3) * r * 0.06, i;
      // raízes que abrem para os lados
      [[-0.55, 0.5, -1.35, 0.9], [-0.28, 0.6, -0.8, 1.0], [0.28, 0.6, 0.8, 1.0], [0.55, 0.5, 1.35, 0.9], [0, 0.62, 0.05, 1.04]].forEach(function (p) {
        taper(g, p[0] * r, p[1] * r, p[2] * r, p[1] * r, p[2] * r, p[3] * r, r * 0.34, r * 0.07, '#1c130b', r * 0.04);
        taper(g, p[0] * r, p[1] * r, p[2] * r, p[1] * r, p[2] * r, p[3] * r, r * 0.3, r * 0.05, '#4b3722', 0);
      });
      // braços de galho (atrás do tronco)
      [[-1, sw], [1, sw2]].forEach(function (a) {
        var s = a[0], w = a[1], ex = s * r * 1.3, ey = -r * 1.05 + w;
        taper(g, s * r * 0.55, -r * 0.4, s * r * 1.45, -r * 0.25, ex, ey, r * 0.3, r * 0.07, '#1c130b', r * 0.04);
        taper(g, s * r * 0.55, -r * 0.4, s * r * 1.45, -r * 0.25, ex, ey, r * 0.26, r * 0.04, '#5a4129', 0);
        taper(g, s * r * 1.12, -r * 0.5, s * r * 1.5, -r * 0.62, s * r * 1.62, -r * 0.8 + w, r * 0.1, r * 0.03, '#5a4129', 0);
        ell(g, ex, ey - r * 0.08, r * 0.2, r * 0.11, '#3d7040', -s * 0.9); ell(g, ex + s * r * 0.17, ey + r * 0.04, r * 0.17, r * 0.09, '#5f9b4a', s * 0.5);
        ell(g, s * r * 1.62, -r * 0.8 + w - r * 0.04, r * 0.14, r * 0.08, '#4e8a3e', -s * 0.4);
      });
      // tronco
      var tg = g.createLinearGradient(-r * 0.85, 0, r * 0.85, 0);
      tg.addColorStop(0, '#2a1d12'); tg.addColorStop(0.32, '#725434'); tg.addColorStop(0.62, '#58402a'); tg.addColorStop(1, '#21170e');
      g.fillStyle = tg; g.strokeStyle = '#1a1009'; g.lineWidth = Math.max(1.5, r * 0.06); g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(-r * 0.75, r * 0.66);
      g.bezierCurveTo(-r * 0.86, r * 0.1, -r * 0.55, -r * 0.15, -r * 0.62, -r * 0.7);
      g.bezierCurveTo(-r * 0.4, -r * 0.98, r * 0.4, -r * 0.98, r * 0.62, -r * 0.7);
      g.bezierCurveTo(r * 0.55, -r * 0.15, r * 0.86, r * 0.1, r * 0.75, r * 0.66);
      g.bezierCurveTo(r * 0.35, r * 0.8, -r * 0.35, r * 0.8, -r * 0.75, r * 0.66);
      g.closePath(); g.fill(); g.stroke();
      // casca
      g.strokeStyle = 'rgba(20,12,6,.5)'; g.lineWidth = Math.max(1, r * 0.04); g.lineCap = 'round';
      [-0.5, -0.24, 0.2, 0.46].forEach(function (x, k) {
        g.beginPath(); g.moveTo(x * r, -r * 0.62 + (k & 1) * r * 0.1);
        g.quadraticCurveTo((x + 0.08 * (k % 2 ? 1 : -1)) * r, r * 0.05, (x + 0.05) * r, r * 0.64); g.stroke();
      });
      ell(g, r * 0.42, r * 0.32, r * 0.13, r * 0.1, '#33230f'); ell(g, r * 0.42, r * 0.32, r * 0.07, r * 0.05, '#47321a');
      // musgo e cogumelinhos
      ell(g, -r * 0.55, r * 0.5, r * 0.28, r * 0.15, 'rgba(78,128,62,.95)'); ell(g, -r * 0.45, r * 0.45, r * 0.15, r * 0.07, 'rgba(120,175,84,.9)');
      ell(g, r * 0.5, -r * 0.4, r * 0.2, r * 0.1, 'rgba(78,128,62,.95)');
      g.fillStyle = '#efe3c4'; g.fillRect(r * 0.57, -r * 0.14, r * 0.045, r * 0.1); ell(g, r * 0.58, -r * 0.16, r * 0.1, r * 0.06, '#e8a24a'); ell(g, r * 0.55, -r * 0.18, r * 0.03, r * 0.015, 'rgba(255,255,255,.6)');
      // rosto: órbitas, brasa, sobrancelhas e boca
      ell(g, -r * 0.27, -r * 0.3, r * 0.18, r * 0.12, '#140b05', 0.35); ell(g, r * 0.27, -r * 0.3, r * 0.18, r * 0.12, '#140b05', -0.35);
      [-1, 1].forEach(function (s) {
        var ex = s * r * 0.27, ey = -r * 0.3, gl = g.createRadialGradient(ex, ey, 0, ex, ey, r * 0.3);
        gl.addColorStop(0, 'rgba(255,190,80,.85)'); gl.addColorStop(0.45, 'rgba(255,140,40,.35)'); gl.addColorStop(1, 'rgba(255,120,30,0)');
        g.fillStyle = gl; g.beginPath(); g.arc(ex, ey, r * 0.3, 0, 7); g.fill();
        ell(g, ex, ey, r * 0.1, r * 0.065, '#ffd27a', s * -0.35);
        g.strokeStyle = '#150c06'; g.lineWidth = Math.max(1.5, r * 0.075);
        g.beginPath(); g.moveTo(s * r * 0.5, -r * 0.56); g.lineTo(s * r * 0.07, -r * 0.4); g.stroke();
      });
      g.fillStyle = '#100803';
      g.beginPath(); g.moveTo(-r * 0.3, r * 0.04); g.lineTo(-r * 0.15, r * 0.11); g.lineTo(0, r * 0.03); g.lineTo(r * 0.15, r * 0.11); g.lineTo(r * 0.3, r * 0.04);
      g.quadraticCurveTo(0, r * 0.42, -r * 0.3, r * 0.04); g.fill();
      g.fillStyle = '#b79a68';
      [-0.17, 0, 0.17].forEach(function (x) { g.beginPath(); g.moveTo((x - 0.05) * r, r * 0.06); g.lineTo(x * r, r * 0.16); g.lineTo((x + 0.05) * r, r * 0.06); g.fill(); });
      // copa de folhas
      [[-0.62, -0.88, 0.4, 0.25, -0.5, '#214423'], [0.62, -0.88, 0.4, 0.25, 0.5, '#214423'], [0, -1.05, 0.52, 0.31, 0, '#2a5330'],
        [-0.4, -0.98, 0.42, 0.27, -0.3, '#336737'], [0.4, -0.98, 0.42, 0.27, 0.3, '#336737'], [0, -0.86, 0.62, 0.28, 0, '#3d7a40'],
        [-0.22, -1.1, 0.3, 0.18, -0.4, '#5f9b4a'], [0.3, -1.06, 0.26, 0.16, 0.4, '#5f9b4a']].forEach(function (l) { ell(g, l[0] * r, l[1] * r, l[2] * r, l[3] * r, l[5], l[4]); });
      // o broto
      var bx = Math.sin(t * 2.2) * r * 0.06;
      g.strokeStyle = '#6fb23f'; g.lineWidth = Math.max(1.5, r * 0.075); g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, -r * 1.1); g.quadraticCurveTo(bx * 0.4, -r * 1.35, bx, -r * 1.58); g.stroke();
      ell(g, bx - r * 0.17, -r * 1.62, r * 0.17, r * 0.09, '#9be05a', -0.6); ell(g, bx + r * 0.17, -r * 1.62, r * 0.17, r * 0.09, '#88d04a', 0.6);
      ell(g, bx - r * 0.2, -r * 1.64, r * 0.08, r * 0.035, 'rgba(255,255,255,.35)', -0.6);
    },
    // Árvore anciã: carvalho gigante e antigo, copa dourada de outono, rosto de brasa no tronco e braços de galho pesados.
    arvore: function (g, r, t) {
      var sw = Math.sin(t * 1.1) * r * 0.04, i;
      [[-0.6, 0.55, -1.5, 0.95], [-0.25, 0.65, -0.7, 1.05], [0.25, 0.65, 0.7, 1.05], [0.6, 0.55, 1.5, 0.95]].forEach(function (p) {
        taper(g, p[0] * r, p[1] * r, p[2] * r, p[1] * r, p[2] * r, p[3] * r, r * 0.4, r * 0.08, '#1a110a', r * 0.04);
        taper(g, p[0] * r, p[1] * r, p[2] * r, p[1] * r, p[2] * r, p[3] * r, r * 0.35, r * 0.05, '#4a3520', 0);
      });
      [-1, 1].forEach(function (s) {
        taper(g, s * r * 0.5, -r * 0.3, s * r * 1.3, -r * 0.2, s * r * 1.45 + sw * s, -r * 0.95, r * 0.34, r * 0.08, '#1a110a', r * 0.04);
        taper(g, s * r * 0.5, -r * 0.3, s * r * 1.3, -r * 0.2, s * r * 1.45 + sw * s, -r * 0.95, r * 0.29, r * 0.05, '#5b4228', 0);
        ell(g, s * r * 1.45 + sw * s, -r * 1.0, r * 0.3, r * 0.17, '#c98a2e', -s * 0.6);
        ell(g, s * r * 1.25 + sw * s, -r * 0.9, r * 0.22, r * 0.12, '#e0b04a', s * 0.5);
      });
      var tg = g.createLinearGradient(-r * 0.9, 0, r * 0.9, 0);
      tg.addColorStop(0, '#24170d'); tg.addColorStop(0.3, '#6e5032'); tg.addColorStop(0.65, '#533b25'); tg.addColorStop(1, '#1d130b');
      g.fillStyle = tg; g.strokeStyle = '#150d07'; g.lineWidth = Math.max(1.5, r * 0.06); g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(-r * 0.85, r * 0.7);
      g.bezierCurveTo(-r * 0.95, r * 0.1, -r * 0.6, -r * 0.3, -r * 0.66, -r * 0.8);
      g.bezierCurveTo(-r * 0.3, -r * 1.0, r * 0.3, -r * 1.0, r * 0.66, -r * 0.8);
      g.bezierCurveTo(r * 0.6, -r * 0.3, r * 0.95, r * 0.1, r * 0.85, r * 0.7);
      g.bezierCurveTo(r * 0.4, r * 0.85, -r * 0.4, r * 0.85, -r * 0.85, r * 0.7);
      g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(15,9,4,.5)'; g.lineWidth = Math.max(1, r * 0.04); g.lineCap = 'round';
      [-0.6, -0.32, 0.3, 0.58].forEach(function (x, k) { g.beginPath(); g.moveTo(x * r, -r * 0.7); g.quadraticCurveTo((x + 0.08 * (k % 2 ? 1 : -1)) * r, r * 0.05, (x + 0.05) * r, r * 0.7); g.stroke(); });
      ell(g, -r * 0.6, r * 0.52, r * 0.3, r * 0.15, 'rgba(78,128,62,.95)'); ell(g, r * 0.55, -r * 0.3, r * 0.2, r * 0.1, 'rgba(78,128,62,.95)');
      // runas de brasa na casca
      var pu = 0.55 + 0.35 * Math.sin(t * 2.4);
      g.strokeStyle = 'rgba(255,180,70,' + pu + ')'; g.lineWidth = Math.max(1.2, r * 0.04);
      g.beginPath(); g.moveTo(-r * 0.62, r * 0.12); g.lineTo(-r * 0.5, r * 0.3); g.lineTo(-r * 0.62, r * 0.46); g.moveTo(r * 0.62, r * 0.12); g.lineTo(r * 0.5, r * 0.3); g.lineTo(r * 0.62, r * 0.46); g.stroke();
      // rosto
      ell(g, -r * 0.28, -r * 0.34, r * 0.2, r * 0.13, '#120a04', 0.3); ell(g, r * 0.28, -r * 0.34, r * 0.2, r * 0.13, '#120a04', -0.3);
      [-1, 1].forEach(function (s) {
        var ex = s * r * 0.28, ey = -r * 0.34, gl = g.createRadialGradient(ex, ey, 0, ex, ey, r * 0.32);
        gl.addColorStop(0, 'rgba(255,215,110,.9)'); gl.addColorStop(0.45, 'rgba(255,160,50,.4)'); gl.addColorStop(1, 'rgba(255,130,30,0)');
        g.fillStyle = gl; g.beginPath(); g.arc(ex, ey, r * 0.32, 0, 7); g.fill();
        ell(g, ex, ey, r * 0.11, r * 0.07, '#fff0b0', s * -0.3);
        g.strokeStyle = '#120a05'; g.lineWidth = Math.max(1.5, r * 0.08);
        g.beginPath(); g.moveTo(s * r * 0.55, -r * 0.62); g.lineTo(s * r * 0.06, -r * 0.44); g.stroke();
      });
      g.fillStyle = '#0e0702';
      g.beginPath(); g.moveTo(-r * 0.34, r * 0.02); g.lineTo(-r * 0.17, r * 0.1); g.lineTo(0, r * 0.01); g.lineTo(r * 0.17, r * 0.1); g.lineTo(r * 0.34, r * 0.02);
      g.quadraticCurveTo(0, r * 0.46, -r * 0.34, r * 0.02); g.fill();
      // copa enorme
      [[-0.75, -1.0, 0.5, 0.3, -0.5, '#8a5a1c'], [0.75, -1.0, 0.5, 0.3, 0.5, '#8a5a1c'], [0, -1.2, 0.65, 0.36, 0, '#a8701f'],
        [-0.5, -1.15, 0.5, 0.3, -0.3, '#c98a2e'], [0.5, -1.15, 0.5, 0.3, 0.3, '#c98a2e'], [0, -1.0, 0.74, 0.32, 0, '#d89a35'],
        [-0.28, -1.32, 0.34, 0.2, -0.4, '#f0c24f'], [0.32, -1.28, 0.3, 0.18, 0.4, '#f0c24f']].forEach(function (l) { ell(g, l[0] * r, l[1] * r, l[2] * r, l[3] * r, l[5], l[4]); });
      for (i = 0; i < 4; i++) { var u = ((t * 0.25 + i / 4) % 1); g.fillStyle = 'rgba(240,190,70,' + (0.8 * (1 - u)) + ')'; g.beginPath(); g.ellipse(-r * 0.9 + i * r * 0.6 + Math.sin(t + i) * r * 0.1, -r * 1.0 + u * r * 1.7, r * 0.06, r * 0.03, u * 6, 0, 7); g.fill(); }
    },
    // Aranha-véu: aranha roxa com marca de ampulheta, olhos de brasa, presas com veneno e um véu de teia por cima.
    aranha: function (g, r, t) {
      var wv = Math.sin(t * 2) * r * 0.05, i, s;
      // pernas: 4 de cada lado, com joelho dobrado
      var ang = [0.6, 0.18, -0.22, -0.6], root = [0.78, 0.52, 0.26, 0.02];
      for (i = 0; i < 4; i++) {
        for (s = -1; s <= 1; s += 2) {
          var step = Math.sin(t * 8 + i * 1.6 + (s > 0 ? Math.PI : 0)) * r * 0.1;
          var sx = root[i] * r, sy = s * r * 0.3;
          var kx = sx + Math.sin(ang[i]) * r * 0.62, ky = sy + s * Math.cos(ang[i]) * r * 0.55 + s * r * 0.12;
          var a2 = ang[i] + (ang[i] > 0 ? 0.55 : -0.55);
          var fx = kx + Math.sin(a2) * r * 0.62 + step, fy = ky + s * Math.cos(a2) * r * 0.5;
          taper(g, sx, sy, kx, ky - s * r * 0.18, kx, ky, r * 0.13, r * 0.085, '#0f0819', r * 0.035);
          taper(g, kx, ky, kx + (fx - kx) * 0.3, ky + (fy - ky) * 0.8, fx, fy, r * 0.085, r * 0.02, '#0f0819', r * 0.035);
          taper(g, sx, sy, kx, ky - s * r * 0.18, kx, ky, r * 0.12, r * 0.075, '#34224f', 0);
          taper(g, kx, ky, kx + (fx - kx) * 0.3, ky + (fy - ky) * 0.8, fx, fy, r * 0.075, r * 0.015, '#34224f', 0);
          ell(g, kx, ky, r * 0.055, r * 0.055, '#5b4290');
        }
      }
      // abdômen
      var ag = g.createRadialGradient(-r * 0.75, -r * 0.22, r * 0.05, -r * 0.5, 0, r * 0.9);
      ag.addColorStop(0, '#8a66c4'); ag.addColorStop(0.45, '#42296b'); ag.addColorStop(1, '#150d26');
      g.fillStyle = ag; g.strokeStyle = 'rgba(8,4,16,.75)'; g.lineWidth = Math.max(1.5, r * 0.05);
      g.beginPath(); g.ellipse(-r * 0.5, 0, r * 0.8, r * 0.64, 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = 'rgba(226,216,250,.55)';
      g.beginPath(); g.moveTo(-r * 1.0, -r * 0.2); g.lineTo(-r * 0.52, -r * 0.05); g.lineTo(-r * 0.05, -r * 0.2); g.lineTo(-r * 0.05, r * 0.2); g.lineTo(-r * 0.52, r * 0.05); g.lineTo(-r * 1.0, r * 0.2); g.closePath(); g.fill();
      g.fillStyle = '#c0342f'; g.beginPath(); g.arc(-r * 0.52, 0, r * 0.06, 0, 7); g.fill();
      ell(g, -r * 0.8, -r * 0.4, r * 0.2, r * 0.07, 'rgba(255,255,255,.22)', -0.3);
      // cefalotórax e cabeça
      var cg = g.createRadialGradient(r * 0.45, -r * 0.15, r * 0.05, r * 0.55, 0, r * 0.6);
      cg.addColorStop(0, '#6d4fa8'); cg.addColorStop(1, '#1d1233');
      g.fillStyle = cg; g.beginPath(); g.ellipse(r * 0.52, 0, r * 0.5, r * 0.42, 0, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(r * 0.95, 0, r * 0.26, r * 0.25, 0, 0, 7); g.fill(); g.stroke();
      // presas, palpos e veneno
      var dr = 0.6 + 0.4 * Math.sin(t * 4);
      [-1, 1].forEach(function (sd) {
        taper(g, r * 1.12, sd * r * 0.13, r * 1.36, sd * r * 0.2, r * 1.44, sd * r * 0.06, r * 0.09, r * 0.012, '#eadfc6', 0);
        taper(g, r * 0.98, sd * r * 0.22, r * 1.15, sd * r * 0.34, r * 1.32, sd * r * 0.3, r * 0.08, r * 0.04, '#2a1b45', 0);
      });
      g.fillStyle = 'rgba(158,255,106,' + (0.5 + 0.4 * dr) + ')'; g.beginPath(); g.arc(r * 1.48, 0, r * 0.045 * (0.8 + dr * 0.4), 0, 7); g.fill();
      // olhos
      [[1.1, -0.09, 0.075], [1.1, 0.09, 0.075], [1.0, -0.2, 0.045], [1.0, 0.2, 0.045], [0.9, -0.12, 0.04], [0.9, 0.12, 0.04], [0.82, -0.22, 0.035], [0.82, 0.22, 0.035]].forEach(function (e) {
        var gl = g.createRadialGradient(e[0] * r, e[1] * r, 0, e[0] * r, e[1] * r, e[2] * r * 2.6);
        gl.addColorStop(0, 'rgba(255,70,60,.8)'); gl.addColorStop(1, 'rgba(255,70,60,0)');
        g.fillStyle = gl; g.beginPath(); g.arc(e[0] * r, e[1] * r, e[2] * r * 2.6, 0, 7); g.fill();
        g.fillStyle = '#ff5a4a'; g.beginPath(); g.arc(e[0] * r, e[1] * r, e[2] * r, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(e[0] * r - e[2] * r * 0.25, e[1] * r - e[2] * r * 0.3, e[2] * r * 0.28, 0, 7); g.fill();
      });
      // véu de teia sobre o abdômen, caindo para trás
      var vg = g.createRadialGradient(-r * 0.6, 0, r * 0.1, -r * 0.8, 0, r * 1.05);
      vg.addColorStop(0, 'rgba(228,218,255,.30)'); vg.addColorStop(1, 'rgba(205,195,245,.08)');
      g.fillStyle = vg; g.strokeStyle = 'rgba(232,225,255,.42)'; g.lineWidth = Math.max(1, r * 0.03); g.lineJoin = 'round';
      var n = 5, topY = -r * 0.85, stepY = (r * 1.7) / n, py = topY;
      g.beginPath(); g.moveTo(-r * 0.02, -r * 0.58);
      g.quadraticCurveTo(-r * 0.55, -r * 1.0 + wv, -r * 1.45, topY);
      for (i = 0; i < n; i++) { g.quadraticCurveTo(-r * 1.45 - r * 0.2 + wv * 0.5, py + stepY / 2, -r * 1.45, py + stepY); py += stepY; }
      g.quadraticCurveTo(-r * 0.55, r * 1.0 - wv, -r * 0.02, r * 0.58);
      g.closePath(); g.fill(); g.stroke();
      // dobras e fios da teia
      g.strokeStyle = 'rgba(232,225,255,.26)'; g.lineWidth = Math.max(1, r * 0.022);
      for (i = 1; i < n; i++) { var ty = topY + i * stepY; g.beginPath(); g.moveTo(-r * 0.12, ty * 0.45); g.quadraticCurveTo(-r * 0.8, ty * 0.75 + wv * 0.3, -r * 1.45, ty); g.stroke(); }
      [0.45, 0.78].forEach(function (k) { g.beginPath(); g.ellipse(-r * 0.75, 0, r * 0.7 * k + r * 0.12, r * 0.55 * k + r * 0.1, 0, Math.PI * 0.55, Math.PI * 1.45); g.stroke(); });
    },
    // Dragão ancestral: grande, de escamas carmim com barriga dourada. Dormindo (st&2) fica enrolado de olhos fechados;
    // st&4 = sopro armado (boca brilha), st&8 = pancada armada (chão racha), st&16 = enfurecido (aura e brasas).
    dragao: function (g, r, t, st) {
      st = st || 0;
      var sleep = (st & 2) !== 0, rage = (st & 16) !== 0, breath = (st & 4) !== 0, slam = (st & 8) !== 0, i;
      var OUT = '#1c0507', SC = rage ? '#a11c1c' : '#7a1f24', SC2 = rage ? '#d4402a' : '#ad3530', BELLY = '#dba95c', HORN = '#eadfc3';
      var sw = Math.sin(t * (sleep ? 0.9 : 1.7)) * r * 0.12, bth = Math.sin(t * (sleep ? 1.1 : 2.6)) * r * (sleep ? 0.035 : 0.02);
      var flap = Math.sin(t * (rage ? 3.6 : 2.2)) * 0.14;
      if (slam) g.translate((Math.random() - 0.5) * r * 0.05, (Math.random() - 0.5) * r * 0.03);
      ell(g, -r * 0.15, r * 0.8, r * 1.9, r * 0.36, 'rgba(0,0,0,.3)');
      if (rage) { var au = g.createRadialGradient(0, -r * 0.2, r * 0.4, 0, -r * 0.2, r * 2.4); au.addColorStop(0, 'rgba(255,90,40,.28)'); au.addColorStop(1, 'rgba(255,60,20,0)'); g.fillStyle = au; g.beginPath(); g.arc(0, -r * 0.2, r * 2.4, 0, 7); g.fill(); }
      // cauda
      var tx = sleep ? -r * 0.2 : -r * 2.6, ty = sleep ? r * 0.82 : r * 0.12 - sw * 1.2, cx = sleep ? -r * 1.9 : -r * 1.9, cy = sleep ? r * 1.0 : r * 0.62 + sw;
      taper(g, -r * 0.85, r * 0.15, cx, cy, tx, ty, r * 0.6, r * 0.05, OUT, r * 0.07);
      taper(g, -r * 0.85, r * 0.15, cx, cy, tx, ty, r * 0.6, r * 0.05, SC, 0);
      taper(g, -r * 0.85, r * 0.25, cx, cy + r * 0.05, tx, ty, r * 0.28, r * 0.02, BELLY, 0);
      g.fillStyle = HORN; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - r * 0.3, ty - r * 0.18); g.lineTo(tx - r * 0.12, ty + r * 0.04); g.lineTo(tx - r * 0.28, ty + r * 0.22); g.closePath(); g.fill();
      // asas
      function wing(ox, k, dk) {
        g.save(); g.translate(ox, 0); g.scale(k, k);
        var sx = -r * 0.3, sy = -r * 0.5;
        var f1 = [-r * 1.7, -r * 1.35 - flap * r], f2 = [-r * 0.65, -r * 2.05 - flap * r * 1.4], f3 = [r * 0.7, -r * 1.7 - flap * r];
        if (sleep) { f1 = [-r * 1.25, -r * 0.35]; f2 = [-r * 0.9, -r * 0.8]; f3 = [-r * 0.1, -r * 0.55]; }
        var mg = g.createLinearGradient(0, sy, 0, f2[1]); mg.addColorStop(0, dk ? '#3a0c12' : '#5a1218'); mg.addColorStop(1, dk ? '#6a1a1c' : '#9a2a2a');
        g.fillStyle = mg; g.strokeStyle = OUT; g.lineWidth = Math.max(1.5, r * 0.05); g.lineJoin = 'round';
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(f1[0], f1[1]);
        g.quadraticCurveTo((f1[0] + f2[0]) / 2 - r * 0.05, (f1[1] + f2[1]) / 2 + r * 0.38, f2[0], f2[1]);
        g.quadraticCurveTo((f2[0] + f3[0]) / 2, (f2[1] + f3[1]) / 2 + r * 0.38, f3[0], f3[1]);
        g.quadraticCurveTo((f3[0] + sx) / 2 + r * 0.1, (f3[1] + sy) / 2 + r * 0.25, sx, sy);
        g.closePath(); g.fill(); g.stroke();
        g.strokeStyle = dk ? '#2a0a0e' : '#c8903a'; g.lineWidth = Math.max(2, r * 0.07); g.lineCap = 'round';
        [f1, f2, f3].forEach(function (f) { g.beginPath(); g.moveTo(sx, sy); g.lineTo(f[0], f[1]); g.stroke(); });
        g.restore();
      }
      wing(r * 0.32, 0.86, true);
      // pernas de trás (longe)
      taper(g, r * 0.5, r * 0.3, r * 0.6, r * 0.75, r * 0.52, r * 1.0, r * 0.3, r * 0.18, SC, r * 0.05);
      // corpo
      var bg = g.createLinearGradient(0, -r * 0.8, 0, r * 0.8); bg.addColorStop(0, SC2); bg.addColorStop(0.55, SC); bg.addColorStop(1, '#3a0e12');
      g.fillStyle = bg; g.strokeStyle = OUT; g.lineWidth = Math.max(2, r * 0.06);
      g.beginPath(); g.ellipse(0, bth * 0.5 + (sleep ? r * 0.08 : 0), r * 1.2, r * 0.74 + bth, 0, 0, 7); g.fill(); g.stroke();
      g.save(); g.beginPath(); g.ellipse(0, bth * 0.5 + (sleep ? r * 0.08 : 0), r * 1.2, r * 0.74 + bth, 0, 0, 7); g.clip();
      ell(g, r * 0.05, r * 0.58, r * 1.15, r * 0.32, BELLY);
      g.strokeStyle = 'rgba(70,30,10,.55)'; g.lineWidth = Math.max(1, r * 0.03);
      for (i = -5; i <= 5; i++) { g.beginPath(); g.moveTo(i * r * 0.2, r * 0.3); g.quadraticCurveTo(i * r * 0.2 + r * 0.04, r * 0.55, i * r * 0.2, r * 0.9); g.stroke(); }
      g.strokeStyle = 'rgba(255,170,120,.16)'; g.lineWidth = Math.max(1, r * 0.025);
      for (i = 0; i < 18; i++) { var sx2 = -r * 1.0 + (i % 6) * r * 0.36 + (i > 5 && i < 12 ? r * 0.18 : 0), sy2 = -r * 0.5 + Math.floor(i / 6) * r * 0.26; g.beginPath(); g.arc(sx2, sy2, r * 0.11, 0.15, Math.PI - 0.15); g.stroke(); }
      g.restore();
      // espinhos nas costas
      g.fillStyle = '#2b0a0d'; g.strokeStyle = OUT; g.lineWidth = 1;
      for (i = 0; i < 8; i++) { var px = -r * 0.95 + i * r * 0.27, py = -r * 0.62 + Math.abs(i - 3.5) * r * 0.045 + (sleep ? r * 0.08 : 0); g.beginPath(); g.moveTo(px - r * 0.08, py); g.lineTo(px, py - r * (0.2 + (i % 2) * 0.07)); g.lineTo(px + r * 0.08, py); g.closePath(); g.fill(); g.stroke(); }
      // perna de trás (perto) e da frente
      ell(g, -r * 0.55, r * 0.38, r * 0.42, r * 0.36, SC); ell(g, -r * 0.6, r * 0.34, r * 0.3, r * 0.22, SC2);
      taper(g, -r * 0.55, r * 0.5, -r * 0.7, r * 0.8, -r * 0.62, r * 1.02, r * 0.3, r * 0.17, OUT, r * 0.05);
      taper(g, -r * 0.55, r * 0.5, -r * 0.7, r * 0.8, -r * 0.62, r * 1.02, r * 0.3, r * 0.17, SC, 0);
      taper(g, r * 0.7, r * 0.3, r * 0.85, r * 0.75, r * 0.8, r * 1.0, r * 0.34, r * 0.2, OUT, r * 0.05);
      taper(g, r * 0.7, r * 0.3, r * 0.85, r * 0.75, r * 0.8, r * 1.0, r * 0.34, r * 0.2, SC, 0);
      g.fillStyle = HORN;
      [[-0.62, 1.02], [0.8, 1.0]].forEach(function (f) { for (var k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(f[0] * r + k * r * 0.1 - r * 0.04, f[1] * r); g.lineTo(f[0] * r + k * r * 0.13 + r * 0.06, f[1] * r + r * 0.17); g.lineTo(f[0] * r + k * r * 0.1 + r * 0.05, f[1] * r); g.fill(); } });
      wing(0, 1, false);
      // pescoço e cabeça
      var hx, hy, ha;
      if (sleep) { hx = r * 1.62; hy = r * 0.42; ha = 0.25; } else { hx = r * 1.7 + Math.sin(t * 1.3) * r * 0.03; hy = -r * 0.98 + bth * 2; ha = 0.1 + (breath ? -0.3 : 0); }
      taper(g, r * 0.8, -r * 0.1, r * 1.5, sleep ? r * 0.1 : -r * 0.2, hx - r * 0.1, hy, r * 0.6, r * 0.42, OUT, r * 0.07);
      taper(g, r * 0.8, -r * 0.1, r * 1.5, sleep ? r * 0.1 : -r * 0.2, hx - r * 0.1, hy, r * 0.6, r * 0.42, SC, 0);
      taper(g, r * 0.85, r * 0.05, r * 1.45, sleep ? r * 0.25 : -r * 0.05, hx - r * 0.1, hy + r * 0.12, r * 0.22, r * 0.2, BELLY, 0);
      g.save(); g.translate(hx, hy); g.rotate(ha);
      var jaw = breath ? 0.62 : sleep ? 0 : 0.12 + Math.max(0, Math.sin(t * 2.6)) * 0.05;
      g.save(); g.translate(-r * 0.05, r * 0.1); g.rotate(jaw);
      ell(g, r * 0.4, r * 0.08, r * 0.46, r * 0.14, '#4a1216'); ell(g, r * 0.4, r * 0.04, r * 0.4, r * 0.08, BELLY);
      g.fillStyle = HORN; for (i = 0; i < 5; i++) { g.beginPath(); g.moveTo(r * (0.12 + i * 0.1), -r * 0.02); g.lineTo(r * (0.15 + i * 0.1), -r * 0.12); g.lineTo(r * (0.18 + i * 0.1), -r * 0.02); g.fill(); }
      g.restore();
      if (breath) { var mg2 = g.createRadialGradient(r * 0.5, r * 0.12, 0, r * 0.5, r * 0.12, r * 0.7); mg2.addColorStop(0, 'rgba(255,240,170,.95)'); mg2.addColorStop(0.4, 'rgba(255,130,40,.7)'); mg2.addColorStop(1, 'rgba(255,60,20,0)'); g.fillStyle = mg2; g.beginPath(); g.arc(r * 0.5, r * 0.12, r * (0.55 + Math.sin(t * 30) * 0.05), 0, 7); g.fill(); }
      g.fillStyle = SC; g.strokeStyle = OUT; g.lineWidth = Math.max(1.5, r * 0.05);
      g.beginPath(); g.ellipse(0, 0, r * 0.46, r * 0.32, 0, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(r * 0.46, r * 0.02, r * 0.46, r * 0.19, 0.05, 0, 7); g.fillStyle = SC2; g.fill(); g.stroke();
      g.fillStyle = HORN; for (i = 0; i < 4; i++) { g.beginPath(); g.moveTo(r * (0.3 + i * 0.12), r * 0.17); g.lineTo(r * (0.33 + i * 0.12), r * 0.29); g.lineTo(r * (0.36 + i * 0.12), r * 0.17); g.fill(); }
      ell(g, r * 0.8, -r * 0.03, r * 0.05, r * 0.035, '#1a0406');
      taper(g, -r * 0.1, -r * 0.2, -r * 0.5, -r * 0.55, -r * 0.82, -r * 0.5, r * 0.2, r * 0.03, OUT, r * 0.04);
      taper(g, -r * 0.1, -r * 0.2, -r * 0.5, -r * 0.55, -r * 0.82, -r * 0.5, r * 0.2, r * 0.03, HORN, 0);
      taper(g, r * 0.1, -r * 0.28, -r * 0.1, -r * 0.7, -r * 0.35, -r * 0.85, r * 0.14, r * 0.02, HORN, 0);
      if (sleep) { g.strokeStyle = '#150304'; g.lineWidth = Math.max(1.5, r * 0.045); g.beginPath(); g.moveTo(r * 0.18, -r * 0.08); g.quadraticCurveTo(r * 0.3, -r * 0.01, r * 0.42, -r * 0.08); g.stroke(); }
      else {
        var eg = g.createRadialGradient(r * 0.3, -r * 0.1, 0, r * 0.3, -r * 0.1, r * 0.3); eg.addColorStop(0, rage ? 'rgba(255,80,50,.95)' : 'rgba(255,200,70,.9)'); eg.addColorStop(1, 'rgba(255,120,30,0)');
        g.fillStyle = eg; g.beginPath(); g.arc(r * 0.3, -r * 0.1, r * 0.3, 0, 7); g.fill();
        g.fillStyle = rage ? '#ffd0b0' : '#fff0a0'; g.beginPath(); g.ellipse(r * 0.3, -r * 0.1, r * 0.1, r * 0.055, -0.35, 0, 7); g.fill();
        g.fillStyle = '#220304'; g.beginPath(); g.ellipse(r * 0.31, -r * 0.1, r * 0.03, r * 0.05, 0, 0, 7); g.fill();
        g.strokeStyle = OUT; g.lineWidth = Math.max(1.5, r * 0.05); g.beginPath(); g.moveTo(r * 0.12, -r * 0.2); g.lineTo(r * 0.46, -r * 0.1); g.stroke();
      }
      g.restore();
      // fumaça das narinas / sonho
      var nx = hx + Math.cos(ha) * r * 0.8, ny = hy + Math.sin(ha) * r * 0.8;
      for (i = 0; i < 3; i++) { var u = ((t * 0.5 + i / 3) % 1); g.fillStyle = 'rgba(190,175,170,' + (0.32 * (1 - u)) + ')'; g.beginPath(); g.arc(nx + u * r * 0.3 + Math.sin(t * 3 + i) * r * 0.05, ny - u * r * 0.7, r * (0.06 + u * 0.12), 0, 7); g.fill(); }
      if (sleep) { g.font = '800 ' + Math.round(r * 0.34) + 'px Alegreya, serif'; g.textAlign = 'center'; for (i = 0; i < 3; i++) { var z = ((t * 0.35 + i / 3) % 1); g.fillStyle = 'rgba(235,225,200,' + (0.8 * (1 - z)) + ')'; g.fillText('z', hx + r * 0.2 + z * r * 0.5 + i * 4, hy - r * 0.5 - z * r * 0.9); } }
      if (slam) { g.strokeStyle = 'rgba(255,100,40,.8)'; g.lineWidth = Math.max(2, r * 0.05); g.beginPath(); g.moveTo(-r * 0.9, r * 1.0); g.lineTo(-r * 1.3, r * 1.25); g.moveTo(r * 0.9, r * 1.0); g.lineTo(r * 1.3, r * 1.2); g.stroke(); }
      if (rage) { for (i = 0; i < 7; i++) { var q = ((t * 0.7 + i * 0.37) % 1); g.fillStyle = 'rgba(255,' + (140 + i * 12) + ',60,' + (0.8 * (1 - q)) + ')'; g.beginPath(); g.arc(-r * 0.9 + ((i * 0.53) % 1.9) * r + Math.sin(t * 2 + i) * r * 0.1, r * 0.2 - q * r * 1.8, r * 0.04, 0, 7); g.fill(); } }
    }
  };
  // Para onde a imagem do monstro olha: 1 = direita, -1 = esquerda, 0 = de frente/de cima (não espelha).
  var FACING = { cogumelo: 0, coelho: 0, lobo: -1, javali: -1, broto: 0, aranha: 0, arvore: 0, dragao: 1 };
  var MOB_COLORS = { cogumelo: '#b44a3c', coelho: '#6c8466', lobo: '#555b61', javali: '#6b4733', broto: '#3d7040', aranha: '#3a2858', arvore: '#8a6a2a', dragao: '#a8322e' };
  /* Dragão ilustrado: três poses (em pé, dormindo, rugindo). Largura em múltiplos de r e posição da boca (fração do desenho).
     Os avisos de sopro e pancada, a fúria, o sono e a fumaça são desenhados por cima, então o jogador continua lendo o que o chefe vai fazer. */
  var DRAGON_POSE = {
    dragao: { w: 4.5, mx: 0.84, my: 0.36, lift: 0 },
    dragao_dormindo: { w: 4.3, mx: 0.86, my: 0.64, lift: 0 },
    dragao_furia: { w: 3.9, mx: 0.76, my: 0.41, lift: 0.14 }
  };
  var dragonCache = {};
  // Cópia do desenho pintada por cima (vermelho da fúria ou branco do golpe), guardada para não refazer a cada quadro.
  function dragonTint(imKey, color) {
    var k = imKey + color;
    if (dragonCache[k]) return dragonCache[k];
    var src = IMG[imKey], c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    return (dragonCache[k] = c);
  }
  function dragonPoseKey(st) {
    if ((st & 2) && IMG.mob_dragao_dormindo) return 'dragao_dormindo';
    if ((st & (4 | 16)) && IMG.mob_dragao_furia) return 'dragao_furia';
    return 'dragao';
  }
  /* Corpo do dragão durante os ataques. an = { k: 'b' sopro | 's' pancada | 'c' garras, w: 0..1 (avanço do aviso), r: 0..1 (tempo desde o golpe) }.
     Devolve a transformação em volta de um pivô (rot em radianos, escala, deslocamento) e o quanto de brilho/poeira desenhar. */
  function ease(u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); }
  function dragonXf(an, r, w) {
    var o = { rot: 0, sx: 1, sy: 1, tx: 0, ty: 0, px: 0, py: r * 0.85, flare: 0, dust: 0 };
    if (!an) return o;
    var u = an.r, q;
    if (an.k === 'b') { // sopro: joga a cabeça para trás e, ao soltar, avança com o pescoço
      if (u == null) { q = ease(an.w); o.rot = -0.14 * q; o.sy = 1 + 0.03 * q; o.tx = -0.07 * r * q; }
      else if (u < 0.14) { q = u / 0.14; o.rot = -0.14 + 0.22 * q * q; o.tx = 0.12 * r * q - 0.07 * r * (1 - q); o.sy = 1.03 - 0.03 * q; o.flare = 1; }
      else { q = 1 - (u - 0.14) / 0.86; o.rot = 0.08 * q * q; o.tx = 0.12 * r * q; o.flare = Math.max(0, 1 - u * 2.2); }
    } else if (an.k === 's') { // pancada: empina nas patas de trás e despenca
      o.px = -0.2 * w;
      if (u == null) { q = ease(an.w); o.rot = -0.27 * q; o.ty = -0.17 * r * q; o.sy = 1 + 0.04 * q; }
      else if (u < 0.18) { q = u / 0.18; o.rot = -0.27 + 0.33 * q * q; o.ty = -0.17 * r * (1 - q) + 0.04 * r * q; o.sy = 1.03 - 0.11 * q; o.sx = 1 + 0.05 * q; o.dust = q; }
      else { q = 1 - (u - 0.18) / 0.82; o.rot = 0.06 * q * q; o.ty = 0.04 * r * q; o.sy = 1 - 0.08 * q * q; o.sx = 1 + 0.05 * q * q; o.dust = 1; }
    } else if (an.k === 'c') { // garras: bote para frente
      q = Math.sin(Math.max(0, Math.min(1, u)) * Math.PI);
      o.tx = 0.3 * r * q; o.rot = 0.05 * q; o.sx = 1 + 0.03 * q;
    }
    return o;
  }
  function drawDragonImg(g, r, t, flash, st, sg, an) {
    st = st || 0;
    var sleep = (st & 2) !== 0, breath = (st & 4) !== 0, slam = (st & 8) !== 0, rage = (st & 16) !== 0, i;
    var pk = dragonPoseKey(st), imKey = 'mob_' + pk, im = IMG[imKey], P = DRAGON_POSE[pk];
    var w = r * P.w, h = w * im.height / im.width;
    var bob = Math.sin(t * (sleep ? 1.1 : 2.6)) * r * (sleep ? 0.02 : 0.04);
    var lift = P.lift * r + (pk === 'dragao_furia' ? Math.sin(t * 3.6) * r * 0.05 : 0);
    var x0 = -w / 2, y0 = r * 0.85 - h + bob - lift;
    var mx = x0 + P.mx * w, my = y0 + P.my * h, xf = dragonXf(an, r, w);
    if (slam) g.translate((Math.random() - 0.5) * r * 0.05, (Math.random() - 0.5) * r * 0.03);
    // sombra no chão (mais larga e mais fraca quando ele paira)
    g.fillStyle = 'rgba(0,0,0,' + (lift > 0 ? 0.26 : 0.36) + ')'; g.beginPath(); g.ellipse(0, r * 0.84, w * 0.36, r * 0.3, 0, 0, 7); g.fill();
    if (rage) { var au = g.createRadialGradient(0, -r * 0.4, r * 0.5, 0, -r * 0.4, r * 2.6); au.addColorStop(0, 'rgba(255,90,40,.3)'); au.addColorStop(1, 'rgba(255,60,20,0)'); g.fillStyle = au; g.beginPath(); g.arc(0, -r * 0.4, r * 2.6, 0, 7); g.fill(); }
    g.save(); g.translate(xf.px + xf.tx, xf.py + xf.ty); g.rotate(xf.rot); g.scale(xf.sx, xf.sy); g.translate(-xf.px, -xf.py); // o corpo todo acompanha o ataque
    g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(im, x0, y0, w, h);
    if (rage) { g.globalAlpha = 0.22 + 0.08 * Math.sin(t * 5); g.drawImage(dragonTint(imKey, 'rgb(255,50,20)'), x0, y0, w, h); }
    if (flash > 0) { g.globalAlpha = Math.min(0.6, flash * 4); g.drawImage(dragonTint(imKey, 'rgb(255,255,255)'), x0, y0, w, h); }
    g.restore();
    // sopro armado: a garganta brilha cada vez mais forte; faíscas são sugadas para a boca. Ao soltar, um clarão
    if (breath) {
      var bw = an && an.k === 'b' ? (an.r != null ? 1 : an.w) : 1, gr = r * (0.3 + 0.34 * bw) + Math.sin(t * 30) * r * 0.03;
      var gl = g.createRadialGradient(mx, my, 0, mx, my, gr * 1.1);
      gl.addColorStop(0, 'rgba(255,240,170,' + (0.55 + 0.4 * bw) + ')'); gl.addColorStop(0.35, 'rgba(255,130,40,' + (0.3 + 0.25 * bw) + ')'); gl.addColorStop(1, 'rgba(255,60,20,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(mx, my, gr * 1.1, 0, 7); g.fill();
      if (an && an.k === 'b' && an.r == null) for (i = 0; i < 7; i++) {
        var sq = ((t * 1.6 + i / 7) % 1), sa = i * 2.4 + Math.floor(t * 1.6 + i / 7) * 1.3, sd = r * (0.12 + 0.75 * (1 - sq));
        g.fillStyle = 'rgba(255,' + (170 + i * 10) + ',80,' + (0.8 * sq * bw) + ')'; g.beginPath(); g.arc(mx + Math.cos(sa) * sd, my + Math.sin(sa) * sd * 0.8, r * 0.03 + r * 0.03 * sq, 0, 7); g.fill();
      }
      if (xf.flare > 0) {
        var fl = g.createRadialGradient(mx, my, 0, mx, my, r * (0.5 + 0.9 * (1 - xf.flare)));
        fl.addColorStop(0, 'rgba(255,250,210,' + 0.95 * xf.flare + ')'); fl.addColorStop(0.4, 'rgba(255,170,60,' + 0.6 * xf.flare + ')'); fl.addColorStop(1, 'rgba(255,90,30,0)');
        g.globalCompositeOperation = 'lighter'; g.fillStyle = fl; g.beginPath(); g.arc(mx, my, r * (0.5 + 0.9 * (1 - xf.flare)), 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
      }
    }
    // fumaça das narinas
    if (!breath) for (i = 0; i < 3; i++) { var u = ((t * 0.5 + i / 3) % 1); g.fillStyle = 'rgba(190,175,170,' + (0.34 * (1 - u)) + ')'; g.beginPath(); g.arc(mx - r * 0.08 + u * r * 0.25 + Math.sin(t * 3 + i) * r * 0.05, my - r * 0.1 - u * r * 0.7, r * (0.06 + u * 0.12), 0, 7); g.fill(); }
    g.restore(); // fim da transformação do ataque
    // pancada: a poeira sobe ao redor das patas quando ele bate no chão
    if (an && an.k === 's' && an.r != null) {
      var du = an.r;
      for (i = 0; i < 12; i++) {
        var da = i / 12 * 6.2832 + 0.4, dd = (0.12 + du * 0.85) * w * 0.5, dr = r * (0.12 + 0.2 * du + (i % 3) * 0.03);
        g.fillStyle = 'rgba(150,126,98,' + (0.4 * Math.max(0, 1 - du * 1.05)) + ')';
        g.beginPath(); g.ellipse(Math.cos(da) * dd, r * 0.86 + Math.sin(da) * dd * 0.28 - du * r * 0.18, dr, dr * 0.7, 0, 0, 7); g.fill();
      }
    }
    // sono: os "z" sobem da cabeça, sem espelhar o texto
    if (sleep) {
      g.save(); g.font = '800 ' + Math.round(r * 0.34) + 'px Alegreya, serif'; g.textAlign = 'center';
      for (i = 0; i < 3; i++) { var z = ((t * 0.35 + i / 3) % 1); g.fillStyle = 'rgba(235,225,200,' + (0.85 * (1 - z)) + ')'; g.save(); g.translate(mx - r * 0.5 + z * r * 0.5 + i * 4, my - r * 0.5 - z * r * 0.9); g.scale(sg, 1); g.fillText('z', 0, 0); g.restore(); }
      g.restore();
    }
    // pancada armada: o chão racha dos dois lados e esquenta embaixo das patas
    if (slam) {
      var sw = an && an.k === 's' ? (an.r != null ? 1 : ease(an.w)) : 1;
      var sgl = g.createRadialGradient(0, r * 0.9, 0, 0, r * 0.9, w * 0.5);
      sgl.addColorStop(0, 'rgba(255,120,40,' + 0.45 * sw + ')'); sgl.addColorStop(1, 'rgba(255,60,20,0)');
      g.fillStyle = sgl; g.beginPath(); g.ellipse(0, r * 0.9, w * 0.5, r * 0.34, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,100,40,.85)'; g.lineWidth = Math.max(2, r * 0.05); g.beginPath();
      g.moveTo(-w * 0.3, r * 0.9); g.lineTo(-w * (0.3 + 0.14 * sw), r * (0.9 + 0.3 * sw)); g.moveTo(-w * 0.34, r * 0.98); g.lineTo(-w * (0.34 + 0.1 * sw), r * (0.98 + 0.12 * sw));
      g.moveTo(w * 0.28, r * 0.9); g.lineTo(w * (0.28 + 0.12 * sw), r * (0.9 + 0.27 * sw)); g.moveTo(w * 0.32, r * 0.98); g.lineTo(w * (0.32 + 0.08 * sw), r * (0.98 + 0.1 * sw)); g.stroke();
    }
    // fúria: brasas sobem em volta do corpo
    if (rage) { for (i = 0; i < 8; i++) { var q = ((t * 0.7 + i * 0.37) % 1); g.fillStyle = 'rgba(255,' + (140 + i * 12) + ',60,' + (0.8 * (1 - q)) + ')'; g.beginPath(); g.arc(-w * 0.35 + ((i * 0.53) % 1.9) * w * 0.35 + Math.sin(t * 2 + i) * r * 0.1, r * 0.3 - q * r * 2.2, r * 0.045, 0, 7); g.fill(); } }
  }
  function drawMob(g, key, x, y, r, t, flip, flash, st, an) {
    var im = IMG['mob_' + key];
    g.save(); g.translate(x, y);
    var f = FACING[key] === undefined ? 1 : FACING[key];
    var mirror = im ? (f === 0 ? false : (f === 1 ? flip : !flip)) : flip;
    if (mirror) g.scale(-1, 1);
    if (im && key === 'dragao') { drawDragonImg(g, r, t, flash, st, mirror ? -1 : 1, an); g.restore(); return; }
    if (im) {
      var s = r * 2.9, ar = im.height / im.width, bob = Math.sin(t * 6 + x * 0.01) * r * 0.05;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, r * 0.7, r * 0.95, r * 0.28, 0, 0, 7); g.fill();
      g.drawImage(im, -s / 2, r * 0.85 - s * ar + bob, s, s * ar);
    } else {
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, r * 0.7, r * 1.0, r * 0.3, 0, 0, 7); g.fill();
      g.translate(0, Math.sin(t * 6 + x * 0.01) * r * 0.05);
      MOB_DRAW[key](g, r, t, st);
    }
    if (flash > 0) { g.fillStyle = 'rgba(255,255,255,' + Math.min(0.6, flash * 4) + ')'; g.beginPath(); g.ellipse(0, 0, r, r * 0.8, 0, 0, 7); g.fill(); }
    g.restore();
  }

  /* ---------- ícones de armas e peitorais (64x64) ---------- */
  function rr(g, x, y, w, h, fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); }
  function star(g, x, y, ro, ri, fill) {
    g.fillStyle = fill; g.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    g.closePath(); g.fill();
  }
  // Materiais por faixa (0 = arma inicial). m = metal, hi = brilho, lo = sombra, wood = cabo, gem = pedra, edge = contorno.
  var MATS = [
    { m: '#c9d3d8', hi: '#f4f8fa', lo: '#7d8991', wood: '#5a4630', gem: '#9fb4be', edge: '#243038' },
    { m: '#aeb6ba', hi: '#e8eef0', lo: '#6a747a', wood: '#6f4e2e', gem: '#c9d3d8', edge: '#242b30' },
    { m: '#9fd8ae', hi: '#e6fbe9', lo: '#4f8f64', wood: '#6a4a2c', gem: '#6fd16f', edge: '#17301f' },
    { m: '#9cc8f2', hi: '#eaf5ff', lo: '#3f78b4', wood: '#4b3a2a', gem: '#4aa3ff', edge: '#10263d' },
    { m: '#c7a1ff', hi: '#f3e8ff', lo: '#7447b8', wood: '#3b2a4a', gem: '#b06cff', edge: '#241238' },
    { m: '#ffd36b', hi: '#fff3c4', lo: '#b9801a', wood: '#5a3a1a', gem: '#ffb020', edge: '#3a2406' },
    { m: '#3a1a22', hi: '#ff9b7a', lo: '#12060a', wood: '#1d1013', gem: '#ff4f6a', edge: '#ff4f6a' }
  ];
  function mgrad(g, x0, y0, x1, y1, M) {
    var gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, M.hi); gr.addColorStop(0.4, M.m); gr.addColorStop(1, M.lo);
    return gr;
  }
  function wgrad(g, x0, y0, x1, y1, M) {
    var gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, light(M.wood, 0.25)); gr.addColorStop(1, dark(M.wood, 0.35));
    return gr;
  }
  function outl(g, M, w) { g.strokeStyle = M.edge; g.lineWidth = w || 1.5; g.lineJoin = 'round'; g.stroke(); }
  function rbox(g, x, y, w, h, r, fill, M, lw) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath(); g.fillStyle = fill; g.fill(); if (M) outl(g, M, lw);
  }
  function glow(g, x, y, r, c, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(c, a === undefined ? 0.9 : a)); gr.addColorStop(1, rgba(c, 0));
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore();
  }
  function gem(g, x, y, r, M) {
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.9, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.9, y); g.closePath();
    g.fillStyle = M.gem; g.fill(); outl(g, M, 1);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(x, y - r * 0.8); g.lineTo(x + r * 0.35, y - r * 0.1); g.lineTo(x - r * 0.3, y - r * 0.1); g.closePath(); g.fill();
    if (M.edge === '#ff4f6a') glow(g, x, y, r * 2.4, M.gem, 0.6);
  }
  function vein(g, M, pts) { // rachaduras de brasa (faixa mítica)
    g.save(); g.strokeStyle = '#ffb36b'; g.lineWidth = 1.6; g.shadowColor = '#ff4f2a'; g.shadowBlur = 5; g.lineCap = 'round';
    g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke(); g.restore();
  }

  var WICON = {
    faca: function (g, M) {
      g.rotate(Math.PI / 4);
      g.beginPath(); g.moveTo(0, -32); g.quadraticCurveTo(8, -19, 6, 8); g.lineTo(-4.5, 8); g.quadraticCurveTo(-5.5, -14, 0, -32); g.closePath();
      g.fillStyle = mgrad(g, -6, 0, 6, 0, M); g.fill(); outl(g, M);
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-0.6, -27); g.lineTo(-1.2, 4); g.stroke();
      rbox(g, -9, 7, 18, 4.5, 2, '#8a6a30', M); rbox(g, -3.2, 11, 6.4, 16, 2.5, wgrad(g, -3, 0, 3, 0, M), M);
      g.fillStyle = '#8a6a30'; g.beginPath(); g.arc(0, 28.5, 3.2, 0, 7); g.fill(); outl(g, M, 1);
    },
    martelo: function (g, M, T) {
      g.rotate(Math.PI / 4);
      rbox(g, -3, -8, 6, 44, 2.5, wgrad(g, -3, 0, 3, 0, M), M);
      g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1.2; for (var i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-3, 14 + i * 4.5); g.lineTo(3, 12 + i * 4.5); g.stroke(); }
      if (T >= 4) { // pontas laterais
        g.fillStyle = mgrad(g, 0, -28, 0, -8, M);
        [[-1, 1], [1, 1]].forEach(function (s) { g.beginPath(); g.moveTo(s[0] * 17, -25); g.lineTo(s[0] * 25, -17.5); g.lineTo(s[0] * 17, -10); g.closePath(); g.fill(); outl(g, M, 1.2); });
      }
      rbox(g, -17, -29, 34, 22, 4, mgrad(g, -17, -29, 17, -7, M), M, 1.8);
      rr(g, -17, -21.5, 34, 3, 'rgba(0,0,0,.25)'); rr(g, -15, -28, 30, 3, 'rgba(255,255,255,.4)');
      rbox(g, -17, -29, 5, 22, 3, T >= 5 ? '#ffd36b' : M.lo, M, 1); rbox(g, 12, -29, 5, 22, 3, T >= 5 ? '#ffd36b' : M.lo, M, 1);
      if (T >= 3) gem(g, 0, -18, 4.4, M);
      if (T === 6) { vein(g, M, [[-10, -27], [-7, -20], [-11, -12]]); vein(g, M, [[10, -27], [7, -21], [11, -10]]); }
    },
    maca: function (g, M, T) {
      g.rotate(Math.PI / 4);
      rbox(g, -2.8, -4, 5.6, 40, 2.5, wgrad(g, -3, 0, 3, 0, M), M);
      rbox(g, -7, 2, 14, 4, 2, M.lo, M, 1);
      var n = T >= 4 ? 10 : 8;
      g.fillStyle = mgrad(g, -14, -30, 14, -4, M);
      for (var i = 0; i < n; i++) {
        var a = i * Math.PI * 2 / n, L = T >= 4 ? 21 : 19;
        g.beginPath(); g.moveTo(Math.cos(a - 0.2) * 11, -17 + Math.sin(a - 0.2) * 11); g.lineTo(Math.cos(a) * L, -17 + Math.sin(a) * L); g.lineTo(Math.cos(a + 0.2) * 11, -17 + Math.sin(a + 0.2) * 11); g.closePath(); g.fill(); outl(g, M, 1);
      }
      g.beginPath(); g.arc(0, -17, 12.5, 0, 7); g.fillStyle = mgrad(g, -10, -27, 10, -7, M); g.fill(); outl(g, M, 1.8);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(-4, -21.5, 4.5, 3, -0.6, 0, 7); g.fill();
      if (T >= 3) gem(g, 0, -17, 4.2, M);
      if (T === 6) { vein(g, M, [[-8, -22], [-3, -17], [-7, -11]]); vein(g, M, [[8, -22], [3, -16], [7, -10]]); }
    },
    espada: function (g, M, T) {
      g.rotate(Math.PI / 4);
      g.beginPath();
      if (T === 6) { // lâmina serrilhada de obsidiana
        g.moveTo(0, -36); g.lineTo(5, -29); g.lineTo(4, -24); g.lineTo(6.5, -19); g.lineTo(5, -13); g.lineTo(7, -7); g.lineTo(5.5, 7); g.lineTo(-5.5, 7); g.lineTo(-7, -7); g.lineTo(-5, -13); g.lineTo(-6.5, -19); g.lineTo(-4, -24); g.lineTo(-5, -29);
      } else { g.moveTo(0, -36); g.lineTo(5.5, -29); g.lineTo(5.5, 7); g.lineTo(-5.5, 7); g.lineTo(-5.5, -29); }
      g.closePath(); g.fillStyle = mgrad(g, -6, 0, 6, 0, M); g.fill(); outl(g, M, 1.6);
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-1.2, -30); g.lineTo(-1.2, 3); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(1.6, -26); g.lineTo(1.6, 3); g.stroke();
      if (T === 6) vein(g, M, [[0, -33], [0, -10], [0, 4]]);
      // guarda
      if (T >= 4) { g.beginPath(); g.moveTo(-17, 4); g.quadraticCurveTo(-10, 5, 0, 9); g.quadraticCurveTo(10, 5, 17, 4); g.lineTo(14, 11); g.quadraticCurveTo(0, 12, -14, 11); g.closePath(); g.fillStyle = T >= 5 ? '#ffd36b' : M.lo; g.fill(); outl(g, M, 1.3); }
      else rbox(g, -13, 6.5, 26, 5, 2, '#8a6a30', M, 1.3);
      rbox(g, -3, 11, 6, 15, 2.5, wgrad(g, -3, 0, 3, 0, M), M, 1.2);
      g.fillStyle = T >= 5 ? '#ffd36b' : '#8a6a30'; g.beginPath(); g.arc(0, 28.5, 3.8, 0, 7); g.fill(); outl(g, M, 1.2);
      if (T >= 3) gem(g, 0, 8.8, 3.2, M);
    },
    rapieira: function (g, M, T) {
      g.rotate(Math.PI / 4);
      g.beginPath(); g.moveTo(0, -37); g.lineTo(2.6, -30); g.lineTo(2.2, 8); g.lineTo(-2.2, 8); g.lineTo(-2.6, -30); g.closePath();
      g.fillStyle = mgrad(g, -3, 0, 3, 0, M); g.fill(); outl(g, M, 1.3);
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-0.6, -32); g.lineTo(-0.6, 6); g.stroke();
      if (T === 6) vein(g, M, [[0, -34], [0, 5]]);
      var gold = T >= 5 ? '#ffd36b' : '#b58d3f';
      g.strokeStyle = M.edge; g.lineWidth = 5; g.beginPath(); g.arc(0, 11, 11, Math.PI * 1.05, Math.PI * 1.95, false); g.stroke();
      g.strokeStyle = gold; g.lineWidth = 3; g.beginPath(); g.arc(0, 11, 11, Math.PI * 1.05, Math.PI * 1.95, false); g.stroke();
      if (T >= 3) { g.strokeStyle = M.edge; g.lineWidth = 4; g.beginPath(); g.arc(0, 11, 6.5, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.strokeStyle = gold; g.lineWidth = 2; g.stroke(); }
      rbox(g, -13, 9.5, 26, 3.4, 1.7, gold, M, 1.1);
      rbox(g, -2.6, 13, 5.2, 13, 2.2, wgrad(g, -3, 0, 3, 0, M), M, 1.1);
      g.fillStyle = gold; g.beginPath(); g.arc(0, 28, 3.2, 0, 7); g.fill(); outl(g, M, 1);
      if (T >= 4) gem(g, 0, 28, 2.4, M);
    },
    arco: function (g, M, T) {
      var wood = T >= 5 ? '#e0b24a' : T === 6 ? '#2a1015' : M.wood;
      g.lineCap = 'round';
      var ex = 14 + Math.cos(Math.PI * 0.64) * 30, ey = Math.sin(Math.PI * 0.64) * 30;
      g.strokeStyle = M.edge; g.lineWidth = 8; g.beginPath(); g.arc(14, 0, 30, Math.PI * 0.64, Math.PI * 1.36); g.stroke();
      g.strokeStyle = wood; g.lineWidth = 5.4; g.beginPath(); g.arc(14, 0, 30, Math.PI * 0.64, Math.PI * 1.36); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1.4; g.beginPath(); g.arc(14, 0, 28.6, Math.PI * 0.68, Math.PI * 1.32); g.stroke();
      g.fillStyle = M.gem; [[ex, ey], [ex, -ey]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], T >= 2 ? 3.4 : 2.4, 0, 7); g.fill(); outl(g, M, 1); });
      if (T >= 3) { g.strokeStyle = M.gem; g.lineWidth = 1.6; g.globalAlpha = 0.9; } else { g.strokeStyle = '#efe6cf'; g.lineWidth = 1.3; }
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex, -ey); g.stroke(); g.globalAlpha = 1;
      rbox(g, -16, -2, 6, 4, 1.5, '#8a6a30', M, 0.8);
      g.strokeStyle = '#d9d2c0'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-14, 0); g.lineTo(22, 0); g.stroke();
      g.fillStyle = mgrad(g, 18, -4, 26, 4, M); g.beginPath(); g.moveTo(30, 0); g.lineTo(21, -4.6); g.lineTo(21, 4.6); g.closePath(); g.fill(); outl(g, M, 1);
      g.fillStyle = T >= 3 ? M.gem : '#9a8f7a'; g.beginPath(); g.moveTo(-14, 0); g.lineTo(-19, -4); g.lineTo(-17, 0); g.lineTo(-19, 4); g.closePath(); g.fill();
      if (T >= 4) gem(g, 14 - 30 + 0.5, 0, 3.4, M);
      if (T === 6) glow(g, 26, 0, 9, '#ff7a3a', 0.8);
    },
    chicote: function (g, M, T) {
      rbox(g, -27, 11, 20, 7, 3, wgrad(g, 0, 11, 0, 18, M), M, 1.3);
      g.fillStyle = T >= 5 ? '#ffd36b' : '#8a6a30'; g.fillRect(-9, 10.5, 3.4, 8);
      var path = function () { g.beginPath(); g.moveTo(-8, 14); g.bezierCurveTo(10, 26, 30, 4, 11, -8); g.bezierCurveTo(-2, -17, 8, -29, 23, -27); };
      g.lineCap = 'round'; g.lineJoin = 'round';
      path(); g.strokeStyle = M.edge; g.lineWidth = 5.2; g.stroke();
      path(); g.strokeStyle = T === 6 ? '#5a2430' : T >= 5 ? '#e0b24a' : mixc(M.wood, '#c9a46a', 0.5); g.lineWidth = 3.2; g.stroke();
      path(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 0.9; g.stroke();
      if (T >= 3) { g.fillStyle = M.gem; [[24, 8, 0], [18, -2, 0], [10, -6, 0]].forEach(function (p) { g.beginPath(); g.arc(p[0] - 1, p[1] - 4, 1.8, 0, 7); g.fill(); }); }
      g.fillStyle = T >= 4 ? M.gem : M.m;
      g.beginPath(); g.moveTo(23, -27); g.lineTo(31, -30); g.lineTo(26, -23); g.closePath(); g.fill(); outl(g, M, 1);
      if (T === 6) glow(g, 26, -27, 8, '#ff7a3a', 0.8);
    },
    varinha: function (g, M, T) {
      g.rotate(Math.PI / 4);
      rbox(g, -2.4, -20, 4.8, 49, 2.2, wgrad(g, -2, 0, 2, 0, M), M, 1.3);
      g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1; for (var i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-2.4, 8 + i * 4.5); g.lineTo(2.4, 6 + i * 4.5); g.stroke(); }
      rbox(g, -4.5, -21, 9, 3.6, 1.8, T >= 5 ? '#ffd36b' : M.lo, M, 1);
      var gc = T === 6 ? '#ff7a3a' : M.gem === '#c9d3d8' ? '#9fe8c0' : M.gem;
      glow(g, 0, -28, 14 + T * 1.2, gc, 0.55 + T * 0.05);
      star(g, 0, -28, 9 + (T >= 4 ? 2 : 0), 4, gc); g.beginPath();
      g.strokeStyle = M.edge; g.lineWidth = 1; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(0, -28, 2.6, 0, 7); g.fill();
      if (T >= 3) { g.fillStyle = gc; [[-11, -33, 1.6], [10, -22, 1.4], [-8, -19, 1.2]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], p[2], 0, 7); g.fill(); }); }
    },
    cajado: function (g, M, T) {
      g.rotate(Math.PI / 4);
      rbox(g, -2.8, -20, 5.6, 56, 2.5, wgrad(g, -3, 0, 3, 0, M), M, 1.4);
      var gold = T >= 5 ? '#ffd36b' : '#8a6a30';
      g.strokeStyle = M.edge; g.lineWidth = 5; g.beginPath(); g.arc(0, -27, 10.5, Math.PI * 0.12, Math.PI * 0.88, true); g.stroke();
      g.strokeStyle = gold; g.lineWidth = 3; g.beginPath(); g.arc(0, -27, 10.5, Math.PI * 0.12, Math.PI * 0.88, true); g.stroke();
      var oc = T === 6 ? '#ff7a3a' : M.gem === '#c9d3d8' ? '#8fb8ff' : M.gem;
      glow(g, 0, -27, 15 + T, oc, 0.7);
      var gr = g.createRadialGradient(-2, -29, 1, 0, -27, 8); gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, oc); gr.addColorStop(1, dark(oc, 0.45));
      g.fillStyle = gr; g.beginPath(); g.arc(0, -27, 7.4, 0, 7); g.fill(); outl(g, M, 1.2);
      if (T >= 3) { [[-15, -34, 3], [15, -34, 3], [0, -41, 2.6]].forEach(function (p) { g.save(); g.translate(p[0], p[1]); g.rotate(p[0] / 20); gem(g, 0, 0, p[2], M); g.restore(); }); }
      rbox(g, -4.5, 8, 9, 3, 1.5, gold, M, 0.9);
    },
    sinos: function (g, M, T) {
      var gold = T >= 5 ? '#ffd36b' : '#6a4a1c';
      [[-11, 3, -0.12], [11.5, -2, 0.1]].forEach(function (b) {
        g.save(); g.translate(b[0], b[1]); g.rotate(b[2]);
        g.beginPath(); g.moveTo(-11, 15); g.bezierCurveTo(-11, -2, -8, -15, 0, -15); g.bezierCurveTo(8, -15, 11, -2, 11, 15); g.closePath();
        g.fillStyle = mgrad(g, -11, -10, 11, 10, M); g.fill(); outl(g, M, 1.6);
        rbox(g, -12.5, 12.5, 25, 4.5, 2.2, M.lo, M, 1.2);
        g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.ellipse(-4, -3, 1.9, 8, 0.12, 0, 7); g.fill();
        g.fillStyle = gold; g.beginPath(); g.arc(0, 20, 3.2, 0, 7); g.fill(); outl(g, M, 1);
        g.strokeStyle = gold; g.lineWidth = 1.8; g.beginPath(); g.arc(0, -16.5, 3, Math.PI, 0); g.stroke();
        if (T >= 3) { g.strokeStyle = M.gem; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 4, 5, 0.3, Math.PI - 0.3); g.stroke(); g.beginPath(); g.arc(0, 4, 8, 0.4, Math.PI - 0.4); g.stroke(); }
        if (T === 6) { glow(g, 0, 20, 7, '#ff7a3a', 0.9); vein(g, M, [[3, -9], [0, -2], [4, 6]]); }
        g.restore();
      });
    }
  };
  function mixc(a, b, t) { return mix(a, b, t); }
  function armorIcon(g, type, tier) {
    var tc = tier > 0 ? GD.TIER_COLORS[tier - 1] : '#7fd69a';
    var base = tier === 0 ? 'rgba(120,210,150,.75)' : (type === 'vital' ? '#8a5a38' : type === 'arcano' ? '#4b4fa8' : type === 'draco' ? '#a8261c' : '#8d969d');
    var edge = tier === 0 ? '#bff0cf' : tc;
    g.fillStyle = base; g.strokeStyle = edge; g.lineWidth = 2.5; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-9, -26); g.lineTo(-24, -20); g.lineTo(-22, -6); g.lineTo(-14, -8); g.lineTo(-15, 26); g.lineTo(15, 26); g.lineTo(14, -8); g.lineTo(22, -6); g.lineTo(24, -20); g.lineTo(9, -26);
    g.quadraticCurveTo(0, -16, -9, -26); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-8, -14); g.lineTo(-9, 22); g.stroke();
    if (type === 'vital' || tier === 0) {
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, -16); g.lineTo(0, 26); g.stroke(); g.setLineDash([]);
      g.fillStyle = edge; for (var i = 0; i < 3; i++) { g.beginPath(); g.arc(0, -6 + i * 10, 1.8, 0, 7); g.fill(); }
    } else if (type === 'arcano') {
      var gl = g.createRadialGradient(0, 4, 1, 0, 4, 12); gl.addColorStop(0, '#e6c8ff'); gl.addColorStop(1, 'rgba(180,120,255,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(0, 4, 12, 0, 7); g.fill(); star(g, 0, 4, 6, 2.5, '#fff');
    } else {
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5;
      for (var j = 0; j < 3; j++) { g.beginPath(); g.moveTo(-14, -2 + j * 9); g.lineTo(14, -2 + j * 9); g.stroke(); }
      g.fillStyle = edge; [[-18, -17], [18, -17], [-10, 22], [10, 22]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 1.8, 0, 7); g.fill(); });
    }
    if (tier >= 4) { glow(g, 0, 0, 30, tc, 0.18 + (tier - 4) * 0.08); }
    if (tier === 5) { g.strokeStyle = 'rgba(255,240,180,.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-22, -18); g.lineTo(-10, -24); g.moveTo(22, -18); g.lineTo(10, -24); g.stroke(); }
  }
  // Ícone completo: brilho atrás (faixas altas) + arma com o material da faixa.
  function procIcon(item) {
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var g = c.getContext('2d'); g.translate(32, 32);
    if (item.kind === 'weapon') {
      var T = item.tier, M = MATS[T] || MATS[0];
      if (T >= 4) glow(g, 0, 0, 30, GD.TIER_COLORS[T - 1], T === 4 ? 0.28 : T === 5 ? 0.4 : 0.55);
      g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 3; g.shadowOffsetY = 1.5;
      WICON[item.fam](g, M, T);
      g.restore();
      if (T >= 5) { // faíscas
        g.save(); g.globalCompositeOperation = 'lighter';
        var R = rng(item.id.length * 97 + T), n = T === 6 ? 9 : 5;
        for (var i = 0; i < n; i++) { var x = (R() - 0.5) * 54, y = (R() - 0.5) * 54; g.fillStyle = rgba(T === 6 ? '#ffb36b' : '#fff3c4', 0.5 + R() * 0.4); g.beginPath(); g.arc(x, y, 0.8 + R() * 1.2, 0, 7); g.fill(); }
        g.restore();
      }
    } else armorIcon(g, item.type, item.tier);
    return c;
  }
  // Canvas "cru" do item (imagem do jogador, se existir; senão o desenho de reserva).
  var rawCache = {};
  function itemCanvas(id) {
    var it = ITEMS[id];
    var name = it.kind === 'weapon' ? 'weapon_' + it.fam : 'armor_' + (it.tier === 0 ? 'vital' : it.type);
    if (IMG[name]) return IMG[name];
    return rawCache[id] || (rawCache[id] = procIcon(it));
  }
  function weaponCanvas(id) { return itemCanvas(id); }
  // Onde a mão segura cada arma e para onde ela aponta. Nos desenhos do Higgsfield cada arma aponta para um lado:
  // H = ponta do cabo, P = parte que bate (frações do desenho), t = onde fica a mão (0 = cabo, 1 = ponta).
  // G = ponto de empunhadura direto e tip = ângulo para onde aponta (radianos, y para baixo), para o arco e os sinos.
  var WGEO_IMG = {
    faca: { H: [0.11, 0.04], P: [0.97, 0.98], t: 0.15 },
    martelo: { H: [0.91, 0.96], P: [0.26, 0.2], t: 0.22 },
    maca: { H: [0.9, 0.96], P: [0.29, 0.27], t: 0.22 },
    espada: { H: [0.1, 0.04], P: [0.97, 0.98], t: 0.13 },
    rapieira: { H: [0.08, 0.03], P: [0.97, 0.98], t: 0.12 },
    arco: { G: [0.21, 0.51], tip: Math.PI },
    chicote: { H: [0.92, 0.92], P: [0.52, 0.28], t: 0.3 },
    varinha: { H: [0.94, 0.97], P: [0.3, 0.12], t: 0.3 },
    cajado: { H: [0.53, 0.97], P: [0.47, 0.08], t: 0.36 },
    sinos: { G: [0.5, 0.12], tip: -Math.PI / 2 }
  };
  // Desenhos de reserva (feitos por código): a ponta aponta para cima e para a direita.
  var WGEO_PROC = { _: { G: [0.4, 0.6], tip: -Math.PI / 4 }, arco: { G: [0.5, 0.5], tip: 0 }, sinos: { G: [0.5, 0.3], tip: -Math.PI / 2 } };
  var geoCache = {};
  // { gx, gy: empunhadura (fração do desenho), tip: ângulo da ponta no desenho, len: da mão até a ponta, em múltiplos do lado maior }
  function weaponGeo(id) {
    var it = ITEMS[id], cv = itemCanvas(id), isImg = !!IMG['weapon_' + it.fam], key = id + (isImg ? 'i' : 'p');
    if (geoCache[key]) return geoCache[key];
    var d = isImg ? WGEO_IMG[it.fam] : (WGEO_PROC[it.fam] || WGEO_PROC._), out;
    if (!d) out = { gx: 0.5, gy: 0.5, tip: -Math.PI / 4, len: 0.5 };
    else if (d.G) out = { gx: d.G[0], gy: d.G[1], tip: d.tip, len: 0.5 };
    else {
      var ar = cv.height / cv.width, w1 = ar > 1 ? 1 / ar : 1, h1 = ar > 1 ? 1 : ar;
      var vx = (d.P[0] - d.H[0]) * w1, vy = (d.P[1] - d.H[1]) * h1;
      out = { gx: d.H[0] + (d.P[0] - d.H[0]) * d.t, gy: d.H[1] + (d.P[1] - d.H[1]) * d.t, tip: Math.atan2(vy / h1 * cv.height, vx / w1 * cv.width), len: (1 - d.t) * Math.hypot(vx, vy) };
    }
    out.img = isImg;
    return (geoCache[key] = out);
  }
  var iconCache = {};
  function iconURL(id) {
    if (iconCache[id]) return iconCache[id];
    var it = ITEMS[id], tc = it.tier > 0 ? GD.TIER_COLORS[it.tier - 1] : '#6b5a44';
    var c = document.createElement('canvas'); c.width = 72; c.height = 72;
    var g = c.getContext('2d');
    var bg = g.createRadialGradient(36, 30, 4, 36, 36, 48); bg.addColorStop(0, rgba(tc, it.tier > 0 ? 0.32 : 0.12)); bg.addColorStop(1, '#0e0b08');
    g.fillStyle = bg; g.fillRect(0, 0, 72, 72);
    var src = itemCanvas(id), s = src === rawCache[id] ? 64 : 56, ar = src.height / src.width;
    var w = ar > 1 ? s / ar : s, h = ar > 1 ? s : s * ar;
    g.drawImage(src, 36 - w / 2, 36 - h / 2, w, h);
    g.strokeStyle = tc; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 69, 69);
    if (it.tier === 6) { g.strokeStyle = 'rgba(255,200,140,.7)'; g.lineWidth = 1; g.strokeRect(5, 5, 62, 62); }
    return (iconCache[id] = c.toDataURL());
  }


  /* ---------- mapa em blocos ----------
     O mundo é grande (7200 x 4500): em vez de uma imagem gigante, cada bloco de 640 x 640 é pintado quando aparece na tela
     e guardado. Os enfeites saem de "células" com sorteio fixo, então os blocos se encaixam sem emenda e o mapa é sempre igual. */
  var TILE = 640, TSC = 0.7, CELL = 128, MARGIN = 170, tiles = {}, tileKeys = [], MAX_TILES = 48;
  var LAIR = (GD.BOSS && GD.BOSS.clear) || 330;
  var GROUND = [[0, '#7a6a58'], [0.09, '#6d6672'], [0.16, '#6a6088'], [0.28, '#5f8a3c'], [0.4, '#7d8d3e'], [0.54, '#4f9a47'], [0.71, '#62b04c'], [0.9, '#3f8f45'], [1.0, '#2b6b3b'], [1.08, '#1a4a2a']];
  function hash2(a, b, s) {
    var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 144665)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h = Math.imul(h ^ (h >>> 16), 2246822519);
    return (h ^ (h >>> 15)) >>> 0;
  }
  function ndist(x, y) { return Math.hypot((x - W.cx) / W.rx, (y - W.cy) / W.ry); }
  function tileKey(ix, iy) { return ix + ',' + iy; }
  function paintTile(g, tx, ty) {
    var TAU = Math.PI * 2, i, k;
    g.setTransform(TSC, 0, 0, TSC, -tx * TSC, -ty * TSC);
    g.fillStyle = '#10301b'; g.fillRect(tx - 2, ty - 2, TILE + 4, TILE + 4);
    g.save(); g.translate(W.cx, W.cy); g.scale(1, W.ry / W.rx);
    var R0 = W.rx * 1.08, rg = g.createRadialGradient(0, 0, 0, 0, 0, R0);
    GROUND.forEach(function (s) { rg.addColorStop(Math.min(1, s[0] / 1.08), s[1]); });
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, R0, 0, TAU); g.fill(); g.restore();
    var L = { patch: [], grass: [], small: [], ring: [], tree: [] };
    var c0 = Math.floor((tx - MARGIN) / CELL), c1 = Math.floor((tx + TILE + MARGIN) / CELL), r0 = Math.floor((ty - MARGIN) / CELL), r1 = Math.floor((ty + TILE + MARGIN) / CELL);
    var cx, cy;
    for (cy = r0; cy <= r1; cy++) for (cx = c0; cx <= c1; cx++) {
      var R = rng(hash2(cx, cy, 5)), x0 = cx * CELL, y0 = cy * CELL, n0 = ndist(x0 + CELL / 2, y0 + CELL / 2), x, y, p;
      var px = function () { return x0 + R() * CELL; }, py = function () { return y0 + R() * CELL; };
      if (n0 < 1.08) {
        if (R() < 0.6) L.patch.push([px(), py(), 40 + R() * 110, 25 + R() * 70, R() * 3, R() < 0.5 ? '#3b5a30' : '#4a3a24', 0.1 + R() * 0.1]);
        for (i = 0; i < 20; i++) { x = px(); y = py(); if (ndist(x, y) < 1.0) L.grass.push([x, y, ['#4d7040', '#3b5c33', '#5d8348', '#2f4a2b'][(R() * 4) | 0], 1.2 + R() * 1.4, (R() - 0.5) * 7, 5 + R() * 9, 0.25 + R() * 0.35]); }
        if (R() < 0.7) { x = px(); y = py(); if (ndist(x, y) < 1.0) L.small.push(['stone', x, y, 4 + R() * 9, 3 + R() * 6, R() * 3, 0.55 + R() * 0.3]); }
        var fl = n0 > 0.62 && n0 < 0.8 ? 1.6 : 0.5;
        for (i = 0; R() < fl - i * 0.7 && i < 3; i++) { x = px(); y = py(); if (ndist(x, y) < 1.0) L.small.push(['flower', x, y, 2 + R() * 1.6, ['#ffd84a', '#d98ae6', '#ffffff', '#ff9a6b', '#ff7fa8', '#8ec5ff'][(R() * 4) | 0]]); }
        if (R() < 0.05) { x = px(); y = py(); if (ndist(x, y) < 0.98) L.small.push(['log', x, y, R() * 3, 60 + R() * 70]); }
        if (n0 > 0.8 && n0 < 1.0) { for (i = 0; i < 2 && R() < 0.65; i++) { x = px(); y = py(); if (ndist(x, y) < 1.0) L.ring.push(['shroom', x, y, 0.7 + R() * 0.9]); } }
        else if (n0 > 0.46 && n0 < 0.62) { for (i = 0; i < 2 && R() < 0.7; i++) { x = px(); y = py(); L.ring.push(['fern', x, y, 0.7 + R() * 0.8, R() * 6.28]); } }
        else if (n0 > 0.34 && n0 < 0.46) { if (R() < 0.45) { x = px(); y = py(); L.ring.push(['mud', x, y, 22 + R() * 40, R() * 3]); } if (R() < 0.6) { x = px(); y = py(); L.ring.push(['thorn', x, y, 0.8 + R() * 0.7]); } }
        else if (n0 > 0.22 && n0 < 0.34) { for (i = 0; i < 2 && R() < 0.5; i++) { x = px(); y = py(); L.ring.push(['root', x, y, 40 + R() * 70, R() * 6.28]); } }
        else if (n0 > 0.07 && n0 < 0.22) { if (R() < 0.5) { x = px(); y = py(); L.ring.push(['web', x, y, 24 + R() * 40, R() * 3]); } }
      }
      if (n0 > 0.96 && n0 < 1.75) {
        for (i = 0; i < 3 && R() < (n0 < 1.5 ? 0.85 : 0.6) - i * 0.25; i++) { x = px(); y = py(); L.tree.push([x, y, 55 + R() * 70, (R() * 4) | 0]); }
      }
      if (n0 > 1.5 && R() < 0.45) L.tree.push([px(), py(), 70 + R() * 80, 9]);
      if (n0 > 1.0 && n0 < 1.55 && R() < 0.035) L.tree.push([px(), py(), 170 + R() * 40, 8]); // árvore anciã (rara)
    }
    var OUTL = '#0c2214';
    // manchas de grama clara e escura, com borda suave
    L.patch.forEach(function (o) {
      var lite = o[5] === '#3b5a30';
      g.fillStyle = lite ? 'rgba(150,225,100,' + (o[6] * 1.8) + ')' : 'rgba(40,95,50,' + (o[6] * 2.2) + ')';
      g.beginPath(); g.ellipse(o[0], o[1], o[2], o[3], o[4], 0, 7); g.fill();
    });
    g.lineCap = 'round'; g.lineJoin = 'round';
    // tufos de grama: três folhas com contorno escuro, como o traço dos monstros
    L.grass.forEach(function (o, idx) {
      if (idx % 4) return;
      var x = o[0], y = o[1], h = o[5] * 1.7, w = o[4] * 1.5, i2;
      for (i2 = 0; i2 < 2; i2++) {
        g.strokeStyle = i2 ? ['#8ad65a', '#6cc04d', '#a4e36a'][idx % 3] : OUTL; g.lineWidth = i2 ? 2.6 : 5.2;
        g.beginPath(); g.moveTo(x - 5, y); g.quadraticCurveTo(x - 6 + w * 0.3, y - h * 0.6, x - 8 + w, y - h * 0.8);
        g.moveTo(x, y); g.quadraticCurveTo(x + w * 0.2, y - h * 0.7, x + w * 0.5, y - h * 1.15);
        g.moveTo(x + 5, y); g.quadraticCurveTo(x + 6 + w * 0.2, y - h * 0.5, x + 9 + w * 0.3, y - h * 0.7); g.stroke();
      }
    });
    L.ring.forEach(function (o) {
      var x = o[1], y = o[2], s = o[3] * 1.7;
      switch (o[0]) {
        case 'shroom': { // margarida: oito pétalas brancas, miolo amarelo (o tipo se chama 'shroom' só por causa do anel de geração)
          var dr = 5.5 * s, dk;
          g.lineWidth = 2.6; g.strokeStyle = OUTL; g.lineCap = 'round';
          g.beginPath(); g.moveTo(x, y + dr * 0.6); g.lineTo(x + 2, y + dr * 2.6); g.stroke();
          g.fillStyle = '#fbfbf4';
          for (dk = 0; dk < 8; dk++) { var da = dk * 0.7854; g.beginPath(); g.ellipse(x + Math.cos(da) * dr * 0.95, y + Math.sin(da) * dr * 0.95, dr * 0.62, dr * 0.3, da, 0, 7); g.stroke(); }
          for (dk = 0; dk < 8; dk++) { var db = dk * 0.7854; g.beginPath(); g.ellipse(x + Math.cos(db) * dr * 0.95, y + Math.sin(db) * dr * 0.95, dr * 0.62, dr * 0.3, db, 0, 7); g.fill(); }
          g.fillStyle = '#ffcf3a'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, dr * 0.5, 0, 7); g.stroke(); g.fill();
          ell(g, x - dr * 0.15, y - dr * 0.15, dr * 0.16, dr * 0.12, 'rgba(255,255,255,.7)');
          break; }
        case 'fern':
          for (var pass = 0; pass < 2; pass++) { g.strokeStyle = pass ? '#7fd05a' : OUTL; g.lineWidth = pass ? 3 : 6;
            for (k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(o[4] + k * 0.28) * 12 * s, y + Math.sin(o[4] + k * 0.28) * 7 * s, x + Math.cos(o[4] + k * 0.34) * 22 * s, y + Math.sin(o[4] + k * 0.34) * 13 * s); g.stroke(); } }
          break;
        case 'mud': g.lineWidth = 3.5; g.strokeStyle = '#2a1b0e'; g.fillStyle = '#7a5532'; g.beginPath(); g.ellipse(x, y, o[3] * 1.2, o[3] * 0.62, o[4], 0, 7); g.stroke(); g.fill();
          ell(g, x - o[3] * 0.25, y - o[3] * 0.15, o[3] * 0.55, o[3] * 0.2, 'rgba(255,225,170,.35)', o[4]); break;
        case 'thorn': g.lineWidth = 3; g.strokeStyle = OUTL; g.fillStyle = '#4c9a3a';
          for (k = 0; k < 7; k++) { var ta = k * 0.9; g.beginPath(); g.moveTo(x + Math.cos(ta - 0.25) * 6 * s, y + Math.sin(ta - 0.25) * 4.5 * s); g.lineTo(x + Math.cos(ta) * 17 * s, y + Math.sin(ta) * 12 * s - 6 * s); g.lineTo(x + Math.cos(ta + 0.25) * 6 * s, y + Math.sin(ta + 0.25) * 4.5 * s); g.closePath(); g.stroke(); g.fill(); }
          break;
        case 'root': for (var pr2 = 0; pr2 < 2; pr2++) { g.strokeStyle = pr2 ? '#a77a4a' : '#2a1a0d'; g.lineWidth = pr2 ? 5 : 10;
            g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + Math.cos(o[4]) * o[3] * 0.4, y + Math.sin(o[4]) * o[3] * 0.7, x + Math.cos(o[4] + 1) * o[3] * 0.8, y + Math.sin(o[4] + 1) * o[3] * 0.5, x + Math.cos(o[4] + 0.6) * o[3], y + Math.sin(o[4] + 0.6) * o[3] * 0.6); g.stroke(); }
          break;
        case 'web': g.strokeStyle = 'rgba(245,238,255,.6)'; g.lineWidth = 2;
          for (k = 0; k < 8; k++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(k * 0.785 + o[4]) * o[3] * 1.2, y + Math.sin(k * 0.785 + o[4]) * o[3] * 0.7); g.stroke(); }
          for (k = 1; k < 4; k++) { g.beginPath(); g.ellipse(x, y, o[3] * 0.4 * k, o[3] * 0.24 * k, o[4], 0, 7); g.stroke(); }
          break;
      }
    });
    L.small.forEach(function (o) {
      switch (o[0]) {
        case 'stone': // pedra gordinha com contorno e brilho
          g.lineWidth = 3.4; g.strokeStyle = OUTL; g.fillStyle = '#b3bdb4';
          g.beginPath(); g.ellipse(o[1], o[2], o[3] * 1.7, o[4] * 1.7, o[5], 0, 7); g.stroke(); g.fill();
          g.save(); g.beginPath(); g.ellipse(o[1], o[2], o[3] * 1.7, o[4] * 1.7, o[5], 0, 7); g.clip();
          ell(g, o[1] + o[3] * 0.6, o[2] + o[4] * 1.3, o[3] * 2.2, o[4] * 1.2, '#8b968d', o[5]); g.restore();
          ell(g, o[1] - o[3] * 0.5, o[2] - o[4] * 0.6, o[3] * 0.55, o[4] * 0.3, 'rgba(255,255,255,.65)', o[5] - 0.4); break;
        case 'flower': { // florzinha de cinco pétalas com contorno
          var fr = o[3] * 2.2, fx2 = o[1], fy2 = o[2], pi;
          g.lineWidth = 2.6; g.strokeStyle = OUTL; g.fillStyle = o[4];
          for (pi = 0; pi < 5; pi++) { var pa = pi * 1.2566; g.beginPath(); g.arc(fx2 + Math.cos(pa) * fr * 0.8, fy2 + Math.sin(pa) * fr * 0.8, fr * 0.7, 0, 7); g.stroke(); }
          for (pi = 0; pi < 5; pi++) { var pa2 = pi * 1.2566; g.beginPath(); g.arc(fx2 + Math.cos(pa2) * fr * 0.8, fy2 + Math.sin(pa2) * fr * 0.8, fr * 0.7, 0, 7); g.fill(); }
          g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(fx2, fy2, fr * 0.55, 0, 7); g.fill(); g.lineWidth = 1.6; g.stroke(); break; }
        case 'log': g.save(); g.translate(o[1], o[2]); g.rotate(o[3]); g.lineWidth = 4; g.strokeStyle = '#26150a'; g.fillStyle = '#8a5a34';
          g.beginPath(); g.roundRect ? g.roundRect(-o[4] / 2, -11, o[4], 22, 10) : g.rect(-o[4] / 2, -11, o[4], 22); g.stroke(); g.fill();
          g.fillStyle = 'rgba(255,225,170,.35)'; g.fillRect(-o[4] / 2 + 8, -8, o[4] - 16, 5);
          ell(g, o[4] / 2 - 4, 0, 7, 9, '#d9a86c'); g.lineWidth = 2; g.strokeStyle = '#26150a'; g.beginPath(); g.ellipse(o[4] / 2 - 4, 0, 3.5, 4.5, 0, 0, 7); g.stroke(); g.restore(); break;
      }
    });
    // toca do dragão
    var dl = Math.hypot(Math.max(tx - W.cx, 0, W.cx - (tx + TILE)), Math.max(ty - W.cy, 0, W.cy - (ty + TILE)));
    if (dl < LAIR * 1.3) paintLair(g);
    L.tree.sort(function (a, b) { return a[1] - b[1]; }).forEach(function (o) { paintTree(g, o[0], o[1], o[2], o[3]); });
  }
  // Árvore no estilo do slime: copa gorda e brilhante, contorno escuro grosso, brilhos brancos e tronco curtinho.
  // v: 0..3 = tons de verde; 9 = arbusto escuro do fundo. A seed vem da posição, então a árvore é sempre igual.
  var TREE_COL = [['#3a9a4a', '#62c35a', '#2a7438'], ['#46a83f', '#78d055', '#2f7e32'], ['#2e9a78', '#58c79c', '#217458'], ['#5aa83a', '#8ad352', '#3d7e2c'], , , , , ['#2f8a5c', '#5cc08a', '#1f6845']];
  function paintTree(g, x, y, tr, v) {
    var OUT = '#07140c', lw = Math.max(3, tr * 0.07), C, i;
    if (v === 9) { // arbusto escuro, só o volume
      g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(x + 6, y + tr * 0.5, tr * 0.9, tr * 0.3, 0, 0, 7); g.fill();
      g.lineWidth = lw; g.strokeStyle = OUT; g.fillStyle = '#2a7a3f';
      g.beginPath(); g.ellipse(x, y, tr, tr * 0.8, 0, 0, 7); g.stroke(); g.fill();
      ell(g, x - tr * 0.3, y - tr * 0.3, tr * 0.45, tr * 0.28, 'rgba(110,170,110,.22)');
      return;
    }
    var anc = v === 8; C = TREE_COL[anc ? 8 : v];
    var k = Math.abs(Math.sin(x * 12.9898 + y * 78.233)) * 0.6 - 0.3; // pequena variação de forma
    var blobs = [[0, -0.08, 1, 0.88], [-0.52 + k * 0.2, 0.1, 0.62, 0.55], [0.52 + k * 0.2, 0.08, 0.64, 0.56], [-0.2 + k * 0.3, -0.42, 0.62, 0.5], [0.3, -0.38, 0.55, 0.46]];
    if (anc) for (i = 0; i < blobs.length; i++) blobs[i][1] -= 0.38; // copa mais alta: o tronco com o rostinho aparece
    // sombra no chão
    g.fillStyle = 'rgba(0,0,0,.42)'; g.beginPath(); g.ellipse(x + tr * 0.12, y + tr * 0.78, tr * 0.95, tr * 0.28, 0, 0, 7); g.fill();
    // tronco curto, aparece embaixo da copa
    var tw = tr * (anc ? 0.32 : 0.2), th = tr * (anc ? 0.8 : 0.55);
    g.lineWidth = lw; g.strokeStyle = OUT; g.fillStyle = '#6a452a';
    g.beginPath(); g.moveTo(x - tw, y + tr * 0.35); g.lineTo(x - tw * 1.3, y + tr * 0.35 + th); g.quadraticCurveTo(x, y + tr * 0.35 + th + tr * 0.08, x + tw * 1.3, y + tr * 0.35 + th); g.lineTo(x + tw, y + tr * 0.35); g.closePath(); g.stroke(); g.fill();
    g.fillStyle = 'rgba(255,220,170,.22)'; g.fillRect(x - tw * 0.7, y + tr * 0.4, tw * 0.5, th * 0.8);
    if (anc) { // rosto adormecido no tronco, com runas brilhando
      var fy = y + tr * 0.35 + th * 0.55, ex = tw * 0.5, er = tw * 0.22;
      g.strokeStyle = OUT; g.lineWidth = Math.max(2.5, tr * 0.03); g.lineCap = 'round';
      g.beginPath(); g.arc(x - ex, fy, er, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.beginPath(); g.arc(x + ex, fy, er, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.beginPath(); g.arc(x, fy + er * 1.2, er * 0.8, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
      ell(g, x - ex * 1.55, fy + er * 1.1, er * 0.7, er * 0.45, 'rgba(255,130,120,.55)'); ell(g, x + ex * 1.55, fy + er * 1.1, er * 0.7, er * 0.45, 'rgba(255,130,120,.55)');
      g.fillStyle = 'rgba(190,255,150,.8)'; for (i = 0; i < 4; i++) { g.beginPath(); g.arc(x + (i - 1.5) * tw * 0.4, y + tr * 0.36 + th * 0.18, Math.max(2, tr * 0.018), 0, 7); g.fill(); }
    }
    // contorno: todas as bolas com traço grosso; depois o preenchimento junta a silhueta
    g.strokeStyle = OUT; g.lineWidth = lw * 2;
    for (i = 0; i < blobs.length; i++) { g.beginPath(); g.ellipse(x + blobs[i][0] * tr, y + blobs[i][1] * tr, blobs[i][2] * tr * 0.78, blobs[i][3] * tr * 0.78, 0, 0, 7); g.stroke(); }
    for (i = 0; i < blobs.length; i++) { g.fillStyle = C[0]; g.beginPath(); g.ellipse(x + blobs[i][0] * tr, y + blobs[i][1] * tr, blobs[i][2] * tr * 0.78, blobs[i][3] * tr * 0.78, 0, 0, 7); g.fill(); }
    // sombra embaixo e luz em cima, como o corpo gelatinoso do slime
    g.save(); g.beginPath(); for (i = 0; i < blobs.length; i++) { g.moveTo(x + blobs[i][0] * tr + blobs[i][2] * tr * 0.78, y + blobs[i][1] * tr); g.ellipse(x + blobs[i][0] * tr, y + blobs[i][1] * tr, blobs[i][2] * tr * 0.78, blobs[i][3] * tr * 0.78, 0, 0, 7); } g.clip();
    ell(g, x + tr * 0.12, y + tr * 0.62, tr * 1.25, tr * 0.5, C[2]);
    ell(g, x - tr * 0.18, y - tr * 0.4, tr * 0.7, tr * 0.42, C[1]);
    g.restore();
    // brilhos brancos e folhinhas
    ell(g, x - tr * 0.42, y - tr * 0.5, tr * 0.2, tr * 0.11, 'rgba(255,255,255,.4)', -0.5);
    ell(g, x - tr * 0.18, y - tr * 0.62, tr * 0.07, tr * 0.05, 'rgba(255,255,255,.5)', -0.4);
    if (anc) for (i = 0; i < 14; i++) { var ma = i * 2.4 + k * 5, mr = tr * (0.35 + 0.5 * ((i * 0.37) % 1)); ell(g, x + Math.cos(ma) * mr, y - tr * 0.05 + Math.sin(ma) * mr * 0.55, tr * 0.03, tr * 0.03, 'rgba(210,255,160,.85)'); }
    for (i = 0; i < 5; i++) { var la = i * 1.7 + k * 4; ell(g, x + Math.cos(la) * tr * 0.55, y + Math.sin(la * 1.3) * tr * 0.3 + tr * 0.05, tr * 0.07, tr * 0.035, C[2], la); }
  }
  // Toca: chão chamuscado, laje rachada com brasas, pedras em volta, ossos e um monte de ouro sob o dragão.
  function paintLair(g) {
    var TAU = Math.PI * 2, R = rng(4242), i, k, PR = LAIR, cx = W.cx, cy = W.cy;
    var sg = g.createRadialGradient(cx, cy, PR * 0.6, cx, cy, PR * 1.3); sg.addColorStop(0, 'rgba(18,10,8,.8)'); sg.addColorStop(1, 'rgba(18,10,8,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(cx, cy, PR * 1.3, 0, TAU); g.fill();
    var pg = g.createRadialGradient(cx, cy, 30, cx, cy, PR);
    pg.addColorStop(0, '#4a403a'); pg.addColorStop(0.7, '#352e29'); pg.addColorStop(1, '#241f1c');
    g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(cx + 6, cy + 10, PR + 8, 0, TAU); g.fill();
    g.fillStyle = pg; g.beginPath(); g.arc(cx, cy, PR, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(10,8,6,.7)'; g.lineWidth = 2;
    for (var ring = 1; ring <= 5; ring++) {
      var rad = ring * PR / 5; g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.stroke();
      var n = ring * 7;
      for (k = 0; k < n; k++) { var an = k * TAU / n + ring; g.beginPath(); g.moveTo(cx + Math.cos(an) * (rad - PR / 5), cy + Math.sin(an) * (rad - PR / 5)); g.lineTo(cx + Math.cos(an) * rad, cy + Math.sin(an) * rad); g.stroke(); }
    }
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (i = 0; i < 16; i++) {
      var a0 = R() * TAU, r1 = 70 + R() * 70, x = cx + Math.cos(a0) * r1, y = cy + Math.sin(a0) * r1, len = 50 + R() * 90;
      g.beginPath(); g.moveTo(x, y);
      for (k = 0; k < 6; k++) { a0 += (R() - 0.5) * 0.9; x += Math.cos(a0) * len / 6; y += Math.sin(a0) * len / 6; g.lineTo(x, y); }
      g.strokeStyle = 'rgba(255,90,30,.13)'; g.lineWidth = 6; g.stroke(); g.strokeStyle = 'rgba(255,160,70,.4)'; g.lineWidth = 1.6; g.stroke();
    }
    var hg = g.createRadialGradient(cx, cy, 10, cx, cy, 240); hg.addColorStop(0, 'rgba(255,150,50,.24)'); hg.addColorStop(1, 'rgba(255,100,30,0)');
    g.fillStyle = hg; g.beginPath(); g.arc(cx, cy, 240, 0, TAU); g.fill(); g.restore();
    // ouro
    for (i = 0; i < 90; i++) {
      var aa = R() * TAU, dd = Math.pow(R(), 0.7) * 150, gx = cx + Math.cos(aa) * dd, gy = cy + 24 + Math.sin(aa) * dd * 0.62;
      ell(g, gx, gy, 7 + R() * 5, 4 + R() * 3, ['#c9962f', '#e0b04a', '#a8761f'][(R() * 3) | 0], R() * 3);
      if (R() < 0.35) ell(g, gx - 2, gy - 1.5, 3, 1.6, 'rgba(255,245,190,.8)', 0);
    }
    [['#ff4f6a', 0.2], ['#4aa3ff', 2.2], ['#6fd16f', 4.1]].forEach(function (gm) { var gx = cx + Math.cos(gm[1]) * 95, gy = cy + 18 + Math.sin(gm[1]) * 60; g.fillStyle = gm[0]; g.beginPath(); g.moveTo(gx, gy - 8); g.lineTo(gx + 6, gy); g.lineTo(gx, gy + 8); g.lineTo(gx - 6, gy); g.closePath(); g.fill(); });
    // pedras em volta
    for (i = 0; i < 26; i++) {
      var ba = i * TAU / 26 + R() * 0.15, br = PR * (0.96 + R() * 0.1), bx = cx + Math.cos(ba) * br, by = cy + Math.sin(ba) * br * 0.99, bs = 26 + R() * 24;
      ell(g, bx + 5, by + 8, bs, bs * 0.7, 'rgba(0,0,0,.4)'); ell(g, bx, by, bs, bs * 0.8, '#3b3733', R() * 3); ell(g, bx - bs * 0.25, by - bs * 0.3, bs * 0.5, bs * 0.3, 'rgba(255,240,220,.12)', 0);
    }
    // ossos e crânios
    for (i = 0; i < 9; i++) {
      var oa = R() * TAU, orr = PR * (0.45 + R() * 0.4), ox = cx + Math.cos(oa) * orr, oy = cy + Math.sin(oa) * orr * 0.95;
      g.save(); g.translate(ox, oy); g.rotate(R() * 3); g.strokeStyle = '#d8cdb4'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-14, 0); g.lineTo(14, 0); g.stroke(); ell(g, -15, -2, 3.5, 3.5, '#d8cdb4'); ell(g, -15, 2.5, 3.5, 3.5, '#d8cdb4'); ell(g, 15, -2, 3.5, 3.5, '#d8cdb4'); ell(g, 15, 2.5, 3.5, 3.5, '#d8cdb4');
      if (i % 3 === 0) { ell(g, 2, 14, 10, 8, '#e4dac2'); g.fillStyle = '#1a1411'; g.beginPath(); g.arc(-1, 14, 2.4, 0, 7); g.arc(6, 14, 2.4, 0, 7); g.fill(); }
      g.restore();
    }
  }
  function tileCanvas(ix, iy) {
    var key = tileKey(ix, iy), t = tiles[key];
    if (t) return t;
    var c = document.createElement('canvas'); c.width = c.height = Math.round(TILE * TSC);
    paintTile(c.getContext('2d'), ix * TILE, iy * TILE);
    tiles[key] = c; tileKeys.push(key);
    if (tileKeys.length > MAX_TILES) delete tiles[tileKeys.shift()];
    return c;
  }
  // Desenha o chão visível. No máximo 2 blocos novos por quadro (os outros aparecem como chão liso até ficarem prontos).
  function drawMap(g, x0, y0, x1, y1) {
    if (IMG.mapa) { var im = IMG.mapa, sx = im.width / W.w, sy = im.height / W.h, a = Math.max(0, x0), b = Math.max(0, y0), c = Math.min(W.w, x1), d = Math.min(W.h, y1); if (c > a && d > b) g.drawImage(im, a * sx, b * sy, (c - a) * sx, (d - b) * sy, a, b, c - a, d - b); return; }
    var budget = 2, ix, iy, i0 = Math.max(0, Math.floor(x0 / TILE)), i1 = Math.min(Math.floor((W.w - 1) / TILE), Math.floor(x1 / TILE));
    var j0 = Math.max(0, Math.floor(y0 / TILE)), j1 = Math.min(Math.floor((W.h - 1) / TILE), Math.floor(y1 / TILE));
    for (iy = j0; iy <= j1; iy++) for (ix = i0; ix <= i1; ix++) {
      var t = tiles[tileKey(ix, iy)];
      if (!t && budget > 0) { t = tileCanvas(ix, iy); budget--; }
      if (t) g.drawImage(t, ix * TILE - 0.5, iy * TILE - 0.5, TILE + 1, TILE + 1);
      else { g.fillStyle = '#16251b'; g.fillRect(ix * TILE, iy * TILE, TILE, TILE); }
    }
  }
  function warmMap(x, y) { // pinta os blocos ao redor de (x, y) antes do primeiro quadro
    if (IMG.mapa) return;
    var ix = Math.floor(x / TILE), iy = Math.floor(y / TILE);
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var a = ix + dx, b = iy + dy; if (a >= 0 && b >= 0 && a * TILE < W.w && b * TILE < W.h) tileCanvas(a, b);
    }
  }

  window.ART = {
    load: load, has: function (n) { return !!IMG[n]; }, img: function (n) { return IMG[n] || null; }, drawSlime: drawSlime, slimeXf: slimeXf, armorLayer: armorLayer, armorSleeve: armorSleeve, drawArm: drawArm, drawHand: drawHand, weaponGeo: weaponGeo, drawMob: drawMob, paintTree: paintTree, slimeOk: slimeOk, slimeTop: function () { return slimeOk() ? SLIME_TOP : 1.3; },
    iconURL: iconURL, weaponCanvas: weaponCanvas, drawMap: drawMap, warmMap: warmMap, slimeSprite: slimeSprite,
    mix: mix, light: light, dark: dark, rgba: rgba, rng: rng, mobColor: function (k) { return MOB_COLORS[k] || '#888'; }
  };
})();
