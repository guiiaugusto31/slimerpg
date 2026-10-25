'use strict';
// Teste: modo espectador (invisível, câmera livre, sem combate) e contador de abates ligado pelo administrador.
process.env.PORT = process.env.PORT || '3119';
const WebSocket = require('ws');
const S = require('../server');
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok  ', m); else { fails++; console.log('  FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name, mode, spec) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:' + process.env.PORT);
    const c = { ws, id: null, init: null, snaps: [], kc: null, toasts: [], feed: [] };
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'init') { c.id = m.id; c.init = m; resolve(c); }
      if (m.t === 's') c.snaps.push(m);
      if (m.t === 'kc') c.kc = m;
      if (m.t === 'toast') c.toasts.push(m.m);
      if (m.t === 'feed') c.feed.push(m.m);
    });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, color: '#33aa55', mode, spec: !!spec })));
  });
}
(async () => {
  console.log('Espectador');
  const a = await client('A', 'classic'), b = await client('B', 'classic');
  const sp = await client('Olheiro', 'classic', true);
  const room = S.rooms.find((r) => r.players.has(a.id));
  ok(sp.init.spec === true && room.specs.has(sp.id) && !room.players.has(sp.id), 'espectador entra na sala do modo, fora da lista de jogadores');
  ok(sp.init.admin === false, 'sem conta de administrador não é admin');
  const lastP = (c) => c.snaps[c.snaps.length - 1].p;
  await sleep(400);
  ok(!lastP(a).some((e) => e.i === sp.id) && !lastP(b).some((e) => e.i === sp.id), 'ninguém vê o espectador');
  ok(lastP(sp).some((e) => e.i === sp.id) && lastP(sp).some((e) => e.i === a.id), 'o espectador vê a si mesmo e os jogadores');
  // anda livremente
  const x0 = room.specs.get(sp.id).x;
  for (let i = 1; i <= 15; i++) { sp.ws.send(JSON.stringify({ t: 'in', s: i, mx: 1, my: 0, am: false, a: 0 })); await sleep(34); }
  await sleep(200);
  ok(room.specs.get(sp.id).x > x0 + 100, 'o espectador anda pelo mapa (' + Math.round(room.specs.get(sp.id).x - x0) + ' px)');
  const lb = [...room.players.values()].length; ok(lb === 2, 'não conta como jogador na sala');
  // não-admin não liga o contador; ataques e respawn são ignorados
  sp.ws.send(JSON.stringify({ t: 'kc', on: true })); await sleep(150);
  ok(!room.kc, 'quem não é administrador não liga o contador');
  // administrador (simulado no servidor)
  room.specs.get(sp.id).admin = true;
  sp.ws.send(JSON.stringify({ t: 'kc', on: true })); await sleep(150);
  ok(room.kc && sp.kc && sp.kc.on === true, 'administrador liga o contador e a sala recebe o painel');
  ok(a.kc && a.kc.on === true, 'quem joga também vê o contador');
  // abates: só contam quem tem conta, qualquer nível, 5 s para a mesma vítima
  const pa = room.players.get(a.id), pb = room.players.get(b.id);
  pa.acct = { id: 9001, email: 'a@x.com' }; pb.acct = { id: 9002, email: 'b@x.com' };
  const kill = (src, v) => { v.alive = true; v.level = 3; S.killPlayer(room, v, src); };
  kill(pa, pb);
  kill(pa, pb); // dentro de 5 s: não soma
  ok(room.kc.rows.get(9001).k === 1, 'mesma vítima dentro de 5 segundos não soma');
  await sleep(5100);
  kill(pa, pb);
  ok(room.kc.rows.get(9001).k === 2, 'passados 5 segundos conta de novo (vítima de nível 3)');
  const g = await client('Visitante', 'classic'); const pg = room.players.get(g.id);
  kill(pg, pb);
  ok(!room.kc.rows.has(undefined) && room.kc.rows.size === 1, 'jogador sem conta não entra no contador');
  await sleep(1300);
  ok(sp.kc.l[0][0] === 'A' && sp.kc.l[0][1] === 2, 'o painel mostra A com 2 abates');
  g.ws.close();
  // desliga
  sp.ws.send(JSON.stringify({ t: 'kc', on: false })); await sleep(150);
  ok(!room.kc && sp.kc.on === false, 'administrador desliga o contador');
  // espectador não age como jogador
  sp.ws.send(JSON.stringify({ t: 'respawn' })); sp.ws.send(JSON.stringify({ t: 'alloc', k: 'str', n: 1 })); await sleep(100);
  ok(room.specs.has(sp.id), 'comandos de jogo são ignorados');
  // sair do espectador não apaga a sala com jogadores; trocar de sala sem outra sala avisa
  sp.ws.send(JSON.stringify({ t: 'nextroom' })); await sleep(150);
  ok(sp.toasts.length === 1, 'com uma só sala, "próxima sala" avisa');
  sp.ws.close(); await sleep(150);
  ok(room.specs.size === 0 && S.rooms.includes(room), 'espectador sai e a sala continua');
  console.log(fails ? fails + ' falha(s)' : 'tudo certo');
  process.exit(fails ? 1 : 0);
})();
