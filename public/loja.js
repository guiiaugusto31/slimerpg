// Loja de skins (só visuais): pacotes com Pix, "Minhas skins" e escolha do que está equipado.
// Nada aqui dá vantagem em combate. A liberação é manual: a pessoa paga o Pix, manda o comprovante e o e-mail da conta,
// e o dono do jogo libera pelo servidor (POST /admin/skin). O servidor é quem confere o que a conta possui.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var GD = module.exports, A = window.ART;
  var SLOT_NAMES = { head: 'Chapéu', kill: 'Efeito ao abater jogador' };
  var st = { loja: null, lojaErr: '', own: [], eq: {}, tab: 'loja', open: null, busy: false, msg: '', loaded: false };
  var getColor = function () { return '#5fd35f'; };
  var prevs = []; // canvases de pré-visualização desenhados enquanto a janela está aberta
  var raf = 0;

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function token() { return window.Conta ? window.Conta.token() : ''; }
  function api(method, url, body) {
    var h = { 'Content-Type': 'application/json' }, t = token();
    if (t) h.Authorization = 'Bearer ' + t;
    return fetch(url, { method: method, headers: h, body: method === 'POST' ? JSON.stringify(body || {}) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); });
  }
  var money = function (n) { return 'R$ ' + Number(n).toFixed(2).replace('.', ','); };
  function eqClean(eq) { return GD.skinClean(eq, null); }

  /* ---- dados ---- */
  function loadLoja() {
    if (location.protocol === 'file:') { st.lojaErr = 'A loja só funciona no jogo hospedado (aqui é a versão de teste).'; render(); return Promise.resolve(); }
    return api('GET', '/api/loja').then(function (r) {
      if (r.ok && r.body && r.body.enabled) { st.loja = r.body; st.lojaErr = ''; } else st.lojaErr = 'A loja não está disponível neste servidor.';
      render();
    }).catch(function () { st.lojaErr = 'A loja não está disponível agora. Tente de novo em instantes.'; render(); });
  }
  function loadMine() {
    if (!token() || location.protocol === 'file:') { st.own = []; st.eq = {}; st.loaded = true; render(); return Promise.resolve(); }
    return api('GET', '/api/skins').then(function (r) {
      if (r.ok) { st.own = r.body.own || []; st.eq = eqClean(r.body.eq); }
      else if (r.status === 401 && window.Conta) window.Conta.expired();
      st.loaded = true; render();
    }).catch(function () { st.loaded = true; render(); });
  }
  function setMine(m) { st.own = m.own || []; st.eq = eqClean(m.eq); st.loaded = true; render(); }

  /* ---- pré-visualização ---- */
  function drawPrev(c, eq, t, r) {
    var g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    var gr = g.createRadialGradient(w / 2, h * 0.62, 4, w / 2, h * 0.62, w * 0.55); gr.addColorStop(0, 'rgba(110,120,105,.5)'); gr.addColorStop(1, 'rgba(110,120,105,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (!A || !A.drawSlime) return;
    A.drawSlime(g, w / 2, h * 0.58 + Math.sin(t * 2) * 1.5, r, getColor(), t, false, (t % 4) < 0.12, { cloth: 'vital_0', skin: eq });
  }
  function frame(ts) {
    var any = false;
    prevs = prevs.filter(function (p) { return document.body.contains(p.c); });
    prevs.forEach(function (p) { any = true; drawPrev(p.c, p.eq, ts / 1000, p.r); });
    raf = (any && !$('shopPanel').hidden) ? requestAnimationFrame(frame) : 0;
  }
  function prevCanvas(eq, w, h, r) {
    var c = el('canvas', { width: w, height: h, class: 'shop-prev', 'aria-hidden': 'true' });
    prevs.push({ c: c, eq: eq, r: r });
    drawPrev(c, eq, 0, r);
    return c;
  }
  function tombIcon(gold, w, h) { // foto da lápide (o efeito só aparece no jogo, quando você abate alguém)
    var c = el('canvas', { width: w, height: h, class: 'shop-prev', 'aria-hidden': 'true' }), g = c.getContext('2d'), cx = w / 2, by = h - 8, tw = 15, th = h - 18;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(cx, by, tw + 6, 5, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(cx - tw, by); g.lineTo(cx - tw, by - th + tw); g.arc(cx, by - th + tw, tw, Math.PI, 0); g.lineTo(cx + tw, by); g.closePath();
    var gr = g.createLinearGradient(cx - tw, 0, cx + tw, 0);
    if (gold) { gr.addColorStop(0, '#a8740d'); gr.addColorStop(0.35, '#ffe483'); gr.addColorStop(1, '#c58b12'); } else { gr.addColorStop(0, '#6d7078'); gr.addColorStop(0.4, '#b8bcc4'); gr.addColorStop(1, '#7b7f88'); }
    g.fillStyle = gr; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(22,14,10,.9)'; g.stroke();
    g.strokeStyle = gold ? '#7a5208' : '#4a4d55'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, by - th + tw - 8); g.lineTo(cx, by - th + tw + 10); g.moveTo(cx - 6, by - th + tw - 1); g.lineTo(cx + 6, by - th + tw - 1); g.stroke();
    return c;
  }
  function packEq(pack) { // o que mostrar na foto do pacote
    var eq = GD.skinEmpty();
    eq.head = pack.skins[pack.skins.length - 1]; // o chapéu do pacote que mais chama atenção (no "Tudo", o último da lista)
    return eq;
  }

  /* ---- Pix ---- */
  function qrCanvas(text) {
    var q = window.qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), cell = 5, quiet = 4, size = (n + quiet * 2) * cell, c = el('canvas', { width: size, height: size, class: 'shop-qr', role: 'img', 'aria-label': 'QR code do Pix' }), g = c.getContext('2d'), x, y;
    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (q.isDark(y, x)) g.fillRect((x + quiet) * cell, (y + quiet) * cell, cell, cell);
    return c;
  }
  function copy(text, btn) {
    var done = function () { var o = btn.textContent; btn.textContent = 'Copiado!'; setTimeout(function () { btn.textContent = o; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    var t = el('textarea', { readonly: 'readonly' }); t.value = text; t.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* o texto continua visível para copiar à mão */ }
    document.body.removeChild(t);
  }
  function skinNames(pack) { return pack.skins.map(function (id) { return GD.SKINS[id].name; }).join(', '); }

  function packCard(pack) {
    var l = st.loja, isOpen = st.open === pack.id, owned = pack.skins.every(function (id) { return st.own.indexOf(id) >= 0; });
    var card = el('article', { class: 'shop-card' + (owned ? ' owned' : '') });
    card.appendChild(prevCanvas(packEq(pack), 120, 96, 30));
    var info = el('div', { class: 'shop-info' }, [
      el('h3', { text: pack.name }),
      el('p', { class: 'shop-price', text: owned ? 'Você já tem' : money(pack.price) }),
      el('p', { class: 'hint', text: pack.note || skinNames(pack) })
    ]);
    card.appendChild(info);
    if (!owned && pack.code) {
      var b = el('button', { type: 'button', class: 'shop-pay', 'aria-expanded': String(isOpen), text: isOpen ? 'Fechar' : 'Pagar com Pix' });
      b.addEventListener('click', function () { st.open = isOpen ? null : pack.id; render(); });
      info.appendChild(b);
      if (isOpen) {
        var pay = el('div', { class: 'shop-pix' });
        try { pay.appendChild(qrCanvas(pack.code)); } catch (e) { pay.appendChild(el('p', { class: 'hint', text: 'Não consegui desenhar o QR. Use o Pix copia e cola abaixo.' })); }
        pay.appendChild(el('p', { class: 'hint', text: 'Valor: ' + money(pack.price) + '. Abra o app do seu banco, escolha Pix e leia o QR ou use o copia e cola.' }));
        var ta = el('textarea', { readonly: 'readonly', rows: '4', 'aria-label': 'Pix copia e cola' }); ta.value = pack.code;
        ta.addEventListener('focus', function () { ta.select(); });
        var cb = el('button', { type: 'button', text: 'Copiar Pix copia e cola' });
        cb.addEventListener('click', function () { copy(pack.code, cb); });
        pay.appendChild(ta); pay.appendChild(cb);
        card.appendChild(pay);
      }
    }
    return card;
  }

  // Prêmios do ranking semanal: quem fechou a semana passada em 1º resgata a skin aqui (o servidor confere o resgate)
  function loadPrizes() {
    if (location.protocol === 'file:') return Promise.resolve();
    return api('GET', '/api/ranking').then(function (r) { if (r.ok && r.body && r.body.prizes) { st.prizes = r.body.prizes; render(); } }).catch(function () {});
  }
  function claim(btn) {
    if (st.busy) return; st.busy = true; st.msg = ''; btn.disabled = true;
    api('POST', '/api/ranking/claim', {}).then(function (r) {
      st.busy = false;
      if (r.ok) { st.own = r.body.own || st.own; st.msg = r.body.granted && r.body.granted.length ? 'Prêmio resgatado! Equipe em "Minhas skins".' : 'Não há prêmio para resgatar agora.'; }
      else { st.msg = (r.body && r.body.error) || 'Não consegui resgatar agora.'; if (r.status === 401 && window.Conta) window.Conta.expired(); }
      render();
    }).catch(function () { st.busy = false; st.msg = 'Sem conexão com o servidor.'; render(); });
  }
  function prizeSection(body) {
    var P = st.prizes, box = el('section', { class: 'shop-prizes' }, [el('h3', { text: 'Prêmios da semana' }),
      el('p', { class: 'hint', text: 'Quem fecha a semana em 1º lugar de um ranking resgata a skin aqui, na semana seguinte (segunda 00:00, horário de Brasília). Depois de resgatada, é sua para sempre.' })]);
    if (!P) { box.appendChild(el('p', { class: 'hint', text: 'Carregando…' })); body.appendChild(box); return; }
    P.winners.forEach(function (w) {
      var pr = GD.WEEK_PRIZES[w.board], sk = GD.SKINS[pr.skin], has = st.own.indexOf(pr.skin) >= 0;
      var row = el('div', { class: 'shop-prize' }, [sk.slot === 'head' ? prevCanvas({ head: pr.skin, kill: null }, 74, 56, 20) : tombIcon(pr.skin === 'lapide_ouro', 74, 56),
        el('div', { class: 'shop-prize-t' }, [el('b', { text: sk.name }), el('small', { text: pr.title }),
          el('small', { text: w.name ? 'Vencedor da semana passada: ' + w.name + (w.me ? ' (você)' : '') : 'Semana passada: ninguém pontuou' })])]);
      if (w.me) {
        if (has) row.appendChild(el('span', { class: 'shop-got', text: 'Resgatado' }));
        else { var b = el('button', { type: 'button', class: 'primary', text: 'Resgatar' }); b.addEventListener('click', function () { claim(b); }); row.appendChild(b); }
      }
      box.appendChild(row);
    });
    body.appendChild(box);
  }

  function lojaTab(body) {
    if (st.msg) body.appendChild(el('p', { class: 'shop-note', role: 'status', text: st.msg }));
    prizeSection(body);
    var l = st.loja;
    if (!l) { body.appendChild(el('p', { class: 'hint', text: st.lojaErr || 'Carregando a loja…' })); return; }
    body.appendChild(el('p', { class: 'shop-note', text: 'Só visuais: nenhuma skin dá vantagem em combate.' }));
    body.appendChild(el('p', { class: 'shop-warn', text: token() ? 'As skins vão para a conta ligada a este login.' : 'Para comprar é preciso uma conta por e-mail: o progresso salvo só no navegador pode ser editado, então não vale para skins.' }));
    if (!token() && window.Conta && window.Conta.enabled && window.Conta.enabled()) {
      var lb = el('button', { type: 'button', class: 'shop-link', text: 'Entrar ou criar conta' });
      lb.addEventListener('click', function () { window.Conta.openLogin(); });
      body.appendChild(lb);
    }
    l.packs.forEach(function (p) { body.appendChild(packCard(p)); });
    body.appendChild(el('p', { class: 'shop-how', text: 'Pague o Pix e envie o comprovante e o e-mail da sua conta para ' + l.contato + '. A liberação é manual.' }));
    if (l.pixChave) body.appendChild(el('p', { class: 'hint', text: 'Chave Pix: ' + l.pixChave }));
  }

  function minhasTab(body) {
    if (!token()) {
      body.appendChild(el('p', { class: 'shop-warn', text: 'Entre numa conta por e-mail para guardar e usar skins.' }));
      if (window.Conta && window.Conta.enabled && window.Conta.enabled()) {
        var lb = el('button', { type: 'button', class: 'shop-link', text: 'Entrar ou criar conta' });
        lb.addEventListener('click', function () { window.Conta.openLogin(); });
        body.appendChild(lb);
      }
      return;
    }
    body.appendChild(el('div', { class: 'shop-me' }, [prevCanvas(st.eq, 200, 150, 44)]));
    if (st.msg) body.appendChild(el('p', { class: 'shop-err', role: 'alert', text: st.msg }));
    if (!st.own.length) body.appendChild(el('p', { class: 'hint', text: 'Você ainda não tem skins. Escolha um pacote na aba Loja.' }));
    GD.SKIN_SLOTS.forEach(function (slot) {
      var ids = Object.keys(GD.SKINS).filter(function (id) { return GD.SKINS[id].slot === slot; });
      var row = el('div', { class: 'shop-slot' }, [el('h4', { text: SLOT_NAMES[slot] })]);
      var list = el('div', { class: 'shop-opts', role: 'radiogroup', 'aria-label': SLOT_NAMES[slot] });
      function opt(id, label) {
        var has = !id || st.own.indexOf(id) >= 0, on = (st.eq[slot] || null) === (id || null);
        var b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(on), class: has ? '' : 'locked', text: label + (has ? '' : (id && GD.SKINS[id].prize ? ' (prêmio semanal)' : ' (bloqueada)')) });
        b.addEventListener('click', function () { if (!has) { st.tab = 'loja'; render(); return; } equip(slot, id); });
        list.appendChild(b);
      }
      opt(null, 'Nenhum');
      ids.forEach(function (id) { opt(id, GD.SKINS[id].name); });
      row.appendChild(list); body.appendChild(row);
    });
  }
  function equip(slot, id) {
    if (st.busy) return;
    var eq = Object.assign({}, st.eq); eq[slot] = id; st.busy = true; st.msg = '';
    api('POST', '/api/skins/equip', { eq: eq }).then(function (r) {
      st.busy = false;
      if (r.ok) setMine(r.body); else { st.msg = (r.body && r.body.error) || 'Não consegui trocar agora.'; render(); }
    }).catch(function () { st.busy = false; st.msg = 'Sem conexão com o servidor.'; render(); });
  }

  function render() {
    var p = $('shopPanel'); if (!p) return;
    var body = $('shopBody'); if (!body) return;
    Array.prototype.forEach.call(document.querySelectorAll('#shopTabs [data-tab]'), function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === st.tab)); });
    prevs = []; body.textContent = '';
    if (st.tab === 'loja') lojaTab(body); else minhasTab(body);
    if (!p.hidden && !raf) raf = requestAnimationFrame(frame);
  }

  function show(tab) {
    if (tab) st.tab = tab;
    $('shopPanel').hidden = false; st.msg = '';
    render(); loadLoja(); loadMine(); loadPrizes();
  }

  Array.prototype.forEach.call(document.querySelectorAll('#shopTabs [data-tab]'), function (b) {
    b.addEventListener('click', function () { st.tab = b.dataset.tab; st.msg = ''; render(); });
  });
  window.addEventListener('slimeconta', function () { st.own = []; st.eq = {}; st.loaded = false; render(); if (token()) loadMine(); });
  // Sem servidor com loja (versão de teste), os botões aparecem desativados.
  function availability(ok) {
    ['shopOpenTitle', 'btnShop'].forEach(function (id) {
      var b = $(id); if (!b) return;
      b.disabled = !ok; b.title = ok ? 'Loja de skins' : 'A loja não está disponível na versão de teste';
    });
  }
  availability(false);
  if (location.protocol !== 'file:') {
    fetch('/api/loja', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { availability(!!(j && j.enabled)); }).catch(function () { availability(false); });
    if (token()) loadMine();
  }

  window.Loja = {
    init: function (o) { if (o && o.color) getColor = o.color; },
    show: show, set: setMine,
    equipped: function () { var e = eqClean(st.eq); return e.head || e.kill ? e : null; },
    refresh: loadMine
  };
})();
