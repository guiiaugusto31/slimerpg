'use strict';
// Teste: os 3 modos de jogo (salas separadas; coop sem PvP e com cronômetro do dragão; PvP com mais XP e contador de abates).
process.env.PORT = process.env.PORT || '3118';
const WebSocket = require('ws');
const S = require('../server'), D = require('../game-data');
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok  ', m); else { fails++; console.log('  FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name, mode) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:' + process.env.PORT);
    const c = { ws, id: null, init: null, feed: [], lb: null };
    ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.t === 'init') { c.id = m.id; c.init = m; resolve(c); } if (m.t === 'feed') c.feed.push(m.m); if (m.t === 'lb') c.lb = m; });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, color: '#33aa55', mode })));
  });
}
const roomOf = (c) => S.rooms.find((r) => r.players.has(c.id));
(async () => {
  console.log('Modos de jogo');
  const a = await client('A', 'classic'), b = await client('B', 'coop'), c = await client('C', 'pvp'), d = await client('D', 'coop'), e = await client('E', undefined);
  ok(roomOf(a).mode === 'classic' && roomOf(b).mode === 'coop' && roomOf(c).mode === 'pvp', 'cada modo tem a sua sala');
  ok(roomOf(b) === roomOf(d) && roomOf(a) === roomOf(e) && roomOf(a) !== roomOf(b), 'jogadores do mesmo modo caem na mesma sala; sem modo = clássico');
  ok(a.init.mode === 'classic' && b.init.mode === 'coop', 'o servidor informa o modo ao entrar');

  // coop: ninguém fere ninguém
  const rb = roomOf(b), pb = rb.players.get(b.id), pd = rb.players.get(d.id);
  pb.x = 4000; pb.y = 4000; pd.x = 4040; pd.y = 4000; pb.protectUntil = pd.protectUntil = 0; pd.hp = pd.maxHp;
  const hp0 = pd.hp; S.hit(rb, pb, pd, 50, 'phys');
  ok(pd.hp === hp0, 'coop: aliado não toma dano de aliado');
  // clássico: PvP liga
  const ra = roomOf(a), pa = ra.players.get(a.id), pe = ra.players.get(e.id);
  pa.protectUntil = pe.protectUntil = 0; pe.hp = pe.maxHp; const h1 = pe.hp; S.hit(ra, pa, pe, 5, 'phys');
  ok(pe.hp < h1, 'clássico: PvP continua ligado');

  // XP por modo: o mesmo cogumelo
  const xpOf = async (cl, k) => {
    const r = roomOf(cl), p = r.players.get(cl.id);
    p.level = 1; p.xp = 0; p.protectUntil = 0; p.x = 4000; p.y = 4000;
    const m = r.mobs.find((x) => x.key === 'cogumelo' && x.alive) || r.mobs.find((x) => x.key === 'cogumelo');
    m.alive = true; m.hp = 1; m.x = 4010; m.y = 4000;
    let got = 0; const old = S.addXp; // mede o XP concedido pelo abate
    const total = () => p.xp + (p.level - 1) * 1000;
    const t0 = total(); S.hit(r, p, m, 999, 'phys'); await sleep(50);
    return total() - t0;
  };
  const cog = D.MOBS.cogumelo.xp;
  const xc = await xpOf(a, 'classic'), xp = await xpOf(c, 'pvp'), xo = await xpOf(b, 'coop');
  ok(xc > 0 && xp >= xc * 2, 'pvp: monstro dá bem mais XP (clássico ' + xc + ', pvp ' + xp + ')');
  ok(xo >= xc, 'coop: XP maior ou igual (coop ' + xo + ')');

  // pvp: contador de abates
  const rc = roomOf(c), pc = rc.players.get(c.id);
  const f = await client('F', 'pvp'); const pf = rc.players.get(f.id);
  pc.protectUntil = pf.protectUntil = 0; pc.level = 5; pf.level = 5; pc.alive = pf.alive = true; pf.hp = pf.maxHp = 10;
  S.hit(rc, pc, pf, 999, 'phys'); await sleep(80);
  ok(pc.rk === 1 && pf.rd === 1, 'pvp: abate e morte contadas (' + pc.rk + '/' + pf.rd + ')');
  await sleep(1100);
  ok(c.lb && c.lb.md === 'pvp' && c.lb.l[0][4] >= 1, 'pvp: o ranking da sala ordena por abates');

  // coop: cronômetro e recorde
  const boss = rb.boss; pb.level = 20; pb.protectUntil = 0; boss.alive = true; boss.state = 1; boss.fightT0 = rb.now - 42; boss.hp = 1;
  S.hit(rb, pb, boss, 10, 'phys'); await sleep(100);
  ok(rb.best.length === 1 && rb.best[0].t >= 40 && rb.best[0].t <= 45, 'coop: tempo do dragão registrado (' + (rb.best[0] && rb.best[0].t) + ' s)');
  ok(b.feed.some((t) => /Tempo para derrubar o dragão/.test(t)), 'coop: a sala é avisada do tempo');
  console.log(fails ? fails + ' falha(s)' : 'tudo certo');
  process.exit(fails ? 1 : 0);
})();
