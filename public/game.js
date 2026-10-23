// Cliente do SlimeRPG: rede, entrada (WASD / joystick), interface e desenho da arena.
(function () {
  'use strict';
  var GD = module.exports, W = GD.WORLD, FAM = GD.FAMILIES, ITEM = GD.ITEMS, MOBDEF = GD.MOBS;
  var MOB_KEYS = Object.keys(MOBDEF), BASE_SPEED = 170, TAU = Math.PI * 2;
  var A = window.ART, FX = window.FX, Lj = window.Loja;
  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento: segue sem salvar */ } }
  };
  var PALETTE = ['#5fd35f', '#3fbf8f', '#4aa3ff', '#7a6cff', '#c06cff', '#ff6cc0', '#ff5a5a', '#ff9a3d', '#ffd23d', '#b9e04a', '#e8e8e8', '#4a4a56'];
  var NAMES = ['Gosma', 'Geleia', 'Pudim', 'Limo', 'Musgo', 'Gelatina', 'Orvalho', 'Brotinho'];
  var ATK_TEXT = { single: 'Golpe único', splash: 'Golpe com impacto em área', arc: 'Golpe em arco', ring: 'Onda ao redor de você', proj: 'Projétil', orb: 'Orbe que explode ao atingir' };
  var SKILL_TEXT = { burst: 'Explosão ao redor', cone: 'Golpe em leque', dash: 'Investida atravessando inimigos', volley: 'Rajada de projéteis', bolt: 'Raio que atravessa tudo' };
  var ATTR_SHORT = { str: 'Força', dex: 'Destreza', man: 'Mana', hlt: 'Saúde' };

  /* ======================= estado ======================= */
  var S = {
    id: null, roster: {}, players: new Map(), mobs: new Map(), projs: new Map(), me: null,
    pos: null, srv: null, alive: false, myF: 0, dead: false, lb: [], joined: false, boss: null
  };
  var cfg = { name: store.get('slimeio_name', ''), color: store.get('slimeio_color', PALETTE[0]), aim: store.get('slimeio_aim', 'near') };
  var canvas = $('game'), ctx = canvas.getContext('2d');
  var dpr = 1, vw = 0, vh = 0, zoom = 1;
  var cam = { x: W.cx, y: W.cy }, shake = 0;
  var T = 0;
  var fxs = [], floats = [], parts = [], flies = [], teles = [];
  var corpses = [], splats = [], goneMobs = []; // monstros que acabaram de morrer, poças de slime derrotado, e quem saiu do pacote atual
  var LAIR = GD.BOSS.clear;
  var ZONE_INFO = { cogumelo: ['Bosque dos Cogumelos', 1, 2], coelho: ['Campina dos Coelhos', 3, 5], lobo: ['Mata dos Lobos', 6, 9], javali: ['Charneca dos Javalis', 10, 14], broto: ['Bosque Ancião', 15, 19], aranha: ['Ninho das Aranhas', 20, 20], arvore: ['Clareira Anciã', 20, 20] };
  var ws = null;

  /* ======================= tela inicial ======================= */
  function buildTitle() {
    var pal = $('palette');
    PALETTE.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.style.background = c; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', 'Cor ' + c);
      b.addEventListener('click', function () { setColor(c); });
      pal.appendChild(b);
    });
    $('nameIn').value = cfg.name || NAMES[(Math.random() * NAMES.length) | 0];
    setColor(cfg.color);
    // Seletor de cor próprio (o do navegador não tem botão para fechar): três barras e um OK
    function hsl2hex(h, s, l) {
      s /= 100; l /= 100;
      var a = s * Math.min(l, 1 - l), f = function (n) { var k = (n + h / 30) % 12, c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return ('0' + Math.round(255 * c).toString(16)).slice(-2); };
      return '#' + f(0) + f(8) + f(4);
    }
    function hex2hsl(hex) {
      var n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn, h = 0, s = 0;
      if (d) {
        s = d / (1 - Math.abs(2 * l - 1));
        h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60;
      }
      return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
    }
    function colorPanel(open) {
      $('colorPanel').hidden = !open; $('colorBtn').setAttribute('aria-expanded', String(open));
      if (open) { var v = hex2hsl(cfg.color); $('colH').value = v[0]; $('colS').value = Math.max(25, v[1]); $('colL').value = Math.min(75, Math.max(25, v[2])); }
    }
    function fromSliders() { setColor(hsl2hex(+$('colH').value, +$('colS').value, +$('colL').value)); }
    ['colH', 'colS', 'colL'].forEach(function (id) { $(id).addEventListener('input', fromSliders); });
    $('colorBtn').addEventListener('click', function () { colorPanel($('colorPanel').hidden); });
    $('colorOk').addEventListener('click', function () { colorPanel(false); });
    $('playBtn').addEventListener('click', play);
    $('nameIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') play(); });
    var sv = store.get('slimeio_save', null);
    if (sv && sv.items && !hasAccount()) { // com conta, quem escreve esta linha é conta.js
      var n = sv.items.length, dn = (sv.done || []).length;
      $('saveInfo').textContent = 'Progresso guardado: ' + n + (n === 1 ? ' item' : ' itens') + ' e ' + dn + (dn === 1 ? ' missão concluída.' : ' missões concluídas.');
    }
    requestAnimationFrame(previewLoop);
  }
  function setColor(c) {
    cfg.color = c; $('colorSw').style.background = c;
    Array.prototype.forEach.call($('palette').children, function (b, i) { b.setAttribute('aria-checked', PALETTE[i] === c ? 'true' : 'false'); });
  }
  function previewLoop(ts) {
    if ($('title').hidden) return;
    var pc = $('preview'), g = pc.getContext('2d');
    g.clearRect(0, 0, pc.width, pc.height);
    var t = ts / 1000;
    var gr = g.createRadialGradient(130, 150, 10, 130, 150, 120);
    gr.addColorStop(0, 'rgba(110,120,105,.55)'); gr.addColorStop(1, 'rgba(110,120,105,0)');
    g.fillStyle = gr; g.fillRect(0, 0, pc.width, pc.height);
    var cyc = t % 6.5, po = null;
    if (cyc > 5.0 && cyc < 5.7) po = attackPose((cyc - 5.0) / 0.7, 0, 52, 1.2, 'stab');
    var py = 118 + Math.sin(t * 2) * 2, po2 = po || {};
    po2.cloth = 'vital_0'; po2.skin = Lj ? Lj.equipped() : null;
    A.drawSlime(g, 130, py, 52, cfg.color, t, false, (t % 4) < 0.12, po2);
    // na tela inicial o slime segura a faca com um bracinho, como no jogo
    if (ITEM.faca) {
      var xf = A.slimeXf(130, py, 52, t, po2), bc = xf(0, -0.62), sh = xf(0.98, -0.62), col = cfg.color;
      var sw = (cyc > 5.0 && cyc < 5.3) ? { age: cyc - 5.0, dur: 0.3, a: 0, skill: false } : null;
      FX.drawHeld(g, A.weaponCanvas('faca'), 'faca', 0, bc[0], bc[1], 52, 38 + 52 * 0.55, 0.3, 1, 1, sw, t, A.weaponGeo('faca'), sh, {
        before: function (hx, hy) { A.drawArm(g, sh[0], sh[1], hx, hy, col, 52, bc[0], bc[1], A.armorSleeve('vital_0')); },
        after: function (hx, hy) { A.drawHand(g, hx, hy, col, 52); }
      });
    }
    requestAnimationFrame(previewLoop);
  }
  function play() {
    var name = $('nameIn').value.trim() || 'Slime';
    cfg.name = name; store.set('slimeio_name', name); store.set('slimeio_color', cfg.color);
    $('playBtn').disabled = true; $('status').textContent = 'Conectando…';
    S.failed = false; S.kicked = null;
    connect();
  }

  /* ======================= rede ======================= */
  function hasAccount() { return !!(window.Conta && Conta.token()); }
  function connect() {
    var proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(proto + '://' + location.host);
    ws.onopen = function () {
      var j = { t: 'join', name: cfg.name, color: cfg.color, save: store.get('slimeio_save', null) };
      if (hasAccount()) j.token = Conta.token(); // com conta, o servidor carrega o progresso dela
      ws.send(JSON.stringify(j));
    };
    ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (x) { return; } onMsg(m); };
    ws.onclose = function () {
      if (S.joined) { lostScreen(); return; }
      if (S.failed) return; // o servidor já explicou (login recusado, conta aberta em outro lugar...)
      $('status').textContent = 'Não foi possível conectar ao servidor. Verifique se ele está rodando.'; $('playBtn').disabled = false;
    };
  }
  // Tela de "conexão perdida", com o motivo quando o servidor deu um (conta aberta em outro lugar, conta excluída).
  function lostScreen() {
    if (S.kicked) {
      $('connTitle').textContent = 'Você saiu do jogo';
      $('connText').textContent = S.kicked;
    } else {
      $('connTitle').textContent = 'Conexão perdida';
      $('connText').textContent = 'O servidor parou de responder. ' + (hasAccount() ? 'Seu progresso está guardado na sua conta.' : 'Seu progresso está guardado neste navegador.');
    }
    $('connLost').hidden = false;
  }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

  function onMsg(m) {
    switch (m.t) {
      case 'init':
        S.id = m.id; S.joined = true;
        m.roster.forEach(function (r) { S.roster[r.id] = r; });
        $('title').hidden = true; $('hud').hidden = false;
        $('hName').textContent = cfg.name;
        resize(); initFlies();
        if (m.acct) toast('Progresso salvo na conta ' + escapeHtml(m.acct));
        break;
      case 'authfail': // o servidor não aceitou o login guardado
        S.failed = true; $('playBtn').disabled = false;
        if (m.retry) $('status').textContent = 'Não consegui conferir sua conta agora. Tente de novo em instantes.';
        else {
          if (window.Conta) Conta.expired();
          $('status').textContent = 'Seu login venceu ou a conta não existe mais. Entre de novo ou jogue sem conta.';
        }
        try { ws.close(); } catch (x) { /* já fechou */ }
        break;
      case 'kicked': // conta aberta em outro lugar ou excluída
        S.kicked = m.m || 'Você foi desconectado.'; S.failed = true;
        if (S.joined) lostScreen(); else { $('status').textContent = S.kicked; $('playBtn').disabled = false; }
        break;
      case 'pj': S.roster[m.id] = { id: m.id, name: m.name, color: m.color, sk: m.sk || 0 }; break;
      case 'sk': if (S.roster[m.id]) S.roster[m.id].sk = m.k || 0; break;
      case 'skins': if (Lj) Lj.set(m); break;
      case 'pl': delete S.roster[m.id]; break;
      case 's': onSnap(m); break;
      case 'me': onMe(m); break;
      case 'lb': S.lb = m.l; renderLb(); break;
      case 'feed': addFeed(m.m); if (/despertou o/.test(m.m)) SND.stinger(); break;
      case 'toast': toast(escapeHtml(m.m)); break;
      case 'loot':
        toast('<img src="' + A.iconURL(m.item) + '" alt="">Novo item: ' + escapeHtml(ITEM[m.item].name));
        break;
      case 'quest': {
        toast('<img src="' + A.iconURL(m.item) + '" alt="">Missão cumprida: ' + escapeHtml(ITEM[m.item].name));
        $('btnQuest').classList.add('pulse'); setTimeout(function () { $('btnQuest').classList.remove('pulse'); }, 4200);
        break;
      }
      case 'lvl': SND.play('lvl'); queueLevel(m); break;
      case 'death': onDeath(m); break;
      case 'save': store.set('slimeio_save', m.d); break;
    }
  }

  function onSnap(m) {
    var seen = {}, i, e;
    for (i = 0; i < m.p.length; i++) {
      var p = m.p[i];
      seen[p.i] = 1;
      e = S.players.get(p.i);
      if (!e) { e = { id: p.i, rx: p.x, ry: p.y, rr: p.r }; S.players.set(p.i, e); }
      e.x = p.x; e.y = p.y; e.h = p.h; e.m = p.m; e.l = p.l; e.a = p.a; e.r = p.r; e.w = p.w; e.ar = p.ar; e.f = p.f;
      if (S.roster[p.i]) { S.roster[p.i].r = p.r; S.roster[p.i].sk = p.k || 0; }
    }
    S.players.forEach(function (v, id) { if (!seen[id]) S.players.delete(id); });
    var mine = S.players.get(S.id);
    var wasAlive = S.alive;
    S.alive = !!mine;
    if (mine) {
      S.myF = mine.f;
      if (!S.pos || !wasAlive) { S.pos = { x: mine.x, y: mine.y }; cam.x = mine.x; cam.y = mine.y; A.warmMap(mine.x, mine.y); }
      S.srv = { x: mine.x, y: mine.y };
      if (S.dead) { S.dead = false; $('deathOverlay').hidden = true; }
    }
    var seenM = {};
    for (i = 0; i < m.mb.length; i++) {
      var b = m.mb[i];
      seenM[b[0]] = 1;
      e = S.mobs.get(b[0]);
      if (!e) { e = { id: b[0], rx: b[2], ry: b[3], flip: false, flash: 0, hp: b[4] }; S.mobs.set(b[0], e); }
      if (b[4] < e.hp) e.flash = 0.12;
      e.hp = b[4]; e.x = b[2]; e.y = b[3]; e.ki = b[1]; e.mhp = b[5]; e.st = b[6]; if (b.length > 7) e.face = b[7];
    }
    goneMobs = [];
    S.mobs.forEach(function (v, id) { if (!seenM[id]) { goneMobs.push(v); S.mobs.delete(id); } });
    var seenP = {};
    for (i = 0; i < m.pj.length; i++) {
      var q = m.pj[i];
      seenP[q[0]] = 1;
      e = S.projs.get(q[0]);
      if (!e) { e = { id: q[0], rx: q[1], ry: q[2] }; S.projs.set(q[0], e); }
      e.x = q[1]; e.y = q[2]; e.a = q[3]; e.k = q[4]; e.fam = q[5]; e.tier = q[6]; e.r = q[7];
    }
    S.projs.forEach(function (v, id) { if (!seenP[id]) { popProj(v); S.projs.delete(id); } });
    S.boss = m.bo || null;
    for (i = 0; i < m.ev.length; i++) onEvent(m.ev[i]);
    updateBossHud();
  }

  // Números que aparecem juntos (dois golpes, dano e XP) sobem empilhados em vez de ficarem um por cima do outro.
  function pushFloat(f) {
    var n = 0;
    floats.forEach(function (o) { if (o.age < 0.4 && Math.abs(o.x - f.x) < 60 && Math.abs(o.y - f.y) < 40) n++; });
    f.y -= n * 17; floats.push(f);
  }
  // skin de um jogador (decodifica o número que vem do servidor; guarda para não refazer a cada quadro)
  var SKIN_MEMO = {};
  function skinFor(id) {
    var r = S.roster[id], c = r && r.sk ? r.sk : 0;
    if (!c) return null;
    return SKIN_MEMO[c] || (SKIN_MEMO[c] = GD.skinDecode(c));
  }
  function pcolor(id) { var r = S.roster[id]; return r ? r.color : '#9fe08a'; }
  function popProj(v) { // projétil que sumiu (acertou ou acabou o alcance): estouro pequeno
    if (!S.pos || Math.hypot(v.rx - S.pos.x, v.ry - S.pos.y) > 1300 || fxs.length > 160) return;
    var P = FX.pal(v.fam || 'varinha', v.tier || 1);
    fxs.push({ x: v.rx, y: v.ry, kind: 'pop', a: 0, size: 10 + (v.r || 10) * 0.9, fam: 'faca', tier: 1, extra: P.h, age: 0 });
  }
  function jelly(x, y, color, n, spd) { // gotas de gelatina (nunca passa de 700 partículas na tela)
    if (parts.length > 700) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = (0.35 + Math.random() * 0.65) * spd, c = Math.random() < 0.35 ? A.light(color, 0.45) : Math.random() < 0.5 ? color : A.dark(color, 0.25);
      parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 70, life: 0.55 + Math.random() * 0.5, max: 1.05, c: c, sz: 3 + Math.random() * 5 });
    }
  }

  function onEvent(e) {
    switch (e[0]) {
      case 'd': { // dano (e[5] = quem apanhou, e[6] = direção do golpe, nulos em pacotes antigos)
        var kind = e[4], ang = e[6] === undefined ? null : e[6], tgt = kind === 1 ? S.players.get(e[5]) : kind === 0 ? S.mobs.get(e[5]) : null;
        var maxh = tgt ? (kind === 1 ? tgt.m : tgt.mhp) : 0, big = (kind === 0 || kind === 1) && (e[3] >= 140 || (maxh > 0 && e[3] >= maxh * 0.22));
        pushFloat({ x: e[1], y: e[2], v: e[3], f: kind, age: 0, big: big, dx: (Math.random() - 0.5) * 22 });
        if (kind === 0 || kind === 1) {
          var col = kind === 1 ? pcolor(e[5]) : (tgt ? A.mobColor(MOB_KEYS[tgt.ki]) : '#ffd36b');
          if (parts.length < 700) FX.hitSparks(parts, e[1], e[2], big, ang, col, kind === 1);
          if (fxs.length < 160) fxs.push({ x: e[1], y: e[2], kind: 'hit', a: ang === null ? Math.random() * TAU : ang, size: 14 + Math.min(26, e[3] / 6), fam: 'faca', tier: 1, extra: col, age: 0 });
          if (tgt) {
            if (kind === 1) { tgt.hurtT = 0; tgt.hurtA = ang === null ? 0 : ang; tgt.hurtBig = big; }
            else { tgt.kickT = 0; tgt.kickA = ang === null ? 0 : ang; }
          }
          if (big && S.pos && Math.hypot(e[1] - S.pos.x, e[2] - S.pos.y) < 600) shake = Math.max(shake, 2.2);
          if (kind === 1) SND.play('hitPlayer', e[1], e[2], { v: e[5] === S.id ? 1.6 : 1 }); else SND.play(big ? 'hitBig' : 'hitMob', e[1], e[2]);
        }
        break;
      }
      case 'f': {
        var nf = { x: e[1], y: e[2], kind: e[3], a: e[4], size: e[5], fam: e[6], tier: e[7], extra: e[8], age: 0 };
        if (e[3] === 'd_breath') { var bm = bossEntity(); if (bm) nf.sg = bossLeft(bm) ? -1 : 1; } // o fogo sai pela boca, do lado para onde ele olha
        fxs.push(nf);
        if (e[3] === 'ms') SND.play('ms_' + e[6], e[1], e[2], { v: 1.2 });
        if (e[3] === 'd_breath' || e[3] === 'd_slam' || e[3] === 'd_claw') SND.play(e[3], e[1], e[2], { v: 1.2 });
        if (S.pos && e[3].charAt(0) === 'd' && Math.hypot(e[1] - S.pos.x, e[2] - S.pos.y) < 700) shake = Math.max(shake, e[3] === 'd_slam' ? 10 : e[3] === 'd_breath' ? 5 : 3);
        break;
      }
      case 'a': { // uma arma golpeou: anima a arma do jogador (e[4] = espaço da arma, e[6] = 1 se foi habilidade)
        var pe = S.players.get(e[3]);
        if (pe && pe.w && pe.w.length) {
          var idx = pe.w.length === 1 ? 0 : Math.min(e[4], pe.w.length - 1), it = ITEM[pe.w[idx]];
          if (it) {
            pe.sw = pe.sw || []; pe.sw[idx] = { age: 0, dur: FX.swingDur(it.fam, e[6]), a: e[5], skill: e[6], st: FX.STYLE[it.fam] || 'stab' };
            if (pe.sw[idx].st === 'smash') { // a poeira sobe quando a arma encosta no chão (perto do fim da pancada)
              var reach = (pe.rr || 20) + 34;
              fxs.push({ x: e[1] + Math.cos(e[5]) * reach, y: e[2] + Math.sin(e[5]) * reach * 0.8, kind: 'dust', a: 0, size: e[6] ? 64 : 40, fam: 'faca', tier: 1, extra: 0, age: -pe.sw[idx].dur * 0.62 });
            }
            if (e[3] === S.id && e[6] === 1) shake = Math.max(shake, 2.5);
            var sst = pe.sw[idx].st, own = e[3] === S.id ? 1 : 0.7;
            SND.play(sst === 'shoot' ? (it.fam === 'arco' ? 'bow' : 'zap') : sst === 'ring' ? 'bell' : sst, e[1], e[2], { v: own });
            if (e[6] === 1) SND.play('skill', e[1], e[2], { v: own });
          }
        }
        break;
      }
      case 'k': { var mk = S.mobs.get(e[3]); if (mk) { mk.atkAge = 0; mk.atkA = e[4]; if (!MOBDEF[MOB_KEYS[mk.ki]].boss) SND.play('m_' + MOB_KEYS[mk.ki], mk.rx, mk.ry); } break; } // o monstro dá o bote
      case 'w': if (e[3] === 0 && e[5] >= 400) SND.play('d_inhale', e[1], e[2], { v: 1.1 }); teles.push({ x: e[1], y: e[2], kind: e[3], a: e[4], range: e[5], t: Math.max(0.2, e[6]), width: e[7], age: 0 }); break;
      case 'x': {
        var mkey = e[3] >= 0 ? MOB_KEYS[e[3]] : null, mdef = mkey ? MOBDEF[mkey] : null, i;
        if (!mdef) { // jogador derrotado: vira uma poça e esguicha gelatina na cor dele
          var pcol = pcolor(e[4]), pr = S.roster[e[4]], rr = (pr && pr.r) || 22;
          splats.push({ x: e[1], y: e[2], r: rr, color: pcol, age: 0, dur: 1.7 });
          jelly(e[1], e[2], pcol, 26, 230);
          fxs.push({ x: e[1], y: e[2], kind: 'pop', a: 0, size: rr * 2.2, fam: 'faca', tier: 1, extra: pcol, age: 0 });
          if (e[4] === S.id) shake = Math.max(shake, 8);
          SND.play('die', e[1], e[2], { v: e[4] === S.id ? 1.4 : 1 });
          break;
        }
        var mcol = A.mobColor(mkey), best = null, bd = 90;
        goneMobs.forEach(function (gm) { var d = Math.hypot(gm.rx - e[1], gm.ry - e[2]); if (gm.ki === e[3] && d < bd) { bd = d; best = gm; } });
        corpses.push({ ki: e[3], x: best ? best.rx : e[1], y: best ? best.ry : e[2], flip: best ? !!best.flip : false, face: best ? best.face : undefined, age: 0, dur: mdef.boss ? 2.6 : 0.42, boss: !!mdef.boss });
        for (i = 0; i < 14 && parts.length < 700; i++) {
          var a = Math.random() * TAU, sp = 40 + Math.random() * 130;
          parts.push({ x: e[1], y: e[2], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.5 + Math.random() * 0.4, max: 0.9, c: mcol, sz: 3 + Math.random() * 4 });
        }
        fxs.push({ x: e[1], y: e[2] + mdef.r * 0.4, kind: 'dust', a: 0, size: mdef.r * 1.6, fam: 'faca', tier: 1, extra: 0, age: 0 });
        if (mdef.boss) SND.play('d_roar', undefined, undefined, { v: 1 }); else SND.play('pop', e[1], e[2]);
        if (mdef.boss) { // o dragão cai: ondas de fogo, brasas e tremor
          shake = Math.max(shake, 14);
          [260, 420, 600].forEach(function (sz, k) { fxs.push({ x: e[1], y: e[2], kind: 'd_slam', a: 0, size: sz, fam: 'dragao', tier: 6, extra: 0, age: -0.16 * k }); });
          for (i = 0; i < 90; i++) {
            var ba = Math.random() * TAU, bs = 60 + Math.random() * 260;
            parts.push({ x: e[1] + (Math.random() - 0.5) * 140, y: e[2] + (Math.random() - 0.5) * 80, vx: Math.cos(ba) * bs, vy: Math.sin(ba) * bs - 160, life: 0.8 + Math.random() * 0.9, max: 1.7, c: Math.random() < 0.5 ? '#ffb36b' : '#ff6a2a', sz: 2.5 + Math.random() * 4 });
          }
        }
        break;
      }
    }
  }

  function onMe(m) {
    var prev = S.me, changed = true;
    if (prev) changed = JSON.stringify([prev.inv, prev.eq, prev.act, prev.stats, prev.fu]) !== JSON.stringify([m.inv, m.eq, m.act, m.stats, m.fu]);
    if (prev && m.hp < prev.hp - 0.5) {
      var h = $('hurt'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on');
      shake = Math.min(7, 2 + (prev.hp - m.hp) / Math.max(1, m.mhp) * 30);
    }
    S.me = m;
    updateHud();
    if (changed) { if (!$('invPanel').hidden) renderInv(); else syncInvBadge(); if (!$('questPanel').hidden) renderQuests(); }
    else if (!$('questPanel').hidden) renderQuests();
  }

  /* ======================= entrada ======================= */
  var keys = {}, mouse = { x: 0, y: 0, has: false }, stick = { on: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
  var lastDir = { x: 1, y: 0 };
  function typing() { var a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); }
  window.addEventListener('keydown', function (e) {
    if (typing()) return;
    var k = e.key.toLowerCase();
    if (k === 'i') { toggle('invPanel'); e.preventDefault(); return; }
    if (k === 'm') { toggle('questPanel'); e.preventDefault(); return; }
    if (k === 'p') { toggle('attrPanel'); e.preventDefault(); return; }
    if (k === 'r') { toggle('rankPanel'); e.preventDefault(); return; }
    if (k === 'escape') { closePanels(); return; }
    if ((k === 'enter' || k === ' ') && S.dead && !$('deathOverlay').hidden) { respawn(); e.preventDefault(); return; }
    keys[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', function () { keys = {}; });
  window.addEventListener('mousemove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true; });

  function inputVec() {
    var x = 0, y = 0;
    if (keys.a || keys.arrowleft) x -= 1;
    if (keys.d || keys.arrowright) x += 1;
    if (keys.w || keys.arrowup) y -= 1;
    if (keys.s || keys.arrowdown) y += 1;
    if (stick.on) { x += stick.x; y += stick.y; }
    var l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    if (l > 0.1) { lastDir.x = x / Math.max(l, 1); lastDir.y = y / Math.max(l, 1); }
    return { x: l > 0.05 ? x : 0, y: l > 0.05 ? y : 0 };
  }

  var zone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob');
  zone.addEventListener('pointerdown', function (e) {
    if (stick.on) return;
    stick.on = true; stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = 0; stick.y = 0;
    var r = zone.getBoundingClientRect();
    base.style.display = 'block'; base.style.left = (e.clientX - r.left) + 'px'; base.style.top = (e.clientY - r.top) + 'px';
    knob.style.transform = 'translate(0,0)';
    try { zone.setPointerCapture(e.pointerId); } catch (x) { /* ponteiro sintético */ }
  });
  zone.addEventListener('pointermove', function (e) {
    if (!stick.on || e.pointerId !== stick.id) return;
    var dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, l = Math.hypot(dx, dy), R = 52;
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    stick.x = dx / R; stick.y = dy / R;
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  });
  function stickEnd(e) {
    if (e.pointerId !== stick.id) return;
    stick.on = false; stick.x = 0; stick.y = 0; base.style.display = 'none';
  }
  zone.addEventListener('pointerup', stickEnd);
  zone.addEventListener('pointercancel', stickEnd);
  if (('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches)) document.body.classList.add('touch');

  var lastSent = { mx: 9, my: 9, am: -1, a: 9, t: 0 };
  setInterval(function () {
    if (!S.joined) return;
    var v = S.alive ? inputVec() : { x: 0, y: 0 };
    var am = cfg.aim === 'cursor' ? 1 : 0, a = 0;
    if (am) {
      if (document.body.classList.contains('touch') && !mouse.has) a = Math.atan2(lastDir.y, lastDir.x);
      else if (S.pos) { var s = toScreen(S.pos.x, S.pos.y); a = Math.atan2(mouse.y - s.y, mouse.x - s.x); }
    }
    var now = performance.now();
    if (Math.abs(v.x - lastSent.mx) > 0.02 || Math.abs(v.y - lastSent.my) > 0.02 || am !== lastSent.am || Math.abs(a - lastSent.a) > 0.04 || now - lastSent.t > 400) {
      send({ t: 'in', mx: +v.x.toFixed(3), my: +v.y.toFixed(3), am: am, a: +a.toFixed(3) });
      lastSent = { mx: v.x, my: v.y, am: am, a: a, t: now };
    }
  }, 50);
  document.addEventListener('visibilitychange', function () { if (document.hidden) keys = {}; });

  /* ======================= interface ======================= */
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(html) {
    var d = document.createElement('div'); d.innerHTML = html;
    $('toast').appendChild(d); setTimeout(function () { d.remove(); }, 3100);
  }
  function addFeed(text) {
    var d = document.createElement('div'); d.textContent = text;
    var f = $('feed'); f.appendChild(d);
    while (f.children.length > 5) f.removeChild(f.firstChild);
    setTimeout(function () { d.classList.add('out'); }, 6000); setTimeout(function () { d.remove(); }, 6700);
  }
  var CROWN = '<svg viewBox="0 0 15 12" aria-label="coroa"><path d="M1 10 L0 2 L4 6 L7.5 0 L11 6 L15 2 L14 10 Z" fill="#ffb347" stroke="#7a4a10" stroke-width=".8"/></svg>';
  function renderLb() {
    var h = '<h3>Ranking da sala</h3><ol>';
    S.lb.forEach(function (r) {
      h += '<li class="' + (r[0] === S.id ? 'me' : '') + '">' + (r[3] ? CROWN : '') + '<span class="n">' + escapeHtml(r[1]) + '</span><span class="l">Nv ' + r[2] + '</span></li>';
    });
    $('lb').innerHTML = h + '</ol>';
  }
  function fmtTime(s) { return Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2); }
  function itemReq(it, stats) {
    if (!it.req) return { ok: true, text: 'Nenhum' };
    var have = GD.attrOf(stats, it.attr);
    return { ok: have >= it.req, text: ATTR_SHORT[it.attr] + ' ' + it.req + ' (você tem ' + have + ')' };
  }

  var ATTR_DESC = { str: 'Dano das armas de Força e requisito delas.', dex: 'Dano das armas de Destreza e requisito delas.', man: 'Dano das armas de Mana e requisito delas.', hlt: 'Vida: +10 por ponto. Requisito dos peitorais.' };
  function renderAttrs() {
    var m = S.me; if (!m) return;
    var pts = m.pts || 0, MAX = GD.ATTR_MAX;
    $('attrHint').innerHTML = pts > 0 ? 'Você tem <b>' + pts + '</b> ponto' + (pts > 1 ? 's' : '') + ' para distribuir. Cada nível dá ' + GD.POINTS_PER_LEVEL + ', e o máximo é ' + MAX + ' em cada atributo. Ao morrer, tudo volta ao começo.' : 'Sem pontos agora. Cada nível dá ' + GD.POINTS_PER_LEVEL + ' pontos, e o máximo é ' + MAX + ' em cada atributo. Ao morrer, tudo volta ao começo.';
    $('attrList').innerHTML = GD.ATTRS.map(function (k) {
      var v = m.stats[k], room = Math.min(pts, MAX - v), off = room < 1 ? ' disabled' : '';
      return '<li><div class="ar-top"><b>' + ATTR_SHORT[k] + '</b><span>' + v + ' / ' + MAX + '</span></div><div class="ar-bar"><i style="width:' + (v / MAX * 100) + '%"></i></div><small class="muted">' + ATTR_DESC[k] + '</small>' +
        '<div class="ar-btns"><button data-k="' + k + '" data-n="1"' + off + '>+1</button><button data-k="' + k + '" data-n="5"' + (Math.min(pts, MAX - v) < 5 ? ' disabled' : '') + '>+5</button><button data-k="' + k + '" data-n="' + Math.max(1, room) + '"' + off + '>Tudo' + (room > 1 ? ' (+' + room + ')' : '') + '</button></div></li>';
    }).join('');
  }
  function updateHud() {
    var m = S.me; if (!m) return;
    $('hLvl').textContent = 'Nv ' + m.lv;
    $('hpFill').style.width = Math.max(0, Math.min(100, m.hp / m.mhp * 100)) + '%';
    $('hpText').textContent = Math.round(m.hp) + ' / ' + m.mhp;
    var maxed = m.lv >= GD.MAX_LEVEL;
    $('xpFill').style.width = (maxed ? 100 : Math.min(100, m.xp / m.xn * 100)) + '%';
    $('xpText').textContent = maxed ? 'Nível máximo' : Math.floor(m.xp) + ' / ' + m.xn + ' XP';
    $('attrs').innerHTML = GD.ATTRS.map(function (k) { return '<span><b>' + m.stats[k] + '</b>' + ATTR_SHORT[k] + '</span>'; }).join('');
    var pts = m.pts || 0, hp2 = $('hPts');
    hp2.hidden = pts < 1; hp2.textContent = '+' + pts;
    $('btnAttr').classList.toggle('has-new', pts > 0); $('btnAttr').textContent = pts > 0 ? 'Atributos (' + pts + ')' : 'Atributos';
    $('menuToggle').classList.toggle('has-new', pts > 0 || (S.me && unseenCount() > 0 && seenInit));
    if (!$('attrPanel').hidden) renderAttrs();
    // barra de equipamento com recarga da habilidade
    [0, 1].forEach(function (i) {
      var id = m.eq.w[i], el = $('slot' + i), img = el.querySelector('img'), cd = el.querySelector('.cd');
      var active = m.act.indexOf(i) >= 0;
      el.classList.toggle('empty', !id);
      el.classList.toggle('off', !!id && !active);
      el.classList.toggle('fused', !!m.fu || !!m.mx);
      if (id) { var src = A.iconURL(id); if (img.getAttribute('src') !== src) img.src = src; } else img.removeAttribute('src');
      var f = id && FAM[ITEM[id].fam].skill, frac = 0;
      if (f && active) { frac = Math.max(0, Math.min(1, m.scd[i] / f.cd)); if (m.fu && i === 1) frac = Math.max(0, Math.min(1, m.scd[0] / f.cd)); if (m.mx) frac = Math.max(0, Math.min(1, Math.max(m.scd[0], m.scd[1]) / m.mx[1])); }
      cd.style.transform = 'scaleY(' + frac + ')';
    });
    var ai = $('slotA').querySelector('img'), asrc = A.iconURL(m.armId);
    if (ai.getAttribute('src') !== asrc) ai.src = asrc;
    $('slotA').classList.toggle('off', m.eq.a !== m.armId);
  }

  function toggle(id) { var el = $(id), open = el.hidden; closePanels(); if (open) { el.hidden = false; if (id === 'invPanel') renderInv(); else if (id === 'rankPanel') loadRank(); else if (id === 'attrPanel') renderAttrs(); else renderQuests(); } }
  function closePanels() { $('attrPanel').hidden = true; $('invPanel').hidden = true; $('questPanel').hidden = true; $('rankPanel').hidden = true; $('shopPanel').hidden = true; }
  function toggleShop() { var open = $('shopPanel').hidden; closePanels(); if (open && Lj) Lj.show(); }
  // celular: os botões ficam recolhidos atrás do botão de menu, para não tampar o jogo
  function sideMenu(open) { $('side').classList.toggle('open', open); $('menuToggle').setAttribute('aria-expanded', String(open)); }
  $('menuToggle').addEventListener('click', function () { sideMenu(!$('side').classList.contains('open')); });
  ['btnInv', 'btnQuest', 'btnRank', 'btnShop', 'btnAttr'].forEach(function (id) { $(id).addEventListener('click', function () { sideMenu(false); }); });
  $('btnInv').addEventListener('click', function () { toggle('invPanel'); });
  $('btnQuest').addEventListener('click', function () { toggle('questPanel'); });
  $('btnAttr').addEventListener('click', function () { toggle('attrPanel'); });
  $('hPts').addEventListener('click', function () { toggle('attrPanel'); });
  $('attrList').addEventListener('click', function (e) { var b = e.target.closest('button[data-k]'); if (!b || b.disabled) return; send({ t: 'alloc', k: b.dataset.k, n: +b.dataset.n }); });
  $('btnRank').addEventListener('click', function () { toggle('rankPanel'); });
  $('rankOpenTitle').addEventListener('click', function () { toggle('rankPanel'); });
  $('btnShop').addEventListener('click', toggleShop);
  $('shopOpenTitle').addEventListener('click', toggleShop);
  if (Lj) Lj.init({ color: function () { return cfg.color; } });

  /* ======================= rankings ======================= */
  // Duas listas vindas do servidor (/api/ranking): PvP (quem chegou ao nível 20, por abates) e Dragão (menor tempo de jogo até a 1ª vitória).
  var rank = { tab: 'pvp', data: null, busy: false, err: false };
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? h + ' h ' + m + ' min' : m ? m + ' min ' + s + ' s' : s + ' s';
  }
  function rankToken() { try { return localStorage.getItem('slimeio_token') || ''; } catch (e) { return ''; } }
  function loadRank() {
    if (rank.busy) return;
    rank.busy = true; renderRank();
    var h = {}, t = rankToken();
    if (t) h.Authorization = 'Bearer ' + t;
    fetch('/api/ranking', { headers: h, cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('http')); })
      .then(function (j) { rank.data = j && j.enabled ? j : null; rank.err = !(j && j.enabled); })
      .catch(function () { rank.data = null; rank.err = true; })
      .then(function () { rank.busy = false; renderRank(); });
  }
  function rankRow(cls, parts) {
    var li = document.createElement('li'); if (cls) li.className = cls;
    parts.forEach(function (p) { var e = document.createElement('span'); e.className = p[0]; e.textContent = p[1]; li.appendChild(e); });
    return li;
  }
  function renderRank() {
    var list = $('rankList'), d = rank.data, pvp = rank.tab === 'pvp';
    Array.prototype.forEach.call($('rankTabs').querySelectorAll('[data-tab]'), function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === rank.tab)); });
    $('rankHint').textContent = pvp
      ? 'Quem já chegou ao nível 20, pelos abates de jogadores (vítimas do nível 8 para cima; a mesma vítima só conta de novo depois de 5 minutos).'
      : 'Menor tempo de jogo (conectado, somando todas as sessões) até derrotar o Dragão ancestral pela primeira vez.';
    list.textContent = '';
    $('rankYou').textContent = ''; $('rankNote').textContent = '';
    if (rank.busy && !d) { list.appendChild(rankRow('msg', [['', 'Carregando…']])); return; }
    if (!d) { list.appendChild(rankRow('msg', [['', rank.err ? 'Os rankings não estão disponíveis agora. Eles precisam do servidor com contas ligadas (não funcionam na versão de teste).' : '']])); return; }
    var rows = pvp ? d.pvp : d.dragon;
    if (!rows.length) list.appendChild(rankRow('msg', [['', pvp ? 'Ninguém com conta chegou ao nível 20 ainda. Seja o primeiro.' : 'Ninguém derrotou o dragão ainda. Só quem está no nível 20 consegue machucá-lo.']]));
    rows.forEach(function (r) {
      if (pvp) list.appendChild(rankRow(r.me ? 'me' : '', [['pos', r.n], ['nm', r.name], ['val', r.kills + (r.kills === 1 ? ' abate' : ' abates')]]));
      else {
        var li = rankRow(r.me ? 'me' : '', [['pos', r.n], ['nm', r.name], ['val', fmtDur(r.play)], ['sub', 'luta de ' + fmtDur(r.fight) + (r.wins > 1 ? ', ' + r.wins + ' vitórias' : '')]]);
        list.appendChild(li);
      }
    });
    var y = d.you;
    if (!y) $('rankYou').textContent = 'Só quem joga com conta entra nos rankings. Entre ou crie uma conta na tela inicial.';
    else if (pvp) $('rankYou').textContent = y.crowned ? 'Você: ' + y.posPvp + 'º, com ' + y.kills + (y.kills === 1 ? ' abate.' : ' abates.') : 'Chegue ao nível 20 para entrar neste ranking. Seus abates até lá já estão sendo contados (' + y.kills + ').';
    else $('rankYou').textContent = y.dragon ? 'Você: ' + y.posDragon + 'º, com ' + fmtDur(y.dragon.play) + ' de jogo.' : 'Você já jogou ' + fmtDur(y.play) + '. Derrote o dragão para entrar neste ranking.';
    $('rankNote').textContent = d.persistent === false ? 'Neste servidor os rankings zeram quando ele reinicia (sem banco de dados ligado).' : '';
  }
  $('rankTabs').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-tab]') : null;
    if (!b) return;
    rank.tab = b.dataset.tab; renderRank();
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', function () { $(b.dataset.close).hidden = true; }); });
  function syncAimBtn() { $('btnAim').textContent = cfg.aim === 'cursor' ? 'Mira: cursor' : 'Mira: alvo próximo'; }
  $('btnAim').addEventListener('click', function () { cfg.aim = cfg.aim === 'cursor' ? 'near' : 'cursor'; store.set('slimeio_aim', cfg.aim); syncAimBtn(); toast(cfg.aim === 'cursor' ? 'As armas miram na direção do cursor.' : 'As armas miram no alvo mais próximo.'); });
  syncAimBtn();
  $('slot0').addEventListener('click', function () { openItem(S.me && S.me.eq.w[0], 'w0'); });
  $('slot1').addEventListener('click', function () { openItem(S.me && S.me.eq.w[1], 'w1'); });
  $('slotA').addEventListener('click', function () { openItem(S.me && S.me.eq.a, 'a'); });

  /* ---- mochila: catálogo completo; o que ainda não foi ganho aparece bloqueado ---- */
  var sel = null; // { id, slot }
  var invTab = store.get('slimeio_tab', 'weapon') === 'armor' ? 'armor' : 'weapon';
  var onlyOwned = false;
  var seen = {}; // itens já vistos na mochila (o resto ganha o selo "novo")
  try { seen = JSON.parse(store.get('slimeio_seen', '{}')) || {}; } catch (e) { seen = {}; }
  var seenInit = false;
  var LOCK = '<svg class="lock" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.6"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none"/></svg>';
  var TIER_SHORT = ['Comum', 'Incomum', 'Rara', 'Épica', 'Lendária', 'Mítica'];
  var WEAPON_FAMS = Object.keys(FAM).filter(function (k) { return k !== 'faca'; });
  var ARMOR_TYPES = Object.keys(GD.ARMORS);
  var ARMOR_SUB = { vital: 'mais vida', arcano: 'resiste magia', blindado: 'resiste golpes', draco: 'vida e resistências' };
  var ARMOR_LABEL = { draco: 'Dragão' };
  function owned(id) { var m = S.me; return !!m && (GD.BASE_ITEMS.indexOf(id) >= 0 || m.inv.indexOf(id) >= 0); }
  function markSeen(id) { if (!seen[id]) { seen[id] = 1; store.set('slimeio_seen', JSON.stringify(seen)); } }
  function unseenCount() { var m = S.me; if (!m) return 0; var n = 0; m.inv.forEach(function (id) { if (!seen[id]) n++; }); return n; }
  function syncInvBadge() { var n = S.me ? unseenCount() : 0; $('btnInv').classList.toggle('has-new', n > 0 && seenInit); $('menuToggle').classList.toggle('has-new', (n > 0 && seenInit) || !!(S.me && S.me.pts > 0)); }
  function openItem(id, slot) {
    if (!id) return;
    sel = { id: id, slot: slot || null };
    if ($('invPanel').hidden) { closePanels(); $('invPanel').hidden = false; }
    var it = ITEM[id]; if (it) invTab = it.kind === 'armor' ? 'armor' : 'weapon';
    renderInv();
  }
  function cellHtml(id) {
    var m = S.me, it = ITEM[id], has = owned(id), meets = has && GD.meetsReq(it, m.stats);
    var mark = (m.eq.w[0] === id ? '1' : '') + (m.eq.w[1] === id ? '2' : '') + (m.eq.a === id ? 'P' : '');
    var cls = 'cell t' + it.tier + (has ? (meets ? '' : ' weak') : ' locked') + (sel && sel.id === id && !sel.slot ? ' sel' : '') + (has && !seen[id] && id !== 'faca' ? ' fresh' : '');
    if (onlyOwned && !has) return '<div class="cell hole"></div>';
    return '<button type="button" class="' + cls + '" data-id="' + id + '" title="' + escapeHtml(it.name) + (has ? '' : ' (bloqueado)') + '"><img src="' + A.iconURL(id) + '" alt="' + escapeHtml(it.name) + '">' +
      (has ? '' : LOCK) + (mark ? '<span class="eqmark">' + mark + '</span>' : '') + (has && !meets ? '<span class="need">' + it.req + '</span>' : '') + '</button>';
  }
  function renderInv() {
    var m = S.me; if (!m) return;
    if (!seenInit) { m.inv.forEach(function (id) { seen[id] = 1; }); seenInit = true; }
    var eqEl = $('equipped'), h = '';
    var slots = [['w0', 'Arma 1', m.eq.w[0]], ['w1', 'Arma 2', m.eq.w[1]], ['a', 'Peitoral', m.eq.a]];
    slots.forEach(function (s, i) {
      var id = s[2], it = id && ITEM[id], off = false;
      if (it) off = s[0] === 'a' ? m.eq.a !== m.armId : m.act.indexOf(i) < 0;
      h += '<button type="button" class="eq' + (sel && sel.slot === s[0] ? ' sel' : '') + (off ? ' off' : '') + '" data-slot="' + s[0] + '"><small>' + s[1] + '</small>' +
        (it ? '<img src="' + A.iconURL(id) + '" alt=""><span class="nm" style="color:' + (it.tier ? GD.TIER_COLORS[it.tier - 1] : '#c9c2b2') + '">' + escapeHtml(it.name) + '</span>' : '<span class="nm muted">vazio</span>') + '</button>';
    });
    eqEl.innerHTML = h;
    Array.prototype.forEach.call(eqEl.querySelectorAll('.eq'), function (b) {
      b.addEventListener('click', function () { var s = b.dataset.slot, id = s === 'a' ? m.eq.a : m.eq.w[s === 'w0' ? 0 : 1]; if (id) openItem(id, s); else { sel = null; renderInv(); } });
    });
    $('fuseHint').hidden = !m.fu && !m.mx;
    $('fuseHint').textContent = m.mx ? 'Habilidade mista: ' + m.mx[0] + '. As duas habilidades saem juntas (+10% de dano) com uma recarga só de ' + m.mx[1] + ' s.' : 'O mesmo item nos dois slots funde a habilidade: +50% de dano e área maior, um disparo por ciclo. Armas diferentes criam uma habilidade mista.';
    $('starterRow').innerHTML = GD.BASE_ITEMS.map(function (id) { return cellHtml(id); }).join('');
    $('invCount').textContent = m.inv.length + ' de ' + GD.CATALOG_SIZE + ' conquistados';
    // abas
    var wOwn = 0, aOwn = 0, wAll = WEAPON_FAMS.length * GD.MYTHIC_TIER, aAll = Object.keys(ITEM).filter(function (k) { return ITEM[k].kind === 'armor' && ITEM[k].tier > 0; }).length;
    m.inv.forEach(function (id) { if (ITEM[id].kind === 'weapon') wOwn++; else aOwn++; });
    $('invTabs').innerHTML =
      '<button type="button" role="tab" aria-selected="' + (invTab === 'weapon') + '" data-tab="weapon">Armas <small>' + wOwn + '/' + wAll + '</small></button>' +
      '<button type="button" role="tab" aria-selected="' + (invTab === 'armor') + '" data-tab="armor">Peitorais <small>' + aOwn + '/' + aAll + '</small></button>' +
      '<label class="own"><input type="checkbox" id="onlyOwned"' + (onlyOwned ? ' checked' : '') + '> só os meus</label>';
    Array.prototype.forEach.call($('invTabs').querySelectorAll('[data-tab]'), function (b) { b.addEventListener('click', function () { invTab = b.dataset.tab; store.set('slimeio_tab', invTab); if (sel && ITEM[sel.id] && (ITEM[sel.id].kind === 'armor') !== (invTab === 'armor')) sel = null; renderInv(); }); });
    $('onlyOwned').addEventListener('change', function (e) { onlyOwned = e.target.checked; renderInv(); });
    // catálogo: uma linha por família (armas) ou por tipo (peitorais), uma coluna por faixa
    var cols = GD.MYTHIC_TIER, g = '<div class="crow head"><span></span>';
    for (var t = 0; t < 6; t++) g += t < cols ? '<span class="th" style="color:' + GD.TIER_COLORS[t] + '">' + TIER_SHORT[t] + '</span>' : '<span></span>';
    g += '</div>';
    var rowsDef = invTab === 'weapon' ? WEAPON_FAMS : ARMOR_TYPES;
    rowsDef.forEach(function (key) {
      var label = invTab === 'weapon' ? FAM[key].name : (ARMOR_LABEL[key] || GD.ARMORS[key].name.replace('Peitoral ', ''));
      var sub = invTab === 'weapon' ? ATTR_SHORT[FAM[key].attr] : ARMOR_SUB[key];
      g += '<div class="crow"><span class="rl"><b>' + label + '</b><small>' + sub + '</small></span>';
      for (var t2 = 1; t2 <= 6; t2++) g += t2 <= cols && ITEM[key + '_' + t2] ? cellHtml(key + '_' + t2) : '<span></span>';
      g += '</div>';
    });
    $('invGrid').innerHTML = g;
    Array.prototype.forEach.call(document.querySelectorAll('#invGrid .cell[data-id], #starterRow .cell[data-id]'), function (b) {
      b.addEventListener('click', function () { sel = { id: b.dataset.id, slot: null }; if (owned(sel.id)) markSeen(sel.id); syncInvBadge(); renderInv(); });
    });
    syncInvBadge();
    renderDetail();
  }
  function questCur(q) {
    var Q = S.me.q;
    switch (q.type) {
      case 'kill': return Q.kills[q.mob] || 0;
      case 'pk': return Q.pk;
      case 'survive': return Q.alive;
      case 'nodamage': return Q.nod;
      case 'onehit': return Q.one;
      default: return S.me.lv;
    }
  }
  function renderDetail() {
    var d = $('detail'), m = S.me;
    if (!sel || !ITEM[sel.id]) { d.className = 'detail empty'; d.innerHTML = '<p class="muted">Toque em um item para ver os detalhes. Os bloqueados mostram como conseguir.</p>'; return; }
    d.className = 'detail';
    var it = ITEM[sel.id], st = m.stats, req = itemReq(it, st), tn = it.tier ? GD.TIER_NAMES[it.tier - 1] : 'Inicial', has = owned(sel.id);
    var color = it.tier ? GD.TIER_COLORS[it.tier - 1] : '#c9c2b2';
    var h = '<div class="dhead"><img src="' + A.iconURL(sel.id) + '" alt="" class="' + (has ? '' : 'locked') + '"><div><h3 style="color:' + color + '">' + escapeHtml(it.name) + '</h3>';
    if (it.kind === 'weapon') {
      var F = FAM[it.fam];
      h += '<div class="kind">' + (it.tier ? 'Arma ' + tn.toLowerCase() : 'Arma inicial') + ' de ' + (F.attr === 'best' ? 'qualquer atributo' : ATTR_SHORT[F.attr]) + (has ? '' : ' · bloqueada') + '</div></div></div>';
    } else {
      h += '<div class="kind">' + (it.tier ? 'Peitoral ' + tn.toLowerCase() : 'Peitoral inicial') + ' de Saúde' + (has ? '' : ' · bloqueado') + '</div></div></div>';
    }
    if (!has) {
      var how = GD.howToGet(it);
      h += '<div class="how ' + how.kind + '"><b>' + (how.kind === 'quest' ? 'Missão' : how.kind === 'boss' ? 'Chefe' : 'Como conseguir') + '</b><p>' + escapeHtml(how.text) + '</p>';
      if (how.kind === 'quest') {
        var q = GD.QUESTS.filter(function (x) { return x.id === how.quest; })[0];
        if (q) { var cur = Math.min(questCur(q), q.n); h += '<div class="pb"><i style="width:' + (cur / q.n * 100) + '%"></i></div><small class="muted">' + ((q.type === 'survive' || q.type === 'nodamage') ? fmtTime(cur) + ' / ' + fmtTime(q.n) : cur + ' / ' + q.n) + '</small>'; }
      }
      h += '</div>';
    }
    var rows = [];
    if (it.kind === 'weapon') {
      rows.push(['Requisito', '<span class="' + (req.ok ? 'good' : 'bad') + '">' + req.text + '</span>']);
      rows.push(['Ataque', ATK_TEXT[F.atk] + ', dano ' + GD.weaponDamage(it, st)]);
      rows.push(['Velocidade', (1 / F.cd).toFixed(1) + ' golpes por segundo']);
      rows.push(['Alcance', F.range <= 80 ? 'curto' : F.range <= 200 ? 'médio' : 'longo']);
      if (F.skill) {
        var S2 = F.skill;
        rows.push(['Habilidade', escapeHtml(F.skillNames[it.tier - 1]) + ': ' + SKILL_TEXT[S2.kind]]);
        rows.push(['Dano e recarga', GD.skillDamage(it, st) + ' de dano a cada ' + S2.cd + ' s' + (S2.stun ? ', atordoa ' + S2.stun + ' s' : '') + (S2.heal ? ', cura ' + Math.round(S2.heal * 100) + '% da vida' : '')]);
      }
    } else {
      var a = GD.armorStats(it, st);
      rows.push(['Requisito', '<span class="' + (req.ok ? 'good' : 'bad') + '">' + req.text + '</span>']);
      rows.push(['Vida extra', '+' + a.hp]);
      var resTxt = [];
      if (a.rp) resTxt.push(a.rp + '% a dano físico');
      if (a.rm) resTxt.push(a.rm + '% a dano mágico');
      rows.push(['Resistência', resTxt.length ? resTxt.join(' e ') : 'nenhuma']);
    }
    h += '<dl>' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>';
    if (!has) { d.innerHTML = h + '<div class="btns">' + (GD.howToGet(it).kind === 'quest' ? '<button data-act="quest">Ver missões</button>' : '') + '</div>'; bindDetail(d); return; }
    h += '<div class="btns">';
    var equippedAt = m.eq.w[0] === sel.id ? 'w0' : null, equippedAt1 = m.eq.w[1] === sel.id, isArm = m.eq.a === sel.id;
    if (it.kind === 'weapon') {
      h += '<button data-act="w0"' + (req.ok ? '' : ' disabled') + '>' + (equippedAt ? 'Arma 1 (equipada)' : 'Equipar na arma 1') + '</button>';
      h += '<button data-act="w1"' + (req.ok ? '' : ' disabled') + '>' + (equippedAt1 ? 'Arma 2 (equipada)' : 'Equipar na arma 2') + '</button>';
      if (equippedAt) h += '<button data-act="u0">Tirar da arma 1</button>';
      if (equippedAt1) h += '<button data-act="u1">Tirar da arma 2</button>';
    } else {
      h += '<button data-act="a"' + (req.ok && !isArm ? '' : ' disabled') + '>' + (isArm ? 'Equipado' : 'Equipar') + '</button>';
    }
    h += '</div>';
    d.innerHTML = h;
    bindDetail(d);
  }
  function bindDetail(d) {
    Array.prototype.forEach.call(d.querySelectorAll('[data-act]'), function (b) {
      b.addEventListener('click', function () {
        var act = b.dataset.act;
        if (act === 'w0' || act === 'w1') send({ t: 'equip', slot: act, item: sel.id });
        else if (act === 'a') send({ t: 'equip', slot: 'a', item: sel.id });
        else if (act === 'u0') send({ t: 'equip', slot: 'w0', item: null });
        else if (act === 'u1') send({ t: 'equip', slot: 'w1', item: null });
        else if (act === 'quest') { closePanels(); $('questPanel').hidden = false; renderQuests(); }
      });
    });
  }

  /* ---- missões ---- */
  function renderQuests() {
    var m = S.me; if (!m) return;
    var Q = m.q;
    $('questList').innerHTML = GD.QUESTS.map(function (q) {
      var cur;
      switch (q.type) {
        case 'kill': cur = Q.kills[q.mob] || 0; break;
        case 'pk': cur = Q.pk; break;
        case 'survive': cur = Q.alive; break;
        case 'nodamage': cur = Q.nod; break;
        case 'onehit': cur = Q.one; break;
        default: cur = m.lv;
      }
      var done = Q.done.indexOf(q.id) >= 0, shown = Math.min(cur, q.n);
      var label = (q.type === 'survive' || q.type === 'nodamage') ? fmtTime(shown) + ' / ' + fmtTime(q.n) : shown + ' / ' + q.n;
      var hint = q.type === 'nodamage' ? ' Só conta enquanto você está lutando.' : (q.type === 'survive' || q.type === 'level' || q.type === 'onehit' ? ' Vale só para a vida atual.' : '');
      return '<li class="' + (done ? 'done' : '') + '"><div class="row"><img src="' + A.iconURL(q.reward) + '" alt=""><div class="tx"><b>' + escapeHtml(q.text) + '</b><small>' + (done ? 'Concluída: ' : 'Recompensa: ') + escapeHtml(ITEM[q.reward].name) + '.' + hint + '</small></div></div>' +
        '<div class="pb"><i style="width:' + (done ? 100 : shown / q.n * 100) + '%"></i></div><small class="muted">' + (done ? 'Recebida' : label) + '</small></li>';
    }).join('');
  }

  /* ---- subida de nível: pontos de atributo para distribuir ---- */
  var lvlQueue = [], lvlBusy = false;
  function queueLevel(m) {
    if (S.pos) {
      fxs.push({ x: S.pos.x, y: S.pos.y, kind: 'lvl', a: 0, size: 78, fam: 'faca', tier: 1, extra: 0, age: 0 });
      for (var q = 0; q < 22 && parts.length < 700; q++) { var qa = Math.random() * TAU, qs = 50 + Math.random() * 150; parts.push({ x: S.pos.x, y: S.pos.y, vx: Math.cos(qa) * qs, vy: Math.sin(qa) * qs - 120, life: 0.7 + Math.random() * 0.6, max: 1.3, c: Math.random() < 0.5 ? '#ffe9a8' : '#ffb347', sz: 2 + Math.random() * 3 }); }
      shake = Math.max(shake, 3);
    }
    lvlQueue.push({ level: m.level, pts: m.pts });
    if (!lvlBusy) nextLevel();
  }
  function nextLevel() {
    var item = lvlQueue.shift();
    var ov = $('lvlOverlay');
    if (!item) { lvlBusy = false; ov.hidden = true; return; }
    lvlBusy = true;
    ov.classList.remove('out'); ov.hidden = false;
    ov.innerHTML = '<h2>Nível ' + item.level + '</h2><p class="lvl-pts">+' + item.pts + ' pontos de atributo</p><small>Toque em Atributos para distribuir</small>';
    var hold = 2600;
    setTimeout(function () { ov.classList.add('out'); }, hold);
    setTimeout(nextLevel, hold + 500);
  }

  /* ---- morte ---- */
  function onDeath(m) {
    S.dead = true; S.alive = false;
    $('deathText').textContent = 'Derrotado por ' + m.by + '. Você perdeu o nível ' + m.lvl + ' e os atributos, mas seus equipamentos continuam com você.';
    setTimeout(function () { if (S.dead) $('deathOverlay').hidden = false; }, 700);
  }
  function respawn() { if (!S.dead) return; send({ t: 'respawn' }); $('deathOverlay').hidden = true; }
  $('respawnBtn').addEventListener('click', respawn);
  // Voltar ao menu: sai da sala (o progresso já está guardado) e recarrega a tela inicial
  $('menuBtn').addEventListener('click', function () { S.failed = true; try { ws.close(); } catch (x) { /* já fechou */ } location.reload(); });

  /* ======================= desenho ======================= */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1.5 : 2);
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    zoom = Math.max(vw / 1900, vh / 1250, vw < 760 || vh < 520 ? 0.7 : 0.9);
  }
  window.addEventListener('resize', resize);
  function toScreen(x, y) { return { x: vw / 2 + (x - cam.x) * zoom, y: vh / 2 + (y - cam.y) * zoom }; }
  function initFlies() {
    flies = [];
    for (var i = 0; i < 44; i++) flies.push({ x: Math.random() * W.w, y: Math.random() * W.h, p: Math.random() * TAU, s: 8 + Math.random() * 14 });
  }
  function clampEll(o) {
    var nx = (o.x - W.cx) / W.rx, ny = (o.y - W.cy) / W.ry, n = Math.hypot(nx, ny);
    if (n > W.wall) { o.x = W.cx + nx / n * W.rx * W.wall; o.y = W.cy + ny / n * W.ry * W.wall; }
  }

  function update(dt) {
    var k = 1 - Math.exp(-dt * 14), v = inputVec();
    if (S.alive && S.pos && S.srv) {
      if (!(S.myF & 2)) {
        var mine = S.players.get(S.id), sp = (mine ? GD.moveSpeed(mine.l, (mine.w || []).map(function (id) { return ITEM[id] && ITEM[id].fam; })) : BASE_SPEED) * ((S.myF & 16) ? 0.6 : 1);
        S.pos.x += v.x * sp * dt; S.pos.y += v.y * sp * dt;
        clampEll(S.pos);
      }
      var ex = S.srv.x - S.pos.x, ey = S.srv.y - S.pos.y, ed = Math.hypot(ex, ey), moving = v.x || v.y;
      var kk = ed > 90 ? 1 - Math.exp(-dt * 10) : (!moving ? 1 - Math.exp(-dt * 6) : 1 - Math.exp(-dt * 0.5));
      S.pos.x += ex * kk; S.pos.y += ey * kk;
    }
    S.players.forEach(function (e) {
      e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k; e.rr += (e.r - e.rr) * (1 - Math.exp(-dt * 6));
      // animação do slime: velocidade suavizada (inclina e pula ao andar) e tempo desde o último dano
      var cx = e.id === S.id && S.pos ? S.pos.x : e.rx, cy = e.id === S.id && S.pos ? S.pos.y : e.ry;
      if (e.lx === undefined) { e.lx = cx; e.ly = cy; e.vx = 0; e.vy = 0; e.walkP = 0; e.mv = 0; e.hurtT = 9; }
      var kv = 1 - Math.exp(-dt * 10);
      e.vx += ((cx - e.lx) / dt - e.vx) * kv; e.vy += ((cy - e.ly) / dt - e.vy) * kv;
      e.lx = cx; e.ly = cy;
      e.mv = Math.max(0, Math.min(1, (Math.hypot(e.vx, e.vy) - 25) / (BASE_SPEED - 25)));
      e.walkP += dt * 9 * e.mv; e.hurtT += dt;
      if (e.id === S.id) { // passos de gelatina no ritmo do pulinho, e o som passa a ser medido a partir de onde o jogador está
        var stp = Math.floor(e.walkP / Math.PI);
        if (e.stp !== undefined && stp !== e.stp && e.mv > 0.2) SND.play('step');
        e.stp = stp; SND.listen(cx, cy);
      }
      if (e.sw) for (var si = 0; si < e.sw.length; si++) if (e.sw[si]) { e.sw[si].age += dt; if (e.sw[si].age >= e.sw[si].dur) e.sw[si] = null; }
    });
    S.mobs.forEach(function (e) {
      var dx = e.x - e.rx; if (Math.abs(dx) > 0.6) e.flip = dx < 0;
      e.rx += dx * k; e.ry += (e.y - e.ry) * k; if (e.flash > 0) e.flash -= dt;
      e.kickT = e.kickT === undefined ? 9 : e.kickT + dt; e.atkAge = e.atkAge === undefined ? 9 : e.atkAge + dt;
      // andar: velocidade suavizada (px/s) e fase do passo, para o monstro pular/balançar conforme se move
      var mdx = e.rx - (e.lx === undefined ? e.rx : e.lx), mdy = e.ry - (e.ly === undefined ? e.ry : e.ly);
      e.lx = e.rx; e.ly = e.ry;
      var spd = dt > 0 ? Math.min(400, Math.hypot(mdx, mdy) / dt) : 0;
      e.mv = (e.mv || 0) + (spd - (e.mv || 0)) * (1 - Math.exp(-dt * 10));
      e.walkP = (e.walkP || (e.id * 1.7)) + dt * (GAIT[MOB_KEYS[e.ki]] || GAIT_DEF).f * Math.min(1.6, 0.5 + e.mv / 90);
    });
    var bt = 0; // música: mais tensa quando o dragão está acordado e perto
    if (S.pos) S.mobs.forEach(function (e) { if (MOBDEF[MOB_KEYS[e.ki]].boss && (e.st & 2) === 0) { var bd = Math.hypot(e.rx - S.pos.x, e.ry - S.pos.y); bt = Math.max(bt, bd < 1100 ? ((e.st & 16) ? 1 : 0.75) * Math.min(1, (1100 - bd) / 500) : 0); } });
    SND.boss(bt);
    for (var ci = corpses.length - 1; ci >= 0; ci--) {
      var cp = corpses[ci]; cp.age += dt;
      if (cp.boss && cp.age < 1.5 && Math.random() < dt * 45 && parts.length < 700) parts.push({ x: cp.x + (Math.random() - 0.5) * 200, y: cp.y + (Math.random() - 0.3) * 90, vx: (Math.random() - 0.5) * 90, vy: -80 - Math.random() * 160, life: 0.7 + Math.random() * 0.8, max: 1.5, c: Math.random() < 0.5 ? '#ffb36b' : '#ff6a2a', sz: 2 + Math.random() * 3.5 });
      if (cp.age > cp.dur) corpses.splice(ci, 1);
    }
    for (ci = splats.length - 1; ci >= 0; ci--) { splats[ci].age += dt; if (splats[ci].age > splats[ci].dur) splats.splice(ci, 1); }
    var kp = 1 - Math.exp(-dt * 24);
    S.projs.forEach(function (e) { e.rx += (e.x - e.rx) * kp; e.ry += (e.y - e.ry) * kp; });
    for (var i = fxs.length - 1; i >= 0; i--) { fxs[i].age += dt; if (fxs[i].age > FX.dur(fxs[i].kind)) fxs.splice(i, 1); }
    for (i = teles.length - 1; i >= 0; i--) { teles[i].age += dt; if (teles[i].age > teles[i].t + 0.1) teles.splice(i, 1); }
    for (i = floats.length - 1; i >= 0; i--) { floats[i].age += dt; if (floats[i].age > 0.9) floats.splice(i, 1); }
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.vx *= 0.96;
      if (p.life <= 0) parts.splice(i, 1);
    }
    flies.forEach(function (f) { f.p += dt * 0.6; f.x += Math.cos(f.p * 1.3) * f.s * dt; f.y += Math.sin(f.p) * f.s * dt; });
    if (S.pos) {
      var kc = 1 - Math.exp(-dt * 12);
      cam.x += (S.pos.x - cam.x) * kc; cam.y += (S.pos.y - cam.y) * kc;
    }
    shake = Math.max(0, shake - dt * 18);
  }

  function drawCrown(g, x, y) {
    g.save(); g.translate(x, y);
    g.fillStyle = '#ffb347'; g.strokeStyle = '#7a4a10'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-9, 0); g.lineTo(-10, -11); g.lineTo(-4, -5); g.lineTo(0, -14); g.lineTo(4, -5); g.lineTo(10, -11); g.lineTo(9, 0); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ff5a5a'; g.beginPath(); g.arc(0, -4, 1.7, 0, TAU); g.fill();
    g.restore();
  }
  function label(g, text, x, y, color, size) {
    g.font = '700 ' + size + 'px "Alegreya Sans", system-ui, sans-serif'; g.textAlign = 'center'; g.lineJoin = 'round';
    g.lineWidth = 3.5; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y);
  }
  function hpBar(g, x, y, w, frac, color) {
    g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    g.fillStyle = color; g.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 4);
  }

  // Pose de golpe: prepara (encolhe para trás), dá a investida e volta balançando. u vai de 0 a 1; a é a direção do golpe;
  // mag aumenta o movimento (habilidade); estilos de tiro dão um passo para trás em vez de avançar.
  function attackPose(u, a, r, mag, style) {
    var ca = Math.cos(a), sa = Math.sin(a), L, sx, sy, dir = style === 'shoot' ? -0.4 : style === 'ring' ? 0 : style === 'slash' ? 0.8 : style === 'smash' ? 0.9 : 1.1;
    if (u < 0.18) { var w = u / 0.18; w = w * w * (3 - 2 * w); L = -0.22 * w; sx = 1 + 0.08 * w; sy = 1 - 0.1 * w; }
    else if (u < 0.4) { var s = (u - 0.18) / 0.22, e3 = 1 - Math.pow(1 - s, 3); L = -0.22 + 0.92 * e3; sx = 1.08 + 0.1 * e3; sy = 0.9 + 0.02 * e3; }
    else { var b = (u - 0.4) / 0.6, k = 1 - b; L = 0.7 * k * k - 0.1 * Math.sin(b * Math.PI) * k; sx = 1 + 0.18 * k * k + 0.03 * Math.sin(b * 14) * k; sy = 0.92 + 0.08 * b - 0.04 * Math.sin(b * 14) * k; }
    L *= dir * mag * r;
    var o = { pose: (u > 0.14 && u < 0.78) ? 'attack' : 'idle', ox: ca * L, oy: sa * L * 0.7, sx: sx, sy: sy, flip: ca > 0 };
    if (style === 'ring') { var pu = Math.sin(Math.min(1, u) * Math.PI); o.sx = 1 + 0.1 * pu; o.sy = 1 + 0.1 * pu; }
    return o;
  }
  // Tudo que muda o desenho do slime neste quadro: dano (empurrão, achatar, clarão), golpe (investida) ou andar (pulinhos e inclinação).
  function slimeAnim(e, r) {
    var i, sw = null;
    if (e.hurtT !== undefined && e.hurtT < 0.36) {
      var h = e.hurtT / 0.36, dec = (1 - h) * (1 - h), big = e.hurtBig ? 1.5 : 1, wob = Math.sin(h * 28) * dec;
      return { pose: e.hurtT < 0.24 ? 'hurt' : 'idle', ox: Math.cos(e.hurtA || 0) * r * 0.55 * dec * big, oy: Math.sin(e.hurtA || 0) * r * 0.4 * dec * big,
        sx: 1 + 0.12 * wob, sy: 1 - 0.1 * wob, flash: Math.max(0, 1 - e.hurtT / 0.14), lean: Math.cos(e.hurtA || 0) * 0.14 * dec };
    }
    if (e.sw) for (i = 0; i < e.sw.length; i++) if (e.sw[i] && (!sw || e.sw[i].age < sw.age)) sw = e.sw[i];
    if (sw) return attackPose(sw.age / sw.dur, sw.a, r, sw.skill ? 1.35 : 1, sw.st);
    var mv = e.mv || 0;
    if (mv < 0.04) return null;
    var lift = Math.abs(Math.sin(e.walkP || 0)), sy = 1 - 0.1 * mv * Math.pow(1 - lift, 3) + 0.08 * mv * lift;
    return { sx: 1 / Math.pow(sy, 0.8), sy: sy, hop: lift * r * 0.2 * mv, lean: Math.max(-1, Math.min(1, (e.vx || 0) / BASE_SPEED)) * 0.12 };
  }

  // Peitorais das faixas altas deixam um brilho no chão (roxo, dourado) e o Dracônico solta brasas subindo.
  function armorAura(g, it, x, y, r, id) {
    if (!it || it.kind !== 'armor' || it.tier < 4) return;
    var col = it.tier === 6 ? '255,110,30' : it.tier === 5 ? '255,176,32' : '176,108,255', a = it.tier === 6 ? 0.34 : it.tier === 5 ? 0.24 : 0.16;
    g.save(); g.globalCompositeOperation = 'lighter'; g.translate(x, y + r * 0.72); g.scale(1, 0.4);
    var pulse = 1 + Math.sin(T * 2.4 + id) * 0.06, gr = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.9 * pulse);
    gr.addColorStop(0, 'rgba(' + col + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r * 1.9 * pulse, 0, TAU); g.fill(); g.restore();
    if (it.tier < 6) return;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 7; i++) { // brasas
      var ph = (T * 0.45 + i / 7 + id * 0.173) % 1, px = x + Math.sin(i * 2.7 + T * 1.3) * r * (0.5 + 0.5 * ph), py = y + r * 0.6 - ph * r * 2.3;
      g.fillStyle = 'rgba(255,' + Math.round(170 - ph * 90) + ',50,' + (0.85 * (1 - ph)).toFixed(2) + ')';
      g.beginPath(); g.arc(px, py, Math.max(1, r * (0.07 - ph * 0.04)), 0, TAU); g.fill();
    }
    g.restore();
  }

  function drawPlayer(g, e) {
    var me = e.id === S.id, x = me ? S.pos.x : e.rx, y = me ? S.pos.y : e.ry, r = e.rr;
    var ro = S.roster[e.id] || { name: 'Slime', color: '#5fd35f' };
    var o = slimeAnim(e, r) || {}, tt = T + e.id;
    o.cloth = e.ar || 'vital_0'; // a roupa equipada aparece no corpo
    armorAura(g, ITEM[o.cloth], x, y, r, e.id);
    g.save();
    if (e.f & 1) g.globalAlpha = 0.55 + 0.25 * Math.sin(T * 14);
    o.skin = skinFor(e.id);
    A.drawSlime(g, x, y, r, ro.color, tt, false, ((T * 0.7 + e.id) % 4) < 0.12, o);
    g.restore();
    // armas equipadas: o slime segura cada uma com um bracinho (a mão acompanha a investida e o golpe)
    var xf = A.slimeXf(x, y, r, tt, o), bc = xf(0, -0.62), arr = e.w || [], sleeve = A.armorSleeve(o.cloth);
    arr.forEach(function (id, i) {
      var it = ITEM[id], sgn = arr.length === 1 ? (Math.cos(e.a) >= 0 ? 1 : -1) : (i ? 1 : -1), sh = xf(sgn * 0.98, -0.62);
      var arm = {
        before: function (hx, hy) { A.drawArm(g, sh[0], sh[1], hx, hy, ro.color, r, bc[0], bc[1], sleeve); },
        after: function (hx, hy) { A.drawHand(g, hx, hy, ro.color, r); }
      };
      FX.drawHeld(g, A.weaponCanvas(id), it.fam, it.tier, bc[0], bc[1], r, 38 + r * 0.55, e.a, i, arr.length, e.sw && e.sw[i], T, A.weaponGeo(id), sh, arm);
    });
    var top = y - r * A.slimeTop();
    if (e.f & 4) { g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,179,71,.55)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r * 1.55 + Math.sin(T * 5) * 2, 0, TAU); g.stroke(); g.restore(); }
    hpBar(g, x, top - 2, Math.max(36, r * 2.2), e.h / e.m, me ? '#7ed06a' : '#e0574a');
    label(g, ro.name + '  ' + e.l, x, top - 9, me ? '#ffd9a0' : '#f1f4ea', 13);
    if (e.f & 8) drawCrown(g, x, top - 28);
  }

  // Monstro: empurrão e tremida ao apanhar, e o bote (recua, avança e volta) quando ataca.
  // Jeito de andar de cada monstro: f = ritmo dos passos, hop = altura do pulinho (em r), sq = achatamento ao pousar, tilt = balanço do corpo (rad)
  var GAIT_DEF = { f: 9, hop: 0.16, sq: 0.1, tilt: 0.06 };
  var GAIT = {
    cogumelo: { f: 8, hop: 0.12, sq: 0.1, tilt: 0.14 },  // gingado de lado a lado
    coelho: { f: 8.5, hop: 0.4, sq: 0.16, tilt: 0.05 },  // pulos grandes
    lobo: { f: 12, hop: 0.12, sq: 0.06, tilt: 0.05 },    // trote rápido e baixo
    javali: { f: 10, hop: 0.1, sq: 0.08, tilt: 0.07 },   // marcha pesada
    broto: { f: 6.5, hop: 0.1, sq: 0.08, tilt: 0.12 },   // balança as raízes devagar
    aranha: { f: 15, hop: 0.07, sq: 0.05, tilt: 0.1 },   // corre trepidando
    arvore: { f: 4.5, hop: 0.05, sq: 0.06, tilt: 0.08 }  // passo lento e pesado
  };
  function mobAnim(e, r, key) {
    var ox = 0, oy = 0, sx = 1, sy = 1, rot = 0, on = false;
    var gt = GAIT[key] || GAIT_DEF, mvk = Math.min(1, Math.max(0, ((e.mv || 0) - 6) / 50));
    if (mvk > 0.02) { // andando: pulinho com achatamento no chão e balanço
      var wp = e.walkP || 0, hp = Math.abs(Math.sin(wp)), air = Math.sin(wp);
      oy -= r * gt.hop * hp * mvk;
      var land = Math.pow(1 - hp, 4) * mvk; sx *= 1 + gt.sq * land; sy *= 1 - gt.sq * land;
      rot += Math.sin(wp) * gt.tilt * mvk; on = true;
    }
    if (e.kickT !== undefined && e.kickT < 0.32) {
      var h = e.kickT / 0.32, dec = (1 - h) * (1 - h), wob = Math.sin(h * 26) * dec;
      ox += Math.cos(e.kickA || 0) * r * 0.38 * dec; oy += Math.sin(e.kickA || 0) * r * 0.26 * dec; sx *= 1 + 0.18 * wob; sy *= 1 - 0.14 * wob; on = true;
    }
    if (e.atkAge !== undefined && e.atkAge < 0.36) {
      var u = e.atkAge / 0.36, L, st;
      if (u < 0.32) { st = u / 0.32; L = -0.16 * st; sy *= 1 - 0.1 * st; sx *= 1 + 0.08 * st; }
      else if (u < 0.5) { st = (u - 0.32) / 0.18; L = -0.16 + 0.78 * (1 - Math.pow(1 - st, 3)); sx *= 1.14; sy *= 0.92; }
      else { st = 1 - (u - 0.5) / 0.5; L = 0.62 * st * st; sx *= 1 + 0.12 * st; sy *= 1 - 0.06 * st; }
      ox += Math.cos(e.atkA || 0) * r * L; oy += Math.sin(e.atkA || 0) * r * L * 0.7; on = true;
      rot += (Math.cos(e.atkA || 0) < 0 ? -1 : 1) * L * 0.55; // inclina o corpo para o lado do golpe
    }
    return on ? { ox: ox, oy: oy, sx: sx, sy: sy, rot: rot } : null;
  }
  function bossLeft(e) { return e.face !== undefined && (e.st & 2) === 0 ? Math.cos(e.face) < -0.2 : e.flip; }
  function bossEntity() { var b = null; S.mobs.forEach(function (m) { if (MOBDEF[MOB_KEYS[m.ki]].boss) b = m; }); return b; }
  // Em que parte do ataque o dragão está: w = quanto do aviso já passou (0..1); r = quanto tempo faz que o golpe saiu (0..1).
  // Vem dos avisos (teles) e dos efeitos (fxs) que o servidor mandou, então o corpo acompanha exatamente o que o jogador vê no chão.
  function bossAnim(e) {
    var i, w, f, best = null;
    for (i = 0; i < fxs.length; i++) {
      f = fxs[i];
      if (f.age < 0 || Math.hypot(f.x - e.rx, f.y - e.ry) > 160) continue;
      if (f.kind === 'd_breath') best = { k: 'b', r: Math.min(1, f.age / 0.7) };
      else if (f.kind === 'd_slam' && f.size < 260) best = { k: 's', r: Math.min(1, f.age / 0.6) };
      else if (f.kind === 'd_claw') best = best || { k: 'c', r: Math.min(1, f.age / 0.36) };
    }
    if (best) return best;
    for (i = 0; i < teles.length; i++) {
      w = teles[i];
      if (w.age < w.t && Math.hypot(w.x - e.rx, w.y - e.ry) < 160) return { k: w.kind === 0 ? 'b' : 's', w: Math.min(1, w.age / w.t) };
    }
    return null;
  }
  function drawMobEntity(g, e) {
    var key = MOB_KEYS[e.ki], def = MOBDEF[key];
    if (def.boss) { // dragão: vira para quem ele persegue; mostra nome e vida em cima
      var left = bossLeft(e), an = (e.st & 2) === 0 ? bossAnim(e) : null;
      A.drawMob(g, key, e.rx, e.ry, def.r, T, left, 0, an && an.k === 'b' && an.r != null ? e.st | 4 : e.st, an); // ao soltar o sopro a boca continua aberta
      // a barra fica acima da cabeça: o desenho muda de altura conforme a pose (dormindo é baixo, rugindo é alto)
      var pic = A.has('mob_dragao'), napping = (e.st & 2) !== 0 && A.has('mob_dragao_dormindo'), roaring = (e.st & (4 | 16)) !== 0 && A.has('mob_dragao_furia');
      var by = e.ry - def.r * (!pic ? 2.3 : napping ? 2.0 : roaring ? 3.4 : 2.9);
      hpBar(g, e.rx, by, 190, e.hp / e.mhp, (e.st & 16) ? '#ff4a2a' : '#e0803a');
      label(g, def.name + ((e.st & 2) ? ' (dormindo)' : ''), e.rx, by - 8, '#ffd9a0', 15);
      return;
    }
    var mo = mobAnim(e, def.r, key);
    if (mo) { g.save(); g.translate(e.rx + mo.ox, e.ry + mo.oy + def.r * 0.7); g.rotate(mo.rot); g.scale(mo.sx, mo.sy); g.translate(0, -def.r * 0.7); A.drawMob(g, key, 0, 0, def.r, T + e.id, e.flip, e.flash); g.restore(); }
    else A.drawMob(g, key, e.rx, e.ry, def.r, T + e.id, e.flip, e.flash);
    if (e.hp < e.mhp) hpBar(g, e.rx, e.ry - def.r * 1.25, Math.max(26, def.r * 1.8), e.hp / e.mhp, '#cf5a4a');
    if (e.st) { g.save(); g.fillStyle = '#ffd36b'; g.font = '700 14px sans-serif'; g.textAlign = 'center'; g.fillText('✦', e.rx, e.ry - def.r * 1.45); g.restore(); }
  }

  function render() {
    if (!S.joined || !S.pos) return;
    var g = ctx, sx = dpr * zoom;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#050a07'; g.fillRect(0, 0, canvas.width, canvas.height);
    var shx = shake ? (Math.random() - 0.5) * shake : 0, shy = shake ? (Math.random() - 0.5) * shake : 0;
    g.setTransform(sx, 0, 0, sx, dpr * (vw / 2 + shx) - cam.x * sx, dpr * (vh / 2 + shy) - cam.y * sx);
    var hw = vw / 2 / zoom + 60, hh = vh / 2 / zoom + 60;
    var x0 = cam.x - hw, y0 = cam.y - hh, x1 = cam.x + hw, y1 = cam.y + hh;
    // chão
    A.drawMap(g, x0, y0, x1, y1);
    teles.forEach(function (w) { FX.drawTele(g, w, T); });
    // vaga-lumes
    g.save(); g.globalCompositeOperation = 'lighter';
    flies.forEach(function (f) {
      if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) return;
      var a = 0.35 + 0.35 * Math.sin(T * 2 + f.p * 5), gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 9);
      gr.addColorStop(0, 'rgba(230,255,160,' + a + ')'); gr.addColorStop(1, 'rgba(230,255,160,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(f.x, f.y, 9, 0, TAU); g.fill();
    });
    g.restore();
    // poças de slimes derrotados e monstros morrendo (por baixo dos vivos)
    splats.forEach(function (sp) {
      var u = sp.age / sp.dur;
      A.drawSlime(g, sp.x, sp.y, sp.r, sp.color, T, true, false, { pose: 'hurt', sx: 1.25 + 0.15 * u, sy: Math.max(0.12, 0.85 - 0.7 * u), alpha: Math.max(0, 1 - Math.pow(u, 1.6)), flash: sp.age < 0.1 ? 1 : 0 });
    });
    corpses.forEach(function (c) {
      var def = MOBDEF[MOB_KEYS[c.ki]], key = MOB_KEYS[c.ki], u = c.age / c.dur;
      g.save();
      if (c.boss) { // o dragão se apaga em brasa e afunda
        var left = c.face !== undefined ? Math.cos(c.face) < -0.2 : c.flip;
        g.globalAlpha = Math.max(0, 1 - Math.pow(Math.max(0, (u - 0.35) / 0.65), 1.4));
        g.translate(c.x + (u < 0.5 ? (Math.random() - 0.5) * 6 : 0), c.y + def.r * 0.9 * u);
        A.drawMob(g, key, 0, 0, def.r, T, left, 0.18 * (1 - u) + 0.1 * Math.abs(Math.sin(T * 22)), 0);
      } else {
        g.globalAlpha = Math.max(0, 1 - u * u);
        g.translate(c.x, c.y + def.r * 0.7); g.scale(1 + 0.5 * u, Math.max(0.06, 1 - 0.94 * Math.pow(u, 1.4))); g.translate(0, -def.r * 0.7);
        A.drawMob(g, key, 0, 0, def.r, T, c.flip, 0.16 * (1 - u));
      }
      g.restore();
    });
    // entidades ordenadas por profundidade
    var list = [];
    S.mobs.forEach(function (e) { list.push([e.ry, 0, e]); });
    S.players.forEach(function (e) { list.push([e.id === S.id ? S.pos.y : e.ry, 1, e]); });
    list.sort(function (a, b) { return a[0] - b[0]; });
    // onda de fogo da pancada do dragão: fica no chão, por baixo de quem está em cima dela (inclusive do dragão)
    fxs.forEach(function (f) { if (f.kind === 'd_slam') FX.drawFx(g, f, T); });
    list.forEach(function (it) { if (it[1]) drawPlayer(g, it[2]); else drawMobEntity(g, it[2]); });
    // mira por cursor
    if (cfg.aim === 'cursor' && mouse.has && !document.body.classList.contains('touch')) {
      var ms = { x: cam.x + (mouse.x - vw / 2) / zoom, y: cam.y + (mouse.y - vh / 2) / zoom };
      g.save(); g.strokeStyle = 'rgba(255,230,160,.5)'; g.lineWidth = 1.5; g.setLineDash([6, 6]);
      g.beginPath(); g.moveTo(S.pos.x, S.pos.y); g.lineTo(ms.x, ms.y); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(ms.x, ms.y, 8, 0, TAU); g.stroke(); g.restore();
    }
    fxs.forEach(function (f) { if (f.kind !== 'd_slam') FX.drawFx(g, f, T); });
    S.projs.forEach(function (e) { FX.drawProj(g, e, T); });
    // partículas
    parts.forEach(function (p) { g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.sz * (0.5 + p.life / p.max * 0.5), 0, TAU); g.fill(); });
    g.globalAlpha = 1;
    // números de dano: aparecem grandes, sobem rápido e desaceleram; golpes fortes balançam e ganham cor
    floats.forEach(function (f) {
      var u = f.age / 0.9, rise = 50 * (1 - Math.pow(1 - Math.min(1, f.age / 0.7), 2)), a = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      var pop = f.age < 0.12 ? 1 + 0.7 * (1 - f.age / 0.12) : 1, xx = f.x + (f.dx || 0) + (f.big && f.age < 0.25 ? Math.sin(f.age * 60) * 2.5 * (1 - f.age / 0.25) : 0);
      var col = f.f === 1 ? (f.big ? '#ff3b30' : '#ff6b5e') : f.f === 2 ? '#ffd36b' : f.f === 3 ? '#7dff9a' : (f.big ? '#ffd36b' : '#ffffff');
      var txt = f.f === 2 ? '+' + f.v + ' XP' : f.f === 3 ? '+' + f.v : String(f.v) + (f.big && f.f < 2 ? '!' : '');
      g.globalAlpha = Math.max(0, a);
      label(g, txt, xx, f.y - rise, col, (f.f === 2 ? 17 : 15 + Math.min(10, f.v / 25) + (f.big ? 5 : 0)) * pop);
    });
    g.globalAlpha = 1;
    drawMini();
    drawArrows(g);
  }

  var ZONE_TINT = ['#2a3f2a', '#2e4a2b', '#1f3223', '#32331d', '#27311f', '#2a2433'];
  function drawMini() {
    var mc = $('mini'), g = mc.getContext('2d'), w = mc.width, h = mc.height, i;
    g.clearRect(0, 0, w, h);
    // anéis de zona: do cogumelo (fora) até a toca do dragão (centro)
    GD.ZONES.forEach(function (z, k) {
      g.fillStyle = ZONE_TINT[k] || '#2a3f2a'; g.globalAlpha = 0.55;
      g.beginPath(); g.ellipse(w / 2, h / 2, w * W.rx * z.max / W.w, h * W.ry * z.max / W.h, 0, 0, TAU); g.fill();
    });
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(181,209,138,.45)'; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(w / 2, h / 2, w * W.rx * W.wall / W.w, h * W.ry * W.wall / W.h, 0, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(90,60,50,.65)'; g.beginPath(); g.ellipse(w / 2, h / 2, w * LAIR / W.w, h * LAIR / W.h, 0, 0, TAU); g.fill();
    S.mobs.forEach(function (e) { if (MOBDEF[MOB_KEYS[e.ki]].boss) return; g.fillStyle = 'rgba(210,140,90,.8)'; g.fillRect(e.rx / W.w * w - 1, e.ry / W.h * h - 1, 2, 2); });
    // dragão: sempre visível no mapa (dorme = laranja fraco, luta = vermelho pulsando, morto = cinza)
    var B = S.boss;
    if (B) {
      var bx = B[0] / W.w * w, by = B[1] / W.h * h, st = B[4], pulse = 0.5 + 0.5 * Math.sin(T * 8);
      g.fillStyle = st === 3 ? '#777' : st === 1 ? '#ff4a2a' : '#ffb347';
      g.beginPath(); g.arc(bx, by, st === 1 ? 4 + pulse * 1.5 : 3.4, 0, TAU); g.fill();
      g.strokeStyle = st === 3 ? '#555' : '#fff3c4'; g.lineWidth = 1; g.stroke();
    }
    S.players.forEach(function (e) {
      var me = e.id === S.id, x = (me ? S.pos.x : e.rx) / W.w * w, y = (me ? S.pos.y : e.ry) / W.h * h;
      g.fillStyle = me ? '#b5d18a' : (e.f & 8) ? '#ffb347' : '#e0574a'; g.beginPath(); g.arc(x, y, me ? 3.2 : (e.f & 8) ? 3.2 : 2.4, 0, TAU); g.fill();
      if (me) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); }
    });
  }

  /* ---- chefe, zona e setas na borda da tela ---- */
  function updateBossHud() {
    var B = S.boss, bar = $('bossBar');
    var show = !!B && (B[4] === 1 || B[4] === 2) && S.pos && Math.hypot(B[0] - S.pos.x, B[1] - S.pos.y) < 1800;
    bar.hidden = !show;
    if (!show) return;
    var f = Math.max(0, Math.min(1, B[2] / B[3]));
    $('bossFill').style.width = (f * 100) + '%';
    bar.classList.toggle('rage', f < GD.BOSS.rage && B[4] === 1);
    $('bossText').textContent = B[4] === 2 ? 'Voltando para casa e se curando' : Math.ceil(f * 100) + '%';
  }
  var zoneKey = '', zoneAcc = 0;
  function updateZoneChip(dt) {
    zoneAcc += dt; if (zoneAcc < 0.25 || !S.pos || !S.me) return; zoneAcc = 0;
    var nd = Math.hypot((S.pos.x - W.cx) / W.rx, (S.pos.y - W.cy) / W.ry), key = null, name, lo, hi;
    if (Math.hypot(S.pos.x - W.cx, S.pos.y - W.cy) < LAIR) { name = 'Toca do Dragão'; lo = hi = 20; key = 'toca'; }
    else for (var i = 0; i < GD.ZONES.length; i++) { var z = GD.ZONES[i]; if (nd >= z.min && nd < z.max) { var zi = ZONE_INFO[z.mob]; name = zi[0]; lo = zi[1]; hi = zi[2]; key = z.mob; break; } }
    SND.zone(key);
    var lv = S.me.lv, risky = key && lv < lo, newbie = lv <= GD.NEWBIE_LEVEL;
    var sig = (key || '-') + (risky ? 'r' : '') + (newbie ? 'n' : '');
    if (sig === zoneKey) return; zoneKey = sig;
    var chip = $('zoneChip');
    chip.hidden = !key;
    if (!key) return;
    chip.classList.toggle('risky', !!risky);
    chip.innerHTML = '<b>' + name + '</b><span>' + (lo === hi ? 'Nível ' + lo : 'Níveis ' + lo + ' a ' + hi) + (risky ? ' · perigoso para você' : '') + '</span>' +
      (newbie ? '<em>Jogadores não podem te atacar até o nível ' + (GD.NEWBIE_LEVEL + 1) + '.</em>' : '');
  }
  // Setas nas bordas da tela apontando para o dragão (a partir do nível 15) e para o jogador com a coroa.
  function drawArrows(g) {
    if (!S.pos || !S.me) return;
    var list = [];
    if (S.boss && S.boss[4] !== 3 && (S.me.lv >= 15 || S.boss[4] === 1)) list.push([S.boss[0], S.boss[1], '#ffb347', 'Dragão']);
    if (!(S.myF & 8)) S.players.forEach(function (e) { if ((e.f & 8) && e.id !== S.id) list.push([e.rx, e.ry, '#ffd23d', 'Coroa']); });
    if (!list.length) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var padX = 46, padY = 56, cx = vw / 2, cy = vh / 2;
    list.forEach(function (t) {
      var sp = toScreen(t[0], t[1]);
      if (sp.x > padX && sp.x < vw - padX && sp.y > padY && sp.y < vh - padY) return;
      var dx = sp.x - cx, dy = sp.y - cy, k = Math.min((cx - padX) / Math.max(1, Math.abs(dx)), (cy - padY) / Math.max(1, Math.abs(dy)));
      var ax = cx + dx * k, ay = cy + dy * k, ang = Math.atan2(dy, dx), dist = Math.round(Math.hypot(t[0] - S.pos.x, t[1] - S.pos.y) / 50);
      g.save(); g.translate(ax, ay); g.globalAlpha = 0.9;
      g.rotate(ang); g.fillStyle = t[2]; g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 2; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(13, 0); g.lineTo(-7, -9); g.lineTo(-3, 0); g.lineTo(-7, 9); g.closePath(); g.stroke(); g.fill();
      g.restore();
      label(g, t[3] + ' ' + dist + ' m', ax - Math.cos(ang) * 4, ay - Math.sin(ang) * 22 + (Math.sin(ang) > 0 ? -2 : 12), t[2], 12);
    });
  }

  var lastTs = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016); lastTs = ts; T += dt;
    if (S.joined) { update(dt); updateZoneChip(dt); render(); }
    requestAnimationFrame(frame);
  }

  /* ======================= início ======================= */
  resize();
  buildTitle();
  A.load().then(function (names) {
    if (names.length) console.log('Imagens carregadas:', names.join(', '));
    if (S.me) { updateHud(); if (!$('invPanel').hidden) renderInv(); }
  });
  requestAnimationFrame(frame);
  window.__slime = { S: S, cfg: cfg };
})();
