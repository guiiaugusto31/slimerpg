'use strict';
// Teste: as 36 combinações de duas armas diferentes soltam a habilidade mista, com recarga única, e machucam alvos por perto.
process.env.PORT = process.env.PORT || '3116';
const WebSocket = require('ws');
const S = require('../server'), D = require('../game-data');
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok  ', m); else { fails++; console.log('  FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('uncaughtException', (e) => { fails++; console.log('  FAIL erro no servidor:', e.message); });
function client(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:' + process.env.PORT); const c = { ws, id: null };
    ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.t === 'init') { c.id = m.id; resolve(c); } });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, color: '#33aa55' })));
  });
}
(async () => {
  console.log('As 36 misturas de armas');
  const c = await client('Mix'); const room = S.rooms.find((r) => r.players.has(c.id)), p = room.players.get(c.id);
  const fams = ['espada', 'martelo', 'maca', 'rapieira', 'arco', 'chicote', 'varinha', 'cajado', 'sinos'];
  let bad = [];
  for (let i = 0; i < fams.length; i++) for (let j = i + 1; j < fams.length; j++) {
    const a = fams[i], b = fams[j];
    room.mobs.forEach((m) => { m.alive = false; m.respT = 1e9; });
    p.protectUntil = 1e12; Object.keys(p.stats).forEach((k) => { p.stats[k] = 40; });
    p.equip.w[0] = a + '_1'; p.equip.w[1] = b + '_1'; S.recalc(p);
    p.x = D.WORLD.cx - 2000; p.y = D.WORLD.cy; p.st = [0, 0]; p.wt = [99, 99]; p.face = 0; p.am = false; p.mx = p.my = 0; p.hp = p.maxHp * 0.6; p.trails = [];
    const ms = [[90, 0], [150, 50], [130, -60]].map(([dx, dy]) => { const m = room.mobs.find((x) => x.key === 'javali' && !x.alive); m.alive = true; m.hp = m.maxHp = 99999; m.stun = 999; m.x = p.x + dx; m.y = p.y + dy; m.hx = m.x; m.hy = m.y; m.cast = null; m.tgt = null; return m; });
    const h0 = ms.map((m) => m.hp);
    await sleep(1300);
    if (process.env.DBG && (a + b === 'espadarapieira')) console.log('   dbg', ms.map((m, k) => [Math.round(h0[k] - m.hp), m.alive, Math.round(m.x - p.x)].join('/')).join(' '), 'p', Math.round(p.x), p.mixed, p.st.join(','));
    const dmg = ms.reduce((t, m, k) => t + h0[k] - m.hp, 0);
    const fired = p.mixed && p.st[0] > 0 && p.st[0] === p.st[1];
    if (!(p.mixed && fired && dmg > 0)) bad.push(a + '+' + b + ' (mista ' + !!p.mixed + ', recarga ' + p.st[0].toFixed(1) + ', dano ' + Math.round(dmg) + ')');
  }
  ok(bad.length === 0, bad.length ? 'combinações com problema: ' + bad.join('; ') : 'todas as 36 combinações disparam, usam uma recarga só e machucam');
  console.log(fails ? fails + ' falha(s)' : 'tudo certo');
  process.exit(fails ? 1 : 0);
})();
