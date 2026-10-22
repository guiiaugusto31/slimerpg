'use strict';
// Simulador de equilíbrio do SlimeRPG. Roda o servidor de verdade, sem rede, muito mais rápido que o tempo real.
//   node tools/simular.js armas        arena com todas as armas (corpo a corpo x longe), por faixa
//   node tools/simular.js progressao   robôs do nível 1 ao 20 (sozinhos e em sala cheia)
//   node tools/simular.js dragao       robôs nível 20 contra o dragão
//   node tools/simular.js tudo
// Opções: --rapido (menos repetições), --json arquivo.json
const fs = require('fs');
const H = require('./sim/harness');
const { Bot } = require('./sim/bot');
const { S, D } = H;

const args = process.argv.slice(2);
const cmd = args[0] || 'tudo';
const FAST = args.includes('--rapido');
// --ajuste '{"MOBS.lobo.dmg":10,"DROP_WEAPON":0.05}' muda números do jogo só nesta simulação (para testar ideias)
const aIdx = args.indexOf('--ajuste');
if (aIdx >= 0) {
  const adj = JSON.parse(args[aIdx + 1]);
  Object.keys(adj).forEach((path) => {
    const parts = path.split('.'); let o = D;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = adj[path];
  });
  console.log('Ajustes aplicados:', JSON.stringify(adj));
}
// --faixa 2,3 e --fam arco,varinha limitam o teste de armas (para experimentar ideias mais rápido)
const optList = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1].split(',') : null; };
const ONLY_TIERS = (optList('--faixa') || []).map(Number);
const ONLY_FAMS = optList('--fam');
const reps0 = args.indexOf('--reps') >= 0 ? Number(args[args.indexOf('--reps') + 1]) : null;
const jIdx = args.indexOf('--json');
const JSON_OUT = jIdx >= 0 ? args[jIdx + 1] : null;
const results = {};
let simSeconds = 0;
const mm = (s) => (s / 60).toFixed(1);
const f1 = (x) => (x === null || x === undefined ? '-' : Number(x).toFixed(1));
const f2 = (x) => (x === null || x === undefined ? '-' : Number(x).toFixed(2));
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

/* =============================== ARMAS =============================== */
// Cada faixa é testada com um jogador de atributos médios do nível dessa faixa, vestindo o peitoral vital da mesma faixa,
// contra um bando de monstros da faixa (renascem na hora). Mede abates/min, dano e mortes.
const TIER_LEVEL = [3, 6, 10, 15, 20, 20];
const TIER_MOB = ['coelho', 'lobo', 'javali', 'broto', 'aranha', 'aranha'];
const PACK = [4, 4, 4, 3, 3, 3];

function arena(opts) {
  const { w0, w1, tier, secs, kite } = opts;
  const nPack = opts.pack || PACK[tier - 1];
  const room = H.makeRoom(true);
  const L = TIER_LEVEL[tier - 1];
  const stats = H.statsAtLevel(L);
  if (tier === 6) { stats.str = stats.dex = stats.man = 40; }
  const arm = tier === 0 ? 'vital_0' : 'vital_' + Math.min(5, tier);
  const C = { x: D.WORLD.cx + 900, y: D.WORLD.cy };
  const p = H.addPlayer(room, 'teste', {
    level: L, stats, inv: [w0, w1, arm].filter((x, i, a) => x && D.ITEMS[x] && !D.BASE_ITEMS.includes(x) && a.indexOf(x) === i),
    equip: { w: [w0, w1], a: arm }, pos: C
  });
  S.recalc(p); p.hp = p.maxHp;
  const key = TIER_MOB[tier - 1], def = D.MOBS[key], n = nPack;
  const bot = new Bot(room, p, { arena: true, fixedEquip: true, kite, budget: 99, pos: C });
  const mobs = [];
  const place = (m) => { const a = Math.random() * Math.PI * 2, r = def.aggro * 0.85; H.rearmMob(m, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); };
  for (let i = 0; i < n; i++) { const m = H.addMob(room, key, C.x, C.y); place(m); mobs.push(m); }
  let dealt = 0, taken = 0, kills = 0, deaths = 0;
  room.onHit = (src, e, dmg) => {
    if (src === p) dealt += Math.min(dmg, e.hp + dmg);
    if (e === p) taken += dmg;
  };
  const ticks = Math.round(secs * S.TICK);
  let wasAlive = true;
  for (let i = 0; i < ticks; i++) {
    bot.tick();
    S.updateRoom(room);
    for (const m of mobs) if (!m.alive) { kills++; place(m); }
    if (!p.alive && wasAlive) deaths++;
    wasAlive = p.alive;
    if (!p.alive) { // morreu na arena: renasce no lugar, cheio, e continua (conta a morte)
      S.spawnPlayer(room, p); p.x = C.x; p.y = C.y; p.hp = p.maxHp; p.level = L; p.stats = Object.assign({}, stats); S.recalc(p); p.hp = p.maxHp;
      wasAlive = true;
    }
  }
  simSeconds += secs;
  return { kpm: (kills / secs) * 60, dps: dealt / secs, dtps: taken / secs, dpm: (deaths / secs) * 60, hp: p.maxHp };
}

function avgRuns(fn, reps) {
  const acc = [];
  for (let i = 0; i < reps; i++) acc.push(fn());
  const out = {};
  for (const k of Object.keys(acc[0])) out[k] = H.avg(acc.map((r) => r[k]));
  return out;
}

function armas() {
  const reps = reps0 || (FAST ? 1 : 3), secs = 40;
  const fams = Object.keys(D.FAMILIES).filter((f) => f !== 'faca' && (!ONLY_FAMS || ONLY_FAMS.includes(f)));
  const rows = {};
  console.log('\n=== ARMAS: arena de ' + secs + ' s x ' + reps + ' repetições por arma (jogador de atributos médios da faixa) ===');
  for (let tier = 1; tier <= 6; tier++) {
    if (ONLY_TIERS.length && !ONLY_TIERS.includes(tier)) continue;
    const L = TIER_LEVEL[tier - 1];
    console.log('\nFaixa ' + tier + ' (' + D.TIER_NAMES[tier - 1] + ') — nível ~' + L + ', contra ' + PACK[tier - 1] + ' x ' + D.MOBS[TIER_MOB[tier - 1]].name + ' que renascem na hora');
    console.log(pad('arma', 12) + rpad('tipo', 8) + rpad('abates/min', 12) + rpad('dano/s', 9) + rpad('sofre/s', 9) + rpad('mortes/10min', 14) + rpad('vs mediana', 12));
    const list = [];
    for (const fam of fams) {
      const id = fam + '_' + tier;
      const F = D.FAMILIES[fam];
      const ranged = F.range >= 200;
      // arma sozinha (o outro slot vazio), para comparar só a arma
      const r = avgRuns(() => arena({ w0: id, w1: null, tier, secs, kite: ranged ? 'auto' : false }), reps);
      const rh = ranged ? avgRuns(() => arena({ w0: id, w1: null, tier, secs, kite: false }), reps) : null; // à distância sem fugir
      list.push({ fam, id, ranged, r, rh });
    }
    const med = H.pct(list.map((x) => x.r.kpm), 0.5);
    for (const x of list) {
      console.log(pad(D.ITEMS[x.id].name, 12) + rpad(x.ranged ? 'longe' : 'perto', 8) + rpad(f1(x.r.kpm), 12) + rpad(f1(x.r.dps), 9) + rpad(f1(x.r.dtps), 9) + rpad(f1(x.r.dpm * 10), 14) + rpad(f2(x.r.kpm / med) + 'x', 12) +
        (x.rh ? '   (parado: ' + f1(x.rh.kpm) + ' ab/min, ' + f1(x.rh.dpm * 10) + ' mortes/10min)' : ''));
      rows[x.id] = { kpm: x.r.kpm, dps: x.r.dps, dtps: x.r.dtps, deaths10: x.r.dpm * 10, still: x.rh ? { kpm: x.rh.kpm, deaths10: x.rh.dpm * 10 } : null };
    }
    const melee = list.filter((x) => !x.ranged), rng = list.filter((x) => x.ranged);
    const mk = (a) => H.avg(a.map((x) => x.r.kpm)), md = (a) => H.avg(a.map((x) => x.r.dpm * 10));
    console.log('  -> média perto: ' + f1(mk(melee)) + ' ab/min, ' + f1(md(melee)) + ' mortes/10min | longe (fugindo): ' + f1(mk(rng)) + ' ab/min, ' + f1(md(rng)) + ' mortes/10min | longe (parado): ' +
      f1(H.avg(rng.map((x) => x.rh.kpm))) + ' ab/min, ' + f1(H.avg(rng.map((x) => x.rh.dpm * 10))) + ' mortes/10min');
  }
  if (ONLY_TIERS.length && !ONLY_TIERS.includes(3)) { results.armas = rows; return; }
  // fusão (mesma arma nos 2 slots) e faca
  console.log('\nFusão (mesmo item nos dois slots) contra a mesma faixa 3, 40 s x ' + reps);
  for (const fam of fams) {
    const id = fam + '_3', ranged = D.FAMILIES[fam].range >= 200;
    const a = avgRuns(() => arena({ w0: id, w1: null, tier: 3, secs: 40, kite: ranged ? 'auto' : false }), reps);
    const b = avgRuns(() => arena({ w0: id, w1: id, tier: 3, secs: 40, kite: ranged ? 'auto' : false }), reps);
    console.log(pad(D.ITEMS[id].name, 12) + ' sozinha ' + f1(a.kpm) + ' ab/min | fundida ' + f1(b.kpm) + ' ab/min (' + f2(b.kpm / a.kpm) + 'x), mortes/10min ' + f1(a.dpm * 10) + ' -> ' + f1(b.dpm * 10));
    rows[id + '+fusao'] = { kpm: b.kpm, deaths10: b.dpm * 10 };
  }
  results.armas = rows;
}

/* =============================== PROGRESSÃO =============================== */
// Robôs partem do nível 1 numa sala de verdade (com monstros espalhados, drops e missões) e jogam até X minutos.
function runProgress(label, n, minutes, botOpts, extra) {
  const room = H.makeRoom(false);
  const bots = [];
  const names = [];
  for (let i = 0; i < n; i++) {
    const p = H.addPlayer(room, 'bot' + i);
    names.push(p);
    bots.push(new Bot(room, p, typeof botOpts === 'function' ? botOpts(i) : botOpts));
  }
  const dmg = { dealt: 0, taken: 0 };
  const total = Math.round(minutes * 60 * S.TICK);
  let reached20 = bots.map(() => null);
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    for (const b of bots) b.tick();
    S.updateRoom(room);
    if (i % S.TICK === 0) bots.forEach((b, k) => { if (reached20[k] === null && b.p.level >= D.MAX_LEVEL) reached20[k] = room.now; });
    if (extra) extra(room, bots, i);
  }
  simSeconds += minutes * 60;
  bots.forEach((b) => b.readLog());
  const wall = ((Date.now() - t0) / 1000).toFixed(0);
  return { label, room, bots, reached20, minutes, wall };
}

// vários robôs, cada um sozinho na sua própria sala (sem PvP), juntados num resultado só
function runSolo(label, count, minutes, botOpts) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const R = runProgress(label, 1, minutes, botOpts);
    S.rooms.splice(S.rooms.indexOf(R.room), 1);
    parts.push(R);
  }
  return { label, minutes, room: null, bots: parts.flatMap((r) => r.bots), reached20: parts.flatMap((r) => r.reached20), wall: parts.reduce((a, r) => a + Number(r.wall), 0) };
}

function summarizeProgress(R) {
  const { bots, label, minutes } = R;
  const lvlTimes = {};
  for (let L = 2; L <= 20; L++) {
    const ts = bots.map((b) => b.stats.levelAt[L]).filter((x) => x !== undefined);
    lvlTimes[L] = { n: ts.length, med: ts.length ? H.pct(ts, 0.5) : null };
  }
  // vida mais longa de cada robô
  const bestLevel = bots.map((b) => Math.max(b.p.level, ...b.stats.deaths.map((d) => d.level), 1));
  const deathsAt = {};
  const deathsBy = {};
  let totalDeaths = 0;
  bots.forEach((b) => b.stats.deaths.forEach((d) => {
    const bucket = d.level <= 2 ? '1-2' : d.level <= 5 ? '3-5' : d.level <= 9 ? '6-9' : d.level <= 14 ? '10-14' : d.level <= 19 ? '15-19' : '20';
    deathsAt[bucket] = (deathsAt[bucket] || 0) + 1;
    deathsBy[d.by] = (deathsBy[d.by] || 0) + 1;
    totalDeaths++;
  }));
  // quem matou em que faixa de nível
  const killers = {};
  bots.forEach((b) => b.stats.deaths.forEach((d) => {
    const bucket = d.level <= 2 ? '01-02' : d.level <= 5 ? '03-05' : d.level <= 9 ? '06-09' : d.level <= 14 ? '10-14' : d.level <= 19 ? '15-19' : '20';
    const who = /^bot|^p\d/.test(d.by) ? 'jogador' : d.by;
    killers[bucket] = killers[bucket] || {};
    killers[bucket][who] = (killers[bucket][who] || 0) + 1;
  }));
  const r20 = R.reached20.filter((x) => x !== null);
  console.log('\n--- ' + label + ' | ' + bots.length + ' robôs, ' + minutes + ' min de jogo (levou ' + R.wall + ' s de relógio) ---');
  console.log('Nível final: ' + bots.map((b) => b.p.level).join(' ') + '  | melhor nível alcançado: ' + bestLevel.join(' '));
  console.log('Chegaram ao nível 20: ' + r20.length + '/' + bots.length + (r20.length ? ' (mediana ' + mm(H.pct(r20, 0.5)) + ' min, mais rápido ' + mm(Math.min(...r20)) + ')' : ''));
  console.log('Tempo mediano (min de jogo) para chegar a cada nível: ' + Object.keys(lvlTimes).filter((L) => lvlTimes[L].n).map((L) => 'nv' + L + '=' + mm(lvlTimes[L].med) + '(' + lvlTimes[L].n + ')').join(' '));
  console.log('Mortes: ' + totalDeaths + ' (' + (totalDeaths / bots.length).toFixed(1) + ' por robô) | por faixa de nível: ' + Object.keys(deathsAt).map((k) => k + ':' + deathsAt[k]).join(' ') + ' | por quem: ' + Object.keys(deathsBy).map((k) => k + ':' + deathsBy[k]).join(' '));
  // chance de passar de cada faixa sem morrer: de quantos chegaram ao nível X, quantos chegaram ao nível Y na mesma vida
  const lives = [];
  bots.forEach((b) => { b.stats.lives.forEach((l) => lives.push(l)); lives.push(b.life); });
  const reachedLife = (L) => lives.filter((l) => l.levelAt[L] !== undefined).length;
  const passes = [[1, 3], [3, 5], [5, 8], [8, 10], [10, 13], [13, 16], [16, 20]].map(([a, b]) => {
    const from = reachedLife(a), to = reachedLife(b);
    return 'nv' + a + '→' + b + ': ' + (from ? Math.round((100 * to) / from) + '%' : '-') + ' (' + to + '/' + from + ')';
  });
  Object.keys(killers).sort().forEach((b) => console.log('  mortes nv ' + b + ': ' + Object.keys(killers[b]).map((k) => k + ' ' + killers[b][k]).join(', ')));
  console.log('Chance de ir de um nível ao outro sem morrer: ' + passes.join(' | '));
  const loots = bots.flatMap((b) => b.stats.loot.map((l) => l.item));
  const tierCount = {};
  loots.forEach((id) => { const t = D.ITEMS[id].tier; tierCount[t] = (tierCount[t] || 0) + 1; });
  console.log('Itens ganhos: ' + loots.length + ' por faixa: ' + Object.keys(tierCount).map((t) => 'f' + t + ':' + tierCount[t]).join(' '));
  const tm = bots.reduce((a, b) => { a.rest += b.stats.restT; a.fight += b.stats.fightT; a.travel += b.stats.travelT; return a; }, { rest: 0, fight: 0, travel: 0 });
  const tt = tm.rest + tm.fight + tm.travel || 1;
  console.log('Tempo gasto: descansando ' + Math.round((100 * tm.rest) / tt) + '% | lutando ' + Math.round((100 * tm.fight) / tt) + '% | andando ' + Math.round((100 * tm.travel) / tt) + '%');
  return { label, minutes, reached20: r20.length, n: bots.length, deaths: totalDeaths, deathsAt, deathsBy, lvlTimes, passes };
}

function progressao() {
  const mins = FAST ? 40 : 90;
  const runs = [];
  console.log('\n=== PROGRESSÃO: robôs do nível 1 ao 20 (' + mins + ' min de jogo por rodada) ===');
  // 1) sozinho, cuidadoso
  runs.push(summarizeProgress(runSolo('solo cuidadoso (aceita perder 30% da vida por luta)', 8, mins, { budget: 0.3, flee: 0.3, rest: 0.9 })));
  // 2) sozinho, ousado
  runs.push(summarizeProgress(runSolo('solo ousado (aceita perder 60% da vida por luta)', 8, mins, { budget: 0.6, flee: 0.2, rest: 0.7 })));
  // 3) sala cheia (20 jogadores), misto
  runs.push(summarizeProgress(runProgress('sala cheia: 20 robôs, perfis variados', 20, mins, (i) => (i % 3 === 0 ? { budget: 0.6, flee: 0.2, rest: 0.7 } : { budget: 0.3, flee: 0.3, rest: 0.9 }))));
  results.progressao = runs;
}

/* =============================== DRAGÃO =============================== */
function dragaoFight(opts) {
  const { n, tier, secs, dodge, armTier, mythic } = opts;
  const bossRoom = H.makeRoom(false); // sala de verdade; deixa só o dragão
  const boss = bossRoom.boss;
  bossRoom.mobs = [boss];
  const bots = [];
  const fams = Object.keys(D.FAMILIES).filter((f) => f !== 'faca');
  for (let i = 0; i < n; i++) {
    const stats = H.rollStats(20);
    const a = ['str', 'dex', 'man'].sort((x, y) => stats[y] - stats[x])[0];
    const mine = fams.filter((f) => D.FAMILIES[f].attr === a);
    // cada um veste a melhor faixa que os atributos permitem (os requisitos valem de verdade)
    const bestT = (idFn, val, max) => { let t = 0; for (let k = 1; k <= max; k++) if (D.ITEMS[idFn(k)].req <= val) t = k; return t; };
    const armKind = i % 2 ? 'blindado' : 'vital';
    const wT = bestT((k) => mine[0] + '_' + k, stats[a], tier) || 1;
    const aT = bestT((k) => armKind + '_' + k, stats.hlt, armTier);
    const w = [mine[(i * 2) % 3], mine[(i * 2 + 1) % 3]].map((f) => f + '_' + wT);
    const armId = aT ? armKind + '_' + aT : 'vital_0';
    const inv = w.concat(aT ? [armId] : []);
    let mth = null;
    if (mythic && stats[a] >= D.ITEMS[mine[0] + '_6'].req) { mth = mine[0] + '_6'; inv.push(mth); w[0] = mth; }
    const p = H.addPlayer(bossRoom, 'p' + i, { level: 20, stats, inv, equip: { w, a: armId }, pos: { x: D.WORLD.cx + 800 + i * 20, y: D.WORLD.cy + (i % 5) * 40 } });
    S.recalc(p); p.hp = p.maxHp;
    p.protectUntil = 0; p.simTeam = 'grupo'; // aliados: não se atacam
    bots.push(new Bot(bossRoom, p, { boss: true, bossTier: 1, dodge, flee: 0.0, budget: 99, kinds: ['cogumelo'], react: 4 }));
  }
  let dealt = 0, deaths = 0;
  bossRoom.onHit = (src, e, dmg) => { if (e === boss) dealt += dmg; };
  const ticks = Math.round(secs * S.TICK);
  let killedAt = null;
  for (let i = 0; i < ticks; i++) {
    for (const b of bots) b.tick();
    S.updateRoom(bossRoom);
    if (!boss.alive && killedAt === null) { killedAt = bossRoom.now; break; }
    if (bots.every((b) => !b.p.alive)) break;
  }
  bots.forEach((b) => b.readLog());
  simSeconds += bossRoom.now;
  deaths = bots.reduce((s, b) => s + b.stats.deaths.length, 0);
  const drops = bots.reduce((s, b) => s + b.stats.loot.filter((l) => D.ITEMS[l.item].tier === 6).length, 0);
  S.rooms.splice(S.rooms.indexOf(bossRoom), 1);
  return { won: killedAt !== null ? 1 : 0, t: killedAt, hpLeft: boss.alive ? boss.hp / boss.maxHp : 0, deaths, drops, dps: dealt / Math.max(1, bossRoom.now) };
}

function dragao() {
  const reps = FAST ? 4 : 12;
  console.log('\n=== DRAGÃO: ' + reps + ' lutas por cenário (limite 300 s) ===');
  const rows = [];
  const scenarios = [
    { name: 'épico (armas f4 + peitoral f4)', tier: 4, armTier: 4 },
    { name: 'lendário (armas f5 + peitoral f5)', tier: 5, armTier: 5 },
    { name: 'lendário + mítica extra', tier: 5, armTier: 5, mythic: true }
  ];
  for (const sc of scenarios) {
    for (const n of [1, 3, 5, 10]) {
      for (const dodge of [0.5, 1]) {
        const rs = [];
        for (let i = 0; i < reps; i++) rs.push(dragaoFight({ n, tier: sc.tier, armTier: sc.armTier, mythic: sc.mythic, secs: 300, dodge }));
        const wins = rs.filter((r) => r.won);
        const row = { cen: sc.name, n, dodge, win: Math.round((100 * wins.length) / reps), tWin: wins.length ? H.avg(wins.map((r) => r.t)) : null, hpLeft: H.avg(rs.map((r) => r.hpLeft)), deaths: H.avg(rs.map((r) => r.deaths)), dps: H.avg(rs.map((r) => r.dps)) };
        rows.push(row);
        console.log(pad(sc.name, 36) + ' ' + n + ' jogador(es), desvia ' + Math.round(dodge * 100) + '% -> vitória ' + rpad(row.win + '%', 5) + ' | tempo p/ vencer ' + rpad(f1(row.tWin), 6) + ' s | vida que sobra do dragão ' + rpad(Math.round(row.hpLeft * 100) + '%', 5) + ' | mortes/luta ' + f1(row.deaths) + ' | dano/s ' + Math.round(row.dps));
      }
    }
  }
  results.dragao = rows;
}

/* =============================== main =============================== */
const t0 = Date.now();
if (cmd === 'armas' || cmd === 'tudo') armas();
if (cmd === 'progressao' || cmd === 'tudo') progressao();
if (cmd === 'dragao' || cmd === 'tudo') dragao();
console.log('\nTempo de jogo simulado: ' + mm(simSeconds) + ' min (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s de relógio)');
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
process.exit(0);
