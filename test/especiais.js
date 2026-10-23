'use strict';
// Teste: cada monstro comum usa seu ataque especial (aviso -> golpe) e o jogador que fica parado leva dano.
process.env.PORT = process.env.PORT || '3115';
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
  console.log('Ataques especiais dos monstros');
  const c = await client('Alvo');
  const room = S.rooms.find((r) => r.players.has(c.id)), p = room.players.get(c.id);
  const keys = Object.keys(D.MOBS).filter((k) => D.MOBS[k].sp);
  ok(keys.length === 7, '7 monstros comuns têm ataque especial');
  for (const k of keys) {
    room.mobs.forEach((m) => { m.alive = false; m.respT = 1e9; });
    const m = room.mobs.find((x) => x.key === k);
    m.alive = true; m.hp = m.maxHp; m.cast = null; m.spCd = 0; m.atkT = 0; m.stun = 0;
    p.level = 30; p.alive = true; p.protectUntil = 0; p.hp = p.maxHp = 5000; p.stun = 0;
    p.x = 4000; p.y = 4000; p.armor = { rp: 0, rm: 0 };
    const S0 = D.MOBS[k].sp, dd = Math.min(S0.trigger * 0.9, 120);
    m.x = p.x - dd; m.y = p.y; m.hx = m.x; m.hy = m.y; m.returning = false; m.tgt = null;
    c.ev.length = 0;
    await sleep(Math.max(600, (S0.wind + 0.9) * 1000));
    const warn = c.ev.some((e) => e[0] === 'w'), fxk = c.ev.some((e) => e[0] === 'f' && e[3] === 'ms' && e[6] === k);
    ok(warn && fxk, k + ': ' + S0.name + ' avisa no chão e depois golpeia');
    if (D.MOBS[k].tier >= 3) ok(p.hp < p.maxHp, k + ': o alvo parado levou dano (' + Math.round(p.maxHp - p.hp) + ')');
    m.alive = false;
  }
  console.log(fails ? fails + ' falha(s)' : 'tudo certo');
  process.exit(fails ? 1 : 0);
})();
