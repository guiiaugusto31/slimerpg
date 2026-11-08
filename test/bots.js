'use strict';
// Teste: bots enchem a sala quando há pouca gente, jogam (andam, matam monstros, sobem de nível), saem quando entra gente e somem quando a sala esvazia.
process.env.PORT = process.env.PORT || '3131';
process.env.SLIME_BOTS = '1';
const WebSocket = require('ws');
const S = require('../server');
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok  ', m); else { fails++; console.log('  FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name, mode) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:' + process.env.PORT);
    const c = { ws, id: null };
    ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.t === 'init') { c.id = m.id; resolve(c); } });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, color: '#33aa55', mode })));
  });
}
const roomOf = (c) => S.rooms.find((r) => r.players.has(c.id));
const bots = (room) => [...room.players.values()].filter((p) => p.bot);
(async () => {
  console.log('Bots');
  const a = await client('Ana', 'classic');
  const room = roomOf(a);
  await sleep(2500);
  ok(bots(room).length >= 1, 'entra bot quando a sala tem pouca gente');
  await sleep(14000);
  const bs = bots(room);
  ok(room.players.size === 8 && bs.length === 7, 'a sala completa 8 slimes (1 pessoa + 7 bots): ' + room.players.size);
  ok(bs.every((b) => / \(bot\)$/.test(b.name)), 'todo bot tem "(bot)" no nome');
  ok(bs.every((b) => !b.acct), 'bot não tem conta (fora dos rankings)');
  const p0 = bs.map((b) => ({ b, x: b.x, y: b.y }));
  await sleep(3000);
  ok(p0.filter((o) => Math.hypot(o.b.x - o.x, o.b.y - o.y) > 50).length >= 4, 'os bots andam pelo mapa');
  await sleep(25000);
  const lv = bs.reduce((s, b) => s + (b.level - 1) + Object.values(b.kills).reduce((x, y) => x + y, 0), 0);
  ok(lv > 0, 'os bots matam monstros e sobem de nível (níveis+abates: ' + lv + ')');
  // morto volta sozinho
  const dead = bs[0]; S.killPlayer(room, dead, null);
  ok(!dead.alive, 'bot pode morrer');
  await sleep(5500);
  ok(dead.alive || !room.players.has(dead.id), 'bot morto renasce sozinho');
  // chega mais gente: bots saem
  const extra = [];
  for (let i = 0; i < 3; i++) extra.push(await client('P' + i, 'classic'));
  await sleep(8000);
  ok(bots(room).length === 4 && room.players.size === 8, 'entrou gente de verdade: sai bot na mesma medida (' + bots(room).length + ' bots)');
  // todo mundo sai: bots somem e a sala fecha
  a.ws.close(); extra.forEach((c) => c.ws.close());
  await sleep(3500);
  ok(!S.rooms.includes(room), 'sem ninguém, os bots saem e a sala fecha');
  console.log(fails ? '\n' + fails + ' FALHA(S)' : '\nTudo certo (bots)');
  process.exit(fails ? 1 : 0);
})();
