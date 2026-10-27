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
  { // nerf: dano entre jogadores é 60% do normal; contra monstros não muda
    pe.hp = pe.maxHp = 5000; pe.protectUntil = pa.protectUntil = 0; const rp = pe.armor.rp;
    const before = pe.hp; S.hit(ra, pa, pe, 1000, 'phys');
    const exp = Math.max(1, Math.round(1000 * D.PVP_DAMAGE * (1 - rp / 100)));
    ok(D.PVP_DAMAGE === 0.6 && before - pe.hp === exp, 'PvP: dano entre jogadores 40% menor (' + (before - pe.hp) + ' = ' + exp + ')');
    const mob = ra.mobs.find((x) => x.alive && !x.boss); const mh = mob.maxHp = mob.hp = 5000; S.hit(ra, pa, mob, 1000, 'phys');
    ok(mh - mob.hp === 1000, 'contra monstros o dano continua inteiro');
  }

  // XP por modo: o mesmo cogumelo
  const xpOf = async (cl, k) => {
    const r = roomOf(cl), p = r.players.get(cl.id);
    p.level = 10; p.xp = 0; p.protectUntil = 0; p.x = 4000; p.y = 4000; // nível alto: o XP de um cogumelo não faz subir de nível, então o total é o XP concedido
    const m = r.mobs.find((x) => x.key === 'cogumelo' && x.alive) || r.mobs.find((x) => x.key === 'cogumelo');
    m.alive = true; m.hp = 1; m.x = 4010; m.y = 4000;
    let got = 0; const old = S.addXp; // mede o XP concedido pelo abate
    const total = () => p.xp + (p.level - 1) * 1000;
    const t0 = total(); S.hit(r, p, m, 999, 'phys'); await sleep(50);
    return total() - t0;
  };
  const cog = D.MOBS.cogumelo.xp;
  const xc = await xpOf(a, 'classic'), xp = await xpOf(c, 'pvp'), xo = await xpOf(b, 'coop');
  ok(xc === Math.round(cog * 1.5), 'clássico: monstro dá 1,5x de XP (' + cog + ' base, ' + xc + ' recebido)');
  ok(xp === cog * 3, 'pvp: monstro dá 3x de XP (' + xp + ')');
  ok(xo === xc, 'coop: mesmo XP do clássico, 1,5x (' + xo + ')');

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
  // PvP não leva nem guarda as armas dos outros modos: só as armas míticas do dragão
  const sv = { items: ['espada_3', 'espada_6', 'martelo_2', 'draco_6'], equip: { w: ['espada_6', 'espada_3'], a: 'vital_0' }, kills: { lobo: 5 }, pk: 2, done: ['q_sinos'] };
  const pp = S.makePlayer({}, 'P', '#ffffff', sv, 'pvp'), pcl = S.makePlayer({}, 'Q', '#ffffff', sv, 'classic');
  ok(pp.inv.length === 1 && pp.inv[0] === 'espada_6' && pp.equip.w[0] === 'espada_6' && pp.equip.w[1] !== 'espada_3', 'pvp: entra só com a arma mítica do save (' + pp.inv.join(',') + ')');
  ok(Object.keys(pp.kills).length === 0 && pp.pk === 0 && pp.done.size === 0, 'pvp: sem abates nem missões dos outros modos');
  ok(pcl.inv.includes('espada_3') && pcl.inv.includes('martelo_2') && pcl.kills.lobo === 5, 'clássico: o save inteiro continua valendo');
  pp.inv.push('martelo_3', 'arco_6'); pp.kills.cogumelo = 9; // achou um item comum e ganhou uma mítica do dragão no PvP
  const out = S.saveMsg(pp).d;
  ok(out.items.includes('arco_6') && !out.items.includes('martelo_3'), 'pvp: só a arma mítica nova entra no save, a comum não');
  ok(['espada_3', 'espada_6', 'martelo_2', 'draco_6'].every((id) => out.items.includes(id)) && out.kills.lobo === 5 && !out.kills.cogumelo && out.done.includes('q_sinos') && out.pk === 2, 'pvp: o resto do save (outros modos) fica como estava');
  console.log(fails ? fails + ' falha(s)' : 'tudo certo');
  process.exit(fails ? 1 : 0);
})();
