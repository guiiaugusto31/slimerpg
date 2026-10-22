// Parte da "versão de teste": faz o servidor real (server.js) rodar dentro da própria página.
// Um WebSocket de mentira liga o cliente ao servidor, e alguns slimes-robô entram na sala para dar companhia.
// Não é usado no jogo online. Quem monta tudo é tools/gerar-preview.js.
(function () {
  'use strict';
  var wss = null;
  var botsStarted = false;
  var TAU = Math.PI * 2;

  /* ---------- servidor de mentira (o que o server.js espera de 'ws') ---------- */
  function ServerSock(client) { this.client = client; this.readyState = 1; this._h = {}; this.p = null; this.isAlive = true; this.rate = 0; }
  ServerSock.prototype.on = function (ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; };
  ServerSock.prototype._emit = function (ev, a) { (this._h[ev] || []).slice().forEach(function (f) { f(a); }); };
  ServerSock.prototype.send = function (d) {
    var c = this.client;
    if (this.readyState !== 1) return;
    queueMicrotask(function () { if (c.readyState === 1 && c.onmessage) c.onmessage({ data: d }); });
  };
  ServerSock.prototype.ping = function () { var s = this; queueMicrotask(function () { s._emit('pong'); }); };
  ServerSock.prototype.close = ServerSock.prototype.terminate = function () {
    if (this.readyState === 3) return;
    this.readyState = 3;
    if (wss) wss.clients.delete(this);
    this._emit('close');
    var c = this.client;
    queueMicrotask(function () { if (c.readyState !== 3) { c.readyState = 3; if (c.onclose) c.onclose({}); } });
  };

  function WSS() { wss = this; this.clients = new Set(); this._conn = []; }
  WSS.prototype.on = function (ev, fn) { if (ev === 'connection') this._conn.push(fn); };
  WSS.prototype._add = function (s) { this.clients.add(s); this._conn.forEach(function (f) { f(s); }); };

  /* ---------- WebSocket de mentira (o que o cliente usa) ---------- */
  function FakeWS(url, isBot) {
    var self = this, s = new ServerSock(self);
    self.readyState = 0; self.onopen = self.onmessage = self.onclose = self.onerror = null; self._s = s;
    setTimeout(function () {
      if (!wss) { self.readyState = 3; if (self.onclose) self.onclose({}); return; }
      self.readyState = 1; wss._add(s);
      if (self.onopen) self.onopen({});
      if (!isBot && !botsStarted) { botsStarted = true; setTimeout(startBots, 1200); }
    }, 20);
  }
  FakeWS.prototype.send = function (d) {
    var s = this._s;
    if (this.readyState !== 1) return;
    queueMicrotask(function () { if (s.readyState === 1) s._emit('message', d); });
  };
  FakeWS.prototype.close = function () {
    if (this.readyState === 3) return;
    this.readyState = 3;
    var s = this._s;
    queueMicrotask(function () { s.close(); });
    if (this.onclose) this.onclose({});
  };

  /* ---------- slimes-robô ---------- */
  var BOT_NAMES = ['Bot Pudim', 'Bot Gosma', 'Bot Limo', 'Bot Musgo', 'Bot Geleia', 'Bot Orvalho', 'Bot Broto', 'Bot Gelatina'];
  var BOT_COLORS = ['#ff6cc0', '#4aa3ff', '#ffd23d', '#c06cff', '#ff9a3d', '#3fbf8f', '#ff5a5a', '#e8e8e8'];

  function startBots() {
    var n = window.__SLIME_BOTS == null ? 5 : window.__SLIME_BOTS;
    for (var i = 0; i < n; i++) (function (i) { setTimeout(function () { makeBot(i); }, 350 * i); })(i);
  }

  function makeBot(idx) {
    var c = new FakeWS('bot', true), W = window.module.exports.WORLD;
    var meId = null, self = null, mobs = [], others = [], goal = null, goalT = 0, timer = null;
    c.onopen = function () {
      c.send(JSON.stringify({ t: 'join', name: BOT_NAMES[idx % BOT_NAMES.length], color: BOT_COLORS[idx % BOT_COLORS.length], save: null }));
      timer = setInterval(think, 110);
    };
    c.onclose = function () { clearInterval(timer); };
    c.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.t === 'init') meId = m.id;
      else if (m.t === 's') {
        mobs = m.mb; self = null; others = [];
        for (var i = 0; i < m.p.length; i++) { if (m.p[i].i === meId) self = m.p[i]; else others.push(m.p[i]); }
      } else if (m.t === 'death') {
        self = null;
        setTimeout(function () { c.send(JSON.stringify({ t: 'respawn' })); }, 2500);
      }
    };
    function think() {
      if (c.readyState !== 1 || meId == null || !self) return;
      var tx = null, ty = null, mx = 0, my = 0, now = Date.now();
      var maxKi = Math.min(5, Math.floor(self.l / 3) + 1); // robôs novatos ficam nos monstros fracos
      var best = null, bd = 1e12;
      for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (m[1] > maxKi) continue;
        var dx = m[2] - self.x, dy = m[3] - self.y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = m; }
      }
      // PvP ligado: os robôs de número par partem para cima de qualquer jogador que chegue a menos de 520 de distância
      var prey = null, pd2 = 520 * 520;
      if (idx % 2 === 0 && self.h / self.m > 0.5) {
        for (var k = 0; k < others.length; k++) {
          var o = others[k], ox = o.x - self.x, oy = o.y - self.y;
          if ((o.f & 1) || ox * ox + oy * oy > pd2) continue; // ignora quem acabou de nascer (imune)
          pd2 = ox * ox + oy * oy; prey = o;
        }
      }
      if (prey) { if (pd2 > 45 * 45) { tx = prey.x; ty = prey.y; } }
      else if (best && self.h / self.m < 0.35 && bd < 220 * 220) { tx = self.x + (self.x - best[2]); ty = self.y + (self.y - best[3]); }
      else if (best) { if (bd > 60 * 60) { tx = best[2]; ty = best[3]; } }
      else {
        var gx = goal ? goal.x - self.x : 0, gy = goal ? goal.y - self.y : 0;
        if (!goal || now > goalT || gx * gx + gy * gy < 60 * 60) {
          var a = Math.random() * TAU, nd = 0.55 + Math.random() * 0.35;
          goal = { x: W.cx + Math.cos(a) * nd * W.rx, y: W.cy + Math.sin(a) * nd * W.ry };
          goalT = now + 9000;
        }
        tx = goal.x; ty = goal.y;
      }
      var vx = 0, vy = 0;
      if (tx != null) {
        vx = tx - self.x; vy = ty - self.y;
        var l = Math.hypot(vx, vy);
        if (l > 8) { mx = vx / l; my = vy / l; }
      }
      c.send(JSON.stringify({ t: 'in', mx: +mx.toFixed(2), my: +my.toFixed(2), am: false, a: Math.atan2(vy, vx) }));
    }
  }

  /* ---------- ligação com o resto da página ---------- */
  window.WebSocket = FakeWS;

  // Imagens embutidas: o cliente pergunta /img-list e depois carrega img/<arquivo>.
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url) {
    if (String(url).indexOf('/img-list') === 0) return Promise.resolve({ ok: true, json: function () { return Promise.resolve(Object.keys(window.__IMGS || {})); } });
    return origFetch ? origFetch.apply(null, arguments) : Promise.reject(new Error('sem rede'));
  };
  var srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true, enumerable: srcDesc.enumerable, get: srcDesc.get,
    set: function (v) {
      var m = /^img\/([^?#]+)$/.exec(String(v));
      srcDesc.set.call(this, m && window.__IMGS && window.__IMGS[m[1]] ? window.__IMGS[m[1]] : v);
    }
  });

  // Roda o server.js como módulo, com 'ws', 'http', 'fs' e 'path' substituídos por versões mínimas.
  window.__slimeStartServer = function (factory) {
    var GD = window.module.exports, mod = { exports: {} };
    var req = function (n) {
      if (n === 'ws') return { WebSocketServer: WSS };
      if (n === './game-data') return GD;
      if (n === './accounts') return { create: function () { return null; } }; // a versão de teste não tem contas
      if (n === 'http') return { createServer: function () { return { listen: function (p, cb) { if (cb) cb(); }, on: function () {} }; } };
      if (n === 'fs') return { readFile: function () {}, readdir: function () {} };
      if (n === 'path') return { join: function () { return Array.prototype.join.call(arguments, '/'); }, normalize: function (x) { return x; }, extname: function () { return ''; }, sep: '/' };
      throw new Error('módulo não previsto: ' + n);
    };
    factory(req, mod, mod.exports, { env: {} }, '');
    window.__slimeServer = mod.exports; // só para testes automáticos da versão de teste
  };
})();
