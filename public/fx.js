// Efeitos visuais das armas, dos poderes e do dragão. Só desenho: o servidor decide o que acontece e manda os eventos.
// Cada família de arma tem o seu jeito de golpear (corte em arco, estocada, pancada, disparo, badalada) e a faixa
// (comum até mítica) muda cores, brilho e quantidade de camadas.
(function () {
  'use strict';
  var GD = module.exports, FAM = GD.FAMILIES, TAU = Math.PI * 2;

  /* ---------- cores (sempre em hexadecimal) ---------- */
  function rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hex(a) { return '#' + a.map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join(''); }
  function mix(a, b, t) { var A = rgb(a), B = rgb(b); return hex(A.map(function (v, i) { return v + (B[i] - v) * t; })); }
  function light(c, t) { return mix(c, '#ffffff', t); }
  function dark(c, t) { return mix(c, '#000000', t); }
  function rgba(c, a) { return 'rgba(' + rgb(c).join(',') + ',' + Math.max(0, Math.min(1, a)) + ')'; }

  // Paleta da arma: c = cor principal, h = brilho, d = sombra.
  var palCache = {};
  // Cores bem vivas por tipo de arma, para as habilidades aparecerem bem na tela (as cores dos itens em si ficam como estão)
  var VIVID = { faca: '#9be8ff', espada: '#35b6ff', martelo: '#ff7a1f', maca: '#ffd21f', rapieira: '#ff3d9e', arco: '#3dff5c', chicote: '#ff2f3f', varinha: '#b266ff', cajado: '#18f0d8', sinos: '#ffe433' };
  function pal(fam, tier) {
    var key = fam + tier, p = palCache[key];
    if (p) return p;
    var base = VIVID[fam] || (FAM[fam] ? FAM[fam].color : '#ffb347');
    p = { c: base, h: mix(base, '#ffffff', tier >= 5 ? 0.5 : 0.35), d: dark(base, 0.4) }; // só a cor da arma e um tom claro dela
    return (palCache[key] = p);
  }
  // Habilidades de espada e chicote saem em vermelho (o golpe normal fica na cor da arma), para não confundir os dois.
  var SKILL_RED = { c: '#ff1414', h: '#ff6a5c', d: '#5c0f0a' }, redCache = {};
  // O golpe normal de espada e chicote sai em branco e azul (a mesma animação da habilidade, que é vermelha).
  var SLASH_BLUE = { c: '#2f8cff', h: '#d6ecff', d: '#0b2a5c' };
  // A arte azul do corte vira vermelha trocando os canais (o centro branco continua quente); sem filtros de canvas, que o Safari não tem.
  function tintRed(img, key) {
    if (redCache[key]) return redCache[key];
    if (!img.width) return img;
    try {
      var w = Math.min(img.width, 640), h = Math.round(img.height * w / img.width), c = document.createElement('canvas'), x, d, a, i, r, gg, b;
      c.width = w; c.height = h; x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
      d = x.getImageData(0, 0, w, h); a = d.data;
      for (i = 0; i < a.length; i += 4) { r = a[i]; gg = a[i + 1]; b = a[i + 2]; a[i] = Math.min(255, b * 1.1 + r * 0.15); a[i + 1] = gg * 0.2; a[i + 2] = r * 0.3; }
      x.putImageData(d, 0, 0);
      return (redCache[key] = c);
    } catch (e) { return img; }
  }
  // A arte do corte é uma meia-lua em "C". Para encaixar na forma do dano, ela é desenrolada numa faixa reta (a crista da meia-lua vira uma linha) e depois
  // enrolada de novo ao longo do arco do alcance máximo, de uma borda lateral do cone até a outra (hbPath). A crista medida na arte (ângulo em graus → raio,
  // em pixels da imagem de 1024) e o centro do "C" foram tirados da própria imagem; a ponta de cima fica em -44° e a de baixo em -368° (o brilho do meio em -180°).
  var CUT = { cx: 450, cy: 250, K: 120, tab: [[-44, 305], [-48, 266], [-56, 233], [-64, 208], [-72, 191], [-80, 178], [-88, 171], [-96, 166], [-104, 164], [-112, 165], [-120, 168], [-128, 175], [-136, 183], [-144, 199], [-152, 220], [-160, 244], [-168, 275], [-176, 312], [-184, 329], [-192, 332], [-200, 327], [-208, 293], [-216, 261], [-224, 237], [-232, 219], [-240, 209], [-248, 200], [-256, 193], [-264, 190], [-272, 190], [-280, 191], [-288, 196], [-296, 204], [-304, 216], [-312, 234], [-320, 255], [-328, 282], [-336, 318], [-344, 362], [-352, 423], [-360, 477], [-368, 515]] }, cutCache = {};
  function cutRho(psi) {
    var t = CUT.tab, i = 0;
    while (i < t.length - 2 && psi < t[i + 1][0]) i++;
    var k = Math.max(0, Math.min(1, (psi - t[i][0]) / (t[i + 1][0] - t[i][0])));
    return t[i][1] + (t[i + 1][1] - t[i][1]) * k;
  }
  function cutStrip(src, key) {
    if (cutCache[key]) return cutCache[key];
    try {
      var NS = 160, NT = 80, sc = src.width / 1024, c = document.createElement('canvas'), x, i, q, psi, a, rho;
      c.width = NS; c.height = NT; x = c.getContext('2d');
      for (i = 0; i < NS; i++) {
        q = (i + 0.5) / NS;
        psi = q < 0.5 ? -44 + (-180 + 44) * (q / 0.5) : -180 + (-368 + 180) * ((q - 0.5) / 0.5);
        a = psi * Math.PI / 180; rho = cutRho(psi) * sc;
        x.save(); x.beginPath(); x.rect(i, 0, 1, NT); x.clip();
        x.translate(i + 0.5, NT / 2); x.scale(1, NT / (2 * CUT.K * sc)); x.rotate(Math.PI / 2 - a); x.translate(-(CUT.cx * sc + rho * Math.cos(a)), -(CUT.cy * sc + rho * Math.sin(a)));
        x.drawImage(src, 0, 0); x.restore();
      }
      return (cutCache[key] = c);
    } catch (e) { return null; }
  }
  // A faixa reta é enrolada no leque ponto a ponto (cada pixel da textura procura o seu lugar na faixa, com mistura suave): sem emendas entre fatias.
  // A textura sai no ângulo 0 (virada para a direita), com a crista em 0.8 do alcance, e é guardada por alcance e abertura; no efeito ela só gira e cresce um pouco.
  var wtexCache = {}, wtexKeys = [];
  function cutTex(strip, key, R, ph) {
    var k = key + '|' + Math.round(R) + '|' + Math.round(ph * 1000);
    if (wtexCache[k]) return wtexCache[k];
    try {
      var NS = strip.width, NT = strip.height, r0 = R * 0.8, th = R * 0.3, C = Math.ceil(r0 + th) + 2, N = 2 * C, c = document.createElement('canvas'), x, od, out, sd;
      if (!strip._d) strip._d = strip.getContext('2d').getImageData(0, 0, NS, NT).data;
      sd = strip._d; c.width = N; c.height = N; x = c.getContext('2d'); out = x.createImageData(N, N); od = out.data;
      var px, py, dx, dy, rho, phi, u, v, iu, iv, fu, fv, i, j, wgt, q, A, r, gr, bl, o, rin = r0 - th, rout = r0 + th, W = [0, 0, 0, 0], idx = [0, 0, 0, 0];
      for (py = 0; py < N; py++) {
        dy = py - C + 0.5;
        for (px = 0; px < N; px++) {
          dx = px - C + 0.5; rho = Math.sqrt(dx * dx + dy * dy);
          if (rho < rin || rho >= rout) continue;
          phi = Math.atan2(dy, dx); if (phi < -ph || phi > ph) continue;
          u = (phi + ph) / (2 * ph) * NS - 0.5; v = (rho - rin) / (2 * th) * NT - 0.5;
          iu = Math.floor(u); iv = Math.floor(v); fu = u - iu; fv = v - iv;
          W[0] = (1 - fu) * (1 - fv); W[1] = fu * (1 - fv); W[2] = (1 - fu) * fv; W[3] = fu * fv;
          A = 0; r = 0; gr = 0; bl = 0;
          for (q = 0; q < 4; q++) {
            i = Math.max(0, Math.min(NS - 1, iu + (q & 1))); j = Math.max(0, Math.min(NT - 1, iv + (q >> 1)));
            o = (j * NS + i) * 4; wgt = W[q] * sd[o + 3]; A += wgt; r += wgt * sd[o]; gr += wgt * sd[o + 1]; bl += wgt * sd[o + 2];
          }
          if (A > 0) { o = (py * N + px) * 4; od[o] = r / A; od[o + 1] = gr / A; od[o + 2] = bl / A; od[o + 3] = A; }
        }
      }
      x.putImageData(out, 0, 0);
      wtexCache[k] = c; wtexKeys.push(k); if (wtexKeys.length > 14) delete wtexCache[wtexKeys.shift()];
      return c;
    } catch (e) { return null; }
  }
  function rand(seed) { // sorteio rápido e repetível (o mesmo efeito sempre sai igual)
    var s = (seed | 0) || 1;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  }

  /* Imagens do sopro, da pancada e das garras do dragão (public/img/fx_*.webp, geradas sobre fundo preto e preparadas por
     tools/preparar-fx.py). São desenhadas com mistura aditiva por cima do chão. Sem elas, vale o desenho por código de sempre.
     JET: tamanho de cada desenho do jato (a ponta fica no meio da borda esquerda) e altura da chama no fim; ONDA_R: raio do anel de fogo
     como fração da largura; MOUTH: de onde sai o fogo, a partir do centro do dragão (em px do mundo, na pose de sopro). */
  var JET = [{ w: 1024, h: 438, endH: 369 }, { w: 1024, h: 492, endH: 409 }, { w: 1024, h: 384, endH: 316 }];
  var ONDA_R = 0.444, MOUTH = { x: 137, y: -60 };
  // Desenha um sprite de IA centrado em (x, y) com largura w (altura pela proporção); ax/ay = ponto da imagem (0..1) que fica em (x, y); add = soma luz
  function spr(g, img, x, y, w, rot, al, add, ax, ay) {
    var h = w * img.height / img.width;
    g.save(); g.globalCompositeOperation = add ? 'lighter' : 'source-over'; g.globalAlpha = Math.max(0, Math.min(1, al));
    g.translate(x, y); if (rot) g.rotate(rot);
    g.drawImage(img, -w * (ax === undefined ? 0.5 : ax), -h * (ay === undefined ? 0.5 : ay), w, h); g.restore();
  }
  function fxImg(n) { return window.ART && window.ART.img ? window.ART.img(n) : null; }

  var DUR = { thrust: 0.18, smash: 0.42, arc: 0.3, ring: 0.36, orbx: 0.42, s_burst: 0.62, s_cone: 0.45, s_dash: 0.38, d_breath: 0.85, d_slam: 1.0, d_claw: 0.36, ms: 0.7, mixfx: 0.9, healtrail: 2.0, hit: 0.24, pop: 0.26, dust: 0.55, lvl: 0.95, tomb: 2.6 };
  function dur(kind) { return DUR[kind] || 0.3; }

  function glow(g, x, y, r, c, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  function spikes(g, x, y, r0, r1, n, rot, w, col) {
    g.fillStyle = col;
    for (var i = 0; i < n; i++) {
      var a = rot + i * TAU / n;
      g.beginPath(); g.moveTo(x + Math.cos(a - w) * r0, y + Math.sin(a - w) * r0); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); g.lineTo(x + Math.cos(a + w) * r0, y + Math.sin(a + w) * r0); g.closePath(); g.fill();
    }
  }
  // faixa curva (crescente) entre dois raios, de a0 a a1, afinando nas pontas
  function crescent(g, x, y, rOut, rIn, a0, a1, fill) {
    g.beginPath(); g.arc(x, y, rOut, a0, a1); g.arc(x, y, rIn, a1, a0, true); g.closePath(); g.fillStyle = fill; g.fill();
  }

  /* ---------- efeitos de golpe e de habilidade ---------- */
  // Desenho da habilidade mista combina com o tipo de habilidade das duas armas: explosão (estrela), cone (pétalas), investida (cruz), tiro (espiral)
  var KSTYLE = { burst: 1, cone: 2, dash: 3, volley: 0, bolt: 0 };
  function mixStyle(a, b) {
    var ka = FAM[a] && FAM[a].skill ? FAM[a].skill.kind : 'burst', kb = FAM[b] && FAM[b].skill ? FAM[b].skill.kind : 'burst';
    var x = KSTYLE[ka], y = KSTYLE[kb];
    return x === y ? x : ({ '01': 0, '02': 2, '03': 3, '12': 1, '13': 3, '23': 2 })[Math.min(x, y) + '' + Math.max(x, y)];
  }
  // A forma MÁXIMA da área de dano de um corte em cone, desenhada como luz. É a mesma conta do servidor (inCone): o dano conta a borda do alvo, então para um
  // alvo de raio rt a abertura em cada distância d é w/2 + asin(rt/d) para cada lado (abre mais perto do corpo) e o alcance vai até f.size (alcance + rt).
  // O preenchimento cresce junto com a passada da arma (frac 0..1), a borda de fora fica exatamente no alcance máximo e a arte do golpe é recortada nessa forma.
  function hbHalf(w, rt, d) { return w / 2 + Math.asin(Math.min(1, rt / Math.max(d, 0.001))); }
  function hbEdge(g, f, w, rt, sgn, d0, n) { var i, d, h; for (i = 0; i <= n; i++) { d = d0 + (f.size - d0) * i / n; h = hbHalf(w, rt, d); g.lineTo(f.x + Math.cos(f.a + sgn * h) * d, f.y + Math.sin(f.a + sgn * h) * d); } }
  function hbPath(g, f, w, rt, frac) {
    var R = f.size, ph = hbHalf(w, rt, R), p1 = -ph + 2 * ph * frac, d0 = Math.min(Math.max(rt, 1), R * 0.6), n = 14, i, d, h;
    g.beginPath(); g.moveTo(f.x, f.y); hbEdge(g, f, w, rt, -1, d0, n);
    g.arc(f.x, f.y, R, f.a - ph, f.a + p1);
    if (frac >= 0.999) for (i = n; i >= 0; i--) { d = d0 + (R - d0) * i / n; h = hbHalf(w, rt, d); g.lineTo(f.x + Math.cos(f.a + h) * d, f.y + Math.sin(f.a + h) * d); }
    g.closePath();
  }
  // A arte do corte (meia-lua em "C") desenrolada e enrolada ao longo do arco do alcance máximo: ocupa o leque do dano de uma borda lateral à outra.
  // Usada pelo golpe normal (arte original, branca e azul) e pela habilidade (a mesma arte pintada de vermelho). frac = quanto da passada já foi feita.
  function cutWarp(g, f, w, rt, frac, P, img, key, e3, p, a) {
    var ph = hbHalf(w, rt, f.size), cal = Math.min(1, p * 10) * Math.min(1, a * 1.5), strip = cutStrip(img, key);
    hbLight(g, f, w, rt, frac, P, Math.min(1, a * 1.5) * Math.min(1, p * 10), 1.1); // a forma máxima do dano inteira, presa ao alcance máximo
    g.save(); hbPath(g, f, w, rt, frac); g.clip();
    g.globalAlpha = Math.max(0, Math.min(1, cal));
    var tex = strip ? cutTex(strip, key, f.size, ph) : null;
    if (tex) { // textura pronta (arte enrolada no leque), girada para o golpe e crescendo um pouco no começo
      var kk = (0.66 + 0.14 * e3) / 0.8, C = tex.width / 2;
      g.translate(f.x, f.y); g.rotate(f.a); g.scale(kk, kk); g.drawImage(tex, -C, -C);
    } else if (strip) {
      // reserva: fatias em leque (cada uma dividida em faixas por raio, para a largura acompanhar o arco)
      var NS = strip.width, NT = strip.height, r0 = f.size * (0.66 + 0.14 * e3), th = f.size * 0.3 * (0.85 + 0.15 * e3);
      var SL2 = Math.max(24, Math.min(NS, Math.ceil(r0 * 2 * ph / 4))), BD = 6, dph = 2 * ph / SL2, sx = NS / SL2, j, b, phj, rb0, rb1, rm, tw;
      for (j = 0; j < SL2; j++) {
        phj = -ph + dph * (j + 0.5); if (phj > -ph + 2 * ph * frac + 0.03) break;
        g.save(); g.translate(f.x, f.y); g.rotate(f.a + phj); g.transform(0, 1, 1, 0, 0, 0);
        for (b = 0; b < BD; b++) {
          rb0 = r0 - th + 2 * th * b / BD; rb1 = rb0 + 2 * th / BD; rm = (rb0 + rb1) / 2; tw = rm * dph + 0.3;
          g.drawImage(strip, j * sx, NT * b / BD, sx, NT / BD, -tw / 2, rb0, tw, rb1 - rb0 + 0.3);
        }
        g.restore();
      }
    } else { // sem a faixa (não deveria acontecer): a arte inteira, espelhada
      var cl = f.size * (0.8 + 0.27 * e3), cs = cl / img.width;
      g.translate(f.x, f.y); g.rotate(f.a); g.translate(cl, 0); g.scale(-cs, cs * Math.min(1.6, (2 * ph) / 1.6)); g.drawImage(img, 0, -img.height / 2);
    }
    g.restore();
  }
  function hbLight(g, f, w, rt, frac, P, fa, strong) {
    if (frac <= 0.001) return;
    var E = P === SKILL_RED ? '#ffd9d2' : '#ffffff';
    var R = f.size, ph = hbHalf(w, rt, R), a1 = f.a - ph + 2 * ph * frac, d0 = Math.min(Math.max(rt, 1), R * 0.6);
    var gs = g.createRadialGradient(f.x, f.y, R * 0.12, f.x, f.y, R);
    gs.addColorStop(0, rgba(P.c, 0)); gs.addColorStop(0.55, rgba(P.c, 0.1 * fa * strong)); gs.addColorStop(1, rgba(P.h, 0.27 * fa * strong));
    hbPath(g, f, w, rt, frac); g.fillStyle = gs; g.fill();
    // laterais da forma máxima (a de onde o corte parte sempre, a da frente quando o corte termina)
    g.lineCap = 'round'; g.strokeStyle = rgba(E, 0.4 * fa); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(f.x + Math.cos(f.a - hbHalf(w, rt, d0)) * d0, f.y + Math.sin(f.a - hbHalf(w, rt, d0)) * d0); hbEdge(g, f, w, rt, -1, d0, 14); g.stroke();
    if (frac >= 0.999) { g.beginPath(); g.moveTo(f.x + Math.cos(f.a + hbHalf(w, rt, d0)) * d0, f.y + Math.sin(f.a + hbHalf(w, rt, d0)) * d0); hbEdge(g, f, w, rt, 1, d0, 14); g.stroke(); }
    // borda externa no alcance máximo (a parte já varrida, mais forte perto da frente do corte)
    var tail = Math.max(f.a - ph, a1 - 1.1), n = 8, i, ta, tb;
    for (i = 0; i < n; i++) {
      ta = tail + (a1 - tail) * i / n; tb = tail + (a1 - tail) * (i + 1) / n;
      g.strokeStyle = rgba(E, (0.25 + 0.6 * (i + 1) / n) * fa); g.lineWidth = 1.4 + 1.8 * (i + 1) / n;
      g.beginPath(); g.arc(f.x, f.y, R - 1, ta, tb); g.stroke();
    }
    // linha da frente do corte, do corpo até o alcance máximo
    g.strokeStyle = rgba(E, 0.6 * fa); g.lineWidth = 2;
    g.beginPath(); g.moveTo(f.x + Math.cos(a1) * R * 0.3, f.y + Math.sin(a1) * R * 0.3); g.lineTo(f.x + Math.cos(a1) * (R - 1), f.y + Math.sin(a1) * (R - 1)); g.stroke();
  }

  function drawFx(g, f, T) {
    var d = dur(f.kind), p = f.age / d;
    if (p >= 1 || p < 0) return;
    var fam = f.fam, tier = f.tier || 1, P = pal(FAM[fam] ? fam : 'faca', tier), a = 1 - p, e = 1 - Math.pow(1 - p, 2), e3 = 1 - Math.pow(1 - p, 3);
    var seed = ((f.x * 7 + f.y * 13) | 0) + (f.kind.length * 31), R = rand(seed), i;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round'; g.lineJoin = 'round';
    var hi = tier >= 3, top = tier >= 5, myth = tier >= 6;
    switch (f.kind) {
      case 'thrust': { // faca, rapieira, maça: golpe único
        var ca = Math.cos(f.a), sa = Math.sin(f.a), len = f.size * (0.5 + 0.7 * e3), timg0 = fam === 'maca' ? null : fxImg('fx_golpe_estocada');
        if (timg0) { spr(g, timg0, f.x + ca * len * 0.35, f.y + sa * len * 0.35, f.size * (1.3 + 1.3 * e3), f.a, Math.min(1, p * 9) * Math.min(1, a * 1.7), true, 0.5, 0.5); break; }
        if (fam === 'maca') {
          glow(g, f.x, f.y, 26 + tier * 3, P.c, 0.7 * a);
          spikes(g, f.x, f.y, 4, 16 + 14 * e, 8, f.a, 0.2, rgba(P.h, a));
          g.strokeStyle = rgba(P.c, a); g.lineWidth = 4 * a + 1; g.beginPath(); g.arc(f.x, f.y, 8 + 22 * e, 0, TAU); g.stroke();
        } else {
          // corte afinando: duas linhas cruzadas (faca) ou uma agulha longa (rapieira)
          var n = fam === 'rapieira' ? 1 : 2;
          for (i = 0; i < n; i++) {
            var off = n === 1 ? 0 : (i ? 0.5 : -0.5), aa = f.a + off * 0.9;
            g.strokeStyle = rgba(P.h, a); g.lineWidth = (fam === 'rapieira' ? 2.5 : 4.5) * a + 0.8;
            g.beginPath(); g.moveTo(f.x - Math.cos(aa) * len * 0.9, f.y - Math.sin(aa) * len * 0.9); g.lineTo(f.x + Math.cos(aa) * len * 0.9, f.y + Math.sin(aa) * len * 0.9); g.stroke();
            g.strokeStyle = rgba(P.c, a * 0.6); g.lineWidth = (fam === 'rapieira' ? 7 : 9) * a; g.stroke();
          }
          glow(g, f.x, f.y, 14 + tier * 2, P.h, 0.5 * a);
          if (hi) { g.fillStyle = rgba(P.h, a); for (i = 0; i < 4; i++) { var sa2 = f.a + (R() - 0.5) * 2.6; g.beginPath(); g.arc(f.x + Math.cos(sa2) * (8 + e * 22), f.y + Math.sin(sa2) * (8 + e * 22), 1.6, 0, TAU); g.fill(); } }
        }
        break;
      }
      case 'smash': { // martelo: pancada com onda no chão
        var rad = f.size * (0.2 + 0.85 * e3), simg0 = fxImg('fx_golpe_pancada');
        if (simg0) { spr(g, simg0, f.x, f.y, f.size * 2.4 * (0.35 + 0.65 * e3), 0, Math.min(1, p * 10) * Math.min(1, a * 1.5), true); break; }
        glow(g, f.x, f.y, f.size * 1.1, P.c, 0.35 * a);
        g.strokeStyle = rgba(P.h, a * 0.9); g.lineWidth = 8 * a + 1; g.beginPath(); g.arc(f.x, f.y, rad, 0, TAU); g.stroke();
        g.strokeStyle = rgba(P.c, a * 0.6); g.lineWidth = 3; g.beginPath(); g.arc(f.x, f.y, rad * 0.65, 0, TAU); g.stroke();
        var cr = hi ? 9 : 6; g.strokeStyle = rgba(P.d === '#000000' ? P.c : P.h, a * 0.8); g.lineWidth = 2.2;
        for (i = 0; i < cr; i++) { var ra = i * TAU / cr + R() * 0.3, r1 = rad * (0.35 + R() * 0.2); g.beginPath(); g.moveTo(f.x + Math.cos(ra) * r1, f.y + Math.sin(ra) * r1); g.lineTo(f.x + Math.cos(ra + 0.1) * rad, f.y + Math.sin(ra + 0.1) * rad); g.stroke(); }
        g.fillStyle = rgba(P.h, a * 0.8);
        for (i = 0; i < 7; i++) { var da = R() * TAU, dr = rad * (0.4 + R() * 0.6), up = Math.sin(p * Math.PI) * 14 * (0.5 + R()); g.beginPath(); g.arc(f.x + Math.cos(da) * dr, f.y + Math.sin(da) * dr - up, 2 + R() * 2.5, 0, TAU); g.fill(); }
        break;
      }
      case 'arc': { // espada e chicote: corte em arco
        var ex = f.extra, w = Array.isArray(ex) ? ex[0] : (ex || 2), rt = Array.isArray(ex) ? ex[1] : 0, ph = hbHalf(w, rt, f.size), a0 = f.a - ph, whip = fam === 'chicote', aimg = fxImg('fx_golpe_corte');
        // a luz do corte aparece onde a arma já passou: acompanha a lâmina (ou o chicote) de uma ponta à outra da área de dano
        var sw = (fam === 'espada' || whip) ? slashFrac(fam, f.age, 0, 2 * ph) : Math.min(1, p * 2.4), a1 = a0 + 2 * ph * sw;
        var bimg = (fam === 'espada' || whip) ? fxImg('fx_corte') : null;
        if (bimg) { // a mesma animação da habilidade (arte desenrolada ao longo do leque do dano), em branco e azul
          P = SLASH_BLUE; g.globalCompositeOperation = 'source-over'; // sem somar luz sobre o verde do chão, para o azul continuar azul
          cutWarp(g, f, w, rt, sw, P, bimg, 'fx_corte_azul', e3, p, a);
          break;
        }
        if (aimg) { // arte de IA: meia-lua com a parte curva voltada para o golpe, encaixada no leque do dano (borda no alcance máximo e nas duas bordas do cone)
          var aw = f.size * (whip ? 3.2 : 2.8) * (0.8 + 0.2 * e3), fa = Math.min(1, p * 9) * Math.min(1, a * 1.6);
          hbLight(g, f, w, rt, sw, P, fa, 1);
          g.save(); hbPath(g, f, w, rt, sw); g.clip();
          spr(g, aimg, f.x + Math.cos(f.a) * (f.size * 1.02 - aw / 2), f.y + Math.sin(f.a) * (f.size * 1.02 - aw / 2), aw, f.a + Math.PI, fa, true);
          g.restore();
          break;
        }
        var rOut = f.size, rIn = f.size * (whip ? 0.86 : 0.62);
        var gr = g.createRadialGradient(f.x, f.y, rIn * 0.6, f.x, f.y, rOut);
        gr.addColorStop(0, rgba(P.c, 0)); gr.addColorStop(0.55, rgba(P.c, a * 0.5)); gr.addColorStop(1, rgba(P.h, a * 0.95));
        crescent(g, f.x, f.y, rOut, rIn, a0, a1, gr);
        g.strokeStyle = rgba('#ffffff', a * 0.9); g.lineWidth = (whip ? 2 : 3) * a + 0.6; g.beginPath(); g.arc(f.x, f.y, rOut - 1, a1 - Math.min(w, 0.8), a1); g.stroke();
        if (hi) { g.fillStyle = rgba(P.h, a); for (i = 0; i < (myth ? 8 : 5); i++) { var qa = a0 + w * R(), qr = rOut * (0.7 + R() * 0.35); g.beginPath(); g.arc(f.x + Math.cos(qa) * qr, f.y + Math.sin(qa) * qr, 1.2 + R() * 1.6, 0, TAU); g.fill(); } }
        if (whip) { var tx = f.x + Math.cos(a1) * rOut, ty = f.y + Math.sin(a1) * rOut; glow(g, tx, ty, 14, '#ffffff', 0.9 * a); spikes(g, tx, ty, 2, 12 * a + 3, 6, a1, 0.25, rgba('#ffffff', a)); }
        break;
      }
      case 'ring': { // sinos: ondas sonoras
        var rimg = fxImg('fx_golpe_badalada');
        if (rimg) { spr(g, rimg, f.x, f.y, f.size * 2.3 * (0.3 + 0.7 * e), 0, Math.min(1, p * 9) * Math.min(1, a * 1.5), true); break; }
        for (i = 0; i < 2 + (hi ? 1 : 0); i++) {
          var pp = Math.max(0, Math.min(1, p * 1.25 - i * 0.14)), ee = 1 - Math.pow(1 - pp, 2);
          g.strokeStyle = rgba(i ? P.c : P.h, (1 - pp) * 0.85); g.lineWidth = 4 * (1 - pp) + 0.8;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.2 + 0.8 * ee), 0, TAU); g.stroke();
        }
        g.fillStyle = rgba(P.h, a);
        for (i = 0; i < 6; i++) { var na = i * TAU / 6 + 0.4, nr = f.size * (0.35 + 0.65 * e); g.beginPath(); g.arc(f.x + Math.cos(na) * nr, f.y + Math.sin(na) * nr, 2.2 * a + 0.6, 0, TAU); g.fill(); }
        break;
      }
      case 'orbx': { // cajado: explosão arcana
        var oimg = fxImg('fx_golpe_arcana');
        if (oimg) { glow(g, f.x, f.y, f.size * 1.2, P.c, 0.3 * a); spr(g, oimg, f.x, f.y, f.size * 2.4 * (0.4 + 0.6 * e3), T * 0.8, Math.min(1, p * 10) * Math.min(1, a * 1.5), true); break; }
        glow(g, f.x, f.y, f.size * 1.6, P.c, 0.55 * a);
        spikes(g, f.x, f.y, 4, f.size * (0.4 + 0.9 * e3), 10, T * 2, 0.12, rgba(P.h, a * 0.8));
        g.strokeStyle = rgba(P.h, a); g.lineWidth = 4 * a + 1; g.beginPath(); g.arc(f.x, f.y, f.size * (0.2 + 0.8 * e), 0, TAU); g.stroke();
        glow(g, f.x, f.y, 14 * a + 4, '#ffffff', 0.9 * a);
        break;
      }
      case 's_burst': { // habilidades em área: martelo, maça, cajado, sinos
        var big = f.size;
        glow(g, f.x, f.y, big * 1.15, P.c, 0.32 * a);
        var simg = fxImg('fx_' + fam); if (fam !== 'martelo' && fam !== 'maca' && fam !== 'cajado' && fam !== 'sinos') simg = null;
        if (simg) { // arte feita por IA: cresce do centro, soma com a luz do chão e some no fim
          var sw = big * 2.25 * (0.35 + 0.65 * e3), sh = sw * simg.height / simg.width, sal = Math.min(1, p * 9) * Math.min(1, a * 1.6);
          g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.max(0, Math.min(1, sal));
          if (fam === 'cajado') { sw *= 1 + 0.03 * Math.sin(T * 8); sh = sw * simg.height / simg.width; }
          g.drawImage(simg, f.x - sw / 2, f.y - sh / 2, sw, sh);
          g.restore();
        }
        for (i = 0; !simg && i < 2 + (hi ? 1 : 0) + (top ? 1 : 0); i++) {
          var pp2 = Math.max(0, Math.min(1, p * 1.25 - i * 0.12)), ee2 = 1 - Math.pow(1 - pp2, 2);
          g.strokeStyle = rgba(i ? P.c : P.h, (1 - pp2) * 0.9); g.lineWidth = 9 * (1 - pp2) + 1;
          g.beginPath(); g.arc(f.x, f.y, big * (0.15 + 0.85 * ee2), 0, TAU); g.stroke();
        }
        if (simg) { /* arte de IA já desenha o efeito */ } else if (fam === 'martelo') { // rachaduras e poeira
          g.strokeStyle = rgba(P.h, a * 0.9); g.lineWidth = 3;
          for (i = 0; i < 9; i++) { var ca2 = i * TAU / 9 + R() * 0.3; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x + Math.cos(ca2) * big * e3 * 0.95, f.y + Math.sin(ca2) * big * e3 * 0.95); g.stroke(); }
        } else if (fam === 'maca') { // pulso em cruz
          spikes(g, f.x, f.y, 6, big * (0.3 + 0.7 * e3), 4, Math.PI / 4, 0.17, rgba(P.h, a * 0.85));
        } else if (fam === 'cajado') { // círculo arcano girando
          g.strokeStyle = rgba(P.h, a * 0.9); g.lineWidth = 2; g.beginPath(); g.arc(f.x, f.y, big * 0.78, 0, TAU); g.stroke();
          g.beginPath(); for (i = 0; i <= 5; i++) { var sa3 = T * 1.6 + i * TAU * 2 / 5; g.lineTo(f.x + Math.cos(sa3) * big * 0.78, f.y + Math.sin(sa3) * big * 0.78); } g.stroke();
          g.fillStyle = rgba(P.h, a); for (i = 0; i < 10; i++) { var ra2 = -T * 1.2 + i * TAU / 10; g.beginPath(); g.arc(f.x + Math.cos(ra2) * big * 0.9, f.y + Math.sin(ra2) * big * 0.9, 2.5, 0, TAU); g.fill(); }
        } else if (fam === 'sinos') { // cura: cruzes verdes subindo
          g.fillStyle = rgba('#8dff9a', a);
          for (i = 0; i < 8; i++) { var ha = i * TAU / 8 + 0.3, hr = big * (0.25 + 0.55 * R()), hx = f.x + Math.cos(ha) * hr, hy = f.y + Math.sin(ha) * hr - e * 26; g.fillRect(hx - 1.5, hy - 5, 3, 10); g.fillRect(hx - 5, hy - 1.5, 10, 3); }
        }
        if (myth) { g.fillStyle = rgba('#ffb36b', a); for (i = 0; i < 14; i++) { var ea = R() * TAU, er = big * R() * e3; g.beginPath(); g.arc(f.x + Math.cos(ea) * er, f.y + Math.sin(ea) * er - e * 20, 2 + R() * 2, 0, TAU); g.fill(); } }
        break;
      }
      case 's_cone': { // espada e chicote: onda cortante em leque
        P = SKILL_RED; g.globalCompositeOperation = 'source-over'; // habilidade: vermelha de verdade (somar luz sobre o verde do chão deixaria laranja)
        var ex2 = f.extra, w2 = Array.isArray(ex2) ? ex2[0] : (ex2 || 2.3), rt2 = Array.isArray(ex2) ? ex2[1] : 0, ph2 = hbHalf(w2, rt2, f.size);
        var sw2 = (fam === 'espada' || fam === 'chicote') ? slashFrac(fam, f.age, 1, 2 * ph2) : Math.min(1, p * 2.2);
        var gr2 = g.createRadialGradient(f.x, f.y, 6, f.x, f.y, f.size);
        gr2.addColorStop(0, rgba(P.c, 0)); gr2.addColorStop(0.6, rgba(P.c, a * 0.5)); gr2.addColorStop(1, rgba(P.h, a * 0.9));
        var cimg = fxImg('fx_corte'); if (cimg) cimg = tintRed(cimg, 'fx_corte');
        if (cimg) { // arte de IA (a mesma do golpe normal, pintada de vermelho), encaixada no leque do dano
          cutWarp(g, f, w2, rt2, sw2, P, cimg, 'fx_corte', e3, p, a);
          break;
        }
        g.fillStyle = gr2; g.beginPath(); g.moveTo(f.x, f.y); g.arc(f.x, f.y, f.size, f.a - w2 / 2, f.a - w2 / 2 + w2 * sw2); g.closePath(); g.fill();
        g.strokeStyle = rgba('#ffffff', a * 0.9); g.lineWidth = 3 * a + 1;
        for (i = 0; i < (hi ? 4 : 3); i++) { var la = f.a - w2 / 2 + w2 * (i + 0.5) / (hi ? 4 : 3); if (la > f.a - w2 / 2 + w2 * sw2) continue; g.beginPath(); g.moveTo(f.x + Math.cos(la) * f.size * 0.25, f.y + Math.sin(la) * f.size * 0.25); g.lineTo(f.x + Math.cos(la) * f.size * (0.6 + 0.4 * e3), f.y + Math.sin(la) * f.size * (0.6 + 0.4 * e3)); g.stroke(); }
        g.strokeStyle = rgba(P.h, a); g.lineWidth = 4 * a + 1; g.beginPath(); g.arc(f.x, f.y, f.size * (0.75 + 0.25 * e3), f.a - w2 / 2, f.a - w2 / 2 + w2 * sw2); g.stroke();
        break;
      }
      case 's_dash': { // rapieira: investida com imagens residuais
        var to = f.extra || [f.x, f.y], dimg = fxImg('fx_investida');
        if (dimg) { // arte de IA esticada ao longo da investida (ponta no destino), com um fio de luz por baixo
          var dl = Math.hypot(to[0] - f.x, to[1] - f.y) + 70, dth = Math.max(60, Math.min(dl * dimg.height / dimg.width, 150)), dang = Math.atan2(to[1] - f.y, to[0] - f.x);
          g.strokeStyle = rgba(P.h, a * 0.5); g.lineWidth = 4 * a + 1; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(to[0], to[1]); g.stroke();
          g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.max(0, Math.min(1, Math.min(1, p * 12) * a * 1.4));
          g.translate((f.x + to[0]) / 2, (f.y + to[1]) / 2); g.rotate(dang); g.drawImage(dimg, -dl / 2, -dth / 2, dl, dth); g.restore();
          glow(g, to[0], to[1], 22, P.h, 0.6 * a);
          break;
        }
        g.strokeStyle = rgba(P.c, a * 0.55); g.lineWidth = 26 * a + 2; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(to[0], to[1]); g.stroke();
        g.strokeStyle = rgba(P.h, a * 0.9); g.lineWidth = 9 * a + 1; g.stroke();
        g.strokeStyle = rgba('#ffffff', a); g.lineWidth = 2.5; g.stroke();
        var dn = hi ? 6 : 4;
        for (i = 0; i < dn; i++) {
          var u = (i + 0.5) / dn, sx = f.x + (to[0] - f.x) * u, sy = f.y + (to[1] - f.y) * u, sa4 = f.a + (i % 2 ? 0.7 : -0.7);
          g.strokeStyle = rgba(P.h, a * (1 - u * 0.4)); g.lineWidth = 2;
          g.beginPath(); g.moveTo(sx - Math.cos(sa4) * 16, sy - Math.sin(sa4) * 16); g.lineTo(sx + Math.cos(sa4) * 16, sy + Math.sin(sa4) * 16); g.stroke();
        }
        glow(g, to[0], to[1], 22, P.h, 0.6 * a);
        break;
      }
      case 'mixfx': { // habilidade mista: desenho único por par de armas (cores de cada uma, número de braços e estilo vêm do par)
        var fa = f.fam, fb = typeof f.extra === 'string' && FAM[f.extra] ? f.extra : fa, ks = [fa, fb].sort(), hh = 0, ci;
        for (ci = 0; ci < (ks[0] + ks[1]).length; ci++) hh = (hh * 31 + (ks[0] + ks[1]).charCodeAt(ci)) % 9973;
        var PA = pal(fa, tier), PB = pal(fb, tier), arms = 3 + hh % 5, style = mixStyle(fa, fb), rad2 = f.size * (0.25 + 0.75 * e3);
        glow(g, f.x, f.y, f.size * 0.9, PA.c, 0.45 * a);
        var MR = { arco: 'flecha', varinha: 'magia', martelo: 'pancada', maca: 'pancada', cajado: 'pancada', espada: 'corte', chicote: 'corte', rapieira: 'corte', sinos: 'sinos' };
        var mimg = fxImg('fx_mix_' + (MR[fa] === 'magia' || MR[fb] === 'magia' ? 'magia' : MR[fa] === 'flecha' || MR[fb] === 'flecha' ? 'flecha' : MR[fa] === 'sinos' || MR[fb] === 'sinos' ? 'sinos' : MR[fa] === 'pancada' || MR[fb] === 'pancada' ? 'pancada' : MR[fa] === MR[fb] ? MR[fa] : 'ouro'));
        if (mimg) { // arte feita por IA, somada à luz do chão; gira devagar e some no fim
          var ms = f.size * (0.9 + 0.5 * e3), mal = Math.min(1, f.age * 10) * a;
          g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.max(0, Math.min(1, mal * 0.8));
          g.translate(f.x, f.y); g.rotate(T * 1.6 + hh); g.drawImage(mimg, -ms, -ms, ms * 2, ms * 2);
          g.globalAlpha *= 0.45; g.rotate(-T * 3.2 - hh * 2); g.drawImage(mimg, -ms * 0.62, -ms * 0.62, ms * 1.24, ms * 1.24);
          g.restore();
        }
        for (i = 0; i < 2; i++) { var rp = Math.max(0, Math.min(1, p * 1.2 - i * 0.18)); g.strokeStyle = rgba(i ? PB.c : PA.c, (1 - rp) * 0.95); g.lineWidth = 5 * (1 - rp) + 1; g.beginPath(); g.arc(f.x, f.y, f.size * (0.15 + 0.85 * (1 - Math.pow(1 - rp, 2))), 0, TAU); g.stroke(); }
        var rot = T * 3 + hh, segs = 14;
        for (i = 0; i < arms; i++) {
          var a0 = rot + i * TAU / arms;
          for (var sg2 = 0; sg2 < segs; sg2++) {
            var u = sg2 / segs, rr3 = rad2 * u, ang2 = style === 0 ? a0 + u * 2.4 : style === 1 ? a0 + Math.sin(u * 5 + T * 6) * 0.25 : style === 2 ? a0 + Math.sin(u * Math.PI) * 0.7 : a0 + (sg2 % 2 ? 0.08 : -0.08);
            var px = f.x + Math.cos(ang2) * rr3, py = f.y + Math.sin(ang2) * rr3, col = mix(PA.c, PB.c, u);
            g.fillStyle = rgba(col, a * (0.35 + 0.65 * u)); g.beginPath(); g.arc(px, py, (style === 2 ? 6 : 4) * (1 - u * 0.4) * a + 1.5, 0, TAU); g.fill();
          }
          var tx = f.x + Math.cos(a0 + (style === 0 ? 2.4 : 0)) * rad2, ty = f.y + Math.sin(a0 + (style === 0 ? 2.4 : 0)) * rad2;
          glow(g, tx, ty, 18 * a + 6, i % 2 ? PB.c : PA.c, 0.95 * a);
          if (style === 1) spikes(g, tx, ty, 2, 14 * a + 3, 4, a0, 0.3, rgba(PB.h, a));
        }
        spikes(g, f.x, f.y, 6, f.size * 0.55 * e3, arms * 2, -rot, 0.07, rgba(PB.c, a * 0.6));
        glow(g, f.x, f.y, 20 * a + 6, PB.h, 0.7 * a);
        break;
      }
      case 'healtrail': { // rapieira + sinos: faixa de cura no chão por 2 s, com brilhos subindo
        var to2 = f.extra || [f.x, f.y], gA = Math.max(0, Math.min(1, (1 - p) * 3)) * Math.min(1, f.age * 8), pls = 0.7 + 0.3 * Math.sin(T * 9);
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = 'rgba(20,70,40,' + (0.45 * gA) + ')'; g.lineWidth = 44; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(to2[0], to2[1]); g.stroke();
        g.globalCompositeOperation = 'lighter';
        var himg = fxImg('fx_cura');
        if (himg) { // arte de IA ao longo da faixa de cura (brilha e pulsa enquanto dura)
          var hl = Math.hypot(to2[0] - f.x, to2[1] - f.y) + 90, hth = Math.max(110, Math.min(hl * himg.height / himg.width * 1.4, 190)), hang = Math.atan2(to2[1] - f.y, to2[0] - f.x);
          g.save(); g.globalAlpha = Math.max(0, Math.min(1, gA * (0.8 + 0.2 * Math.sin(T * 7)))); g.translate((f.x + to2[0]) / 2, (f.y + to2[1]) / 2); g.rotate(hang);
          g.drawImage(himg, -hl / 2, -hth / 2 - 14, hl, hth); g.restore();
          g.strokeStyle = rgba('#5dff9a', gA * 0.3 * pls); g.lineWidth = 22; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(to2[0], to2[1]); g.stroke();
          break;
        }
        g.strokeStyle = rgba('#5dff9a', gA * 0.55 * pls); g.lineWidth = 34; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(to2[0], to2[1]); g.stroke();
        g.strokeStyle = rgba('#d9ffe8', gA * 0.7); g.lineWidth = 6; g.stroke();
        for (i = 0; i < 14; i++) {
          var u3 = (i * 0.137 + 0.05) % 1, up3 = ((f.age * 0.7 + i * 0.31) % 1), sx3 = f.x + (to2[0] - f.x) * u3 + Math.sin(i * 7 + f.age * 3) * 10, sy3 = f.y + (to2[1] - f.y) * u3 - up3 * 34;
          g.fillStyle = rgba(i % 2 ? '#ffffff' : '#7dffb3', gA * (1 - up3)); g.fillRect(sx3 - 1, sy3 - 5, 2, 10); g.fillRect(sx3 - 5, sy3 - 1, 10, 2);
        }
        break;
      }
      case 'ms': { // ataques especiais dos monstros comuns (desenhados no estilo do jogo: contorno escuro + cor do bicho)
        var mk = f.fam, rad = f.size, ink = 'rgba(40,24,30,' + (0.85 * a) + ')', mal0 = Math.min(1, p * 9) * Math.min(1, a * 1.5), msi = null;
        if (mk === 'cogumelo' && (msi = fxImg('fx_ms_esporos'))) { spr(g, msi, f.x, f.y - p * 10, rad * 2.3 * (0.4 + 0.6 * e3), T * 0.6, mal0, true); break; }
        if (mk === 'coelho' && (msi = fxImg('fx_ms_pouso'))) { spr(g, msi, f.x, f.y, rad * 2.5 * (0.35 + 0.65 * e3), 0, mal0, false); break; }
        if (mk === 'lobo' && (msi = fxImg('fx_ms_mordida'))) { // as duas fileiras de dentes se fecham em cima do alvo
          var wsn = Math.min(1, p / 0.32), wjx = f.x + Math.cos(f.a) * rad * 0.62, wjy = f.y + Math.sin(f.a) * rad * 0.62, wsz = rad * 1.3;
          g.save(); g.translate(wjx, wjy); g.rotate(f.a); g.scale(1, 1.3 - 0.45 * wsn * wsn); g.globalAlpha = Math.max(0, Math.min(1, p > 0.62 ? 1 - (p - 0.62) / 0.38 : 1));
          g.drawImage(msi, -wsz / 2, -wsz / 2, wsz, wsz); g.restore(); break;
        }
        if (mk === 'javali' && (msi = fxImg('fx_ms_javali'))) { spr(g, msi, f.x + Math.cos(f.a) * rad * 0.55, f.y + Math.sin(f.a) * rad * 0.55, rad * (1.1 + 0.4 * e3), f.a, mal0, false); break; }
        if (mk === 'broto' && (msi = fxImg('fx_ms_raizes'))) { spr(g, msi, f.x, f.y, rad * 2.4 * (0.3 + 0.7 * Math.min(1, p * 3.2)), 0, mal0, true); break; }
        if (mk === 'cogumelo') { // nuvem de esporos
          g.globalCompositeOperation = 'source-over';
          for (i = 0; i < 16; i++) {
            var sa = R() * TAU, sr = rad * (0.2 + 0.8 * e3) * (0.4 + 0.6 * R()), sz = 8 + R() * 12;
            g.fillStyle = rgba(i % 3 ? '#b6e07a' : '#e6d6ff', a * 0.6); g.strokeStyle = ink; g.lineWidth = 2;
            g.beginPath(); g.arc(f.x + Math.cos(sa) * sr, f.y + Math.sin(sa) * sr - p * 14, sz * (0.6 + 0.4 * a), 0, TAU); g.fill(); g.stroke();
          }
        } else if (mk === 'coelho') { // pouso: onda de terra e pó
          g.globalCompositeOperation = 'source-over';
          g.strokeStyle = rgba('#e9d9b0', a * 0.9); g.lineWidth = 8 * a + 1; g.beginPath(); g.arc(f.x, f.y, rad * (0.3 + 0.7 * e3), 0, TAU); g.stroke();
          for (i = 0; i < 10; i++) { var da = i * TAU / 10 + R() * 0.3, dr = rad * (0.3 + 0.7 * e3); g.fillStyle = rgba('#c9b27c', a * 0.8); g.beginPath(); g.arc(f.x + Math.cos(da) * dr, f.y + Math.sin(da) * dr - p * 10, 7 * a + 2, 0, TAU); g.fill(); }
        } else if (mk === 'lobo') { // mordida: duas arcadas de dentes que se fecham em cima do alvo
          g.globalCompositeOperation = 'source-over';
          var jx = f.x + Math.cos(f.a) * rad * 0.62, jy = f.y + Math.sin(f.a) * rad * 0.62, js = rad * 0.55;
          var snap = Math.min(1, p / 0.32), open2 = (1 - snap * snap) * 0.95 + 0.04, shake = p > 0.32 && p < 0.5 ? Math.sin(p * 120) * 2.5 : 0, fadeJ = p > 0.62 ? 1 - (p - 0.62) / 0.38 : 1;
          g.save(); g.translate(jx + shake * Math.cos(f.a + 1.57), jy + shake * Math.sin(f.a + 1.57)); g.rotate(f.a); g.globalAlpha = fadeJ;
          for (var jw = -1; jw <= 1; jw += 2) { // jw = -1 mandíbula de cima, 1 de baixo (no eixo do golpe)
            g.save(); g.scale(1, jw);
            var ang3 = open2 * 0.9, nT = 7, gy = js * 0.2 + js * 0.8 * open2 * 0.9;
            g.translate(0, -gy * 0.6);
            g.fillStyle = '#9b2c3a'; g.strokeStyle = 'rgba(30,14,20,.95)'; g.lineWidth = 4; g.beginPath(); g.moveTo(-js * 0.95, -js * 0.35); g.quadraticCurveTo(0, -js * 0.95, js * 0.95, -js * 0.35); g.lineTo(js * 0.8, -js * 0.08); g.quadraticCurveTo(0, -js * 0.45, -js * 0.8, -js * 0.08); g.closePath(); g.fill(); g.stroke(); // gengiva
            g.fillStyle = '#ffffff';
            for (i = 0; i < nT; i++) { var tx2 = -js * 0.78 + i * (js * 1.56 / (nT - 1)), big = (i === 1 || i === nT - 2) ? 1.5 : 1, th = js * 0.34 * big, tw = js * 0.12; g.strokeStyle = 'rgba(30,14,20,.95)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(tx2 - tw, -js * 0.12 + Math.abs(i - 3) * 0.6); g.lineTo(tx2, -js * 0.12 + th); g.lineTo(tx2 + tw, -js * 0.12 + Math.abs(i - 3) * 0.6); g.closePath(); g.fill(); g.stroke(); }
            g.restore();
          }
          g.restore();
          if (p > 0.3 && p < 0.55) { g.strokeStyle = rgba('#ffffff', 1 - (p - 0.3) / 0.25); g.lineWidth = 3; for (i = 0; i < 6; i++) { var ra3 = f.a + (i - 2.5) * 0.28, r0 = js * 0.5 + (p - 0.3) * 120; g.beginPath(); g.moveTo(jx + Math.cos(ra3) * r0, jy + Math.sin(ra3) * r0); g.lineTo(jx + Math.cos(ra3) * (r0 + 14), jy + Math.sin(ra3) * (r0 + 14)); g.stroke(); } } // faíscas do impacto
        } else if (mk === 'javali') { // rastro de investida
          g.globalCompositeOperation = 'source-over';
          var ex = f.x + Math.cos(f.a) * rad, ey = f.y + Math.sin(f.a) * rad;
          g.strokeStyle = rgba('#d8a878', a * 0.7); g.lineWidth = 38 * a + 4; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(ex, ey); g.stroke();
          g.strokeStyle = rgba('#ffffff', a * 0.9); g.lineWidth = 6 * a + 1; g.stroke();
          for (i = 0; i < 8; i++) { var u = R(); g.fillStyle = rgba('#c9b27c', a); g.beginPath(); g.arc(f.x + (ex - f.x) * u + (R() - 0.5) * 30, f.y + (ey - f.y) * u + (R() - 0.5) * 30, 6 * a + 2, 0, TAU); g.fill(); }
        } else if (mk === 'broto') { // raízes que saem do chão
          g.globalCompositeOperation = 'source-over';
          var gw = Math.min(1, p * 3.2);
          for (i = 0; i < 9; i++) {
            var ra = i * TAU / 9 + R() * 0.4, rl = rad * (0.45 + 0.55 * R()) * gw;
            g.strokeStyle = ink; g.lineWidth = 12 * a + 3; g.beginPath(); g.moveTo(f.x, f.y); g.quadraticCurveTo(f.x + Math.cos(ra + 0.4) * rl * 0.5, f.y + Math.sin(ra + 0.4) * rl * 0.5, f.x + Math.cos(ra) * rl, f.y + Math.sin(ra) * rl); g.stroke();
            g.strokeStyle = rgba('#8a5a32', a); g.lineWidth = 7 * a + 1; g.stroke();
            g.fillStyle = rgba('#7cc24a', a); g.beginPath(); g.arc(f.x + Math.cos(ra) * rl, f.y + Math.sin(ra) * rl, 6 * a + 2, 0, TAU); g.fill();
          }
        } else if (mk === 'aranha') { // tiro de teia: bola de seda voa em linha reta e, se acerta, abre uma rede em cima do alvo
          g.globalCompositeOperation = 'source-over';
          var fl = Math.min(1, p / 0.45), L2 = rad * (1 - Math.pow(1 - fl, 2)), bx2 = f.x + Math.cos(f.a) * L2, by2 = f.y + Math.sin(f.a) * L2;
          g.strokeStyle = rgba('#ffffff', a * 0.8); g.lineWidth = 2.5; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(bx2, by2); g.stroke(); // fio de seda
          g.strokeStyle = rgba('#c9b8ff', a * 0.5); g.lineWidth = 6; g.stroke();
          if (fl < 1) { g.fillStyle = ink; g.beginPath(); g.arc(bx2, by2, 13, 0, TAU); g.fill(); g.fillStyle = '#f4f0ff'; g.beginPath(); g.arc(bx2, by2, 10, 0, TAU); g.fill(); g.strokeStyle = 'rgba(150,130,200,.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx2 - 8, by2); g.lineTo(bx2 + 8, by2); g.moveTo(bx2, by2 - 8); g.lineTo(bx2, by2 + 8); g.stroke(); }
          else if (fxImg('fx_ms_teia')) { // rede aberta (arte de IA)
            var tnr = (f.extra ? 56 : 30) * (0.6 + 0.4 * Math.min(1, (p - 0.45) / 0.2)), tna = Math.max(0, 1 - (p - 0.65) / 0.35);
            spr(g, fxImg('fx_ms_teia'), bx2, by2, tnr * 2.6, 0, tna, true);
          } else { // rede aberta (maior se acertou alguém)
            var nr = (f.extra ? 56 : 30) * (0.6 + 0.4 * Math.min(1, (p - 0.45) / 0.2)), na = Math.max(0, 1 - (p - 0.65) / 0.35);
            g.strokeStyle = rgba('#ffffff', na); g.lineWidth = 2.5;
            for (i = 0; i < 8; i++) { var ra2 = i * TAU / 8; g.beginPath(); g.moveTo(bx2, by2); g.lineTo(bx2 + Math.cos(ra2) * nr, by2 + Math.sin(ra2) * nr); g.stroke(); }
            for (var q2 = 1; q2 <= 3; q2++) { g.beginPath(); for (i = 0; i <= 8; i++) { var rb = i * TAU / 8; var rx = bx2 + Math.cos(rb) * nr * q2 / 3 * (i % 2 ? 0.88 : 1), ry = by2 + Math.sin(rb) * nr * q2 / 3 * (i % 2 ? 0.88 : 1); if (i) g.lineTo(rx, ry); else g.moveTo(rx, ry); } g.stroke(); }
          }
        } else if (mk === 'arvore') { // galho que despenca com folhas douradas
          g.globalCompositeOperation = 'source-over';
          var fall = Math.min(1, p * 4);
          g.fillStyle = 'rgba(60,30,10,' + (0.3 * a) + ')'; g.beginPath(); g.arc(f.x, f.y, rad, 0, TAU); g.fill(); // área toda que machuca
          g.fillStyle = 'rgba(90,40,10,' + (0.35 * a) + ')'; g.beginPath(); g.arc(f.x, f.y, rad * 0.6, 0, TAU); g.fill(); g.strokeStyle = rgba('#f2c14e', a * 0.9); g.lineWidth = 3; g.beginPath(); g.arc(f.x, f.y, rad * 0.6, 0, TAU); g.stroke(); // núcleo: dano total e atordoa
          if (fxImg('fx_ms_galho')) { spr(g, fxImg('fx_ms_galho'), f.x, f.y, rad * 2.3, 0, Math.min(1, p * 6) * Math.min(1, a * 1.5), true); break; }
          g.save(); g.translate(f.x, f.y - (1 - fall) * rad * 1.3); g.rotate(0.5);
          g.fillStyle = ink; g.fillRect(-rad * 0.95, -13, rad * 1.9, 26); g.fillStyle = rgba('#8a5a32', a); g.fillRect(-rad * 0.9, -9, rad * 1.8, 18); g.restore();
          for (i = 0; i < 14; i++) { var la = R() * TAU, lr = rad * (0.2 + 0.9 * e3) * R(); g.fillStyle = rgba(i % 2 ? '#f2c14e' : '#d98b2b', a); g.beginPath(); g.ellipse(f.x + Math.cos(la) * lr, f.y + Math.sin(la) * lr - p * 20, 8 * a + 2, 4 * a + 1, la, 0, TAU); g.fill(); }
        }
        break;
      }
      case 'd_breath': { // sopro do dragão: jato de fogo que sai da boca e abre em cone
        var range = f.size, w3 = f.extra || 0.8, jets = [fxImg('fx_jato_1'), fxImg('fx_jato_2'), fxImg('fx_jato_3')];
        var fade = p > 0.62 ? 1 - (p - 0.62) / 0.38 : 1, grow = Math.min(1, p / 0.3), gE = 1 - Math.pow(1 - grow, 3);
        var coneW = 2 * range * Math.tan(w3 / 2), gimg = !!(jets[0] && jets[1] && jets[2]), k0 = gimg ? 0.4 : 1;
        // zona de dano: o cone fica sempre marcado, mais fraco quando o fogo desenhado está por cima
        var gb = g.createRadialGradient(f.x, f.y, 10, f.x, f.y, range * (gimg ? 1 : Math.max(0.05, grow)));
        gb.addColorStop(0, 'rgba(255,250,200,' + 0.9 * fade * k0 + ')'); gb.addColorStop(0.35, 'rgba(255,170,50,' + 0.6 * fade * k0 + ')'); gb.addColorStop(1, 'rgba(255,60,20,0)');
        g.fillStyle = gb; g.beginPath(); g.moveTo(f.x, f.y); g.arc(f.x, f.y, range * (gimg ? gE : Math.max(0.05, grow)), f.a - w3 / 2, f.a + w3 / 2); g.closePath(); g.fill();
        var rr = rand(seed + Math.floor(T * 24));
        if (gimg) {
          var sg = f.sg || (Math.cos(f.a) < 0 ? -1 : 1), ox = f.x + sg * MOUTH.x, oy = f.y + MOUTH.y;
          var proj = (ox - f.x) * Math.cos(f.a) + (oy - f.y) * Math.sin(f.a);
          var L = Math.max(range * 0.55, range * 1.06 - proj) * (0.28 + 0.72 * gE) * (1 + 0.025 * Math.sin(f.age * 38));
          var fi = Math.max(0, f.age) * 13, i0 = Math.floor(fi) % 3, i1 = (i0 + 1) % 3, fr = fi - Math.floor(fi);
          var intro = Math.min(1, p / 0.07) * fade;
          [[i0, 1 - fr], [i1, fr]].forEach(function (q) {
            var m = JET[q[0]], sx = L / m.w, ky = Math.max(1, Math.min(1.9, coneW * 0.78 / (m.endH * (L / m.w))));
            g.save(); g.translate(ox, oy); g.rotate(f.a); g.scale(sx, sx * ky * (0.55 + 0.45 * gE)); g.globalAlpha = q[1] * intro;
            g.drawImage(jets[q[0]], 0, -m.h / 2, m.w, m.h); g.restore();
          });
          glow(g, ox, oy, 70 * (1 - p * 0.5), '#ffe6a0', 0.85 * Math.max(0, 1 - p * 2.2) + 0.2 * fade); // clarão na boca
          glow(g, ox + Math.cos(f.a) * L * 0.55, oy + Math.sin(f.a) * L * 0.55, coneW * 0.5, '#ff7a2a', 0.22 * fade); // o fogo ilumina o chão
          for (i = 0; i < 14; i++) { // faíscas soltas ao longo do jato
            var sd = (0.2 + rr() * 0.85) * L * gE, sa = f.a + (rr() - 0.5) * w3 * 0.9 * (sd / range + 0.2);
            glow(g, ox + Math.cos(sa) * sd, oy + Math.sin(sa) * sd, 3 + rr() * 5, rr() < 0.5 ? '#ffd27a' : '#ff8a2a', 0.8 * fade);
          }
        } else {
          for (i = 0; i < 34; i++) {
            var fd = rr() * range * grow, fa = f.a + (rr() - 0.5) * w3 * (0.25 + fd / range * 0.75), fs = 8 + fd / range * 26 + rr() * 8;
            glow(g, f.x + Math.cos(fa) * fd, f.y + Math.sin(fa) * fd, fs, rr() < 0.4 ? '#ffd27a' : rr() < 0.6 ? '#ff8a2a' : '#ff4a1a', 0.55 * fade);
          }
        }
        break;
      }
      case 'd_slam': { // pancada do dragão: onda de choque de fogo sobre o chão rachado
        var rs = f.size * (0.1 + 0.9 * e3), onda = fxImg('fx_onda_' + (1 + ((seed >> 3) & 1)));
        if (onda) {
          var rot = R() * TAU, grw = 0.32 + 0.68 * e3, al = p < 0.1 ? p / 0.1 : (p < 0.5 ? 1 : 1 - (p - 0.5) / 0.5), DS = f.size / ONDA_R;
          glow(g, f.x, f.y, f.size * 1.25, '#ff6a2a', 0.38 * al);
          g.globalCompositeOperation = 'source-over'; // chão chamuscado por baixo do fogo
          var sc0 = g.createRadialGradient(f.x, f.y, f.size * 0.1, f.x, f.y, f.size * grw);
          sc0.addColorStop(0, 'rgba(24,10,6,' + 0.5 * al + ')'); sc0.addColorStop(0.8, 'rgba(24,10,6,' + 0.38 * al + ')'); sc0.addColorStop(1, 'rgba(24,10,6,0)');
          g.fillStyle = sc0; g.beginPath(); g.arc(f.x, f.y, f.size * grw, 0, TAU); g.fill();
          g.globalCompositeOperation = 'lighter';
          g.save(); g.translate(f.x, f.y); g.rotate(rot); g.scale(grw, grw); g.globalAlpha = Math.min(1, al * 0.92);
          g.drawImage(onda, -DS / 2, -DS / 2, DS, DS); g.restore();
          g.strokeStyle = rgba('#ffd27a', a * 0.7); g.lineWidth = 8 * a + 1.5; g.beginPath(); g.arc(f.x, f.y, rs, 0, TAU); g.stroke(); // frente da onda
        } else {
          glow(g, f.x, f.y, f.size * 1.1, '#ff6a2a', 0.4 * a);
          g.strokeStyle = rgba('#ffd27a', a); g.lineWidth = 14 * a + 2; g.beginPath(); g.arc(f.x, f.y, rs, 0, TAU); g.stroke();
          g.strokeStyle = rgba('#ff5a20', a * 0.8); g.lineWidth = 6; g.beginPath(); g.arc(f.x, f.y, rs * 0.7, 0, TAU); g.stroke();
          g.strokeStyle = rgba('#ffb36b', a * 0.9); g.lineWidth = 3;
          for (i = 0; i < 14; i++) { var ka = i * TAU / 14 + R() * 0.2; g.beginPath(); g.moveTo(f.x + Math.cos(ka) * rs * 0.3, f.y + Math.sin(ka) * rs * 0.3); g.lineTo(f.x + Math.cos(ka + 0.06) * rs, f.y + Math.sin(ka + 0.06) * rs); g.stroke(); }
        }
        g.fillStyle = rgba('#ffcf80', a);
        for (i = 0; i < 20; i++) { var ba = R() * TAU, br = f.size * R() * e3; g.beginPath(); g.arc(f.x + Math.cos(ba) * br, f.y + Math.sin(ba) * br - Math.sin(p * Math.PI) * 26 * R(), 2 + R() * 2.5, 0, TAU); g.fill(); }
        break;
      }
      case 'hit': { // impacto: clarão, riscos na direção do golpe e anel na cor de quem apanhou
        var hc = f.extra || '#ffd36b', hs = f.size, himg0 = fxImg('fx_impacto');
        if (himg0) { // arte de IA (branca): a cor de quem apanhou vem do brilho por trás
          glow(g, f.x, f.y, hs * (1.0 + 0.8 * e3), hc, 0.6 * a);
          spr(g, himg0, f.x, f.y, hs * 2.2 * (0.45 + 0.55 * e3), f.a, Math.min(1, p * 12) * Math.min(1, a * 1.6), true);
          break;
        }
        glow(g, f.x, f.y, hs * (0.9 + 0.8 * e3), hc, 0.55 * a);
        glow(g, f.x, f.y, hs * 0.55 * (1 - p * 0.5), '#ffffff', 0.9 * a);
        g.strokeStyle = rgba('#ffffff', a * 0.95); g.lineWidth = 3.2 * a + 0.8;
        for (i = -1; i <= 1; i++) {
          var ra3 = f.a + i * 0.5, q0 = hs * 0.25, q1 = hs * (0.7 + 0.8 * e3) * (i ? 0.7 : 1);
          g.beginPath(); g.moveTo(f.x + Math.cos(ra3) * q0, f.y + Math.sin(ra3) * q0); g.lineTo(f.x + Math.cos(ra3) * q1, f.y + Math.sin(ra3) * q1); g.stroke();
        }
        g.strokeStyle = rgba(hc, a * 0.8); g.lineWidth = 3 * a + 0.6; g.beginPath(); g.arc(f.x, f.y, hs * (0.2 + 0.8 * e3), 0, TAU); g.stroke();
        break;
      }
      case 'pop': { // projétil que acaba: estouro pequeno
        var pc = f.extra || '#ffd36b', pimg = fxImg('fx_estouro');
        if (pimg) { spr(g, pimg, f.x, f.y, f.size * 2.1 * (0.4 + 0.6 * e3), seed % 6, Math.min(1, p * 10) * Math.min(1, a * 1.6), true); break; }
        glow(g, f.x, f.y, f.size * (0.7 + 0.9 * e3), pc, 0.5 * a);
        g.strokeStyle = rgba('#ffffff', a * 0.8); g.lineWidth = 2 * a + 0.5; g.beginPath(); g.arc(f.x, f.y, f.size * (0.3 + 0.9 * e3), 0, TAU); g.stroke();
        g.fillStyle = rgba(pc, a);
        for (i = 0; i < 6; i++) { var pa = i * TAU / 6 + R() * 0.5; g.beginPath(); g.arc(f.x + Math.cos(pa) * f.size * e3 * 1.2, f.y + Math.sin(pa) * f.size * e3 * 1.2, 1.6 * a + 0.4, 0, TAU); g.fill(); }
        break;
      }
      case 'dust': { // pancada no chão: poeira e onda achatada
        var dimg0 = fxImg('fx_poeira');
        if (dimg0) { spr(g, dimg0, f.x, f.y, f.size * 2.8 * (0.35 + 0.65 * e3), 0, 0.95 * Math.min(1, p * 8) * Math.min(1, a * 1.4), false); break; }
        g.globalCompositeOperation = 'source-over';
        for (i = 0; i < 9; i++) {
          var da = i * TAU / 9 + R() * 0.4, dd = f.size * (0.25 + 0.75 * e3), pr = (5 + R() * 5) * (0.6 + e3);
          g.fillStyle = 'rgba(176,160,128,' + (0.42 * a) + ')';
          g.beginPath(); g.ellipse(f.x + Math.cos(da) * dd, f.y + Math.sin(da) * dd * 0.6 - e * 6, pr, pr * 0.7, 0, 0, TAU); g.fill();
        }
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = rgba('#ffe9b0', a * 0.55); g.lineWidth = 2.5 * a + 0.5;
        g.beginPath(); g.ellipse(f.x, f.y, f.size * (0.2 + 0.8 * e3), f.size * (0.2 + 0.8 * e3) * 0.6, 0, 0, TAU); g.stroke();
        break;
      }
      case 'tomb': { // lápide do prêmio semanal: sobe do chão onde o jogador caiu, fica um instante e some (tier 2 = dourada)
        var gold = f.tier >= 2, rise = Math.min(1, p / 0.12), er = 1 - Math.pow(1 - rise, 3), fade = p > 0.78 ? 1 - (p - 0.78) / 0.22 : 1;
        var tw = 22, th = 46 * er, tx = f.x, ty = f.y + 14;
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = Math.max(0, fade);
        // poeira ao subir
        for (i = 0; i < 7; i++) { var da = i / 7 * TAU, dr = (6 + 22 * rise) * (0.6 + 0.5 * R()); g.fillStyle = 'rgba(120,100,70,' + (0.35 * (1 - rise)).toFixed(2) + ')'; g.beginPath(); g.arc(tx + Math.cos(da) * dr, ty + Math.sin(da) * dr * 0.35, 3 + 3 * R(), 0, TAU); g.fill(); }
        if (gold) { g.globalCompositeOperation = 'lighter'; glow(g, tx, ty - th * 0.5, 46, '#ffd36b', 0.4 * fade); g.globalCompositeOperation = 'source-over'; }
        g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(tx, ty, tw + 6, 6, 0, 0, TAU); g.fill();
        var timg = fxImg(gold ? 'fx_lapide_ouro' : 'fx_lapide');
        if (timg) { // arte de IA: a lápide sobe do chão
          var tws = 50, ths = tws * timg.height / timg.width;
          g.save(); g.translate(tx, ty); g.scale(1, Math.max(0.02, er)); g.drawImage(timg, -tws / 2, -ths, tws, ths); g.restore();
          if (gold) for (i = 0; i < 3; i++) { var sp0 = ((p * 2 + i / 3) % 1); g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba('#fff3c4', (1 - sp0) * fade); g.beginPath(); g.arc(tx + (i - 1) * 12, ty - ths * 0.4 - sp0 * 26, 2.2, 0, TAU); g.fill(); }
          g.globalAlpha = 1; break;
        }
        g.beginPath(); g.moveTo(tx - tw, ty); g.lineTo(tx - tw, ty - th + tw); g.arc(tx, ty - th + tw, tw, Math.PI, 0); g.lineTo(tx + tw, ty); g.closePath();
        var tg = g.createLinearGradient(tx - tw, 0, tx + tw, 0);
        if (gold) { tg.addColorStop(0, '#a8740d'); tg.addColorStop(0.35, '#ffe483'); tg.addColorStop(1, '#c58b12'); } else { tg.addColorStop(0, '#6d7078'); tg.addColorStop(0.4, '#b8bcc4'); tg.addColorStop(1, '#7b7f88'); }
        g.fillStyle = tg; g.fill(); g.lineWidth = 2.2; g.strokeStyle = 'rgba(22,14,10,.9)'; g.stroke();
        if (rise > 0.8) { // cruz gravada e capim na base
          g.strokeStyle = gold ? '#7a5208' : '#4a4d55'; g.lineWidth = 3; g.beginPath(); g.moveTo(tx, ty - th + tw - 8); g.lineTo(tx, ty - th + tw + 12); g.moveTo(tx - 7, ty - th + tw); g.lineTo(tx + 7, ty - th + tw); g.stroke();
          g.strokeStyle = '#4d8a3a'; g.lineWidth = 2; g.beginPath(); for (i = -2; i <= 2; i++) { g.moveTo(tx + i * 7, ty); g.lineTo(tx + i * 7 + (i % 2 ? 3 : -3), ty - 9); } g.stroke();
        }
        if (gold) for (i = 0; i < 3; i++) { var sp = ((p * 2 + i / 3) % 1); g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba('#fff3c4', (1 - sp) * fade); g.beginPath(); g.arc(tx + (i - 1) * 11, ty - th * 0.4 - sp * 26, 2.2, 0, TAU); g.fill(); }
        g.globalAlpha = 1;
        break;
      }
      case 'lvl': { // subiu de nível: anéis dourados e faíscas subindo
        var limg = fxImg('fx_nivel');
        if (limg) { // arte de IA: anéis com runas e coluna de luz; o centro dos anéis fica sobre o chão do slime
          var lw0 = f.size * 2.5 * (0.5 + 0.5 * e3);
          glow(g, f.x, f.y - 10, 64 * (1 - p * 0.3), '#ffd36b', 0.3 * a);
          spr(g, limg, f.x, f.y + 10, lw0, 0, Math.min(1, p * 8) * Math.min(1, a * 1.5), true, 0.5, 0.74);
          break;
        }
        glow(g, f.x, f.y - 10, 64 * (1 - p * 0.3), '#ffd36b', 0.5 * a);
        for (i = 0; i < 3; i++) {
          var lp = Math.max(0, Math.min(1, p * 1.3 - i * 0.13)), le = 1 - Math.pow(1 - lp, 2);
          g.strokeStyle = rgba(i ? '#ffb347' : '#fff3c4', (1 - lp) * 0.9); g.lineWidth = 5 * (1 - lp) + 1;
          g.beginPath(); g.ellipse(f.x, f.y + 10, f.size * (0.2 + 0.9 * le), f.size * (0.2 + 0.9 * le) * 0.45, 0, 0, TAU); g.stroke();
        }
        g.fillStyle = rgba('#fff3c4', a);
        for (i = 0; i < 14; i++) { var sa5 = i * TAU / 14 + R() * 0.3, sr = f.size * (0.4 + 0.5 * R()); g.beginPath(); g.arc(f.x + Math.cos(sa5) * sr, f.y + 10 + Math.sin(sa5) * sr * 0.45 - e3 * 60 * (0.5 + R()), 2.2 * a + 0.6, 0, TAU); g.fill(); }
        break;
      }
      case 'd_claw': { // garras: arranhão de fogo que desce na frente do dragão
        var gar = fxImg('fx_garra');
        if (gar) {
          var DG = f.size * 1.9, rv = Math.min(1, 0.18 + p * 3.2);
          g.save(); g.translate(f.x + Math.cos(f.a) * f.size * 0.62, f.y + Math.sin(f.a) * f.size * 0.62); g.rotate(f.a);
          g.scale(0.78 + 0.3 * e3, 0.78 + 0.3 * e3);
          g.beginPath(); g.rect(-DG / 2, -DG / 2, DG, DG * rv); g.clip(); // o arranhão aparece de cima para baixo
          g.globalAlpha = Math.min(1, a * 1.5);
          g.drawImage(gar, -DG / 2, -DG / 2, DG, DG); g.restore();
          glow(g, f.x + Math.cos(f.a) * f.size * 0.62, f.y + Math.sin(f.a) * f.size * 0.62, f.size * 0.7, '#ff6a2a', 0.3 * a);
        } else {
          for (i = -1; i <= 1; i++) {
            var cl = f.a + i * 0.28, c0 = f.size * 0.25, c1 = f.size * (0.5 + 0.55 * e3);
            g.strokeStyle = rgba('#ffd9a0', a); g.lineWidth = 5 * a + 1; g.beginPath(); g.moveTo(f.x + Math.cos(cl - 0.5) * c0, f.y + Math.sin(cl - 0.5) * c0); g.quadraticCurveTo(f.x + Math.cos(cl) * c1 * 1.1, f.y + Math.sin(cl) * c1 * 1.1, f.x + Math.cos(cl + 0.5) * c1, f.y + Math.sin(cl + 0.5) * c1); g.stroke();
            g.strokeStyle = rgba('#ff5a2a', a * 0.6); g.lineWidth = 11 * a; g.stroke();
          }
        }
        break;
      }
    }
    g.restore();
  }

  /* ---------- aviso do ataque do dragão (desenhado no chão antes de sair o golpe) ---------- */
  function drawTele(g, w, T) {
    var p = Math.min(1, w.age / w.t), pulse = 0.5 + 0.5 * Math.sin(T * 18);
    g.save();
    if (w.kind === 0) {
      var half = w.width / 2;
      g.fillStyle = 'rgba(255,60,30,' + (0.1 + 0.08 * pulse) + ')';
      g.beginPath(); g.moveTo(w.x, w.y); g.arc(w.x, w.y, w.range, w.a - half, w.a + half); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,120,40,' + (0.2 + 0.2 * p) + ')';
      g.beginPath(); g.moveTo(w.x, w.y); g.arc(w.x, w.y, w.range * p, w.a - half, w.a + half); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,200,120,' + (0.55 + 0.3 * pulse) + ')'; g.lineWidth = 2.5; g.setLineDash([10, 8]);
      g.beginPath(); g.moveTo(w.x, w.y); g.lineTo(w.x + Math.cos(w.a - half) * w.range, w.y + Math.sin(w.a - half) * w.range); g.arc(w.x, w.y, w.range, w.a - half, w.a + half); g.lineTo(w.x, w.y); g.stroke();
    } else {
      g.fillStyle = 'rgba(255,60,30,' + (0.1 + 0.08 * pulse) + ')'; g.beginPath(); g.arc(w.x, w.y, w.range, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,120,40,' + (0.2 + 0.2 * p) + ')'; g.beginPath(); g.arc(w.x, w.y, w.range * p, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,200,120,' + (0.55 + 0.3 * pulse) + ')'; g.lineWidth = 2.5; g.setLineDash([10, 8]); g.beginPath(); g.arc(w.x, w.y, w.range, 0, TAU); g.stroke();
    }
    g.restore();
  }

  /* ---------- projéteis ---------- */
  // Flecha colorida: haste e penas na cor do arco, ponta clara com contorno escuro e rastro sempre aceso (dá para seguir cada flecha na tela)
  function arrow(g, x, y, ang, P, tier, T, trail, sc) {
    g.save(); g.translate(x, y); g.rotate(ang); if (sc) g.scale(sc, sc);
    g.globalCompositeOperation = 'lighter';
    var tg = g.createLinearGradient(-70, 0, 0, 0); tg.addColorStop(0, rgba(P.c, 0)); tg.addColorStop(1, rgba(P.c, 0.85));
    g.strokeStyle = tg; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(-70, 0); g.lineTo(-6, 0); g.stroke();
    g.strokeStyle = rgba(P.h, 0.7); g.lineWidth = 2.5; g.beginPath(); g.moveTo(-40, 0); g.lineTo(-6, 0); g.stroke();
    glow(g, 8, 0, 16 + tier, P.c, 0.55);
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(20,12,16,.85)'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(-18, 0); g.lineTo(11, 0); g.stroke(); // contorno
    g.strokeStyle = P.c; g.lineWidth = 3.6; g.beginPath(); g.moveTo(-18, 0); g.lineTo(11, 0); g.stroke();
    g.fillStyle = 'rgba(20,12,16,.85)'; g.beginPath(); g.moveTo(21, 0); g.lineTo(6, -7.5); g.lineTo(9, 0); g.lineTo(6, 7.5); g.closePath(); g.fill();
    g.fillStyle = P.h; g.beginPath(); g.moveTo(18, 0); g.lineTo(8, -5); g.lineTo(10, 0); g.lineTo(8, 5); g.closePath(); g.fill();
    g.fillStyle = 'rgba(20,12,16,.85)'; g.beginPath(); g.moveTo(-17, 0); g.lineTo(-27, -7.5); g.lineTo(-11, -1); g.closePath(); g.fill(); g.beginPath(); g.moveTo(-17, 0); g.lineTo(-27, 7.5); g.lineTo(-11, 1); g.closePath(); g.fill();
    g.fillStyle = P.h; g.beginPath(); g.moveTo(-18, 0); g.lineTo(-25, -5.5); g.lineTo(-13, -1); g.closePath(); g.fill(); g.beginPath(); g.moveTo(-18, 0); g.lineTo(-25, 5.5); g.lineTo(-13, 1); g.closePath(); g.fill();
    g.restore();
  }
  var ARROW_BASIC = 0.6; // tamanho da flecha do ataque normal do arco (1 = como era antes)
  function drawProj(g, e, T) {
    var tier = e.tier || 1, P = pal(FAM[e.fam] ? e.fam : 'varinha', tier), x = e.rx, y = e.ry, R = e.r || 10, ang = e.a || 0, i;
    if (e.k === 'p' && e.fam === 'arco') {
      var aimg = fxImg('fx_proj_flecha');
      if (aimg) { var aw = (150 + tier * 8) * ARROW_BASIC; spr(g, aimg, x, y, aw, ang, 1, true, 0.86, 0.5); return; } // ataque normal: flecha menor
      arrow(g, x, y, ang, P, tier, T, tier >= 2, ARROW_BASIC); return;
    }
    if (e.k === 'v') { arrow(g, x, y, ang, P, tier, T, true); return; }
    g.save(); g.translate(x, y); g.globalCompositeOperation = 'lighter';
    var ca = Math.cos(ang), sa = Math.sin(ang);
    if (e.k === 'o') { // orbe do cajado: esfera pulsante com anel girando
      var pr = R * (1.5 + 0.12 * Math.sin(T * 12));
      glow(g, 0, 0, pr * 2.4, P.c, 0.55);
      var gr = g.createRadialGradient(-pr * 0.25, -pr * 0.25, 1, 0, 0, pr);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, P.h); gr.addColorStop(1, P.c);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, pr, 0, TAU); g.fill();
      g.strokeStyle = rgba('#ffffff', 0.7); g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, 0, pr * 1.45, pr * 0.55, T * 5, 0, TAU); g.stroke();
      for (i = 0; i < 3; i++) { var oa = T * 6 + i * TAU / 3; g.fillStyle = rgba(P.h, 0.9); g.beginPath(); g.arc(Math.cos(oa) * pr * 1.5 - ca * i * 6, Math.sin(oa) * pr * 1.5 - sa * i * 6, 2.4, 0, TAU); g.fill(); }
    } else if (e.k === 'b') { // raio da varinha: cabeça comprida com rastro em zigue-zague
      var len = R * 5.5;
      var tg = g.createLinearGradient(-ca * len, -sa * len, 0, 0); tg.addColorStop(0, rgba(P.c, 0)); tg.addColorStop(1, rgba(P.h, 0.9));
      g.strokeStyle = tg; g.lineWidth = R * 1.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(-ca * len, -sa * len); g.lineTo(0, 0); g.stroke();
      if (tier >= 3) { g.strokeStyle = rgba('#ffffff', 0.85); g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 0); for (i = 1; i <= 7; i++) { var jz = (((i * 37 + Math.floor(T * 30)) % 7) - 3) * 2.2; g.lineTo(-ca * i * len / 7 - sa * jz, -sa * i * len / 7 + ca * jz); } g.stroke(); }
      glow(g, 0, 0, R * 3.2, P.c, 0.7);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, R * 0.8, 0, TAU); g.fill();
      if (tier >= 6) for (i = 0; i < 5; i++) { var fl = (T * 3 + i * 0.2) % 1; glow(g, -ca * fl * len + Math.sin(T * 20 + i) * 4, -sa * fl * len + Math.cos(T * 20 + i) * 4, 8 * (1 - fl) + 2, '#ff8a2a', 0.6 * (1 - fl)); }
    } else if (e.fam === 'varinha' && fxImg('fx_proj_varinha')) { // disparo básico da varinha (arte de IA: o orbe fica na frente e o rastro atrás)
      g.restore(); spr(g, fxImg('fx_proj_varinha'), x, y, R * 9.5, ang, 1, true, 0.785, 0.5); return;
    } else { // disparo básico da varinha
      glow(g, 0, 0, R * 2.6, P.c, 0.65);
      var gv = g.createRadialGradient(0, 0, 0.5, 0, 0, R * 1.1); gv.addColorStop(0, '#ffffff'); gv.addColorStop(0.5, P.h); gv.addColorStop(1, rgba(P.c, 0));
      g.fillStyle = gv; g.beginPath(); g.arc(0, 0, R * 1.2, 0, TAU); g.fill();
      g.strokeStyle = rgba(P.c, 0.5); g.lineWidth = R * 0.9; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-ca * R * 3.4, -sa * R * 3.4); g.stroke();
      for (i = 0; i < 3; i++) { var sp = (T * 5 + i * 0.37) % 1; g.fillStyle = rgba(P.h, 0.8 * (1 - sp)); g.beginPath(); g.arc(-ca * sp * R * 5 + Math.sin(T * 17 + i * 2) * 3, -sa * sp * R * 5 + Math.cos(T * 17 + i * 2) * 3, 1.8 * (1 - sp) + 0.6, 0, TAU); g.fill(); }
    }
    g.restore();
  }

  /* ---------- arma nas mãos do slime ---------- */
  // O bracinho sai do ombro e a mão segura a arma pelo cabo (geo diz onde fica a empunhadura e para onde a arma aponta).
  // Parada, a arma fica apontada para onde o slime olha; no golpe a mão faz o movimento da família e a arma vai junto.
  var STYLE = { faca: 'stab', rapieira: 'stab', espada: 'slash', chicote: 'slash', martelo: 'smash', maca: 'smash', arco: 'shoot', varinha: 'shoot', cajado: 'shoot', sinos: 'ring' };
  function ease(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
  /* ---- espada e chicote: linha do tempo do golpe cortante ---- */
  // 0 → wE: puxa a arma para trás (antecipação) · wE → sE: corte rápido, que passa um pouco do alvo · depois acompanha o golpe e volta ao repouso.
  // da = ângulo da mão em relação à direção do golpe, df = quanto o braço estica, wr = giro do pulso. Bate com a pose do corpo (attackPose, em game.js).
  var SL = {
    espada:  { span: 1.9, wind: 0.5, over: 0.1, wE: 0.12, sE: 0.34, wr0: 0.5, wr1: -0.4 },
    chicote: { span: 2.6, wind: 0.75, over: 0.14, wE: 0.14, sE: 0.4, wr0: 0.2, wr1: -0.2 }
  };
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpAng(a, b, t) { var d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * t; }
  function eo3(x) { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); }
  function eio(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  // span = abertura da área de dano (rad). O corte sai de -span/2 e vai até +span/2: a ponta percorre a área de dano de ponta a ponta.
  function slashPose(uq, fam, span) {
    var c = SL[fam] || SL.espada, sp = span || c.span, s0 = -sp / 2, s1 = sp / 2, back = s0 - c.wind, p, q, o = {};
    if (uq < c.wE) { p = eo3(uq / c.wE); o.da = lerp(s0, back, p); o.df = lerp(1, 0.78, p); o.wr = lerp(0, c.wr0, p); }
    else if (uq < c.sE) { p = (uq - c.wE) / (c.sE - c.wE); q = 0.65 * eo3(p) + 0.35 * eio(p); o.da = lerp(back, s1 + c.over, q); o.df = lerp(0.78, 1.18, q); o.wr = lerp(c.wr0, c.wr1, q); }
    else { p = eo3((uq - c.sE) / 0.26); o.da = lerp(s1 + c.over, s1, p); o.df = lerp(1.18, 1.04, p); o.wr = lerp(c.wr1, 0, p); }
    return o;
  }
  // 0..1: quanto da área de dano o corte já varreu neste instante (a luz no chão aparece junto com a passada da arma)
  function slashFrac(fam, age, skill, span) { var ps = slashPose(Math.max(0, age) / swingDur(fam, skill), fam, span); return Math.max(0, Math.min(1, (ps.da + span / 2) / span)); }
  // 0..1: quanto o golpe manda na pose da mão (no começo e no fim ela se mistura com a posição de repouso, sem pulo)
  function slashBlend(u) { return eio(u / 0.1) * (1 - eio((u - 0.72) / 0.28)); }
  // 0..1: força do golpe (a faixa de luz e a ondulação do chicote só aparecem durante o corte)
  function strikeI(uq, fam) { var c = SL[fam] || SL.espada; return Math.pow(Math.sin(Math.PI * Math.max(0, Math.min(1, (uq - c.wE * 0.85) / (c.sE - c.wE + 0.14)))), 1.2); }

  /* ---- chicote de verdade: o cabo vai na mão e a tira se solta, estica e estala ---- */
  // No desenho do chicote (229x256) só o cabo é aproveitado durante o golpe: pommel = ponta de baixo, top = onde a tira sai.
  var WH = { w: 229, h: 256, pommel: [203, 230], top: [134, 79], half: 21 };
  function whipLash(g, ax, ay, u, A0, rtip, L, P, tier, T, alpha, span) {
    var c = SL.chicote, N = 18, pts = [], i, s, uq, ps, a, e, ext, rip, act = strikeI(u, 'chicote'), crack = c.sE + 0.1;
    ext = u < c.wE ? lerp(0.35, 0.5, eio(u / c.wE)) : u < crack ? lerp(0.5, 1, eo3((u - c.wE) / (crack - c.wE))) : lerp(1, 0.25, eio((u - crack) / 0.3));
    for (i = 0; i <= N; i++) {
      s = i / N; uq = Math.max(0, u - s * 0.2); ps = slashPose(uq, 'chicote', span);
      a = lerpAng(rtip, A0 + ps.da + ps.wr, slashBlend(uq)); e = L * ext * s;
      rip = Math.sin(s * 9 - u * 46) * 5 * s * (1 - s) * (0.25 + 0.75 * act);
      pts.push([ax + Math.cos(a) * e - Math.sin(a) * rip, ay + Math.sin(a) * e + Math.cos(a) * rip]);
    }
    // rastro de luz da ponta durante o estalo
    if (act > 0.08) {
      var pv = null, k, uk, pk, ak, ek, xx, yy;
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.globalAlpha = alpha;
      for (k = 0; k < 18; k++) {
        uk = u - k * 0.01; if (uk < 0) break;
        pk = slashPose(uk, 'chicote', span); ak = lerpAng(rtip, A0 + pk.da + pk.wr, slashBlend(uk));
        ek = uk < c.wE ? lerp(0.35, 0.5, eio(uk / c.wE)) : uk < crack ? lerp(0.5, 1, eo3((uk - c.wE) / (crack - c.wE))) : lerp(1, 0.25, eio((uk - crack) / 0.3));
        xx = ax + Math.cos(ak) * L * ek; yy = ay + Math.sin(ak) * L * ek;
        if (pv) { g.strokeStyle = rgba('#ffffff', 0.55 * act * (1 - k / 18)); g.lineWidth = 3.2 * (1 - k / 18) + 0.5; g.beginPath(); g.moveTo(pv[0], pv[1]); g.lineTo(xx, yy); g.stroke(); }
        pv = [xx, yy];
      }
      g.restore();
    }
    var leather = P === SKILL_RED ? '#8f1d16' : P === SLASH_BLUE ? '#1f4f94' : tier >= 6 ? '#5a2430' : tier >= 5 ? '#c9983c' : tier >= 3 ? '#7a4a2a' : '#6b4a2e', i0;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = alpha;
    var pass = function (col, w0, w1, dash, add) {
      g.globalCompositeOperation = add ? 'lighter' : 'source-over'; g.strokeStyle = col; g.setLineDash(dash || []);
      for (i0 = 1; i0 <= N; i0++) { g.lineWidth = lerp(w0, w1, i0 / N); g.beginPath(); g.moveTo(pts[i0 - 1][0], pts[i0 - 1][1]); g.lineTo(pts[i0][0], pts[i0][1]); g.stroke(); }
    };
    pass('rgba(26,15,8,.92)', 9.5, 3.2);
    pass(leather, 6.4, 2);
    pass('rgba(30,17,9,.55)', 5.8, 1.7, [2.4, 3.6]);   // trançado
    pass('rgba(255,226,170,.55)', 1.8, 0.6);
    if (act > 0.05) pass(rgba(P.c, 0.55 * act), 4.4, 1.2, null, true);
    g.setLineDash([]);
    var tp = pts[N]; g.globalCompositeOperation = 'source-over'; g.fillStyle = '#1c110a'; g.beginPath(); g.arc(tp[0], tp[1], 2.4, 0, TAU); g.fill();
    // estalo: clarão na ponta, anel que abre e faíscas
    var cp = (u - (crack - 0.03)) / 0.18;
    if (cp > 0 && cp < 1) {
      var f = 1 - cp; g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1;
      glow(g, tp[0], tp[1], 12 + 28 * f, '#ffffff', 0.85 * f); glow(g, tp[0], tp[1], 24 + 30 * f, P.c, 0.45 * f);
      g.strokeStyle = rgba('#ffffff', 0.8 * f); g.lineWidth = 2.4 * f + 0.6; g.beginPath(); g.arc(tp[0], tp[1], 6 + 36 * eo3(cp), 0, TAU); g.stroke();
      spikes(g, tp[0], tp[1], 2, 8 + 26 * f, 8, T * 3, 0.14, rgba('#ffffff', 0.85 * f));
    }
    g.restore();
  }

  // (x, y) = centro do corpo; sh = ombro desta mão; sw = { age, dur, a (ângulo do golpe), skill }; arm = { before(hx, hy), after(hx, hy) } desenha braço e mão.
  function drawHeld(g, wc, fam, tier, x, y, r, sz, face, idx, nWeap, sw, T, geo, sh, arm) {
    geo = geo || { gx: 0.5, gy: 0.5, tip: -Math.PI / 4, len: 0.5 };
    var st = STYLE[fam] || 'stab', ar = wc.height / wc.width, dw = ar > 1 ? sz / ar : sz, dh = ar > 1 ? sz : sz * ar;
    sh = sh || [x + (idx ? 1 : -1) * r * 0.98, y];
    var left = sh[0] < x, bob = Math.sin(T * 4 + idx * 1.7) * 1.5;
    var sgn = left ? -1 : 1, hx = sh[0] + sgn * r * 0.3 + Math.cos(face) * r * 0.5, hy = sh[1] + r * 0.1 + Math.sin(face) * r * 0.4 + bob;
    // parada, a arma fica erguida ao lado do corpo, inclinada para onde o slime olha (o arco e a varinha apontam mais para a frente)
    var up = -Math.PI / 2 + (left ? -0.5 : 0.5), wUp = (st === 'shoot' && fam !== 'cajado') ? 0.3 : 0.8, wFace = 0.55;
    var tip = st === 'ring' ? -Math.PI / 2 + Math.sin(T * 3 + idx) * 0.07 : Math.atan2(Math.sin(face) * wFace + Math.sin(up) * wUp, Math.cos(face) * wFace + Math.cos(up) * wUp), scale = 1, gl = 0, trail = null;
    var u = sw ? sw.age / sw.dur : 1, swinging = sw && u < 1, bl = 0, whipSwing = false, post = null;
    if (swinging) {
      var FF = FAM[fam] || {}, hbR = sw.reach || (sw.skill ? (FF.skill ? FF.skill.range : 100) : (FF.range || 74) + r * 0.5), // área de dano do golpe (alcance e abertura)
        hbS = Math.min(5.2, sw.span || (sw.skill ? (FF.skill ? FF.skill.angle : 2.3) : (FF.arcAng || 1.9))), hcx = x, hcy = y + r * 0.62;
      var A0 = sw.a, k = sw.skill ? 1.35 : 1, cx = sh[0], cy = sh[1], reach = r * 0.55 + sz * 0.5, hr = r * 0.5 + sz * 0.12, gi, uu; // a mão gira em volta do próprio ombro (o braço não cruza o corpo)
      scale = 1 + (k - 1) * 0.6; gl = (1 - u) * (sw.skill ? 1 : 0.5);
      // onde a mão está no instante u de cada estilo (também usada para as imagens residuais)
      var at = function (uq) {
        var o = { x: 0, y: 0, a: 0 }, sa, dist;
        uq = Math.max(0, Math.min(1, uq));
        if (st === 'slash') {
          var ps = slashPose(uq, fam, hbS); sa = A0 + ps.da;
          o.x = cx + Math.cos(sa) * hr * 1.2 * ps.df; o.y = cy + Math.sin(sa) * hr * 1.2 * ps.df; o.a = sa + ps.wr;
        } else if (st === 'stab') {
          var lunge = Math.sin(Math.min(1, uq * 1.15) * Math.PI) * sz * 0.42;
          o.x = cx + Math.cos(A0) * (hr * 0.9 + lunge); o.y = cy + Math.sin(A0) * (hr * 0.9 + lunge); o.a = A0;
        } else if (st === 'smash') {
          var wind = 0.42; dist = hr * 1.1;
          if (uq < wind) { var w = ease(uq / wind); sa = A0 - 0.35 - 1.3 * w; dist = hr * 1.1 * (1 - 0.15 * w); }
          else { var s2 = Math.min(1, (uq - wind) / 0.2); sa = A0 - 1.65 + 1.9 * (s2 * s2); dist = hr * 1.1 * (0.85 + 0.3 * s2); if (uq > wind + 0.2) { sa = A0 + 0.25; dist = hr * 1.25 - (uq - wind - 0.2) * 12; } }
          o.x = cx + Math.cos(sa) * dist; o.y = cy + Math.sin(sa) * dist - (uq < wind ? 10 * ease(uq / wind) : 0); o.a = sa;
        }
        return o;
      };
      if (st === 'slash') {
        var P = sw.skill ? SKILL_RED : SLASH_BLUE, cfg = SL[fam] || SL.espada, rhx = hx, rhy = hy, rtip = tip;
        scale *= 1 + 0.1 * Math.sin(Math.PI * Math.max(0, Math.min(1, (u - cfg.wE) / (cfg.sE - cfg.wE + 0.2)))); // a arma cresce um pouco no corte
        // habilidade: a lâmina cresce no corte (energia) até a mão não precisar esticar o braço para alcançar a borda da área de dano
        if (sw.skill && fam !== 'chicote') scale *= 1 + Math.min(0.6, Math.max(0, (hbR - 20) / (geo.len * sz * scale) - 1)) * strikeI(u, fam);
        bl = geo.len * sz * scale;
        // pose da mão e da arma em cada instante: gira em volta do ombro e, durante o corte, a ponta é levada até a borda da área de dano (mesmo alcance e mesmo ângulo)
        var pose = function (uq) {
          var o = at(uq), kq = slashBlend(uq), px = lerp(rhx, o.x, kq), py = lerp(rhy, o.y, kq), pa = lerpAng(rtip, o.a, kq);
          if (fam === 'chicote') return { x: px, y: py, a: pa };
          var fk = eio((uq - cfg.wE * 0.5) / (cfg.sE - cfg.wE * 0.5)) * (1 - eio((uq - cfg.sE - 0.04) / 0.3)), al = A0 + slashPose(uq, fam, hbS).da, hd = Math.max(r * 0.3, hbR - bl);
          return { x: lerp(px, hcx + Math.cos(al) * hd, fk), y: lerp(py, hcy + Math.sin(al) * hd, fk), a: lerpAng(pa, al, fk) };
        };
        var o1 = pose(u); hx = o1.x; hy = o1.y; tip = o1.a;
        if (fam === 'chicote' && geo.img) {
          whipSwing = true; // o chicote tem o jeito dele: cabo na mão e tira que se solta (desenhado depois do cabo)
        } else {
          // espada: faixa de luz que acompanha a lâmina durante o corte
          g.save(); g.globalCompositeOperation = 'lighter';
          var prv = null;
          for (gi = 0; gi < 10; gi++) {
            uu = u - gi * 0.022; if (uu < 0) break;
            var oq = pose(uu), qx = oq.x, qy = oq.y, qa = oq.a, qdx = Math.cos(qa), qdy = Math.sin(qa);
            var cur = { tx: qx + qdx * bl * 1.02, ty: qy + qdy * bl * 1.02, mx: qx + qdx * bl * 0.3, my: qy + qdy * bl * 0.3, i: strikeI(uu, fam) * Math.pow(1 - gi / 10, 1.1) };
            if (prv) {
              var al = (prv.i + cur.i) / 2;
              if (al > 0.02) {
                g.beginPath(); g.moveTo(prv.tx, prv.ty); g.lineTo(cur.tx, cur.ty); g.lineTo(cur.mx, cur.my); g.lineTo(prv.mx, prv.my); g.closePath(); g.fillStyle = rgba(P.c, al * 0.55); g.fill();
                g.strokeStyle = rgba('#ffffff', al * 0.9); g.lineWidth = 2.8 * al + 0.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(prv.tx, prv.ty); g.lineTo(cur.tx, cur.ty); g.stroke();
              }
            }
            prv = cur;
          }
          g.restore();
          var ff = Math.max(0, 1 - Math.abs(u - (cfg.sE + 0.02)) / 0.1); // brilho na ponta no instante do corte
          if (ff > 0.02) post = function () {
            var tx = hx + Math.cos(tip) * bl, ty = hy + Math.sin(tip) * bl;
            g.save(); g.globalCompositeOperation = 'lighter';
            glow(g, tx, ty, 14 + 22 * ff, '#ffffff', 0.75 * ff); glow(g, tx, ty, 26 + 30 * ff, P.c, 0.4 * ff);
            spikes(g, tx, ty, 2, 10 + 24 * ff, 4, tip + Math.PI / 4, 0.16, rgba('#ffffff', 0.9 * ff));
            g.restore();
          };
        }
      } else if (st === 'stab') {
        var o2 = at(u); hx = o2.x; hy = o2.y; tip = o2.a;
        trail = []; for (gi = 1; gi <= 3; gi++) { uu = u - gi * 0.06; if (uu > 0) { var og2 = at(uu); trail.push([og2.x, og2.y, og2.a, 0.3 / gi]); } }
      } else if (st === 'smash') {
        var o3 = at(u); hx = o3.x; hy = o3.y; tip = o3.a;
        if (u > 0.42 && u < 0.7) { trail = []; for (gi = 1; gi <= 3; gi++) { uu = u - gi * 0.05; if (uu > 0.3) { var og3 = at(uu); trail.push([og3.x, og3.y, og3.a, 0.36 / gi]); } } }
      } else if (st === 'shoot') {
        var rec = Math.max(0, 1 - u * 2.2) * sz * 0.22;
        hx = cx + Math.cos(A0) * (hr * 0.95 - rec); hy = cy + Math.sin(A0) * (hr * 0.95 - rec); tip = A0;
        if (u < 0.3) { var P2 = pal(fam, tier), tl = geo.len * sz; g.save(); g.globalCompositeOperation = 'lighter'; glow(g, hx + Math.cos(A0) * tl, hy + Math.sin(A0) * tl, 18 * (1 - u / 0.3) + 4, P2.h, 0.8); g.restore(); }
      } else { // sinos: balançam
        hx += Math.sin(u * 40) * 3 * (1 - u); hy += Math.cos(u * 36) * 3 * (1 - u); tip += Math.sin(u * 30) * 0.2 * (1 - u); scale = 1 + 0.25 * Math.sin(u * Math.PI);
      }
    }
    // a mão não vai além do alcance do braço (a gelatina estica, mas não infinitamente)
    var maxL = r * 3.1, ddx = hx - sh[0], ddy = hy - sh[1], dd = Math.hypot(ddx, ddy);
    if (dd > maxL) { hx = sh[0] + ddx * maxL / dd; hy = sh[1] + ddy * maxL / dd; }
    var tdx = Math.cos(tip), tdy = Math.sin(tip), tl2 = geo.len * sz * scale;
    if (gl > 0.02) { var Pg = (swinging && st === 'slash') ? (sw.skill ? SKILL_RED : SLASH_BLUE) : pal(fam, tier); g.save(); g.globalCompositeOperation = 'lighter'; glow(g, hx + tdx * tl2 * 0.5, hy + tdy * tl2 * 0.5, sz * (0.7 + gl * 0.6), Pg.c, 0.45 * gl); g.restore(); }
    var paint = function (px, py, ang, a, sc) {
      g.save(); if (a < 1) g.globalAlpha = a; g.translate(px, py); g.rotate(ang - geo.tip); g.scale(sc, sc);
      g.drawImage(wc, -geo.gx * dw, -geo.gy * dh, dw, dh); g.restore();
    };
    if (arm && arm.before) arm.before(hx, hy);
    if (trail) trail.forEach(function (q) { paint(q[0], q[1], q[2], q[3], scale); });
    if (whipSwing) {
      // chicote: o desenho enrolado some quando a tira se solta e volta no fim; o cabo fica sempre na mão
      var coil = Math.max(0, Math.min(1, 1 - eio(u / 0.1) + eio((u - 0.84) / 0.16)));
      if (coil > 0.01) paint(hx, hy, tip, coil, scale);
      var rot = tip - geo.tip, cr = Math.cos(rot), sr = Math.sin(rot), mp = function (X, Y) { return [(X / WH.w - geo.gx) * dw, (Y / WH.h - geo.gy) * dh]; };
      var p0 = WH.pommel, p1 = WH.top, vx = p1[0] - p0[0], vy = p1[1] - p0[1], vl = Math.hypot(vx, vy), ux = vx / vl, uy = vy / vl, nx = -uy * WH.half, ny = ux * WH.half;
      var e0 = [p0[0] - ux * 12, p0[1] - uy * 12], e1 = [p1[0] + ux * 8, p1[1] + uy * 8];
      var q = [mp(e0[0] + nx, e0[1] + ny), mp(e0[0] - nx, e0[1] - ny), mp(e1[0] - nx, e1[1] - ny), mp(e1[0] + nx, e1[1] + ny)];
      g.save(); g.translate(hx, hy); g.rotate(rot); g.scale(scale, scale);
      g.beginPath(); g.moveTo(q[0][0], q[0][1]); g.lineTo(q[1][0], q[1][1]); g.lineTo(q[2][0], q[2][1]); g.lineTo(q[3][0], q[3][1]); g.closePath(); g.clip();
      g.drawImage(wc, -geo.gx * dw, -geo.gy * dh, dw, dh); g.restore();
      var at0 = mp(p1[0], p1[1]), axw = hx + (at0[0] * cr - at0[1] * sr) * scale, ayw = hy + (at0[0] * sr + at0[1] * cr) * scale;
      whipLash(g, axw, ayw, u, A0, tip, Math.max(40, hbR - ((axw - hcx) * Math.cos(A0) + (ayw - hcy) * Math.sin(A0))), sw.skill ? SKILL_RED : SLASH_BLUE, tier, T, Math.max(0, Math.min(1, eio(u / 0.08) * (1 - eio((u - 0.86) / 0.14)))), hbS);
    } else paint(hx, hy, tip, 1, scale);
    if (post) post();
    // brilho permanente das armas altas
    if (tier >= 5 && !swinging) { g.save(); g.globalCompositeOperation = 'lighter'; glow(g, hx + tdx * tl2 * 0.5, hy + tdy * tl2 * 0.5, sz * 0.6, pal(fam, tier).c, tier >= 6 ? 0.28 + 0.1 * Math.sin(T * 6 + idx) : 0.2); g.restore(); }
    if (arm && arm.after) arm.after(hx, hy);
  }
  function swingDur(fam, skill) { var st = STYLE[fam] || 'stab'; return skill ? 0.52 : (st === 'smash' ? 0.46 : st === 'slash' ? (fam === 'chicote' ? 0.38 : 0.32) : 0.26); }

  /* ---------- faíscas de acerto ---------- */
  // ang = direção do golpe (de quem bate para quem apanha); color = cor de quem apanhou (gotinhas de gelatina ou lascas do monstro)
  function hitSparks(parts, x, y, big, ang, color, jelly) {
    var dir = (ang === undefined || ang === null) ? null : ang, n = big ? 11 : 6, i, a, s, pick;
    for (i = 0; i < n; i++) {
      a = dir === null ? Math.random() * TAU : dir + (Math.random() - 0.5) * 1.5; s = 90 + Math.random() * (big ? 230 : 160); pick = Math.random();
      parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.24 + Math.random() * 0.2, max: 0.44, c: pick < 0.4 ? '#fff3c4' : pick < 0.7 ? '#ffd36b' : (color || '#ffd36b'), sz: 1.6 + Math.random() * 2.2 });
    }
    if (color) {
      var m = big ? 7 : 4;
      for (i = 0; i < m; i++) {
        a = dir === null ? Math.random() * TAU : dir + (Math.random() - 0.5) * 2.2; s = 50 + Math.random() * 150;
        parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 50, life: 0.45 + Math.random() * 0.3, max: 0.75, c: color, sz: (jelly ? 3.2 : 2.4) + Math.random() * 3.4 });
      }
    }
  }

  window.FX = { dur: dur, drawFx: drawFx, drawTele: drawTele, drawProj: drawProj, drawHeld: drawHeld, swingDur: swingDur, hitSparks: hitSparks, pal: pal, STYLE: STYLE };
})();
