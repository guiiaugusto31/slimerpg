'use strict';
// Teste: movimento por comandos numerados (parar na hora, trocar de direção sem escorregar) e salto real do coelho.
process.env.PORT = process.env.PORT || '3117';
const WebSocket = require('ws');
const S = require('../server'), D = require('../game-data');
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok  ', m); else { fails++; console.log('  FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:' + process.env.PORT);
    const c = { ws, id: null, snaps: [] };
    ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.t === 'init') { c.id = m.id; resolve(c); } if (m.t === 's') c.snaps.push(m); });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, color: '#33aa55' })));
  });
}
(async () => {
  console.log('Movimento e salto do coelho');
  const c = await client('Corredor');
  const room = S.rooms.find((r) => r.players.has(c.id)), p = room.players.get(c.id);
  room.mobs.forEach((m) => { m.alive = false; m.respT = 1e9; });
  p.x = 4000; p.y = 4000; p.protectUntil = 1e12;
  let seq = 0;
  const send = (x, y) => c.ws.send(JSON.stringify({ t: 'in', s: ++seq, mx: x, my: y, am: 0, a: 0 }));
  for (let i = 0; i < 30; i++) { send(1, 0); await sleep(33); }
  for (let i = 0; i < 12; i++) { send(0, 0); await sleep(33); }
  await sleep(150);
  const x1 = p.x; await sleep(300);
  ok(Math.abs(p.x - x1) < 0.01, 'parou na hora ao soltar a tecla (sem escorregar)');
  ok(p.x > 4000 + 100, 'andou para a direita (' + Math.round(p.x - 4000) + ')');
  ok(p.ack === seq, 'servidor confirmou o último comando (' + p.ack + '/' + seq + ')');
  const y0 = p.y;
  for (let i = 0; i < 20; i++) { send(0, 1); await sleep(33); }
  for (let i = 0; i < 10; i++) { send(0, 0); await sleep(33); }
  await sleep(200);
  ok(p.y > y0 + 80, 'trocou de direção para baixo (' + Math.round(p.y - y0) + ')');
  ok(c.snaps.length && c.snaps[c.snaps.length - 1].p.some((e) => e.i === c.id && typeof e.q === 'number'), 'snapshot traz o número do comando confirmado');
  // salto do coelho
  p.x = 4000; p.y = 4000; p.hp = p.maxHp = 5000; p.level = 30; p.protectUntil = 0;
  const m = room.mobs.find((x) => x.key === 'coelho');
  m.alive = true; m.hp = m.maxHp; m.cast = null; m.spCd = 0; m.atkT = 0; m.stun = 0; m.x = 4000 - 110; m.y = 4000; m.hx = m.x; m.hy = m.y; m.returning = false; m.tgt = null;
  const xs = []; let air = 0, crouch = 0;
  for (let i = 0; i < 40; i++) { await sleep(33); xs.push(m.x); if (m.jmp > 0) air++; if (m.jmp < 0) crouch++; }
  ok(crouch > 3 && air > 3, 'coelho agacha (' + crouch + ') e fica no ar (' + air + ' passos)');
  const steps = xs.filter((v, i) => i && v - xs[i - 1] > 3).length;
  ok(steps >= 4, 'coelho percorre o caminho em arco, não teletransporta (' + steps + ' passos)');
  await sleep(500);
  ok(Math.abs(m.x - 4000) < 60 || p.hp < p.maxHp, 'coelho cai em cima do alvo');
  console.log(fails ? fails + ' falha(s)' : 'tudo certo');
  process.exit(fails ? 1 : 0);
})();
