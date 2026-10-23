'use strict';
// Teste: arma de longe atira mesmo sem alvo; sem inimigo no alcance, só a cura é usada.
// Uso: node test/tiro.js
process.env.PORT = process.env.PORT || '3114';
const WebSocket = require('ws');
const { rooms } = require('../server');
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
  console.log('Tiro sem alvo e cura sem inimigo');
  const c = await client('Arqueiro');
  const room = rooms.find((r) => r.players.has(c.id)), p = room.players.get(c.id);
  room.mobs.forEach((m) => { m.alive = false; m.respT = 1e9; });
  p.protectUntil = 1e12;
  Object.keys(p.stats).forEach((k) => { p.stats[k] = 40; });
  p.equip.w[0] = 'arco_1'; p.equip.w[1] = 'sinos_1';
  require('../server').recalc(p);
  p.face = 0; p.hp = p.maxHp;
  await sleep(1500);
  const shots = c.ev.filter((e) => e[0] === 'a' && e[4] === 0 && e[6] === 0).length;
  ok(shots >= 2, 'arco atira sem nenhum monstro por perto (' + shots + ' tiros)');
  ok(!c.ev.some((e) => e[0] === 'a' && e[6] === 1), 'com vida cheia e sem inimigos, nenhuma habilidade é usada');
  p.hp = p.maxHp * 0.5; c.ev.length = 0;
  await sleep(700);
  ok(c.ev.some((e) => e[0] === 'a' && e[6] === 1), 'sino cura sozinho quando está machucado e não há inimigos');
  ok(p.hp > p.maxHp * 0.5, 'a vida subiu');
  p.equip.w[0] = 'espada_1'; p.equip.w[1] = null; require('../server').recalc(p); p.hp = p.maxHp; c.ev.length = 0;
  await sleep(1000);
  ok(!c.ev.some((e) => e[0] === 'a'), 'arma corpo a corpo não balança no vazio');
  console.log('Habilidade mista');
  const D = require('../game-data');
  const mob = room.mobs[0]; mob.alive = true; mob.maxHp = mob.hp = 1e9; mob.stun = 1e9; mob.respT = 0;
  p.protectUntil = 1e12; p.equip.w[0] = 'espada_1'; p.equip.w[1] = 'arco_1'; require('../server').recalc(p); p.hp = p.maxHp;
  mob.x = p.x + 90; mob.y = p.y; p.face = 0; p.st[0] = p.st[1] = 0; c.ev.length = 0;
  await sleep(500);
  const sk = c.ev.filter((e) => e[0] === 'a' && e[6] === 1);
  ok(p.mixed && p.mixName === D.mixName('espada', 'arco') && p.mixName === D.mixName('arco', 'espada'), 'espada + arco = habilidade mista "' + p.mixName + '" (mesmo nome em qualquer ordem)');
  ok(sk.some((e) => e[4] === 0) && sk.some((e) => e[4] === 1), 'as duas habilidades saem juntas');
  ok(p.st[0] > 0 && p.st[0] === p.st[1] && Math.abs(p.st[0] - p.mixCd) < 0.6, 'uma recarga só (' + p.mixCd + ' s)');
  const n0 = sk.length; await sleep(1500);
  ok(c.ev.filter((e) => e[0] === 'a' && e[6] === 1).length === n0, 'durante a recarga nenhuma das duas dispara de novo');
  p.equip.w[1] = 'espada_1'; p.equip.w[0] = 'espada_1'; require('../server').recalc(p);
  ok(p.fused && !p.mixed, 'o mesmo item nos dois slots continua sendo fusão, não mistura');
  p.equip.w[0] = 'faca'; p.equip.w[1] = 'arco_1'; require('../server').recalc(p);
  ok(!p.mixed && !p.fused, 'faca (sem habilidade) + arco: sem mistura');
  c.ws.close(); await sleep(200);
  console.log(fails ? fails + ' falhas' : 'tudo certo'); process.exit(fails ? 1 : 0);
})();
