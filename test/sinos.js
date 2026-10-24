'use strict';
// Teste: o ataque normal do sino acontece no monstro que está sendo atacado (não em volta de quem toca) e atinge quem está ao redor dele.
process.env.PORT = process.env.PORT || '3912';
const WebSocket = require('ws');
const S = require('../server'), D = require('../game-data');
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok  ', m); else { fails++; console.log('  FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:' + process.env.PORT);
    const c = { ws, id: null, ev: [] };
    ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.t === 'init') { c.id = m.id; resolve(c); } if (m.t === 's') c.ev.push(...m.ev); });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, color: '#33aa55' })));
  });
}
(async () => {
  console.log('Sino: a badalada acontece no monstro atacado');
  const c = await client('Sineiro');
  const room = S.rooms.find((r) => r.players.has(c.id)), p = room.players.get(c.id);
  room.mobs.forEach((m) => { m.alive = false; m.respT = 1e9; });
  p.protectUntil = 1e12; p.level = 20; p.alive = true; p.x = 4000; p.y = 4000; p.face = 0;
  Object.keys(p.stats).forEach((k) => { p.stats[k] = 40; });
  p.equip.w[0] = 'sinos_1'; p.equip.w[1] = null; S.recalc(p);
  const F = D.FAMILIES.sinos, R = F.range + p.r * 0.5;
  const mk = (i, x, y) => { const m = room.mobs[i]; m.alive = true; m.maxHp = m.hp = 1e9; m.stun = 1e9; m.respT = 0; m.cast = null; m.x = m.hx = x; m.y = m.hy = y; m.returning = false; m.tgt = null; return m; };
  const alvo = mk(0, p.x + F.range * 0.9, p.y);                 // dentro do alcance de quem toca
  const vizinho = mk(1, alvo.x + R * 0.8, alvo.y);              // perto do alvo, mas longe de quem toca
  const longe = mk(2, alvo.x + R * 3, alvo.y + R * 3);          // longe de tudo
  const hp0 = [alvo.hp, vizinho.hp, longe.hp];
  c.ev.length = 0; p.wt[0] = 0;
  await sleep(500);
  const ring = c.ev.find((e) => e[0] === 'f' && e[3] === 'ring');
  ok(!!ring, 'o sino bate no alvo e gera o efeito de badalada');
  ok(ring && Math.abs(ring[1] - alvo.x) <= 25 && Math.abs(ring[2] - alvo.y) <= 25, 'o efeito aparece em cima do monstro atacado (' + (ring ? ring[1] + ',' + ring[2] : '-') + ' · monstro em ' + Math.round(alvo.x) + ',' + Math.round(alvo.y) + ')');
  ok(ring && Math.hypot(ring[1] - p.x, ring[2] - p.y) > F.range * 0.5, 'o efeito não fica em volta de quem toca');
  ok(alvo.hp < hp0[0], 'o monstro atacado leva dano');
  ok(vizinho.hp < hp0[1], 'quem está ao redor do monstro atacado também leva dano, mesmo longe de quem toca');
  ok(longe.hp === hp0[2], 'quem está longe do monstro não leva dano');
  c.ws.close(); await sleep(150);
  console.log(fails ? fails + ' falha(s)' : 'tudo certo');
  process.exit(fails ? 1 : 0);
})();
