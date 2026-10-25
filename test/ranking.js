'use strict';
// Testes dos rankings (ranking.js): regras de contagem, ordenação, gravação (arquivo e Postgres de mentira) e integração com o jogo (API e eventos).
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-rank-'));
process.env.DATA_DIR = path.join(TMP, 'jogo');
process.env.PORT = '3978';
const { FileStore, PgStore } = require('../accounts');
const R = require('../ranking');

let oks = 0, fails = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ok(c, msg) { if (c) { oks++; console.log('  ok  ', msg); } else { fails++; console.log('  FALHA', msg); } }
const mkAcc = async (store, n) => (await store.insert({ email: n + '@teste.com', pass: 'x', verified: true, created: Date.now(), save: null, saveAt: 0, code: null })).id;

async function unit(label, makeStore, reopen) {
  console.log('Rankings (' + label + ')');
  const store = await makeStore();
  const [a, b, c, d] = [await mkAcc(store, 'a'), await mkAcc(store, 'b'), await mkAcc(store, 'c'), await mkAcc(store, 'd')];
  let t = 1000000;
  const rk = R.create(store, { now: () => t, cacheMs: 0 });
  await rk.load();
  rk.touch(a, 'Ana'); rk.touch(b, 'Bia'); rk.touch(c, 'Caio'); rk.touch(d, 'Duda');

  let bd = rk.boards(null);
  ok(bd.pvp.length === 0 && bd.dragon.length === 0 && bd.total.crowned === 0, 'sem ninguém no nível 20 nem vitória sobre o dragão, as duas listas começam vazias');

  rk.crowned(a); t += 1000; rk.crowned(b); rk.crowned(a); // chegar ao 20 de novo não muda a data
  bd = rk.boards(null);
  ok(bd.pvp.map((r) => r.name).join() === 'Ana,Bia' && bd.pvp.every((r) => r.kills === 0), 'quem chegou ao nível 20 entra no ranking de PvP com 0 abates, o mais antigo primeiro');

  ok(rk.pvpKill(b, 'a' + a) === true, 'um abate de jogador conta');
  ok(rk.pvpKill(b, 'a' + a) === false, 'matar a mesma vítima de novo logo em seguida não conta');
  ok(rk.pvpKill(b, 'a' + c) === true && rk.pvpKill(b, 'gdudu') === true, 'vítimas diferentes (conta ou visitante) contam');
  t += R.REPEAT_MS - 1; ok(rk.pvpKill(b, 'a' + a) === false, 'ainda dentro dos 5 segundos');
  t += 2; ok(rk.pvpKill(b, 'a' + a) === true, 'passados os 5 segundos conta de novo');
  rk.pvpKill(a, 'a' + b);
  rk.pvpKill(c, 'a' + b); rk.pvpKill(c, 'a' + a); // Caio caça, mas nunca chegou ao nível 20
  bd = rk.boards(null);
  ok(bd.pvp[0].name === 'Bia' && bd.pvp[0].kills === 4 && bd.pvp[1].name === 'Ana' && bd.pvp[1].kills === 1, 'a lista é ordenada por abates (Bia 4, Ana 1)');
  ok(!bd.pvp.some((r) => r.name === 'Caio') && bd.total.crowned === 2, 'quem nunca chegou ao nível 20 não aparece, mesmo com abates');
  let you = rk.boards(c).you;
  ok(you && you.crowned === false && you.kills === 2 && you.posPvp === 0, 'quem ainda não chegou ao 20 vê seus abates, mas sem posição');
  rk.crowned(c);
  you = rk.boards(c).you;
  ok(you.crowned === true && you.posPvp === 2 && rk.boards(c).pvp[1].me === true, 'ao chegar ao 20, os abates de antes já valem (Caio em 2º) e a linha dele vem marcada');

  // dragão: menor tempo de jogo na 1ª vitória
  rk.addPlay(a, 3000); rk.addPlay(b, 1000); rk.addPlay(d, 500);
  rk.dragonKill(a, 150); rk.dragonKill(b, 90);
  rk.addPlay(b, 50000); rk.dragonKill(b, 10); // 2ª vitória, muito tempo depois: o melhor tempo é o da 1ª
  const first = rk.dragonKill(d, 300);
  ok(first && first.play === 500, 'a 1ª vitória devolve o tempo de jogo na hora (a 2ª devolve null)');
  ok(rk.dragonKill(b, 5) === null, 'vitórias seguintes não trocam o tempo registrado');
  bd = rk.boards(null);
  ok(bd.dragon.map((r) => r.name).join() === 'Duda,Bia,Ana', 'o ranking do dragão vai do menor para o maior tempo de jogo (Duda, Bia, Ana)');
  ok(bd.dragon[1].play === 1000 && bd.dragon[1].fight === 90 && bd.dragon[1].wins === 3, 'cada linha traz o tempo de jogo, a duração da luta e o total de vitórias');
  ok(bd.total.dragon === 3 && rk.boards(a).dragon[2].me === true && rk.boards(a).you.posDragon === 3, 'a posição de quem pede aparece');
  ok(rk.dragonKill(999, 1) === null && rk.pvpKill(999, 'x') === false, 'conta que não existe é ignorada');

  const pub = JSON.stringify(rk.boards(a));
  ok(!/@|"acc"|email|teste\.com/.test(pub), 'as listas públicas não vazam e-mail nem número da conta');

  // rankings dos modos PvP e Cooperativo
  ok(rk.modeKill(c, 'a' + d) === true && rk.modeKill(c, 'a' + d) === false && rk.modeKill(c, 'a' + a) === true && rk.modeKill(d, 'a' + c) === true, 'modo PvP: abate de qualquer nível conta, repetir a mesma vítima logo em seguida não');
  bd = rk.boards(c);
  ok(bd.pvpm.map((r) => r.name).join() === 'Caio,Duda' && bd.pvpm[0].kills === 2 && bd.you.pk === 2 && bd.you.posPvpm === 1, 'ranking de abates do PvP ordena por abates');
  ok(rk.coopKill(a, 600) === true && rk.coopKill(a, 700) === false && rk.coopKill(a, 500) === true && rk.coopKill(b, 450) === true, 'coop: só o melhor tempo de luta da conta fica');
  bd = rk.boards(a);
  ok(bd.coop.map((r) => r.name + r.fight).join() === 'Bia450,Ana500' && bd.coop[1].wins === 3 && bd.you.posCoop === 2, 'ranking do coop vai do menor para o maior tempo de luta');

  // semanal: os mesmos eventos contam na semana e no geral; na semana seguinte o placar semanal zera e o geral fica
  bd = rk.boards(c);
  ok(bd.week.pvpm.map((r) => r.name + r.kills).join() === 'Caio2,Duda1' && bd.week.coop.map((r) => r.name + r.fight).join() === 'Bia450,Ana500' && bd.week.endsIn > 0 && bd.you.week.pk === 2, 'semanal: abates e tempos da semana aparecem junto com o geral');
  t += 8 * 86400000;
  bd = rk.boards(c);
  ok(bd.week.pvpm.length === 0 && bd.week.coop.length === 0 && bd.pvpm.length === 2 && bd.coop.length === 2, 'semana nova: o semanal zera, o geral permanece');
  rk.modeKill(c, 'a' + b); rk.coopKill(b, 300);
  bd = rk.boards(c);
  ok(bd.week.pvpm.length === 1 && bd.week.pvpm[0].kills === 1 && bd.pvpm[0].kills === 3 && bd.week.coop[0].fight === 300 && bd.coop[0].fight === 300, 'a nova semana recomeça do zero (1 abate) e o geral soma (3)');

  // gravar e reabrir
  await rk.flush();
  const store2 = await reopen(store);
  const rk2 = R.create(store2, { now: () => t, cacheMs: 0 });
  await rk2.load();
  ok(JSON.stringify(rk2.boards(null)) === JSON.stringify(rk.boards(null)), 'depois de gravar e reabrir o armazenamento, os rankings voltam iguais');
  rk2.addPlay(a, 10);
  ok(rk.rows.get(a).play === 3000, 'cada instância tem a sua cópia em memória (sem efeito colateral)');

  // excluir a conta apaga a linha
  await store2.remove(d); rk2.forget(d);
  const rk3 = R.create(store2, { now: () => t, cacheMs: 0 });
  await rk3.load();
  ok(!rk3.boards(null).dragon.some((r) => r.name === 'Duda') && rk3.boards(null).dragon.length === 2, 'excluir a conta tira a pessoa do ranking, também depois de reabrir');

  // lista cortada em 50
  const big = R.create(store2, { now: () => t, cacheMs: 0 });
  for (let i = 0; i < 60; i++) { big.touch(1000 + i, 'J' + i); big.crowned(1000 + i); big.pvpKill(1000 + i, 'x'); }
  ok(big.boards(null).pvp.length === R.MAX_ROWS && big.boards(null).total.crowned === 60, 'a tela mostra só os ' + R.MAX_ROWS + ' primeiros, o total é completo');
  if (store2.close) await store2.close();
}

/* ------------------------------ jogo: eventos de verdade ------------------------------ */
function client(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port);
  const c = { ws, msgs: [], id: 0 };
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); c.msgs.push(m); if (m.t === 'init') c.id = m.id; });
  c.open = new Promise((r) => ws.on('open', r));
  c.wait = async (t, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { const m = c.msgs.find((x) => x.t === t); if (m) return m; await sleep(30); } return null; };
  return c;
}
async function api(base, method, url, body, token) {
  const r = await fetch(base + url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: method === 'POST' ? JSON.stringify(body || {}) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function game() {
  console.log('Rankings no jogo');
  const S = require('../server');
  const D = require('../game-data');
  await sleep(300);
  const rk = S.getRanking(), base = 'http://127.0.0.1:3978';
  ok(!!rk, 'o servidor liga os rankings junto com as contas');
  let r = await api(base, 'GET', '/api/ranking');
  ok(r.status === 200 && r.body.enabled === true && r.body.persistent === false && r.body.pvp.length === 0 && r.body.dragon.length === 0 && !r.body.you, 'GET /api/ranking responde sem login (listas vazias, sem "you")');

  const tok = {};
  for (const n of ['ana', 'bia']) { r = await api(base, 'POST', '/api/register', { email: n + '@jogo.com', password: 'senha-de-teste-1' }); tok[n] = r.body.token; }
  const join = async (name, token) => { const c = client(3978); await c.open; c.ws.send(JSON.stringify({ t: 'join', name, color: '#44cc66', token })); await c.wait('init'); await sleep(100); return c; };
  const cA = await join('Ana', tok.ana), cB = await join('Bia', tok.bia), cG = await join('Visitante');
  const room = S.rooms.find((x) => x.players.has(cA.id));
  const pl = (c) => room.players.get(c.id);
  const pA = pl(cA), pB = pl(cB), pG = pl(cG);
  ok(room.players.has(cB.id) && room.players.has(cG.id), 'os três entraram na mesma sala');
  const idA = pA.acct.id;
  ok(rk.rows.get(idA) && rk.rows.get(idA).name === 'Ana', 'entrar com conta cria a linha do ranking com o nome usado');
  ok(!pG.acct && rk.rows.size === 2, 'visitante (sem conta) não cria linha');

  // tempo de jogo: soma 1 s por segundo conectado
  const before = rk.rows.get(idA).play;
  await sleep(2300);
  const gained = rk.rows.get(idA).play - before;
  ok(gained >= 1 && gained <= 3, 'o tempo de jogo da conta sobe 1 s por segundo conectado (+' + gained + ' s)');

  // chegar ao nível 20 com a coroa
  const place = (p, x, y) => { p.x = x; p.y = y; p.protectUntil = 0; };
  room.mobs.forEach((m) => { if (!m.boss) { m.alive = false; m.respT = 1e9; } });
  place(pA, 400, 400); place(pB, 4000, 400); place(pG, 400, 4000);
  S.addXp(room, pA, 1e9); S.addXp(room, pB, 1e9);
  ok(pA.level === 20 && pB.level === 20 && rk.rows.get(idA).crowned > 0, 'chegar ao nível 20 com conta registra a coroa no ranking');

  // abates de jogadores (vítima do nível 8+)
  const kill = (src, v, lvl) => { S.spawnPlayer(room, v); v.level = lvl; v.hp = 1; place(v, src.x + 30, src.y); S.recalc(v); v.hp = 1; v.protectUntil = 0; src.protectUntil = 0; return S.hit(room, src, v, 1e6, 'phys'); };
  ok(kill(pA, pB, 8) && !pB.alive && rk.rows.get(idA).pvp === 1, 'matar um jogador nível 8 soma 1 abate para quem tem conta');
  ok(kill(pA, pB, 8) && rk.rows.get(idA).pvp === 1, 'matar a mesma pessoa de novo em seguida não soma');
  ok(kill(pA, pG, 8) && rk.rows.get(idA).pvp === 2, 'matar um visitante conta (vítimas diferentes)');
  ok(kill(pA, pG, 7) && rk.rows.get(idA).pvp === 2, 'vítima abaixo do nível 8 não conta (evita caçar novatos)');
  ok(kill(pG, pA, 20) && rk.rows.get(idA).pvp === 2 && rk.rows.size === 2, 'visitante que mata alguém não ganha linha nem muda o ranking');
  S.spawnPlayer(room, pA); S.addXp(room, pA, 1e9); place(pA, 400, 400);

  // dragão
  rk.addPlay(idA, 600);
  const bs = room.boss;
  const killDragon = (p) => { bs.alive = true; bs.maxHp = bs.baseHp; bs.hp = bs.maxHp; bs.state = 0; bs.cast = null; bs.dmgBy.clear(); bs.threat.clear(); place(p, bs.x + 300, bs.y); return S.hit(room, p, bs, 1e9, 'phys'); };
  ok(killDragon(pA) && !bs.alive, 'o dragão cai com um golpe de teste de quem está no nível 20');
  const rowA = rk.rows.get(idA);
  ok(rowA.wins === 1 && rowA.dragon && rowA.dragon.play >= 600 && rowA.dragon.play < 700 && rowA.dragon.fight >= 0, 'a vitória guarda o tempo de jogo na hora e a duração da luta');
  await sleep(150);
  ok(cA.msgs.some((m) => m.t === 'toast' && /Primeira vitória/.test(m.m)), 'quem vence pela 1ª vez recebe o tempo de jogo na tela');
  const idB = pB.acct.id;
  S.spawnPlayer(room, pB); S.addXp(room, pB, 1e9); // Bia tinha morrido nos testes de PvP: volta ao nível 20
  rk.addPlay(idB, 100);
  killDragon(pB);
  killDragon(pA);
  ok(!cA.msgs.filter((m) => m.t === 'toast' && /Primeira vitória/.test(m.m))[1], 'a 2ª vitória não repete o aviso');

  await sleep(2200); // a lista montada vale 2 s
  r = await api(base, 'GET', '/api/ranking', null, tok.ana);
  const j = r.body;
  if (process.env.DEBUG_RANK) console.log(JSON.stringify(j));
  ok(j.dragon.map((x) => x.name).join() === 'Bia,Ana' && j.dragon[1].wins === 2, 'o ranking do dragão traz Bia (menos tempo) antes de Ana');
  ok(j.pvp.map((x) => x.name).join() === 'Ana,Bia' && j.pvp[0].kills === 2 && j.pvp[1].kills === 0, 'o ranking de PvP traz Ana (2 abates) e Bia (0), as duas no nível 20');
  ok(j.you && j.you.name === 'Ana' && j.you.posPvp === 1 && j.you.posDragon === 2 && j.pvp[0].me === true && j.dragon[1].me === true, 'com o login, a posição e a linha de quem pede vêm marcadas');
  ok(!/@|jogo\.com|"acc"/.test(JSON.stringify(j)), 'a resposta pública não traz e-mail nem número de conta');
  r = await api(base, 'GET', '/api/ranking', null, 'f'.repeat(64));
  ok(r.status === 200 && !r.body.you && r.body.pvp.length === 2, 'login inválido não quebra: só não vem o "you"');

  // gravação: sair grava a linha no armazenamento
  cA.ws.close(); await sleep(400);
  const rows = await S.getAccounts().store.hallAll();
  const saved = rows.find((x) => x.acc === idA);
  ok(saved && saved.pvp === 2 && saved.wins === 2 && saved.crowned > 0 && saved.dragon.play >= 600, 'ao sair, a linha da conta vai para o armazenamento');

  // excluir a conta tira a pessoa dos rankings
  const c2 = await join('Ana', tok.ana);
  r = await api(base, 'POST', '/api/delete', { password: 'senha-de-teste-1' }, tok.ana);
  await sleep(2300); // a lista montada vale 2 s
  const after = (await api(base, 'GET', '/api/ranking')).body;
  if (process.env.DEBUG_RANK) console.log(JSON.stringify(after));
  ok(r.status === 200 && !after.pvp.some((x) => x.name === 'Ana') && !after.dragon.some((x) => x.name === 'Ana') && (await S.getAccounts().store.hallAll()).every((x) => x.acc !== idA), 'excluir a conta apaga a pessoa dos rankings e do armazenamento');
  void c2; void D;
  cB.ws.close(); cG.ws.close();
}

async function main() {
  await unit('arquivo', async () => { const s = new FileStore(path.join(TMP, 'r1')); await s.init(); return s; },
    async (s) => { s.flush(); const n = new FileStore(path.join(TMP, 'r1')); await n.init(); return n; });
  try {
    const { newDb } = require('pg-mem');
    const mem = newDb();
    await unit('postgres', async () => { const { Pool } = mem.adapters.createPg(); const s = new PgStore(new Pool()); await s.init(); return s; }, async (s) => s);
  } catch (e) { console.log('  FALHA suíte do Postgres:', e && e.stack || e); fails++; }
  await game();
  console.log('\n' + oks + ' ok, ' + fails + ' falhas');
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
